/**
 * Operate card for the now-playing widget: what is on screen, where it comes
 * from (Spotify or typed text), the manual text, and the Spotify account link
 * (Web API; without it ProVerlay reads the Spotify app on its own computer).
 */
import {
  escapeHtml,
  patchData,
  replaceHtmlKeepFocus,
  setIfIdle,
  setText,
  syncToggleButton,
  toggleButtonHtml
} from '/public/shared/operate-ui.js'
import { showErrorToast } from '/public/shared/toast.js'
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
/* Spotify account link (GET /api/spotify), shared by every now-playing card. */
let account = null

async function fetchAccount() {
  try {
    const res = await fetch('/api/spotify')
    if (res.ok) account = await res.json()
  } catch {
    /* server unreachable */
  }
  return account
}

async function sendAccount(method, path, body, failureText) {
  try {
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.error || `${failureText} (${res.status})`)
    account = json
  } catch (err) {
    showErrorToast(err.message || failureText)
  }
  refreshAccountBlocks()
}

function accountHtml(acc) {
  if (!acc) return '<p class="op-status">Checking the Spotify account…</p>'
  if (acc.linked) {
    return `<p class="op-status">Spotify account: <strong>${escapeHtml(acc.name || 'linked')}</strong>. ProVerlay reads what this account plays, on any device. When Spotify cannot be reached it reads the Spotify app on this computer.</p>
      ${acc.local ? `<div class="op-grid op-grid--2"><button type="button" class="button button--gray" data-action="np-spotify-logout">Log out of Spotify</button></div>` : ''}`
  }
  const intro = acc.error
    ? escapeHtml(acc.error)
    : 'No Spotify account linked: ProVerlay reads the Spotify app on the ProVerlay computer (cover art on macOS only).'
  if (!acc.local) {
    return `<p class="op-status">${intro}</p>
      <p class="op-status">To link an account, open this card on the ProVerlay computer itself.</p>`
  }
  const login = acc.loginUrl
    ? `<a class="button button--live op-spotify-login" href="${escapeHtml(acc.loginUrl)}" target="_blank" rel="noopener noreferrer">Log in with Spotify</a>`
    : ''
  return `<p class="op-status">${intro}</p>
    <label class="field op-field">
      <span>Spotify Client ID</span>
      <input type="text" data-field="np-client-id" value="${escapeHtml(acc.clientId || '')}" placeholder="32 characters from the Spotify dashboard" maxlength="64" autocomplete="off" spellcheck="false" enterkeyhint="done" />
    </label>
    ${login}
    <p class="op-status">Once: create an app at developer.spotify.com/dashboard (Web API), add the redirect URI <code class="op-spotify-uri">${escapeHtml(acc.redirectUri)}</code>, paste its Client ID here and log in. The app owner needs Spotify Premium; up to five accounts per app (User Management).</p>`
}

/* Leave the block alone while the operator types in it (Client ID field). */
function renderAccountBlock(container) {
  if (!container || container.contains(document.activeElement)) return
  replaceHtmlKeepFocus(container, accountHtml(account))
}

function refreshAccountBlocks() {
  for (const block of document.querySelectorAll('[data-bind="np-account"]')) renderAccountBlock(block)
}

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
      <div class="pv-group__cell op-spotify-account" data-bind="np-account">${accountHtml(account)}</div>`
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
    const block = card.querySelector('[data-bind="np-account"]')
    await Promise.all([fetchLive(), block ? fetchAccount() : null])
    if (!card.isConnected) return
    renderAccountBlock(block)
    setText(card, '[data-bind="np-track"]', onScreenText(g))
    setText(card, '[data-bind="status-line"]', this.status(g))
  },

  async action(g, action) {
    const d = g.data || {}
    if (action === 'np-source-spotify') return patchData(g.id, { source: 'spotify' })
    if (action === 'np-source-manual') return patchData(g.id, { source: 'manual' })
    if (action === 'np-artwork') return patchData(g.id, { showArtwork: d.showArtwork === false })
    if (action === 'np-hide-idle') return patchData(g.id, { hideWhenIdle: d.hideWhenIdle === false })
    if (action === 'np-spotify-logout') return sendAccount('POST', '/api/spotify/logout', undefined, 'Could not log out of Spotify')
  },

  async field(g, field, value) {
    if (field === 'np-title') return patchData(g.id, { title: String(value).trim() })
    if (field === 'np-artist') return patchData(g.id, { artist: String(value).trim() })
    if (field === 'np-client-id') {
      // Blur first so the block can redraw with the login button.
      document.activeElement?.blur?.()
      return sendAccount('PUT', '/api/spotify/client-id', { clientId: String(value).trim() }, 'Client ID not saved')
    }
    if (field === 'np-label') return patchData(g.id, { label: String(value).trim() })
    if (field === 'np-width') {
      return patchData(g.id, { widthPx: nowPlayingWidth({ widthPx: Number(value) }) })
    }
  }
}
