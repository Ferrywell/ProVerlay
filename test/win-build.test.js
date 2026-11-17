import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { buildIco, readIcoDirectory, downscale, ICO_SIZES } from '../scripts/generate-win-icon.mjs'
import {
  parsePe,
  parseVersionInfo,
  parseIconGroup,
  inspectExe,
  versionMatches
} from '../scripts/verify-win-installer.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

// ── build/icon.ico ────────────────────────────────────────────────────────────

test('build/icon.ico is up to date with build/icon.png (npm run icon:win)', () => {
  const expected = buildIco(fs.readFileSync(path.join(root, 'build', 'icon.png')))
  const committed = fs.readFileSync(path.join(root, 'build', 'icon.ico'))
  assert.ok(committed.equals(expected), 'build/icon.ico differs from a fresh build — run `npm run icon:win`')
})

test('build/icon.ico holds every Windows size from 16 to 256 px, 32-bit', () => {
  const dir = readIcoDirectory(fs.readFileSync(path.join(root, 'build', 'icon.ico')))
  assert.deepEqual(
    dir.map((e) => e.width).sort((a, b) => a - b),
    ICO_SIZES
  )
  for (const e of dir) {
    assert.equal(e.width, e.height)
    assert.equal(e.bpp, 32)
  }
})

