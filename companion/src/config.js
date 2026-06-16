export default {
  getConfigFields() {
    return [
      {
        type: 'textinput',
        id: 'host',
        label: 'Host',
        width: 6,
        default: '127.0.0.1'
      },
      {
        type: 'textinput',
        id: 'port',
        label: 'Port',
        width: 3,
        default: '2014',
        regex: '/^\\d+$/'
      },
      {
        type: 'checkbox',
        id: 'reconnect',
        label: 'Auto reconnect',
        default: true
      },
      {
        type: 'number',
        id: 'reconnect_interval',
        label: 'Reconnect interval (ms)',
        default: 5000,
        min: 1000,
        max: 60000
      }
    ]
  }
}
