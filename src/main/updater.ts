import { app } from 'electron'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { emit, type Methods } from './core'
import { download, json, newer } from './net'

const REPO = 'Fialsss/NostalgiaR6'

type Release = {
  tag_name: string
  name: string
  body: string
  published_at: string
  draft: boolean
  prerelease: boolean
  html_url: string
  assets: { name: string; size: number; digest?: string; browser_download_url: string }[]
}
export type Note = { version: string; title: string; date: string; body: string; url: string }

// the portable launcher unpacks the app to a temp folder and says where it came from
const PORTABLE = process.env.PORTABLE_EXECUTABLE_FILE
export const kind = (): 'portable' | 'setup' | 'dev' => (PORTABLE ? 'portable' : app.isPackaged ? 'setup' : 'dev')

let releases: Release[] = []
let busy = false

async function check() {
  releases = (await json<Release[]>(`https://api.github.com/repos/${REPO}/releases?per_page=30`)).filter((r) => !r.draft && !r.prerelease)
  const current = app.getVersion()
  const latest = releases[0]?.tag_name.replace(/^v/, '') ?? current
  const notes: Note[] = releases.map((r) => ({
    version: r.tag_name.replace(/^v/, ''),
    title: r.name,
    date: r.published_at,
    body: r.body ?? '',
    url: r.html_url
  }))
  return { current, latest, available: newer(latest, current), kind: kind(), notes }
}

async function sha256(file: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}

const REPLACE = '--nostalgia-replace='
const AFTER = '--nostalgia-after='
const flag = (name: string) => process.argv.find((a) => a.startsWith(name))?.slice(name.length)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const alive = (pid: number) => {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/**
 * Right after a portable update: wait for the old copy to close (before the single-instance lock, which it
 * still holds), then delete the old exe once its launcher lets go of it. Up to a minute each.
 */
export async function takeOver(): Promise<void> {
  const pid = Number(flag(AFTER))
  for (let i = 0; pid && i < 200 && alive(pid); i++) await sleep(300)
  const old = flag(REPLACE)
  if (!old || old === PORTABLE) return
  void (async () => {
    for (let i = 0; i < 60; i++) {
      try {
        await rm(old, { force: true })
        return
      } catch {
        await sleep(1000)
      }
    }
  })()
}

/**
 * Download the newest build of the same kind and swap it in:
 * - Setup: the installer runs silently over the old install and starts the app again (--force-run).
 * - Portable: the new exe lands next to the old one and starts; it deletes the old one once this has closed.
 *   The file names keep their version, like the downloads on GitHub.
 */
async function install() {
  if (busy) return
  const mode = kind()
  if (mode === 'dev') throw new Error('update.dev')
  if (!releases.length) await check()
  const release = releases[0]
  const asset = release?.assets.find((a) => a.name.endsWith(mode === 'portable' ? 'Portable.exe' : 'Setup.exe'))
  if (!release || !asset || !newer(release.tag_name, app.getVersion())) throw new Error('update.none')
  busy = true
  try {
    // no "update" in the names: Windows takes such exes for installers and asks for admin rights
    const target = mode === 'portable' ? join(dirname(PORTABLE!), asset.name) : join(tmpdir(), asset.name)
    if (target === PORTABLE) throw new Error('update.none')
    await download(asset.browser_download_url, target, (done, total) => emit('update.progress', { done, total: total || asset.size }))
    const expected = asset.digest?.replace(/^sha256:/, '')
    if (expected && (await sha256(target)) !== expected) throw new Error('update.damaged')
    emit('update.ready')

    if (mode === 'setup') {
      spawn(target, ['--updated', '/S', '--force-run'], { detached: true, stdio: 'ignore' }).unref()
    } else {
      // No script, no console window: the new exe starts now and waits for this one to close (takeOver)
      const args = process.argv.slice(1).filter((a) => !a.startsWith('--nostalgia-'))
      spawn(target, [...args, `${REPLACE}${PORTABLE}`, `${AFTER}${process.pid}`], { detached: true, stdio: 'ignore' }).unref()
    }
    setTimeout(() => app.quit(), 400)
  } finally {
    busy = false
  }
}

export const methods: Methods = {
  'update.check': () => check(),
  'update.install': () => install()
}
