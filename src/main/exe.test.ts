// node --test src/main/exe.test.ts
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { usable } from './exe.ts'

const dir = mkdtempSync(join(tmpdir(), 'nostalgia-lib-'))
const file = (name: string, data: Buffer) => {
  const path = join(dir, name)
  writeFileSync(path, data)
  return path
}
const exe = (head: string, size = 8192) => {
  const buffer = Buffer.alloc(size)
  buffer.write(head, 0, 'latin1')
  return buffer
}

test('accepts a real executable', () => {
  assert.equal(usable(file('good.exe', exe('MZ'))), true)
})

test('rejects a download cut short', () => {
  assert.equal(usable(file('short.exe', exe('MZ', 512))), false)
})

test('rejects a file that is not an executable', () => {
  // what an antivirus or a captive portal leaves behind: right name, wrong content
  assert.equal(usable(file('html.exe', exe('<!DOCTYPE html>'))), false)
})

test('rejects a file that is not there', () => {
  assert.equal(usable(join(dir, 'missing.exe')), false)
})
