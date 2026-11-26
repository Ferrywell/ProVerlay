import crypto from 'crypto'
import { defaultMatchData } from './matchClock.js'
import { defaultF1Drivers } from './f1Timing.js'
import { experimentalFlagForType, isExperimentalEnabled } from './experimental.js'

export function defaultHockeyScorebugData() {
  return {
    homeCode: 'HOME',
    awayCode: 'AWAY',
    homeScore: 0,
    awayScore: 0,
    homeColor: '#E5484D',
    awayColor: '#3E63DD',
    clock: {
      period: 'q1',
      remainingMs: 900000,
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

/**
 * Now playing: the track from the Spotify app on the ProVerlay computer
 * (server/nowPlaying.js), or text typed by the operator.
 */
export function defaultNowPlayingData() {
  return {
    source: 'spotify', // 'spotify' | 'manual'
    // Manual text; with source 'spotify' it shows while Spotify has nothing to show.
    title: '',
    artist: '',
    label: 'Now playing',
    showArtwork: true,
    // true: only on screen while a track plays; false: keep the last track while paused.
    hideWhenIdle: true,
    pollMs: 2000,
    widthPx: 620,
    placementFree: { x: 80, y: 80 }
  }
}

/*
 * Default positions are chosen so widgets that are typically live at the same
 * time do not overlap (render.js supports center, top-left/-center/-right,
 * bottom-left/-center, bottom-full and custom = data.placementFree x/y %):
 *   matchScoreboard / hockeyScorebug  top-center  (alternatives for one show)
 *   streamCountdown                   center      (pre-show)
 *   customTicker                      bottom-full
 *   message                           custom, bottom center just above the ticker
 *   lowerThird / lowerThirdShow       bottom-left
 *   quizShow                          top-left    (panel itself sits left, see data.panel)
 *   f1Timing                          custom      (left side, data.placementFree; experimental)
 *   image                             center      (free placement, original size)
 *   nowPlaying                        custom      (bottom right, clear of the lower third)
 * Only newly created widgets use these; existing projects keep their positions.
 */
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
    position: 'center',
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
    position: 'custom',
    operator: false,
    data: { text: 'Message', placementFree: { x: 50, y: 82 } }
  }),
  quizShow: (name) => ({
    type: 'quizShow',
    name,
    visible: false,
    soloVisible: false,
    position: 'top-left',
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
  image: (name) => ({
    type: 'image',
    name,
    visible: false,
    soloVisible: false,
    position: 'center',
    operator: true,
    data: defaultImageData()
  }),
  hockeyScorebug: (name) => ({
    type: 'hockeyScorebug',
    name,
    visible: false,
    soloVisible: false,
    position: 'top-center',
    operator: true,
    data: defaultHockeyScorebugData()
  }),
  nowPlaying: (name) => ({
    type: 'nowPlaying',
    name,
    visible: false,
    soloVisible: false,
    position: 'custom',
    operator: true,
    data: defaultNowPlayingData()
  })
}

export function defaultImageData() {
  return {
    images: [],
    activeImageId: null,
    variant: 'free',
    size: { mode: 'original' },
    autoHideMs: 0,
    rotation: { enabled: false, intervalMs: 8000 }
  }
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
    // Panel on the left so presenters stay visible on the right
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
  const flag = experimentalFlagForType(type)
  if (flag && !isExperimentalEnabled(flag)) {
    throw Object.assign(
      new Error(`${type} is experimental: start ProVerlay with PROVERLAY_EXPERIMENTAL=${flag} to add one`),
      { status: 400, expose: true }
    )
  }
  const factory = GRAPHIC_TEMPLATES[type]
  return { id: graphicIdFor(type), transition: defaultTransition(), ...factory(name) }
}
