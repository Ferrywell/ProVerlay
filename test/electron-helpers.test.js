import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  baseUrlForPort,
  isAppUrl,
  isSafeExternalUrl,
  normalizeThemeChoice,
  titleBarOverlayFor,
  describeListenError,
  pickOperatorUrl,
  localUrlForPort,
  isProVerlayState,
  clampWindowSize,
  HIDDEN_ARG,
  loginItemSettingsFor,
  wasStartedHidden,
  saveDialogOptionsFor
} from '../electron/helpers.js'

const BASE = baseUrlForPort(2014)

test('baseUrlForPort uses localhost and the given port', () => {
  assert.equal(BASE, 'http://localhost:2014')
  assert.equal(baseUrlForPort(2602), 'http://localhost:2602')
})

test('isAppUrl compares origins, not string prefixes', () => {
  assert.equal(isAppUrl('http://localhost:2014/control', BASE), true)
  assert.equal(isAppUrl('http://localhost:2014/render?graphic=a', BASE), true)
  assert.equal(isAppUrl('http://localhost:2014', BASE), true)

  // Prefix look-alikes that `url.startsWith(BASE)` would have accepted.
  assert.equal(isAppUrl('http://localhost:20140/control', BASE), false)
  assert.equal(isAppUrl('http://localhost:2014.evil.test/control', BASE), false)
  assert.equal(isAppUrl('http://localhost:2014@evil.test/', BASE), false)

  assert.equal(isAppUrl('https://localhost:2014/control', BASE), false)
  assert.equal(isAppUrl('http://127.0.0.1:2014/control', BASE), false)
  assert.equal(isAppUrl('http://localhost:2602/control', BASE), false)
  assert.equal(isAppUrl('file:///etc/passwd', BASE), false)
  assert.equal(isAppUrl('javascript:alert(1)', BASE), false)
  assert.equal(isAppUrl('', BASE), false)
  assert.equal(isAppUrl(undefined, BASE), false)
  assert.equal(isAppUrl('not a url', BASE), false)
})

test('isSafeExternalUrl allows only web and mail links', () => {
  assert.equal(isSafeExternalUrl('https://multiviewer.app'), true)
  assert.equal(isSafeExternalUrl('http://example.com/x'), true)
  assert.equal(isSafeExternalUrl('mailto:hello@example.com'), true)
  for (const bad of ['file:///C:/Windows/System32/calc.exe', 'javascript:alert(1)', 'smb://host/share', 'ms-settings:', 'vbscript:x', '', 'nope']) {
    assert.equal(isSafeExternalUrl(bad), false, bad)
  }
})

test('normalizeThemeChoice only passes light/dark, everything else is system', () => {
  assert.equal(normalizeThemeChoice('light'), 'light')
  assert.equal(normalizeThemeChoice('dark'), 'dark')
  assert.equal(normalizeThemeChoice('system'), 'system')
  assert.equal(normalizeThemeChoice('purple'), 'system')
  assert.equal(normalizeThemeChoice(undefined), 'system')
})

