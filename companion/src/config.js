import { Regex } from '@companion-module/base'

export const DEFAULT_HOST = '127.0.0.1'
export const DEFAULT_PORT = 2014

export function getConfigFields() {
  return [
    {
      type: 'static-text',
      id: 'info',
      label: 'ProVerlay server',
      width: 12,
      value:
        'Address of the machine running ProVerlay (the Mac app or "npm start"), default port 2014. ' +
        'The module reconnects automatically when the server restarts.',
    },
    {
      type: 'textinput',
      id: 'host',
      label: 'Host',
      width: 8,
      default: DEFAULT_HOST,
      regex: Regex.HOSTNAME,
    },
    {
      type: 'textinput',
      id: 'port',
      label: 'Port',
      width: 4,
      default: String(DEFAULT_PORT),
      regex: Regex.PORT,
    },
  ]
}

/**
 * Validate the stored config. Returns { host, port, baseUrl } or { error }.
 * Accepts the port as string (textinput) or number.
 */
export function resolveConfig(config) {
  const host = String(config?.host ?? '').trim() || DEFAULT_HOST
  const rawPort = config?.port === undefined || config?.port === '' ? DEFAULT_PORT : config.port
  const port = Number(rawPort)
  if (!/^[A-Za-z0-9.-]+$/.test(host) && !/^\[[0-9a-fA-F:]+\]$/.test(host)) {
    return { error: `Invalid host "${host}"` }
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { error: `Invalid port "${rawPort}"` }
  }
  return { host, port, baseUrl: `http://${host}:${port}` }
}
