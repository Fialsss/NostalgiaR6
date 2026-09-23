import { app, type BrowserWindow } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** App data: settings, caches, and the tools Nostalgia fetches at runtime (DepotDownloader, ThrowbackLoader, Liberator). */
export const HOME = app.getPath('userData')
export const TOOLS = join(HOME, 'tools')

const DEFAULTS = {
  library: join(homedir(), 'Nostalgia'),
  username: '', // in-game name; empty = the Steam name
  steam_user: '',
  liberator: true,
  last_played: '', // the season started last, for Home's "last played"
  last_played_at: 0
}
export type Settings = typeof DEFAULTS

const FILE = join(HOME, 'settings.json')
// ThrowbackLoader's Config.toml takes at most 16 of these
export const NAME = /^[A-Za-z0-9_.-]{1,16}$/

export function settings(): Settings {
  try {
    const stored = JSON.parse(readFileSync(FILE, 'utf8'))
    return { ...DEFAULTS, ...Object.fromEntries(Object.entries(stored).filter(([k]) => k in DEFAULTS)) }
  } catch {
    return { ...DEFAULTS }
  }
}

export function update(changes: Partial<Settings>): Settings {
  const unknown = Object.keys(changes).filter((k) => !(k in DEFAULTS))
  if (unknown.length) throw new Error(`Unknown settings: ${unknown.join(', ')}`)
  if (changes.username && !NAME.test(changes.username)) throw new Error('error.username')
  const merged = { ...settings(), ...changes }
  mkdirSync(HOME, { recursive: true })
  writeFileSync(FILE, JSON.stringify(merged, null, 2))
  return merged
}

let window: BrowserWindow | undefined
export const attach = (target: BrowserWindow) => (window = target)

/** Tell the window something happened: downloads, sign-in steps, the game starting and stopping. */
export function emit(event: string, data?: unknown): void {
  if (window && !window.isDestroyed()) window.webContents.send('event', { event, data })
}

export type Methods = Record<string, (params: any) => unknown>

export const methods: Methods = {
  'settings.get': () => settings(),
  'settings.set': (changes: Partial<Settings>) => update(changes)
}
