import { InstanceBase, InstanceStatus } from '@companion-module/base'
import { io } from 'socket.io-client'
import { UpgradeScripts } from './src/upgrades.js'
import { getConfigFields, resolveConfig } from './src/config.js'
import { getActionDefinitions } from './src/actions.js'
import { getFeedbackDefinitions } from './src/feedbacks.js'
import { diffValues, getTimeVariableValues, getVariableDefinitions, getVariableValues } from './src/variables.js'
import { getPresetDefinitions } from './src/presets.js'
import { ProVerlayApi } from './src/api.js'
import { buildVarKeys, graphicsOf, graphicsSignature, isHockeyQuarter } from './src/model.js'

/** How often clock/countdown variables are recomputed locally (no network traffic). */
const TICK_MS = 250
/** Fallback: fetch GET /api/state when no `stateChanged` arrives this long after connecting. */
const STATE_FALLBACK_MS = 3000

export default class ProVerlayInstance extends InstanceBase {
  constructor(internal) {
    super(internal)
    this.config = {}
    this.state = { graphics: [] }
    this.api = null
    this.socket = null
    /** socket.io-client factory; replaced in tests. */
    this.socketFactory = io
    this.signature = null
    this.varKeys = new Map()
    this.variableValues = {}
    this.serverOffset = 0
    this.hockeyLastQuarter = new Map()
    this.hasState = false
    this.status = null
    this.tickTimer = null
    this.fallbackTimer = null
    this.reconnectTimer = null
    this.failureLogged = false
  }

  async init(config) {
    await this.configUpdated(config)
  }

  async configUpdated(config) {
    this.config = config || {}
    this.stopConnection()
    this.state = { graphics: [] }
    this.hasState = false
    this.applyState(this.state, { force: true })

    const resolved = resolveConfig(this.config)
    if (resolved.error) {
      this.setStatus(InstanceStatus.BadConfig, resolved.error)
      return
    }
    this.api = new ProVerlayApi({ baseUrl: resolved.baseUrl })
    this.startConnection(resolved.baseUrl)
  }

  async destroy() {
    this.stopConnection()
  }

  getConfigFields() {
    return getConfigFields()
  }

  /** Server clock in ms: local time corrected with the `serverNow` of the last state. */
  serverNow() {
    return Date.now() + this.serverOffset
  }

  setStatus(status, message = null) {
    const key = `${status}|${message ?? ''}`
    if (this.status === key) return
    this.status = key
    this.updateStatus(status, message)
  }

  /* ------------------------------------------------------------ connection */

  startConnection(baseUrl) {
    this.setStatus(InstanceStatus.Connecting, `Connecting to ${baseUrl}`)
    this.log('info', `Connecting to ProVerlay at ${baseUrl}`)
    this.failureLogged = false

    // Built-in socket.io reconnection with exponential backoff (1 s → 30 s, jittered).
    // No custom headers: ProVerlay accepts requests without an Origin header.
    const socket = this.socketFactory(baseUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.5,
      timeout: 5000,
    })
    this.socket = socket

    socket.on('connect', () => {
      this.log('info', 'Connected to ProVerlay')
      this.failureLogged = false
      this.setStatus(InstanceStatus.Connecting, 'Waiting for state')
      clearTimeout(this.fallbackTimer)
      this.fallbackTimer = setTimeout(() => {
        if (!this.hasState) this.fetchState()
      }, STATE_FALLBACK_MS)
    })

    socket.on('disconnect', (reason) => {
      if (reason === 'io client disconnect') return
      this.hasState = false
      this.log('warn', `Disconnected from ProVerlay (${reason}), reconnecting…`)
      this.setStatus(InstanceStatus.Disconnected, 'Disconnected, reconnecting…')
      // socket.io does not reconnect by itself after a server-side disconnect
      // (ProVerlay closes all sockets when it shuts down cleanly).
      if (reason === 'io server disconnect') {
        clearTimeout(this.reconnectTimer)
        this.reconnectTimer = setTimeout(() => {
          if (this.socket === socket && !socket.connected) socket.connect()
        }, 1000)
      }
    })

    socket.on('connect_error', (err) => {
      const message = err?.message || String(err)
      if (!this.failureLogged) {
        this.log('warn', `Cannot reach ProVerlay at ${baseUrl}: ${message} (retrying with backoff)`)
        this.failureLogged = true
      } else {
        this.log('debug', `Connection attempt failed: ${message}`)
      }
      this.setStatus(InstanceStatus.ConnectionFailure, message)
    })

    socket.on('stateChanged', (state) => this.handleState(state))

    clearInterval(this.tickTimer)
    this.tickTimer = setInterval(() => this.tick(), TICK_MS)
  }

  stopConnection() {
    clearInterval(this.tickTimer)
    clearTimeout(this.fallbackTimer)
    clearTimeout(this.reconnectTimer)
    this.tickTimer = null
    this.fallbackTimer = null
    this.reconnectTimer = null
    if (this.socket) {
      this.socket.removeAllListeners()
      this.socket.disconnect()
      this.socket = null
    }
  }

  async fetchState() {
    if (!this.api) return
    try {
      this.handleState(await this.api.getState())
    } catch (err) {
      this.log('warn', `Could not load the ProVerlay state: ${err?.message || err}`)
    }
  }

  /* ----------------------------------------------------------------- state */

  handleState(state) {
    if (!state || typeof state !== 'object' || !Array.isArray(state.graphics)) {
      this.log('warn', 'Ignored an invalid state from ProVerlay')
      return
    }
    const serverNow = Number(state.serverNow)
    if (state.serverNow != null && Number.isFinite(serverNow)) this.serverOffset = serverNow - Date.now()

    for (const g of graphicsOf(state)) {
      const period = g.type === 'hockeyScorebug' ? g.data?.clock?.period : null
      if (isHockeyQuarter(period)) this.hockeyLastQuarter.set(g.id, period)
    }

    this.state = state
    this.hasState = true
    this.setStatus(InstanceStatus.Ok)
    this.applyState(state)
  }

  /**
   * Push a state to Companion. Definitions (actions, feedbacks, variables,
   * presets) are only rebuilt when the graphics signature changes; variable
   * values (diffed) and feedbacks are refreshed every time.
   * Returns true when the definitions were rebuilt.
   */
  applyState(state, { force = false } = {}) {
    const signature = graphicsSignature(state)
    const rebuild = force || signature !== this.signature
    if (rebuild) {
      this.signature = signature
      this.varKeys = buildVarKeys(state)
      this.setActionDefinitions(getActionDefinitions(this))
      this.setFeedbackDefinitions(getFeedbackDefinitions(this))
      this.setVariableDefinitions(getVariableDefinitions(state, this.varKeys))
      const { structure, presets } = getPresetDefinitions(state, this.varKeys, this.label || 'proverlay')
      this.setPresetDefinitions(structure, presets)
      this.variableValues = {}
    }
    this.updateVariables(getVariableValues(state, this.varKeys, this.serverNow()))
    this.checkAllFeedbacks()
    return rebuild
  }

  updateVariables(values) {
    const changed = diffValues(this.variableValues, values)
    if (!Object.keys(changed).length) return
    Object.assign(this.variableValues, changed)
    this.setVariableValues(changed)
  }

  /** Recompute running clocks / countdowns locally; only changed values are sent to Companion. */
  tick() {
    if (!this.hasState) return
    this.updateVariables(getTimeVariableValues(this.state, this.varKeys, this.serverNow()))
  }
}

export { UpgradeScripts }
