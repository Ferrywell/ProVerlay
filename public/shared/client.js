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

export async function patchGraphic(id, patch) {
  await fetch(`/api/graphics/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch)
  })
}

export async function toggleGraphic(id, visible) {
  await fetch(`/api/graphics/${id}/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visible })
  })
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
