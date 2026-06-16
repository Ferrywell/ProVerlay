/** Undo/redo stack for WYSIWYG editors. */

export function createHistory({ limit = 50 } = {}) {
  const past = []
  const future = []

  function push(snapshot) {
    past.push(structuredClone(snapshot))
    if (past.length > limit) past.shift()
    future.length = 0
  }

  function undo(current) {
    if (!past.length) return null
    future.push(structuredClone(current))
    return past.pop()
  }

  function redo(current) {
    if (!future.length) return null
    past.push(structuredClone(current))
    return future.pop()
  }

  function reset() {
    past.length = 0
    future.length = 0
  }

  return {
    push,
    undo,
    redo,
    reset,
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0
  }
}
