/**
 * Filling widget lists from a data source table (pure; no I/O).
 *
 * A bound widget stores `data.dataBinding = { sourceId, columns: { field: header } }`.
 * On every new copy of the source the list is rebuilt here and written into the
 * widget, so the render, the operator and Companion keep working on plain
 * lists, also offline (the last good list stays in project.json).
 *
 * Item ids come from a hash of the row's key column, so editing a title in the
 * sheet keeps the same id: the person on air stays on air with the new title.
 */
import crypto from 'crypto'
import { IMAGE_FILE_RE } from '../public/shared/image-list.js'

/** Widget types a source can fill, the fields a column can feed, and the key field. */
export const BINDABLE_TYPES = {
  lowerThirdShow: { list: 'entries', active: 'activeEntryId', key: 'name', fields: ['name', 'title', 'company'] },
  customTicker: { list: 'messages', active: null, key: 'text', fields: ['text'] },
  quizShow: {
    list: 'questions',
    active: 'activeQuestionId',
    key: 'question',
    fields: ['question', 'optionA', 'optionB', 'optionC', 'optionD', 'correct']
  },
  image: { list: 'images', active: 'activeImageId', key: 'src', fields: ['src', 'name'] }
}

export function isBindableType(type) {
  return Object.hasOwn(BINDABLE_TYPES, type)
}

function stableIds(prefix, keys) {
  const seen = new Map()
  return keys.map((key) => {
    const n = (seen.get(key) || 0) + 1
    seen.set(key, n)
    const hash = crypto.createHash('sha1').update(`${key}#${n}`).digest('hex').slice(0, 10)
    return `${prefix}-${hash}`
  })
}

const cell = (row, columns, field) => {
  const header = columns?.[field]
  return header && Object.hasOwn(row, header) ? String(row[header] ?? '').trim() : ''
}

/** Index of the correct answer: 1–4, A–D, or the text of one of the options. Default 0. */
export function correctIndex(value, options) {
  const v = String(value ?? '').trim()
  if (!v) return 0
  if (/^[1-9]$/.test(v) && Number(v) <= options.length) return Number(v) - 1
  if (/^[a-z]$/i.test(v)) {
    const i = v.toUpperCase().charCodeAt(0) - 65
    if (i < options.length) return i
  }
  const byText = options.findIndex((o) => o.toLowerCase() === v.toLowerCase())
  return byText === -1 ? 0 : byText
}

/** Rows → list items for a widget type. Rows without the key field are skipped. */
export function buildItems(type, rows, columns, previousItems = []) {
  const spec = BINDABLE_TYPES[type]
  if (!spec) return []
  const usable = rows.filter((row) => cell(row, columns, spec.key))
  const prefix = { lowerThirdShow: 'ds', customTicker: 'dsmsg', quizShow: 'dsq', image: 'dsimg' }[type]
  const ids = stableIds(prefix, usable.map((row) => cell(row, columns, spec.key)))
  const previous = new Map(previousItems.filter((p) => p && p.id).map((p) => [p.id, p]))
  return usable
    .map((row, i) => {
      const id = ids[i]
      const get = (field) => cell(row, columns, field)
      if (type === 'lowerThirdShow') return { id, name: get('name'), title: get('title'), company: get('company'), keywords: [] }
      if (type === 'customTicker') {
        // Keep the operator's on/off choice for a message across refreshes.
        return { id, text: get('text'), enabled: previous.has(id) ? previous.get(id).enabled !== false : true }
      }
      if (type === 'quizShow') {
        const options = ['optionA', 'optionB', 'optionC', 'optionD'].map(get).filter(Boolean)
        return { id, question: get('question'), options, correct: correctIndex(get('correct'), options) }
      }
      // image: the cell holds a file name from the project assets
      const src = get('src').split(/[\\/]/).pop()
      if (!IMAGE_FILE_RE.test(src) || src.startsWith('.')) return null
      return { id, src, name: get('name') || src.replace(/\.[a-z0-9]+$/i, ''), alt: '' }
    })
    .filter(Boolean)
}

/**
 * New data for a bound graphic, or null when nothing changed. The active item
 * follows its id; when that id is gone, the item at the same position takes
 * its place (so a renamed person on air does not drop off air).
 */
export function applyTableToGraphic(graphic, table) {
  const binding = graphic?.data?.dataBinding
  const spec = BINDABLE_TYPES[graphic?.type]
  if (!binding || !spec || !table) return null
  const before = Array.isArray(graphic.data[spec.list]) ? graphic.data[spec.list] : []
  const items = buildItems(graphic.type, table.rows || [], binding.columns || {}, before)
  const data = { ...graphic.data, [spec.list]: items }
  if (spec.active) {
    const activeId = graphic.data[spec.active]
    if (activeId && !items.some((it) => it.id === activeId)) {
      const oldIndex = before.findIndex((it) => it?.id === activeId)
      data[spec.active] = oldIndex >= 0 && items[oldIndex] ? items[oldIndex].id : null
    }
  }
  if (JSON.stringify(data) === JSON.stringify(graphic.data)) return null
  const next = { ...graphic, data }
  // The item on air is gone and nothing replaces it: take the widget off air.
  if (spec.active && graphic.visible && !data[spec.active]) next.visible = false
  return next
}

/** Variables from a key/value table. */
export function variablesFromTable(table, keyColumn, valueColumn) {
  const out = {}
  for (const row of table?.rows || []) {
    const key = String(row?.[keyColumn] ?? '').trim()
    if (!key || !/^[A-Za-z0-9_.-]{1,80}$/.test(key)) continue
    out[key] = String(row?.[valueColumn] ?? '')
  }
  return out
}
