/**
 * The library: every season Steam still serves, downloaded whole, made playable offline with
 * ThrowbackLoader, and launched from here. Season folders follow Operation Throwback's names
 * (Y5S3_ShadowLegacy), so an existing Throwback library works as it is.
 */
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statfsSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { emit, HOME, NAME, settings, TOOLS, update, type Methods } from './core'
import * as controls from './controls'
import * as liberator from './liberator'
import { asset, download, unpack } from './net'
import SEASONS from './seasons.json'
import { cancel, CONTENT_DEPOT, exclusive, run, tool } from './steam'

export type Season = (typeof SEASONS)[number] & { hm?: string; table?: string }

// Worldwide binaries, the Russian localisation (not every account gets it), then the content
const DEPOTS = [
  { name: 'ww', id: 377237, optional: false },
  { name: 'rus', id: 377238, optional: true },
  { name: 'content', id: CONTENT_DEPOT, optional: false }
] as const

const LOADER = join(TOOLS, 'ThrowbackLoader')
const LOADER_DLLS = ['defaultargs.dll', 'steam_api64.dll', 'uplay_r1_loader64.dll', 'upc_r1_loader64.dll', 'upc_r2_loader64.dll', 'uplay_r2_loader64.dll']
const LAUNCHER = 'LaunchR6.exe'
const CONFIG = 'Config.toml'
const HM = 'HeatedMetal'
const HM_NOTICES = 'ThirdPartyLegalNotices.txt'
const TABLES = 'https://raw.githubusercontent.com/xeralin/ThrowbackFAQ/main/public/ct/'

const find = (key: string): Season => {
  const season = SEASONS.find((s) => s.key === key)
  if (!season) throw new Error(`Unknown season ${key}`)
  return season
}
const folder = (s: Season) => join(settings().library, s.key)
const tableFile = (s: Season) => join(folder(s), `${s.key}.ct`)

/** Free space where the library lives (the nearest folder that exists). */
function freeSpace(path: string): number {
  for (let at = resolve(path); ; at = dirname(at)) {
    try {
      const stats = statfsSync(at)
      return stats.bavail * stats.bsize
    } catch {
      if (dirname(at) === at) return 0
    }
  }
}

/** A season folder with game files in it: an empty one, or one holding just a Cheat Engine table, isn't an install. */
function started(dir: string): boolean {
  try {
    return readdirSync(dir).some((name) => !name.endsWith('.ct'))
  } catch {
    return false
  }
}

let job: { key: string } | null = null
let running: { key: string; child: ChildProcess } | null = null

function list() {
  const seasons = SEASONS.map((s: Season) => {
    const dir = folder(s)
    const installed = existsSync(join(dir, LAUNCHER))
    return {
      ...s,
      dir,
      installed,
      partial: !installed && started(dir),
      hmInstalled: existsSync(join(dir, HM)),
      tableInstalled: !!s.table && existsSync(tableFile(s)),
      running: running?.key === s.key,
      downloading: job?.key === s.key
    }
  })
  const { library, last_played, last_played_at } = settings()
  return { root: library, free: freeSpace(library), last: { key: last_played, at: last_played_at }, seasons }
}

// ------------------------------------------------------------ ThrowbackLoader

/** The loader that stands in for Ubisoft Connect in old builds, fetched once from its releases. */
async function ensureLoader(): Promise<string> {
  if ([...LOADER_DLLS, CONFIG, LAUNCHER].every((f) => existsSync(join(LOADER, f)))) return LOADER
  const { url } = await asset('xeralin/ThrowbackLoader', (n) => n.endsWith('.zip'))
  const zip = `${LOADER}.zip`
  const part = `${LOADER}.part`
  await download(url, zip)
  rmSync(part, { recursive: true, force: true })
  await unpack(zip, part)
  rmSync(LOADER, { recursive: true, force: true })
  renameSync(part, LOADER)
  rmSync(zip, { force: true })
  return LOADER
}

/** The in-game name: the one chosen in Settings, otherwise the Steam name made safe for the loader. */
function playerName(): string {
  const chosen = settings().username
  if (chosen) return chosen
  try {
    const steam = JSON.parse(readFileSync(join(HOME, 'steam.json'), 'utf8')).name as string
    const safe = steam.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 16)
    if (NAME.test(safe)) return safe
  } catch {
    // not signed in yet
  }
  return 'Operator'
}

