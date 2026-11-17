#!/usr/bin/env node
/**
 * Prints the CHANGELOG.md section for one version, for use as GitHub release notes.
 *
 *   node scripts/changelog-section.mjs 0.7.0
 *   node scripts/changelog-section.mjs v0.7.0 --file CHANGELOG.md \
 *     --link-base https://github.com/Ferrywell/ProVerlay/blob/v0.7.0/
 *
 * Matches "## [0.7.0] - date" as well as "## 0.7.0 - date" (a leading "v" on the
 * version or in the heading is ignored). The section runs until the next "## "
 * heading. Link reference definitions ("[0.7.0]: https://…") are dropped from the
 * body; when the version has one, a "Full changelog" link is appended instead.
 * With --link-base, relative Markdown links are made absolute so they work on the
 * release page.
 *
 * Exits 1 (with a message on stderr) when the version has no section or an empty one.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

const HEADING = /^##\s+(.*)$/
const LINK_DEF = /^\s{0,3}\[([^\]]+)\]:\s*(\S+)/

function normalizeVersion(version) {
  return String(version ?? '').trim().replace(/^v/i, '')
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** True when a level-2 heading text ("[0.7.0] - 2026-11-17") is for `version`. */
function headingMatches(headingText, version) {
  const re = new RegExp(`^\\[?v?${escapeRegExp(version)}\\]?(?=$|[\\s(])`, 'i')
  return re.test(headingText.trim())
}

/** Rewrites relative Markdown link/image targets against `base` (absolute URLs and anchors are left alone). */
export function absolutizeLinks(markdown, base) {
  if (!base) return markdown
  const root = base.endsWith('/') ? base : `${base}/`
  return markdown.replace(/(\]\()([^)\s]+)(\s+"[^"]*")?\)/g, (match, open, target, title = '') => {
    if (/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(target)) return match
    const clean = target.replace(/^\.\//, '').replace(/^\//, '')
    return `${open}${root}${clean}${title})`
  })
}

/**
 * Returns the body of the CHANGELOG section for `version` (without its heading),
 * or null when there is no such section or it is empty.
 */
export function extractSection(markdown, version, { linkBase } = {}) {
  const wanted = normalizeVersion(version)
  if (!wanted) throw new Error('version is required')

  const lines = String(markdown).replace(/\r\n?/g, '\n').split('\n')
  const start = lines.findIndex((line) => {
    const m = line.match(HEADING)
    return m && headingMatches(m[1], wanted)
  })
  if (start === -1) return null

  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (HEADING.test(lines[i])) {
      end = i
      break
    }
  }

  const body = lines
    .slice(start + 1, end)
    .filter((line) => !LINK_DEF.test(line))
    .join('\n')
    .trim()
  if (!body) return null

  let compareUrl = null
  for (const line of lines) {
    const m = line.match(LINK_DEF)
    if (m && normalizeVersion(m[1]) === wanted) compareUrl = m[2]
  }

  let out = absolutizeLinks(body, linkBase)
  if (compareUrl) out += `\n\n**Full changelog:** ${compareUrl}`
  return `${out}\n`
}

function parseArgs(argv) {
  const opts = { file: null, linkBase: null, version: null }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--file') opts.file = argv[++i]
    else if (arg === '--link-base') opts.linkBase = argv[++i]
    else if (arg === '-h' || arg === '--help') opts.help = true
    else if (!opts.version) opts.version = arg
    else throw new Error(`unexpected argument: ${arg}`)
  }
  return opts
}

function main() {
  const usage = 'Usage: node scripts/changelog-section.mjs <version> [--file CHANGELOG.md] [--link-base <url>]'
  let opts
  try {
    opts = parseArgs(process.argv.slice(2))
  } catch (err) {
    console.error(`changelog-section: ${err.message}\n${usage}`)
    process.exit(2)
  }
  if (opts.help || !opts.version) {
    console.error(usage)
    process.exit(opts.help ? 0 : 2)
  }

  const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
  const file = path.resolve(opts.file || path.join(repoRoot, 'CHANGELOG.md'))
  const section = extractSection(fs.readFileSync(file, 'utf8'), opts.version, { linkBase: opts.linkBase })
  if (!section) {
    console.error(`changelog-section: no (non-empty) section for ${normalizeVersion(opts.version)} in ${file}`)
    process.exit(1)
  }
  process.stdout.write(section)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main()
}
