// node --test src/main/net.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { newer } from './net.ts'

test('compares versions as numbers, not text', () => {
  assert.ok(newer('v0.10.0', '0.9.9'))
  assert.ok(newer('0.2.0', '0.1.12'))
  assert.ok(!newer('v0.1.0', '0.1.0'))
  assert.ok(!newer('0.1.0', '0.2'))
})
