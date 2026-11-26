/** A ProVerlay state with one graphic of every widget type the module handles. */
export function sampleState() {
  return {
    projectId: 'demo-cup',
    serverNow: Date.now(),
    client: { name: 'Demo Cup', notes: '' },
    // Steps and actions per widget type, as ProVerlay sends them with every state.
    widgetTypes: {
      lowerThirdShow: { steps: true, actions: [] },
      image: { steps: true, actions: [] },
      quizShow: {
        steps: true,
        actions: [
          { id: 'reveal', label: 'Reveal answer', fields: [] },
          { id: 'hide-answer', label: 'Hide answer', fields: [] },
          {
            id: 'show-question',
            label: 'Show question by number',
            fields: [{ key: 'number', kind: 'number', label: 'Question number', default: 1, min: 1, integer: true }],
          },
        ],
      },
    },
    graphics: [
      {
        id: 'match-scoreboard-aaaa1111',
        type: 'matchScoreboard',
        name: 'Match',
        visible: true,
        soloVisible: false,
        data: {
          homeCode: 'AJA',
          awayCode: 'PSV',
          homeScore: 2,
          awayScore: 1,
          clock: { period: 'first_half', minute: 12, second: 5, running: false, runningSince: null },
        },
      },
      {
        id: 'hockey-scorebug-bbbb2222',
        type: 'hockeyScorebug',
        name: 'Hockey',
        visible: false,
        soloVisible: true,
        data: {
          homeCode: 'NED',
          awayCode: 'SPA',
          homeScore: 0,
          awayScore: 3,
          clock: { period: 'q2', remainingMs: 775000, quarterMs: 900000, running: false, runningSince: null },
        },
      },
      {
        id: 'custom-ticker-cccc3333',
        type: 'customTicker',
        name: 'Ticker',
        visible: false,
        soloVisible: false,
        data: {
          messages: [
            { id: 'msg-1', text: 'Welcome', enabled: true },
            { id: 'msg-2', text: 'Next match at 20:00', enabled: false },
            { id: 'msg-3', text: 'Follow us', enabled: true },
          ],
        },
      },
      {
        id: 'stream-countdown-dddd4444',
        type: 'streamCountdown',
        name: 'Countdown',
        visible: false,
        soloVisible: false,
        data: { targetDateTime: new Date(Date.now() + 65_000).toISOString(), format: 'mm:ss' },
      },
      {
        id: 'lower-third-show-eeee5555',
        type: 'lowerThirdShow',
        name: 'Speakers',
        visible: true,
        soloVisible: false,
        data: {
          activeEntryId: 'sp-2',
          entries: [
            { id: 'sp-1', name: 'Anna', title: 'Host' },
            { id: 'sp-2', name: 'Bram', title: 'Coach' },
            { id: 'sp-3', name: 'Cleo', title: 'Analyst' },
          ],
        },
      },
      {
        id: 'quiz-show-ffff6666',
        type: 'quizShow',
        name: 'Quiz',
        visible: false,
        soloVisible: false,
        data: {
          activeQuestionId: 'q-1',
          revealed: true,
          questions: [
            { id: 'q-1', question: 'Who scores first?', options: ['A', 'B'], correct: 0 },
            { id: 'q-2', question: 'Final score?', options: ['1-0', '2-1'], correct: 1 },
          ],
        },
      },
      {
        id: 'message-gggg7777',
        type: 'message',
        name: 'Message',
        visible: false,
        soloVisible: false,
        data: { text: 'Back in 5' },
      },
      {
        id: 'image-iiii9999',
        type: 'image',
        name: 'Sponsors',
        visible: true,
        soloVisible: false,
        data: {
          activeImageId: 'img-2',
          images: [
            { id: 'img-1', src: 'main-sponsor.png', name: 'Main sponsor' },
            { id: 'img-2', src: 'lt-anna.png', name: 'Anna' },
          ],
        },
      },
      {
        id: 'f1-timing-hhhh8888',
        type: 'f1Timing',
        name: 'F1',
        visible: false,
        soloVisible: false,
        data: {},
      },
    ],
  }
}

export const IDS = {
  match: 'match-scoreboard-aaaa1111',
  hockey: 'hockey-scorebug-bbbb2222',
  ticker: 'custom-ticker-cccc3333',
  countdown: 'stream-countdown-dddd4444',
  roster: 'lower-third-show-eeee5555',
  quiz: 'quiz-show-ffff6666',
  message: 'message-gggg7777',
  f1: 'f1-timing-hhhh8888',
  image: 'image-iiii9999',
}

/** Records every API call; `fail` makes the next call reject. */
export function stubApi() {
  const calls = []
  const api = { calls, fail: null }
  for (const method of [
    'getState',
    'patchState',
    'patchGraphic',
    'setVisible',
    'setSoloVisible',
    'hide',
    'score',
    'clock',
    'showEntry',
    'showImage',
    'stepImage',
    'step',
    'runAction',
  ]) {
    api[method] = async (...args) => {
      calls.push([method, ...args])
      if (api.fail) {
        const err = api.fail
        api.fail = null
        throw err
      }
      return {}
    }
  }
  return api
}

/** Minimal stand-in for the module instance used by actions/feedbacks. */
export function fakeSelf(state = sampleState()) {
  const logs = []
  return {
    state,
    api: stubApi(),
    logs,
    log: (level, message) => logs.push([level, message]),
    serverNow: () => Date.now(),
    hockeyLastQuarter: new Map(),
  }
}
