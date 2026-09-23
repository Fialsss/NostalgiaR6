/**
 * Liberator (by Xeralin, from Operation Throwback) unlocks playlists, events and match rules in
 * local custom games. It ships only inside Throwback Launcher's runtime, so Nostalgia takes that one
 * file from the latest release, and speaks its runtime protocol: Liberator connects back to a local
 * port, reports its state and the playlist tree as JSON lines, and takes commands the same way.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { createServer, type AddressInfo, type Socket } from 'node:net'
import { join } from 'node:path'
import { emit, settings, TOOLS, update, type Methods } from './core'
import { zipEntry } from './net'

const EXE = join(TOOLS, 'Liberator.exe')
const RUNTIME = 'https://github.com/xeralin/ThrowbackLauncher/releases/latest/download/Runtime.zip'
const FIRST_TRY = 1500
const LAST_TRY = 30000

type Node = { text: string; id: string; children: Node[] }
type State = { attached: boolean; applied: boolean; status: string; capabilities: Record<string, boolean> }
const IDLE: State = { attached: false, applied: false, status: '', capabilities: {} }

let state = IDLE
let tree: Node[] | null = null
let game = false // a season started from Nostalgia is running
let proc: ChildProcess | null = null
let sock: Socket | null = null
let timer: NodeJS.Timeout | undefined
let delay = FIRST_TRY

export const available = () => existsSync(EXE)
const snapshot = () => ({ ...state, available: available(), enabled: settings().liberator, game })

async function fetchExe() {
  const exe = await zipEntry(RUNTIME, 'Liberator.exe')
  mkdirSync(TOOLS, { recursive: true })
  writeFileSync(`${EXE}.part`, exe)
  renameSync(`${EXE}.part`, EXE)
  return snapshot()
}

export function start(): void {
  game = true
  delay = FIRST_TRY
  if (settings().liberator) later(3000) // give the game a moment to exist
  emit('liberator.state', snapshot())
}

export function stop(): void {
  game = false
  clearTimeout(timer)
  detach()
}

function later(ms: number) {
  clearTimeout(timer)
  timer = setTimeout(attach, ms)
}

function retry() {
  if (!game || !settings().liberator) return
  later(delay)
  delay = Math.min(delay * 2, LAST_TRY)
}

function attach() {
  if (!game || sock || proc || !existsSync(EXE)) return
  const server = createServer((client) => {
    server.close()
    sock = client
    delay = FIRST_TRY
    listen(client)
  })
  server.listen(0, '127.0.0.1', () => {
    const port = (server.address() as AddressInfo).port
    const child = spawn(EXE, ['--runtime', String(port)], { windowsHide: true, stdio: 'ignore' })
    proc = child
    child.on('error', () => undefined) // 'exit' follows and retries
    child.on('exit', () => {
      server.close()
      if (proc !== child) return // we stopped it ourselves
      proc = null
      if (!sock) retry()
    })
  })
}

function listen(client: Socket) {
  let buffer = ''
  client.setEncoding('utf8')
  client.on('data', (chunk: string) => {
    buffer += chunk
    for (let nl = buffer.indexOf('\n'); nl >= 0; nl = buffer.indexOf('\n')) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line) continue
      try {
        const { event, ...message } = JSON.parse(line)
        if (event === 'state') {
          state = { ...IDLE, ...message }
          emit('liberator.state', snapshot())
        } else if (event === 'tree') {
          tree = message.tree ?? null
          emit('liberator.tree', tree)
        }
      } catch {
        // not a message
      }
    }
  })
  client.on('error', () => undefined)
  client.on('close', () => {
    if (sock !== client) return
    detach()
    retry()
  })
}

function detach() {
  const [s, p] = [sock, proc]
  sock = null
  proc = null
  s?.destroy()
  p?.kill()
  state = IDLE
  tree = null
  emit('liberator.state', snapshot())
  emit('liberator.tree', null)
}

function send(payload: Record<string, unknown>) {
  sock?.write(JSON.stringify(payload) + '\n')
  return true
}

export const methods: Methods = {
  'liberator.status': () => ({ ...snapshot(), tree }),
  'liberator.fetch': fetchExe,
  'liberator.enable': ({ on }: { on: boolean }) => {
    update({ liberator: on })
    if (!on) {
      clearTimeout(timer)
      detach()
    } else if (game) {
      delay = FIRST_TRY
      later(0)
    }
    return snapshot()
  },
  'liberator.setMod': ({ mod, enabled }: { mod: string; enabled: boolean }) => send({ cmd: 'setMod', mod, enabled }),
  'liberator.setPlaylist': ({ id }: { id: string }) => send({ cmd: 'setPlaylist', playlistId: id }),
  'liberator.endRound': () => send({ cmd: 'endRound' }),
  'liberator.endMatch': () => send({ cmd: 'endMatch' })
}
