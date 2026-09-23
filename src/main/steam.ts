/**
 * Steam, through DepotDownloader: sign-in (QR or password with Steam Guard), the profile in the
 * account menu, and every download. Steam serves every build it ever shipped to accounts that own
 * the game; DepotDownloader asks for them by manifest ID.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, globSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import { emit, HOME, settings, TOOLS, update, type Methods } from './core'
import { download, unpack } from './net'
import SEASONS from './seasons.json'

export const APP = 359550
export const CONTENT_DEPOT = 359551
const TOOL = join(TOOLS, 'DepotDownloader', 'DepotDownloader.exe')
const TOOL_URL = 'https://github.com/SteamRE/DepotDownloader/releases/latest/download/DepotDownloader-windows-x64.zip'

const PROGRESS = /^\s*(\d{1,3}(?:\.\d+)?)%\s+(.+)$/
const REMEMBER = /-username (\S+) -remember-password/
const LICENSES = /Got \d+ licenses for account/ // signed in: the rest of the run is the actual job
const AUTH_TROUBLE = /password|logon|login|access ?denied|expired|two-factor|auth code/i
const QR_DARK = /[█▀▄]/

// ------------------------------------------------------------- the tool

let fetching: Promise<string> | null = null

export function tool(): { ok: boolean; path: string } {
  return { ok: existsSync(TOOL), path: TOOL }
}

/** DepotDownloader (about 30 MB), fetched once. Its folder never moves: Steam's saved login is tied to it. */
export function ensureTool(announce = true): Promise<string> {
  if (existsSync(TOOL)) return Promise.resolve(TOOL)
  if (announce) emit('steam.status', { key: 'tool' })
  fetching ??= (async () => {
    const zip = join(TOOLS, 'DepotDownloader.zip')
    const part = join(TOOLS, 'DepotDownloader.part')
    await download(TOOL_URL, zip)
    rmSync(part, { recursive: true, force: true })
    await unpack(zip, part)
    rmSync(dirname(TOOL), { recursive: true, force: true })
    renameSync(part, dirname(TOOL))
    rmSync(zip, { force: true })
    if (!existsSync(TOOL)) throw new Error('DepotDownloader.exe is missing from the downloaded release')
    return TOOL
  })().finally(() => (fetching = null))
  return fetching
}

// --------------------------------------------------------------- one job

let busy = false

/** One Steam job at a time: two DepotDownloaders would fight over the login and the files. */
export async function exclusive<T>(work: () => Promise<T>): Promise<T> {
  if (busy) throw new Error('error.busy')
  busy = true
  try {
    return await work()
  } finally {
    busy = false
  }
}

let active: ChildProcess | null = null
let cancelled = false
let waitingCode: ((code: string | null) => void) | null = null

export function cancel(): boolean {
  if (!active || active.exitCode !== null) return false
  cancelled = true
  active.kill()
  waitingCode?.(null)
  return true
}

// .NET writes UTF-8 or the OEM code page depending on the console; the QR blocks exist in both
const utf8 = new TextDecoder('utf-8', { fatal: true })
const OEM_BLOCKS: Record<string, string> = { '\xdb': '█', '\xdf': '▀', '\xdc': '▄' }
function decode(raw: Buffer): string {
  try {
    return utf8.decode(raw)
  } catch {
    return raw.toString('latin1').replace(/[\xdb\xdf\xdc]/g, (c) => OEM_BLOCKS[c])
  }
}

