/** Align helpers for WYSIWYG text fields. */

export function average(values) {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function alignElementsY(elements, y = null) {
  const target = y ?? average(elements.map((el) => el.y))
  for (const el of elements) el.y = target
  return target
}

export function alignElementsX(elements, x = null) {
  const target = x ?? average(elements.map((el) => el.x))
  for (const el of elements) el.x = target
  return target
}

export function matchFontSize(elements, fontSize = null) {
  const target = fontSize ?? elements[0]?.fontSize
  if (target == null) return null
  for (const el of elements) el.fontSize = target
  return target
}

export function alignScoreRow(elements) {
  const row = elements.filter((el) =>
    ['homeScore', 'awayScore', 'clock'].includes(el.bind) ||
    (el.bind === 'custom' && String(el.text || '').trim() === '-')
  )
  if (row.length < 2) return null
  return alignElementsY(row)
}

export function alignCodeRow(elements) {
  const row = elements.filter((el) => el.bind === 'homeCode' || el.bind === 'awayCode')
  if (row.length < 2) return null
  return alignElementsY(row)
}
