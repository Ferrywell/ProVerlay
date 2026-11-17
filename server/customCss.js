/**
 * Optional per-project stylesheet: `projects/<id>/custom.css`.
 *
 * Custom CSS is trusted local content: it is written by the operator on the
 * /project page and loaded by /render after the built-in stylesheets, so it
 * can restyle any overlay. The only rule enforced here is that it cannot
 * pull in other stylesheets through `@import` (no remote CSS on air); every
 * `@import` statement is removed on save and on import.
 */
import crypto from 'crypto'

/** Maximum size of a project's custom.css in bytes (UTF-8). */
export const CUSTOM_CSS_MAX_BYTES = 200 * 1024

export const CUSTOM_CSS_FILENAME = 'custom.css'

const IMPORT_NOTE = '/* @import removed: custom CSS cannot load other stylesheets */'

/** Decode CSS escapes in an identifier ("\69 mport" → "import"). */
function decodeCssIdent(raw) {
  return raw.replace(/\\([0-9a-fA-F]{1,6})\s?|\\(.)/g, (_m, hex, ch) => {
    if (hex) {
      const code = parseInt(hex, 16)
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '�'
    }
    return ch
  })
}

/** End index (exclusive) of the at-rule statement starting at `from`: after the next `;` outside strings/parens. */
function statementEnd(css, from) {
  let quote = null
  let depth = 0
  for (let i = from; i < css.length; i++) {
    const ch = css[i]
    if (ch === '\\') {
      i++
      continue
    }
    if (quote) {
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") quote = ch
    else if (ch === '(') depth++
    else if (ch === ')') depth = Math.max(0, depth - 1)
    else if (depth === 0 && (ch === ';' || ch === '{' || ch === '}')) return ch === ';' ? i + 1 : i
  }
  return css.length
}

const AT_KEYWORD_RE = /@((?:[a-zA-Z0-9_-]|\\[0-9a-fA-F]{1,6}\s?|\\[^\n0-9a-fA-F])+)/y

/**
 * Remove every `@import` statement (including escaped spellings such as
 * `@\69mport`). Comments and strings are skipped, so the note left behind
 * (and any "@import" inside a comment) is never touched again.
 * Returns { css, removedImports }.
 */
export function sanitizeCustomCss(input) {
  const css = String(input ?? '').replace(/\r\n?/g, '\n')
  let removedImports = 0
  let out = ''
  let last = 0
  let i = 0
  while (i < css.length) {
    const ch = css[i]
    if (ch === '/' && css[i + 1] === '*') {
      const close = css.indexOf('*/', i + 2)
      i = close === -1 ? css.length : close + 2
      continue
    }
    if (ch === '"' || ch === "'") {
      i++
      while (i < css.length && css[i] !== ch && css[i] !== '\n') i += css[i] === '\\' ? 2 : 1
      i++
      continue
    }
    if (ch === '\\') {
      i += 2
      continue
    }
    if (ch === '@') {
      AT_KEYWORD_RE.lastIndex = i
      const match = AT_KEYWORD_RE.exec(css)
      if (match && decodeCssIdent(match[1]).toLowerCase() === 'import') {
        const end = statementEnd(css, i + match[0].length)
        out += css.slice(last, i) + IMPORT_NOTE
        last = end
        i = end
        removedImports++
        continue
      }
      i += match ? match[0].length : 1
      continue
    }
    i++
  }
  return { css: out + css.slice(last), removedImports }
}

/** Short content hash used as `customCssVersion` (empty string = no custom CSS). */
export function customCssVersion(css) {
  if (!css) return ''
  return crypto.createHash('sha256').update(css).digest('hex').slice(0, 12)
}