/** DepotDownloader's text QR as rows of '0'/'1' modules. */
export function qrMatrix(lines: string[]): string[] {
  let rows = lines.map((l) => l.trimEnd()).filter((l) => QR_DARK.test(l))
  if (!rows.length) return []
  const left = Math.min(...rows.map((r) => r.length - r.trimStart().length))
  rows = rows.map((r) => r.slice(left))
  const width = Math.max(...rows.map((r) => r.length))
  if (rows.some((r) => /[▀▄]/.test(r))) {
    // half blocks: one character per module, two module rows per line
    const matrix = rows.flatMap((r) => {
      const row = [...r.padEnd(width)]
      return [row.map((c) => (c === '█' || c === '▀' ? '1' : '0')).join(''), row.map((c) => (c === '█' || c === '▄' ? '1' : '0')).join('')]
    })
    while (matrix.length && !matrix.at(-1)!.includes('1')) matrix.pop()
    return matrix
  }
  // full blocks: two characters per module, one module row per line
  const even = width + (width % 2)
  return rows.map((r) => {
    const row = r.padEnd(even)
    let out = ''
    for (let i = 0; i < even; i += 2) out += row[i] === '█' ? '1' : '0'
    return out
  })
}

/** Which question DepotDownloader is asking, if the unfinished line is one (they end without a newline). */
export function promptKind(text: string): 'password' | 'code_app' | 'code_email' | null {
  const lower = text.toLowerCase()
  if (lower.includes('enter account password')) return 'password'
  if (lower.includes('auth code from your authenticator app')) return 'code_app'
  if (lower.includes('code sent to the email') || lower.includes('code sent to your email')) return 'code_email'
  return null
}

type Login = { username: string; password: string }
type RunOptions = { login?: Login; progress?: (percent: number, file: string) => void }

/**
 * Run DepotDownloader for this app, answering its questions and streaming QR, progress and log
 * lines to the window. The password only ever goes to the tool's standard input: never to its
 * command line (other programs can read those), never to disk.
 */
export async function run(args: string[], options: RunOptions = {}): Promise<string[]> {
  const { login, progress } = options
  const user = login?.username ?? settings().steam_user
  const auth = user ? ['-username', user, '-remember-password'] : ['-qr', '-remember-password']
  const exe = await ensureTool()
  cancelled = false
  const before = savedLogins()
  const child = spawn(exe, ['-app', String(APP), ...auth, ...args], { cwd: dirname(exe), windowsHide: true })
  active = child

  const log: string[] = []
  let qr: string[] | null = null
  let askedPassword = false
  let wrongCode = false
  let staleLogin = false
  let remembered = ''
  let announced = false

  const signedIn = () => {
    // a new sign-in (QR or password), not a remembered one: tell the window now, while the job goes on
    announced = true
    const changed = ours(before)
    const names = changed.length ? accountsInConfig(readFileSync(changed[0])) : []
    const name = login?.username ?? (remembered || (names.length === 1 ? names[0] : ''))
    if (name) {
      update({ steam_user: name })
      emit('steam.signed_in', { user: name })
    }
  }
  const answer = (text: string) => child.stdin?.write(text + '\n')

  const onLine = (line: string) => {
    log.push(line)
    if (qr) {
      if (QR_DARK.test(line)) return void qr.push(line)
      if (qr.length) {
        // the first quiet line after the code closes it
        emit('steam.qr', { matrix: qrMatrix(qr) })
        qr = null
      }
      return
    }
    if (line.includes('QR code')) {
      qr = []
      return emit('steam.status', { key: 'scan' })
    }
    const done = PROGRESS.exec(line)
    if (done) return progress?.(Number(done[1]), basename(done[2].trim()))
    if (line.includes('confirm your sign in')) emit('steam.status', { key: 'confirm' })
    if (line.includes('code you have provided is incorrect')) wrongCode = true
    remembered = REMEMBER.exec(line)?.[1] ?? remembered
    if (LICENSES.test(line) && !announced && (login || !user)) signedIn()
    if (line.trim()) emit('steam.log', line.trim())
  }

  const onPrompt = (kind: string, text: string) => {
    log.push(text)
    if (kind === 'password') {
      if (!login || askedPassword) {
        // a remembered login went stale, or the password was refused: stop here
        staleLogin = !login
        child.kill()
        return
      }
      askedPassword = true
      return void answer(login.password)
    }
    emit('steam.code', { kind: kind === 'code_app' ? 'app' : 'email', retry: wrongCode })
    wrongCode = false
    new Promise<string | null>((resolve) => (waitingCode = resolve)).then((code) => {
      waitingCode = null
      if (code === null) child.kill()
      else answer(code)
    })
  }

  const read = (stream: NodeJS.ReadableStream) => {
    let pending = Buffer.alloc(0)
    stream.on('data', (chunk: Buffer) => {
      pending = Buffer.concat([pending, chunk])
      for (let nl = pending.indexOf(10); nl >= 0; nl = pending.indexOf(10)) {
        onLine(decode(pending.subarray(0, nl)).replace(/\r$/, ''))
        pending = pending.subarray(nl + 1)
      }
      const kind = promptKind(decode(pending))
      if (kind) {
        onPrompt(kind, decode(pending))
        pending = Buffer.alloc(0)
      }
    })
    stream.on('end', () => pending.length && onLine(decode(pending).trimEnd()))
  }
  read(child.stdout!)
  read(child.stderr!)

  emit('steam.status', { key: 'connecting' })
  const code = await new Promise<number | null>((resolve, reject) => {
    child.on('error', reject)
    child.on('close', resolve)
  }).finally(() => {
    active = null
    waitingCode?.(null)
  })
  ours(before)
  if (cancelled) throw new Error('Cancelled')
  const text = log.join('\n')
  if (code !== 0 || staleLogin) {
    if (text.includes('is not available from this account')) throw new Error('error.notOwned')
    if (login && text.includes('RateLimit')) throw new Error('error.rateLimit')
    if (login && askedPassword && /InvalidPassword|Failed to authenticate/.test(text)) throw new Error('error.wrongPassword')
    if (user && !login && (staleLogin || AUTH_TROUBLE.test(text))) {
      // the remembered login went stale: forget it and sign in again by QR
      update({ steam_user: '' })
      emit('steam.status', { key: 'relogin' })
      return run(args, options)
    }
    const last = [...log].reverse().find((l) => l.trim())?.trim() ?? `exit code ${code}`
    throw new Error(`DepotDownloader: ${last}`)
  }
  if (!announced && (login || !user)) signedIn()
  return log
}

