/**
 * Fetching a data source over the internet (Google Sheets CSV export).
 *
 * The server listens on 0.0.0.0 without a login, so anyone on the network can
 * add a source. What it fetches is therefore limited:
 * - https only;
 * - Google Sheets hosts by default; other hosts only when listed in the
 *   project's allowed hosts (editable from the ProVerlay computer itself);
 * - every hop (redirects included) must resolve to a public address: the
 *   address check runs in the socket's DNS lookup, so it also covers DNS
 *   rebinding between check and connect;
 * - at most 5 redirects, a 10 s timeout and a 5 MB body.
 */
import https from 'node:https'
import dns from 'node:dns'
import net from 'node:net'
import { isPrivateIp } from './netSecurity.js'

export const FETCH_TIMEOUT_MS = 10_000
export const FETCH_MAX_BYTES = 5 * 1024 * 1024
export const FETCH_MAX_REDIRECTS = 5

/** Hosts a sheet link may point at (and its CSV export may redirect to). */
export const DEFAULT_DATA_HOSTS = ['docs.google.com', '*.googleusercontent.com']

function fail(message) {
  return Object.assign(new Error(message), { expose: true })
}

export function normalizeHostPattern(value) {
  const host = String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  if (!host || !/^(\*\.)?[a-z0-9.-]+$/.test(host) || host.startsWith('.') || host.endsWith('.')) return ''
  return host
}

export function hostAllowed(hostname, extraHosts = []) {
  const host = String(hostname || '').toLowerCase()
  return [...DEFAULT_DATA_HOSTS, ...extraHosts.map(normalizeHostPattern).filter(Boolean)].some((pattern) =>
    pattern.startsWith('*.') ? host.endsWith(pattern.slice(1)) && host.length > pattern.length - 1 : host === pattern
  )
}

/**
 * Turn a Google Sheets link into its CSV export URL:
 *   …/spreadsheets/d/<id>/edit#gid=123        → …/spreadsheets/d/<id>/export?format=csv&gid=123
 *   …/spreadsheets/d/e/<pubid>/pubhtml?gid=1  → …/spreadsheets/d/e/<pubid>/pub?output=csv&gid=1
 * Links that already ask for CSV, and other hosts, are returned unchanged.
 */
export function sheetCsvUrl(raw) {
  let url
  try {
    url = new URL(String(raw || '').trim())
  } catch {
    throw fail('Not a valid link')
  }
  if (url.hostname !== 'docs.google.com' || !url.pathname.startsWith('/spreadsheets/')) return url.toString()
  const gid = url.searchParams.get('gid') || /(?:^|[#&])gid=(\d+)/.exec(url.hash)?.[1] || ''
  const published = /^\/spreadsheets\/d\/e\/([^/]+)/.exec(url.pathname)
  if (published) {
    if (url.searchParams.get('output') === 'csv') return url.toString()
    const out = new URL(`https://docs.google.com/spreadsheets/d/e/${published[1]}/pub`)
    out.searchParams.set('output', 'csv')
    if (gid) out.searchParams.set('gid', gid)
    if (url.searchParams.get('single')) out.searchParams.set('single', url.searchParams.get('single'))
    return out.toString()
  }
  const doc = /^\/spreadsheets\/d\/([^/]+)/.exec(url.pathname)
  if (!doc) return url.toString()
  if (url.pathname.endsWith('/export') && url.searchParams.get('format') === 'csv') return url.toString()
  const out = new URL(`https://docs.google.com/spreadsheets/d/${doc[1]}/export`)
  out.searchParams.set('format', 'csv')
  if (gid) out.searchParams.set('gid', gid)
  return out.toString()
}

/** DNS lookup for https.request that refuses private, loopback and link-local addresses. */
export function publicOnlyLookup(hostname, options, callback) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err)
    const list = Array.isArray(addresses) ? addresses : [{ address: addresses, family: options.family || 4 }]
    const blocked = list.find((a) => isPrivateIp(a.address))
    if (blocked || !list.length) {
      return callback(fail(`${hostname} resolves to a private address; only public hosts can be fetched`))
    }
    if (options.all) return callback(null, list)
    callback(null, list[0].address, list[0].family)
  })
}

function requestOnce(url, { timeoutMs, maxBytes, lookup }) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        lookup,
        timeout: timeoutMs,
        headers: { 'User-Agent': 'ProVerlay data source', Accept: 'text/csv, text/plain, */*' }
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          resolve({ redirect: new URL(res.headers.location, url).toString() })
          return
        }
        if (res.statusCode !== 200) {
          res.resume()
          const hint =
            res.statusCode === 401 || res.statusCode === 403 || res.statusCode === 404
              ? ' (is the sheet shared as "anyone with the link" or published to the web?)'
              : ''
          reject(fail(`HTTP ${res.statusCode}${hint}`))
          return
        }
        const type = String(res.headers['content-type'] || '')
        if (type.includes('text/html')) {
          res.resume()
          reject(fail('Got a web page instead of CSV: share the sheet as "anyone with the link" or publish it as CSV'))
          return
        }
        const declared = Number(res.headers['content-length'])
        if (declared > maxBytes) {
          res.destroy()
          reject(fail(`The sheet is larger than ${Math.round(maxBytes / 1024 / 1024)} MB`))
          return
        }
        const chunks = []
        let size = 0
        res.on('data', (chunk) => {
          size += chunk.length
          if (size > maxBytes) {
            res.destroy()
            reject(fail(`The sheet is larger than ${Math.round(maxBytes / 1024 / 1024)} MB`))
            return
          }
          chunks.push(chunk)
        })
        res.on('end', () => resolve({ body: Buffer.concat(chunks) }))
        res.on('error', reject)
      }
    )
    req.on('timeout', () => req.destroy(fail(`No answer within ${Math.round(timeoutMs / 1000)} s`)))
    req.on('error', (err) => reject(err.expose ? err : fail(err.code === 'ENOTFOUND' ? 'Host not found (offline?)' : err.message)))
  })
}

/**
 * GET a URL under the rules above. Resolves to a Buffer.
 * `request` is injectable for tests (same signature as requestOnce).
 */
export async function fetchDataUrl(
  rawUrl,
  { allowedHosts = [], timeoutMs = FETCH_TIMEOUT_MS, maxBytes = FETCH_MAX_BYTES, request = requestOnce, lookup = publicOnlyLookup } = {}
) {
  let url = rawUrl
  for (let hop = 0; hop <= FETCH_MAX_REDIRECTS; hop++) {
    let parsed
    try {
      parsed = new URL(url)
    } catch {
      throw fail('Not a valid link')
    }
    if (parsed.protocol !== 'https:') throw fail('Only https:// links can be used')
    if (parsed.username || parsed.password) throw fail('Links with a user name or password are not allowed')
    if (!hostAllowed(parsed.hostname, allowedHosts)) {
      throw fail(
        hop === 0
          ? `${parsed.hostname} is not an allowed host. Google Sheets works by default; add other hosts under Allowed hosts on the Data page (on the ProVerlay computer).`
          : `The link redirects to ${parsed.hostname}, which is not an allowed host`
      )
    }
    // IP literals skip the DNS lookup, so check them here.
    const literal = parsed.hostname.replace(/^\[|\]$/g, '')
    if (net.isIP(literal) && isPrivateIp(literal)) throw fail('Private addresses cannot be fetched')
    const result = await request(parsed.toString(), { timeoutMs, maxBytes, lookup })
    if (result.body) return result.body
    url = result.redirect
  }
  throw fail('Too many redirects')
}
