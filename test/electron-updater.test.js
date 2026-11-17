import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { makeTempDir } from './helpers.js'
import {
  RELEASES_API,
  assetNameFor,
  checkForUpdate,
  compareVersions,
  downloadUpdate,
  evaluateRelease,
  isTrustedAssetUrl,
  macAppBundle,
  macSwapScript,
  parseChecksums,
  parseVersion
} from '../electron/updater.js'

const DL = 'https://github.com/Ferrywell/ProVerlay/releases/download/v0.11.0'

function release(overrides = {}) {
  return {
    tag_name: 'v0.11.0',
    name: 'v0.11.0',
    body: 'New things',
    html_url: 'https://github.com/Ferrywell/ProVerlay/releases/tag/v0.11.0',
    draft: false,
    prerelease: false,
    assets: [
      { name: 'ProVerlay-mac-arm64.zip', size: 10, browser_download_url: `${DL}/ProVerlay-mac-arm64.zip` },
      { name: 'ProVerlay-mac-x64.zip', size: 11, browser_download_url: `${DL}/ProVerlay-mac-x64.zip` },
      { name: 'ProVerlay-win-x64-setup.exe', size: 12, browser_download_url: `${DL}/ProVerlay-win-x64-setup.exe` },
      { name: 'SHA256SUMS.txt', size: 300, browser_download_url: `${DL}/SHA256SUMS.txt` }
    ],
    ...overrides
  }
}

test('parseVersion and compareVersions follow semver order', () => {
  assert.deepEqual(parseVersion('v1.2.3'), { major: 1, minor: 2, patch: 3, pre: '' })
  assert.equal(parseVersion('1.2'), null)
  assert.equal(compareVersions('0.10.1', '0.9.9'), 1)
  assert.equal(compareVersions('0.10.1', '0.10.1'), 0)
  assert.equal(compareVersions('v0.10.0', '0.10.1'), -1)
  assert.equal(compareVersions('1.0.0', '1.0.0-beta.2'), 1)
  assert.equal(compareVersions('1.0.0-beta.2', '1.0.0-beta.10'), -1)
  assert.equal(compareVersions('1.0.0-alpha', '1.0.0-beta'), -1)
})

test('assetNameFor picks the release file for each platform', () => {
  assert.equal(assetNameFor('darwin', 'arm64'), 'ProVerlay-mac-arm64.zip')
  assert.equal(assetNameFor('darwin', 'x64'), 'ProVerlay-mac-x64.zip')
  assert.equal(assetNameFor('win32', 'x64'), 'ProVerlay-win-x64-setup.exe')
  assert.equal(assetNameFor('linux', 'x64'), null)
})

test('parseChecksums reads sha256sum output', () => {
  const a = 'a'.repeat(64)
  const b = 'B'.repeat(64)
  const sums = parseChecksums(`${a}  ProVerlay-mac-arm64.zip\n${b} *dist/ProVerlay-win-x64-setup.exe\nnot a line\n`)
  assert.equal(sums.get('ProVerlay-mac-arm64.zip'), a)
  assert.equal(sums.get('ProVerlay-win-x64-setup.exe'), 'b'.repeat(64))
  assert.equal(sums.size, 2)
})

test('only release assets of this repository are trusted', () => {
  assert.equal(isTrustedAssetUrl(`${DL}/ProVerlay-mac-arm64.zip`), true)
  assert.equal(isTrustedAssetUrl('http://github.com/Ferrywell/ProVerlay/releases/download/v1/x.zip'), false)
  assert.equal(isTrustedAssetUrl('https://github.com/someone/ProVerlay/releases/download/v1/x.zip'), false)
  assert.equal(isTrustedAssetUrl('https://evil.example/Ferrywell/ProVerlay/releases/download/v1/x.zip'), false)
  assert.equal(isTrustedAssetUrl('not a url'), false)
})

test('evaluateRelease: newer release with an asset for this computer is available', () => {
  const r = evaluateRelease(release(), { currentVersion: '0.10.1', platform: 'darwin', arch: 'arm64' })
  assert.equal(r.status, 'available')
  assert.equal(r.version, '0.11.0')
  assert.deepEqual(r.asset, { name: 'ProVerlay-mac-arm64.zip', url: `${DL}/ProVerlay-mac-arm64.zip`, size: 10 })
  assert.equal(r.checksumsUrl, `${DL}/SHA256SUMS.txt`)
})

test('evaluateRelease: same, older or pre-release versions are current', () => {
  const opts = { platform: 'darwin', arch: 'arm64' }
  assert.equal(evaluateRelease(release(), { ...opts, currentVersion: '0.11.0' }).status, 'current')
  assert.equal(evaluateRelease(release(), { ...opts, currentVersion: '0.12.0' }).status, 'current')
  assert.equal(evaluateRelease(release({ prerelease: true }), { ...opts, currentVersion: '0.10.0' }).status, 'current')
})

test('evaluateRelease: no asset or checksums for this platform → unsupported', () => {
  const linux = evaluateRelease(release(), { currentVersion: '0.10.0', platform: 'linux', arch: 'x64' })
  assert.equal(linux.status, 'unsupported')
  const noSums = release()
  noSums.assets = noSums.assets.filter((a) => a.name !== 'SHA256SUMS.txt')
  assert.equal(evaluateRelease(noSums, { currentVersion: '0.10.0', platform: 'win32', arch: 'x64' }).status, 'unsupported')
  const foreign = release()
  foreign.assets[0].browser_download_url = 'https://example.com/ProVerlay-mac-arm64.zip'
  assert.equal(evaluateRelease(foreign, { currentVersion: '0.10.0', platform: 'darwin', arch: 'arm64' }).status, 'unsupported')
})

