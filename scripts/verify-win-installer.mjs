#!/usr/bin/env node
/**
 * Verify the Windows installer (and optionally an unpacked or installed app folder)
 * before it is published. Pure Node, so it runs on Windows, macOS and Linux.
 *
 *   node scripts/verify-win-installer.mjs dist/ProVerlay-win-x64-setup.exe [--version 0.8.0]
 *     [--app-dir dist/win-unpacked] [--require-signed]
 *
 * Installer: exists, size within sane bounds, a valid PE file (MZ + PE headers),
 * an NSIS installer, version resource with ProductName "ProVerlay" and the expected
 * version. --app-dir checks an app folder (dist/win-unpacked, or the install folder in
 * the CI smoke test): ProVerlay.exe is a 64-bit PE with an icon and the right version,
 * and the server, templates and seed data are in place.
 * Authenticode presence is reported; --require-signed turns a missing signature into
 * a failure.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

export const MACHINE = { 0x14c: 'x86', 0x8664: 'x64', 0xaa64: 'arm64' }

const MIN_INSTALLER_BYTES = 40 * 1024 * 1024
const MAX_INSTALLER_BYTES = 400 * 1024 * 1024

const RT_ICON_GROUP = 14
const RT_VERSION = 16

class VerifyError extends Error {}

function fail(message) {
  throw new VerifyError(message)
}

/** Reads `length` bytes at `position` from a file (or a Buffer, for tests). */
function readAt(source, position, length) {
  if (Buffer.isBuffer(source)) return source.subarray(position, position + length)
  const buf = Buffer.alloc(length)
  const fd = fs.openSync(source, 'r')
  try {
    const n = fs.readSync(fd, buf, 0, length, position)
    return buf.subarray(0, n)
  } finally {
    fs.closeSync(fd)
  }
}

/**
 * Parses the DOS + PE/COFF headers of a file or Buffer. Only the headers and the
 * resource section are read, so a 100 MB installer is not loaded into memory.
 */
export function parsePe(source) {
  const dos = readAt(source, 0, 64)
  if (dos.length < 64 || dos.toString('latin1', 0, 2) !== 'MZ') fail('not a PE file (no MZ header)')
  const peOffset = dos.readUInt32LE(0x3c)
  const head = readAt(source, peOffset, 24)
  if (head.length < 24 || head.toString('latin1', 0, 4) !== 'PE\0\0') fail('not a PE file (no PE signature)')
  const machine = head.readUInt16LE(4)
  const sectionCount = head.readUInt16LE(6)
  const optionalSize = head.readUInt16LE(20)
  const characteristics = head.readUInt16LE(22)
  const opt = readAt(source, peOffset + 24, optionalSize)
  const magic = opt.readUInt16LE(0)
  if (magic !== 0x10b && magic !== 0x20b) fail(`unknown optional header magic 0x${magic.toString(16)}`)
  const pe32plus = magic === 0x20b
  const subsystem = opt.readUInt16LE(68)
  const dirBase = pe32plus ? 112 : 96
  const dirCount = opt.readUInt32LE(dirBase - 4)
  const dataDir = (i) =>
    i < dirCount ? { rva: opt.readUInt32LE(dirBase + i * 8), size: opt.readUInt32LE(dirBase + i * 8 + 4) } : { rva: 0, size: 0 }
  const sectionTable = readAt(source, peOffset + 24 + optionalSize, sectionCount * 40)
  const sections = []
  for (let i = 0; i < sectionCount; i++) {
    const o = i * 40
    sections.push({
      name: sectionTable.toString('latin1', o, o + 8).replace(/\0+$/, ''),
      virtualSize: sectionTable.readUInt32LE(o + 8),
      virtualAddress: sectionTable.readUInt32LE(o + 12),
      rawSize: sectionTable.readUInt32LE(o + 16),
      rawPointer: sectionTable.readUInt32LE(o + 20)
    })
  }
  const imageEnd = Math.max(0, ...sections.map((s) => s.rawPointer + s.rawSize))
  return {
    machine,
    arch: MACHINE[machine] || `0x${machine.toString(16)}`,
    pe32plus,
    dll: Boolean(characteristics & 0x2000),
    subsystem: subsystem === 2 ? 'gui' : subsystem === 3 ? 'console' : String(subsystem),
    sections,
    imageEnd,
    resources: dataDir(2),
    // The security directory holds a file offset (not an RVA) to the Authenticode blob.
    signature: dataDir(4)
  }
}

