import { getGraphic, patchGraphic } from './state.js'

function entryId() {
  return `sp-${Date.now().toString(36)}`
}

export function getLowerThirdGraphic(graphicId) {
  const graphic = getGraphic(graphicId)
  if (!graphic || graphic.type !== 'lowerThirdShow') return null
  return graphic
}

export async function addLowerThirdEntry(graphicId, entry = {}) {
  const graphic = getLowerThirdGraphic(graphicId)
  if (!graphic) return null

  const name = String(entry.name || '').trim()
  if (!name) throw new Error('Name is required')

  const newEntry = {
    id: entry.id || entryId(),
    name,
    title: String(entry.title || '').trim(),
    company: String(entry.company || '').trim(),
    keywords: Array.isArray(entry.keywords) ? entry.keywords : []
  }

  const entries = [...(graphic.data?.entries || []), newEntry]
  await patchGraphic(graphicId, { data: { entries } })
  return newEntry
}

export async function updateLowerThirdEntry(graphicId, entryIdParam, patch = {}) {
  const graphic = getLowerThirdGraphic(graphicId)
  if (!graphic) return null

  const entries = (graphic.data?.entries || []).map((entry) => {
    if (entry.id !== entryIdParam) return entry
    return {
      ...entry,
      ...(patch.name !== undefined ? { name: String(patch.name).trim() } : {}),
      ...(patch.title !== undefined ? { title: String(patch.title).trim() } : {}),
      ...(patch.company !== undefined ? { company: String(patch.company).trim() } : {}),
      ...(patch.keywords !== undefined ? { keywords: patch.keywords } : {})
    }
  })

  if (!entries.some((e) => e.id === entryIdParam)) return null
  await patchGraphic(graphicId, { data: { entries } })
  return entries.find((e) => e.id === entryIdParam)
}

export async function deleteLowerThirdEntry(graphicId, entryIdParam) {
  const graphic = getLowerThirdGraphic(graphicId)
  if (!graphic) return null

  const entries = (graphic.data?.entries || []).filter((e) => e.id !== entryIdParam)
  if (entries.length === (graphic.data?.entries || []).length) return null

  const data = { entries }
  if (graphic.data?.activeEntryId === entryIdParam) {
    data.activeEntryId = null
  }
  await patchGraphic(graphicId, { visible: false, data })
  return { ok: true }
}

export async function showLowerThirdEntry(graphicId, entryIdParam) {
  const graphic = getLowerThirdGraphic(graphicId)
  if (!graphic) return null
  if (!(graphic.data?.entries || []).some((e) => e.id === entryIdParam)) return null

  await patchGraphic(graphicId, {
    visible: true,
    data: { activeEntryId: entryIdParam }
  })
  return getGraphic(graphicId)
}

export async function hideLowerThirdShow(graphicId) {
  const graphic = getLowerThirdGraphic(graphicId)
  if (!graphic) return null
  await patchGraphic(graphicId, { visible: false })
  return getGraphic(graphicId)
}
