/** UA-based device class for `/` redirect (matches Design Brief v1.0 routing). */
export function detectDevice(userAgent = '') {
  const ua = userAgent.toLowerCase()
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(ua)) return 'tablet'
  if (/iphone|ipod|android.*mobile|windows phone|blackberry|mobile/i.test(ua)) return 'mobile'
  return 'desktop'
}

export function preferredDashboard(device, query = {}) {
  if (query.view === 'control') return 'control'
  if (query.view === 'operator') return 'operator'
  if (device === 'mobile' || device === 'tablet') return 'operator'
  return 'control'
}
