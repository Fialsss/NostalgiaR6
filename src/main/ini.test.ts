// node --test src/main/ini.test.ts
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyTo, inputOf } from './ini.ts'

const old = '[DISPLAY]\r\nMouseYawSensitivity=1\r\n[INPUT]\r\nMouseYawSensitivity=5\r\nMouseSensitivityMultiplierUnit=0.020000\r\nAimDownSightsMouse=50\r\n[AUDIO]\r\nVolume=10\r\n'
const now = { MouseYawSensitivity: '60', MouseSensitivityMultiplierUnit: '0.002000', AimDownSightsMouse: '50', ADSMouseSensitivity1x: '36' }

test('reads only [INPUT]', () => {
  assert.deepEqual(inputOf(old), { MouseYawSensitivity: '5', MouseSensitivityMultiplierUnit: '0.020000', AimDownSightsMouse: '50' })
})

test('writes the keys in common, adds none, leaves other sections and line endings alone', () => {
  const { text, changed } = applyTo(old, now)
  assert.equal(changed, 2)
  assert.equal(text, old.replace('MouseYawSensitivity=5', 'MouseYawSensitivity=60').replace('0.020000', '0.002000'))
  assert.ok(!text.includes('ADSMouseSensitivity1x'))
  assert.ok(text.includes('[DISPLAY]\r\nMouseYawSensitivity=1\r\n'))
})
