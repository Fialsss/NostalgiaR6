import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { join } from 'node:path'
import * as controls from './controls'
import * as core from './core'
import * as games from './games'
import * as liberator from './liberator'
import * as steam from './steam'

const METHODS: core.Methods = { ...core.methods, ...steam.methods, ...games.methods, ...liberator.methods, ...controls.methods }

let window: BrowserWindow | undefined
let closing = false
let minimizing = false

const send = (channel: string, value: unknown) => {
  if (window && !window.isDestroyed()) window.webContents.send(channel, value)
}

/** Fade the real window (not just the page), so closing and minimising feel like the app's own. */
function fade(to: number, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const target = window
    if (!target || target.isDestroyed()) return resolve()
    const from = target.getOpacity()
    const start = Date.now()
    const timer = setInterval(() => {
      if (target.isDestroyed()) {
        clearInterval(timer)
        return resolve()
      }
      const k = Math.min(1, (Date.now() - start) / ms)
      target.setOpacity(from + (to - from) * (1 - (1 - k) ** 3))
      if (k === 1) {
        clearInterval(timer)
        resolve()
      }
    }, 16)
  })
}

function createWindow(): void {
  window = new BrowserWindow({
    width: 1160,
    height: 720,
    minWidth: 1040,
    minHeight: 660,
    frame: false,
    show: false,
    backgroundColor: '#0b0b0d',
    title: 'Nostalgia',
    icon: join(app.getAppPath(), 'resources', 'icon.png'),
    webPreferences: { preload: join(__dirname, '../preload/index.js') }
  })
  const win = window
  core.attach(win)
  win.once('ready-to-show', () => {
    win.setOpacity(0)
    win.show()
    fade(1, 280)
  })
  win.on('closed', () => (window = undefined))

  // Alt+F4, the taskbar and our own button all come through here: play the exit first.
  win.on('close', (event) => {
    if (closing) return
    event.preventDefault()
    closing = true
    send('window:state', 'closing')
    fade(0, 200).then(() => win.destroy())
  })
  win.on('maximize', () => send('window:state', 'maximize'))
  win.on('unmaximize', () => send('window:state', 'unmaximize'))
  win.on('restore', () => {
    send('window:state', 'restore')
    fade(1, 240)
  })
  // Safety net: a window that is shown and not on its way out must never stay transparent.
  const reveal = () => {
    if (!closing && !minimizing && !win.isMinimized() && win.getOpacity() < 1) fade(1, 160)
  }
  win.on('focus', reveal)
  win.on('show', reveal)

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  // NOSTALGIA_PAGE opens a page directly, for screenshots and development
  const page = process.env.NOSTALGIA_PAGE ?? ''
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#${page}`)
  else win.loadFile(join(__dirname, '../renderer/index.html'), { hash: page })
}

// Errors cross IPC as data: a rejected handle() prefixes the message with IPC noise.
ipcMain.handle('call', async (_event, method: string, params?: Record<string, unknown>) => {
  try {
    const run = METHODS[method]
    if (!run) throw new Error(`Unknown method ${method}`)
    return { result: await run(params ?? {}) }
  } catch (error) {
    return { error: (error as Error).message }
  }
})

ipcMain.handle('dialog:pick', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(window!, { properties: ['openDirectory', 'createDirectory'] })
  return canceled ? null : filePaths[0]
})

ipcMain.handle('shell:open', (_event, path: string) => shell.openPath(path))

ipcMain.on('window', async (_event, action: 'minimize' | 'maximize' | 'close') => {
  if (!window) return
  if (action === 'close') window.close()
  else if (action === 'maximize') window.isMaximized() ? window.unmaximize() : window.maximize()
  else {
    // fade out, then minimise invisibly; 'restore' fades back in
    minimizing = true
    send('window:state', 'minimizing')
    await fade(0, 160)
    window?.minimize()
    minimizing = false
  }
})

// One window: two copies would run two downloads into the same folders.
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', () => {
    if (window?.isMinimized()) window.restore()
    window?.focus()
  })
  app.whenReady().then(() => {
    createWindow()
    steam.ensureTool(false).catch(() => undefined) // ready before the first sign-in; offline, that sign-in retries
    liberator.prefetch()
  })
}
app.on('window-all-closed', () => app.quit())
// the game keeps running; a download or Liberator doesn't outlive the window
app.on('before-quit', () => {
  steam.cancel()
  liberator.stop()
})
