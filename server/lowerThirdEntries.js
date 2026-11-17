import crypto from 'crypto'
import { getGraphic, updateGraphic } from './state.js'
import { badRequest } from './validation.js'

function entryId() {
  return `sp-${crypto.randomUUID().slice(0, 8)}`
}

function cleanText(value) {
  return String(value ?? '').trim()
}

function cleanKeywords(value) {
  return Array.isArray(value) ? value.filter((k) => typeof k === 'string') : []
}

export function getLowerThirdGraphic(graphicId) {
  const graphic = getGraphic(graphicId)
  if (!graphic || graphic.type !== 'lowerThirdShow') return null
  return graphic
}

/**
 * All entry operations run inside the state write queue (updateGraphic), so
 * concurrent adds/edits from several clients never overwrite each other.
 */
function updateLowerThird(graphicId, fn) {
  return updateGraphic(graphicId, (graphic) => {
    if (graphic.type !== 'lowerThirdShow') return null
    return fn(graphic, Array.isArray(graphic.data?.entries) ? graphic.data.entries : [])
  })
}

export async function addLowerThirdEntry(graphicId, entry = {}) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw badRequest('Body must be a JSON object')
  }
  const name = cleanText(entry.name)
  if (!name) throw badRequest('Name is required')

  let created = null
  await updateLowerThird(graphicId, (graphic, entries) => {
    const requested = typeof entry.id === 'string' && entry.id ? entry.id : null
    created = {
      id: requested && !entries.some((e) => e.id === requested) ? requested : entryId(),
      name,
      title: cleanText(entry.title),
      company: cleanText(entry.company),
      keywords: cleanKeywords(entry.keywords)
    }
    return { ...graphic, data: { ...graphic.data, entries: [...entries, created] } }
  })
  return created
}

export async function updateLowerThirdEntry(graphicId, entryIdParam, patch = {}) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw badRequest('Body must be a JSON object')
  }
  let updated = null
  await updateLowerThird(graphicId, (graphic, entries) => {
    if (!entries.some((e) => e.id === entryIdParam)) return null
    const next = entries.map((entry) => {
      if (entry.id !== entryIdParam) return entry
      updated = {
        ...entry,
        ...(patch.name !== undefined ? { name: cleanText(patch.name) } : {}),
        ...(patch.title !== undefined ? { title: cleanText(patch.title) } : {}),
        ...(patch.company !== undefined ? { company: cleanText(patch.company) } : {}),
        ...(patch.keywords !== undefined ? { keywords: cleanKeywords(patch.keywords) } : {})
      }
      return updated
    })
    return { ...graphic, data: { ...graphic.data, entries: next } }
  })
  return updated
}

export async function deleteLowerThirdEntry(graphicId, entryIdParam) {
  let deleted = false
  await updateLowerThird(graphicId, (graphic, entries) => {
    const next = entries.filter((e) => e.id !== entryIdParam)
    if (next.length === entries.length) return null
    deleted = true
    const data = { ...graphic.data, entries: next }
    if (graphic.data?.activeEntryId === entryIdParam) data.activeEntryId = null
    return { ...graphic, visible: false, data }
  })
  return deleted ? { ok: true } : null
}

export async function showLowerThirdEntry(graphicId, entryIdParam) {
  return updateLowerThird(graphicId, (graphic, entries) => {
    if (!entries.some((e) => e.id === entryIdParam)) return null
    return { ...graphic, visible: true, data: { ...graphic.data, activeEntryId: entryIdParam } }
  })
}

export async function hideLowerThirdShow(graphicId) {
  return updateLowerThird(graphicId, (graphic) => ({ ...graphic, visible: false }))
}