function rvaToOffset(pe, rva) {
  for (const s of pe.sections) {
    if (rva >= s.virtualAddress && rva < s.virtualAddress + Math.max(s.virtualSize, s.rawSize)) {
      return s.rawPointer + (rva - s.virtualAddress)
    }
  }
  return -1
}

/** Returns the resource section as { buf, rva } (buf starts at the resource directory). */
function readResourceSection(source, pe) {
  if (!pe.resources.rva) return null
  const section = pe.sections.find(
    (s) => pe.resources.rva >= s.virtualAddress && pe.resources.rva < s.virtualAddress + Math.max(s.virtualSize, s.rawSize)
  )
  if (!section) return null
  const start = rvaToOffset(pe, pe.resources.rva)
  const length = section.rawSize - (pe.resources.rva - section.virtualAddress)
  return { buf: readAt(source, start, length), rva: pe.resources.rva }
}

/** Lists the data entries of one resource type: [{ id, lang, rva, size }]. */
function resourceEntries(rsrc, typeId) {
  const { buf } = rsrc
  const dirEntries = (off) => {
    const named = buf.readUInt16LE(off + 12)
    const ids = buf.readUInt16LE(off + 14)
    const list = []
    for (let i = 0; i < named + ids; i++) {
      const e = off + 16 + i * 8
      const name = buf.readUInt32LE(e)
      const target = buf.readUInt32LE(e + 4)
      list.push({ id: name & 0x80000000 ? null : name, isDir: Boolean(target & 0x80000000), off: target & 0x7fffffff })
    }
    return list
  }
  const out = []
  const type = dirEntries(0).find((e) => e.id === typeId && e.isDir)
  if (!type) return out
  for (const name of dirEntries(type.off)) {
    const langs = name.isDir ? dirEntries(name.off) : [{ ...name, id: 0 }]
    for (const lang of langs) {
      if (lang.isDir) continue
      out.push({ id: name.id, lang: lang.id, rva: buf.readUInt32LE(lang.off), size: buf.readUInt32LE(lang.off + 4) })
    }
  }
  return out
}

function resourceData(rsrc, entry) {
  const off = entry.rva - rsrc.rva
  return rsrc.buf.subarray(off, off + entry.size)
}

/**
 * Parses a VS_VERSIONINFO blob: { fileVersion, productVersion, strings: { ProductName, … } }.
 */
export function parseVersionInfo(buf) {
  const align = (n) => (n + 3) & ~3
  const readKey = (off) => {
    let end = off
    while (end + 1 < buf.length && buf.readUInt16LE(end) !== 0) end += 2
    return { key: buf.toString('utf16le', off, end), next: end + 2 }
  }
  const block = (off) => {
    const length = buf.readUInt16LE(off)
    const valueLength = buf.readUInt16LE(off + 2)
    const type = buf.readUInt16LE(off + 4)
    const { key, next } = readKey(off + 6)
    const valueOff = align(next)
    const valueBytes = type === 1 ? valueLength * 2 : valueLength
    const children = []
    let child = align(valueOff + valueBytes)
    while (child < off + length && child + 6 <= buf.length) {
      const c = block(child)
      if (!c.length) break
      children.push(c)
      child = align(child + c.length)
    }
    return { length, type, key, valueOff, valueBytes, children }
  }
  const root = block(0)
  if (root.key !== 'VS_VERSION_INFO') fail('version resource is not VS_VERSION_INFO')
  const result = { fileVersion: null, productVersion: null, strings: {} }
  if (root.valueBytes >= 52 && buf.readUInt32LE(root.valueOff) === 0xfeef04bd) {
    const v = (ms, ls) => [ms >>> 16, ms & 0xffff, ls >>> 16, ls & 0xffff].join('.')
    const f = root.valueOff
    result.fileVersion = v(buf.readUInt32LE(f + 8), buf.readUInt32LE(f + 12))
    result.productVersion = v(buf.readUInt32LE(f + 16), buf.readUInt32LE(f + 20))
  }
  for (const info of root.children.filter((c) => c.key === 'StringFileInfo')) {
    for (const table of info.children) {
      for (const s of table.children) {
        result.strings[s.key] = buf
          .toString('utf16le', s.valueOff, s.valueOff + s.valueBytes)
          .replace(/\0+$/, '')
      }
    }
  }
  return result
}

