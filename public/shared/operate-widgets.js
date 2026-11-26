/**
 * Operate cards for the list-style and simple widgets: ticker, lower-thirds
 * roster, quiz and stream countdown. (Message and single lower third have no
 * card code: operate-fields.js builds their cards from widget-types.js.)
 */
import { patchGraphic, toggleGraphic } from '/public/shared/client.js'
import { showToast } from '/public/shared/toast.js'
import { createTickerMessage, migrateTickerMessages, tickerMessageText } from '/public/shared/ticker-messages.js'
import { countdownTargetFromDuration, formatCountdown, msUntilTarget } from '/public/shared/countdown-utils.js'
import {
  escapeHtml,
  numberFieldHtml,
  patchData,
  postEndpoint,
  replaceHtmlKeepFocus,
  setText
} from '/public/shared/operate-ui.js'

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

/* ---------------------------------------------------------------- ticker */

function tickerRowsHtml(messages) {
  if (!messages.length) return '<li class="ticker-msg-list__item"><span class="op-status">No messages yet</span></li>'
  return messages
    .map((m) => {
      const text = escapeHtml(tickerMessageText(m))
      return `<li class="ticker-msg-list__item${m.enabled ? '' : ' is-disabled'}">
        <label class="ticker-msg-row">
          <input type="checkbox" class="ticker-msg-row__toggle" data-action="ticker-toggle" data-msg-id="${escapeHtml(m.id)}" ${m.enabled ? 'checked' : ''} />
          <span class="ticker-msg-row__text">${text}</span>
        </label>
        <button type="button" class="button button--danger button--icon" data-action="ticker-del" data-msg-id="${escapeHtml(m.id)}" title="Remove message" aria-label="Remove message: ${text}">×</button>
      </li>`
    })
    .join('')
}

function sliderHtml(label, field, value, min, max, step) {
  return `<label class="field field--slider op-field">
    <span>${label} · <output data-bind="${field}-out">${value}</output> px${field === 'ticker-speed' ? '/s' : ''}</span>
    <input type="range" min="${min}" max="${max}" step="${step}" data-field="${field}" value="${value}" />
  </label>`
}

/** Deleting is instant (no confirm on a live show) but can be undone from the toast. */
function offerTickerUndo(graphicId, removed, index, getGraphic) {
  showToast(`Message removed: “${tickerMessageText(removed)}”`, {
    actionLabel: 'Undo',
    duration: 8000,
    onAction: async () => {
      const messages = migrateTickerMessages(getGraphic?.(graphicId)?.data?.messages || [])
      if (messages.some((m) => m.id === removed.id)) return
      messages.splice(Math.min(index, messages.length), 0, removed)
      await patchData(graphicId, { messages })
    }
  })
}