test('downscale averages coverage and keeps transparent edges free of dark fringes', () => {
  // 2x2 → 1x1: one opaque red pixel, three fully transparent black pixels.
  const src = { width: 2, height: 2, data: Buffer.from([255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) }
  const out = downscale(src, 1)
  assert.deepEqual([...out.data], [255, 0, 0, 64])
})

// ── PE / version-resource parsing ─────────────────────────────────────────────

function utf16z(s) {
  return Buffer.from(s + '\0', 'utf16le')
}

function pad4(buf) {
  return buf.length % 4 ? Buffer.concat([buf, Buffer.alloc(4 - (buf.length % 4))]) : buf
}

/** One VS_VERSIONINFO-style block (wLength, wValueLength, wType, key, value, children). */
function vsBlock(key, { value = Buffer.alloc(0), text = false, children = [] } = {}) {
  const head = pad4(Buffer.concat([Buffer.alloc(6), utf16z(key)]))
  const body = Buffer.concat([head, pad4(value), ...children.map(pad4)])
  // wLength excludes the padding after the last child
  const last = children.at(-1)
  const length = last ? body.length - (pad4(last).length - last.length) : head.length + value.length
  body.writeUInt16LE(length, 0)
  body.writeUInt16LE(text ? value.length / 2 : value.length, 2)
  body.writeUInt16LE(text ? 1 : 0, 4)
  return body.subarray(0, length)
}

function versionInfo(version, strings) {
  const fixed = Buffer.alloc(52)
  const [a, b, c] = version.split('.').map(Number)
  fixed.writeUInt32LE(0xfeef04bd, 0)
  fixed.writeUInt32LE(0x10000, 4)
  for (const off of [8, 16]) {
    fixed.writeUInt32LE(((a << 16) | b) >>> 0, off)
    fixed.writeUInt32LE((c << 16) >>> 0, off + 4)
  }
  const table = vsBlock('040904b0', {
    children: Object.entries(strings).map(([k, v]) => vsBlock(k, { value: utf16z(v), text: true }))
  })
  return vsBlock('VS_VERSION_INFO', { value: fixed, children: [vsBlock('StringFileInfo', { children: [table] })] })
}

/**
 * A minimal PE32+ image with one .rsrc section holding RT_VERSION and RT_GROUP_ICON,
 * optionally followed by appended data (like an NSIS payload).
 */
function fakeExe({ machine = 0x8664, version = '1.2.3', strings = {}, iconSizes = [16, 256], appended } = {}) {
  const SECTION_RVA = 0x1000
  const FILE_ALIGN = 0x200
  const resources = [
    [16, versionInfo(version, strings)],
    [14, Buffer.concat([Buffer.from([0, 0, 1, 0, iconSizes.length, 0]), ...iconSizes.map((s) => Buffer.from([s & 0xff, s & 0xff, 0, 0, 1, 0, 32, 0, 0, 0, 0, 0, 1, 0]))])]
  ]
  // Layout: root dir (n type entries) → per type: name dir (1) → lang dir (1) → data entry; then data.
  const dirSize = (n) => 16 + n * 8
  let off = dirSize(resources.length)
  const typeDirs = resources.map(() => {
    const nameDir = off
    off += dirSize(1)
    const langDir = off
    off += dirSize(1)
    const dataEntry = off
    off += 16
    return { nameDir, langDir, dataEntry }
  })
  const dataOffsets = resources.map(([, data]) => {
    const at = off
    off += pad4(data).length
    return at
  })
  const rsrc = Buffer.alloc(off)
  const writeDir = (at, entries) => {
    rsrc.writeUInt16LE(entries.length, at + 14)
    entries.forEach(([id, target], i) => {
      rsrc.writeUInt32LE(id, at + 16 + i * 8)
      rsrc.writeUInt32LE(target >>> 0, at + 20 + i * 8)
    })
  }
  writeDir(0, resources.map(([type], i) => [type, 0x80000000 | typeDirs[i].nameDir]))
  resources.forEach(([, data], i) => {
    const t = typeDirs[i]
    writeDir(t.nameDir, [[1, 0x80000000 | t.langDir]])
    writeDir(t.langDir, [[1033, t.dataEntry]])
    rsrc.writeUInt32LE(SECTION_RVA + dataOffsets[i], t.dataEntry)
    rsrc.writeUInt32LE(data.length, t.dataEntry + 4)
    data.copy(rsrc, dataOffsets[i])
  })

  const peOffset = 0x80
  const optSize = 240
  const header = Buffer.alloc(FILE_ALIGN)
  header.write('MZ', 0, 'latin1')
  header.writeUInt32LE(peOffset, 0x3c)
  header.write('PE\0\0', peOffset, 'latin1')
  header.writeUInt16LE(machine, peOffset + 4)
  header.writeUInt16LE(1, peOffset + 6)
  header.writeUInt16LE(optSize, peOffset + 20)
  header.writeUInt16LE(0x0022, peOffset + 22)
  const opt = peOffset + 24
  header.writeUInt16LE(0x20b, opt)
  header.writeUInt16LE(2, opt + 68)
  header.writeUInt32LE(16, opt + 108)
  header.writeUInt32LE(SECTION_RVA, opt + 112 + 2 * 8)
  header.writeUInt32LE(rsrc.length, opt + 112 + 2 * 8 + 4)
  const sect = opt + optSize
  header.write('.rsrc', sect, 'latin1')
  const raw = Math.ceil(rsrc.length / FILE_ALIGN) * FILE_ALIGN
  header.writeUInt32LE(rsrc.length, sect + 8)
  header.writeUInt32LE(SECTION_RVA, sect + 12)
  header.writeUInt32LE(raw, sect + 16)
  header.writeUInt32LE(FILE_ALIGN, sect + 20)
  const body = Buffer.alloc(raw)
  rsrc.copy(body)
  return Buffer.concat([header, body, appended || Buffer.alloc(0)])
}

test('parsePe reads machine, PE32+ and the end of the PE image', () => {
  const exe = fakeExe({ appended: Buffer.from('payload') })
  const pe = parsePe(exe)
  assert.equal(pe.arch, 'x64')
  assert.equal(pe.pe32plus, true)
  assert.equal(pe.subsystem, 'gui')
  assert.equal(pe.imageEnd, exe.length - 'payload'.length)
  assert.equal(parsePe(fakeExe({ machine: 0x14c })).arch, 'x86')
})

test('parsePe rejects files that are not PE images', () => {
  assert.throws(() => parsePe(Buffer.alloc(128)), /no MZ header/)
  const noPe = fakeExe()
  noPe.write('XX', 0x80, 'latin1')
  assert.throws(() => parsePe(noPe), /no PE signature/)
})

test('inspectExe reads the version resource, icon sizes and signature state', () => {
  const info = inspectExe(
    fakeExe({
      version: '0.8.0',
      strings: { ProductName: 'ProVerlay', ProductVersion: '0.8.0', CompanyName: 'ProductionPro' },
      iconSizes: [256, 16, 32]
    })
  )
  assert.equal(info.version.fileVersion, '0.8.0.0')
  assert.equal(info.version.productVersion, '0.8.0.0')
  assert.deepEqual(info.version.strings, { ProductName: 'ProVerlay', ProductVersion: '0.8.0', CompanyName: 'ProductionPro' })
  assert.deepEqual(info.iconSizes, [16, 32, 256])
  assert.equal(info.signed, false)
})

test('parseVersionInfo rejects a blob that is not VS_VERSION_INFO', () => {
  assert.throws(() => parseVersionInfo(vsBlock('Something')), /not VS_VERSION_INFO/)
})

test('parseIconGroup lists sizes, treating 0 as 256', () => {
  assert.deepEqual(parseIconGroup(Buffer.from([0, 0, 1, 0, 2, 0, 0, 0, 0, 0, 1, 0, 32, 0, 0, 0, 0, 0, 1, 0, 48, 48, 0, 0, 1, 0, 32, 0, 0, 0, 0, 0, 2, 0])), [48, 256])
})

test('versionMatches accepts the 4-part Windows form of a version', () => {
  assert.ok(versionMatches('0.8.0', '0.8.0'))
  assert.ok(versionMatches('0.8.0.0', '0.8.0'))
  assert.ok(versionMatches('0.8.0.0', '0.8.0-beta.1'))
  assert.ok(versionMatches('0.8.0-beta.1', '0.8.0-beta.1'))
  assert.ok(!versionMatches('0.8.1.0', '0.8.0'))
  assert.ok(!versionMatches(null, '0.8.0'))
})

// ── build/installer.nsh ───────────────────────────────────────────────────────

test('uninstaller removes the start-at-login Run entry, except during updates', () => {
  const nsh = fs.readFileSync(path.join(root, 'build', 'installer.nsh'), 'utf8')
  const yml = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8')
  const appId = yml.match(/^appId:\s*(\S+)/m)[1]
  // app.setLoginItemSettings() names the Run value after the AppUserModelId (= appId).
  assert.match(nsh, /!macro customUnInstall\b/)
  assert.match(nsh, /\$\{ifNot\} \$\{isUpdated\}/)
  assert.ok(
    nsh.includes(`DeleteRegValue HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Run" "${appId}"`),
    `installer.nsh must delete the Run value named after appId ${appId}`
  )
})
