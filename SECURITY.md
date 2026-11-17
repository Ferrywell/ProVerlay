# Security policy

## Trust model

ProVerlay is built for use on a **trusted local network** (a production LAN, a
studio network, your own Wi-Fi). It deliberately has **no authentication**:

- The server listens on **all network interfaces** (`0.0.0.0`) on port **2014**
  (configurable with `PORT` when running from source).
- Anyone who can reach that port can open the dashboard, the operator and the render
  page, read the project state, upload assets, import projects, and show, hide or
  change any graphic — including what is on air.
- The REST API and Socket.io accept requests from any origin (CORS `*`).
- Traffic is plain HTTP; nothing is encrypted.

This is a design decision, not an oversight: operators need to connect iPads and
Stream Decks quickly without accounts. It does mean you are responsible for the
network ProVerlay runs on.

### Recommendations

- Run ProVerlay only on networks where you trust every connected device.
- Do **not** expose port 2014 to the internet (no port forwarding, no public cloud
  VM without a firewall or VPN in front of it).
- On shared networks (venues, hotels, events), use your own router or a separate
  VLAN for the production machines.
- Only import `.proverlay` files from sources you trust.
- Keep the app and Node.js up to date.

Reports that only show "someone on the same network can control the graphics" are
expected behaviour under this model. Issues that break out of it are in scope, for
example: reading or writing files outside the ProVerlay data folder, code execution
on the host, or crashing the server with a crafted request or project file.

## Supported versions

Security fixes are made on the `main` branch and shipped in the next release. Older
releases do not receive backports.

## Reporting a vulnerability

Please report vulnerabilities **privately**, not in a public issue:

- via GitHub's
  [private vulnerability reporting](https://github.com/Ferrywell/ProVerlay/security/advisories/new),
  or
- by email to **hello@productionpro.nl**.

Include the affected version or commit, steps to reproduce, and the impact you
expect. You will get an acknowledgement as soon as possible; once a fix is available
we will credit you in the release notes unless you prefer otherwise.