export const tickerCard = {
  label: 'Ticker',

  status(g) {
    const messages = migrateTickerMessages(g.data?.messages || [])
    return `${messages.filter((m) => m.enabled).length} of ${plural(messages.length, 'message', 'messages')} enabled`
  },

  primary(g) {
    return `<div class="pv-group__cell pv-group__cell--flush op-cell--list">
        <ul class="ticker-msg-list">${tickerRowsHtml(migrateTickerMessages(g.data?.messages || []))}</ul>
      </div>
      <div class="pv-group__cell ticker-compose">
        <label class="field op-field">
          <span>New message</span>
          <span class="ticker-compose__row">
            <input type="text" data-local="ticker-new" placeholder="Type a message…" enterkeyhint="done" />
            <button type="button" class="button button--primary ticker-compose__add" data-action="ticker-add">Add</button>
          </span>
        </label>
        <p class="op-status">New messages start disabled — tick one to put it in the ticker.</p>
      </div>`
  },

  more(g) {
    const d = g.data || {}
    return `<div class="pv-group__cell op-grid op-grid--2">
      ${sliderHtml('Speed', 'ticker-speed', d.speed ?? 90, 30, 240, 5)}
      ${sliderHtml('Font size', 'ticker-fontsize', d.fontSize ?? 30, 16, 200, 2)}
    </div>`
  },

  update(card, g) {
    const d = g.data || {}
    replaceHtmlKeepFocus(card.querySelector('.ticker-msg-list'), tickerRowsHtml(migrateTickerMessages(d.messages || [])))
    for (const [field, value] of [['ticker-speed', d.speed ?? 90], ['ticker-fontsize', d.fontSize ?? 30]]) {
      const input = card.querySelector(`[data-field="${field}"]`)
      if (input && document.activeElement !== input) {
        input.value = value
        setText(card, `[data-bind="${field}-out"]`, value)
      }
    }
  },

  /** Range sliders: show the value while dragging, save debounced. */
  liveFields: ['ticker-speed', 'ticker-fontsize'],
  onInput(card, field, value) {
    setText(card, `[data-bind="${field}-out"]`, value)
  },

  async action(g, action, ctx) {
    const messages = migrateTickerMessages(g.data?.messages || [])
    if (action === 'ticker-add') {
      const input = ctx.card.querySelector('[data-local="ticker-new"]')
      const text = input?.value?.trim()
      if (!text) return input?.focus()
      const saved = await patchData(g.id, { messages: [...messages, createTickerMessage(text, { enabled: false })] })
      if (saved && input) input.value = ''
      return
    }
    const id = ctx.target.dataset.msgId
    const index = messages.findIndex((m) => m.id === id)
    if (index < 0) return
    if (action === 'ticker-toggle') {
      messages[index] = { ...messages[index], enabled: ctx.target.checked }
      return patchData(g.id, { messages })
    }
    if (action === 'ticker-del') {
      const [removed] = messages.splice(index, 1)
      const saved = await patchData(g.id, { messages })
      if (saved) offerTickerUndo(g.id, removed, index, ctx.getGraphic)
    }
  },

  async field(g, field, value) {
    if (field === 'ticker-speed') return patchData(g.id, { speed: Math.max(10, Number(value) || 90) })
    if (field === 'ticker-fontsize') return patchData(g.id, { fontSize: Math.min(200, Math.max(10, Number(value) || 30)) })
  }
}

/* -------------------------------------------- lower-thirds roster + quiz */

function pickGridHtml(items, { activeId, visible, action, empty, wide = false }) {
  if (!items.length) return `<p class="op-status">${empty}</p>`
  return `<div class="op-pick-grid${wide ? ' op-pick-grid--wide' : ''}">
    ${items
      .map((item) => {
        const active = visible && activeId === item.id
        return `<button type="button" class="button op-pick ${active ? 'button--live' : 'button--secondary'}" data-action="${action}" data-entry-id="${escapeHtml(item.id)}" aria-pressed="${active}">
          <span class="op-pick__name">${escapeHtml(item.name)}</span>
          ${item.meta ? `<span class="op-pick__meta">${escapeHtml(item.meta)}</span>` : ''}
        </button>`
      })
      .join('')}
  </div>`
}

const syncPickGrid = (card, html) => replaceHtmlKeepFocus(card.querySelector('[data-pick-cell]'), html)

function rosterGridHtml(g) {
  const entries = (g.data?.entries || []).map((e) => ({ id: e.id, name: e.name, meta: e.title }))
  return pickGridHtml(entries, {
    activeId: g.data?.activeEntryId,
    visible: g.visible,
    action: 'lt-show',
    empty: 'No people in this list yet. Add them in the dashboard under Edit settings.'
  })
}

