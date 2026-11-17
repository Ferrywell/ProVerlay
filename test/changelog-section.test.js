import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { extractSection, absolutizeLinks } from '../scripts/changelog-section.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const script = path.join(root, 'scripts', 'changelog-section.mjs')

const SAMPLE = `# Changelog

Intro text.

## [Unreleased]

## [1.2.0] - 2026-12-01

First line.

### Added

- Thing one, see [the guide](docs/USER-GUIDE.md).
- Thing two ([#12](https://github.com/example/repo/pull/12)).

## [1.2.0-beta.1] - 2026-11-20

### Added

- Beta thing.

## 1.1.5 - 2026-11-01 (untagged)

- Patch note.

## [1.1.0] - 2026-10-01

### Fixed

- Old fix.

[Unreleased]: https://github.com/example/repo/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/example/repo/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/example/repo/commit/abc1234
`

test('extractSection returns the body of a bracketed version heading', () => {
  const out = extractSection(SAMPLE, '1.2.0')
  assert.ok(out.startsWith('First line.\n\n### Added'))
  assert.ok(out.includes('- Thing two'))
  assert.ok(!out.includes('## [1.2.0]'), 'heading is not included')
  assert.ok(!out.includes('Beta thing'), 'stops at the next version')
  assert.ok(out.endsWith('**Full changelog:** https://github.com/example/repo/compare/v1.1.0...v1.2.0\n'))
})

test('extractSection accepts a leading v and does not match prereleases by prefix', () => {
  assert.equal(extractSection(SAMPLE, 'v1.2.0'), extractSection(SAMPLE, '1.2.0'))
  const beta = extractSection(SAMPLE, '1.2.0-beta.1')
  assert.equal(beta, '### Added\n\n- Beta thing.\n')
})

test('extractSection handles unbracketed headings with trailing text', () => {
  assert.equal(extractSection(SAMPLE, '1.1.5'), '- Patch note.\n')
})

test('extractSection drops link reference definitions from the last section', () => {
  const out = extractSection(SAMPLE, '1.1.0')
  assert.ok(out.startsWith('### Fixed\n\n- Old fix.'))
  assert.ok(!out.includes('[Unreleased]:'))
  assert.ok(out.endsWith('**Full changelog:** https://github.com/example/repo/commit/abc1234\n'))
})

test('extractSection returns null for missing or empty sections', () => {
  assert.equal(extractSection(SAMPLE, '9.9.9'), null)
  assert.equal(extractSection(SAMPLE, '1.1'), null, 'no partial version match')
  assert.equal(extractSection(SAMPLE, 'Unreleased'), null, 'empty section')
  assert.throws(() => extractSection(SAMPLE, ''))
})

test('extractSection normalises CRLF line endings', () => {
  const out = extractSection(SAMPLE.replace(/\n/g, '\r\n'), '1.1.5')
  assert.equal(out, '- Patch note.\n')
})

test('absolutizeLinks rewrites only relative link targets', () => {
  const base = 'https://github.com/example/repo/blob/v1.2.0'
  const md = '[a](docs/A.md) [b](./B.md) [c](https://x.test/c) [d](#anchor) ![i](site/i.png "Title") [e](mailto:x@y.test)'
  assert.equal(
    absolutizeLinks(md, base),
    '[a](https://github.com/example/repo/blob/v1.2.0/docs/A.md) ' +
      '[b](https://github.com/example/repo/blob/v1.2.0/B.md) [c](https://x.test/c) [d](#anchor) ' +
      '![i](https://github.com/example/repo/blob/v1.2.0/site/i.png "Title") [e](mailto:x@y.test)'
  )
  assert.equal(absolutizeLinks(md, null), md)
})

test('CLI prints the section and fails for an unknown version', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-changelog-'))
  try {
    const file = path.join(dir, 'CHANGELOG.md')
    fs.writeFileSync(file, SAMPLE)
    const out = execFileSync(
      process.execPath,
      [script, 'v1.2.0', '--file', file, '--link-base', 'https://github.com/example/repo/blob/v1.2.0/'],
      { encoding: 'utf8' }
    )
    assert.ok(out.includes('[the guide](https://github.com/example/repo/blob/v1.2.0/docs/USER-GUIDE.md)'))

    const missing = spawnSync(process.execPath, [script, '9.9.9', '--file', file], { encoding: 'utf8' })
    assert.equal(missing.status, 1)
    assert.equal(missing.stdout, '')
    assert.match(missing.stderr, /no \(non-empty\) section for 9\.9\.9/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('the current package.json version has a CHANGELOG section', () => {
  const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const section = extractSection(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'), version)
  assert.ok(section, `CHANGELOG.md has no section for ${version}`)
})
