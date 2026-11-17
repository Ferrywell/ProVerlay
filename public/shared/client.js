import { showErrorToast } from '/public/shared/toast.js'

export function connectProVerlay() {
  const socket = io()
  return socket
}

export function hexFromColor(value = '#007aff') {
  if (value.startsWith('#')) return value
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!match) return '#007aff'
  const [, r, g, b] = match
  return `#${[r, g, b].map((n) => Number(n).toString(16).padStart(2, '0')).join('')}`
}

export function hexToColor(hex, alpha = 1) {
  const value = hex.replace('#', '')
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return alpha === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`
}

async function errorMessage(res, fallback) {
  const body = await res.json().catch(() => null)
  return body?.error || `${fallback} (HTTP ${res.status})`
}

/**
 * Send a request for a graphic change. Never throws: on failure an error toast
 * is shown and null is returned, so an operator always sees when a change did
 * not reach the server.
 */
async function sendGraphicRequest(url, init, failureText) {
  let res
  try {
    res = await fetch(url, init)
  } catch {
    showErrorToast(`${failureText} — ProVerlay server unreachable`)
    return null
  }
  if (!res.ok) {
    showErrorToast(`${failureText}: ${await errorMessage(res, 'Request failed')}`)
    return null
  }
  return res.json().catch(() => ({}))
}

/** PATCH a graphic. Resolves to the updated graphic, or null when it failed (toast shown). */
export async function patchGraphic(id, patch) {
  return sendGraphicRequest(
    `/api/graphics/${id}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    },
    'Change not saved'
  )
}

/** Put a graphic on air / take it off air. Resolves to the graphic, or null when it failed (toast shown). */
export async function toggleGraphic(id, visible) {
  return sendGraphicRequest(
    `/api/graphics/${id}/toggle`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visible })
    },
    visible ? 'Could not go live' : 'Could not take off air'
  )
}

export async function toggleGraphicSolo(id, soloVisible) {
  const res = await fetch(`/api/graphics/${id}/toggle-solo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ soloVisible: Boolean(soloVisible) })
  })
  if (!res.ok) throw new Error(`toggle-solo failed (${res.status})`)
  return res.json()
}