export const rosterCard = {
  label: 'Lower thirds',
  status(g) {
    const entries = g.data?.entries || []
    const active = g.visible && entries.find((e) => e.id === g.data?.activeEntryId)
    return `${plural(entries.length, 'person', 'people')}${active ? ` · showing ${active.name}` : ''}`
  },
  primary: (g) => `<div class="pv-group__cell" data-pick-cell>${rosterGridHtml(g)}</div>`,
  update: (card, g) => syncPickGrid(card, rosterGridHtml(g)),
  async action(g, action, ctx) {
    const entryId = ctx.target.dataset.entryId
    if (action !== 'lt-show' || !entryId) return
    // Tapping the person on air takes the lower third off air.
    if (g.visible && g.data?.activeEntryId === entryId) return toggleGraphic(g.id, false)
    return postEndpoint(g.id, `entries/${encodeURIComponent(entryId)}/show`, 'Lower third not shown')
  }
}

function quizGridHtml(g) {
  const questions = (g.data?.questions || []).map((q) => ({ id: q.id, name: q.question }))
  return pickGridHtml(questions, {
    activeId: g.data?.activeQuestionId,
    visible: g.visible,
    action: 'quiz-show',
    empty: 'No questions yet. Add them in the dashboard under Edit settings.',
    wide: true
  })
}

export const quizCard = {
  label: 'Quiz',
  status(g) {
    const n = (g.data?.questions || []).length
    return `${plural(n, 'question', 'questions')}${g.data?.revealed ? ' · answer revealed' : ''}`
  },
  primary(g) {
    const d = g.data || {}
    return `<div class="pv-group__cell" data-pick-cell>${quizGridHtml(g)}</div>
      <div class="pv-group__cell">
        <button type="button" class="button ${d.revealed ? 'button--live' : 'button--primary'} op-wide" data-action="quiz-reveal" ${g.visible && d.activeQuestionId ? '' : 'disabled'}>${d.revealed ? 'Hide answer' : 'Reveal answer'}</button>
      </div>`
  },
  update(card, g) {
    const d = g.data || {}
    syncPickGrid(card, quizGridHtml(g))
    const btn = card.querySelector('[data-action="quiz-reveal"]')
    if (btn) {
      btn.disabled = !(g.visible && d.activeQuestionId)
      btn.classList.toggle('button--live', Boolean(d.revealed))
      btn.classList.toggle('button--primary', !d.revealed)
      btn.textContent = d.revealed ? 'Hide answer' : 'Reveal answer'
    }
  },
  async action(g, action, ctx) {
    if (action === 'quiz-reveal') return patchData(g.id, { revealed: !g.data?.revealed })
    const entryId = ctx.target.dataset.entryId
    if (action === 'quiz-show' && entryId) {
      return patchGraphic(g.id, { visible: true, data: { activeQuestionId: entryId, revealed: false } })
    }
  }
}

/* ------------------------------------------------------- stream countdown */

function countdownStatus(g) {
  const target = g.data?.targetDateTime
  if (!target) return 'No end time set'
  const ms = msUntilTarget(target)
  return ms > 0 ? `Ends in ${formatCountdown(ms, g.data?.format || 'mm:ss')}` : 'Finished'
}

export const countdownCard = {
  label: 'Stream countdown',
  status: countdownStatus,
  primary: () => `<div class="pv-group__cell op-grid op-grid--3">
      ${numberFieldHtml('Minutes', 'cd-minutes', 15, { max: 999, local: true })}
      ${numberFieldHtml('Seconds', 'cd-seconds', 0, { max: 59, local: true })}
      <button type="button" class="button button--live" data-action="countdown-start">Start countdown</button>
    </div>`,
  update() {},
  // The shared tick refreshes the status line ("Ends in 4:59").
  // (keeps going a moment past the end so the line flips to "Finished").
  ticking: (g) => Boolean(g.data?.targetDateTime) && new Date(g.data.targetDateTime).getTime() > Date.now() - 2000,
  tick() {},
  async action(g, action, ctx) {
    if (action !== 'countdown-start') return
    const minutes = ctx.card.querySelector('[data-local="cd-minutes"]')?.value
    const seconds = ctx.card.querySelector('[data-local="cd-seconds"]')?.value
    return patchData(g.id, { targetDateTime: countdownTargetFromDuration(minutes, seconds) })
  }
}