function writeName(dir: string): void {
  const config = join(dir, CONFIG)
  const text = readFileSync(config, 'utf8')
  writeFileSync(config, text.replace(/^username\s*=.*$/m, `username = '${playerName()}' # Max 16 characters`))
}

async function applyLoader(dir: string): Promise<void> {
  const loader = await ensureLoader()
  const hm = existsSync(join(dir, HM)) // Heated Metal brings its own DefaultArgs.dll
  for (const dll of LOADER_DLLS) if (!(hm && dll === 'defaultargs.dll')) copyFileSync(join(loader, dll), join(dir, dll))
  if (!existsSync(join(dir, CONFIG))) copyFileSync(join(loader, CONFIG), join(dir, CONFIG))
  writeName(dir)
  copyFileSync(join(loader, LAUNCHER), join(dir, LAUNCHER))
}

// ------------------------------------------------------------ download

/** Download (or finish, or repair: -validate checks what's there) a whole season, then make it playable. */
async function install({ key }: { key: string }) {
  const s = find(key)
  if (running?.key === key) throw new Error('error.running')
  const dir = folder(s)
  // a new season must fit, with a gigabyte to spare: a full system drive is worse than no download
  if (!started(dir) && freeSpace(dir) < (s.size + 1) * 1024 ** 3) throw new Error('error.space')
  return exclusive(async () => {
    job = { key }
    let outcome: 'ok' | 'cancelled' | 'failed' = 'failed'
    emit('games.started', { key })
    try {
      for (const [step, depot] of DEPOTS.entries()) {
        const progress = (percent: number, file: string) => emit('games.progress', { key, step, steps: DEPOTS.length, percent, file })
        progress(0, '')
        try {
          await run(['-depot', String(depot.id), '-manifest', s.manifests[depot.name], '-dir', dir, '-validate', '-max-downloads', '25'], { progress })
        } catch (error) {
          if (!depot.optional || (error as Error).message === 'Cancelled') throw error
        }
      }
      emit('games.progress', { key, step: DEPOTS.length, steps: DEPOTS.length, percent: 100, file: 'ThrowbackLoader' })
      await applyLoader(dir)
      outcome = 'ok'
    } catch (error) {
      if ((error as Error).message === 'Cancelled') outcome = 'cancelled'
      throw error
    } finally {
      job = null
      emit('games.ended', { key, ok: outcome === 'ok', cancelled: outcome === 'cancelled' })
    }
    return list()
  })
}

/** Delete a season's folder, never anything outside the library. */
async function remove({ key }: { key: string }) {
  const s = find(key)
  if (running?.key === key) throw new Error('error.running')
  if (job?.key === key) throw new Error('error.busy')
  const root = resolve(settings().library)
  const dir = resolve(folder(s))
  if (!dir.startsWith(root + sep)) throw new Error('Refusing to delete outside the library folder')
  await rm(dir, { recursive: true, force: true })
  return list()
}

// ------------------------------------------------------------ play

async function launch({ key }: { key: string }) {
  if (running) throw new Error(running.key === key ? 'error.running' : 'error.otherRunning')
  if (job?.key === key) throw new Error('error.busy')
  const s = find(key)
  const dir = folder(s)
  if (!existsSync(join(dir, LAUNCHER))) throw new Error('error.notInstalled')
  writeName(dir)
  controls.onLaunch(key)
  // LaunchR6 starts the game with the loader's arguments and waits for it, so its life is the game's.
  // Heated Metal starts from the game's own exe, with its own DefaultArgs.dll.
  const exe = join(dir, existsSync(join(dir, HM)) ? 'RainbowSix.exe' : LAUNCHER)
  const child = spawn(exe, [], { cwd: dir, detached: true, stdio: 'ignore' })
  await new Promise((done, fail) => {
    child.once('spawn', done)
    child.once('error', fail)
  })
  child.unref()
  running = { key, child }
  child.once('exit', () => {
    if (running?.child !== child) return
    running = null
    liberator.stop()
    controls.onLaunch(key) // the first run is what creates the season's settings file
    emit('games.running', null)
  })
  update({ last_played: key, last_played_at: Date.now() })
  emit('games.running', { key })
  if (s.liberator) liberator.start()
  return true
}