// ------------------------------------------------------ the saved login

// DepotDownloader keeps its Steam login in .NET IsolatedStorage, one Url.<hash> folder per exe location
const ISOLATED = join(process.env.LOCALAPPDATA ?? '', 'IsolatedStorage')
const STORE_NOTE = join(HOME, 'steam-store.txt')
const PROFILE = join(HOME, 'steam.json')

function savedLogins(): Map<string, number> {
  const found = new Map<string, number>()
  for (const file of globSync('*/*/Url.*/AssemFiles/account.config', { cwd: ISOLATED })) {
    try {
      found.set(join(ISOLATED, file), statSync(join(ISOLATED, file)).mtimeMs)
    } catch {
      // removed in between
    }
  }
  return found
}

/** Whichever login file this run wrote is ours: remember its folder for the profile and for signing out. */
function ours(before: Map<string, number>): string[] {
  const changed = [...savedLogins()].filter(([file, time]) => before.get(file) !== time).map(([file]) => file)
  if (changed.length) writeFileSync(STORE_NOTE, basename(dirname(dirname(changed[0]))))
  return changed
}

function storageDirs(): string[] {
  try {
    const name = readFileSync(STORE_NOTE, 'utf8').trim()
    return name.startsWith('Url.') ? globSync(`*/*/${name}`, { cwd: ISOLATED }).map((d) => join(ISOLATED, d)) : []
  } catch {
    return []
  }
}

function inflate(raw: Buffer): string {
  try {
    return inflateRawSync(raw).toString('latin1') // DepotDownloader writes a raw DeflateStream
  } catch {
    return ''
  }
}

/** Account names with a saved login token (protobuf map keys followed by a JWT). */
export function accountsInConfig(raw: Buffer): string[] {
  const names: string[] = []
  for (const m of inflate(raw).matchAll(/\x0a([\x02-\x40])([\w.-]+)\x12[\s\S]{2}ey/g)) {
    if (m[1].charCodeAt(0) === m[2].length) names.push(m[2])
  }
  return [...new Set(names)]
}

