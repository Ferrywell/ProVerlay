import { COLORS, ON_AIR_STYLE } from './feedbacks.js'
import {
  MATCH_PERIODS,
  SCORE_TYPES,
  TYPE_LABELS,
  graphicLabel,
  graphicsOf,
  joinRef,
  quizQuestions,
  rosterEntries,
  tickerMessages,
  truncate,
  typeLabel,
  typeHiddenFromPresets,
} from './model.js'

const SOLO_STYLE = { color: COLORS.white, bgcolor: COLORS.solo }
const RUNNING_STYLE = { color: COLORS.white, bgcolor: COLORS.running }
const REVEALED_STYLE = { color: COLORS.black, bgcolor: COLORS.revealed }

/** Section order in the preset browser; unknown widget types go last. */
const SECTION_ORDER = [...Object.keys(TYPE_LABELS)]

function button(name, text, actions, feedbacks = [], { size = 'auto', bgcolor = COLORS.idle } = {}) {
  return {
    type: 'simple',
    name,
    style: { text, size, color: COLORS.white, bgcolor, show_topbar: false },
    steps: [{ down: actions, up: [] }],
    feedbacks,
  }
}

const action = (actionId, options) => ({ actionId, options })
const feedback = (feedbackId, options, style) => ({ feedbackId, options, style })

/**
 * Presets per graphic, one section per widget type and one group per graphic.
 * Button texts use module variables, so scores, clocks and names stay live.
 * `label` is the connection label used in $(label:variable).
 */
