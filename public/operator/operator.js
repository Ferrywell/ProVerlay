import { patchGraphic, toggleGraphic } from '/public/shared/client.js'
import {
  createTickerMessage,
  migrateTickerMessages,
  tickerMessageText
} from '/public/shared/ticker-messages.js'
import {
  formatClock,
  PERIOD_OPTIONS,
  resolveLiveClock,
  widgetVisible
} from '/public/shared/match-utils.js'
import {
  formatMatchStatusLine,
  handleMatchOperateAction,
  handleMatchFieldChange,
  matchPenaltyCount,
  matchPenaltySide,
  matchPenaltiesVisible,
  persistAutoStoppageIfNeeded
} from '/public/shared/operate-match.js'
import { wireRenderPreviewLinks } from '/public/shared/render-preview.js'
import { applyServerTimeFromState } from '/public/shared/server-time.js'

const root = document.getElementById('operator-root')
const title = document.getElementById('op-title')
const focusChip = document.getElementById('op-focus-chip')
const connectionStatus = document.getElementById('connection-status')
const focusId = new URLSearchParams(window.location.search).get('focus')

let currentState = null
let clockTimer = null
let mounted = false
let showWidgetTitles = false

function sectionHead(graphic, statusText, { livePill = true, statusBind = false } = {}) {
  const titleBlock = showWidgetTitles
    ? `<h2 class="pv-group__title">${escapeHtml(graphic.name)}</h2>`
    : ''
  const statusAttr = statusBind ? ' data-bind="status-line"' : ''
  const statusBlock = statusText
    ? `<p class="op-status"${statusAttr}>${statusText}</p>`
    : ''
  const pill = livePill
    ? `<span class="pill ${graphic.visible ? 'pill--live' : 'pill--muted'}" data-bind="live-pill">${graphic.visible ? 'Live' : 'Off'}</span>`
    : ''
  if (!titleBlock && !statusBlock && !pill) return ''
  return `
    <header class="op-section-head">
      <div class="op-section-head__text">
        ${titleBlock}
        ${statusBlock}
      </div>
      ${pill}
    </header>`
}

function setConnectionStatus(connected) {
  connectionStatus?.classList.toggle('is-connected', connected)
  connectionStatus?.classList.toggle('is-offline', !connected)
}

function operatorGraphics() {
  return (currentState?.graphics || []).filter((g) => g.operator)
}

function penaltyCount(kicks = []) {
  return matchPenaltyCount(kicks)
}

function nextPenaltySide(homeKicks, awayKicks) {
  return matchPenaltySide({}, { homeKicks, awayKicks })
}

function penaltiesEnabled(data = {}) {
  return matchPenaltiesVisible(data)
}

function formatOpStatusLine(clock = {}) {
  return formatMatchStatusLine(clock)
}

function updateFocusChip(name, itemCount = 1) {
  if (!focusChip) return
  if (focusId && name && itemCount > 1) {
    focusChip.hidden = false
    focusChip.textContent = name
  } else {
    focusChip.hidden = true
    focusChip.textContent = ''
  }
}

