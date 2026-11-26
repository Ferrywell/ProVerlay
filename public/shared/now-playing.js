/**
 * Now playing widget: what it shows for a given widget + the latest Spotify
 * reading. Shared by the render and the operate card, so a preview matches the
 * output. No imports on purpose (also loaded by the Node tests).
 */

export const NOW_PLAYING_SOURCES = ['spotify', 'manual']
export const NOW_PLAYING_DEFAULT_LABEL = 'Now playing'
export const NOW_PLAYING_WIDTH_MIN = 240
export const NOW_PLAYING_WIDTH_MAX = 1600
export const NOW_PLAYING_WIDTH_DEFAULT = 620

const text = (value) => (typeof value === 'string' ? value.trim() : '')

export function nowPlayingSource(data) {
  return data?.source === 'manual' ? 'manual' : 'spotify'
}

export function nowPlayingWidth(data) {
  const n = Number(data?.widthPx)
  if (!Number.isFinite(n)) return NOW_PLAYING_WIDTH_DEFAULT
  return Math.min(NOW_PLAYING_WIDTH_MAX, Math.max(NOW_PLAYING_WIDTH_MIN, Math.round(n)))
}

/**
 * @param {object} data  the widget's data
 * @param {object|null} live  latest reading (GET /api/now-playing / `nowPlayingUpdate`)
 * @returns {{ show: boolean, from: 'spotify'|'manual'|'none', title: string, artist: string,
 *             artworkUrl: string, label: string }}
 *
 * Source `spotify`: the live track while it plays (or also while paused, when
 * `hideWhenIdle` is off). Otherwise the manual text when there is one, so a
 * station name or "Back soon" can fill the gap. Otherwise nothing.
 */
export function nowPlayingView(data = {}, live = null) {
  const label = typeof data.label === 'string' ? data.label.trim() : NOW_PLAYING_DEFAULT_LABEL
  const manual = { title: text(data.title), artist: text(data.artist) }
  const hasManual = Boolean(manual.title || manual.artist)
  const hideWhenIdle = data.hideWhenIdle !== false
  const showArtwork = data.showArtwork !== false

  if (nowPlayingSource(data) === 'spotify' && live && text(live.title)) {
    if (live.playing || !hideWhenIdle) {
      return {
        show: true,
        from: 'spotify',
        title: text(live.title),
        artist: text(live.artist),
        artworkUrl: showArtwork ? text(live.artworkUrl) : '',
        label
      }
    }
  }
  if (hasManual) return { show: true, from: 'manual', ...manual, artworkUrl: '', label }
  return { show: false, from: 'none', title: '', artist: '', artworkUrl: '', label }
}

/** One line for status texts: "Title — Artist". */
export function nowPlayingLine(view) {
  if (!view?.show) return ''
  return [view.title, view.artist].filter(Boolean).join(' — ')
}

/** What the Spotify reader is doing, in words (operate card, Debug console). */
export function nowPlayingStatusText(live) {
  if (!live) return 'Waiting for Spotify…'
  const viaAccount = live.via === 'account'
  // Linked, but this reading came from the app: the account could not be read.
  const viaFallback = live.via === 'app' && live.account?.linked
  const who = viaAccount ? `Spotify account${live.account?.name ? ` ${live.account.name}` : ''}` : 'Spotify'
  switch (live.status) {
    case 'playing':
      return viaFallback ? 'Spotify app on this computer is playing (account not reachable)' : `${who} is playing`
    case 'paused':
      return viaFallback ? 'Spotify app on this computer is paused (account not reachable)' : `${who} is paused`
    case 'stopped':
      return viaAccount ? `Nothing is playing on ${who}` : 'Spotify has no track loaded'
    case 'not-running':
      return 'Spotify is not running on the ProVerlay computer'
    case 'unsupported':
      return 'Link a Spotify account: reading the Spotify app works on macOS and Windows only'
    case 'error':
      return live.error || 'Could not read Spotify'
    default:
      return 'Waiting for Spotify…'
  }
}
