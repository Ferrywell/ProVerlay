#!/usr/bin/env node
/**
 * Sign + zip the electron-builder output for distribution:
 *
 *   node scripts/package-mac-app.mjs arm64   # dist/mac-arm64/ProVerlay.app → dist/ProVerlay-mac-arm64.zip
 *   node scripts/package-mac-app.mjs x64     # dist/mac/ProVerlay.app       → dist/ProVerlay-mac-x64.zip
 *
 * Works on a copy in a temp dir (iCloud/Finder extended attributes break codesign);
 * the zip has no AppleDouble (._) entries. The unsigned app in dist/ is left as-is,
 * so the script can be run again with other signing settings.
 *
 * Signing is ad-hoc (`codesign --sign -`) unless MAC_CODESIGN_IDENTITY is set, e.g.
 * "Developer ID Application: Name (TEAMID)". A real identity signs with the hardened
 * runtime, a secure timestamp and build/entitlements.mac.plist. MAC_CODESIGN_KEYCHAIN
 * optionally points codesign at a specific keychain.
 *
 * Notarization runs when a real identity is used and MAC_NOTARIZE_APPLE_ID,
 * MAC_NOTARIZE_PASSWORD (app-specific password) and MAC_NOTARIZE_TEAM_ID are all
 * set: the zip is submitted with notarytool, the ticket is stapled to the app and
 * the app is zipped again. See docs/RELEASING.md.
 */
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const arch = process.argv[2] || 'arm64'
// electron-builder writes x64 (its default mac arch) to dist/mac, other archs to dist/mac-<arch>.
const ARCH_DIRS = { arm64: 'mac-arm64', x64: 'mac', universal: 'mac-universal' }
if (!ARCH_DIRS[arch]) {
  console.error(`package-mac-app: unknown arch "${arch}" (expected ${Object.keys(ARCH_DIRS).join(', ')})`)
  process.exit(1)
}

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const srcApp = path.join(repoRoot, 'dist', ARCH_DIRS[arch], 'ProVerlay.app')
const zipPath = path.join(repoRoot, 'dist', `ProVerlay-mac-${arch}.zip`)
const entitlements = path.join(repoRoot, 'build', 'entitlements.mac.plist')

const identity = (process.env.MAC_CODESIGN_IDENTITY || '').trim() || '-'
const adHoc = identity === '-'
const keychain = (process.env.MAC_CODESIGN_KEYCHAIN || '').trim()
const notary = {
  appleId: (process.env.MAC_NOTARIZE_APPLE_ID || '').trim(),
  password: (process.env.MAC_NOTARIZE_PASSWORD || '').trim(),
  teamId: (process.env.MAC_NOTARIZE_TEAM_ID || '').trim()
}
const notarize = !adHoc && Boolean(notary.appleId && notary.password && notary.teamId)

if (!fs.existsSync(srcApp)) {
  console.error(`package-mac-app: ${srcApp} not found — run electron-builder first`)
  process.exit(1)
}

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: 'inherit' })
}

function sign(target) {
  const args = ['--force', '--sign', identity]
  if (keychain) args.push('--keychain', keychain)
  if (!adHoc) args.push('--options', 'runtime', '--timestamp', '--entitlements', entitlements)
  args.push(target)
  execFileSync('codesign', args, { stdio: 'pipe' })
}

function zip(app) {
  fs.rmSync(zipPath, { force: true })
  run('ditto', ['-c', '-k', '--norsrc', '--noextattr', '--keepParent', app, zipPath])
}

function notarizeAndStaple(app) {
  console.log('package-mac-app: submitting to Apple notary service (this can take a few minutes)…')
  const out = execFileSync('xcrun', [
    'notarytool', 'submit', zipPath,
    '--apple-id', notary.appleId,
    '--password', notary.password,
    '--team-id', notary.teamId,
    '--wait', '--output-format', 'json'
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
  const result = JSON.parse(out)
  console.log(`package-mac-app: notarization ${result.status} (id ${result.id})`)
  if (result.status !== 'Accepted') {
    throw new Error(`notarization failed — inspect with: xcrun notarytool log ${result.id}`)
  }
  run('xcrun', ['stapler', 'staple', app])
  run('xcrun', ['stapler', 'validate', app])
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proverlay-pkg-'))
const tmpApp = path.join(tmpDir, 'ProVerlay.app')

try {
  console.log(`package-mac-app: ${arch} — copy to temp dir…`)
  run('cp', ['-R', '-X', srcApp, tmpApp])

  const fw = path.join(tmpApp, 'Contents', 'Frameworks')
  const electronFw = path.join(fw, 'Electron Framework.framework')

  console.log(`package-mac-app: signing (${adHoc ? 'ad-hoc' : 'Developer ID'})…`)
  if (fs.existsSync(electronFw)) {
    const versionsA = path.join(electronFw, 'Versions', 'A')
    for (const lib of ['Libraries/libEGL.dylib', 'Libraries/libGLESv2.dylib', 'Libraries/libffmpeg.dylib', 'Libraries/libvk_swiftshader.dylib']) {
      const p = path.join(versionsA, lib)
      if (fs.existsSync(p)) sign(p)
    }
    const crashpad = path.join(versionsA, 'Helpers', 'chrome_crashpad_handler')
    if (fs.existsSync(crashpad)) sign(crashpad)
    sign(path.join(versionsA, 'Electron Framework'))
    sign(electronFw)
  }

  for (const name of ['Mantle.framework', 'ReactiveObjC.framework', 'Squirrel.framework']) {
    const p = path.join(fw, name)
    if (fs.existsSync(p)) sign(p)
  }

  for (const entry of fs.readdirSync(fw)) {
    if (entry.endsWith('.app')) sign(path.join(fw, entry))
  }

  sign(path.join(tmpApp, 'Contents', 'MacOS', 'ProVerlay'))
  sign(tmpApp)
  run('codesign', ['--verify', '--deep', '--strict', tmpApp])

  console.log('package-mac-app: creating zip…')
  zip(tmpApp)

  if (notarize) {
    notarizeAndStaple(tmpApp)
    console.log('package-mac-app: re-creating zip with stapled ticket…')
    zip(tmpApp)
  } else if (!adHoc) {
    console.log('package-mac-app: MAC_NOTARIZE_* not set — signed but not notarized')
  }

  console.log('package-mac-app: OK —', zipPath)
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true })
}
