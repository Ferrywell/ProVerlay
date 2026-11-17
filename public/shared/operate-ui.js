/**
 * Small helpers shared by the operate cards (public/shared/operate-*.js):
 * HTML escaping, in-place input/button syncing and the atomic score/clock API.
 */
import { patchGraphic } from '/public/shared/client.js'
import { showErrorToast } from '/public/shared/toast.js'

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Set an input's value unless the operator is typing in it. */
export function setIfIdle(root, selector, value) {
  const input = root.querySelector(selector)
  if (input && document.activeElement !== input && input.value !== String(value)) input.value = value
}

export function setText(root, selector, text) {
  for (const node of root.querySelectorAll(selector)) {
    if (node.textContent !== String(text)) node.textContent = text
  }
}

/**
 * Replace a container's HTML only when it changed, and put keyboard focus back
 * on the same control (matched by data-action + data-msg-id / data-entry-id).
 */
export function replaceHtmlKeepFocus(container, html) {
  if (!container || container.dataset.html === html) return
  const active = container.contains(document.activeElement) ? document.activeElement : null
  const key = active && ['action', 'msgId', 'entryId'].map((k) => active.dataset[k] || '').join('|')
  container.innerHTML = html
  container.dataset.html = html
  if (!key) return
  for (const el of container.querySelectorAll('[data-action]')) {
    if (['action', 'msgId', 'entryId'].map((k) => el.dataset[k] || '').join('|') === key) return el.focus()
  }
}

/** On/off button: green when on, gray when off, state exposed via aria-pressed. */
export function toggleButtonHtml(action, label, on, extraClass = '') {
  return `<button type="button" class="button ${on ? 'button--live' : 'button--gray'} op-toggle ${extraClass}" data-action="${action}" aria-pressed="${Boolean(on)}">${label}</button>`
}

export function syncToggleButton(root, action, on, label) {
  const btn = root.querySelector(`[data-action="${action}"]`)
  if (!btn) return
  btn.classList.toggle('button--live', Boolean(on))
  btn.classList.toggle('button--gray', !on)
  btn.setAttribute('aria-pressed', String(Boolean(on)))
  if (label !== undefined && btn.textContent !== label) btn.textContent = label
}

/** Number field used for clock minute/second and similar. */
export function numberFieldHtml(label, field, value, { min = 0, max = 999, step, local = false } = {}) {
  const attr = local ? `data-local="${field}"` : `data-field="${field}"`
  return `<label class="field op-field">
    <span>${label}</span>
    <input type="number" min="${min}" max="${max}"${step ? ` step="${step}"` : ''} inputmode="${step ? 'decimal' : 'numeric'}" ${attr} value="${escapeHtml(value)}" />
  </label>`
}

/** Fine clock adjust buttons (same set for match and hockey). */
export function nudgeGridHtml() {
  const steps = [
    ['−1s', -1000],
    ['+1s', 1000],
    ['−15s', -15000],
    ['+15s', 15000],
    ['−1 min', -60000],
    ['+1 min', 60000]
  ]
  return `<div class="op-nudge" role="group" aria-label="Adjust clock">
    ${steps.map(([label, ms]) => `<button type="button" class="op-nudge__btn" data-action="clock-adjust" data-ms="${ms}">${label}</button>`).join('')}
  </div>`
}

/* ------------------------------------------------------------- server API */

/** Serialize requests per graphic so rapid taps reach the server in order. */
const queues = new Map()

export function enqueue(graphicId, fn) {
  const prev = queues.get(graphicId) || Promise.resolve()
  const next = prev.then(fn, fn)
  const tail = next.catch(() => {})
  queues.set(graphicId, tail)
  tail.finally(() => {
    if (queues.get(graphicId) === tail) queues.delete(graphicId)
  })
  return next
}

async function postGraphic(id, path, body, failureText) {
  let res
  try {
    res = await fetch(`/api/graphics/${encodeURIComponent(id)}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  } catch {
    showErrorToast(`${failureText} — ProVerlay server unreachable`)
    return null
  }
  if (!res.ok) {
    const err = await res.json().catch(() => null)
    showErrorToast(`${failureText}: ${err?.error || `Request failed (HTTP ${res.status})`}`)
    return null
  }
  return res.json().catch(() => ({}))
}

/** Atomic score change: computed on the server, never sends cached data. */
export function scoreOp(id, side, delta) {
  return enqueue(id, () => postGraphic(id, 'score', { side, delta }, 'Score not changed'))
}

/** Atomic clock action: start | pause | toggle | reset | adjust | set. */
export function clockOp(id, action, ms) {
  const body = ms === undefined ? { action } : { action, ms }
  return enqueue(id, () => postGraphic(id, 'clock', body, 'Clock not changed'))
}

/** PATCH only the given data fields (never the whole cached `data`). */
export function patchData(id, data) {
  return enqueue(id, () => patchGraphic(id, { data }))
}

export function postEndpoint(id, path, failureText) {
  return postGraphic(id, path, {}, failureText)
}