/** Pixel sizes listed in a GRPICONDIR (RT_GROUP_ICON) resource. */
export function parseIconGroup(buf) {
  const count = buf.readUInt16LE(4)
  const sizes = []
  for (let i = 0; i < count; i++) sizes.push(buf.readUInt8(6 + i * 14) || 256)
  return sizes.sort((a, b) => a - b)
}

/** PE headers + version info + icon count + signature presence of an .exe. */
export function inspectExe(source) {
  const pe = parsePe(source)
  const rsrc = readResourceSection(source, pe)
  let version = null
  let iconGroups = 0
  let iconSizes = []
  if (rsrc) {
    const [entry] = resourceEntries(rsrc, RT_VERSION)
    if (entry) version = parseVersionInfo(resourceData(rsrc, entry))
    const groups = resourceEntries(rsrc, RT_ICON_GROUP)
    iconGroups = groups.length
    if (groups.length) iconSizes = parseIconGroup(resourceData(rsrc, groups[0]))
  }
  return { ...pe, version, iconGroups, iconSizes, signed: pe.signature.rva > 0 && pe.signature.size > 0 }
}

/** "0.8.0" matches "0.8.0", "0.8.0.0"; "0.8.0-beta.1" matches "0.8.0-beta.1" and "0.8.0.0". */
export function versionMatches(actual, expected) {
  if (!actual) return false
  if (actual === expected) return true
  const numeric = expected.split('-')[0]
  return actual === `${numeric}.0` || actual === numeric
}

function checkVersion(label, info, expected) {
  if (!info.version) fail(`${label}: no version resource`)
  const { productVersion, fileVersion, strings } = info.version
  const candidates = [strings.ProductVersion, strings.FileVersion, productVersion, fileVersion]
  if (!candidates.some((v) => versionMatches(v, expected))) {
    fail(`${label}: version ${JSON.stringify(candidates)} does not match ${expected}`)
  }
}

export function verifyInstaller(file, { version, requireSigned = false } = {}) {
  if (!fs.existsSync(file)) fail(`${file} not found`)
  const { size } = fs.statSync(file)
  if (size < MIN_INSTALLER_BYTES || size > MAX_INSTALLER_BYTES) {
    fail(`${file} is ${size} bytes, expected ${MIN_INSTALLER_BYTES}–${MAX_INSTALLER_BYTES}`)
  }
  const info = inspectExe(file)
  if (info.dll) fail('installer is a DLL')
  if (info.subsystem !== 'gui') fail(`installer subsystem is ${info.subsystem}, expected gui`)
  // NSIS appends its compressed payload after the PE image and puts its marker there.
  const marker = readAt(file, info.imageEnd, 512 * 1024)
  if (!marker.includes(Buffer.from('NullsoftInst', 'latin1'))) fail('no NSIS payload found after the PE image')
  const name = info.version?.strings.ProductName
  if (name !== 'ProVerlay') fail(`installer ProductName is ${JSON.stringify(name)}, expected "ProVerlay"`)
  if (version) checkVersion('installer', info, version)
  if (requireSigned && !info.signed) fail('installer is not Authenticode-signed')
  return { size, ...info }
}

