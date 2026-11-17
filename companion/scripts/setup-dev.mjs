// Cross-platform version of setup-dev.sh: links this module into a Companion
// developer-modules folder and installs its dependencies.
// macOS/Linux: symlink. Windows: directory junction (no admin rights needed).
// Usage: npm run setup-dev:node   (COMPANION_DEV_PATH overrides the folder)
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const moduleDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const devDir = path.resolve(process.env.COMPANION_DEV_PATH || path.join(os.homedir(), 'companion-module-dev'))
const linkPath = path.join(devDir, 'companion-module-proverlay')
const isWindows = process.platform === 'win32'

fs.mkdirSync(devDir, { recursive: true })

const existing = fs.lstatSync(linkPath, { throwIfNoEntry: false })
if (existing) {
  if (!existing.isSymbolicLink()) {
    console.error(`${linkPath} exists and is not a link; remove it first.`)
    process.exitCode = 1
  } else {
    fs.unlinkSync(linkPath)
  }
}

if (!process.exitCode) {
  fs.symlinkSync(moduleDir, linkPath, isWindows ? 'junction' : 'dir')

  const npm = spawnSync(isWindows ? 'npm.cmd' : 'npm', ['install'], {
    cwd: moduleDir,
    stdio: 'inherit',
    shell: isWindows,
  })
  if (npm.status !== 0) {
    console.error('npm install failed')
    process.exitCode = npm.status || 1
  } else {
    console.log('')
    console.log('Developer module ready:')
    console.log(`  ${isWindows ? 'Junction' : 'Symlink'}: ${linkPath} -> ${moduleDir}`)
    console.log('')
    console.log('In the Companion Launcher:')
    console.log('  1. Open the Companion Launcher (not the web UI)')
    console.log('  2. Click the cog icon -> Advanced')
    console.log(`  3. Developer modules path: ${devDir}`)
    console.log('  4. Restart Companion')
    console.log("  5. Add a 'ProVerlay' connection (Module Version: Dev)")
    console.log('')
  }
}
