/**
 * Small global toast component (styles in tahoe.css → `.pv-toast`).
 *
 *   showToast('Could not go live', { type: 'error' })
 *   showToast('Message removed', { actionLabel: 'Undo', onAction: restore })
 *   showToast('Copy this URL:', { copyText: url })   // selectable field
 */

let region = null

function ensureRegion() {
  if (region && document.body.contains(region)) return region
  region = document.createElement('div')
  region.className = 'pv-toast-region'
  region.setAttribute('role', 'region')
  region.setAttribute('aria-label', 'Notifications')
  document.body.appendChild(region)
  return region
}

/**
 * @param {string} message
 * @param {{ type?: 'info'|'error'|'warning'|'success', duration?: number,
 *   actionLabel?: string, onAction?: () => void, copyText?: string }} [options]
 * @returns {{ dismiss: () => void }}
 */
export function showToast(message, options = {}) {
  const { type = 'info', actionLabel, onAction, copyText } = options
  const duration = options.duration ?? (copyText ? 15000 : type === 'error' ? 7000 : actionLabel ? 6000 : 4000)
  const host = ensureRegion()

  const toast = document.createElement('div')
  toast.className = `pv-toast pv-toast--${type}`
  toast.setAttribute('role', type === 'error' || type === 'warning' ? 'alert' : 'status')

  const body = document.createElement('div')
  body.className = 'pv-toast__body'
  const text = document.createElement('span')
  text.textContent = message
  body.appendChild(text)

  let copyInput = null
  if (copyText) {
    copyInput = document.createElement('input')
    copyInput.className = 'pv-toast__copy'
    copyInput.type = 'text'
    copyInput.readOnly = true
    copyInput.value = copyText
    copyInput.setAttribute('aria-label', 'URL to copy')
    copyInput.addEventListener('focus', () => copyInput.select())
    body.appendChild(copyInput)
  }
  toast.appendChild(body)

  let timer = null
  const dismiss = () => {
    clearTimeout(timer)
    toast.remove()
  }

  if (actionLabel && typeof onAction === 'function') {
    const action = document.createElement('button')
    action.type = 'button'
    action.className = 'pv-toast__action'
    action.textContent = actionLabel
    action.addEventListener('click', () => {
      dismiss()
      onAction()
    })
    toast.appendChild(action)
  }

  const close = document.createElement('button')
  close.type = 'button'
  close.className = 'pv-toast__close'
  close.setAttribute('aria-label', 'Dismiss')
  close.textContent = '×'
  close.addEventListener('click', dismiss)
  toast.appendChild(close)

  host.appendChild(toast)
  // Keep at most four toasts on screen.
  while (host.children.length > 4) host.firstElementChild?.remove()

  if (copyInput) {
    copyInput.focus()
    copyInput.select()
  }

  const arm = () => {
    clearTimeout(timer)
    if (duration > 0) timer = setTimeout(dismiss, duration)
  }
  toast.addEventListener('mouseenter', () => clearTimeout(timer))
  toast.addEventListener('mouseleave', arm)
  toast.addEventListener('focusin', () => clearTimeout(timer))
  arm()

  return { dismiss }
}

export function showErrorToast(message) {
  return showToast(message, { type: 'error' })
}

/**
 * Run an async action with a pending state on the control that triggered it:
 * disabled + aria-busy until the request settles. Returns the action's result.
 */
export async function withPending(control, action) {
  if (!control) return action()
  if (control.dataset.pending === '1') return undefined
  control.dataset.pending = '1'
  const wasDisabled = control.disabled
  control.disabled = true
  control.setAttribute('aria-busy', 'true')
  control.classList.add('is-pending')
  try {
    return await action()
  } finally {
    delete control.dataset.pending
    control.disabled = wasDisabled
    control.removeAttribute('aria-busy')
    control.classList.remove('is-pending')
  }
}

/** Clipboard copy with a visible fallback (no window.prompt): selectable URL in a toast. */
export async function copyTextWithFallback(text, { successMessage = 'Copied', fallbackMessage = 'Copy this URL:' } = {}) {
  let ok = false
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      ok = true
    } catch {
      ok = false
    }
  }
  if (!ok) {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    try {
      ok = document.execCommand('copy')
    } catch {
      ok = false
    }
    ta.remove()
  }
  if (ok) {
    if (successMessage) showToast(successMessage, { type: 'success', duration: 2500 })
  } else {
    showToast(fallbackMessage, { copyText: text })
  }
  return ok
}
