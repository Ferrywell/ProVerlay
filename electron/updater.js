/**
 * In-app updates: check GitHub Releases for a newer ProVerlay, download the
 * installer for this platform, verify it, and hand over to the installer.
 * Never automatic: every step starts from a click in Preferences.
 *
 * Pure Node (no Electron imports) so test/electron-updater.test.js can run
 * it with node:test; the Electron glue (windows, quitting) is in main.js.
 *
 * Release assets are a contract with .github/workflows/release.yml:
 *   ProVerlay-mac-arm64.zip, ProVerlay-mac-x64.zip,
 *   ProVerlay-win-x64-setup.exe, SHA256SUMS.txt
 * The download is checked against SHA256SUMS.txt (and the size GitHub
 * reports). That protects against a broken or truncated download; both come
 * from the same GitHub release over https.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export const UPDATE_REPO = 'Ferrywell/ProVerlay'
export const RELEASES_API = `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`
export const RELEASES_PAGE = `https://github.com/${UPDATE_REPO}/releases`
export const CHECKSUMS_ASSET = 'SHA256SUMS.txt'
const MAX_NOTES = 4000
const CHECK_TIMEOUT_MS = 15_000

/** "v1.2.3" / "1.2.3-beta.1" → { major, minor, patch, pre } or null. */
export function parseVersion(value) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(value || '').trim())
  if (!m) return null
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]), pre: m[4] || '' }
}

/** Semver order: -1, 0 or 1. Unparseable versions sort lowest. */
export function compareVersions(a, b) {
  const x = parseVersion(a)
  const y = parseVersion(b)
  if (!x || !y) return x ? 1 : y ? -1 : 0
  for (const key of ['major', 'minor', 'patch']) {
    if (x[key] !== y[key]) return x[key] < y[key] ? -1 : 1
  }
  if (x.pre === y.pre) return 0
  if (!x.pre) return 1 // 1.0.0 > 1.0.0-beta
  if (!y.pre) return -1
  const xs = x.pre.split('.')
  const ys = y.pre.split('.')
  for (let i = 0; i < Math.max(xs.length, ys.length); i++) {
    if (xs[i] === undefined) return -1
    if (ys[i] === undefined) return 1
    const xn = /^\d+$/.test(xs[i])
    const yn = /^\d+$/.test(ys[i])
    if (xn && yn && Number(xs[i]) !== Number(ys[i])) return Number(xs[i]) < Number(ys[i]) ? -1 : 1
    if (xn !== yn) return xn ? -1 : 1
    if (!xn && xs[i] !== ys[i]) return xs[i] < ys[i] ? -1 : 1
  }
  return 0
}

/** Asset file name for this platform/arch, or null when there is none. */
export function assetNameFor(platform, arch) {
  if (platform === 'darwin') return arch === 'arm64' ? 'ProVerlay-mac-arm64.zip' : arch === 'x64' ? 'ProVerlay-mac-x64.zip' : null
  if (platform === 'win32') return arch === 'x64' || arch === 'arm64' ? 'ProVerlay-win-x64-setup.exe' : null
  return null
}

/** SHA256SUMS.txt ("<hex>  <name>" per line, optional "*" before the name) → Map. */
export function parseChecksums(text) {
  const sums = new Map()
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = /^([0-9a-fA-F]{64})\s+\*?(.+?)\s*$/.exec(line)
    if (m) sums.set(path.basename(m[2]), m[1].toLowerCase())
  }
  return sums
}

/** Only download from this repository's release assets. */
export function isTrustedAssetUrl(url) {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.hostname === 'github.com' && u.pathname.startsWith(`/${UPDATE_REPO}/releases/download/`)
  } catch {
    return false
  }
}

export function isReleasePageUrl(url) {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.hostname === 'github.com' && u.pathname.startsWith(`/${UPDATE_REPO}/releases`)
  } catch {
    return false
  }
}

/**
 * Turn a GitHub "latest release" response into what Preferences shows.
 * @returns {{ status: 'current'|'available'|'unsupported', ... }}
 */
