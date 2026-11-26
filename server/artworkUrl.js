/** Cover art only from Spotify's own image host, over https (app reader and Web API). */
export function cleanArtworkUrl(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  try {
    const url = new URL(text)
    if (url.protocol !== 'https:' || url.hostname !== 'i.scdn.co') return ''
    return url.href
  } catch {
    return ''
  }
}