async function stop() {
  if (!running) return false
  // /T takes the game down with the launcher that started it
  await promisify(execFile)('taskkill', ['/PID', String(running.child.pid), '/T', '/F'], { windowsHide: true }).catch(() => undefined)
  return true
}

// ------------------------------------------------------------ mods

function requireInstalled(s: Season): string {
  const dir = folder(s)
  if (!existsSync(join(dir, LAUNCHER))) throw new Error('error.notInstalled')
  if (running?.key === s.key) throw new Error('error.running')
  if (job?.key === s.key) throw new Error('error.busy')
  return dir
}

/** HeatedMetal.dll comes in AVX and SSE builds: pick the one this processor runs, like Throwback's launcher. */
async function cpuVariant(): Promise<string> {
  const script = `$k = Add-Type -Name K -Namespace N -PassThru -MemberDefinition '[DllImport("kernel32.dll")] public static extern bool IsProcessorFeaturePresent(uint f);'
if ($k::IsProcessorFeaturePresent(39)) { 'AVX' } elseif ($k::IsProcessorFeaturePresent(38)) { 'SSE' }`
  try {
    const { stdout } = await promisify(execFile)('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true })
    return stdout.trim()
  } catch {
    return ''
  }
}

/** Heated Metal (DataCluster0): an SDK for Year 5 builds. Installed into the season's own folder. */
async function installHm({ key }: { key: string }) {
  const s = find(key)
  if (!s.hm) throw new Error('Heated Metal does not support this season')
  const dir = requireInstalled(s)
  const { tag, url } = await asset('DataCluster0/HeatedMetal', (n) => n.endsWith('.7z'), s.hm === 'latest' ? '' : s.hm)
  const archive = join(TOOLS, HM, `${tag}.7z`)
  if (!existsSync(archive)) await download(url, archive, (done, total) => emit('mods.progress', { key, done, total }))
  const tmp = join(TOOLS, HM, 'unpacked')
  rmSync(tmp, { recursive: true, force: true })
  try {
    await unpack(archive, tmp)
    const candidates = [tmp, ...readdirSync(tmp, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => join(tmp, d.name))]
    const root = candidates.find((d) => existsSync(join(d, 'DefaultArgs.dll')) && existsSync(join(d, HM)))
    if (!root) throw new Error('The Heated Metal download has an unexpected layout')
    rmSync(join(dir, HM), { recursive: true, force: true })
    copyFileSync(join(root, 'DefaultArgs.dll'), join(dir, 'defaultargs.dll')) // replaces the loader's (same name on Windows)
    cpSync(join(root, HM), join(dir, HM), { recursive: true })
    const variant = await cpuVariant()
    const build = join(dir, HM, `HeatedMetal${variant}.dll`)
    if (variant && existsSync(build)) copyFileSync(build, join(dir, HM, 'HeatedMetal.dll'))
    if (existsSync(join(root, HM_NOTICES))) copyFileSync(join(root, HM_NOTICES), join(dir, HM_NOTICES))
    writeFileSync(join(dir, HM, '.version'), tag)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
  return list()
}

async function removeHm({ key }: { key: string }) {
  const dir = requireInstalled(find(key))
  rmSync(join(dir, HM), { recursive: true, force: true })
  rmSync(join(dir, HM_NOTICES), { force: true })
  copyFileSync(join(await ensureLoader(), 'defaultargs.dll'), join(dir, 'defaultargs.dll'))
  return list()
}

/** A Cheat Engine table from the Throwback FAQ, saved next to the game so it's there when you need it. */
async function getTable({ key }: { key: string }) {
  const s = find(key)
  if (!s.table) throw new Error('No table for this season')
  mkdirSync(folder(s), { recursive: true })
  await download(TABLES + s.table, tableFile(s))
  return tableFile(s)
}

/** What's been fetched so far: every tool downloads itself when first needed anyway. */
function tools() {
  return { depot: tool().ok, loader: existsSync(join(LOADER, LAUNCHER)), liberator: liberator.available() }
}

export const methods: Methods = {
  'games.list': list,
  'games.tools': tools,
  'games.install': install,
  'games.cancel': cancel,
  'games.remove': remove,
  'games.launch': launch,
  'games.stop': stop,
  'games.running': () => running?.key ?? null,
  'mods.hm.install': installHm,
  'mods.hm.remove': removeHm,
  'mods.table': getTable
}
