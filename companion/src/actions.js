import { splitRgb } from '@companion-module/base'
import {
  HOCKEY_PERIODS,
  MATCH_PERIODS,
  SCORE_TYPES,
  findGraphic,
  graphicChoices,
  isClockRunning,
  isHockeyQuarter,
  parseClockTime,
  parseTargetTime,
  questionChoices,
  rosterEntries,
  speakerChoices,
  splitRef,
  stepEntryId,
  stepHockeyPeriod,
  tickerMessageChoices,
  tickerMessages,
} from './model.js'

/**
 * Action definitions. `self` is the module instance (or a test double) with:
 *   self.state            latest ProVerlay state
 *   self.api              ProVerlayApi
 *   self.log(level, msg)
 *   self.serverNow()      server clock in ms (corrected for clock skew)
 *   self.hockeyLastQuarter Map graphicId → last quarter played before a break
 *
 * Scores and clocks always use the server's atomic endpoints, so rapid presses
 * never get lost and "start" never resets a running clock.
 */

const MODE_SHOW_HIDE_TOGGLE = [
  { id: 'toggle', label: 'Toggle' },
  { id: 'show', label: 'Show' },
  { id: 'hide', label: 'Hide' },
]

const SIDES = [
  { id: 'home', label: 'Home' },
  { id: 'away', label: 'Away' },
]

const CLOCK_ACTIONS = [
  { id: 'toggle', label: 'Start / pause (toggle)' },
  { id: 'start', label: 'Start' },
  { id: 'pause', label: 'Pause' },
  { id: 'reset', label: 'Reset (match → 00:00, hockey → full quarter)' },
  { id: 'adjust', label: 'Adjust by seconds (+/−)' },
  { id: 'set', label: 'Set time (mm:ss)' },
]

function first(choices) {
  return choices[0]?.id ?? ''
}

function graphicOption(choices, label = 'Graphic') {
  return { type: 'dropdown', id: 'graphic', label, default: first(choices), choices }
}

/** Wrap a callback: log failures (HTTP errors carry the server's message) instead of throwing. */
function guarded(self, name, fn) {
  return async (action, context) => {
    try {
      await fn(action.options || {}, action, context)
    } catch (err) {
      self.log('error', `${name} failed: ${err?.message || err}`)
    }
  }
}

function requireGraphic(self, id, types, what) {
  if (!id) throw new Error(`no ${what} selected`)
  const graphic = findGraphic(self.state, id)
  if (!graphic) throw new Error(`${what} "${id}" is not in the active project`)
  if (types && !types.includes(graphic.type)) throw new Error(`"${graphic.name || id}" is not a ${what}`)
  return graphic
}

function requireRef(value, what) {
  const ref = splitRef(value)
  if (!ref) throw new Error(`no ${what} selected`)
  return ref
}

function int(value, fallback = 0) {
  const n = Math.trunc(Number(value))
  return Number.isFinite(n) ? n : fallback
}