export function evaluateRelease(release, { currentVersion, platform, arch }) {
  if (!release || typeof release !== 'object' || release.draft) throw new Error('No published release found')
  const version = String(release.tag_name || '').replace(/^v/, '')
  if (!parseVersion(version)) throw new Error(`Unexpected release tag "${release.tag_name}"`)
  const notes = String(release.body || '').trim()
  const info = {
    version,
    currentVersion,
    name: String(release.name || `v${version}`),
    notes: notes.length > MAX_NOTES ? `${notes.slice(0, MAX_NOTES)}…` : notes,
    pageUrl: isReleasePageUrl(release.html_url) ? release.html_url : RELEASES_PAGE,
    publishedAt: release.published_at || null
  }
  if (release.prerelease || compareVersions(version, currentVersion) <= 0) return { status: 'current', ...info }
  const assets = Array.isArray(release.assets) ? release.assets : []
  const wanted = assetNameFor(platform, arch)
  const asset = wanted && assets.find((a) => a?.name === wanted)
  const sums = assets.find((a) => a?.name === CHECKSUMS_ASSET)
  if (!asset || !sums || !isTrustedAssetUrl(asset.browser_download_url) || !isTrustedAssetUrl(sums.browser_download_url)) {
    return { status: 'unsupported', ...info, reason: 'This release has no download for this computer. Get it from the releases page.' }
  }
  return {
    status: 'available',
    ...info,
    asset: { name: asset.name, url: asset.browser_download_url, size: Number(asset.size) || 0 },
    checksumsUrl: sums.browser_download_url
  }
}

/** Ask GitHub for the latest release. `fetchImpl` is injectable for tests. */
export async function checkForUpdate({ currentVersion, platform = process.platform, arch = process.arch, fetchImpl = fetch }) {
  let res
  try {
    res = await fetchImpl(RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'ProVerlay-Updater' },
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS)
    })
  } catch (err) {
    throw new Error(err?.name === 'TimeoutError' ? 'GitHub did not answer in time. Check the internet connection.' : 'No internet connection, or GitHub is not reachable.')
  }
  if (res.status === 404) throw new Error('No published release found')
  if (res.status === 403 || res.status === 429) throw new Error('GitHub refused the check (rate limit). Try again in an hour.')
  if (!res.ok) throw new Error(`GitHub answered HTTP ${res.status}`)
  return evaluateRelease(await res.json(), { currentVersion, platform, arch })
}

/**
 * Download `update.asset` into `dir`, verify size and SHA-256 against
 * SHA256SUMS.txt. Reports progress as (receivedBytes, totalBytes).
 * Resolves to the file path; a failed check deletes the file.
 */
export async function downloadUpdate(update, { dir, onProgress = () => {}, fetchImpl = fetch, signal } = {}) {
  if (!isTrustedAssetUrl(update?.asset?.url) || !isTrustedAssetUrl(update?.checksumsUrl)) {
    throw new Error('Refusing to download from an unexpected address')
  }
  const sumsRes = await fetchImpl(update.checksumsUrl, { headers: { 'User-Agent': 'ProVerlay-Updater' }, signal })
  if (!sumsRes.ok) throw new Error(`Could not download the checksums (HTTP ${sumsRes.status})`)
  const expected = parseChecksums(await sumsRes.text()).get(update.asset.name)
  if (!expected) throw new Error(`${update.asset.name} is missing from ${CHECKSUMS_ASSET}`)

  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, update.asset.name)
  const res = await fetchImpl(update.asset.url, { headers: { 'User-Agent': 'ProVerlay-Updater' }, signal })
  if (!res.ok || !res.body) throw new Error(`Download failed (HTTP ${res.status})`)
  const total = Number(res.headers.get('content-length')) || update.asset.size || 0
  const hash = crypto.createHash('sha256')
  const out = fs.createWriteStream(file)
  let received = 0
  try {
    for await (const chunk of res.body) {
      hash.update(chunk)
      received += chunk.length
      if (!out.write(chunk)) await new Promise((resolve) => out.once('drain', resolve))
      onProgress(received, total)
    }
    await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())))
    if (update.asset.size && received !== update.asset.size) {
      throw new Error(`Download incomplete (${received} of ${update.asset.size} bytes)`)
    }
    const actual = hash.digest('hex')
    if (actual !== expected) throw new Error('The download is damaged (checksum mismatch). Try again.')
    return file
  } catch (err) {
    out.destroy()
    fs.rmSync(file, { force: true })
    throw err
  }
}

