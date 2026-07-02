import { patchGraphic, toggleGraphic } from '/public/shared/client.js'
import { createTickerMessage, migrateTickerMessages, tickerMessageText } from '/public/shared/ticker-messages.js'
import { formatClock, resolveLiveClock } from '/public/shared/match-utils.js'
import {
  formatMatchStatusLine,
  handleMatchOperateAction,
  handleMatchFieldChange,
  persistAutoStoppageIfNeeded,
  PERIOD_OPTIONS
} from '/public/shared/operate-match.js'
import {
  F1_SOURCE_OPTIONS,
  F1_GAP_MODES,
  normalizeManualDriver,
  renumberDrivers
} from '/public/shared/f1-timing.js'

const TYPE_LABELS = {
  matchScoreboard: 'Match score',
  customTicker: 'Ticker',
  streamCountdown: 'Stream countdown',
  lowerThird: 'Lower third',
  lowerThirdShow: 'Lower thirds',
  quizShow: 'Quiz',
  message: 'Message',
  f1Timing: 'F1 timing'
}

const clockRoots = new Set()
let clockTimer = null

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function operateStatusLine(graphic) {
  if (graphic.type === 'customTicker') {
    const messages = migrateTickerMessages(graphic.data?.messages || [])
    const enabled = messages.filter((m) => m.enabled).length
    return `${enabled} of ${messages.length} enabled`
  }
  if (graphic.type === 'matchScoreboard') {
    return formatMatchStatusLine(graphic.data?.clock || {})
  }
  if (graphic.type === 'f1Timing') {
    const source = graphic.data?.source === 'multiviewer' ? 'MultiViewer' : 'Manual'
    return `${source} · focus ${graphic.data?.focusDriver || '—'} · top ${graphic.data?.topCount || 5}`
  }
  return TYPE_LABELS[graphic.type] || graphic.type
}

function isEmbeddedSection(section) {
  return Boolean(section?.closest('.dashboard-operate-root'))
}

export function operateShellHtml(graphic, { embedded = false } = {}) {
  const live = graphic.visible ? 'Live' : 'Off'
  const liveClass = graphic.visible ? 'pill--live' : 'pill--muted'
  const statusText = operateStatusLine(graphic)
  const titleBlock = embedded
    ? ''
    : `<h2 class="pv-group__title">${escapeHtml(graphic.name)}</h2>`

  return `
    <section class="op-section operate-section${graphic.visible ? ' is-live' : ''}" data-graphic-id="${graphic.id}" data-type="${graphic.type}">
      <div class="pv-group">
        <header class="op-section-head${embedded ? ' op-section-head--compact' : ''}">
          <div class="op-section-head__text">
            ${titleBlock}
            <p class="op-status" data-bind="status-line">${escapeHtml(statusText)}</p>
          </div>
          <span class="pill ${liveClass}" data-bind="live-pill">${live}</span>
        </header>
        <div class="pv-group__cell pv-group__cell--actions">
          <div class="op-toolbar op-toolbar--primary">
            <button type="button" class="button ${graphic.visible ? 'button--gray' : 'button--live'} touch-btn" data-action="toggle-live">
              ${graphic.visible ? 'Hide' : 'Go live'}
            </button>
          </div>
        </div>
        <div class="operate-widget-mount" data-operate-mount></div>
      </div>
    </section>`
}

function tickerMessageRowHtml(m, i) {
  return `<li class="ticker-msg-list__item${m.enabled ? '' : ' is-disabled'}">
    <label class="ticker-msg-row">
      <input type="checkbox" class="ticker-msg-row__toggle" data-action="ticker-toggle" data-index="${i}" ${m.enabled ? 'checked' : ''} />
      <span class="ticker-msg-row__text">${escapeHtml(tickerMessageText(m))}</span>
    </label>
    <button type="button" class="button button--danger button--icon" data-action="ticker-del" data-index="${i}" title="Remove permanently" aria-label="Remove message">×</button>
  </li>`
}

