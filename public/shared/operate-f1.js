/** F1 timing tower operate card (f1Timing): MultiViewer live or manual standings. */
import {
  F1_SOURCE_OPTIONS,
  F1_GAP_MODES,
  F1_ANIMATION_OPTIONS,
  F1_DECIMAL_OPTIONS,
  resolveF1Animation,
  resolveF1Decimals,
  normalizeManualDriver,
  renumberDrivers
} from '/public/shared/f1-timing.js'
import { escapeHtml, patchData, setIfIdle, syncToggleButton, toggleButtonHtml } from '/public/shared/operate-ui.js'

const MV_HELP_KEY = 'pv-f1-mv-help-dismissed'

function mvHelpDismissed() {
  try {
    return localStorage.getItem(MV_HELP_KEY) === '1'
  } catch {
    return false
  }
}

function setMvHelpDismissed(dismissed) {
  try {
    if (dismissed) localStorage.setItem(MV_HELP_KEY, '1')
    else localStorage.removeItem(MV_HELP_KEY)
  } catch {
    /* private mode */
  }
}

function syncMvHelp(card, { forceOpen = false } = {}) {
  const help = card.querySelector('[data-f1-mv-help]')
  if (!help) return
  const open = forceOpen || !mvHelpDismissed()
  help.hidden = !open
  const toggle = card.querySelector('[data-action="f1-toggle-mv-help"]')
  if (toggle) toggle.textContent = open ? 'Hide tip' : 'Setup tip'
}

async function openMultiViewerApp() {
  try {
    const res = await fetch('/api/system/open-multiviewer', { method: 'POST' })
    const body = await res.json().catch(() => ({}))
    if (!body.opened && body.url) window.open(body.url, '_blank', 'noopener,noreferrer')
  } catch {
    window.open('https://multiviewer.app', '_blank', 'noopener,noreferrer')
  }
}

function selectHtml(label, field, options, value) {
  return `<label class="field op-field">
    <span>${label}</span>
    <select data-field="${field}">
      ${options.map((o) => `<option value="${o.value}"${String(value) === String(o.value) ? ' selected' : ''}>${o.label}</option>`).join('')}
    </select>
  </label>`
}

function inputHtml(label, field, value, attrs = '') {
  return `<label class="field op-field">
    <span>${label}</span>
    <input ${attrs} data-field="${field}" value="${escapeHtml(value)}" spellcheck="false" />
  </label>`
}

function driverRowHtml(d, i) {
  return `<li class="f1-drv-row">
    <span class="f1-drv-row__pos">${i + 1}</span>
    <input class="f1-drv-row__code" type="text" maxlength="3" data-field="f1-drv-code" data-index="${i}" value="${escapeHtml(d.code || '')}" spellcheck="false" aria-label="Driver ${i + 1} code" />
    <input class="f1-drv-row__name" type="text" data-field="f1-drv-name" data-index="${i}" value="${escapeHtml(d.name || '')}" spellcheck="false" aria-label="Driver ${i + 1} name" placeholder="Name" />
    <input class="f1-drv-row__gap" type="text" data-field="f1-drv-gap" data-index="${i}" value="${escapeHtml(d.interval || d.gap || '')}" spellcheck="false" aria-label="Driver ${i + 1} gap" placeholder="+0.000" />
    <span class="f1-drv-row__actions">
      <button type="button" class="button button--gray button--icon" data-action="f1-drv-up" data-index="${i}" aria-label="Move driver ${i + 1} up">↑</button>
      <button type="button" class="button button--gray button--icon" data-action="f1-drv-down" data-index="${i}" aria-label="Move driver ${i + 1} down">↓</button>
      <button type="button" class="button button--danger button--icon" data-action="f1-drv-del" data-index="${i}" aria-label="Remove driver ${i + 1}">×</button>
    </span>
  </li>`
}

function driversHtml(drivers = []) {
  return drivers.map(driverRowHtml).join('') || '<li class="f1-drv-row"><span class="op-status">No drivers yet</span></li>'
}

/* Live status poll: dot + text + top-5 preview, so the operator sees timing
   is really coming in before going live. */
