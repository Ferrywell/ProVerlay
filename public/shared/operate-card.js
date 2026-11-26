/**
 * One operate card per widget, rendered by all three live-control surfaces:
 * the dashboard's Operate panel (/control), /operate/:id and /operator.
 *
 * Card layout (same everywhere):
 *   header   — widget name (optional), status line, ON AIR badge, Go live / Take off air
 *   primary  — what an operator needs during the show (score ±, clock, period, roster…)
 *   More     — secondary controls in a <details>: collapsed by default on phones,
 *              open on wider screens; the choice is remembered per widget type.
 *
 * Per-type modules (operate-match/-hockey/-f1/-image/-widgets.js) provide:
 *   label, status(g), primary(g), more?(g), shape?(g), update(card, g),
 *   ticking?(g) + tick(card, g), polling?(g) + poll(card, g),
 *   action?(g, action, ctx), field?(g, field, value, ctx), liveFields?, onInput?
 */
import { toggleGraphic } from '/public/shared/client.js'
import { showToast, withPending } from '/public/shared/toast.js'
import {
  findOnAirOverlaps,
  liveButtonClass,
  liveButtonLabel,
  onAirBadgeHtml,
  overlapWarningText,
  syncLiveButton,
  syncOnAirBadge
} from '/public/shared/on-air.js'
import { escapeHtml, setText } from '/public/shared/operate-ui.js'
import { matchCard } from '/public/shared/operate-match.js'
import { hockeyCard } from '/public/shared/operate-hockey.js'
import { f1Card } from '/public/shared/operate-f1.js'
import { imageCard } from '/public/shared/operate-image.js'
import { nowPlayingCard } from '/public/shared/operate-now-playing.js'
import {
  countdownCard,
  lowerThirdCard,
  messageCard,
  quizCard,
  rosterCard,
  tickerCard
} from '/public/shared/operate-widgets.js'

const CARDS = {
  matchScoreboard: matchCard,
  hockeyScorebug: hockeyCard,
  customTicker: tickerCard,
  lowerThirdShow: rosterCard,
  quizShow: quizCard,
  f1Timing: f1Card,
  streamCountdown: countdownCard,
  message: messageCard,
  lowerThird: lowerThirdCard,
  image: imageCard,
  nowPlaying: nowPlayingCard
}

const FALLBACK_CARD = {
  label: 'Widget',
  status: () => '',
  primary: () => '',
  update() {}
}

function cardFor(type) {
  return CARDS[type] || FALLBACK_CARD
}

export function operateTypeLabel(type) {
  return CARDS[type]?.label || type
}

/* ------------------------------------------------------- More disclosure */

const MORE_KEY = 'pv-operate-more:'

function moreOpenByDefault(type) {
  try {
    const stored = localStorage.getItem(MORE_KEY + type)
    if (stored === '1' || stored === '0') return stored === '1'
  } catch {
    /* private mode */
  }
  return window.matchMedia('(min-width: 768px)').matches
}

function rememberMoreOpen(type, open) {
  try {
    localStorage.setItem(MORE_KEY + type, open ? '1' : '0')
  } catch {
    /* private mode */
  }
}

/* ------------------------------------------------------------------ html */

function bodyHtml(mod, graphic) {
  const more = mod.more?.(graphic) || ''
  return {
    primary: mod.primary(graphic),
    more
  }
}

/**
 * @param {object} graphic
 * @param {{ showTitle?: boolean }} options  showTitle=false when the page already shows the name
 */