export function tickerOperateHtml(graphic) {
  const messages = migrateTickerMessages(graphic.data?.messages || [])
  const items = messages.map(tickerMessageRowHtml).join('')
  return `
    <div class="pv-group__cell pv-group__cell--flush">
      <ul class="ticker-msg-list">${items || '<li class="ticker-msg-list__item"><span class="op-status">No messages yet</span></li>'}</ul>
    </div>
    <div class="pv-group__cell ticker-compose">
      <label class="field">
        <span>New message</span>
        <div class="ticker-compose__row">
          <input type="text" data-field="ticker-new" placeholder="Type a message…" />
          <button type="button" class="button button--primary ticker-compose__add" data-action="ticker-add">Add</button>
        </div>
      </label>
      <p class="op-status">New messages start disabled — enable when ready.</p>
    </div>`
}

export function matchOperateHtml(graphic, { embedded = false } = {}) {
  const d = graphic.data || {}
  const clock = d.clock || {}
  const live = resolveLiveClock(clock)
  const clockText = formatClock(clock)
  const homeCode = escapeHtml(d.homeCode || '')
  const awayCode = escapeHtml(d.awayCode || '')
  const homeName = escapeHtml(d.homeName || '')
  const awayName = escapeHtml(d.awayName || '')
  const showNames = Boolean(d.showNames)
  const embeddedClass = embedded ? ' match-operate--embedded' : ''

  return `
    <div class="match-operate${embeddedClass}">
      <div class="pv-group__cell pv-group__cell--flush">
        <div class="match-operate__teams">
          <div class="match-operate__team">
            <input class="match-operate__team-code" type="text" maxlength="4" data-field="homeCode" value="${homeCode}" aria-label="Home team code" spellcheck="false" />
            ${showNames ? `<input class="match-operate__team-name-input" type="text" data-field="homeName" value="${homeName}" aria-label="Home team name" spellcheck="false" />` : ''}
            <div class="match-operate__score" data-bind="homeScore">${d.homeScore ?? 0}</div>
            <div class="match-operate__score-actions">
              <button type="button" class="button button--gray match-operate__score-btn" data-action="home-minus" aria-label="Lower home score">−</button>
              <button type="button" class="button button--tinted match-operate__score-btn" data-action="home-plus" aria-label="Raise home score">+</button>
            </div>
          </div>
          <div class="match-operate__mid">
            <div class="match-operate__clock" data-bind="clock">${clockText}</div>
          </div>
          <div class="match-operate__team">
            <input class="match-operate__team-code" type="text" maxlength="4" data-field="awayCode" value="${awayCode}" aria-label="Away team code" spellcheck="false" />
            ${showNames ? `<input class="match-operate__team-name-input" type="text" data-field="awayName" value="${awayName}" aria-label="Away team name" spellcheck="false" />` : ''}
            <div class="match-operate__score" data-bind="awayScore">${d.awayScore ?? 0}</div>
            <div class="match-operate__score-actions">
              <button type="button" class="button button--gray match-operate__score-btn" data-action="away-minus" aria-label="Lower away score">−</button>
              <button type="button" class="button button--tinted match-operate__score-btn" data-action="away-plus" aria-label="Raise away score">+</button>
            </div>
          </div>
        </div>
      </div>
      <div class="pv-group__cell match-operate__clock-set">
        <div class="match-operate__clock-fields">
          <label class="field match-operate__clock-field">
            <span>Minute</span>
            <input type="number" min="0" max="130" inputmode="numeric" data-field="minute" value="${live.minute ?? 0}" />
          </label>
          <label class="field match-operate__clock-field">
            <span>Second</span>
            <input type="number" min="0" max="59" inputmode="numeric" data-field="second" value="${live.second ?? 0}" />
          </label>
        </div>
      </div>
      <div class="pv-group__cell pv-group__cell--flush">
        <div class="match-operate__nudge-grid" role="group" aria-label="Adjust clock">
          <button type="button" class="match-operate__nudge-btn" data-action="sec-minus-1">−1s</button>
          <button type="button" class="match-operate__nudge-btn" data-action="sec-plus-1">+1s</button>
          <button type="button" class="match-operate__nudge-btn" data-action="sec-minus">−15s</button>
          <button type="button" class="match-operate__nudge-btn" data-action="sec-plus">+15s</button>
          <button type="button" class="match-operate__nudge-btn" data-action="min-minus">−1 min</button>
          <button type="button" class="match-operate__nudge-btn" data-action="min-plus">+1 min</button>
        </div>
      </div>
      <div class="pv-group__cell match-operate__controls">
        <button type="button" class="button ${clock.running ? 'button--gray' : 'button--live'} match-operate__clock-btn" data-action="toggle-clock">
          ${clock.running ? 'Pause' : 'Start'}
        </button>
        <label class="field match-operate__period">
          <span>Period</span>
          <select data-field="period">
            ${PERIOD_OPTIONS.map((p) => `<option value="${p.value}"${clock.period === p.value ? ' selected' : ''}>${p.label}</option>`).join('')}
          </select>
        </label>
        <button type="button" class="button ${clock.autoStoppageAt90 ? 'button--live' : 'button--gray'} match-operate__auto-stoppage" data-action="toggle-auto-stoppage">
          Automatic stoppage from 90'
        </button>
      </div>
    </div>`
}