/* ------------------------------------------------------------- macOS */

/**
 * The .app bundle this process runs from, or a reason it cannot be replaced
 * (running from source, from a disk image or a translocated/quarantined copy,
 * or from a folder the user cannot write to).
 */
export function macAppBundle(execPath, { isPackaged = true, canWrite = (p) => fs.accessSync(p, fs.constants.W_OK) } = {}) {
  if (!isPackaged) return { ok: false, reason: 'Updating works in the installed app. When running from source, use git pull.' }
  // macOS paths, also when the tests run on Windows.
  const bundle = path.posix.resolve(execPath, '..', '..', '..')
  if (!bundle.endsWith('.app')) return { ok: false, reason: 'Could not find the ProVerlay app bundle.' }
  if (bundle.includes('/AppTranslocation/') || bundle.startsWith('/Volumes/')) {
    return { ok: false, reason: 'Move ProVerlay to the Applications folder first, then update from there.' }
  }
  try {
    canWrite(path.posix.dirname(bundle))
    canWrite(bundle)
  } catch {
    return { ok: false, reason: `ProVerlay cannot replace itself in ${path.posix.dirname(bundle)} (no write access).` }
  }
  return { ok: true, bundle }
}

/**
 * Unzip a downloaded macOS update and check it before it replaces the app:
 * valid code signature, same bundle id, the expected version.
 */
export async function prepareMacUpdate(zipFile, { dir, bundleId, version, run = execFileAsync }) {
  const extractDir = path.join(dir, 'extracted')
  fs.rmSync(extractDir, { recursive: true, force: true })
  fs.mkdirSync(extractDir, { recursive: true })
  await run('/usr/bin/ditto', ['-x', '-k', zipFile, extractDir])
  const app = path.join(extractDir, 'ProVerlay.app')
  if (!fs.existsSync(app)) throw new Error('The download does not contain ProVerlay.app')
  try {
    await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app])
  } catch {
    throw new Error('The downloaded app has an invalid signature')
  }
  const plist = path.join(app, 'Contents', 'Info.plist')
  const read = async (key) => (await run('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', plist])).stdout.trim()
  const id = await read('CFBundleIdentifier')
  const v = await read('CFBundleShortVersionString')
  if (id !== bundleId) throw new Error(`The download is not ProVerlay (bundle id ${id})`)
  if (v !== version) throw new Error(`The download is version ${v}, expected ${version}`)
  return app
}

const shellQuote = (s) => `'${String(s).replaceAll("'", "'\\''")}'`

/**
 * Shell script that waits for this process to exit, swaps the app bundle
 * (keeping the old one until the new one is in place), and starts the new
 * version. On failure the old app is put back and started again.
 */
export function macSwapScript({ pid, newApp, target, backup, log }) {
  return `#!/bin/sh
# ProVerlay update helper (written by the app; deleted with its temp folder).
exec >>${shellQuote(log)} 2>&1
echo "$(date) waiting for ProVerlay (pid ${pid}) to quit"
i=0
while kill -0 ${pid} 2>/dev/null; do
  i=$((i+1))
  if [ $i -gt 300 ]; then echo "ProVerlay did not quit; update cancelled"; exit 1; fi
  sleep 0.2
done
rm -rf ${shellQuote(backup)}
if ! mv ${shellQuote(target)} ${shellQuote(backup)}; then
  echo "could not move the old app aside"; open ${shellQuote(target)}; exit 1
fi
if ! mv ${shellQuote(newApp)} ${shellQuote(target)}; then
  echo "could not move the new app in place; restoring"
  mv ${shellQuote(backup)} ${shellQuote(target)}; open ${shellQuote(target)}; exit 1
fi
xattr -dr com.apple.quarantine ${shellQuote(target)} 2>/dev/null
rm -rf ${shellQuote(backup)}
echo "$(date) updated; starting the new version"
open ${shellQuote(target)}
`
}
