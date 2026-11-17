import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { makeTempDir } from './helpers.js'
import {
  DEFAULT_SETTINGS,
  validatePort,
  normalizeSettings,
  applySettingsPatch,
  publicSettings,
  loadSettings,
  saveSettings
} from '../electron/settings.js'

test('validatePort accepts 1024-65535 as number or numeric string', () => {
  assert.deepEqual(validatePort(2014), { ok: true, port: 2014 })
  assert.deepEqual(validatePort('2602'), { ok: true, port: 2602 })
  assert.deepEqual(validatePort(' 8080 '), { ok: true, port: 8080 })
  assert.deepEqual(validatePort(1024), { ok: true, port: 1024 })
  assert.deepEqual(validatePort(65535), { ok: true, port: 65535 })
})

test('validatePort rejects empty, non-integer, privileged and out-of-range ports', () => {
  for (const bad of ['', '   ', null, undefined, 'abc', '20 14', '2014.5', 2014.5, '-1', '0x7de', NaN, Infinity, true, {}]) {
    const result = validatePort(bad)
    assert.equal(result.ok, false, `expected ${JSON.stringify(bad)} to be rejected`)
    assert.equal(typeof result.error, 'string')
  }
  assert.match(validatePort(80).error, /between 1024 and 65535/)
  assert.match(validatePort(65536).error, /between 1024 and 65535/)
  assert.match(validatePort(0).error, /between 1024 and 65535/)
})

test('normalizeSettings fills defaults and drops invalid or unknown values', () => {
  assert.deepEqual(normalizeSettings(null), {
    ...DEFAULT_SETTINGS,
    firewallNoticeShown: false,
    trayNoticeShown: false
  })
  const s = normalizeSettings({
    port: 80,
    openDashboardOnStart: 'yes',
    startAtLogin: true,
    trayNoticeShown: true,
    evil: '<script>'
  })
  assert.equal(s.port, 2014)
  assert.equal(s.openDashboardOnStart, true)
  assert.equal(s.startAtLogin, true)
  assert.equal(s.trayNoticeShown, true)
  assert.equal('evil' in s, false)
  assert.deepEqual(normalizeSettings([1, 2]).port, 2014)
  assert.equal(normalizeSettings({ port: '3000' }).port, 3000)
})

test('applySettingsPatch validates fields and reports what changed', () => {
  const current = normalizeSettings({ port: 2014 })
  const ok = applySettingsPatch(current, { port: '2602', openDashboardOnStart: false })
  assert.equal(ok.ok, true)
  assert.equal(ok.settings.port, 2602)
  assert.equal(ok.settings.openDashboardOnStart, false)
  assert.deepEqual(ok.changed.sort(), ['openDashboardOnStart', 'port'])

  const same = applySettingsPatch(current, { port: 2014 })
  assert.deepEqual(same.changed, [])

  const bad = applySettingsPatch(current, { port: '99', startAtLogin: 'on' })
  assert.equal(bad.ok, false)
  assert.ok(bad.errors.port)
  assert.ok(bad.errors.startAtLogin)

  // Internal flags cannot be set from the Preferences window.
  const flags = applySettingsPatch(current, { firewallNoticeShown: true })
  assert.equal(flags.ok, true)
  assert.equal(flags.settings.firewallNoticeShown, false)

  assert.equal(applySettingsPatch(current, null).ok, false)
  assert.equal(applySettingsPatch(current, 'port=1').ok, false)
})

test('publicSettings exposes only user-editable keys', () => {
  assert.deepEqual(Object.keys(publicSettings({ port: 3000, trayNoticeShown: true })).sort(), [
    'openDashboardOnStart',
    'port',
    'startAtLogin'
  ])
})

test('loadSettings: missing file gives defaults, not corrupt', async () => {
  const dir = await makeTempDir('proverlay-settings-')
  const result = loadSettings(path.join(dir, 'settings.json'))
  assert.equal(result.exists, false)
  assert.equal(result.corrupt, false)
  assert.equal(result.settings.port, 2014)
})

test('loadSettings: corrupt JSON gives defaults and flags it', async () => {
  const dir = await makeTempDir('proverlay-settings-')
  const file = path.join(dir, 'settings.json')
  await fs.writeFile(file, '{"port": 30')
  const result = loadSettings(file)
  assert.equal(result.corrupt, true)
  assert.equal(result.settings.port, 2014)
})

test('saveSettings writes normalized JSON atomically and round-trips', async () => {
  const dir = await makeTempDir('proverlay-settings-')
  const file = path.join(dir, 'nested', 'settings.json')
  const written = saveSettings(file, { port: 2602, startAtLogin: true, junk: 1 })
  assert.equal(written.port, 2602)
  assert.equal('junk' in written, false)
  const loaded = loadSettings(file)
  assert.equal(loaded.corrupt, false)
  assert.deepEqual(loaded.settings, written)
  const files = await fs.readdir(path.dirname(file))
  assert.deepEqual(files, ['settings.json'], 'no temp files left behind')
})
