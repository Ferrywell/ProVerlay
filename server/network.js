import os from 'os'

/** 169.254.0.0/16: self-assigned when an adapter got no DHCP lease. */
export function isLinkLocalIPv4(address) {
  return /^169\.254\.\d{1,3}\.\d{1,3}$/.test(String(address))
}

/**
 * IPv4 addresses a phone, tablet or Companion on the LAN can use.
 * Link-local addresses (169.254.x.x) belong to an unconfigured adapter and
 * are unreachable from the LAN, so they are left out — unless there is
 * nothing else, as with a direct cable between this computer and a device.
 */
export function getLocalAddresses(nets = os.networkInterfaces()) {
  const addresses = []
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push({ name, address: net.address })
      }
    }
  }
  const routable = addresses.filter(({ address }) => !isLinkLocalIPv4(address))
  return routable.length ? routable : addresses
}

export function buildNetworkUrls(port) {
  const addresses = getLocalAddresses()
  const paths = ['operator', 'control', 'render']
  const urls = {
    localhost: paths.map((p) => `http://localhost:${port}/${p}`),
    lan: []
  }
  for (const { address } of addresses) {
    for (const p of paths) {
      urls.lan.push({ ip: address, path: p, url: `http://${address}:${port}/${p}` })
    }
  }
  return { port, addresses, urls }
}
