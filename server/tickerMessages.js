import crypto from 'crypto'

export function tickerMessageId() {
  return `msg-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`
}

export function createTickerMessage(text, { enabled = false } = {}) {
  return {
    id: tickerMessageId(),
    text: String(text ?? '').trim(),
    enabled: Boolean(enabled)
  }
}

export function normalizeTickerMessage(item, { defaultEnabled = false } = {}) {
  if (typeof item === 'string') {
    const text = item.trim()
    if (!text) return null
    return createTickerMessage(text, { enabled: defaultEnabled })
  }
  if (!item || typeof item !== 'object') return null
  const text = String(item.text ?? '').trim()
  if (!text) return null
  return {
    id: item.id || tickerMessageId(),
    text,
    enabled: item.enabled !== undefined ? Boolean(item.enabled) : defaultEnabled
  }
}

/** Migrate legacy string[] to { id, text, enabled }[] — existing strings default enabled. */
export function migrateTickerMessages(messages) {
  if (!Array.isArray(messages)) return []
  const hasLegacy = messages.some((m) => typeof m === 'string')
  return messages
    .map((item) => normalizeTickerMessage(item, { defaultEnabled: hasLegacy }))
    .filter(Boolean)
}

export function enabledTickerTexts(messages) {
  return migrateTickerMessages(messages)
    .filter((m) => m.enabled)
    .map((m) => m.text)
}

export function normalizeTickerMessagesInput(messages, { existing = [] } = {}) {
  if (!Array.isArray(messages)) return migrateTickerMessages(existing)
  const migratedExisting = migrateTickerMessages(existing)
  const byId = new Map(migratedExisting.map((m) => [m.id, m]))
  return messages
    .map((item) => {
      if (typeof item === 'string') {
        return createTickerMessage(item, { enabled: false })
      }
      if (!item || typeof item !== 'object') return null
      const prev = item.id ? byId.get(item.id) : null
      const text = String(item.text ?? prev?.text ?? '').trim()
      if (!text) return null
      return {
        id: item.id || prev?.id || tickerMessageId(),
        text,
        enabled: item.enabled !== undefined ? Boolean(item.enabled) : (prev?.enabled ?? false)
      }
    })
    .filter(Boolean)
}

export function migrateStateTickers(state) {
  if (!state?.graphics) return state
  let changed = false
  const graphics = state.graphics.map((graphic) => {
    if (graphic.type !== 'customTicker') return graphic
    const raw = graphic.data?.messages
    if (!Array.isArray(raw) || !raw.some((m) => typeof m === 'string')) return graphic
    changed = true
    return {
      ...graphic,
      data: {
        ...graphic.data,
        messages: migrateTickerMessages(raw)
      }
    }
  })
  return changed ? { ...state, graphics } : state
}