export function verifyAppDir(dir, { version, requireSigned = false } = {}) {
  const exe = path.join(dir, 'ProVerlay.exe')
  if (!fs.existsSync(exe)) fail(`${exe} not found`)
  const info = inspectExe(exe)
  if (info.arch !== 'x64' || !info.pe32plus) fail(`ProVerlay.exe is ${info.arch}, expected x64`)
  if (info.subsystem !== 'gui') fail(`ProVerlay.exe subsystem is ${info.subsystem}, expected gui`)
  if (info.iconGroups < 1) fail('ProVerlay.exe has no icon resource')
  // build/icon.ico has 16–256 px; Electron's stock icon would not match this list.
  const expectedSizes = [16, 24, 32, 48, 64, 128, 256]
  if (info.iconSizes.join() !== expectedSizes.join()) {
    fail(`ProVerlay.exe icon sizes ${info.iconSizes.join(', ')}; expected build/icon.ico (${expectedSizes.join(', ')})`)
  }
  if (version) checkVersion('ProVerlay.exe', info, version)
  if (requireSigned && !info.signed) fail('ProVerlay.exe is not Authenticode-signed')
  const required = [
    'resources/app/package.json',
    'resources/app/electron/main.js',
    'resources/app/server/index.js',
    'resources/app/public/render/index.html',
    'resources/app/templates',
    'resources/app/node_modules/express/package.json',
    'resources/seed-data/registry.json'
  ]
  for (const rel of required) {
    if (!fs.existsSync(path.join(dir, ...rel.split('/')))) fail(`${rel} missing in ${dir}`)
  }
  if (version) {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'resources', 'app', 'package.json'), 'utf8'))
    if (pkg.version !== version) fail(`resources/app/package.json version ${pkg.version}, expected ${version}`)
  }
  for (const devOnly of ['electron', 'electron-builder', 'png-to-ico']) {
    if (fs.existsSync(path.join(dir, 'resources', 'app', 'node_modules', devOnly))) {
      fail(`dev dependency ${devOnly} is bundled in resources/app/node_modules`)
    }
  }
  return info
}

function parseArgs(argv) {
  const opts = { file: null, version: null, appDir: null, requireSigned: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--version') opts.version = argv[++i]
    else if (a === '--app-dir') opts.appDir = argv[++i]
    else if (a === '--require-signed') opts.requireSigned = true
    else if (!a.startsWith('--') && !opts.file) opts.file = a
    else fail(`unknown argument ${a}`)
  }
  return opts
}

const describe = (info) =>
  `${info.arch}, ${info.version?.strings.ProductVersion || info.version?.productVersion || '?'}, ` +
  `${info.signed ? 'Authenticode-signed' : 'unsigned'}`

function main() {
  try {
    const opts = parseArgs(process.argv.slice(2))
    if (!opts.file && !opts.appDir) {
      fail('usage: verify-win-installer.mjs <setup.exe> [--version X.Y.Z] [--app-dir <dir>] [--require-signed]')
    }
    if (opts.file) {
      const info = verifyInstaller(opts.file, opts)
      const mb = (info.size / 1024 / 1024).toFixed(1)
      console.log(`verify-win-installer: OK — ${opts.file} (NSIS, ${describe(info)}, ${mb} MB)`)
      if (info.version) console.log(`  version info: ${JSON.stringify(info.version.strings)}`)
    }
    if (opts.appDir) {
      const info = verifyAppDir(opts.appDir, opts)
      console.log(`verify-win-installer: OK — ${path.join(opts.appDir, 'ProVerlay.exe')} (${describe(info)}, icon ${info.iconSizes.join('/')} px)`)
    }
  } catch (err) {
    if (!(err instanceof VerifyError)) throw err
    console.error(`verify-win-installer: FAIL — ${err.message}`)
    process.exit(1)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
