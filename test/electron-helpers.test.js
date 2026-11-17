import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  baseUrlForPort,
  isAppUrl,
  isSafeExternalUrl,
  normalizeThemeChoice,
  titleBarOverlayFor,
  describeListenError,
  pickOperatorUrl
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

test('pickOperatorUrl prefers a 192.168 LAN address and falls back to localhost', () => {
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
  assert.equal(pickOperatorUrl({ urls: { lan: [] } }, 2602), 'http://localhost:2602/operator')
  assert.equal(pickOperatorUrl(undefined, 2014), 'http://localhost:2014/operator')
})