function f1DriverRowHtml(d, i) {
  return `<li class="f1-drv-row" data-index="${i}">
    <span class="f1-drv-row__pos">${i + 1}</span>
    <input class="f1-drv-row__code" type="text" maxlength="3" data-field="f1-drv-code" data-index="${i}" value="${escapeHtml(d.code || '')}" spellcheck="false" aria-label="Driver code" />
    <input class="f1-drv-row__name" type="text" data-field="f1-drv-name" data-index="${i}" value="${escapeHtml(d.name || '')}" spellcheck="false" aria-label="Driver name" placeholder="Name" />
    <input class="f1-drv-row__gap" type="text" data-field="f1-drv-gap" data-index="${i}" value="${escapeHtml(d.interval || d.gap || '')}" spellcheck="false" aria-label="Gap" placeholder="+0.000" />
    <span class="f1-drv-row__actions">
      <button type="button" class="button button--gray button--icon" data-action="f1-drv-up" data-index="${i}" aria-label="Move up">↑</button>
      <button type="button" class="button button--gray button--icon" data-action="f1-drv-down" data-index="${i}" aria-label="Move down">↓</button>
      <button type="button" class="button button--danger button--icon" data-action="f1-drv-del" data-index="${i}" aria-label="Remove">×</button>
    </span>
  </li>`
}

