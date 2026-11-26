/**
 * Small REST client for the ProVerlay HTTP API (see docs/ARCHITECTURE.md).
 * Every response is checked: non-2xx answers throw an ApiError carrying the
 * server's `{ error }` message, network failures and timeouts throw too.
 */

export class ApiError extends Error {
  constructor(message, { status = 0, path = '' } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.path = path
  }
}

const enc = encodeURIComponent

export class ProVerlayApi {
  /**
   * @param {object} options
   * @param {string} options.baseUrl e.g. http://127.0.0.1:2014
   * @param {typeof fetch} [options.fetch] injectable for tests
   * @param {number} [options.timeoutMs]
   */
  constructor({ baseUrl, fetch: fetchImpl = globalThis.fetch, timeoutMs = 5000 } = {}) {
    this.baseUrl = String(baseUrl || '').replace(/\/+$/, '')
    this.fetch = fetchImpl
    this.timeoutMs = timeoutMs
  }

  async request(method, path, body) {
    const init = { method, headers: { Accept: 'application/json' } }
    if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json'
      init.body = JSON.stringify(body)
    }
    if (this.timeoutMs > 0 && typeof AbortSignal?.timeout === 'function') {
      init.signal = AbortSignal.timeout(this.timeoutMs)
    }

    let response
    try {
      response = await this.fetch(`${this.baseUrl}${path}`, init)
    } catch (err) {
      const reason = err?.name === 'TimeoutError' ? `timed out after ${this.timeoutMs} ms` : err?.message || String(err)
      throw new ApiError(`${method} ${path}: ${reason}`, { path })
    }

    const text = await response.text().catch(() => '')
    let json
    if (text) {
      try {
        json = JSON.parse(text)
      } catch {
        json = undefined
      }
    }

    if (!response.ok) {
      const detail = (json && typeof json.error === 'string' && json.error) || text.slice(0, 200) || response.statusText
      throw new ApiError(`${method} ${path}: HTTP ${response.status}${detail ? ` – ${detail}` : ''}`, {
        status: response.status,
        path,
      })
    }
    return json
  }

  getState() {
    return this.request('GET', '/api/state')
  }

  patchState(patch) {
    return this.request('PATCH', '/api/state', patch)
  }

  patchGraphic(id, patch) {
    return this.request('PATCH', `/api/graphics/${enc(id)}`, patch)
  }

  /** visible: true/false sets, undefined flips atomically on the server. */
  setVisible(id, visible) {
    return this.request('POST', `/api/graphics/${enc(id)}/toggle`, visible === undefined ? {} : { visible })
  }

  /** soloVisible: true/false sets, undefined flips atomically on the server. */
  setSoloVisible(id, soloVisible) {
    return this.request(
      'POST',
      `/api/graphics/${enc(id)}/toggle-solo`,
      soloVisible === undefined ? {} : { soloVisible },
    )
  }

  /** Takes a graphic off the combined output (lower-thirds rosters keep their active entry). */
  hide(id) {
    return this.request('POST', `/api/graphics/${enc(id)}/hide`, {})
  }

  /** { side, delta } or { side, value } — applied atomically on the server. */
  score(id, body) {
    return this.request('POST', `/api/graphics/${enc(id)}/score`, body)
  }

  /** { action: start|pause|toggle|reset|adjust|set, ms? } — applied atomically on the server. */
  clock(id, action, ms) {
    return this.request('POST', `/api/graphics/${enc(id)}/clock`, ms === undefined ? { action } : { action, ms })
  }

  showEntry(id, entryId) {
    return this.request('POST', `/api/graphics/${enc(id)}/entries/${enc(entryId)}/show`, {})
  }

  /** Image widget: put one image on air. */
  showImage(id, imageId) {
    return this.request('POST', `/api/graphics/${enc(id)}/images/${enc(imageId)}/show`, {})
  }

  /** Image widget: next/previous image on air (computed on the server). */
  stepImage(id, direction, wrap = true) {
    return this.request('POST', `/api/graphics/${enc(id)}/images/step`, { direction, wrap })
  }

  /** Any widget with steps: delta 1 = next, -1 = previous (computed on the server). */
  step(id, delta, wrap = true) {
    return this.request('POST', `/api/graphics/${enc(id)}/step`, { delta, wrap })
  }

  /** An action the widget's type declares (`state.widgetTypes`), with its payload. */
  runAction(id, actionId, payload = {}) {
    return this.request('POST', `/api/graphics/${enc(id)}/actions/${enc(actionId)}`, payload)
  }
}