export function operateCardHtml(graphic, { showTitle = true } = {}) {
  const mod = cardFor(graphic.type)
  const { primary, more } = bodyHtml(mod, graphic)
  const title = showTitle ? `<h2 class="op-card__title">${escapeHtml(graphic.name || graphic.id)}</h2>` : ''
  return `
    <section class="op-section op-card${graphic.visible ? ' is-live' : ''}" data-graphic-id="${escapeHtml(graphic.id)}" data-type="${escapeHtml(graphic.type)}" data-shape="${escapeHtml(mod.shape?.(graphic) ?? '')}">
      <div class="pv-group">
        <header class="op-card__head">
          <div class="op-card__heading">
            ${title}
            <p class="op-status" data-bind="status-line">${escapeHtml(mod.status(graphic))}</p>
          </div>
          <div class="op-card__live">
            ${onAirBadgeHtml(graphic.visible, { bind: true })}
            <button type="button" class="button ${liveButtonClass(graphic.visible)} op-card__live-btn" data-action="toggle-live" aria-pressed="${Boolean(graphic.visible)}">${liveButtonLabel(graphic.visible)}</button>
          </div>
        </header>
        <div class="op-card__body" data-operate-body>${primary}</div>
        <details class="op-more" data-operate-more${moreOpenByDefault(graphic.type) ? ' open' : ''}${more ? '' : ' hidden'}>
          <summary class="op-more__summary">More controls</summary>
          <div class="op-more__body" data-operate-more-body>${more}</div>
        </details>
      </div>
    </section>`
}

/** Bring a rendered card in line with the latest graphic (inputs being typed in are left alone). */
export function refreshOperateCard(card, graphic) {
  if (!card || !graphic) return
  const mod = cardFor(graphic.type)
  card.classList.toggle('is-live', Boolean(graphic.visible))
  syncOnAirBadge(card.querySelector('[data-bind="live-pill"]'), graphic.visible)
  const liveBtn = card.querySelector('[data-action="toggle-live"]')
  if (liveBtn && liveBtn.dataset.pending !== '1') syncLiveButton(liveBtn, graphic.visible)
  const title = card.querySelector('.op-card__title')
  if (title) title.textContent = graphic.name || graphic.id
  setText(card, '[data-bind="status-line"]', mod.status(graphic))

  const shape = String(mod.shape?.(graphic) ?? '')
  if (card.dataset.shape !== shape) {
    const { primary, more } = bodyHtml(mod, graphic)
    card.querySelector('[data-operate-body]').innerHTML = primary
    card.querySelector('[data-operate-more-body]').innerHTML = more
    card.querySelector('[data-operate-more]').hidden = !more
    card.dataset.shape = shape
  }
  mod.update(card, graphic)
  ensureTimers()
}

/** Non-blocking warning when a graphic goes on air on top of another on-air graphic. */
export function warnOnAirOverlap(graphic, graphics = []) {
  const overlaps = findOnAirOverlaps(graphic, graphics.filter((g) => g.id !== graphic.id))
  if (overlaps.length) showToast(overlapWarningText(graphic, overlaps), { type: 'warning', duration: 8000 })
}

/* ---------------------------------------------------------------- wiring */

const roots = new Map()

function cardContext(root, el) {
  const card = el.closest('[data-graphic-id]')
  if (!card || !root.contains(card)) return null
  const entry = roots.get(root)
  const graphic = entry.getGraphic(card.dataset.graphicId)
  if (!graphic) return null
  return {
    card,
    graphic,
    mod: cardFor(graphic.type),
    ctx: { card, target: el, getGraphic: entry.getGraphic, confirmDecrement: entry.confirmDecrement }
  }
}

/**
 * Wire one container that holds operate cards. Safe to call more than once.
 * @param {HTMLElement} root
 * @param {(id: string) => object|null} getGraphic  latest graphic from the page's state
 * @param {{ onWentLive?: (graphic) => void, confirmDecrement?: boolean }} options
 */
