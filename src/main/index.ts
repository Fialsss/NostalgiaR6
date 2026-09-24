import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray } from 'electron'
import { join } from 'node:path'
import * as art from './art'
import * as controls from './controls'
import * as core from './core'
import * as games from './games'
import * as liberator from './liberator'
import * as steam from './steam'

const METHODS: core.Methods = { ...core.methods, ...steam.methods, ...games.methods, ...liberator.methods, ...controls.methods, ...art.methods }

art.register()

let window: BrowserWindow | undefined
let tray: Tray | undefined
let closing = false
let quitting = false // only a real quit (tray menu) closes the window; the X hides it to the tray
let hinted = false

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

  // Alt+F4, the taskbar and our own button all come through here: play the exit, then step into the tray.
  // Downloads go on meanwhile; Quit in the tray menu is what really closes.
  win.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    if (closing) return
    closing = true
    send('window:state', 'closing')
    fade(0, 200).then(() => {
      win.hide()
      closing = false
      if (!hinted) tray?.displayBalloon({ title: 'Nostalgia', content: 'Still running here: downloads go on. Right-click the icon to quit.' })
      hinted = true
    })
  })
  win.on('maximize', () => send('window:state', 'maximize'))
  win.on('unmaximize', () => send('window:state', 'unmaximize'))
  // Minimise and restore are Windows' own animations: fading on top of them made them stutter.
  // Safety net: a window that is shown and not on its way out must never stay transparent.
  const opaque = () => {
    if (!closing && !win.isMinimized() && win.getOpacity() < 1) fade(1, 160)
  }
  win.on('restore', opaque)
  win.on('focus', opaque)
  win.on('show', opaque)

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  // NOSTALGIA_PAGE opens a page directly, for screenshots and development
  const page = process.env.NOSTALGIA_PAGE ?? ''
  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#${page}`)
  else win.loadFile(join(__dirname, '../renderer/index.html'), { hash: page })
}

/** Back from the tray (or from a second launch of the app). */
function reveal(): void {
  const win = window
  if (!win || win.isDestroyed()) return createWindow()
  if (win.isMinimized()) win.restore()
  if (!win.isVisible()) {
    win.setOpacity(0)
    win.show()
    send('window:state', 'restore') // the page settles back in, as after a minimise
  }
  win.focus()
  fade(1, 240)
}

function trayMenu(): Menu {
  const last = games.lastPlayable()
  return Menu.buildFromTemplate([
    { label: 'Open Nostalgia', click: reveal },
    ...(last ? [{ label: `Play ${last.id} ${last.name}`, click: () => void Promise.resolve(METHODS['games.launch']({ key: last.key })).catch(reveal) }] : []),
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() }
  ])
}

function makeTray(): void {
  const icon = nativeImage.createFromPath(join(app.getAppPath(), 'resources', 'icon.png')).resize({ width: 32, height: 32 })
  tray = new Tray(icon)
  tray.setToolTip('Nostalgia')
  tray.on('click', reveal)
  tray.on('right-click', () => tray?.popUpContextMenu(trayMenu()))
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
  else window.minimize()
})

// One window: two copies would run two downloads into the same folders.
if (!app.requestSingleInstanceLock()) app.quit()
else {
  app.on('second-instance', reveal)
  app.whenReady().then(() => {
    art.serve()
    makeTray()
    createWindow()
    steam.ensureTool(false).catch(() => undefined) // ready before the first sign-in; offline, that sign-in retries
    liberator.prefetch()
  })
}
app.on('window-all-closed', () => app.quit())
// the game keeps running; a download or Liberator doesn't outlive the window
app.on('before-quit', () => {
  quitting = true
  steam.cancel()
  liberator.stop()
})
