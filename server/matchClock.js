/**
 * FIFA-style clock formatting.
 * Regular: 55:15 (55 min, 15 sec)
 * Stoppage 2nd half: 90+1:22
 * Extra time 2nd period: 105+0:45 or 120+2:10
 */
export function formatMatchClock(clock = {}) {
  const minute = Number(clock.minute) || 0
  const second = Number(clock.second) || 0
  const period = clock.period || 'first_half'
  const stoppage = Boolean(clock.stoppageTime)
  const sec = String(second).padStart(2, '0')

  if (stoppage) {
    if (period === 'first_half') {
      const added = Math.max(0, minute - 45)
      return `45+${added}:${sec}`
    }
    if (period === 'second_half') {
      const added = Math.max(0, minute - 90)
      return `90+${added}:${sec}`
    }
    if (period === 'extra_first') {
      const added = Math.max(0, minute - 105)
      return `105+${added}:${sec}`
    }
    if (period === 'extra_second') {
      const added = Math.max(0, minute - 120)
      return `120+${added}:${sec}`
    }
  }

  return `${minute}:${sec}`
}

export const PERIOD_LABELS = {
  first_half: '1e helft',
  second_half: '2e helft',
  extra_first: 'Verlenging 1e',
  extra_second: 'Verlenging 2e',
  penalties: 'Penalties'
}

export function defaultMatchData() {
  return {
    sport: 'football',
    homeCode: 'HOME',
    awayCode: 'AWAY',
    homeName: '',
    awayName: '',
    homeScore: 0,
    awayScore: 0,
    showCodes: true,
    showNames: false,
    widgets: {
      homeCode: true,
      awayCode: true,
      homeScore: true,
      awayScore: true,
      clock: true,
      penalties: false
    },
    clock: {
      period: 'second_half',
      minute: 0,
      second: 0,
      stoppageTime: false,
      autoStoppageAt90: false,
      running: false,
      runningSince: null
    },
    penalties: {
      active: false,
      homeKicks: [],
      awayKicks: [],
      homeScore: 0,
      awayScore: 0
    },
    animation: {
      enabled: true,
      durationMs: 420
    },
    layout: { refWidth: 1920, refHeight: 1080, background: '' },
    elements: [
      { id: 'el-home-code', bind: 'homeCode', label: 'Home code', text: 'HOME', x: 18, y: 50, fontSize: 42, color: '#ffffff', fontFamily: '' },
      { id: 'el-home-score', bind: 'homeScore', label: 'Home score', text: '0', x: 18, y: 62, fontSize: 64, color: '#ffffff', fontFamily: '' },
      { id: 'el-clock', bind: 'clock', label: 'Clock', text: '0:00', x: 50, y: 56, fontSize: 36, color: '#ffffff', fontFamily: '' },
      { id: 'el-away-code', bind: 'awayCode', label: 'Away code', text: 'AWAY', x: 82, y: 50, fontSize: 42, color: '#ffffff', fontFamily: '' },
      { id: 'el-away-score', bind: 'awayScore', label: 'Away score', text: '0', x: 82, y: 62, fontSize: 64, color: '#ffffff', fontFamily: '' }
    ]
  }
}
