/**
 * Edit settings forms (`/control?configure=<id>`): track what the user changed
 * and save only that.
 *
 * A form session remembers the server values the form was filled with (the
 * baseline). On save it diffs payload(baseline) against payload(current form)
 * and PATCHes only the difference. When another client changes the widget
 * while the form is open, untouched fields follow the server and the user's
 * unsaved edits are kept (with a subtle notice if the same field changed).
 */
import { patchGraphic } from '/public/shared/client.js'
import { enqueue } from '/public/shared/operate-ui.js'
import { showToast } from '/public/shared/toast.js'
import { deepEqual, diffPatch, isEmptyPatch, reconcileFormValues, withoutLiveFields } from '/public/shared/patch-diff.js'

export const CONFLICT_NOTICE_TEXT = 'Updated elsewhere — your unsaved changes are kept'

const SKIPPED_INPUT_TYPES = new Set(['file', 'hidden', 'button', 'submit', 'reset', 'search'])

function controlKey(el) {
  return el.name || el.id
}

function readControl(el) {
  return el.type === 'checkbox' ? el.checked : el.value
}

function writeControl(el, value) {
  if (!el) return
  if (el.type === 'checkbox') {
    el.checked = Boolean(value)
    return
  }
  if (el.value !== String(value ?? '')) el.value = value ?? ''
  // Keep slider read-outs (<output for="…">) in step with the control.
  if (el.id) {
    for (const out of el.form?.querySelectorAll('output') || []) {
      if (out.htmlFor?.contains?.(el.id)) out.textContent = el.value
    }
  }
}

/** Keep the caret where it was when a focused text field is rewritten. */
function captureSelection(root) {
  const el = document.activeElement
  if (!el || !root.contains(el)) return null
  try {
    if (typeof el.selectionStart === 'number') return { el, start: el.selectionStart, end: el.selectionEnd }
  } catch {
    /* number inputs do not expose a selection */
  }
  return null
}

function restoreSelection(sel) {
  if (!sel || document.activeElement !== sel.el) return
  try {
    sel.el.setSelectionRange(sel.start, sel.end)
  } catch {
    /* ignore */
  }
}

/**
 * @param {object} options
 * @param {HTMLElement} options.root            element that holds the controls (and the notice)
 * @param {() => Element[]} [options.controls]  explicit control list (default: inputs inside root)
 * @param {(graphic: object) => void} options.fill  writes the graphic into the controls (sync)
 * @param {(values: object) => object} options.payload  PATCH body for a `key → value` map
 * @param {string[]} [options.volatile]          keys that change on their own (running clock) — never flagged
 * @param {() => void} [options.afterSync]       refresh dependent UI (outputs, previews)
 * @param {Element} [options.noticeBefore]      where to show the notice (default: top of root)
 */