export function getPresetDefinitions(state, keys, label = 'proverlay') {
  const v = (name) => `$(${label}:${name})`
  const presets = {}
  const sections = new Map()

  for (const g of graphicsOf(state)) {
    if (typeHiddenFromPresets(state, g.type)) continue
    const k = keys.get(g.id)
    const name = graphicLabel(g)
    const ids = []
    const add = (id, preset) => {
      presets[id] = preset
      ids.push(id)
    }
    const onAir = feedback('graphic_on_air', { graphic: g.id }, ON_AIR_STYLE)

    add(
      `onair_${k}`,
      button(
        `${name}: on air (combined)`,
        v(`name_${k}`),
        [action('graphic_visibility', { graphic: g.id, mode: 'toggle' })],
        [onAir],
      ),
    )
    add(
      `solo_${k}`,
      button(
        `${name}: on air (solo)`,
        `SOLO\n${v(`name_${k}`)}`,
        [action('graphic_solo', { graphic: g.id, mode: 'toggle' })],
        [feedback('graphic_solo_on_air', { graphic: g.id }, SOLO_STYLE)],
      ),
    )

    if (SCORE_TYPES.includes(g.type)) {
      for (const side of ['home', 'away']) {
        const sideName = side === 'home' ? 'Home' : 'Away'
        add(
          `score_${k}_${side}_plus`,
          button(
            `${name}: ${sideName} +1`,
            `${v(`code_${k}_${side}`)}\n${v(`score_${k}_${side}`)}`,
            [action('score', { graphic: g.id, side, mode: 'add', amount: 1 })],
            [],
            { size: '24' },
          ),
        )
        add(
          `score_${k}_${side}_minus`,
          button(`${name}: ${sideName} −1`, `${v(`code_${k}_${side}`)}\n−1`, [
            action('score', { graphic: g.id, side, mode: 'subtract', amount: 1 }),
          ]),
        )
      }
      const running = feedback('clock_running', { graphic: g.id }, RUNNING_STYLE)
      add(
        `clock_${k}_toggle`,
        button(
          `${name}: start / pause clock`,
          `${v(`clock_${k}`)}\n${v(`period_${k}`)}`,
          [action('clock', { graphic: g.id, action: 'toggle', seconds: 10, time: '45:00' })],
          [running],
        ),
      )
      add(
        `clock_${k}_minus1`,
        button(`${name}: clock −1 s`, 'CLOCK\n−1 s', [
          action('clock', { graphic: g.id, action: 'adjust', seconds: -1, time: '45:00' }),
        ]),
      )
      add(
        `clock_${k}_plus1`,
        button(`${name}: clock +1 s`, 'CLOCK\n+1 s', [
          action('clock', { graphic: g.id, action: 'adjust', seconds: 1, time: '45:00' }),
        ]),
      )
      add(
        `clock_${k}_reset`,
        button(`${name}: reset clock`, 'RESET\nCLOCK', [
          action('clock', { graphic: g.id, action: 'reset', seconds: 10, time: '45:00' }),
        ]),
      )
      if (g.type === 'hockeyScorebug') {
        for (const mode of ['previous', 'next']) {
          add(
            `period_${k}_${mode}`,
            button(`${name}: ${mode} period`, `${mode === 'next' ? 'NEXT' : 'PREV'}\n${v(`period_${k}`)}`, [
              action('hockey_period', { graphic: g.id, mode, period: 'q1', includeBreaks: false, resetClock: false }),
            ]),
          )
        }
      } else {
        for (const p of MATCH_PERIODS) {
          add(
            `period_${k}_${p.id}`,
            button(`${name}: ${p.label}`, p.label.toUpperCase(), [
              action('match_period', { graphic: g.id, period: p.id }),
            ]),
          )
        }
      }
    } else if (g.type === 'customTicker') {
      for (const m of tickerMessages(g.data)) {
        const ref = joinRef(g.id, m.id)
        add(
          `ticker_${k}_${sanitize(m.id)}`,
          button(
            `${name}: toggle "${truncate(m.text, 40)}"`,
            truncate(m.text, 40),
            [action('ticker_message', { message: ref, mode: 'toggle' })],
            [feedback('ticker_message_enabled', { message: ref }, RUNNING_STYLE)],
            { size: '14' },
          ),
        )
      }
    } else if (g.type === 'streamCountdown') {
      for (const minutes of [5, 10, 15]) {
        add(
          `countdown_${k}_${minutes}`,
          button(`${name}: start ${minutes}:00`, `START\n${minutes}:00`, [
            action('countdown_start', { graphic: g.id, minutes, seconds: 0 }),
          ]),
        )
      }
      add(
        `countdown_${k}_stop`,
        button(`${name}: stop`, `STOP\n${v(`countdown_${k}`)}`, [action('countdown_stop', { graphic: g.id })], [onAir]),
      )
    } else if (g.type === 'lowerThirdShow') {
      for (const e of rosterEntries(g)) {
        const ref = joinRef(g.id, e.id)
        add(
          `speaker_${k}_${sanitize(e.id)}`,
          button(
            `${name}: ${e.name || e.id}`,
            String(e.name || e.id),
            [action('lower_third_show', { speaker: ref })],
            [feedback('lower_third_entry_active', { speaker: ref }, ON_AIR_STYLE)],
          ),
        )
      }
      for (const direction of ['previous', 'next']) {
        add(
          `speaker_${k}_${direction}`,
          button(`${name}: ${direction} speaker`, direction === 'next' ? 'NEXT\nSPEAKER' : 'PREV\nSPEAKER', [
            action('lower_third_step', { graphic: g.id, direction, wrap: true }),
          ]),
        )
      }
      add(
        `speaker_${k}_hide`,
        button(
          `${name}: hide`,
          `HIDE\n${v(`speaker_${k}_name`)}`,
          [action('lower_third_hide', { graphic: g.id })],
          [onAir],
        ),
      )
    } else if (g.type === 'quizShow') {
      for (const q of quizQuestions(g)) {
        const ref = joinRef(g.id, q.id)
        add(
          `quiz_${k}_${sanitize(q.id)}`,
          button(
            `${name}: show "${truncate(q.question || q.id, 40)}"`,
            truncate(q.question || q.id, 40),
            [action('quiz_show', { question: ref })],
            [feedback('quiz_question_active', { question: ref }, ON_AIR_STYLE)],
            { size: '14' },
          ),
        )
      }
      add(
        `quiz_${k}_reveal`,
        button(
          `${name}: reveal / hide answer`,
          'REVEAL\nANSWER',
          [action('quiz_reveal', { graphic: g.id, mode: 'toggle' })],
          [feedback('quiz_revealed', { graphic: g.id }, REVEALED_STYLE)],
        ),
      )
      add(`quiz_${k}_hide`, button(`${name}: hide`, 'HIDE\nQUIZ', [action('quiz_hide', { graphic: g.id })], [onAir]))
    } else if (g.type === 'message') {
      presets[`onair_${k}`].style.text = v(`message_${k}`)
      presets[`onair_${k}`].style.size = '14'
    }

    if (!sections.has(g.type)) sections.set(g.type, [])
    sections.get(g.type).push({ type: 'simple', id: `graphic_${k}`, name, presets: ids })
  }

  const rank = (type) => {
    const i = SECTION_ORDER.indexOf(type)
    return i === -1 ? SECTION_ORDER.length : i
  }
  const structure = [...sections.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([type, groups]) => ({
      id: `type_${sanitize(type)}`,
      name: typeLabel(type),
      definitions: groups,
    }))

  return { structure, presets }
}

function sanitize(value) {
  return String(value ?? '').replace(/[^A-Za-z0-9_]+/g, '_')
}
