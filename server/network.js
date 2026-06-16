import os from 'os'

export function getLocalAddresses() {
  const nets = os.networkInterfaces()
  const addresses = []
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push({ name, address: net.address })
      }
    }
  }
  return addresses
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