export function createFormSession({ root, controls, fill, payload, volatile = [], afterSync, noticeBefore }) {
  let graphicId = null
  let lastGraphic = null
  let baseline = {}
  const pending = new Map()
  let notice = null

  const listControls = () =>
    (controls ? controls() : [...(root?.querySelectorAll('input, select, textarea') || [])]).filter(
      (el) => el && controlKey(el) && !SKIPPED_INPUT_TYPES.has(el.type)
    )

  const readValues = () => Object.fromEntries(listControls().map((el) => [controlKey(el), readControl(el)]))
  const controlMap = () => new Map(listControls().map((el) => [controlKey(el), el]))

  function setNotice(show) {
    if (!show) {
      if (notice) notice.hidden = true
      return
    }
    if (!notice && root) {
      notice = document.createElement('p')
      notice.className = 'network-hint settings-conflict-notice'
      notice.setAttribute('role', 'status')
      notice.textContent = CONFLICT_NOTICE_TEXT
      if (noticeBefore) noticeBefore.before(notice)
      else root.prepend(notice)
    }
    if (notice) notice.hidden = false
  }

  function dirtyKeys() {
    const current = readValues()
    return Object.keys(current).filter((k) => Object.hasOwn(baseline, k) && !deepEqual(current[k], baseline[k]))
  }

  /** Fill the form from `graphic`, keeping the user's unsaved edits. */
  function sync(graphic) {
    if (!graphic) return
    const opening = graphic.id !== graphicId
    const before = opening ? null : readValues()
    const selection = opening ? null : captureSelection(root)
    fill(graphic)
    const server = readValues()
    graphicId = graphic.id
    lastGraphic = graphic

    if (opening) {
      baseline = server
      pending.clear()
      setNotice(false)
      afterSync?.()
      return
    }

    const result = reconcileFormValues({
      baseline,
      current: before,
      server,
      pending: Object.fromEntries(pending)
    })
    const els = controlMap()
    for (const [key, value] of Object.entries(result.values)) {
      if (!deepEqual(server[key], value)) writeControl(els.get(key), value)
    }
    restoreSelection(selection)
    baseline = result.baseline
    // A pending value the server now reports has landed.
    for (const [key, value] of pending) if (deepEqual(server[key], value)) pending.delete(key)

    if (result.conflicts.some((k) => !volatile.includes(k))) setNotice(true)
    else if (!result.dirty.length) setNotice(false)
    afterSync?.()
  }

  return {
    sync,

    /** Forget the open form (panel closed or another widget selected). */
    close() {
      graphicId = null
      lastGraphic = null
      baseline = {}
      pending.clear()
      setNotice(false)
    },

    get graphicId() {
      return graphicId
    },

    values: readValues,
    dirtyKeys,

    isDirty(key) {
      return dirtyKeys().includes(key)
    },

    /**
     * Partial PATCH body for the user's edits. With `keys`, only those
     * controls count as edited (e.g. an instant checkbox while other fields
     * are still being edited). Score and running-clock fields are stripped.
     */
    patch(keys) {
      const current = readValues()
      const target = keys
        ? { ...baseline, ...Object.fromEntries(keys.filter((k) => Object.hasOwn(current, k)).map((k) => [k, current[k]])) }
        : current
      return withoutLiveFields(diffPatch(payload(baseline), payload(target)))
    },

    /** Set a control to a server-driven value unless the user is editing it. */
    setServerValue(key, value) {
      const el = controlMap().get(key)
      if (!el || this.isDirty(key)) return
      writeControl(el, value)
      baseline[key] = readControl(el)
    },

    /** Treat what a control shows now as saved (after a save made outside the form). */
    acceptCurrent(key) {
      const el = controlMap().get(key)
      if (el) baseline[key] = readControl(el)
    },

    /** Mark `keys` (default: all dirty) as being saved. */
    begin(keys = dirtyKeys()) {
      const current = readValues()
      const sent = {}
      for (const key of keys) {
        if (!Object.hasOwn(current, key)) continue
        sent[key] = current[key]
        pending.set(key, current[key])
      }
      return { sent, graphicId }
    },

    /** Finish a save started with begin(). */
    settle(token, ok) {
      if (!token || token.graphicId !== graphicId) return
      for (const [key, value] of Object.entries(token.sent)) {
        if (!pending.has(key) || !deepEqual(pending.get(key), value)) continue
        pending.delete(key)
        // The broadcast has not arrived yet, but the server has this value now.
        if (ok) baseline[key] = value
      }
      if (lastGraphic) sync(lastGraphic)
    }
  }
}

const successToasts = new WeakMap()

function showSuccessOnce(session, message) {
  successToasts.get(session)?.dismiss()
  successToasts.set(session, showToast(message, { type: 'success', duration: 2500 }))
}

/**
 * Save a form session: PATCH only the changed fields (serialized per graphic
 * with the operate cards' atomic score/clock requests), then run `extra`
 * (e.g. a clock endpoint call). Failures show an error toast with the
 * server's message (patchGraphic / clockOp do that); success shows a toast.
 *
 * @returns {Promise<boolean>} true when everything was saved (or nothing changed)
 */
export async function saveFormSession(
  session,
  graphicId,
  { keys, prepare, extra, successMessage = 'Settings saved', emptyMessage = 'No changes to save' } = {}
) {
  if (!graphicId) return false
  let patch = session.patch(keys)
  if (prepare) patch = prepare(patch)
  const hasPatch = !isEmptyPatch(patch)
  if (!hasPatch && !extra) {
    if (emptyMessage) showToast(emptyMessage, { duration: 2500 })
    return true
  }
  const token = session.begin(keys)
  let ok = true
  if (hasPatch) ok = Boolean(await enqueue(graphicId, () => patchGraphic(graphicId, patch)))
  if (ok && extra) ok = Boolean(await extra())
  session.settle(token, ok)
  if (ok && successMessage) showSuccessOnce(session, successMessage)
  return ok
}
