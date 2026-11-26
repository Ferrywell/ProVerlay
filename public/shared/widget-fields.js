/**
 * Field descriptions: say once what the fields of a widget are, and derive the
 * rest from that. Shared by the server and the pages, so pure functions only
 * (no DOM, no imports).
 *
 * A field is a plain object:
 *
 *   { key: 'title', kind: 'text', label: 'Title', default: '', maxLength: 80 }
 *
 *   kind        control            value        limits
 *   text        one-line input     string       maxLength
 *   multiline   textarea           string       maxLength
 *   number      number input       number       min, max, step, integer
 *   boolean     on/off button      boolean
 *   choice      select             one option   options: [{ value, label }] (or plain values)
 *   color       colour picker      CSS colour   (the picker edits #rrggbb)
 *
 *   Optional on every field:
 *   description   hint shown as a tooltip
 *   live          save while typing (debounced) instead of when the field is left
 *   lenient       text kinds only: numbers, booleans and null are also accepted
 *                 and stored as sent. For fields the API never checked before
 *                 they were described; the render shows such values as text.
 *
 * From a list of fields:
 *
 *   defineFields()        check a hand-written list once, at module load
 *   fieldDefaults()       default `data` for a new widget
 *   validateFieldData()   check a (partial) `data` object: the server-side validation
 *   coerceFieldInput()    text from a form control -> a value of the field's kind
 *   fieldDisplayValue()   stored value -> what the control shows
 *   fieldsHtml()          the form controls (operate-card markup); fieldControlsHtml() without the cell
 *
 * `data` may hold more keys than the list describes (position, layout, lists…).
 * Those are never touched here: a card or validator with its own code for them
 * keeps working next to the described fields.
 */

export const FIELD_KINDS = Object.freeze(['text', 'multiline', 'number', 'boolean', 'choice', 'color'])