/** SteamID64 from the `sub` claim of the token saved for `user`. Only that claim is read; the token never leaves. */
export function steamidFromConfig(raw: Buffer, user: string): string | null {
  const data = inflate(raw)
  const at = data.indexOf(user)
  const jwt = at >= 0 ? /ey[\w-]+\.([\w-]+)\.[\w-]+/.exec(data.slice(at)) : null
  if (!jwt) return null
  try {
    const sub = String(JSON.parse(Buffer.from(jwt[1], 'base64url').toString()).sub ?? '')
    return /^\d{17}$/.test(sub) ? sub : null
  } catch {
    return null
  }
}

function steamid(user: string): string | null {
  // our login file first; without a note, every saved login, newest first
  const mine = storageDirs().map((d) => join(d, 'AssemFiles', 'account.config')).filter((f) => existsSync(f))
  const configs = mine.length ? mine : [...savedLogins()].sort((a, b) => b[1] - a[1]).map(([f]) => f)
  for (const config of configs) {
    const sid = steamidFromConfig(readFileSync(config), user)
    if (sid) return sid
  }
  return null
}

const tag = (xml: string, name: string) => new RegExp(`<${name}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${name}>`).exec(xml)?.[1].trim() ?? ''

/** Display name and avatar from the public community profile (the avatar as a data URI: no remote images in the window). */
async function fetchProfile(sid: string) {
  const xml = await (await fetch(`https://steamcommunity.com/profiles/${sid}/?xml=1`)).text()
  const url = tag(xml, 'avatarFull')
  const avatar = url.startsWith('https://') ? `data:image/jpeg;base64,${Buffer.from(await (await fetch(url)).arrayBuffer()).toString('base64')}` : ''
  return { steamid: sid, name: tag(xml, 'steamID'), avatar }
}

export type Profile = { user: string; steamid: string; name: string; avatar: string }

export async function profile({ refresh = false } = {}): Promise<Profile | null> {
  const user = settings().steam_user
  if (!user) return null
  if (!refresh) {
    try {
      const cached = JSON.parse(readFileSync(PROFILE, 'utf8'))
      if (cached.user === user) return cached
    } catch {
      // no cache yet
    }
  }
  const result: Profile = { user, steamid: '', name: user, avatar: '' }
  const sid = steamid(user)
  if (sid) {
    try {
      Object.assign(result, await fetchProfile(sid))
      if (!result.name) result.name = user
      writeFileSync(PROFILE, JSON.stringify(result))
    } catch {
      result.steamid = sid // offline: keep the login name, try again next time
    }
  }
  return result
}

/**
 * Sign in by asking Steam for the newest season's file list: it proves the account owns the game.
 * Without credentials it's the QR flow; with them, name and password, then Steam Guard if asked.
 */
async function login({ username = '', password = '' }): Promise<Profile | null> {
  let credentials: Login | undefined
  if (username.trim()) {
    if (!password) throw new Error('error.missingPassword')
    credentials = { username: username.trim(), password }
  }
  const scratch = join(HOME, 'manifest-check')
  const latest = SEASONS.at(-1)!.manifests.content
  await exclusive(() => run(['-depot', String(CONTENT_DEPOT), '-manifest', latest, '-manifest-only', '-dir', scratch], { login: credentials }))
  rmSync(scratch, { recursive: true, force: true })
  if (!settings().steam_user) throw new Error("Signed in, but the Steam account name couldn't be determined")
  return profile({ refresh: true })
}

function signout() {
  for (const folder of storageDirs()) rmSync(folder, { recursive: true, force: true }) // only ours: other DepotDownloaders keep theirs
  for (const file of [STORE_NOTE, PROFILE]) if (existsSync(file)) unlinkSync(file)
  return update({ steam_user: '' })
}

export const methods: Methods = {
  'steam.profile': profile,
  'steam.login': login,
  'steam.code': ({ code }: { code: string }) => void waitingCode?.(code.trim()),
  'steam.cancel': cancel,
  'steam.signout': signout,
  'steam.tool': async () => (await ensureTool(), tool())
}
