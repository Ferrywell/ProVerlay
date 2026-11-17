# ProVerlay — product overview

ProVerlay is a local tool for live broadcast graphics: you set up overlays on a Mac or
Windows PC (or any machine that runs Node), operate them from a phone, tablet or Stream Deck,
and play them out to OBS or vMix through a browser source.

## Principles

- A calm, light interface (glass panels, system fonts) rather than a dense broadcast
  console.
- A desktop **dashboard** for setup, and a separate touch **operator** panel for
  live control on iPad/iPhone.
- Branding is a first-class concept: every project has its own colours, fonts and
  assets.
- Custom overlays can be built from a PNG design plus live data fields.
- Output to **OBS and vMix** via their Chromium-based browser inputs.
- Runs locally on your production network; no cloud account.

## Interfaces

| Route | Purpose | Device |
|-------|---------|--------|
| `/control` | Dashboard: projects, widgets, going live | Mac / desktop |
| `/operator` | Live control: score, clock, toggles | iPhone / iPad |
| `/operate?graphic=<id>` | Full-page operate view for one widget | Any |
| `/project` | Edit project: canvas, branding, assets | Desktop |
| `/design` | Setup hub for custom designs | Desktop |
| `/layout` | Overlay layout: free placement of widgets | Desktop |
| `/data` | Data sources (Google Sheets, CSV, Excel) and `{{variables}}` | Desktop |
| `/editor` | WYSIWYG scoreboard editor (PNG + text fields) | Desktop |
| `/compose` | Import a design (PNG → widget), beta | Desktop |
| `/render` | Output for OBS / vMix | Browser source |

The root `/` detects the device: phones and tablets go to `/operator`, desktops to
`/control`. Override with `/?view=control` or `/?view=operator`. Opening `/control`
on a phone or tablet redirects to `/operator`.

## Ways to trigger graphics

1. **Dashboard** — put widgets live or take them off air.
2. **Operator on a phone/tablet** — score, clock, toggles over the local network.
3. **Bitfocus Companion / Stream Deck** — see [COMPANION.md](COMPANION.md).
4. **REST API and Socket.io** — for your own automation, see
   [ARCHITECTURE.md](ARCHITECTURE.md).

## Branding

- Bundled presets in `templates/brands/*.json`; your own presets in
  `data/brands/*.json` (they override bundled presets with the same id).
- Per project: assets, fonts and colours (*Edit project → Client branding*).
- The render applies the project brand through CSS variables from `state.brand`.

## Widget types

| Type | Dashboard label | On operator | Use |
|------|-----------------|:-----------:|-----|
| `matchScoreboard` | Match score | yes | Match score and clock, optional PNG strip |
| `hockeyScorebug` | Hockey scorebug | yes | Q1–Q4 countdown clock, team codes and colours |
| `f1Timing` | F1 timing | yes | F1 position tower, manual or MultiViewer live ([F1-TIMING.md](F1-TIMING.md)) |
| `customTicker` | Ticker | yes | Scrolling ticker |
| `lowerThirdShow` | Lower thirds | yes | Roster of people; put one on air with a click |
| `quizShow` | Quiz | yes | Multiple-choice question with reveal |
| `streamCountdown` | Stream countdown | no | Countdown to the stream start |
| `lowerThird` | Lower third (single) | no | One name/title lower third |
| `message` | Message | no | Text message / break slide |
| `image` | Image | yes | Pre-designed graphics (PNG lower thirds, logos, sponsor boards, full-screen slides): a list with one image on air, Next/Previous, optional auto-hide and carousel |

"On operator" is set per widget type when the widget is created.

## Platform

- Server: Node.js (`npm start`), browser UIs, port **2014**.
- Desktop app: macOS on Apple Silicon and Intel, and Windows 10/11 x64 (beta)
  ([APP.md](APP.md)). The server also runs from source anywhere Node runs.
- Render output uses the bundled Inter font by default, so overlays look the same on
  every OS.
- Output hosts: [OBS](https://obsproject.com) Browser Source and
  [vMix](https://www.vmix.com) Web Browser — see [OBS-VMIX.md](OBS-VMIX.md).

## Out of scope (for now)

- Automatic sync with an external broadcast for viewers (watch-along is manual)
- OCR of a live match clock
- Particle/confetti effects (too heavy for CEF browser inputs)
- Cloud or multi-tenant hosting
- User accounts / authentication (see [SECURITY.md](../SECURITY.md))

Planning happens in [GitHub issues](https://github.com/Ferrywell/ProVerlay/issues).
