#!/usr/bin/env node
/**
 * Ad-hoc sign na electron-builder. Signeren moet in /tmp — iCloud/Documents-xattrs
 * breken codesign ("resource fork… not allowed").
 *
 * Schrijft het gesigneerde .app naar dist/mac-{arch}/ProVerlay-signed.app
 * (niet overschrijven van ProVerlay.app in Documents; dat zou de handtekening breken).
 */
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

const arch = process.argv[2] || 'arm64'
const root = path.resolve('dist', `mac-${arch}`)
const srcApp = path.join(root, 'ProVerlay.app')
const outApp = path.join(root, 'ProVerlay-signed.app')
const tmpApp = path.join(os.tmpdir(), `ProVerlay-sign-${process.pid}.app`)

if (!fs.existsSync(srcApp)) {
  console.error(`sign-mac-app: ${srcApp} not found`)
  process.exit(1)
}

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: 'inherit' })
}

function sign(target) {
  execFileSync('codesign', ['--force', '--sign', '-', target], { stdio: 'pipe' })
}

try {
  console.log('sign-mac-app: staging in /tmp…')
  fs.rmSync(tmpApp, { recursive: true, force: true })
  run('cp', ['-R', '-X', srcApp, tmpApp])

  const fw = path.join(tmpApp, 'Contents', 'Frameworks')
  const electronFw = path.join(fw, 'Electron Framework.framework')

  console.log('sign-mac-app: signing…')
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

  fs.rmSync(outApp, { recursive: true, force: true })
  run('cp', ['-R', '-X', tmpApp, outApp])
  run('codesign', ['--verify', '--deep', '--strict', outApp])

  console.log('sign-mac-app: OK —', outApp)
} finally {
  fs.rmSync(tmpApp, { recursive: true, force: true })
}
