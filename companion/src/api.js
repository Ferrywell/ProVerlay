import { InstanceStatus } from '@companion-module/base'
import { io } from 'socket.io-client'

export default {
  initConnection() {
    const host = this.config.host || '127.0.0.1'
    const port = this.config.port || '2014'
    const url = `http://${host}:${port}`

    if (this.client) {
      this.client.removeAllListeners()
      this.client.disconnect()
    }

    this.log('info', `Connecting to ProVerlay at ${url}`)
    this.client = io(url, { transports: ['websocket', 'polling'], reconnection: false })

    this.client.on('connect', async () => {
      this.log('info', 'Connected to ProVerlay')
      this.updateStatus(InstanceStatus.Ok)
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer)
        this.reconnectTimer = null
      }
      await this.refreshState()
    })

    this.client.on('disconnect', () => {
      this.log('error', 'Disconnected from ProVerlay')
      this.updateStatus(InstanceStatus.ConnectionFailure, 'Disconnected from ProVerlay')
      this.scheduleReconnect()
    })

    this.client.on('connect_error', (error) => {
      this.log('debug', error.message)
      this.updateStatus(InstanceStatus.ConnectionFailure, 'Connection failed')
      this.scheduleReconnect()
    })

    this.client.on('stateChanged', async (state) => {
      this.state = state
      await this.onStateUpdated()
    })
  },

  scheduleReconnect() {
    if (!this.config.reconnect || this.reconnectTimer) return
    const delay = Number(this.config.reconnect_interval) || 5000
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.initConnection()
    }, delay)
  },

  async refreshState() {
    const host = this.config.host || '127.0.0.1'
    const port = this.config.port || '2014'
    const response = await fetch(`http://${host}:${port}/api/state`)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    this.state = await response.json()
    await this.onStateUpdated()
  },

  async onStateUpdated() {
    this.graphics =
      this.state.graphics?.length > 0
        ? this.state.graphics.map((graphic) => ({
            id: graphic.id,
            label: graphic.name || graphic.type
          }))
        : [{ id: null, label: 'No graphics loaded' }]

    this.initActions()
    this.initFeedbacks()
    this.initVariables()
    this.initPresets()
    this.checkAllFeedbacks()
  },

  async setGraphicVisibility(id, visible) {
    const host = this.config.host || '127.0.0.1'
    const port = this.config.port || '2014'
    await fetch(`http://${host}:${port}/api/graphics/${id}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visible: Boolean(visible) })
    })
  },

  async setGraphicSoloVisibility(id, soloVisible) {
    const host = this.config.host || '127.0.0.1'
    const port = this.config.port || '2014'
    await fetch(`http://${host}:${port}/api/graphics/${id}/toggle-solo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ soloVisible: Boolean(soloVisible) })
    })
  },

  async patchState(patch) {
    const host = this.config.host || '127.0.0.1'
    const port = this.config.port || '2014'
    await fetch(`http://${host}:${port}/api/state`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    })
  },

  async patchGraphic(id, patch) {
    const host = this.config.host || '127.0.0.1'
    const port = this.config.port || '2014'
    await fetch(`http://${host}:${port}/api/graphics/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    })
  },

  async showLowerThirdEntry(graphicId, entryId) {
    const host = this.config.host || '127.0.0.1'
    const port = this.config.port || '2014'
    await fetch(`http://${host}:${port}/api/graphics/${graphicId}/entries/${entryId}/show`, {
      method: 'POST'
    })
  },

  async hideLowerThirdShow(graphicId) {
    const host = this.config.host || '127.0.0.1'
    const port = this.config.port || '2014'
    await fetch(`http://${host}:${port}/api/graphics/${graphicId}/hide`, {
      method: 'POST'
    })
  },

  buildSpeakerEntryChoices() {
    const choices = []
    for (const graphic of this.state.graphics || []) {
      if (graphic.type !== 'lowerThirdShow') continue
      for (const entry of graphic.data?.entries || []) {
        choices.push({
          id: `${graphic.id}|${entry.id}`,
          label: `${graphic.name}: ${entry.name}`
        })
      }
    }
    if (!choices.length) choices.push({ id: '', label: 'Geen sprekers' })
    return choices
  }
}
