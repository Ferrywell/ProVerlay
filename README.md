<p align="center">
  <a href="https://ferrywell.github.io/ProVerlay/"><img src="site/assets/icon-256.png" width="96" height="96" alt="ProVerlay"></a>
</p>

<h1 align="center">ProVerlay</h1>

<p align="center">
  <strong>Live broadcast graphics for OBS and vMix.</strong><br>
  Build overlays on your Mac, operate them from an iPad or Stream Deck, play them out through one browser source.
</p>

<p align="center">
  <a href="https://ferrywell.github.io/ProVerlay/"><b>Website</b></a> ·
  <a href="https://github.com/Ferrywell/ProVerlay/releases/latest"><b>Download</b></a> ·
  <a href="https://github.com/Ferrywell/ProVerlay/releases">Releases</a> ·
  <a href="docs/USER-GUIDE.md">Docs</a>
</p>

<p align="center">
  <a href="https://github.com/Ferrywell/ProVerlay/releases/latest"><img src="https://img.shields.io/github/v/release/Ferrywell/ProVerlay?label=release&color=378add" alt="Latest release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0-378add" alt="License: GPL-3.0"></a>
  <img src="https://img.shields.io/badge/macOS-Apple%20Silicon%20%C2%B7%20Intel-1d1d1f?logo=apple" alt="macOS Apple Silicon and Intel">
  <img src="https://img.shields.io/badge/output-OBS%20%C2%B7%20vMix-3b6d11" alt="OBS and vMix">
  <img src="https://img.shields.io/badge/Stream%20Deck-Companion-6e6e73" alt="Bitfocus Companion">
</p>

<p align="center">
  <a href="https://ferrywell.github.io/ProVerlay/"><img src="site/assets/screen-dashboard.webp" alt="The ProVerlay dashboard" width="860"></a>
</p>

---

ProVerlay is a local tool for live graphics in streams and broadcasts: score bugs,
lower thirds, tickers, countdowns, an F1 timing tower and more. You set up the
graphics in a desktop dashboard, control them live from a phone, tablet or Stream
Deck, and OBS or vMix shows them through a transparent browser source. Everything
runs on your own machine and network — no account, no cloud.

## Features

- **Widgets:** match score (with optional PNG score strip), hockey scorebug, F1 timing
  tower, ticker, stream countdown, single lower third, lower-thirds roster, quiz and
  message.
- **One output URL** (`/render`) for all live widgets, plus a solo URL per widget
  (`/render?graphic=<id>`) when you want it on its own layer.
- **Touch operator** for iPad and iPhone over the local network.
- **Bitfocus Companion module** for Stream Deck, with automatic presets.
- **Projects** with their own branding (colours, fonts), assets and widgets; export
  and import as a single `.proverlay` file.
