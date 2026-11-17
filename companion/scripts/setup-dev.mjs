// Puts this module in a Companion developer-modules folder and installs its
// dependencies there. Works on macOS, Linux and Windows.
//
// Default: a real copy (without node_modules, .git, pkg/ and *.tgz), then
// `npm install --omit=dev` inside the copy. Companion 5 runs modules under
// Node's permission model: it resolves a symlink/junction to the real path,
// allows only that folder and then reads manifest.json through the link path,
// which fails with ERR_ACCESS_DENIED. A copy works with Companion 4.3+ and 5.x.
// Re-run the script after changing the module; Companion reloads it.
//
// --link: the old behaviour, a symlink (Windows: directory junction) to this
// folder, so edits show up without re-running. Companion 4.x only.
//
// Usage: npm run setup-dev:node [-- --link]   (COMPANION_DEV_PATH overrides the folder)
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const moduleDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const devDir = path.resolve(process.env.COMPANION_DEV_PATH || path.join(os.homedir(), 'companion-module-dev'))
const targetPath = path.join(devDir, 'companion-module-proverlay')
const isWindows = process.platform === 'win32'
const useLink = process.argv.slice(2).includes('--link')

// Written into a copy we made, so a re-run may replace it (and never a folder we did not create).
const MARKER = '.proverlay-dev-copy'
const SKIP_TOP_LEVEL = new Set(['node_modules', '.git', 'pkg', MARKER])

/** A setup problem the user can fix: printed without a stack trace. */
class SetupError extends Error {}

function fail(message) {
  throw new SetupError(message)
}

/**
 * Run npm without a shell where possible: under `npm run`, npm_execpath is
 * npm's own CLI script, which Node can run directly on every OS. Otherwise
 * fall back to npm on PATH (Windows: npm.cmd needs a shell, so pass one
 * command string instead of an args array, which avoids DEP0190).
 */
function runNpm(args, cwd) {
  const npmCli = process.env.npm_execpath
  if (npmCli && /npm-cli\.c?js$/i.test(npmCli)) {
    return spawnSync(process.execPath, [npmCli, ...args], { cwd, stdio: 'inherit' })
  }
  if (isWindows) return spawnSync(`npm.cmd ${args.join(' ')}`, { cwd, stdio: 'inherit', shell: true })
  return spawnSync('npm', args, { cwd, stdio: 'inherit' })
}

const isOurCopy = (stat) => stat?.isDirectory() && fs.existsSync(path.join(targetPath, MARKER))

function setupLink() {
  const existing = fs.lstatSync(targetPath, { throwIfNoEntry: false })
  if (existing?.isSymbolicLink()) fs.unlinkSync(targetPath)
  else if (isOurCopy(existing)) fs.rmSync(targetPath, { recursive: true, force: true })
  else if (existing) fail(`${targetPath} exists and was not made by this script; remove it first.`)
  fs.mkdirSync(devDir, { recursive: true })
  fs.symlinkSync(moduleDir, targetPath, isWindows ? 'junction' : 'dir')
  return { installDir: moduleDir, npmArgs: ['install'], label: isWindows ? 'Junction' : 'Symlink' }
}

function setupCopy() {
  const relative = path.relative(moduleDir, targetPath)
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
    fail(`COMPANION_DEV_PATH must be outside the module folder (${moduleDir}).`)
  }

  const existing = fs.lstatSync(targetPath, { throwIfNoEntry: false })
  if (existing?.isSymbolicLink()) {
    fs.unlinkSync(targetPath) // a link from an earlier setup: replace it with a copy
  } else if (existing) {
    if (!isOurCopy(existing)) fail(`${targetPath} exists and was not made by this script; remove it first.`)
    // Refresh: drop everything but node_modules, so npm install stays quick.
    for (const entry of fs.readdirSync(targetPath)) {
      if (entry === 'node_modules') continue
      fs.rmSync(path.join(targetPath, entry), { recursive: true, force: true })
    }
  }

  fs.mkdirSync(targetPath, { recursive: true })
  fs.cpSync(moduleDir, targetPath, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(moduleDir, src)
      if (!rel) return true
      const top = rel.split(path.sep)[0]
      return !SKIP_TOP_LEVEL.has(top) && !/\.tgz$/i.test(top)
    },
  })
  fs.writeFileSync(
    path.join(targetPath, MARKER),
    `Copied from ${moduleDir} by scripts/setup-dev.mjs. Re-run that script after changing the module.\n`,
  )
  return { installDir: targetPath, npmArgs: ['install', '--omit=dev', '--no-audit', '--no-fund'], label: 'Copy' }
}

function main() {
  const { installDir, npmArgs, label } = useLink ? setupLink() : setupCopy()

  const npm = runNpm(npmArgs, installDir)
  if (npm.error) console.error(npm.error.message)
  if (npm.status !== 0) fail('npm install failed')

  console.log('')
  console.log('Developer module ready:')
  console.log(`  ${label}: ${targetPath}${useLink ? ` -> ${moduleDir}` : ''}`)
  console.log('')
  console.log('In the Companion Launcher:')
  console.log('  1. Open the Companion Launcher (not the web UI)')
  console.log('  2. Click the cog icon -> Advanced')
  console.log(`  3. Developer modules path: ${devDir}`)
  console.log('  4. Restart Companion')
  console.log("  5. Add a 'ProVerlay' connection (Module Version: Dev)")
  console.log('')
  if (useLink) {
    console.log('Note: Companion 5 does not load a linked module (ERR_ACCESS_DENIED). Run without --link for a copy.')
  } else {
    console.log('This is a copy: run this script again after changing the module.')
  }
  console.log('')
}

try {
  main()
} catch (err) {
  if (!(err instanceof SetupError)) throw err
  console.error(err.message)
  process.exitCode = 1
}
