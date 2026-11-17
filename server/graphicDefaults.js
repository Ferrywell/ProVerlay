import crypto from 'crypto'
import { defaultMatchData } from './matchClock.js'
import { defaultF1Drivers } from './f1Timing.js'

export function defaultHockeyScorebugData() {
  return {
    homeCode: 'NED',
    awayCode: 'SPA',
    homeScore: 0,
    awayScore: 0,
    homeColor: '#E5484D',
    awayColor: '#3E63DD',
    clock: {
      period: 'q2',
      remainingMs: 775000,
      quarterMs: 900000,
      running: false,
      runningSince: null
    },
    animation: {
      enabled: true,
      durationMs: 420
    },
    style: {
      scale: 1,
      typography: {
        code: { size: 1, weight: 700 },
        score: { size: 1, weight: 700 },
        time: { size: 1, weight: 700 },
        period: { size: 1, weight: 400 }
      }
    }
  }
}

export function defaultF1TimingData() {
  return {
    source: 'manual',
    focusDriver: 'VER',
    topCount: 5,
    gapMode: 'interval',
    gapDecimals: 1,
    showHeader: true,
    showTyres: false,
    session: { lapText: '' },
    animation: { in: 'slide-left', durationMs: 380, staggerMs: 70 },
    drivers: defaultF1Drivers(),
    multiviewer: {
      host: '127.0.0.1',
      port: 10101,
      pollMs: 1000,
      delayMs: 0
    },
    style: {
      widthPx: 440,
      rowHeightPx: 62,
      rowGapPx: 8,
      borderRadiusPx: 31,
      fontSize: 30,
      background: 'rgba(0, 0, 0, 0.85)',
      color: '#ffffff',
      focusBackground: '',
      focusColor: ''
    },
    placementFree: { x: 12, y: 42 }
  }
}

export function defaultCustomTickerData() {
  return {
    messages: [
      {
        id: `msg-seed-${Date.now()}`,
        text: 'Welcome to the stream',
        enabled: true
      }
    ],
    speed: 90,
    textInsetLeft: 16,
    textInsetRight: 1,
    fadeWidth: 4,
    separator: '   •   ',
    fontSize: 30,
    color: '#ffffff',
    fontFamily: '',
    layout: {
      refWidth: 1920,
      refHeight: 108,
      background: ''
    }
  }
}

export function defaultLowerThirdShowData() {
  return {
    template: {
      layout: { refWidth: 1920, refHeight: 1080, background: '' },
      elements: [
        {
          id: 'el-name',
          bind: 'name',
          label: 'Name',
          text: '',
          x: 6,
          y: 82,
          fontSize: 40,
          color: '#ffffff',
          fontFamily: ''
        },
        {
          id: 'el-title',
          bind: 'title',
          label: 'Title',
          text: '',
          x: 6,
          y: 88,
          fontSize: 26,
          color: '#e5e5e5',
          fontFamily: ''
        }
      ],
      animation: { in: 'slide-up', out: 'fade', durationMs: 400 }
    },
    activeEntryId: null,
    entries: []
  }
}

export function defaultStreamCountdownData() {
  const target = new Date(Date.now() + 15 * 60 * 1000)
  return {
    targetDateTime: target.toISOString(),
    format: 'mm:ss',
    fontSize: 96,
    color: '#1d1d1f',
    fontFamily: '',
    hideWhenExpired: false,
    layout: {
      refWidth: 480,
      refHeight: 140,
      background: ''
    }
  }
}

const GRAPHIC_TEMPLATES = {
  matchScoreboard: (name) => ({
    type: 'matchScoreboard',
    name,
    visible: false,
    soloVisible: false,
    position: 'top-center',
    operator: true,
    data: defaultMatchData()
  }),
  customTicker: (name) => ({
    type: 'customTicker',
    name,
    visible: false,
    soloVisible: false,
    position: 'bottom-full',
    operator: true,
    data: defaultCustomTickerData()
  }),
  streamCountdown: (name) => ({
    type: 'streamCountdown',
    name,
    visible: false,
    soloVisible: false,
    position: 'top-center',
    operator: false,
    data: defaultStreamCountdownData()
  }),
  lowerThird: (name) => ({
    type: 'lowerThird',
    name,
    visible: false,
    soloVisible: false,
    position: 'bottom-left',
    operator: false,
    data: { name: 'Name', title: 'Title', company: '' }
  }),
  lowerThirdShow: (name) => ({
    type: 'lowerThirdShow',
    name,
    visible: false,
    soloVisible: false,
    position: 'bottom-left',
    operator: true,
    data: defaultLowerThirdShowData()
  }),
  message: (name) => ({
    type: 'message',
    name,
    visible: false,
    soloVisible: false,
    position: 'bottom-center',
    operator: false,
    data: { text: 'Message' }
  }),
  quizShow: (name) => ({
    type: 'quizShow',
    name,
    visible: false,
    soloVisible: false,
    position: 'bottom-left',
    operator: true,
    data: defaultQuizShowData()
  }),
  f1Timing: (name) => ({
    type: 'f1Timing',
    name,
    visible: false,
    soloVisible: false,
    position: 'custom',
    operator: true,
    data: defaultF1TimingData()
  }),
  hockeyScorebug: (name) => ({
    type: 'hockeyScorebug',
    name,
    visible: false,
    soloVisible: false,
    position: 'top-center',
    operator: true,
    data: defaultHockeyScorebugData()
  })
}

export function defaultQuizShowData() {
  return {
    questions: [
      {
        id: 'q-demo',
        question: 'Who scores the first goal tonight?',
        options: ['Player A', 'Player B', 'Player C', 'Player D'],
        correct: 0
      }
    ],
    activeQuestionId: null,
    revealed: false,
    // Paneel links zodat presentatoren rechts in beeld blijven
    panel: { x: 4, y: 50, width: 44 }
  }
}

export function defaultTransition() {
  return { in: 'auto', out: 'auto', duration: 450 }
}

/** Widget types that can be created via POST /api/graphics. */
export const WIDGET_TYPES = Object.freeze(Object.keys(GRAPHIC_TEMPLATES))

export function isWidgetType(type) {
  // Own-property check: never resolve "constructor", "toString", … from the prototype.
  return typeof type === 'string' && Object.hasOwn(GRAPHIC_TEMPLATES, type)
}

/** Unique graphic id, e.g. "match-scoreboard-3f9a1c2e" (no Date.now collisions). */
export function graphicIdFor(type) {
  const slug = type.replace(/([A-Z])/g, '-$1').toLowerCase().replace(/^-/, '')
  return `${slug}-${crypto.randomUUID().slice(0, 8)}`
}

export function createGraphicFromType(type, name = 'New widget') {
  if (!isWidgetType(type)) {
    throw Object.assign(new Error(`Unknown widget type: ${String(type).slice(0, 60)}`), {
      status: 400,
      expose: true
    })
  }
  const factory = GRAPHIC_TEMPLATES[type]
  return { id: graphicIdFor(type), transition: defaultTransition(), ...factory(name) }
}
