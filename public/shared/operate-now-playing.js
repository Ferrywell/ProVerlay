/**
 * Operate card for the now-playing widget: what is on screen, where it comes
 * from (Spotify on the ProVerlay computer or typed text) and the manual text.
 */
import { escapeHtml, patchData, setIfIdle, setText, syncToggleButton, toggleButtonHtml } from '/public/shared/operate-ui.js'
import {
  NOW_PLAYING_DEFAULT_LABEL,
  NOW_PLAYING_WIDTH_MAX,
  NOW_PLAYING_WIDTH_MIN,
  nowPlayingLine,
  nowPlayingSource,
  nowPlayingStatusText,
  nowPlayingView,
  nowPlayingWidth
} from '/public/shared/now-playing.js'

/* The reading is the same for every widget (one Spotify per computer). */
let live = null

async function fetchLive() {
  try {
    const res = await fetch('/api/now-playing')
    if (res.ok) live = await res.json()
  } catch {
    /* server unreachable: the connection banner already says so */
  }
  return live
}

function onScreenText(g) {
  const view = nowPlayingView(g.data || {}, live)
  if (!view.show) return 'Nothing to show'
  return nowPlayingLine(view)
}

function sourceText(g) {
  return nowPlayingSource(g.data) === 'manual' ? 'Manual text' : nowPlayingStatusText(live)
}

function sourceButtonsHtml(source) {
  return `<div class="op-grid op-grid--2" role="group" aria-label="Source">
    ${toggleButtonHtml('np-source-spotify', 'Spotify', source === 'spotify')}
    ${toggleButtonHtml('np-source-manual', 'Manual text', source === 'manual')}
  </div>`
}

function textFieldHtml(label, field, value, placeholder = '') {
  return `<label class="field op-field">
    <span>${label}</span>
    <input type="text" data-field="${field}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" maxlength="300" enterkeyhint="done" />
  </label>`
}

export const nowPlayingCard = {
  label: 'Now playing',

  status(g) {
    return `${sourceText(g)} · ${onScreenText(g)}`
  },

  primary(g) {
    const d = g.data || {}
    const source = nowPlayingSource(d)
    return `<div class="pv-group__cell">
        <p class="op-status">On screen</p>
        <p class="op-now-playing__track" data-bind="np-track">${escapeHtml(onScreenText(g))}</p>
      </div>
      <div class="pv-group__cell">${sourceButtonsHtml(source)}</div>
      <div class="pv-group__cell op-grid op-grid--2">
        ${textFieldHtml('Title', 'np-title', d.title || '', source === 'spotify' ? 'Shown when Spotify is silent' : 'Track title')}
        ${textFieldHtml('Artist', 'np-artist', d.artist || '')}
      </div>`
  },

  more(g) {
    const d = g.data || {}
    return `<div class="pv-group__cell op-grid op-grid--2">
        ${textFieldHtml('Label', 'np-label', typeof d.label === 'string' ? d.label : NOW_PLAYING_DEFAULT_LABEL, 'No label')}
        <label class="field op-field">
          <span>Width (px at 1080p)</span>
          <input type="number" min="${NOW_PLAYING_WIDTH_MIN}" max="${NOW_PLAYING_WIDTH_MAX}" step="10" inputmode="numeric" data-field="np-width" value="${nowPlayingWidth(d)}" />
        </label>
      </div>
      <div class="pv-group__cell op-grid op-grid--2">
        ${toggleButtonHtml('np-artwork', 'Cover art', d.showArtwork !== false)}
        ${toggleButtonHtml('np-hide-idle', 'Hide when paused', d.hideWhenIdle !== false)}
      </div>
      <div class="pv-group__cell">
        <p class="op-status">Spotify is read from the app on the ProVerlay computer; no account or API key. Cover art needs macOS and an internet connection.</p>
      </div>`
  },

  update(card, g) {
    const d = g.data || {}
    const source = nowPlayingSource(d)
    setText(card, '[data-bind="np-track"]', onScreenText(g))
    syncToggleButton(card, 'np-source-spotify', source === 'spotify')
    syncToggleButton(card, 'np-source-manual', source === 'manual')
    syncToggleButton(card, 'np-artwork', d.showArtwork !== false)
    syncToggleButton(card, 'np-hide-idle', d.hideWhenIdle !== false)
    setIfIdle(card, '[data-field="np-title"]', d.title || '')
    setIfIdle(card, '[data-field="np-artist"]', d.artist || '')
    setIfIdle(card, '[data-field="np-label"]', typeof d.label === 'string' ? d.label : NOW_PLAYING_DEFAULT_LABEL)
    setIfIdle(card, '[data-field="np-width"]', nowPlayingWidth(d))
  },

  /* Follow Spotify while the widget reads from it (shared 2.5 s poll in operate-card.js). */
  polling: (g) => nowPlayingSource(g.data) === 'spotify',
  async poll(card, g) {
    await fetchLive()
    if (!card.isConnected) return
    setText(card, '[data-bind="np-track"]', onScreenText(g))
    setText(card, '[data-bind="status-line"]', this.status(g))
  },

  async action(g, action) {
    const d = g.data || {}
    if (action === 'np-source-spotify') return patchData(g.id, { source: 'spotify' })
    if (action === 'np-source-manual') return patchData(g.id, { source: 'manual' })
    if (action === 'np-artwork') return patchData(g.id, { showArtwork: d.showArtwork === false })
    if (action === 'np-hide-idle') return patchData(g.id, { hideWhenIdle: d.hideWhenIdle === false })
  },

  async field(g, field, value) {
    if (field === 'np-title') return patchData(g.id, { title: String(value).trim() })
    if (field === 'np-artist') return patchData(g.id, { artist: String(value).trim() })
    if (field === 'np-label') return patchData(g.id, { label: String(value).trim() })
    if (field === 'np-width') {
      return patchData(g.id, { widthPx: nowPlayingWidth({ widthPx: Number(value) }) })
    }
  }
}
