/**
 * Quiz widget (`quizShow`): stepping through the questions and the answer
 * actions, for remote controls (see server/widgetActions.js). The operate card
 * and the existing Companion actions set the same fields with a PATCH.
 *
 * data = { questions: [{ id, question, options, correct }], activeQuestionId, revealed, panel }
 */
import { updateGraphic } from './state.js'
import { HttpError, badRequest } from './validation.js'

function questionsOf(graphic) {
  const list = Array.isArray(graphic.data?.questions) ? graphic.data.questions : []
  return list.filter((q) => q && typeof q.id === 'string' && q.id)
}

/** Runs inside the state write queue, so two quick presses never overwrite each other. */
function updateQuiz(graphicId, fn) {
  return updateGraphic(graphicId, (graphic) => {
    if (graphic.type !== 'quizShow') return null
    return fn(graphic, questionsOf(graphic))
  })
}

/**
 * Where one step takes a quiz. Returns `{ questionId, revealed }`, or null when
 * nothing changes (at an end of the list with `wrap: false`).
 *
 * On air the quiz is a sequence: question → its answer → next question → …
 *   next      answer hidden → reveal it; answer revealed → next question, answer hidden
 *   previous  answer revealed → hide it; answer hidden → previous question with its answer
 *             revealed (exactly what "next" came from)
 *
 * Off air a step puts the quiz on air, always with the answer hidden:
 *   next      the current question when its answer was not revealed yet, otherwise the next one
 *   previous  the question before the current one
 *
 * Without a current question: next → first question, previous → last question.
 */
export function quizStepTarget(questions, { activeId = null, revealed = false, visible = false } = {}, direction = 'next', { wrap = true } = {}) {
  const count = questions.length
  if (!count) return null
  const forward = direction !== 'previous'
  const index = questions.findIndex((q) => q.id === activeId)
  if (index === -1) return { questionId: questions[forward ? 0 : count - 1].id, revealed: false }

  const neighbour = (delta, revealedThere) => {
    let next = index + delta
    if (next < 0 || next >= count) {
      if (!wrap) return null
      next = (next + count) % count
    }
    return { questionId: questions[next].id, revealed: revealedThere }
  }
  const here = (revealedHere) => ({ questionId: questions[index].id, revealed: revealedHere })

  if (!visible) return forward && !revealed ? here(false) : neighbour(forward ? 1 : -1, false)
  if (forward) return revealed ? neighbour(1, false) : here(true)
  return revealed ? here(false) : neighbour(-1, true)
}

/** One step, put on air. Returns null when the widget is missing or has no questions. */
export async function stepQuiz(graphicId, direction = 'next', { wrap = true } = {}) {
  return updateQuiz(graphicId, (graphic, questions) => {
    if (!questions.length) return null
    const target = quizStepTarget(
      questions,
      { activeId: graphic.data?.activeQuestionId || null, revealed: Boolean(graphic.data?.revealed), visible: Boolean(graphic.visible) },
      direction,
      { wrap }
    )
    if (!target) return graphic
    return { ...graphic, visible: true, data: { ...graphic.data, activeQuestionId: target.questionId, revealed: target.revealed } }
  })
}

/** Reveal the answer of the question on air. 409 when there is none. */
export async function revealQuizAnswer(graphicId) {
  return updateQuiz(graphicId, (graphic, questions) => {
    if (!graphic.visible || !questions.some((q) => q.id === graphic.data?.activeQuestionId)) {
      throw new HttpError(409, 'The quiz has no question on air')
    }
    return { ...graphic, data: { ...graphic.data, revealed: true } }
  })
}

export async function hideQuizAnswer(graphicId) {
  return updateQuiz(graphicId, (graphic) => ({ ...graphic, data: { ...graphic.data, revealed: false } }))
}

/** Put question `number` (1 = first in the list) on air with the answer hidden. */
export async function showQuizQuestionNumber(graphicId, number) {
  return updateQuiz(graphicId, (graphic, questions) => {
    const question = questions[number - 1]
    if (!question) {
      throw badRequest(
        questions.length
          ? `payload.number: the quiz has ${questions.length} question${questions.length === 1 ? '' : 's'}`
          : 'The quiz has no questions'
      )
    }
    return { ...graphic, visible: true, data: { ...graphic.data, activeQuestionId: question.id, revealed: false } }
  })
}