const TEXT_KINDS = new Set(['text', 'multiline', 'color'])
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
/** Hex, rgb()/hsl() or a colour name. Empty means "not set" (the theme decides). */
const COLOR_RE = /^(#[0-9a-f]{3,8}|(?:rgb|hsl)a?\([0-9a-z.,%/\s-]{1,60}\)|[a-z]{1,30})$/i
const HEX6_RE = /^#[0-9a-f]{6}$/i

const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

function kindOf(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  return typeof value
}

const KIND_NOUN = {
  text: 'text',
  multiline: 'text',
  color: 'a colour',
  number: 'a number',
  boolean: 'true or false',
  choice: 'one of the choices'
}

/* --------------------------------------------------------------- definition */

function normalizeOptions(options, key) {
  if (!Array.isArray(options) || !options.length) throw new Error(`Field "${key}": a choice needs options`)
  const out = options.map((option) => {
    const value = isObject(option) ? option.value : option
    if (!['string', 'number', 'boolean'].includes(typeof value)) {
      throw new Error(`Field "${key}": option values must be text, numbers or true/false`)
    }
    const label = isObject(option) && typeof option.label === 'string' && option.label ? option.label : String(value)
    return Object.freeze({ value, label })
  })
  if (new Set(out.map((o) => String(o.value))).size !== out.length) {
    throw new Error(`Field "${key}": two options have the same value`)
  }
  return Object.freeze(out)
}

/**
 * Check a list of field descriptions and return it frozen, with choice options
 * as `{ value, label }`. Throws on a mistake in the list (unknown kind, a key
 * used twice, a default that its own limits reject), so a wrong description
 * stops the start instead of producing a half-working widget.
 */
export function defineFields(list) {
  if (!Array.isArray(list)) throw new Error('Fields: expected a list')
  const seen = new Set()
  const fields = list.map((raw, index) => {
    if (!isObject(raw)) throw new Error(`Field ${index + 1}: expected an object`)
    const key = raw.key
    if (typeof key !== 'string' || !/^[A-Za-z][A-Za-z0-9_]*$/.test(key) || RESERVED_KEYS.has(key)) {
      throw new Error(`Field ${index + 1}: "key" must be a simple name`)
    }
    if (seen.has(key)) throw new Error(`Field "${key}" is described twice`)
    seen.add(key)
    if (!FIELD_KINDS.includes(raw.kind)) {
      throw new Error(`Field "${key}": unknown kind "${raw.kind}" (${FIELD_KINDS.join(', ')})`)
    }
    const field = { ...raw, label: typeof raw.label === 'string' && raw.label ? raw.label : key }
    if (field.kind === 'choice') field.options = normalizeOptions(raw.options, key)
    if (field.lenient && !TEXT_KINDS.has(field.kind)) throw new Error(`Field "${key}": only text fields can be lenient`)
    for (const limit of ['min', 'max', 'step', 'maxLength']) {
      if (field[limit] !== undefined && !(typeof field[limit] === 'number' && Number.isFinite(field[limit]))) {
        throw new Error(`Field "${key}": "${limit}" must be a number`)
      }
    }
    if (field.default === undefined) throw new Error(`Field "${key}" has no default`)
    const problem = valueProblem(field, field.default)
    if (problem) throw new Error(`Field "${key}": the default is not valid (${problem})`)
    return Object.freeze(field)
  })
  return Object.freeze(fields)
}

export function fieldByKey(fields, key) {
  return (Array.isArray(fields) && fields.find((f) => f.key === key)) || null
}

/* ----------------------------------------------------------------- defaults */

/** Default `data` for a new widget: every field's default, in the order of the list. */
export function fieldDefaults(fields) {
  const out = {}
  for (const field of fields || []) out[field.key] = field.default
  return out
}

/* --------------------------------------------------------------- validation */

/** Why `value` is not acceptable for `field`, or null when it is. */
function valueProblem(field, value) {
  const got = kindOf(value)
  // Lists and objects are never a field value. Storing one would also lock the
  // field: a later text value can no longer be merged over an object.
  if (got === 'array' || got === 'object') return `expected ${KIND_NOUN[field.kind]}, got ${got === 'array' ? 'a list' : 'an object'}`
  if (TEXT_KINDS.has(field.kind)) {
    if (got !== 'string') {
      if (field.lenient && (got === 'number' || got === 'boolean' || got === 'null')) return null
      return `expected ${KIND_NOUN[field.kind]}, got ${got}`
    }
    if (field.maxLength !== undefined && value.length > field.maxLength) return `at most ${field.maxLength} characters`
    if (field.kind === 'color' && value !== '' && !COLOR_RE.test(value)) return 'expected a colour such as #ff0000'
    return null
  }
  if (field.kind === 'number') {
    if (got !== 'number' || !Number.isFinite(value)) return `expected a number, got ${got}`
    if (field.integer && !Number.isInteger(value)) return 'expected a whole number'
    if (field.min !== undefined && value < field.min) return `must be at least ${field.min}`
    if (field.max !== undefined && value > field.max) return `must be at most ${field.max}`
    return null
  }
  if (field.kind === 'boolean') return got === 'boolean' ? null : `expected true or false, got ${got}`
  if (field.kind === 'choice') {
    return field.options.some((o) => o.value === value)
      ? null
      : `expected one of: ${field.options.map((o) => String(o.value)).join(', ')}`
  }
  return null
}

/**
 * Check a (partial) `data` object against a list of fields. Returns a message
 * such as "data.title: at most 80 characters", or null when the data is fine.
 *
 * Only keys that are present are checked (a PATCH sends the changed fields),
 * and keys the list does not describe are left alone.
 */
export function validateFieldData(fields, data, where = 'data') {
  if (!isObject(data)) return `${where}: expected an object`
  for (const field of fields || []) {
    if (!Object.hasOwn(data, field.key) || data[field.key] === undefined) continue
    const problem = valueProblem(field, data[field.key])
    if (problem) return `${where}.${field.key}: ${problem}`
  }
  return null
}

/* --------------------------------------------------------------- form input */

/**
 * Turn what a form control gave us into a value of the field's kind.
 * Returns `{ value }` or `{ error }` (a message for the operator).
 */
export function coerceFieldInput(field, raw) {
  let value
  switch (field?.kind) {
    case 'boolean':
      value = raw === true || raw === 'true' || raw === 'on' || raw === '1'
      break
    case 'number': {
      const text = String(raw ?? '').trim().replace(',', '.')
      value = Number(text)
      if (text === '' || !Number.isFinite(value)) return { error: `${field.label}: enter a number` }
      break
    }
    case 'choice': {
      const option = field.options.find((o) => String(o.value) === String(raw))
      if (!option) return { error: `${field.label}: not one of the choices` }
      value = option.value
      break
    }
    case 'text':
    case 'multiline':
    case 'color':
      value = String(raw ?? '')
      break
    default:
      return { error: `${field?.label || 'This field'} cannot be edited here` }
  }
  const problem = valueProblem(field, value)
  return problem ? { error: `${field.label}: ${problem}` } : { value }
}

/**
 * The value a control shows for `data[field.key]`.
 * Text shows what is stored, and nothing when the key is missing: the render
 * does the same, and the default is only the starting text of a new widget.
 * The other kinds fall back to the default, because their controls cannot be empty.
 */
export function fieldDisplayValue(field, data) {
  const stored = isObject(data) && Object.hasOwn(data, field.key) ? data[field.key] : undefined
  if (field.kind === 'text' || field.kind === 'multiline') {
    return stored === undefined || stored === null || typeof stored === 'object' ? '' : String(stored)
  }
  if (field.kind === 'color') {
    if (typeof stored === 'string' && HEX6_RE.test(stored)) return stored
    return HEX6_RE.test(field.default) ? field.default : '#000000'
  }
  return valueProblem(field, stored) ? field.default : stored
}

/**
 * One line that sums up a widget for a status line or a list: the filled-in
 * text of `keys` joined with " · ", or `fallback` when all are empty.
 */
export function fieldSummary(fields, keys, data, fallback = '') {
  const parts = (keys || [])
    .map((key) => fieldByKey(fields, key))
    .filter(Boolean)
    .map((field) => {
      const value = fieldDisplayValue(field, data)
      if (field.kind === 'choice') return field.options.find((o) => o.value === value)?.label ?? ''
      return String(value ?? '')
    })
    .filter((text) => text.trim())
  return parts.join(' · ') || fallback
}

/* ------------------------------------------------------------ form controls */

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Action name of the on/off button of a boolean field (see operate-fields.js). */
export const FIELD_TOGGLE_ACTION = 'field-toggle'

/**
 * The control for one field, in the markup of the operate cards. The control
 * carries `data-field="<key>"`; the pages save it through operate-fields.js.
 */
export function fieldControlHtml(field, data) {
  const value = fieldDisplayValue(field, data)
  const label = esc(field.label)
  const hint = field.description ? ` title="${esc(field.description)}"` : ''
  const attr = `data-field="${esc(field.key)}"`
  const maxLength = field.maxLength !== undefined ? ` maxlength="${esc(field.maxLength)}"` : ''
  switch (field.kind) {
    case 'text':
      return `<label class="field op-field"${hint}>
            <span>${label}</span>
            <input type="text" ${attr}${maxLength} value="${esc(value)}" />
          </label>`
    case 'multiline':
      return `<label class="field op-field"${hint}>
            <span>${label}</span>
            <textarea rows="2" ${attr}${maxLength}>${esc(value)}</textarea>
          </label>`
    case 'number': {
      const min = field.min !== undefined ? ` min="${esc(field.min)}"` : ''
      const max = field.max !== undefined ? ` max="${esc(field.max)}"` : ''
      const step = field.step ?? (field.integer ? 1 : 'any')
      return `<label class="field op-field"${hint}>
            <span>${label}</span>
            <input type="number" inputmode="${field.integer ? 'numeric' : 'decimal'}" step="${esc(step)}"${min}${max} ${attr} value="${esc(value)}" />
          </label>`
    }
    case 'boolean':
      return `<div class="field op-field"${hint}>
            <span>${label}</span>
            <button type="button" class="button ${value ? 'button--live' : 'button--gray'} op-toggle" data-action="${FIELD_TOGGLE_ACTION}" ${attr} aria-pressed="${Boolean(value)}">${value ? 'On' : 'Off'}</button>
          </div>`
    case 'choice': {
      const options = field.options
        .map((o) => `<option value="${esc(o.value)}"${o.value === value ? ' selected' : ''}>${esc(o.label)}</option>`)
        .join('')
      return `<label class="field op-field"${hint}>
            <span>${label}</span>
            <select ${attr}>${options}</select>
          </label>`
    }
    case 'color':
      return `<label class="field op-field op-field--color"${hint}>
            <span>${label}</span>
            <input type="color" ${attr} value="${esc(value)}" />
          </label>`
    default:
      return ''
  }
}

/** The controls for a list of fields, one after the other (no wrapper): for a card's own grid. */
export function fieldControlsHtml(fields, data) {
  return (fields || []).map((field) => fieldControlHtml(field, data)).join('\n          ')
}

/**
 * A complete card cell with the controls for a list of fields in a grid. A card
 * that only has described fields uses this as its body; a card with its own
 * controls adds it as one more cell.
 */
export function fieldsHtml(fields, data) {
  const list = fields || []
  if (!list.length) return ''
  return `<div class="pv-group__cell op-grid op-grid--${list.length > 1 ? 'auto' : '1'}">
          ${fieldControlsHtml(list, data)}
        </div>`
}