- **Scoreboard editor** to put live text fields on top of your own PNG design.
- **F1 timing** from a running [MultiViewer](https://multiviewer.app) instance, or
  manual.
- **REST API and Socket.io** for your own automation.
- **Mac app** (Apple Silicon and Intel) with a menu-bar icon; or run the server from source on
  any OS with Node.

## How it works

```
┌─────────────────┐                ┌─────────────────┐
│  Dashboard      │                │  Operator       │
│  /control       │                │  /operator      │
│  setup + live   │                │  iPad / iPhone  │
└────────┬────────┘                └────────┬────────┘
         │        Socket.io (live sync)     │
         └──────────────┬───────────────────┘
                        │      Node server :2014
                        ▼
              ┌─────────────────┐
              │  Render         │  ← OBS Browser Source / vMix Web Browser
              │  /render        │    1920×1080, transparent
              └─────────────────┘
```

| Screen | URL | For |
|--------|-----|-----|
| Dashboard | http://localhost:2014/control | Desktop — projects, widgets, going live |
| Operator | http://localhost:2014/operator | Phone / tablet — scores, clock, toggles |
| Render | http://localhost:2014/render | OBS / vMix browser input |

A Node server (Express + Socket.io) on port **2014** keeps the state of the active
project and pushes every change to all connected screens. On a phone or tablet, `/`
opens the operator automatically.

## Quick start — Mac app

1. **Download the latest release** from the
   [releases page](https://github.com/Ferrywell/ProVerlay/releases):
   `ProVerlay-mac-arm64.zip` for Apple Silicon (M1 and later) or
   `ProVerlay-mac-x64.zip` for Intel Macs. `SHA256SUMS.txt` lets you check the
   download (`shasum -a 256 -c --ignore-missing SHA256SUMS.txt`).
2. Unzip and move `ProVerlay.app` to **Applications**.
3. The first time: **right-click → Open → Open**. If macOS still refuses:
   `xattr -cr /Applications/ProVerlay.app` (the app is ad-hoc signed, not notarized).

The dashboard opens in the app window; closing the window keeps the server running
for OBS/vMix. Quit from the menu-bar icon or with Cmd+Q. More in
[docs/APP.md](docs/APP.md).

## Quick start — from source

Requires **Node 22** (see `.nvmrc`).

```bash
git clone https://github.com/Ferrywell/ProVerlay.git
cd ProVerlay
nvm use        # or install Node 22 another way
npm ci
npm start      # → http://localhost:2014/control
```

`npm run dev` restarts the server on file changes; `npm run app` runs the Electron
app from your working copy.

## OBS / vMix

| | OBS | vMix |
|-|-----|------|
| Input | Browser source | Add Input → More → Web Browser |
| URL | `http://127.0.0.1:2014/render` | `http://127.0.0.1:2014/render` |
| Size | 1920 × 1080 | 1920 × 1080 |

The page is transparent. Use the machine's IP instead of `127.0.0.1` when ProVerlay
runs on another computer. Details, solo layers and troubleshooting:
[docs/OBS-VMIX.md](docs/OBS-VMIX.md).

## Operator on iPad

Put the iPad on the **same Wi-Fi** as the computer running ProVerlay and open
`http://<mac-ip>:2014/operator` (http, not https). The dashboard lists the right
addresses under **Project & network → Network**.

## Companion (Stream Deck)

The [`companion/`](companion/) folder contains a Bitfocus Companion module (Companion
4.3+): show/hide graphics on the main or solo output, scores, match clock,
countdowns, speakers and automatic presets. Host `127.0.0.1`, port `2014`.
Install: [companion/README.md](companion/README.md) · Reference:
[docs/COMPANION.md](docs/COMPANION.md).

## Projects: export and import

Each project holds its widgets, branding and assets. **Project & network → Export**
saves the active project as a `.proverlay` file (a zip); **Import** adds it as a new
project on another machine. Imported projects are not activated until you click
**Activate this project**.

## Platforms

- **Server and browser UIs:** run anywhere Node 22 runs (macOS, Windows, Linux).
- **Desktop app:** macOS on Apple Silicon and Intel. A Windows app is planned
  (`electron-builder.yml` already has a Windows target) but is not built or tested
  yet.

## Where your data lives

| How you run it | Location |
|----------------|----------|
| From source | `data/` in the repository — created on first start, gitignored |
| Mac app | `~/Library/Application Support/ProVerlay/data` |
| Custom | set `PROVERLAY_DATA_DIR` |

New installs start with one blank project. Bundled brand presets live in
[`templates/brands/`](templates/brands/); your own presets go in `data/brands/`.

## Security

ProVerlay is a LAN tool with **no authentication**. The server listens on all network
interfaces on port 2014, so anyone who can reach that port can view and control your
graphics. Run it on a network you trust, and do not expose port 2014 to the internet.
See [SECURITY.md](SECURITY.md) for details and how to report a vulnerability.

## Documentation

| Document | Contents |
|----------|----------|
| [User guide](docs/USER-GUIDE.md) | First show, step by step, plus troubleshooting |
| [OBS and vMix](docs/OBS-VMIX.md) | Browser input setup, transparency, performance |
| [Desktop app](docs/APP.md) | Mac app, data folders, building the app |
| [Companion](docs/COMPANION.md) | Stream Deck actions, feedbacks, presets |
| [F1 timing](docs/F1-TIMING.md) | F1 tower with MultiViewer |
| [Architecture](docs/ARCHITECTURE.md) | Server, state, API |
| [Product overview](docs/PRODUCT.md) | Screens, widget types, scope |
| [Match graphics](docs/ARCHITECTURE-MATCH-GRAPHICS.md) | Score strip model and roadmap |
| [Design input](docs/DESIGN-INPUT.md) · [PNG workflow](docs/DESIGN-PNG-WORKFLOW.md) | Bringing your own designs |
| [UX brief](docs/UX-DESIGN-BRIEF.md) | Design direction for the control UIs |
| [Manual test plan](docs/QA-TEST-PLAN.md) | Release checklist |
| [Changelog](CHANGELOG.md) | Version history |

## Project structure

```
ProVerlay/
├── server/            # Express API, Socket.io, state and projects
├── public/control/    # Dashboard
├── public/operator/   # Touch operator
├── public/render/     # Output page for OBS/vMix
├── public/editor/     # Scoreboard editor
├── public/shared/     # Shared UI code and design tokens
├── electron/          # Mac app shell
├── companion/         # Bitfocus Companion module (MIT)
├── templates/brands/  # Bundled brand presets
├── docs/              # Documentation
└── data/              # Your local projects (gitignored, created on first start)
```

## Contributing

Contributions are welcome — bug reports, fixes, docs and new widgets. Read
[CONTRIBUTING.md](CONTRIBUTING.md) for the development setup and pull-request
workflow, and follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

Copyright (C) 2026 ProductionPro

ProVerlay is free software: you can redistribute it and/or modify it under the terms
of the **GNU General Public License version 3** as published by the Free Software
Foundation. It is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY. See [LICENSE](LICENSE) for the full text.

The Companion module in [`companion/`](companion/) is licensed separately under the
[MIT license](companion/LICENSE), as required for the Bitfocus module store.