test('evaluateRelease rejects drafts and odd tags', () => {
  assert.throws(() => evaluateRelease(release({ draft: true }), { currentVersion: '0.1.0', platform: 'darwin', arch: 'arm64' }))
  assert.throws(() => evaluateRelease(release({ tag_name: 'latest' }), { currentVersion: '0.1.0', platform: 'darwin', arch: 'arm64' }))
})

test('checkForUpdate asks the GitHub API and explains failures', async () => {
  let asked = null
  const ok = await checkForUpdate({
    currentVersion: '0.10.1',
    platform: 'win32',
    arch: 'x64',
    fetchImpl: async (url) => {
      asked = url
      return new Response(JSON.stringify(release()), { status: 200 })
    }
  })
  assert.equal(asked, RELEASES_API)
  assert.equal(ok.status, 'available')
  assert.equal(ok.asset.name, 'ProVerlay-win-x64-setup.exe')

  await assert.rejects(
    checkForUpdate({ currentVersion: '1.0.0', fetchImpl: async () => new Response('{}', { status: 403 }) }),
    /rate limit/
  )
  await assert.rejects(
    checkForUpdate({
      currentVersion: '1.0.0',
      fetchImpl: async () => {
        throw new TypeError('fetch failed')
      }
    }),
    /internet/
  )
})

function fakeDownloads(files) {
  return async (url) => {
    const name = url.split('/').pop()
    if (!(name in files)) return new Response('missing', { status: 404 })
    const body = files[name]
    return new Response(body, { status: 200, headers: { 'content-length': String(Buffer.byteLength(body)) } })
  }
}

test('downloadUpdate verifies size and checksum', async () => {
  const dir = await makeTempDir()
  const payload = 'pretend this is a zip'
  const sha = crypto.createHash('sha256').update(payload).digest('hex')
  const update = {
    asset: { name: 'ProVerlay-mac-arm64.zip', url: `${DL}/ProVerlay-mac-arm64.zip`, size: Buffer.byteLength(payload) },
    checksumsUrl: `${DL}/SHA256SUMS.txt`
  }
  const progress = []
  const file = await downloadUpdate(update, {
    dir,
    fetchImpl: fakeDownloads({ 'ProVerlay-mac-arm64.zip': payload, 'SHA256SUMS.txt': `${sha}  ProVerlay-mac-arm64.zip\n` }),
    onProgress: (received, total) => progress.push([received, total])
  })
  assert.equal(fs.readFileSync(file, 'utf8'), payload)
  assert.deepEqual(progress.at(-1), [Buffer.byteLength(payload), Buffer.byteLength(payload)])

  // Wrong checksum: rejected and the file is removed.
  await assert.rejects(
    downloadUpdate(update, {
      dir,
      fetchImpl: fakeDownloads({ 'ProVerlay-mac-arm64.zip': payload, 'SHA256SUMS.txt': `${'0'.repeat(64)}  ProVerlay-mac-arm64.zip\n` })
    }),
    /checksum/
  )
  assert.equal(fs.existsSync(path.join(dir, 'ProVerlay-mac-arm64.zip')), false)

  // Missing from the checksum list, or an untrusted URL.
  await assert.rejects(
    downloadUpdate(update, { dir, fetchImpl: fakeDownloads({ 'ProVerlay-mac-arm64.zip': payload, 'SHA256SUMS.txt': '' }) }),
    /missing from/
  )
  await assert.rejects(downloadUpdate({ ...update, checksumsUrl: 'https://example.com/SHA256SUMS.txt' }, { dir }), /unexpected address/)
})

test('macAppBundle finds the bundle and refuses places it cannot update', () => {
  const exec = '/Applications/ProVerlay.app/Contents/MacOS/ProVerlay'
  assert.deepEqual(macAppBundle(exec, { canWrite: () => {} }), { ok: true, bundle: '/Applications/ProVerlay.app' })
  assert.equal(macAppBundle(exec, { isPackaged: false }).ok, false)
  assert.match(
    macAppBundle('/private/var/folders/x/AppTranslocation/ABC/d/ProVerlay.app/Contents/MacOS/ProVerlay', { canWrite: () => {} }).reason,
    /Applications folder/
  )
  assert.match(macAppBundle('/Volumes/ProVerlay/ProVerlay.app/Contents/MacOS/ProVerlay', { canWrite: () => {} }).reason, /Applications/)
  const denied = macAppBundle(exec, {
    canWrite: () => {
      throw new Error('EACCES')
    }
  })
  assert.match(denied.reason, /no write access/)
})

test('macSwapScript waits for the app, swaps with rollback and quotes paths', () => {
  const script = macSwapScript({
    pid: 4242,
    newApp: "/tmp/it's new/ProVerlay.app",
    target: '/Applications/ProVerlay.app',
    backup: '/tmp/u/ProVerlay-previous.app',
    log: '/tmp/u/install.log'
  })
  assert.match(script, /kill -0 4242/)
  assert.match(script, /mv '\/Applications\/ProVerlay.app' '\/tmp\/u\/ProVerlay-previous.app'/)
  assert.match(script, /mv '\/tmp\/it'\\''s new\/ProVerlay.app' '\/Applications\/ProVerlay.app'/)
  assert.match(script, /restoring/)
  assert.match(script, /open '\/Applications\/ProVerlay.app'/)
})
