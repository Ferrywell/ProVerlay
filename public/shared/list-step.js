/**
 * Stepping through a list that has one active item (images, roster people,
 * quiz questions). Pure, shared by the server and the pages.
 */

/**
 * Id of the item after/before the active one.
 * Without an active item: next → first, previous → last.
 * At the end of the list: wraps around, or null with `wrap: false`.
 * An empty list gives null.
 */
export function stepListId(items, activeId, direction = 'next', { wrap = true } = {}) {
  if (!items.length) return null
  const index = items.findIndex((item) => item.id === activeId)
  const forward = direction !== 'previous'
  if (index === -1) return forward ? items[0].id : items[items.length - 1].id
  let next = index + (forward ? 1 : -1)
  if (next < 0 || next >= items.length) {
    if (!wrap) return null
    next = (next + items.length) % items.length
  }
  return items[next].id
}
