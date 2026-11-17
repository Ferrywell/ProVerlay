import { combineRgb } from '@companion-module/base'
import {
  SCORE_TYPES,
  findGraphic,
  graphicChoices,
  imageChoices,
  isClockRunning,
  questionChoices,
  speakerChoices,
  splitRef,
  tickerMessageChoices,
  tickerMessages,
} from './model.js'

export const COLORS = {
  white: combineRgb(255, 255, 255),
  black: combineRgb(0, 0, 0),
  onAir: combineRgb(220, 38, 38),
  solo: combineRgb(37, 99, 235),
  running: combineRgb(22, 163, 74),
  revealed: combineRgb(234, 179, 8),
  idle: combineRgb(30, 41, 59),
}

/** Red "ON AIR" style used by every on-air feedback. */
export const ON_AIR_STYLE = { color: COLORS.white, bgcolor: COLORS.onAir }

function first(choices) {
  return choices[0]?.id ?? ''
}

function graphicOption(choices, label = 'Graphic') {
  return { type: 'dropdown', id: 'graphic', label, default: first(choices), choices }
}

export function getFeedbackDefinitions(self) {
  const state = self.state
  const allGraphics = graphicChoices(state)
  const scoreGraphics = graphicChoices(state, SCORE_TYPES, 'No match or hockey scoreboards in the active project')
  const quizzes = graphicChoices(state, ['quizShow'], 'No quizzes in the active project')
  const speakers = speakerChoices(state)
  const images = imageChoices(state)
  const questions = questionChoices(state)
  const tickerItems = tickerMessageChoices(state)
  const graphic = (id) => findGraphic(self.state, id)

  return {
    graphic_on_air: {
      type: 'boolean',
      name: 'Graphic on air (combined output)',
      description: 'True while the graphic is visible on the combined /render output.',
      options: [graphicOption(allGraphics)],
      defaultStyle: ON_AIR_STYLE,
      callback: (fb) => Boolean(graphic(fb.options.graphic)?.visible),
    },

    graphic_solo_on_air: {
      type: 'boolean',
      name: 'Graphic on air (solo output)',
      description: 'True while the graphic is visible on its own /render?graphic=<id> output.',
      options: [graphicOption(allGraphics)],
      defaultStyle: ON_AIR_STYLE,
      callback: (fb) => Boolean(graphic(fb.options.graphic)?.soloVisible),
    },

    clock_running: {
      type: 'boolean',
      name: 'Clock running (match + hockey)',
      options: [graphicOption(scoreGraphics, 'Scoreboard')],
      defaultStyle: { color: COLORS.white, bgcolor: COLORS.running },
      callback: (fb) => isClockRunning(graphic(fb.options.graphic)?.data?.clock),
    },

    lower_third_entry_active: {
      type: 'boolean',
      name: 'Lower thirds: speaker on air',
      description: 'True while this speaker is the active entry and the roster is on air.',
      options: [{ type: 'dropdown', id: 'speaker', label: 'Speaker', default: first(speakers), choices: speakers }],
      defaultStyle: ON_AIR_STYLE,
      callback: (fb) => {
        const ref = splitRef(fb.options.speaker)
        const g = ref && graphic(ref.graphicId)
        return Boolean(g?.visible && g.data?.activeEntryId === ref.itemId)
      },
    },

    image_active: {
      type: 'boolean',
      name: 'Image: image on air',
      description: 'True while this image is the active one and its widget is on air.',
      options: [{ type: 'dropdown', id: 'image', label: 'Image', default: first(images), choices: images }],
      defaultStyle: ON_AIR_STYLE,
      callback: (fb) => {
        const ref = splitRef(fb.options.image)
        const g = ref && graphic(ref.graphicId)
        return Boolean(g?.visible && g.data?.activeImageId === ref.itemId)
      },
    },

    quiz_question_active: {
      type: 'boolean',
      name: 'Quiz: question on air',
      options: [{ type: 'dropdown', id: 'question', label: 'Question', default: first(questions), choices: questions }],
      defaultStyle: ON_AIR_STYLE,
      callback: (fb) => {
        const ref = splitRef(fb.options.question)
        const g = ref && graphic(ref.graphicId)
        return Boolean(g?.visible && g.data?.activeQuestionId === ref.itemId)
      },
    },

    quiz_revealed: {
      type: 'boolean',
      name: 'Quiz: answer revealed',
      options: [graphicOption(quizzes, 'Quiz')],
      defaultStyle: { color: COLORS.black, bgcolor: COLORS.revealed },
      callback: (fb) => Boolean(graphic(fb.options.graphic)?.data?.revealed),
    },

    ticker_message_enabled: {
      type: 'boolean',
      name: 'Ticker: message enabled',
      options: [
        { type: 'dropdown', id: 'message', label: 'Message', default: first(tickerItems), choices: tickerItems },
      ],
      defaultStyle: { color: COLORS.white, bgcolor: COLORS.running },
      callback: (fb) => {
        const ref = splitRef(fb.options.message)
        const g = ref && graphic(ref.graphicId)
        return Boolean(g && tickerMessages(g.data).find((m) => m.id === ref.itemId)?.enabled)
      },
    },
  }
}