function matchCardTemplate(graphic) {
  const d = graphic.data || {}
  const clock = d.clock || {}
  const penalties = d.penalties || {}
  const clockText = formatClock(clock)
  const nextSide = nextPenaltySide(penalties.homeKicks || [], penalties.awayKicks || [])
  // Penalty-blok alleen tonen als de periode op penalties staat
  const showPenalties = penaltiesEnabled(d) && clock.period === 'penalties'

  return `
    <section class="op-section score-panel${graphic.visible ? ' is-live' : ''}" data-graphic-id="${graphic.id}" data-type="${graphic.type}">
      <div class="pv-group">
      ${sectionHead(graphic, formatOpStatusLine(clock), { statusBind: true })}
      <div class="pv-group__cell pv-group__cell--flush">
      <div class="score-teams">
        <div class="team-block">
          <input class="team-code-input" type="text" maxlength="4" data-field="homeCode" value="${escapeHtml(d.homeCode || '')}" aria-label="Home team code" spellcheck="false" />
          ${d.showNames ? `<input class="team-name-input" type="text" data-field="homeName" value="${escapeHtml(d.homeName || '')}" aria-label="Home team name" spellcheck="false" />` : ''}
          <div class="score-value" data-bind="homeScore">${d.homeScore ?? 0}</div>
          <div class="score-actions">
            <button class="button button--gray touch-btn touch-btn--score" data-action="home-minus">−</button>
            <button class="button button--tinted touch-btn touch-btn--score" data-action="home-plus">+</button>
          </div>
        </div>
        <div class="score-mid">
          <div class="clock-display" data-bind="clock">${clockText}</div>
          <div data-bind="period">${PERIOD_OPTIONS.find((p) => p.value === clock.period)?.label || clock.period}</div>
        </div>
        <div class="team-block">
          <input class="team-code-input" type="text" maxlength="4" data-field="awayCode" value="${escapeHtml(d.awayCode || '')}" aria-label="Away team code" spellcheck="false" />
          ${d.showNames ? `<input class="team-name-input" type="text" data-field="awayName" value="${escapeHtml(d.awayName || '')}" aria-label="Away team name" spellcheck="false" />` : ''}
          <div class="score-value" data-bind="awayScore">${d.awayScore ?? 0}</div>
          <div class="score-actions">
            <button class="button button--gray touch-btn touch-btn--score" data-action="away-minus">−</button>
            <button class="button button--tinted touch-btn touch-btn--score" data-action="away-plus">+</button>
          </div>
        </div>
      </div>
      </div>
      <div class="pv-group__cell">
      <div class="clock-controls">
        <label class="field field--inline">
          <span>Minute</span>
          <input type="number" min="0" max="130" data-field="minute" value="${clock.minute ?? 0}" />
        </label>
        <label class="field field--inline">
          <span>Second</span>
          <input type="number" min="0" max="59" data-field="second" value="${clock.second ?? 0}" />
        </label>
        <label class="field field--inline field--grow">
          <span>Period</span>
          <select data-field="period">
            ${PERIOD_OPTIONS.map((p) => `<option value="${p.value}"${clock.period === p.value ? ' selected' : ''}>${p.label}</option>`).join('')}
          </select>
        </label>
      </div>
      </div>
      <div class="pv-group__cell pv-group__cell--flush">
        <div class="pv-segmented pv-segmented--cols-3" role="group" aria-label="Adjust seconds">
          <button type="button" class="pv-segmented__btn" data-action="sec-minus-1">−1s</button>
          <button type="button" class="pv-segmented__btn" data-action="sec-plus-1">+1s</button>
          <button type="button" class="pv-segmented__btn" data-action="sec-minus">−15s</button>
        </div>
        <div class="pv-segmented pv-segmented--cols-3" role="group" aria-label="Adjust minutes">
          <button type="button" class="pv-segmented__btn" data-action="sec-plus">+15s</button>
          <button type="button" class="pv-segmented__btn" data-action="min-minus">−1 min</button>
          <button type="button" class="pv-segmented__btn" data-action="min-plus">+1 min</button>
        </div>
        <button type="button" class="button ${clock.stoppageTime ? 'button--live' : 'button--gray'} touch-btn clock-adjust__stoppage" data-action="toggle-stoppage">
          ${clock.stoppageTime ? 'Stoppage (45+/90+)' : 'Normal time'}
        </button>
        <button type="button" class="button ${clock.autoStoppageAt90 ? 'button--live' : 'button--gray'} touch-btn clock-adjust__auto-stoppage" data-action="toggle-auto-stoppage">
          Automatic stoppage from 90'
        </button>
      </div>
      <div class="pv-group__cell pv-group__cell--actions">
      <div class="op-toolbar op-toolbar--primary">
        <button type="button" class="button ${clock.running ? 'button--gray' : 'button--live'} touch-btn" data-action="toggle-clock">
          ${clock.running ? 'Pause' : 'Start clock'}
        </button>
        <button type="button" class="button ${widgetVisible(d.widgets, 'clock') ? 'button--gray' : 'button--secondary'} touch-btn" data-action="toggle-clock-visible">
          ${widgetVisible(d.widgets, 'clock') ? 'Hide clock' : 'Show clock'}
        </button>
        <button type="button" class="button ${graphic.visible ? 'button--gray' : 'button--live'} touch-btn" data-action="toggle-live">
          ${graphic.visible ? 'Hide' : 'Go live'}
        </button>
      </div>
      </div>
      <div class="penalty-section pv-group__cell${penalties.active ? ' is-active' : ''}"${showPenalties ? '' : ' hidden'}>
        <div class="penalty-head">
          <h3>Penalties</h3>
          <button class="button ${penalties.active ? 'button--live' : 'button--secondary'} touch-btn" data-action="toggle-penalties">
            ${penalties.active ? 'Active' : 'Off'}
          </button>
        </div>
        <div class="penalty-score">
          <span>${d.homeCode || 'HOME'} <span data-bind="pen-home">${penaltyCount(penalties.homeKicks)}</span></span>
          <span>—</span>
          <span><span data-bind="pen-away">${penaltyCount(penalties.awayKicks)}</span> ${d.awayCode || 'AWAY'}</span>
        </div>
        <div class="op-toolbar" data-pen-toolbar>
          <button class="button button--primary touch-btn" data-action="pen-home-goal" ${!penalties.active || nextSide !== 'home' ? 'disabled' : ''}>${d.homeCode} goal</button>
          <button class="button button--danger touch-btn" data-action="pen-home-miss" ${!penalties.active || nextSide !== 'home' ? 'disabled' : ''}>${d.homeCode} miss</button>
          <button class="button button--primary touch-btn" data-action="pen-away-goal" ${!penalties.active || nextSide !== 'away' ? 'disabled' : ''}>${d.awayCode} goal</button>
          <button class="button button--danger touch-btn" data-action="pen-away-miss" ${!penalties.active || nextSide !== 'away' ? 'disabled' : ''}>${d.awayCode} miss</button>
          <button class="button button--secondary touch-btn" data-action="pen-undo">Undo last</button>
          <button class="button button--secondary touch-btn" data-action="pen-reset">Reset</button>
        </div>
      </div>
      </div>
    </section>
  `
}