export function getActionDefinitions(self) {
  const state = self.state
  const allGraphics = graphicChoices(state)
  const scoreGraphics = graphicChoices(state, SCORE_TYPES, 'No match or hockey scoreboards in the active project')
  const matchGraphics = graphicChoices(state, ['matchScoreboard'], 'No match scoreboards in the active project')
  const hockeyGraphics = graphicChoices(state, ['hockeyScorebug'], 'No hockey scorebugs in the active project')
  const tickers = graphicChoices(state, ['customTicker'], 'No tickers in the active project')
  const countdowns = graphicChoices(state, ['streamCountdown'], 'No countdowns in the active project')
  const rosters = graphicChoices(state, ['lowerThirdShow'], 'No lower-thirds rosters in the active project')
  const quizzes = graphicChoices(state, ['quizShow'], 'No quizzes in the active project')
  const messages = graphicChoices(state, ['message'], 'No message graphics in the active project')
  const speakers = speakerChoices(state)
  const questions = questionChoices(state)
  const tickerItems = tickerMessageChoices(state)

  return {
    /* ------------------------------------------------------- visibility */
    graphic_visibility: {
      name: 'Graphic: show / hide / toggle (combined output)',
      description: 'Puts a graphic on or off the combined /render output.',
      options: [
        graphicOption(allGraphics),
        { type: 'dropdown', id: 'mode', label: 'Mode', default: 'toggle', choices: MODE_SHOW_HIDE_TOGGLE },
      ],
      callback: guarded(self, 'Show/hide graphic', async (o) => {
        const g = requireGraphic(self, o.graphic, null, 'graphic')
        if (o.mode === 'hide') await self.api.hide(g.id)
        else await self.api.setVisible(g.id, o.mode === 'show' ? true : undefined)
      }),
    },

    graphic_solo: {
      name: 'Graphic: show / hide / toggle (solo output)',
      description: 'Puts a graphic on or off its own /render?graphic=<id> output.',
      options: [
        graphicOption(allGraphics),
        { type: 'dropdown', id: 'mode', label: 'Mode', default: 'toggle', choices: MODE_SHOW_HIDE_TOGGLE },
      ],
      callback: guarded(self, 'Show/hide solo graphic', async (o) => {
        const g = requireGraphic(self, o.graphic, null, 'graphic')
        const value = o.mode === 'show' ? true : o.mode === 'hide' ? false : undefined
        await self.api.setSoloVisible(g.id, value)
      }),
    },

    /* ------------------------------------------------------------ score */
    score: {
      name: 'Score: +1 / −1 / set (match + hockey)',
      options: [
        graphicOption(scoreGraphics, 'Scoreboard'),
        { type: 'dropdown', id: 'side', label: 'Team', default: 'home', choices: SIDES },
        {
          type: 'dropdown',
          id: 'mode',
          label: 'Change',
          default: 'add',
          choices: [
            { id: 'add', label: 'Add' },
            { id: 'subtract', label: 'Subtract' },
            { id: 'set', label: 'Set to' },
          ],
        },
        { type: 'number', id: 'amount', label: 'Amount', default: 1, min: 0, max: 100, asInteger: true },
      ],
      callback: guarded(self, 'Score', async (o) => {
        const g = requireGraphic(self, o.graphic, SCORE_TYPES, 'scoreboard')
        const side = o.side === 'away' ? 'away' : 'home'
        const amount = Math.max(0, int(o.amount, 1))
        if (o.mode === 'set') await self.api.score(g.id, { side, value: amount })
        else await self.api.score(g.id, { side, delta: o.mode === 'subtract' ? -amount : amount })
      }),
    },

    /* ------------------------------------------------------------ clock */
    clock: {
      name: 'Clock: start / pause / toggle / reset / adjust (match + hockey)',
      description: 'Match clocks count up from the kick-off time, hockey clocks count down the quarter.',
      options: [
        graphicOption(scoreGraphics, 'Scoreboard'),
        { type: 'dropdown', id: 'action', label: 'Action', default: 'toggle', choices: CLOCK_ACTIONS },
        {
          type: 'number',
          id: 'seconds',
          label: 'Seconds (negative = back)',
          default: 10,
          min: -3600,
          max: 3600,
          asInteger: true,
          isVisibleExpression: "$(options:action) == 'adjust'",
        },
        {
          type: 'textinput',
          id: 'time',
          label: 'Time (mm:ss)',
          default: '45:00',
          useVariables: true,
          isVisibleExpression: "$(options:action) == 'set'",
        },
      ],
      callback: guarded(self, 'Clock', async (o) => {
        const g = requireGraphic(self, o.graphic, SCORE_TYPES, 'scoreboard')
        const action = CLOCK_ACTIONS.some((a) => a.id === o.action) ? o.action : 'toggle'
        if (action === 'adjust') {
          const seconds = int(o.seconds, 0)
          if (!seconds) return
          await self.api.clock(g.id, 'adjust', seconds * 1000)
        } else if (action === 'set') {
          const ms = parseClockTime(o.time)
          if (ms === null) throw new Error(`invalid time "${o.time}" (use mm:ss)`)
          await self.api.clock(g.id, 'set', ms)
        } else {
          await self.api.clock(g.id, action)
        }
      }),
    },

    /* ----------------------------------------------------------- periods */
    match_period: {
      name: 'Match: set period',
      options: [
        graphicOption(matchGraphics, 'Match scoreboard'),
        { type: 'dropdown', id: 'period', label: 'Period', default: 'first_half', choices: MATCH_PERIODS },
      ],
      callback: guarded(self, 'Match period', async (o) => {
        const g = requireGraphic(self, o.graphic, ['matchScoreboard'], 'match scoreboard')
        if (!MATCH_PERIODS.some((p) => p.id === o.period)) throw new Error(`unknown period "${o.period}"`)
        await self.api.patchGraphic(g.id, { data: { clock: { period: o.period } } })
      }),
    },

    hockey_period: {
      name: 'Hockey: next / previous / set period',
      options: [
        graphicOption(hockeyGraphics, 'Hockey scorebug'),
        {
          type: 'dropdown',
          id: 'mode',
          label: 'Mode',
          default: 'next',
          choices: [
            { id: 'next', label: 'Next period' },
            { id: 'previous', label: 'Previous period' },
            { id: 'set', label: 'Set period' },
          ],
        },
        {
          type: 'dropdown',
          id: 'period',
          label: 'Period',
          default: 'q1',
          choices: HOCKEY_PERIODS,
          isVisibleExpression: "$(options:mode) == 'set'",
        },
        {
          type: 'checkbox',
          id: 'includeBreaks',
          label: 'Step through breaks (Q1 → break → Q2 …)',
          default: false,
          isVisibleExpression: "$(options:mode) != 'set'",
        },
        {
          type: 'checkbox',
          id: 'resetClock',
          label: 'Reset the clock to a full quarter',
          default: false,
        },
      ],
      callback: guarded(self, 'Hockey period', async (o) => {
        const g = requireGraphic(self, o.graphic, ['hockeyScorebug'], 'hockey scorebug')
        const clock = g.data?.clock || {}
        const current = clock.period || 'q1'
        let period
        if (o.mode === 'set') {
          if (!HOCKEY_PERIODS.some((p) => p.id === o.period)) throw new Error(`unknown period "${o.period}"`)
          period = o.period
        } else {
          period = stepHockeyPeriod(current, o.mode, {
            lastQuarter: self.hockeyLastQuarter?.get(g.id) || 'q1',
            includeBreaks: Boolean(o.includeBreaks),
          })
        }
        // A running clock does not tick during a break: freeze it first so no time is lost.
        if (period === 'break' && isClockRunning(clock)) await self.api.clock(g.id, 'pause')
        if (period !== current) await self.api.patchGraphic(g.id, { data: { clock: { period } } })
        if (o.resetClock && isHockeyQuarter(period)) await self.api.clock(g.id, 'reset')
      }),
    },

    /* ----------------------------------------------------------- tickers */
    ticker_message: {
      name: 'Ticker: enable / disable / toggle a message',
      options: [
        { type: 'dropdown', id: 'message', label: 'Message', default: first(tickerItems), choices: tickerItems },
        {
          type: 'dropdown',
          id: 'mode',
          label: 'Mode',
          default: 'toggle',
          choices: [
            { id: 'toggle', label: 'Toggle' },
            { id: 'enable', label: 'Enable' },
            { id: 'disable', label: 'Disable' },
          ],
        },
      ],
      callback: guarded(self, 'Ticker message', async (o) => {
        const ref = requireRef(o.message, 'ticker message')
        const g = requireGraphic(self, ref.graphicId, ['customTicker'], 'ticker')
        const list = tickerMessages(g.data)
        const target = list.find((m) => m.id === ref.itemId)
        if (!target) throw new Error('message no longer exists')
        const enabled = o.mode === 'enable' ? true : o.mode === 'disable' ? false : !target.enabled
        // Only ids are sent for the other messages: the server keeps their current text and state.
        const patch = list.map((m) => (m.id === target.id ? { id: m.id, enabled } : { id: m.id }))
        await self.api.patchGraphic(g.id, { data: { messages: patch } })
      }),
    },

    ticker_add: {
      name: 'Ticker: add message',
      options: [
        graphicOption(tickers, 'Ticker'),
        { type: 'textinput', id: 'text', label: 'Text', default: '', useVariables: true },
        { type: 'checkbox', id: 'enabled', label: 'Enable immediately', default: true },
      ],
      callback: guarded(self, 'Ticker add', async (o) => {
        const g = requireGraphic(self, o.graphic, ['customTicker'], 'ticker')
        const text = String(o.text ?? '').trim()
        if (!text) throw new Error('text is empty')
        const patch = [...tickerMessages(g.data).map((m) => ({ id: m.id })), { text, enabled: Boolean(o.enabled) }]
        await self.api.patchGraphic(g.id, { data: { messages: patch } })
      }),
    },

    /* --------------------------------------------------------- countdown */
    countdown_start: {
      name: 'Countdown: start (duration from now)',
      options: [
        graphicOption(countdowns, 'Countdown'),
        { type: 'number', id: 'minutes', label: 'Minutes', default: 5, min: 0, max: 999, asInteger: true },
        { type: 'number', id: 'seconds', label: 'Seconds', default: 0, min: 0, max: 59, asInteger: true },
      ],
      callback: guarded(self, 'Countdown start', async (o) => {
        const g = requireGraphic(self, o.graphic, ['streamCountdown'], 'countdown')
        const totalSec = Math.max(0, int(o.minutes) * 60 + int(o.seconds))
        const targetDateTime = new Date(self.serverNow() + totalSec * 1000).toISOString()
        await self.api.patchGraphic(g.id, { data: { targetDateTime } })
      }),
    },

    countdown_stop: {
      name: 'Countdown: stop (jump to 0:00)',
      description: 'Sets the target to now. With "hide when expired" on, the countdown disappears.',
      options: [graphicOption(countdowns, 'Countdown')],
      callback: guarded(self, 'Countdown stop', async (o) => {
        const g = requireGraphic(self, o.graphic, ['streamCountdown'], 'countdown')
        await self.api.patchGraphic(g.id, { data: { targetDateTime: new Date(self.serverNow()).toISOString() } })
      }),
    },

    countdown_target: {
      name: 'Countdown: set target time',
      options: [
        graphicOption(countdowns, 'Countdown'),
        {
          type: 'textinput',
          id: 'target',
          label: 'Target (HH:MM, HH:MM:SS or ISO date-time)',
          default: '20:00',
          useVariables: true,
          tooltip: 'HH:MM is the next occurrence of that time on the Companion machine.',
        },
      ],
      callback: guarded(self, 'Countdown target', async (o) => {
        const g = requireGraphic(self, o.graphic, ['streamCountdown'], 'countdown')
        const targetDateTime = parseTargetTime(o.target, Date.now())
        if (!targetDateTime) throw new Error(`invalid target "${o.target}"`)
        await self.api.patchGraphic(g.id, { data: { targetDateTime } })
      }),
    },

    /* ------------------------------------------------------ lower thirds */
    lower_third_show: {
      name: 'Lower thirds: show speaker',
      options: [{ type: 'dropdown', id: 'speaker', label: 'Speaker', default: first(speakers), choices: speakers }],
      callback: guarded(self, 'Show speaker', async (o) => {
        const ref = requireRef(o.speaker, 'speaker')
        await self.api.showEntry(ref.graphicId, ref.itemId)
      }),
    },

    lower_third_step: {
      name: 'Lower thirds: next / previous speaker',
      options: [
        graphicOption(rosters, 'Roster'),
        {
          type: 'dropdown',
          id: 'direction',
          label: 'Direction',
          default: 'next',
          choices: [
            { id: 'next', label: 'Next' },
            { id: 'previous', label: 'Previous' },
          ],
        },
        { type: 'checkbox', id: 'wrap', label: 'Wrap around at the end of the list', default: true },
      ],
      callback: guarded(self, 'Next/previous speaker', async (o) => {
        const g = requireGraphic(self, o.graphic, ['lowerThirdShow'], 'lower-thirds roster')
        const entries = rosterEntries(g)
        if (!entries.length) throw new Error('the roster has no speakers')
        // Hiding keeps activeEntryId, so "next" after a hide continues down the list.
        const nextId = stepEntryId(entries, g.data?.activeEntryId || null, o.direction, { wrap: o.wrap !== false })
        if (!nextId) return
        await self.api.showEntry(g.id, nextId)
      }),
    },

    lower_third_hide: {
      name: 'Lower thirds: hide',
      options: [graphicOption(rosters, 'Roster')],
      callback: guarded(self, 'Hide lower third', async (o) => {
        const g = requireGraphic(self, o.graphic, ['lowerThirdShow'], 'lower-thirds roster')
        await self.api.hide(g.id)
      }),
    },

    /* -------------------------------------------------------------- quiz */
    quiz_show: {
      name: 'Quiz: show question',
      description: 'Puts the question on air with the answer hidden.',
      options: [{ type: 'dropdown', id: 'question', label: 'Question', default: first(questions), choices: questions }],
      callback: guarded(self, 'Quiz show', async (o) => {
        const ref = requireRef(o.question, 'question')
        await self.api.patchGraphic(ref.graphicId, {
          visible: true,
          data: { activeQuestionId: ref.itemId, revealed: false },
        })
      }),
    },

    quiz_reveal: {
      name: 'Quiz: reveal / hide / toggle answer',
      options: [
        graphicOption(quizzes, 'Quiz'),
        {
          type: 'dropdown',
          id: 'mode',
          label: 'Mode',
          default: 'reveal',
          choices: [
            { id: 'reveal', label: 'Reveal answer' },
            { id: 'conceal', label: 'Hide answer' },
            { id: 'toggle', label: 'Toggle' },
          ],
        },
      ],
      callback: guarded(self, 'Quiz reveal', async (o) => {
        const g = requireGraphic(self, o.graphic, ['quizShow'], 'quiz')
        const revealed = o.mode === 'reveal' ? true : o.mode === 'conceal' ? false : !g.data?.revealed
        await self.api.patchGraphic(g.id, { data: { revealed } })
      }),
    },

    quiz_hide: {
      name: 'Quiz: hide',
      options: [graphicOption(quizzes, 'Quiz')],
      callback: guarded(self, 'Quiz hide', async (o) => {
        const g = requireGraphic(self, o.graphic, ['quizShow'], 'quiz')
        await self.api.hide(g.id)
      }),
    },

    /* ----------------------------------------------------------- message */
    message_set: {
      name: 'Message: set text (and show)',
      options: [
        graphicOption(messages, 'Message graphic'),
        { type: 'textinput', id: 'text', label: 'Text', default: '', useVariables: true },
        { type: 'checkbox', id: 'show', label: 'Show on the combined output', default: true },
      ],
      callback: guarded(self, 'Message', async (o) => {
        const g = requireGraphic(self, o.graphic, ['message'], 'message graphic')
        const patch = { data: { text: String(o.text ?? '') } }
        if (o.show) patch.visible = true
        await self.api.patchGraphic(g.id, patch)
      }),
    },

    /* ------------------------------------------------------------- brand */
    brand_primary_color: {
      name: 'Brand: set primary colour',
      options: [{ type: 'colorpicker', id: 'color', label: 'Colour', default: 0xdc2626, returnType: 'number' }],
      callback: guarded(self, 'Primary colour', async (o) => {
        const { r, g, b } = splitRgb(o.color)
        const hex = (n) =>
          Math.max(0, Math.min(255, Math.round(n)))
            .toString(16)
            .padStart(2, '0')
        // The render reads brand colours from state.brand.colors (public/render/render.js).
        await self.api.patchState({ brand: { colors: { primary: `#${hex(r)}${hex(g)}${hex(b)}` } } })
      }),
    },
  }
}
