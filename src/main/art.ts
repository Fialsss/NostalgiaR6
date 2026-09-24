/**
 * Season key art on disk. The window downloads each picture once, makes a 960 px copy for grids
 * (Chromium decodes webp; Electron's nativeImage can't) and hands both here; from then on they
 * load from disk through art://local/<name>, instantly.
 */
import { net, protocol } from 'electron'
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { HOME, type Methods } from './core'

const DIR = join(HOME, 'art')
const NAME = /^Y\d+S\d+_\w+(-960)?\.webp$/ // the window may only name season pictures

/** Before the app is ready: art:// then loads in <img> and fetch like https would. */
export function register(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: 'art', privileges: { standard: true, secure: true, supportFetchAPI: true } }])
}

export function serve(): void {
  protocol.handle('art', (request) => {
    const name = decodeURIComponent(new URL(request.url).pathname.slice(1))
    if (!NAME.test(name)) return new Response(null, { status: 404 })
    return net.fetch(pathToFileURL(join(DIR, name)).href)
  })
}

export const methods: Methods = {
  'art.list': () => {
    try {
      return readdirSync(DIR).filter((name) => NAME.test(name))
    } catch {
      return []
    }
  },
  'art.save': ({ name, bytes }: { name: string; bytes: Uint8Array }) => {
    if (!NAME.test(name)) throw new Error(`Not a season picture: ${name}`)
    mkdirSync(DIR, { recursive: true })
    writeFileSync(join(DIR, name), bytes)
    return true
  }
}