function legacyCardTemplate(graphic) {
  const d = graphic.data
  return `
    <section class="op-section score-panel${graphic.visible ? ' is-live' : ''}" data-graphic-id="${graphic.id}" data-type="${graphic.type}">
      <div class="pv-group">
      ${sectionHead(graphic, `${escapeHtml(d.homeTeam)} vs ${escapeHtml(d.awayTeam)}`)}
      <div class="pv-group__cell pv-group__cell--flush">
      <div class="score-teams">
        <div class="team-block">
          <div class="team-name">${d.homeTeam}</div>
          <div class="score-value">${d.homeScore}</div>
          <div class="score-actions">
            <button class="button button--gray touch-btn touch-btn--score" data-action="home-minus">−</button>
            <button class="button button--tinted touch-btn touch-btn--score" data-action="home-plus">+</button>
          </div>
        </div>
        <div class="score-mid">
          <div>${d.period}</div>
          <div>${d.showClock ? `${d.minute}'` : ''}</div>
        </div>
        <div class="team-block">
          <div class="team-name">${d.awayTeam}</div>
          <div class="score-value">${d.awayScore}</div>
          <div class="score-actions">
            <button class="button button--gray touch-btn touch-btn--score" data-action="away-minus">−</button>
            <button class="button button--tinted touch-btn touch-btn--score" data-action="away-plus">+</button>
          </div>
        </div>
      </div>
      </div>
      <div class="pv-group__cell pv-group__cell--actions">
      <div class="op-toolbar op-toolbar--primary">
        <button type="button" class="button button--gray touch-btn" data-action="minute-minus">−1 min</button>
        <button type="button" class="button button--gray touch-btn" data-action="minute-plus">+1 min</button>
        <button type="button" class="button ${graphic.visible ? 'button--gray' : 'button--live'} touch-btn" data-action="toggle-live">
          ${graphic.visible ? 'Hide' : 'Go live'}
        </button>
      </div>
      </div>
      </div>
    </section>
  `
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function lowerThirdShowCardTemplate(graphic) {
  const entries = graphic.data?.entries || []
  const activeId = graphic.data?.activeEntryId
  return `
    <section class="op-section${graphic.visible ? ' is-live' : ''}" data-graphic-id="${graphic.id}" data-type="${graphic.type}">
      <div class="pv-group">
      ${sectionHead(graphic, `${entries.length} ${entries.length === 1 ? 'person' : 'people'}`)}
      <div class="pv-group__cell">
      <div class="roster-touch-grid">
        ${entries.length
          ? entries
              .map((entry) => {
                const isActive = graphic.visible && activeId === entry.id
                return `<button type="button" class="button touch-btn roster-touch-btn ${isActive ? 'button--live' : 'button--secondary'}" data-action="lt-show" data-entry-id="${entry.id}">
                  <span class="roster-touch-name">${escapeHtml(entry.name)}</span>
                  ${entry.title ? `<span class="roster-touch-meta">${escapeHtml(entry.title)}</span>` : ''}
                </button>`
              })
              .join('')
          : '<p class="op-status">No people in this list yet. Add them on the dashboard.</p>'}
      </div>
      </div>
      <div class="pv-group__cell pv-group__cell--actions">
      <div class="op-toolbar op-toolbar--primary">
        <button type="button" class="button button--gray touch-btn" data-action="lt-hide" ${!graphic.visible ? 'disabled' : ''}>Hide</button>
        <button type="button" class="button ${graphic.visible ? 'button--gray' : 'button--live'} touch-btn" data-action="toggle-live">
          ${graphic.visible ? 'Hide' : 'Go live'}
        </button>
      </div>
      </div>
      </div>
    </section>
  `
}

function quizShowCardTemplate(graphic) {
  const d = graphic.data || {}
  const questions = d.questions || []
  const activeId = d.activeQuestionId
  return `
    <section class="op-section${graphic.visible ? ' is-live' : ''}" data-graphic-id="${graphic.id}" data-type="${graphic.type}">
      <div class="pv-group">
      ${sectionHead(graphic, `${questions.length} ${questions.length === 1 ? 'question' : 'questions'}${d.revealed ? ' · answer revealed' : ''}`)}
      <div class="pv-group__cell">
      <div class="roster-touch-grid roster-touch-grid--wide">
        ${questions.length
          ? questions
              .map((q) => {
                const isActive = graphic.visible && activeId === q.id
                return `<button type="button" class="button touch-btn roster-touch-btn ${isActive ? 'button--live' : 'button--secondary'}" data-action="quiz-show" data-entry-id="${q.id}">
                  <span class="roster-touch-name">${escapeHtml(q.question)}</span>
                </button>`
              })
              .join('')
          : '<p class="op-status">No questions yet. Add them on the dashboard.</p>'}
      </div>
      </div>
      <div class="pv-group__cell pv-group__cell--actions">
      <div class="op-toolbar op-toolbar--primary">
        <button type="button" class="button ${d.revealed ? 'button--live' : 'button--primary'} touch-btn" data-action="quiz-reveal" ${!graphic.visible || !activeId ? 'disabled' : ''}>
          ${d.revealed ? 'Hide answer' : 'Reveal answer'}
        </button>
        <button type="button" class="button button--gray touch-btn" data-action="quiz-hide" ${!graphic.visible ? 'disabled' : ''}>Hide</button>
      </div>
      </div>
      </div>
    </section>
  `
}

function tickerMessagesHtml(messages) {
  return migrateTickerMessages(messages)
    .map(
      (m, i) =>
        `<li class="ticker-msg-list__item${m.enabled ? '' : ' is-disabled'}">
          <label class="ticker-msg-row">
            <input type="checkbox" class="ticker-msg-row__toggle" data-action="ticker-toggle" data-index="${i}" ${m.enabled ? 'checked' : ''} />
            <span class="ticker-msg-row__text">${escapeHtml(tickerMessageText(m))}</span>
          </label>
          <button type="button" class="button button--danger button--icon" data-action="ticker-del" data-index="${i}" title="Remove permanently" aria-label="Remove message">×</button>
        </li>`
    )
    .join('')
}

function updateTickerCard(card, graphic) {
  const d = graphic.data || {}
  const messages = migrateTickerMessages(d.messages || [])
  const list = card.querySelector('.ticker-msg-list')
  if (list) list.innerHTML = tickerMessagesHtml(messages)
  const status = card.querySelector('.op-status')
  if (status) status.textContent = `${messages.length} ${messages.length === 1 ? 'message' : 'messages'}`
  const speedInput = card.querySelector('[data-field="ticker-speed"]')
  if (speedInput && document.activeElement !== speedInput) {
    speedInput.value = d.speed ?? 90
    const out = card.querySelector('[data-bind="speed-out"]')
    if (out) out.textContent = d.speed ?? 90
  }
  const sizeInput = card.querySelector('[data-field="ticker-fontsize"]')
  if (sizeInput && document.activeElement !== sizeInput) {
    sizeInput.value = d.fontSize ?? 30
    const out = card.querySelector('[data-bind="fontsize-out"]')
    if (out) out.textContent = d.fontSize ?? 30
  }
  updateLiveState(card, graphic)
}

function tickerCardTemplate(graphic) {
  const d = graphic.data || {}
  const messages = migrateTickerMessages(d.messages || [])
  return `
    <section class="op-section${graphic.visible ? ' is-live' : ''}" data-graphic-id="${graphic.id}" data-type="${graphic.type}">
      <div class="pv-group">
      ${sectionHead(graphic, `${messages.length} ${messages.length === 1 ? 'message' : 'messages'}`)}
      <div class="pv-group__cell pv-group__cell--flush">
      <ul class="ticker-msg-list">${tickerMessagesHtml(messages)}</ul>
      </div>
      <div class="pv-group__cell ticker-compose">
      <label class="field">
        <span>New message</span>
        <div class="ticker-compose__row">
          <input type="text" data-field="ticker-new" placeholder="Type a message…" />
          <button type="button" class="button button--primary ticker-compose__add" data-action="ticker-add">Add</button>
        </div>
      </label>
      <p class="op-status">New messages start disabled.</p>
      <label class="field field--slider">
        <span>Speed · <output data-bind="speed-out">${d.speed ?? 90}</output> px/s</span>
        <input type="range" min="30" max="240" step="5" data-field="ticker-speed" value="${d.speed ?? 90}" />
      </label>
      <label class="field field--slider">
        <span>Font size · <output data-bind="fontsize-out">${d.fontSize ?? 30}</output> px</span>
        <input type="range" min="16" max="200" step="2" data-field="ticker-fontsize" value="${d.fontSize ?? 30}" />
      </label>
      </div>
      <div class="pv-group__cell pv-group__cell--actions">
      <div class="op-toolbar op-toolbar--primary">
        <button type="button" class="button ${graphic.visible ? 'button--gray' : 'button--live'} touch-btn" data-action="toggle-live">
          ${graphic.visible ? 'Hide' : 'Go live'}
        </button>
      </div>
      </div>
      </div>
    </section>
  `
}

function cardTemplate(graphic) {
  if (graphic.type === 'matchScoreboard') return matchCardTemplate(graphic)
  if (graphic.type === 'customTicker') return tickerCardTemplate(graphic)
  if (graphic.type === 'lowerThirdShow') return lowerThirdShowCardTemplate(graphic)
  if (graphic.type === 'quizShow') return quizShowCardTemplate(graphic)
  return legacyCardTemplate(graphic)
}

function updateLiveState(card, graphic) {
  card.classList.toggle('is-live', Boolean(graphic.visible))
  const pill = card.querySelector('[data-bind="live-pill"]')
  if (pill) {
    pill.className = `pill ${graphic.visible ? 'pill--live' : 'pill--muted'}`
    pill.textContent = graphic.visible ? 'Live' : 'Off'
  }
  const liveBtn = card.querySelector('[data-action="toggle-live"]')
  if (liveBtn) {
    liveBtn.className = `button ${graphic.visible ? 'button--gray' : 'button--live'} touch-btn`
    liveBtn.textContent = graphic.visible ? 'Hide' : 'Go live'
  }
}

function updateMatchCard(card, graphic) {
  const d = graphic.data || {}
  const clock = d.clock || {}
  const penalties = d.penalties || {}
  const nextSide = nextPenaltySide(penalties.homeKicks || [], penalties.awayKicks || [])

  card.querySelectorAll('[data-bind="homeScore"]').forEach((n) => { n.textContent = d.homeScore ?? 0 })
  card.querySelectorAll('[data-bind="awayScore"]').forEach((n) => { n.textContent = d.awayScore ?? 0 })

  const homeCodeInput = card.querySelector('[data-field="homeCode"]')
  const awayCodeInput = card.querySelector('[data-field="awayCode"]')
  const homeNameInput = card.querySelector('[data-field="homeName"]')
  const awayNameInput = card.querySelector('[data-field="awayName"]')
  if (homeCodeInput && document.activeElement !== homeCodeInput) homeCodeInput.value = d.homeCode || ''
  if (awayCodeInput && document.activeElement !== awayCodeInput) awayCodeInput.value = d.awayCode || ''
  if (homeNameInput && document.activeElement !== homeNameInput) homeNameInput.value = d.homeName || ''
  if (awayNameInput && document.activeElement !== awayNameInput) awayNameInput.value = d.awayName || ''

  const homeCode = d.homeCode || 'HOME'
  const awayCode = d.awayCode || 'AWAY'
  const penScore = card.querySelector('.penalty-score')
  if (penScore) {
    penScore.innerHTML = `<span>${homeCode} <span data-bind="pen-home">${penaltyCount(penalties.homeKicks)}</span></span><span>—</span><span><span data-bind="pen-away">${penaltyCount(penalties.awayKicks)}</span> ${awayCode}</span>`
  }
  card.querySelectorAll('[data-action="pen-home-goal"]').forEach((btn) => { btn.textContent = `${homeCode} goal` })
  card.querySelectorAll('[data-action="pen-home-miss"]').forEach((btn) => { btn.textContent = `${homeCode} miss` })
  card.querySelectorAll('[data-action="pen-away-goal"]').forEach((btn) => { btn.textContent = `${awayCode} goal` })
  card.querySelectorAll('[data-action="pen-away-miss"]').forEach((btn) => { btn.textContent = `${awayCode} miss` })

  const clockEl = card.querySelector('[data-bind="clock"]')
  if (clockEl) clockEl.textContent = formatClock(clock)
  const periodEl = card.querySelector('[data-bind="period"]')
  if (periodEl) {
    periodEl.textContent = PERIOD_OPTIONS.find((p) => p.value === clock.period)?.label || clock.period
  }
  const penHomeEl = card.querySelector('[data-bind="pen-home"]')
  if (penHomeEl) penHomeEl.textContent = penaltyCount(penalties.homeKicks)
  const penAwayEl = card.querySelector('[data-bind="pen-away"]')
  if (penAwayEl) penAwayEl.textContent = penaltyCount(penalties.awayKicks)

  const minuteInput = card.querySelector('[data-field="minute"]')
  const secondInput = card.querySelector('[data-field="second"]')
  const periodSelect = card.querySelector('[data-field="period"]')
  if (minuteInput && document.activeElement !== minuteInput) minuteInput.value = clock.minute ?? 0
  if (secondInput && document.activeElement !== secondInput) secondInput.value = clock.second ?? 0
  if (periodSelect && document.activeElement !== periodSelect) periodSelect.value = clock.period || 'second_half'

  const clockBtn = card.querySelector('[data-action="toggle-clock"]')
  if (clockBtn) {
    clockBtn.className = `button ${clock.running ? 'button--gray' : 'button--live'} touch-btn`
    clockBtn.textContent = clock.running ? 'Pause' : 'Start clock'
  }
  const clockVisBtn = card.querySelector('[data-action="toggle-clock-visible"]')
  if (clockVisBtn) {
    const show = widgetVisible(d.widgets, 'clock')
    clockVisBtn.className = `button ${show ? 'button--gray' : 'button--secondary'} touch-btn`
    clockVisBtn.textContent = show ? 'Hide clock' : 'Show clock'
  }
  const stoppageBtn = card.querySelector('[data-action="toggle-stoppage"]')
  if (stoppageBtn) {
    stoppageBtn.className = `button ${clock.stoppageTime ? 'button--live' : 'button--gray'} touch-btn clock-adjust__stoppage`
    stoppageBtn.textContent = clock.stoppageTime ? 'Stoppage (45+/90+)' : 'Normal time'
  }
  const autoStoppageBtn = card.querySelector('[data-action="toggle-auto-stoppage"]')
  if (autoStoppageBtn) {
    autoStoppageBtn.className = `button ${clock.autoStoppageAt90 ? 'button--live' : 'button--gray'} touch-btn clock-adjust__auto-stoppage`
  }
  updateLiveState(card, graphic)
  const penBtn = card.querySelector('[data-action="toggle-penalties"]')
  if (penBtn) {
    penBtn.className = `button ${penalties.active ? 'button--live' : 'button--secondary'} touch-btn`
    penBtn.textContent = penalties.active ? 'Active' : 'Off'
  }
  const status = card.querySelector('[data-bind="status-line"]')
  if (status) {
    status.textContent = formatOpStatusLine(clock)
  }

  const penaltySection = card.querySelector('.penalty-section')
  if (penaltySection) {
    // Alleen tonen als de periode op penalties staat
    penaltySection.hidden = !(penaltiesEnabled(d) && clock.period === 'penalties')
    penaltySection.classList.toggle('is-active', Boolean(penalties.active))
  }

  card.querySelectorAll('[data-action="pen-home-goal"], [data-action="pen-home-miss"]').forEach((btn) => {
    btn.disabled = !penalties.active || nextSide !== 'home'
  })
  card.querySelectorAll('[data-action="pen-away-goal"], [data-action="pen-away-miss"]').forEach((btn) => {
    btn.disabled = !penalties.active || nextSide !== 'away'
  })
}


async function handleAction(graphicId, action, event) {
  const latest = currentState.graphics.find((g) => g.id === graphicId)
  if (!latest) return

  if (latest.type === 'lowerThirdShow') {
    if (action === 'toggle-live') {
      await toggleGraphic(graphicId, !latest.visible)
      return
    }
    if (action === 'lt-hide') {
      await fetch(`/api/graphics/${graphicId}/hide`, { method: 'POST' })
      return
    }
    if (action === 'lt-show') {
      const entryId = event?.target?.closest('[data-action]')?.dataset.entryId
      if (!entryId) return
      await fetch(`/api/graphics/${graphicId}/entries/${entryId}/show`, { method: 'POST' })
      return
    }
    return
  }

  if (latest.type === 'quizShow') {
    if (action === 'toggle-live') {
      await toggleGraphic(graphicId, !latest.visible)
      return
    }
    if (action === 'quiz-hide') {
      await toggleGraphic(graphicId, false)
      return
    }
    if (action === 'quiz-reveal') {
      await patchGraphic(graphicId, { data: { revealed: !latest.data?.revealed } })
      return
    }
    if (action === 'quiz-show') {
      const entryId = event?.target?.closest('[data-action]')?.dataset.entryId
      if (!entryId) return
      await patchGraphic(graphicId, {
        visible: true,
        data: { activeQuestionId: entryId, revealed: false }
      })
      return
    }
    return
  }

  if (latest.type === 'customTicker') {
    if (action === 'toggle-live') {
      await toggleGraphic(graphicId, !latest.visible)
      return
    }
    const data = structuredClone(latest.data)
    const list = migrateTickerMessages(data.messages || [])
    if (action === 'ticker-add') {
      const card = root.querySelector(`[data-graphic-id="${graphicId}"]`)
      const text = card?.querySelector('[data-field="ticker-new"]')?.value?.trim()
      if (!text) return
      list.push(createTickerMessage(text, { enabled: false }))
    }
    if (action === 'ticker-del') {
      const idx = Number(event?.target?.closest('[data-action]')?.dataset.index)
      if (!Number.isNaN(idx)) list.splice(idx, 1)
    }
    if (action === 'ticker-toggle') {
      const idx = Number(event?.target?.closest('[data-action]')?.dataset.index)
      if (!Number.isNaN(idx) && list[idx]) {
        list[idx] = { ...list[idx], enabled: event.target.checked }
      }
    }
    data.messages = list
    await patchGraphic(graphicId, { data })
    return
  }

  if (latest.type === 'matchScoreboard') {
    const result = await handleMatchOperateAction(latest, action, event)
    if (result && typeof result === 'object' && result.data) {
      const card = root.querySelector(`[data-graphic-id="${graphicId}"]`)
      if (card) updateMatchCard(card, result)
    }
    return
  }

  const data = { ...latest.data }
  if (action === 'home-plus') data.homeScore += 1
  if (action === 'home-minus') data.homeScore = Math.max(0, data.homeScore - 1)
  if (action === 'away-plus') data.awayScore += 1
  if (action === 'away-minus') data.awayScore = Math.max(0, data.awayScore - 1)
  if (action === 'minute-plus') data.minute += 1
  if (action === 'minute-minus') data.minute = Math.max(0, data.minute - 1)
  if (action === 'toggle-live') {
    await toggleGraphic(graphicId, !latest.visible)
    return
  }
  await patchGraphic(graphicId, { data })
}

async function handleFieldChange(graphicId, field, value) {
  const latest = currentState.graphics.find((g) => g.id === graphicId)
  if (!latest) return

  if (field === 'ticker-speed' && latest.type === 'customTicker') {
    await patchGraphic(graphicId, { data: { speed: Math.max(10, Number(value) || 90) } })
    return
  }

  if (field === 'ticker-fontsize' && latest.type === 'customTicker') {
    await patchGraphic(graphicId, { data: { fontSize: Math.min(200, Math.max(10, Number(value) || 30)) } })
    return
  }

  if (latest.type === 'matchScoreboard') {
    await handleMatchFieldChange(latest, field, value)
    return
  }
}

function mountHandlers() {
  if (mounted) return
  root.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action]')
    if (!btn || btn.disabled) return
    const card = btn.closest('[data-graphic-id]')
    if (!card) return
    event.preventDefault()
    handleAction(card.dataset.graphicId, btn.dataset.action, event)
  })
  root.addEventListener('change', (event) => {
    const field = event.target.dataset.field
    const toggle = event.target.closest('[data-action="ticker-toggle"]')
    if (toggle) {
      const card = toggle.closest('[data-graphic-id]')
      if (!card) return
      handleAction(card.dataset.graphicId, 'ticker-toggle', event)
      return
    }
    if (!field) return
    const card = event.target.closest('[data-graphic-id]')
    if (!card) return
    handleFieldChange(card.dataset.graphicId, field, event.target.value)
  })
  const teamFieldDebounce = {}
  root.addEventListener('input', (event) => {
    const field = event.target.dataset?.field
    if (!['homeCode', 'awayCode', 'homeName', 'awayName'].includes(field)) return
    const card = event.target.closest('[data-graphic-id]')
    if (!card) return
    const key = `${card.dataset.graphicId}:${field}`
    clearTimeout(teamFieldDebounce[key])
    teamFieldDebounce[key] = setTimeout(() => {
      handleFieldChange(card.dataset.graphicId, field, event.target.value)
    }, 350)
  })
  const sliderOutputs = { 'ticker-speed': 'speed-out', 'ticker-fontsize': 'fontsize-out' }
  const sliderDebounce = {}
  root.addEventListener('input', (event) => {
    const field = event.target.dataset.field
    if (!sliderOutputs[field]) return
    const card = event.target.closest('[data-graphic-id]')
    if (!card) return
    const out = card.querySelector(`[data-bind="${sliderOutputs[field]}"]`)
    if (out) out.textContent = event.target.value
    clearTimeout(sliderDebounce[field])
    sliderDebounce[field] = setTimeout(() => {
      handleFieldChange(card.dataset.graphicId, field, event.target.value)
    }, 250)
  })
  mounted = true
}

function tickLiveClocks() {
  if (!currentState) return
  for (const graphic of operatorGraphics()) {
    if (graphic.type !== 'matchScoreboard' || !graphic.data?.clock?.running) continue
    void persistAutoStoppageIfNeeded(graphic)
    const live = resolveLiveClock(graphic.data.clock)
    const card = root.querySelector(`[data-graphic-id="${graphic.id}"]`)
    const clockEl = card?.querySelector('[data-bind="clock"]')
    if (clockEl) clockEl.textContent = formatClock(graphic.data.clock)
    const minuteInput = card?.querySelector('[data-field="minute"]')
    const secondInput = card?.querySelector('[data-field="second"]')
    if (minuteInput && document.activeElement !== minuteInput) minuteInput.value = live.minute
    if (secondInput && document.activeElement !== secondInput) secondInput.value = live.second
  }
}

function ensureClockTimer() {
  const needs = operatorGraphics().some((g) => g.type === 'matchScoreboard' && g.data?.clock?.running)
  if (needs && !clockTimer) {
    clockTimer = setInterval(tickLiveClocks, 250)
  } else if (!needs && clockTimer) {
    clearInterval(clockTimer)
    clockTimer = null
  }
}

function render() {
  mountHandlers()
  const items = operatorGraphics()

  if (!items.length) {
    root.innerHTML = '<section class="empty-state">No operator overlays configured. Enable “Operator” on a widget in the dashboard.</section>'
    document.body.classList.remove('operator--single', 'operator--multi')
    updateFocusChip(null, 0)
    ensureClockTimer()
    return
  }

  const ordered = focusId
    ? [items.find((g) => g.id === focusId), ...items.filter((g) => g.id !== focusId)].filter(Boolean)
    : items

  showWidgetTitles = ordered.length > 1
  document.body.classList.toggle('operator--single', ordered.length === 1)
  document.body.classList.toggle('operator--multi', ordered.length > 1)
  title.textContent = 'Live control'
  updateFocusChip(
    focusId ? ordered.find((g) => g.id === focusId)?.name || ordered[0]?.name : null,
    ordered.length
  )

  const existingIds = [...root.querySelectorAll('[data-graphic-id]')].map((n) => n.dataset.graphicId)
  const nextIds = ordered.map((g) => g.id)

  if (existingIds.join() !== nextIds.join() || root.querySelector('.empty-state')) {
    root.innerHTML = ordered.map((g) => cardTemplate(g)).join('')
  } else {
    for (const graphic of ordered) {
      const card = root.querySelector(`[data-graphic-id="${graphic.id}"]`)
      if (!card) continue
      if (graphic.type === 'matchScoreboard') updateMatchCard(card, graphic)
      else if (graphic.type === 'customTicker') updateTickerCard(card, graphic)
      else if (graphic.type === 'lowerThirdShow' || graphic.type === 'quizShow') {
        // Alleen deze kaart herbouwen zodat invoervelden in andere kaarten blijven staan
        const wrap = document.createElement('div')
        wrap.innerHTML = cardTemplate(graphic)
        card.replaceWith(wrap.firstElementChild)
      } else updateLiveState(card, graphic)
    }
  }

  ensureClockTimer()
}

function applyState(state) {
  applyServerTimeFromState(state)
  currentState = state
  render()
}

wireRenderPreviewLinks(document, () => currentState?.settings)

const socket = io()
socket.on('connect', () => setConnectionStatus(true))
socket.on('disconnect', () => setConnectionStatus(false))
socket.on('stateChanged', applyState)

fetch('/api/state').then((r) => r.json()).then(applyState)
