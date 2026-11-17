#!/usr/bin/env node
/**
 * Generates build/icon.ico (Windows app, installer and uninstaller icon) from
 * build/icon.png.
 *
 *   node scripts/generate-win-icon.mjs           # (re)write build/icon.ico
 *   node scripts/generate-win-icon.mjs --check   # exit 1 if build/icon.ico is out of date
 *
 * The .ico is committed so a Windows build does not depend on this script, but it
 * is reproducible: the output is a pure function of build/icon.png. Each size is
 * downscaled straight from the 1024 px source with an area-averaging filter on
 * premultiplied alpha (sharper small sizes than repeated bicubic steps, and no
 * dark fringes around transparent edges), then packed with png-to-ico (MIT).
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { PNG } from 'pngjs'
import { imagesToIco } from 'png-to-ico'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = path.join(root, 'build', 'icon.png')
const TARGET = path.join(root, 'build', 'icon.ico')

/** Sizes Windows picks from: Explorer, taskbar, Start menu, title bar, installer. */
export const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

/**
 * Area-averaging downscale of an RGBA image ({ width, height, data }) to size x size.
 * Every destination pixel is the coverage-weighted mean of the source pixels under
 * it; colour is averaged premultiplied by alpha.
 */
export function downscale(src, size) {
  const { width: sw, height: sh, data: s } = src
  const out = { width: size, height: size, data: Buffer.alloc(size * size * 4) }
  const fx = sw / size
  const fy = sh / size
  for (let y = 0; y < size; y++) {
    const y0 = y * fy
    const y1 = y0 + fy
    for (let x = 0; x < size; x++) {
      const x0 = x * fx
      const x1 = x0 + fx
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let area = 0
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
        const wy = Math.min(sy + 1, y1) - Math.max(sy, y0)
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
          const w = wy * (Math.min(sx + 1, x1) - Math.max(sx, x0))
          const i = (sy * sw + sx) * 4
          const alpha = s[i + 3] * w
          r += s[i] * alpha
          g += s[i + 1] * alpha
          b += s[i + 2] * alpha
          a += alpha
          area += w
        }
      }
      const o = (y * size + x) * 4
      if (a > 0) {
        out.data[o] = Math.round(r / a)
        out.data[o + 1] = Math.round(g / a)
        out.data[o + 2] = Math.round(b / a)
      }
      out.data[o + 3] = Math.round(a / area)
    }
  }
  return out
}

export function buildIco(pngBuffer) {
  const src = PNG.sync.read(pngBuffer)
  if (src.width !== src.height || src.width < 256) {
    throw new Error(`icon.png must be square and at least 256 px, got ${src.width}x${src.height}`)
  }
  // Largest first: some tools (and Windows' own picker) prefer the first big entry.
  const images = [...ICO_SIZES].reverse().map((size) => downscale(src, size))
  return imagesToIco(images)
}

/** Reads the image directory of an .ico buffer: [{ width, height, bpp, size, offset }]. */
export function readIcoDirectory(buf) {
  if (buf.length < 6 || buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) {
    throw new Error('not an .ico file')
  }
  const count = buf.readUInt16LE(4)
  const entries = []
  for (let i = 0; i < count; i++) {
    const o = 6 + i * 16
    entries.push({
      width: buf.readUInt8(o) || 256,
      height: buf.readUInt8(o + 1) || 256,
      bpp: buf.readUInt16LE(o + 6),
      size: buf.readUInt32LE(o + 8),
      offset: buf.readUInt32LE(o + 12)
    })
  }
  return entries
}

async function main() {
  const ico = buildIco(fs.readFileSync(SOURCE))
  const sizes = readIcoDirectory(ico).map((e) => e.width)
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(TARGET) ? fs.readFileSync(TARGET) : null
    if (!current || !current.equals(ico)) {
      console.error('generate-win-icon: build/icon.ico is out of date — run `npm run icon:win`')
      process.exit(1)
    }
    console.log(`generate-win-icon: build/icon.ico is up to date (${sizes.join(', ')} px)`)
    return
  }
  fs.writeFileSync(TARGET, ico)
  console.log(`generate-win-icon: wrote ${path.relative(root, TARGET)} (${sizes.join(', ')} px, ${ico.length} bytes)`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main()
}
