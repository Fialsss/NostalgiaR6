import { execFile } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import { crc32, inflateRawSync } from 'node:zlib'

const AGENT = { 'User-Agent': 'Nostalgia (+https://github.com/Fialsss/NostalgiaR6)' }

function failed(url: string, status: number): Error {
  return new Error(`${new URL(url).host}: HTTP ${status}`)
}

export async function json<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: AGENT })
  if (!response.ok) throw failed(url, response.status)
  return (await response.json()) as T
}

/** Save a URL to a file. It's written aside first, so a cut download never looks complete. */
export async function download(url: string, file: string, progress?: (done: number, total: number) => void): Promise<void> {
  const response = await fetch(url, { headers: AGENT })
  if (!response.ok || !response.body) throw failed(url, response.status)
  const total = Number(response.headers.get('content-length')) || 0
  const body = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream)
  let done = 0
  if (progress) body.on('data', (chunk: Buffer) => progress((done += chunk.length), total))
  await mkdir(dirname(file), { recursive: true })
  await pipeline(body, createWriteStream(`${file}.part`))
  await rename(`${file}.part`, file)
}

type Release = { tag_name: string; assets: { name: string; browser_download_url: string }[] }

/** A file from a GitHub release: the latest one, or a given tag. */
export async function asset(repo: string, match: (name: string) => boolean, tag = ''): Promise<{ tag: string; url: string }> {
  const release = await json<Release>(`https://api.github.com/repos/${repo}/releases/${tag ? `tags/${tag}` : 'latest'}`)
  const found = release.assets.find((a) => match(a.name))
  if (!found) throw new Error(`${repo} ${release.tag_name} has no matching download`)
  return { tag: release.tag_name, url: found.browser_download_url }
}

// Windows' own tar (bsdtar) opens zip and 7z. A GNU tar earlier on PATH (Git's) would not.
const TAR = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')

export async function unpack(archive: string, folder: string): Promise<void> {
  await mkdir(folder, { recursive: true })
  await promisify(execFile)(TAR, ['-xf', archive, '-C', folder], { windowsHide: true })
}

/**
 * One file out of a zip on a server, with range requests: the directory at the end of the
 * archive, then that entry alone. Liberator is 0.5 MB inside a 200 MB archive.
 */
export async function zipEntry(url: string, name: string): Promise<Buffer> {
  const range = async (from: number, to: number) => {
    const response = await fetch(url, { headers: { ...AGENT, Range: `bytes=${from}-${to}` } })
    if (response.status !== 206) throw failed(url, response.status)
    const total = Number(response.headers.get('content-range')?.split('/')[1])
    return { data: Buffer.from(await response.arrayBuffer()), total }
  }
  const { total } = await range(0, 0)
  const tail = (await range(Math.max(0, total - 65557), total - 1)).data
  const end = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (end < 0) throw new Error('Not a zip archive')
  const size = tail.readUInt32LE(end + 12)
  const offset = tail.readUInt32LE(end + 16)
  const directory = (await range(offset, offset + size - 1)).data
  for (let p = 0; p + 46 <= directory.length && directory.readUInt32LE(p) === 0x02014b50; ) {
    const nameLength = directory.readUInt16LE(p + 28)
    const next = p + 46 + nameLength + directory.readUInt16LE(p + 30) + directory.readUInt16LE(p + 32)
    if (directory.toString('utf8', p + 46, p + 46 + nameLength) === name) {
      const method = directory.readUInt16LE(p + 10)
      const crc = directory.readUInt32LE(p + 16)
      const packed = directory.readUInt32LE(p + 20)
      const local = directory.readUInt32LE(p + 42)
      const header = (await range(local, local + 29)).data
      const start = local + 30 + header.readUInt16LE(26) + header.readUInt16LE(28)
      const data = (await range(start, start + packed - 1)).data
      const raw = method === 8 ? inflateRawSync(data) : data
      if (crc32(raw) !== crc) throw new Error(`${name}: damaged download`)
      return raw
    }
    p = next
  }
  throw new Error(`${name} is not in the archive`)
}
