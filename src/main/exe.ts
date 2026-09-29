/**
 * A download cut short, or an antivirus that gutted the file, still leaves something on disk:
 * existsSync says yes and the spawn then fails - on Windows by throwing, which is enough to take
 * the main process down. Check the file is a real executable before trying to run it.
 */
import { closeSync, openSync, readSync, statSync } from 'node:fs'

const SMALLEST = 4096 // no real tool is smaller; a stub or an error page is

export function usable(file: string): boolean {
  try {
    if (statSync(file).size < SMALLEST) return false
    const fd = openSync(file, 'r')
    const head = Buffer.alloc(2)
    const read = readSync(fd, head, 0, 2, 0)
    closeSync(fd)
    return read === 2 && head[0] === 0x4d && head[1] === 0x5a // 'MZ'
  } catch {
    return false // not there, or locked by whatever refused it
  }
}
