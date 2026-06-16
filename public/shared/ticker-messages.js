export function tickerMessageText(item) {
  if (typeof item === 'string') return item
  return item?.text ?? ''
}

export function migrateTickerMessages(messages) {
  if (!Array.isArray(messages)) return []
  const hasLegacy = messages.some((m) => typeof m === 'string')
  return messages
    .map((item, index) => {
      if (typeof item === 'string') {
        const text = item.trim()
        if (!text) return null
        return {
          id: `msg-migrated-${index}`,
          text,
          enabled: hasLegacy
        }
      }
      if (!item || typeof item !== 'object') return null
      const text = String(item.text ?? '').trim()
      if (!text) return null
      return {
        id: item.id || `msg-${index}`,
        text,
        enabled: item.enabled !== undefined ? Boolean(item.enabled) : hasLegacy
      }
    })
    .filter(Boolean)
}

export function enabledTickerTexts(messages) {
  return migrateTickerMessages(messages)
    .filter((m) => m.enabled)
    .map((m) => m.text)
}

export function createTickerMessage(text, { enabled = false } = {}) {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text: String(text ?? '').trim(),
    enabled: Boolean(enabled)
  }
}