export function wireOperateRoot(root, getGraphic, { onWentLive, confirmDecrement = false } = {}) {
  if (roots.has(root)) return
  roots.set(root, { getGraphic, confirmDecrement })
  const lastSent = new Map()
  const debounce = new Map()

  const saveField = async (el, value) => {
    const found = cardContext(root, el)
    if (!found?.mod.field) return
    const key = `${found.card.dataset.graphicId}:${el.dataset.field}:${el.dataset.index ?? ''}`
    clearTimeout(debounce.get(key))
    if (lastSent.get(key) === value) return
    lastSent.set(key, value)
    await found.mod.field(found.graphic, el.dataset.field, value, found.ctx)
    // A later server value may differ (normalised) — allow sending the same text again.
    setTimeout(() => lastSent.delete(key), 1000)
  }

  root.addEventListener('click', async (event) => {
    const btn = event.target.closest('[data-action]')
    if (!btn || btn.tagName === 'INPUT' || btn.disabled) return
    const found = cardContext(root, btn)
    if (!found) return
    const { card, graphic, mod, ctx } = found
    if (btn.dataset.action === 'toggle-live') {
      const updated = await withPending(btn, () => toggleGraphic(graphic.id, !graphic.visible))
      if (!updated) return
      if (btn.isConnected) syncLiveButton(btn, updated.visible)
      if (updated.visible) onWentLive?.({ ...graphic, ...updated })
      return
    }
    await mod.action?.(graphic, btn.dataset.action, ctx)
    if (card.isConnected) ensureTimers()
  })

  root.addEventListener('change', (event) => {
    const el = event.target
    if (el.dataset.action === 'ticker-toggle') {
      const found = cardContext(root, el)
      found?.mod.action?.(found.graphic, 'ticker-toggle', found.ctx)
      return
    }
    if (el.dataset.field) saveField(el, el.value)
  })

  root.addEventListener('input', (event) => {
    const el = event.target
    const field = el.dataset.field
    if (!field) return
    const found = cardContext(root, el)
    if (!found?.mod.liveFields?.includes(field)) return
    found.mod.onInput?.(found.card, field, el.value)
    const key = `${found.card.dataset.graphicId}:${field}:${el.dataset.index ?? ''}`
    clearTimeout(debounce.get(key))
    debounce.set(key, setTimeout(() => saveField(el, el.value), 350))
  })

  // Enter in a local compose field (ticker "New message") presses its button.
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || !event.target.dataset.local) return
    const button = event.target.closest('.ticker-compose__row, .op-grid')?.querySelector('[data-action]')
    if (!button) return
    event.preventDefault()
    button.click()
  })

  // Remember whether "More controls" is open, per widget type.
  root.addEventListener(
    'toggle',
    (event) => {
      const details = event.target
      if (!details.matches?.('[data-operate-more]')) return
      const type = details.closest('[data-type]')?.dataset.type
      if (type) rememberMoreOpen(type, details.open)
    },
    true
  )
}

/* ---------------------------------------------------------------- timers */

let clockTimer = null
let pollTimer = null

function eachCard(predicate, fn) {
  for (const [root, { getGraphic }] of roots) {
    for (const card of root.querySelectorAll('[data-graphic-id]')) {
      if (card.hidden || card.closest('[hidden]')) continue
      const graphic = getGraphic(card.dataset.graphicId)
      if (!graphic) continue
      const mod = cardFor(graphic.type)
      if (predicate(mod, graphic)) fn(mod, card, graphic)
    }
  }
}

function anyCard(predicate) {
  let found = false
  eachCard(predicate, () => {
    found = true
  })
  return found
}

const isTicking = (mod, g) => Boolean(mod.ticking?.(g))
const isPolling = (mod, g) => Boolean(mod.polling?.(g))

function tickClocks() {
  eachCard(isTicking, (mod, card, graphic) => {
    mod.tick(card, graphic)
    setText(card, '[data-bind="status-line"]', mod.status(graphic))
  })
}

function pollCards() {
  eachCard(isPolling, (mod, card, graphic) => void mod.poll(card, graphic))
}

/** Start/stop the shared 250 ms clock tick and the F1 status poll as needed. */
export function ensureTimers() {
  const tick = anyCard(isTicking)
  if (tick && !clockTimer) clockTimer = setInterval(tickClocks, 250)
  if (!tick && clockTimer) {
    clearInterval(clockTimer)
    clockTimer = null
  }
  const poll = anyCard(isPolling)
  if (poll && !pollTimer) {
    pollTimer = setInterval(pollCards, 2500)
    pollCards()
  }
  if (!poll && pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}
