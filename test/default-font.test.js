import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BLANK_PROJECT } from '../server/projectSeed.js'
import { DEFAULT_BRAND_FONT, resolveElementFontFamily } from '../public/shared/project-fonts.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const FONTS = path.join(ROOT, 'public', 'shared', 'fonts')

test('new projects and the demo preset default to the bundled Inter font', async () => {
  assert.equal(BLANK_PROJECT.brand.fontFamily, DEFAULT_BRAND_FONT)
  assert.match(DEFAULT_BRAND_FONT, /^'Inter',/)
  const demo = JSON.parse(await fs.readFile(path.join(ROOT, 'templates', 'brands', 'demo-club.json'), 'utf8'))
  assert.equal(demo.fontFamily, DEFAULT_BRAND_FONT)
})

test('elements without a font fall back to the brand font, then Inter', () => {
  assert.equal(resolveElementFontFamily({}, ''), DEFAULT_BRAND_FONT)
  assert.equal(resolveElementFontFamily({}, "'Club Sans', sans-serif"), "'Club Sans', sans-serif")
  assert.equal(resolveElementFontFamily({ fontFamily: 'Arial' }, DEFAULT_BRAND_FONT), 'Arial')
})

test('bundled Inter: @font-face points at a woff2 that ships with its OFL license', async () => {
  const css = await fs.readFile(path.join(FONTS, 'inter.css'), 'utf8')
  assert.match(css, /font-family:\s*'Inter'/)
  const src = css.match(/url\('([^']+\.woff2)'\)/)?.[1]
  assert.ok(src, 'inter.css has a woff2 src')
  const woff2 = await fs.readFile(path.join(FONTS, src))
  assert.equal(woff2.subarray(0, 4).toString('latin1'), 'wOF2')
  const ofl = await fs.readFile(path.join(FONTS, 'OFL.txt'), 'utf8')
  assert.match(ofl, /SIL OPEN FONT LICENSE Version 1\.1/)
  for (const page of ['render', 'editor']) {
    const html = await fs.readFile(path.join(ROOT, 'public', page, 'index.html'), 'utf8')
    assert.match(html, /\/public\/shared\/fonts\/inter\.css/, `${page} links inter.css`)
  }
})