export function f1OperateHtml(graphic) {
  const d = graphic.data || {}
  const mv = d.multiviewer || {}
  const isLiveSource = d.source === 'multiviewer'
  const drivers = d.drivers || []

  return `
    <div class="f1-operate">
      <div class="pv-group__cell f1-operate__config">
        <label class="field">
          <span>Source</span>
          <select data-field="f1-source">
            ${F1_SOURCE_OPTIONS.map((o) => `<option value="${o.value}"${d.source === o.value ? ' selected' : ''}>${o.label}</option>`).join('')}
          </select>
        </label>
        <label class="field">
          <span>Focus driver</span>
          <input type="text" maxlength="3" data-field="f1-focus" value="${escapeHtml(d.focusDriver || '')}" placeholder="VER" spellcheck="false" />
        </label>
        <label class="field">
          <span>Top positions</span>
          <input type="number" min="1" max="20" inputmode="numeric" data-field="f1-topcount" value="${d.topCount || 5}" />
        </label>
        <label class="field">
          <span>Gap display</span>
          <select data-field="f1-gapmode">
            ${F1_GAP_MODES.map((o) => `<option value="${o.value}"${(d.gapMode || 'interval') === o.value ? ' selected' : ''}>${o.label}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="pv-group__cell f1-operate__mv" data-f1-mv ${isLiveSource ? '' : 'hidden'}>
        <div class="f1-operate__mv-fields">
          <label class="field">
            <span>MultiViewer host</span>
            <input type="text" data-field="f1-mv-host" value="${escapeHtml(mv.host || '127.0.0.1')}" spellcheck="false" />
          </label>
          <label class="field">
            <span>Port</span>
            <input type="number" min="1" max="65535" inputmode="numeric" data-field="f1-mv-port" value="${mv.port || 10101}" />
          </label>
          <label class="field">
            <span>Delay (seconds)</span>
            <input type="number" min="0" max="120" step="0.5" inputmode="decimal" data-field="f1-mv-delay" value="${(Number(mv.delayMs) || 0) / 1000}" />
          </label>
        </div>
        <p class="op-status" data-bind="f1-status">Waiting for MultiViewer…</p>
        <p class="op-status" data-bind="f1-preview"></p>
      </div>
      <div class="pv-group__cell pv-group__cell--flush f1-operate__manual" data-f1-manual ${isLiveSource ? 'hidden' : ''}>
        <ul class="f1-drv-list">
          ${drivers.map(f1DriverRowHtml).join('') || '<li class="f1-drv-row"><span class="op-status">No drivers yet</span></li>'}
        </ul>
        <div class="f1-operate__add">
          <button type="button" class="button button--primary" data-action="f1-drv-add">Add driver</button>
        </div>
      </div>
    </div>`
}

export function updateF1OperateMount(mount, graphic) {
  const d = graphic.data || {}
  const mv = d.multiviewer || {}
  const isLiveSource = d.source === 'multiviewer'

  const setIfIdle = (selector, value) => {
    const input = mount.querySelector(selector)
    if (input && document.activeElement !== input) input.value = value
  }
  setIfIdle('[data-field="f1-source"]', d.source || 'manual')
  setIfIdle('[data-field="f1-focus"]', d.focusDriver || '')
  setIfIdle('[data-field="f1-topcount"]', d.topCount || 5)
  setIfIdle('[data-field="f1-gapmode"]', d.gapMode || 'interval')
  setIfIdle('[data-field="f1-mv-host"]', mv.host || '127.0.0.1')
  setIfIdle('[data-field="f1-mv-port"]', mv.port || 10101)
  setIfIdle('[data-field="f1-mv-delay"]', (Number(mv.delayMs) || 0) / 1000)

  const mvBlock = mount.querySelector('[data-f1-mv]')
  if (mvBlock) mvBlock.hidden = !isLiveSource
  const manualBlock = mount.querySelector('[data-f1-manual]')
  if (manualBlock) manualBlock.hidden = isLiveSource

  // Rijderslijst alleen verversen als niemand er in aan het typen is
  const list = mount.querySelector('.f1-drv-list')
  if (list && !list.contains(document.activeElement)) {
    const drivers = d.drivers || []
    list.innerHTML =
      drivers.map(f1DriverRowHtml).join('') ||
      '<li class="f1-drv-row"><span class="op-status">No drivers yet</span></li>'
  }
}

export async function handleF1FieldChange(graphic, field, value) {
  const d = graphic.data || {}
  if (field === 'f1-source') {
    await patchGraphic(graphic.id, { data: { source: value === 'multiviewer' ? 'multiviewer' : 'manual' } })
  } else if (field === 'f1-focus') {
    await patchGraphic(graphic.id, { data: { focusDriver: String(value || '').trim().toUpperCase().slice(0, 3) } })
  } else if (field === 'f1-topcount') {
    const n = Math.min(20, Math.max(1, Number(value) || 5))
    await patchGraphic(graphic.id, { data: { topCount: n } })
  } else if (field === 'f1-gapmode') {
    await patchGraphic(graphic.id, { data: { gapMode: value === 'leader' ? 'leader' : 'interval' } })
  } else if (field === 'f1-mv-host') {
    await patchGraphic(graphic.id, { data: { multiviewer: { host: String(value || '').trim() || '127.0.0.1' } } })
  } else if (field === 'f1-mv-port') {
    await patchGraphic(graphic.id, { data: { multiviewer: { port: Math.max(1, Number(value) || 10101) } } })
  } else if (field === 'f1-mv-delay') {
    const ms = Math.max(0, Math.round((Number(value) || 0) * 1000))
    await patchGraphic(graphic.id, { data: { multiviewer: { delayMs: ms } } })
  } else if (field === 'f1-drv-code' || field === 'f1-drv-name' || field === 'f1-drv-gap') {
    return // afgehandeld met index via handleF1DriverEdit
  }
}

async function handleF1DriverEdit(graphic, field, index, value) {
  const drivers = [...(graphic.data?.drivers || [])]
  if (!drivers[index]) return
  const d = { ...drivers[index] }
  if (field === 'f1-drv-code') d.code = String(value || '').trim().toUpperCase().slice(0, 3)
  if (field === 'f1-drv-name') d.name = String(value || '').trim()
  if (field === 'f1-drv-gap') {
    d.interval = String(value || '').trim()
    d.gap = String(value || '').trim()
  }
  drivers[index] = d
  await patchGraphic(graphic.id, { data: { drivers } })
}

async function handleF1Action(graphic, action, event) {
  const idx = Number(event?.target?.closest('[data-action]')?.dataset.index)
  let drivers = (graphic.data?.drivers || []).map((d, i) => normalizeManualDriver(d, i))

  if (action === 'f1-drv-add') {
    drivers.push(normalizeManualDriver({ code: '', name: '', gap: '' }, drivers.length))
  } else if (action === 'f1-drv-del') {
    if (Number.isNaN(idx)) return
    drivers.splice(idx, 1)
  } else if (action === 'f1-drv-up') {
    if (Number.isNaN(idx) || idx <= 0) return
    ;[drivers[idx - 1], drivers[idx]] = [drivers[idx], drivers[idx - 1]]
  } else if (action === 'f1-drv-down') {
    if (Number.isNaN(idx) || idx >= drivers.length - 1) return
    ;[drivers[idx], drivers[idx + 1]] = [drivers[idx + 1], drivers[idx]]
  } else {
    return
  }

  await patchGraphic(graphic.id, { data: { drivers: renumberDrivers(drivers) } })
}

// Statuspoll voor F1-secties met MultiViewer-bron: toont verbinding + top-3
// preview zodat de operator ziet dat de data klopt vóór hij live gaat.
let f1StatusTimer = null

async function pollF1Status() {
  for (const { root, getGraphic } of clockRoots) {
    for (const section of root.querySelectorAll('[data-type="f1Timing"]')) {
      const graphic = getGraphic(section.dataset.graphicId)
      if (!graphic || graphic.data?.source !== 'multiviewer') continue
      const statusEl = section.querySelector('[data-bind="f1-status"]')
      const previewEl = section.querySelector('[data-bind="f1-preview"]')
      if (!statusEl) continue
      try {
        const res = await fetch(`/api/f1/${encodeURIComponent(graphic.id)}/live`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const snap = await res.json()
        if (snap.status?.connected) {
          statusEl.textContent = `MultiViewer connected · ${snap.rows.length} drivers${snap.session?.lapText ? ` · ${snap.session.lapText}` : ''}`
          if (previewEl) {
            previewEl.textContent = snap.rows
              .slice(0, 5)
              .map((r) => `${r.pos} ${r.code}`)
              .join('  ·  ')
          }
        } else {
          statusEl.textContent = snap.status?.lastError
            ? `Not connected — ${snap.status.lastError}`
            : 'Waiting for MultiViewer live timing…'
          if (previewEl) previewEl.textContent = ''
        }
      } catch {
        statusEl.textContent = 'ProVerlay server unreachable'
      }
    }
  }
}

function ensureF1StatusTimer() {
  const needs = [...clockRoots].some(({ root, getGraphic }) =>
    [...root.querySelectorAll('[data-type="f1Timing"]')].some((section) => {
      const graphic = getGraphic(section.dataset.graphicId)
      return graphic?.data?.source === 'multiviewer'
    })
  )
  if (needs && !f1StatusTimer) {
    f1StatusTimer = setInterval(pollF1Status, 2500)
    pollF1Status()
  } else if (!needs && f1StatusTimer) {
    clearInterval(f1StatusTimer)
    f1StatusTimer = null
  }
}

export function genericOperateMountHtml(graphic) {
  const focus = encodeURIComponent(graphic.id)
  return `<div class="pv-group__cell">
    <p class="operate-link-out"><a href="/operator?focus=${focus}">Open in Operator</a> for score, clock, and roster controls.</p>
  </div>`
}

function updateTickerOperateMount(mount, graphic) {
  const messages = migrateTickerMessages(graphic.data?.messages || [])
  const draft = mount.querySelector('[data-field="ticker-new"]')?.value ?? ''
  const list = mount.querySelector('.ticker-msg-list')
  if (list) {
    list.innerHTML =
      messages.map(tickerMessageRowHtml).join('') ||
      '<li class="ticker-msg-list__item"><span class="op-status">No messages yet</span></li>'
  }
  const input = mount.querySelector('[data-field="ticker-new"]')
  if (input && document.activeElement !== input && draft) input.value = draft
}

function updateMatchOperateMount(mount, graphic) {
  const d = graphic.data || {}
  const clock = d.clock || {}
  const live = resolveLiveClock(clock)

  mount.querySelectorAll('[data-bind="homeScore"]').forEach((n) => {
    n.textContent = d.homeScore ?? 0
  })
  mount.querySelectorAll('[data-bind="awayScore"]').forEach((n) => {
    n.textContent = d.awayScore ?? 0
  })
  const clockEl = mount.querySelector('[data-bind="clock"]')
  if (clockEl) clockEl.textContent = formatClock(clock)

  const minuteInput = mount.querySelector('[data-field="minute"]')
  const secondInput = mount.querySelector('[data-field="second"]')
  if (minuteInput && document.activeElement !== minuteInput) minuteInput.value = live.minute ?? 0
  if (secondInput && document.activeElement !== secondInput) secondInput.value = live.second ?? 0

  const clockBtn = mount.querySelector('[data-action="toggle-clock"]')
  if (clockBtn) {
    clockBtn.className = `button ${clock.running ? 'button--gray' : 'button--live'} match-operate__clock-btn`
    clockBtn.textContent = clock.running ? 'Pause' : 'Start'
  }

  const periodSelect = mount.querySelector('[data-field="period"]')
  if (periodSelect && document.activeElement !== periodSelect) {
    periodSelect.value = clock.period || 'second_half'
  }

  const autoStoppageBtn = mount.querySelector('[data-action="toggle-auto-stoppage"]')
  if (autoStoppageBtn) {
    autoStoppageBtn.className = `button ${clock.autoStoppageAt90 ? 'button--live' : 'button--gray'} match-operate__auto-stoppage`
  }

  const homeCodeInput = mount.querySelector('[data-field="homeCode"]')
  const awayCodeInput = mount.querySelector('[data-field="awayCode"]')
  const homeNameInput = mount.querySelector('[data-field="homeName"]')
  const awayNameInput = mount.querySelector('[data-field="awayName"]')
  if (homeCodeInput && document.activeElement !== homeCodeInput) homeCodeInput.value = d.homeCode || ''
  if (awayCodeInput && document.activeElement !== awayCodeInput) awayCodeInput.value = d.awayCode || ''
  if (homeNameInput && document.activeElement !== homeNameInput) homeNameInput.value = d.homeName || ''
  if (awayNameInput && document.activeElement !== awayNameInput) awayNameInput.value = d.awayName || ''
}

function tickOperateMatchClocks(root, getGraphic) {
  for (const section of root.querySelectorAll('[data-type="matchScoreboard"]')) {
    const graphic = getGraphic(section.dataset.graphicId)
    if (!graphic?.data?.clock?.running) continue
    void persistAutoStoppageIfNeeded(graphic)
    const mount = section.querySelector('[data-operate-mount]')
    if (!mount) continue
    updateMatchOperateMount(mount, graphic)
    const status = section.querySelector('[data-bind="status-line"]')
    if (status) status.textContent = formatMatchStatusLine(graphic.data.clock)
  }
}

function ensureOperateClockTimer() {
  const needs = [...clockRoots].some(({ root, getGraphic }) =>
    [...root.querySelectorAll('[data-type="matchScoreboard"]')].some((section) => {
      const graphic = getGraphic(section.dataset.graphicId)
      return graphic?.data?.clock?.running
    })
  )
  if (needs && !clockTimer) {
    clockTimer = setInterval(() => {
      for (const { root, getGraphic } of clockRoots) {
        tickOperateMatchClocks(root, getGraphic)
      }
    }, 250)
  } else if (!needs && clockTimer) {
    clearInterval(clockTimer)
    clockTimer = null
  }
}

export async function handleOperateAction(graphic, action, event, root) {
  if (action === 'toggle-live') {
    await toggleGraphic(graphic.id, !graphic.visible)
    return
  }

  if (graphic.type === 'matchScoreboard') {
    const result = await handleMatchOperateAction(graphic, action, event)
    if (result && typeof result === 'object' && result.data) {
      const section = event?.target?.closest('[data-graphic-id]')
      const mount = section?.querySelector('[data-operate-mount]')
      if (mount) updateMatchOperateMount(mount, result)
    }
    ensureOperateClockTimer()
    return
  }

  if (graphic.type === 'f1Timing') {
    await handleF1Action(graphic, action, event)
    return
  }

  if (graphic.type !== 'customTicker') return

  const data = structuredClone(graphic.data || {})
  let list = migrateTickerMessages(data.messages || [])

  if (action === 'ticker-add') {
    const text = root.querySelector('[data-field="ticker-new"]')?.value?.trim()
    if (!text) return
    list.push(createTickerMessage(text, { enabled: false }))
    data.messages = list
    await patchGraphic(graphic.id, { data })
    return
  }

  if (action === 'ticker-del') {
    const idx = Number(event?.target?.closest('[data-action]')?.dataset.index)
    if (Number.isNaN(idx)) return
    list.splice(idx, 1)
    data.messages = list
    await patchGraphic(graphic.id, { data })
    return
  }

  if (action === 'ticker-toggle') {
    const idx = Number(event?.target?.closest('[data-action]')?.dataset.index)
    if (Number.isNaN(idx) || !list[idx]) return
    list[idx] = { ...list[idx], enabled: event.target.checked }
    data.messages = list
    await patchGraphic(graphic.id, { data })
  }
}

export function wireOperateSection(root, getGraphic) {
  if (root.dataset.operateWired === '1') return
  root.dataset.operateWired = '1'
  clockRoots.add({ root, getGraphic })

  root.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-action]')
    if (!btn || btn.tagName === 'INPUT') return
    const section = btn.closest('[data-graphic-id]')
    if (!section) return
    const graphic = getGraphic(section.dataset.graphicId)
    if (!graphic) return
    await handleOperateAction(graphic, btn.dataset.action, event, section)
  })

  root.addEventListener('change', async (event) => {
    const input = event.target.closest('[data-action="ticker-toggle"]')
    if (input) {
      const section = input.closest('[data-graphic-id]')
      if (!section) return
      const graphic = getGraphic(section.dataset.graphicId)
      if (!graphic) return
      await handleOperateAction(graphic, 'ticker-toggle', event, section)
      return
    }

    const field = event.target.dataset?.field
    if (typeof field === 'string' && field.startsWith('f1-')) {
      const section = event.target.closest('[data-graphic-id]')
      if (!section) return
      const graphic = getGraphic(section.dataset.graphicId)
      if (!graphic || graphic.type !== 'f1Timing') return
      if (['f1-drv-code', 'f1-drv-name', 'f1-drv-gap'].includes(field)) {
        await handleF1DriverEdit(graphic, field, Number(event.target.dataset.index), event.target.value)
      } else {
        await handleF1FieldChange(graphic, field, event.target.value)
      }
      ensureF1StatusTimer()
      return
    }
    if (!['minute', 'second', 'period', 'homeCode', 'awayCode', 'homeName', 'awayName'].includes(field)) return
    const section = event.target.closest('[data-graphic-id]')
    if (!section) return
    const graphic = getGraphic(section.dataset.graphicId)
    if (!graphic || graphic.type !== 'matchScoreboard') return
    await handleMatchFieldChange(graphic, field, event.target.value)
    ensureOperateClockTimer()
  })

  const fieldDebounce = {}
  root.addEventListener('input', async (event) => {
    const field = event.target.dataset?.field
    if (!['homeCode', 'awayCode', 'homeName', 'awayName'].includes(field)) return
    const section = event.target.closest('[data-graphic-id]')
    if (!section) return
    const graphic = getGraphic(section.dataset.graphicId)
    if (!graphic || graphic.type !== 'matchScoreboard') return
    const key = `${section.dataset.graphicId}:${field}`
    clearTimeout(fieldDebounce[key])
    fieldDebounce[key] = setTimeout(async () => {
      const latest = getGraphic(section.dataset.graphicId)
      if (!latest || latest.type !== 'matchScoreboard') return
      await handleMatchFieldChange(latest, field, event.target.value)
    }, 350)
  })

  ensureF1StatusTimer()
}

export function refreshOperateSection(section, graphic) {
  if (!section || !graphic) return
  section.classList.toggle('is-live', Boolean(graphic.visible))
  const pill = section.querySelector('[data-bind="live-pill"]')
  if (pill) {
    pill.className = `pill ${graphic.visible ? 'pill--live' : 'pill--muted'}`
    pill.textContent = graphic.visible ? 'Live' : 'Off'
  }
  const status = section.querySelector('[data-bind="status-line"]')
  if (status) status.textContent = operateStatusLine(graphic)
  const liveBtn = section.querySelector('[data-action="toggle-live"]')
  if (liveBtn) {
    liveBtn.className = `button ${graphic.visible ? 'button--gray' : 'button--live'} touch-btn`
    liveBtn.textContent = graphic.visible ? 'Hide' : 'Go live'
  }
  const mount = section.querySelector('[data-operate-mount]')
  if (!mount) return
  if (graphic.type === 'customTicker') {
    if (!mount.querySelector('.ticker-msg-list')) {
      mount.innerHTML = tickerOperateHtml(graphic)
    } else {
      updateTickerOperateMount(mount, graphic)
    }
  } else if (graphic.type === 'matchScoreboard') {
    if (!mount.querySelector('.match-operate')) {
      mount.innerHTML = matchOperateHtml(graphic, { embedded: isEmbeddedSection(section) })
    } else {
      updateMatchOperateMount(mount, graphic)
    }
  } else if (graphic.type === 'f1Timing') {
    if (!mount.querySelector('.f1-operate')) {
      mount.innerHTML = f1OperateHtml(graphic)
    } else {
      updateF1OperateMount(mount, graphic)
    }
    ensureF1StatusTimer()
  } else if (!mount.querySelector('.operate-link-out')) {
    mount.innerHTML = genericOperateMountHtml(graphic)
  }

  for (const { root, getGraphic } of clockRoots) {
    if (root.contains(section)) {
      ensureOperateClockTimer()
      break
    }
  }
}

export function tickerMessagesForDisplay(messages) {
  return migrateTickerMessages(messages).map((m) => ({
    ...m,
    text: tickerMessageText(m)
  }))
}
