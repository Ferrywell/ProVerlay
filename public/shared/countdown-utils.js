export function msUntilTarget(targetDateTime) {
  if (!targetDateTime) return 0
  const target = new Date(targetDateTime).getTime()
  if (Number.isNaN(target)) return 0
  return Math.max(0, target - Date.now())
}

export function countdownTargetFromDuration(minutes = 0, seconds = 0) {
  const totalSec = Math.max(0, Math.floor(Number(minutes) || 0) * 60 + Math.floor(Number(seconds) || 0))
  return new Date(Date.now() + totalSec * 1000).toISOString()
}

export function countdownShouldTick(graphic) {
  if (!graphic || graphic.type !== 'streamCountdown') return false
  if (!graphic.data?.targetDateTime) return false
  const ms = msUntilTarget(graphic.data.targetDateTime)
  if (ms <= 0 && graphic.data?.hideWhenExpired) return false
  return true
}

export function formatCountdown(ms, format = 'mm:ss') {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60

  if (format === 'h:mm:ss') {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  const totalMin = Math.floor(totalSec / 60)
  return `${totalMin}:${String(s).padStart(2, '0')}`
}

/** @deprecated Use segment markup in countdownDigitHtml; kept for legacy callers */
export function countdownLetterSpacing() {
  return '0'
}

export function countdownDigitHtml(text = '') {
  if (!text.includes(':')) {
    return `<span class="cd-seg">${text}</span>`
  }
  const parts = text.split(':')
  return parts
    .map((part, i) => {
      const seg = `<span class="cd-seg">${part}</span>`
      return i < parts.length - 1 ? `${seg}<span class="cd-colon">:</span>` : seg
    })
    .join('')
}
