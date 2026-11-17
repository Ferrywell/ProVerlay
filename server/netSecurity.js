/**
 * LAN security model.
 *
 * ProVerlay has no login: anyone on the local network can operate it. What we
 * do guard against is a *web page* (in a browser on the same machine or LAN)
 * talking to the server: cross-origin form posts, fetch() "simple requests",
 * WebSocket hijacking and DNS-rebinding.
 *
 * - Requests without an Origin header (Companion, curl, OBS, navigations) are
 *   allowed.
 * - Requests with an Origin header are allowed only when the origin's host is
 *   local: loopback, a private/link-local IP, a single-label name, *.local /
 *   *.lan / *.home.arpa / *.internal / *.localhost, this machine's hostname,
 *   or a name listed in PROVERLAY_ALLOWED_HOSTS (comma separated).
 * - The Host header must be an IP literal or one of those local names, which
 *   defeats DNS rebinding (an attacker's domain resolving to 192.168.x.x).
 */
import net from 'net'
import os from 'os'

const LOCAL_SUFFIXES = ['.localhost', '.local', '.lan', '.home.arpa', '.internal', '.home']

function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0
}

function inV4Range(ip, base, bits) {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask)
}

/** Loopback, RFC1918, link-local, CGNAT (Tailscale) and IPv6 ULA/link-local. */
export function isPrivateIp(ip) {
  let addr = String(ip || '').trim().replace(/^\[|\]$/g, '')
  const zone = addr.indexOf('%')
  if (zone !== -1) addr = addr.slice(0, zone)
  const family = net.isIP(addr)
  if (family === 4) {
    return (
      inV4Range(addr, '127.0.0.0', 8) ||
      inV4Range(addr, '10.0.0.0', 8) ||
      inV4Range(addr, '172.16.0.0', 12) ||
      inV4Range(addr, '192.168.0.0', 16) ||
      inV4Range(addr, '169.254.0.0', 16) ||
      inV4Range(addr, '100.64.0.0', 10)
    )
  }
  if (family === 6) {
    const lower = addr.toLowerCase()
    if (lower === '::1') return true
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return isPrivateIp(mapped[1])
    const first = parseInt(lower.split(':')[0] || '0', 16)
    if ((first & 0xfe00) === 0xfc00) return true // fc00::/7 unique local
    if ((first & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
    return false
  }
  return false
}

function extraAllowedHosts() {
  return String(process.env.PROVERLAY_ALLOWED_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
}

/** True when `hostname` (no port) points at this machine or the local network. */
export function isTrustedHostname(hostname) {
  const host = String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
  if (!host) return false
  if (net.isIP(host)) return isPrivateIp(host)
  if (!/^[a-z0-9.-]+$/.test(host)) return false
  if (host === 'localhost') return true
  if (!host.includes('.')) return true // single-label LAN name (e.g. "studio-pc")
  if (LOCAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true
  if (host === os.hostname().toLowerCase()) return true
  return extraAllowedHosts().includes(host)
}

/** Split a Host header value into its hostname. */
function hostnameFromHostHeader(value) {
  const v = String(value || '').trim()
  if (v.startsWith('[')) return v.slice(1, v.indexOf(']'))
  const colon = v.lastIndexOf(':')
  return colon === -1 ? v : v.slice(0, colon)
}

export function isAllowedHostHeader(value) {
  if (!value) return true // HTTP/1.0 clients
  const hostname = hostnameFromHostHeader(value)
  if (net.isIP(hostname)) return true // IP literals cannot be DNS-rebound
  return isTrustedHostname(hostname)
}

export function isAllowedOrigin(origin) {
  if (origin === undefined || origin === '') return true
  let url
  try {
    url = new URL(origin)
  } catch {
    return false
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  return isTrustedHostname(url.hostname)
}

/** Returns null when the request may proceed, otherwise a reason string. */
export function rejectReason(req) {
  if (!isAllowedHostHeader(req.headers.host)) return 'Host not allowed'
  if (!isAllowedOrigin(req.headers.origin)) return 'Origin not allowed'
  return null
}

/** Express middleware: 403 for foreign Origin / Host headers. */
export function originGuard() {
  return (req, res, next) => {
    const reason = rejectReason(req)
    if (!reason) return next()
    res.status(403).json({ error: `Forbidden: ${reason}` })
  }
}

/** socket.io `allowRequest` hook with the same rules. */
export function socketAllowRequest(req, callback) {
  const reason = rejectReason(req)
  callback(reason, !reason)
}
