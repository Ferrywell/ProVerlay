/** Keep a range slider and number input in sync. */

export function clampNumber(value, min, max) {
  const n = Number(value)
  if (Number.isNaN(n)) return min
  return Math.min(max, Math.max(min, n))
}

export function bindRangeNumber(rangeEl, numberEl, { min, max, step = 0.1, onChange } = {}) {
  if (!rangeEl || !numberEl) return () => {}

  const limits = () => ({
    min: Number(rangeEl.min ?? numberEl.min ?? min ?? 0),
    max: Number(rangeEl.max ?? numberEl.max ?? max ?? 100)
  })

  const syncFromRange = () => {
    const { min: lo, max: hi } = limits()
    const value = clampNumber(rangeEl.value, lo, hi)
    rangeEl.value = String(value)
    numberEl.value = String(value)
    onChange?.(value)
  }

  const syncFromNumber = () => {
    const { min: lo, max: hi } = limits()
    const value = clampNumber(numberEl.value, lo, hi)
    numberEl.value = String(value)
    rangeEl.value = String(value)
    onChange?.(value)
  }

  rangeEl.addEventListener('input', syncFromRange)
  numberEl.addEventListener('change', syncFromNumber)
  numberEl.addEventListener('input', () => {
    if (numberEl.value === '' || numberEl.value === '-') return
    syncFromNumber()
  })

  return () => {
    rangeEl.removeEventListener('input', syncFromRange)
    numberEl.removeEventListener('change', syncFromNumber)
  }
}

export function setRangeNumberPair(rangeEl, numberEl, value, { min, max } = {}) {
  const v = clampNumber(value, min ?? 0, max ?? 100)
  if (rangeEl) rangeEl.value = String(v)
  if (numberEl) numberEl.value = String(v)
  return v
}
