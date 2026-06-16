#!/usr/bin/env node
/**
 * Sign + zip voor distributie. Alles in /tmp — kopie terug naar ~/Documents breekt codesign.
 */
import { execFileSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

const arch = process.argv[2] || 'arm64'
const root = path.resolve('dist', `mac-${arch}`)
const srcApp = path.join(root, 'ProVerlay.app')
const zipPath = path.resolve(`dist/ProVerlay-mac-${arch}.zip`)
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proverlay-pkg-'))
const tmpApp = path.join(tmpDir, 'ProVerlay.app')

if (!fs.existsSync(srcApp)) {
  console.error(`package-mac-app: ${srcApp} not found — run electron-builder first`)
  process.exit(1)
}

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: 'inherit' })
}

function sign(target) {
  execFileSync('codesign', ['--force', '--sign', '-', target], { stdio: 'pipe' })
}

try {
  console.log('package-mac-app: copy to /tmp…')
  run('cp', ['-R', '-X', srcApp, tmpApp])

  const fw = path.join(tmpApp, 'Contents', 'Frameworks')
  const electronFw = path.join(fw, 'Electron Framework.framework')

  console.log('package-mac-app: signing…')
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
  fs.rmSync(zipPath, { force: true })
  run('ditto', ['-c', '-k', '--keepParent', tmpApp, zipPath])

  console.log('package-mac-app: OK —', zipPath)
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true })
}