export async function refreshF1LiveStatus(card, graphic) {
  const statusEl = card.querySelector('[data-bind="f1-status"]')
  const previewEl = card.querySelector('[data-bind="f1-preview"]')
  const dot = card.querySelector('[data-bind="f1-status-dot"]')
  if (!statusEl) return
  const set = (state, text, preview = '') => {
    if (dot) dot.className = `f1-status-dot ${state}`
    statusEl.textContent = text
    if (previewEl) previewEl.textContent = preview
  }
  try {
    const res = await fetch(`/api/f1/${encodeURIComponent(graphic.id)}/live`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const snap = await res.json()
    if (snap.status?.connected) {
      set(
        'is-live',
        `Live timing OK · ${snap.rows.length} drivers${snap.session?.lapText ? ` · ${snap.session.lapText}` : ''}`,
        snap.rows.slice(0, 5).map((r) => `${r.pos} ${r.code}`).join('  ·  ')
      )
    } else {
      set('is-off', snap.status?.lastError ? `No data — ${snap.status.lastError}` : 'No data — waiting for MultiViewer live timing…')
    }
  } catch {
    set('is-off', 'ProVerlay server unreachable')
  }
}

export const f1Card = {
  label: 'F1 timing',

  status(g) {
    const d = g.data || {}
    const source = d.source === 'multiviewer' ? 'MultiViewer live' : 'Manual standings'
    return `${source} · focus ${d.focusDriver || '—'} · top ${d.topCount || 5}`
  },

  primary(g) {
    const d = g.data || {}
    const live = d.source === 'multiviewer'
    return `<div class="pv-group__cell op-grid op-grid--3">
        ${selectHtml('Source', 'f1-source', F1_SOURCE_OPTIONS, d.source || 'manual')}
        ${inputHtml('Focus driver', 'f1-focus', d.focusDriver || '', 'type="text" maxlength="3" placeholder="VER"')}
        ${inputHtml('Top positions', 'f1-topcount', d.topCount || 5, 'type="number" min="1" max="20" inputmode="numeric"')}
      </div>
      <div class="pv-group__cell f1-operate__mv" data-f1-mv${live ? '' : ' hidden'}>
        <p class="op-status f1-live-line">
          <span class="f1-status-dot" data-bind="f1-status-dot"></span>
          <span data-bind="f1-status">Checking live timing…</span>
        </p>
        <p class="op-status" data-bind="f1-preview"></p>
        <div class="op-grid op-grid--2">
          <button type="button" class="button button--secondary" data-action="f1-open-multiviewer">Open MultiViewer</button>
          <button type="button" class="button button--gray" data-action="f1-toggle-mv-help">Setup tip</button>
        </div>
        <aside class="f1-mv-help" data-f1-mv-help hidden>
          <p class="f1-mv-help__lead">Live timing must be on in MultiViewer — playing video alone sends no standings.</p>
          <ol class="f1-mv-help__steps">
            <li>Open MultiViewer and load the F1 session.</li>
            <li>Start <strong>Live Timing</strong> (replays: <strong>Replay Live Timing</strong> on the session card).</li>
            <li>Confirm ProVerlay host/port match MultiViewer (default <code>127.0.0.1:10101</code>).</li>
          </ol>
          <button type="button" class="button button--gray" data-action="f1-dismiss-mv-help">Got it</button>
        </aside>
      </div>
      <div class="pv-group__cell pv-group__cell--flush f1-operate__manual" data-f1-manual${live ? ' hidden' : ''}>
        <ul class="f1-drv-list">${driversHtml(d.drivers)}</ul>
        <div class="op-grid op-grid--2 f1-operate__add">
          <button type="button" class="button button--primary" data-action="f1-drv-add">Add driver</button>
          <button type="button" class="button button--secondary" data-action="f1-import-drivers">Import from MultiViewer</button>
        </div>
        <p class="op-status f1-operate__import-status" data-bind="f1-import-status"></p>
      </div>`
  },

  more(g) {
    const d = g.data || {}
    const mv = d.multiviewer || {}
    return `<div class="pv-group__cell op-grid op-grid--3">
        ${selectHtml('Gap display', 'f1-gapmode', F1_GAP_MODES, d.gapMode || 'interval')}
        ${selectHtml('Gap decimals', 'f1-decimals', F1_DECIMAL_OPTIONS, resolveF1Decimals(d))}
        ${selectHtml('Animation', 'f1-anim', F1_ANIMATION_OPTIONS, resolveF1Animation(d).in)}
      </div>
      <div class="pv-group__cell op-grid op-grid--2">
        ${toggleButtonHtml('f1-toggle-header', 'Lap counter (LAP x/y)', d.showHeader)}
        ${toggleButtonHtml('f1-toggle-tyres', 'Tyre compound', d.showTyres)}
      </div>
      <div class="pv-group__cell op-grid op-grid--3">
        ${inputHtml('MultiViewer host', 'f1-mv-host', mv.host || '127.0.0.1', 'type="text"')}
        ${inputHtml('Port', 'f1-mv-port', mv.port || 10101, 'type="number" min="1" max="65535" inputmode="numeric"')}
        ${inputHtml('Delay (seconds)', 'f1-mv-delay', (Number(mv.delayMs) || 0) / 1000, 'type="number" min="0" max="120" step="0.5" inputmode="decimal"')}
      </div>`
  },

  update(card, g) {
    const d = g.data || {}
    const mv = d.multiviewer || {}
    const live = d.source === 'multiviewer'
    setIfIdle(card, '[data-field="f1-source"]', d.source || 'manual')
    setIfIdle(card, '[data-field="f1-focus"]', d.focusDriver || '')
    setIfIdle(card, '[data-field="f1-topcount"]', d.topCount || 5)
    setIfIdle(card, '[data-field="f1-gapmode"]', d.gapMode || 'interval')
    setIfIdle(card, '[data-field="f1-decimals"]', String(resolveF1Decimals(d)))
    setIfIdle(card, '[data-field="f1-anim"]', resolveF1Animation(d).in)
    setIfIdle(card, '[data-field="f1-mv-host"]', mv.host || '127.0.0.1')
    setIfIdle(card, '[data-field="f1-mv-port"]', mv.port || 10101)
    setIfIdle(card, '[data-field="f1-mv-delay"]', (Number(mv.delayMs) || 0) / 1000)
    syncToggleButton(card, 'f1-toggle-header', d.showHeader)
    syncToggleButton(card, 'f1-toggle-tyres', d.showTyres)
    card.querySelector('[data-f1-mv]').hidden = !live
    card.querySelector('[data-f1-manual]').hidden = live
    if (live) syncMvHelp(card)
    // Only rebuild the driver list when nobody is typing in it.
    const list = card.querySelector('.f1-drv-list')
    if (list && !list.contains(document.activeElement)) list.innerHTML = driversHtml(d.drivers)
  },

  /** Polled every few seconds by operate-card.js while the source is MultiViewer. */
  polling: (g) => g.data?.source === 'multiviewer',
  poll: refreshF1LiveStatus,

  async action(g, action, ctx) {
    const d = g.data || {}
    const card = ctx.card
    if (action === 'f1-toggle-header') return patchData(g.id, { showHeader: !d.showHeader })
    if (action === 'f1-toggle-tyres') return patchData(g.id, { showTyres: !d.showTyres })
    if (action === 'f1-open-multiviewer') return openMultiViewerApp()
    if (action === 'f1-dismiss-mv-help') {
      setMvHelpDismissed(true)
      return syncMvHelp(card)
    }
    if (action === 'f1-toggle-mv-help') {
      const open = card.querySelector('[data-f1-mv-help]')?.hidden
      setMvHelpDismissed(!open)
      return syncMvHelp(card, { forceOpen: open })
    }
    if (action === 'f1-import-drivers') {
      const statusEl = card.querySelector('[data-bind="f1-import-status"]')
      const mv = d.multiviewer || {}
      const target = `${mv.host || '127.0.0.1'}:${mv.port || 10101}`
      statusEl.textContent = `Importing from ${target}…`
      try {
        const res = await fetch(`/api/f1/${encodeURIComponent(g.id)}/import-drivers`, { method: 'POST' })
        const body = await res.json()
        statusEl.textContent = res.ok
          ? `Imported ${body.imported} drivers from MultiViewer (${target})`
          : `${body.error || 'Import failed'} (${target})`
      } catch {
        statusEl.textContent = 'ProVerlay server unreachable'
      }
      return
    }

    const idx = Number(ctx.target.dataset.index)
    const drivers = (d.drivers || []).map((drv, i) => normalizeManualDriver(drv, i))
    if (action === 'f1-drv-add') drivers.push(normalizeManualDriver({ code: '', name: '', gap: '' }, drivers.length))
    else if (action === 'f1-drv-del' && drivers[idx]) drivers.splice(idx, 1)
    else if (action === 'f1-drv-up' && idx > 0) [drivers[idx - 1], drivers[idx]] = [drivers[idx], drivers[idx - 1]]
    else if (action === 'f1-drv-down' && idx < drivers.length - 1) [drivers[idx], drivers[idx + 1]] = [drivers[idx + 1], drivers[idx]]
    else return
    return patchData(g.id, { drivers: renumberDrivers(drivers) })
  },

  async field(g, field, value, ctx) {
    const v = String(value ?? '').trim()
    if (field.startsWith('f1-drv-')) {
      const drivers = [...(g.data?.drivers || [])]
      const idx = Number(ctx.target.dataset.index)
      if (!drivers[idx]) return
      const drv = { ...drivers[idx] }
      if (field === 'f1-drv-code') drv.code = v.toUpperCase().slice(0, 3)
      if (field === 'f1-drv-name') drv.name = v
      if (field === 'f1-drv-gap') drv.interval = drv.gap = v
      drivers[idx] = drv
      return patchData(g.id, { drivers })
    }
    const patches = {
      'f1-source': () => ({ source: v === 'multiviewer' ? 'multiviewer' : 'manual' }),
      'f1-focus': () => ({ focusDriver: v.toUpperCase().slice(0, 3) }),
      'f1-topcount': () => ({ topCount: Math.min(20, Math.max(1, Number(v) || 5)) }),
      'f1-gapmode': () => ({ gapMode: v === 'leader' ? 'leader' : 'interval' }),
      'f1-decimals': () => ({ gapDecimals: F1_DECIMAL_OPTIONS.some((o) => o.value === v) ? v : '1' }),
      'f1-anim': () => ({ animation: { in: F1_ANIMATION_OPTIONS.some((o) => o.value === v) ? v : 'slide-left' } }),
      'f1-mv-host': () => ({ multiviewer: { host: v || '127.0.0.1' } }),
      'f1-mv-port': () => ({ multiviewer: { port: Math.max(1, Number(v) || 10101) } }),
      'f1-mv-delay': () => ({ multiviewer: { delayMs: Math.max(0, Math.round((Number(v) || 0) * 1000)) } })
    }
    if (patches[field]) return patchData(g.id, patches[field]())
  }
}