test('titleBarOverlayFor returns contrasting colours per theme', () => {
  const light = titleBarOverlayFor(false)
  const dark = titleBarOverlayFor(true)
  assert.notEqual(light.color, dark.color)
  assert.notEqual(light.symbolColor, dark.symbolColor)
  assert.equal(light.height, dark.height)
  assert.match(light.color, /^#[0-9a-f]{6}$/)
})

test('describeListenError explains port in use and permission denied', () => {
  const inUse = describeListenError(Object.assign(new Error('x'), { code: 'EADDRINUSE' }), 2014)
  assert.equal(inUse.code, 'EADDRINUSE')
  assert.match(inUse.message, /2014 is already in use/)

  const denied = describeListenError(Object.assign(new Error('x'), { code: 'EACCES' }), 2014, 'win32')
  assert.equal(denied.code, 'EACCES')
  assert.match(denied.detail, /Hyper-V/)
  const deniedMac = describeListenError(Object.assign(new Error('x'), { code: 'EACCES' }), 2014, 'darwin')
  assert.doesNotMatch(deniedMac.detail, /Hyper-V/)

  const other = describeListenError(new Error('boom'), 2014)
  assert.equal(other.code, 'UNKNOWN')
  assert.equal(other.detail, 'boom')
})

test('pickOperatorUrl prefers a 192.168 LAN address and falls back to 127.0.0.1', () => {
  const network = {
    urls: {
      lan: [
        { ip: '100.101.1.2', path: 'operator', url: 'http://100.101.1.2:2014/operator' },
        { ip: '10.0.0.5', path: 'control', url: 'http://10.0.0.5:2014/control' },
        { ip: '10.0.0.5', path: 'operator', url: 'http://10.0.0.5:2014/operator' },
        { ip: '192.168.1.20', path: 'operator', url: 'http://192.168.1.20:2014/operator' }
      ]
    }
  }
  assert.equal(pickOperatorUrl(network, 2014), 'http://192.168.1.20:2014/operator')
  assert.equal(pickOperatorUrl({ urls: { lan: [] } }, 2602), 'http://127.0.0.1:2602/operator')
  assert.equal(pickOperatorUrl(undefined, 2014), 'http://127.0.0.1:2014/operator')
})

test('localUrlForPort uses the IPv4 loopback address (server listens on 0.0.0.0)', () => {
  assert.equal(localUrlForPort(2014), 'http://127.0.0.1:2014')
  assert.equal(`${localUrlForPort(2602)}/render`, 'http://127.0.0.1:2602/render')
})

test('isProVerlayState accepts the /api/state shape and rejects foreign servers', () => {
  assert.equal(isProVerlayState({ graphics: [], projectId: 'blank', projectName: 'New client', serverNow: 1 }), true)
  assert.equal(isProVerlayState({ graphics: [{ id: 'a' }], projectId: 'new-client' }), true)

  // What a SPA dev server, a status page or another API might answer with 200.
  for (const foreign of [
    null,
    undefined,
    'busy',
    '<!doctype html><html></html>',
    42,
    [],
    [{ graphics: [], projectId: 'x' }],
    {},
    { ok: true },
    { graphics: [] },
    { projectId: 'blank' },
    { graphics: {}, projectId: 'blank' },
    { graphics: [], projectId: '' },
    { graphics: [], projectId: 7 }
  ]) {
    assert.equal(isProVerlayState(foreign), false, JSON.stringify(foreign))
  }
})

test('clampWindowSize fits the default window into a small work area', () => {
  const wanted = { width: 1440, height: 920, minWidth: 1024, minHeight: 640 }
  // 2560×1440 at 100 %: unchanged.
  assert.deepEqual(clampWindowSize(wanted, { width: 2560, height: 1400 }), wanted)
  // 1920×1080 at 125 %: work area ≈ 1536×816.
  assert.deepEqual(clampWindowSize(wanted, { width: 1536, height: 816 }), { ...wanted, height: 816 })
  // 1366×768 at 125 %: even the minimum height does not fit.
  assert.deepEqual(clampWindowSize(wanted, { width: 1093, height: 590 }), {
    width: 1093,
    height: 590,
    minWidth: 1024,
    minHeight: 590
  })
  // No (or a nonsense) work area: leave the size alone.
  assert.deepEqual(clampWindowSize(wanted, undefined), wanted)
  assert.deepEqual(clampWindowSize(wanted, { width: 0, height: NaN }), wanted)
  // Fractional DIP sizes round down so the window stays inside.
  assert.equal(clampWindowSize({ width: 2000, height: 2000 }, { width: 1279.5, height: 719.2 }).height, 719)
})

test('loginItemSettingsFor passes the same --hidden args on and off (Windows matches path + args)', () => {
  assert.deepEqual(loginItemSettingsFor('win32', true), { openAtLogin: true, args: [HIDDEN_ARG] })
  assert.deepEqual(loginItemSettingsFor('win32', false), { openAtLogin: false, args: [HIDDEN_ARG] })
  assert.deepEqual(loginItemSettingsFor('darwin', true), { openAtLogin: true, openAsHidden: true })
  assert.deepEqual(loginItemSettingsFor('linux', 1), { openAtLogin: true })
  assert.equal(HIDDEN_ARG, '--hidden')
})

test('wasStartedHidden detects a login-item launch', () => {
  assert.equal(wasStartedHidden({ platform: 'win32', argv: ['C:\\ProVerlay.exe', '--hidden'] }), true)
  assert.equal(wasStartedHidden({ platform: 'win32', argv: ['C:\\ProVerlay.exe'] }), false)
  assert.equal(wasStartedHidden({ platform: 'win32', argv: ['x'], loginItem: { wasOpenedAtLogin: true } }), false)
  assert.equal(wasStartedHidden({ platform: 'darwin', argv: ['x'], loginItem: { wasOpenedAtLogin: true } }), true)
  assert.equal(wasStartedHidden({ platform: 'darwin', argv: ['x'], loginItem: { wasOpenedAsHidden: true } }), true)
  assert.equal(wasStartedHidden({ platform: 'darwin', argv: ['x'], loginItem: {} }), false)
  assert.equal(wasStartedHidden({ platform: 'linux' }), false)
})

test('saveDialogOptionsFor titles the project export dialog instead of showing the blob URL', () => {
  const exportOptions = saveDialogOptionsFor('new-client.proverlay')
  assert.equal(exportOptions.title, 'Export project')
  assert.deepEqual(exportOptions.filters, [{ name: 'ProVerlay project', extensions: ['proverlay'] }])
  assert.equal('defaultPath' in exportOptions, false) // keeps the suggested file name
  assert.equal(saveDialogOptionsFor('Match.PROVERLAY').title, 'Export project')
  assert.deepEqual(saveDialogOptionsFor('logo.png'), { title: 'Save file' })
  assert.deepEqual(saveDialogOptionsFor(undefined), { title: 'Save file' })
})
