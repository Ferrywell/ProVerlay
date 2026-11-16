<p align="center">
  <a href="https://ferrywell.github.io/ProVerlay/"><img src="site/assets/icon-256.png" width="96" height="96" alt="ProVerlay"></a>
</p>

<h1 align="center">ProVerlay</h1>

<p align="center">
  <strong>Live broadcast graphics voor OBS en vMix.</strong><br>
  Overlays bouwen op je Mac, bedienen vanaf iPad of Stream Deck, uitspelen via één Browser Source.
</p>

<p align="center">
  <a href="https://ferrywell.github.io/ProVerlay/"><b>Website</b></a> ·
  <a href="https://github.com/Ferrywell/ProVerlay/releases/latest/download/ProVerlay-mac-arm64.zip"><b>Download voor Mac</b></a> ·
  <a href="https://github.com/Ferrywell/ProVerlay/releases">Releases</a> ·
  <a href="docs/MAC-HANDOVER.md">Handleiding</a>
</p>

<p align="center">
  <a href="https://github.com/Ferrywell/ProVerlay/releases/latest"><img src="https://img.shields.io/github/v/release/Ferrywell/ProVerlay?label=release&color=378add" alt="Laatste release"></a>
  <img src="https://img.shields.io/badge/macOS-Apple%20Silicon-1d1d1f?logo=apple" alt="macOS Apple Silicon">
  <img src="https://img.shields.io/badge/output-OBS%20%C2%B7%20vMix-3b6d11" alt="OBS en vMix">
  <img src="https://img.shields.io/badge/Stream%20Deck-Companion-6e6e73" alt="Bitfocus Companion">
</p>

<p align="center">
  <a href="https://ferrywell.github.io/ProVerlay/"><img src="site/assets/screen-dashboard.webp" alt="Het ProVerlay-dashboard" width="860"></a>
</p>

📘 **[Mac installatie & gebruik (overdracht)](docs/MAC-HANDOVER.md)** — uitgebreide handleiding voor collega's, klanten en Cloud-agents.

---

## Mac-app (Apple Silicon)

Download: **[ProVerlay-mac-arm64.zip](https://github.com/Ferrywell/ProVerlay/releases/latest/download/ProVerlay-mac-arm64.zip)**

| Stap | Actie |
|------|--------|
| 1 | Zip uitpakken → `ProVerlay.app` naar **Applications** |
| 2 | **Rechtsklik → Open → Open** (eerste keer, Gatekeeper) |
| 3 | Bij blokkade: `xattr -cr /Applications/ProVerlay.app` |

**Poort:** `2014` · **Render (OBS):** `http://localhost:2014/render` · **Operator (iPad):** `http://<mac-ip>:2014/operator`

Gebruikersdata: `~/Library/Application Support/ProVerlay/data`

Meer detail: [`docs/MAC-HANDOVER.md`](docs/MAC-HANDOVER.md) · [`docs/APP.md`](docs/APP.md)

---

## Drie schermen — één systeem

```
┌─────────────────┐     Wi‑Fi      ┌─────────────────┐
│  Dashboard      │                │  Operator       │
│  /control       │                │  /operator      │
│  setup + edit   │                │  live bediening │
└────────┬────────┘                └────────┬────────┘
         │         Socket.io sync          │
         └──────────────┬────────────────────┘
                        ▼
              ┌─────────────────┐
              │  Render         │  ← OBS Browser Source
              │  /render        │     1920×1080 transparant
              └─────────────────┘
```

| Interface | URL | Voor wie |
|-----------|-----|----------|
| Dashboard | http://localhost:2014/control | Mac — project, widgets, **Edit settings** |
| Operator | http://localhost:2014/operator | iPhone / iPad op set |
| Render | http://localhost:2014/render | OBS / vMix browser input |

Op mobiel opent `/` automatisch het operator-paneel.

---

## Highlights

- **Eigen look** — licht, glass, Apple-achtig (geen template-SaaS)
- **Hockey scorebug** — Client PNG-basis, Glow-mesh teamcodes, Q1–Q4 klok, typografie per categorie
- **F1 timing tower** — MultiViewer live of handmatig, tyres, track status
- **Voetbalscore** — PNG-strip + WYSIWYG editor
- **Klant branding** — projectfonts, kleuren, assets per project
- **Project export** — `.proverlay` zip voor overdracht naar andere Mac

---

## Client huisstijl (logo + oranje balk)

Logo en oranje tickerbalk zitten **niet** in de hockey scorebug — die zitten in de **Ticker**-widget (PNG met Client-logo links).

| Widget | Wat |
|--------|-----|
| **Ticker** | Oranje balk + logo onderin — **altijd aanzetten** voor Client-look |
| **Match score** | Voetbal scorebalk bovenin (PNG) |
| **Hockey scorebug** | CSS overlay bovenin (combineer met Ticker) |

Mac-app **v0.6.7+** start met Client-demoproject (Ticker + Hockey aan).  
Bestaande installatie: import **`Client.proverlay`** van de release.

Zie [`docs/MAC-HANDOVER.md` §5.4](docs/MAC-HANDOVER.md)

---

## Hockey scorebug — typografie (v0.6.6+)

**Operate** (dashboard / operator): scores, klok, kleuren, periode.

**Edit settings** (`/control?configure=<overlay-id>`): grootte + dikte per categorie — **live** op de overlay:

- Team code · Score · Clock time · Clock period (Q1)

Layout-proporties blijven zoals de goedgekeurde Client PNG; alleen tekst schaalt.

---

## Starten (ontwikkelaars)

```bash
nvm use 22   # vereist voor Electron-builds
npm install
npm start    # → http://localhost:2014/control
npm run app  # Electron-venster
npm run dist:mac  # → dist/ProVerlay-mac-arm64.zip
```

---

## Changelog (recent)

### v0.6.8

- Volledige show-bundle in de Mac-app (alle project-assets en fonts)
- Productwebsite: [ferrywell.github.io/ProVerlay](https://ferrywell.github.io/ProVerlay/)

### v0.6.7

- **Client out-of-the-box:** demoproject in Mac-app (Ticker + PNG assets + fonts)
- Import **`Client.proverlay`** voor bestaande installaties
- Brand preset `data/brands/client.json`

### v0.6.6

- Hockey: typografie per categorie in Edit settings (size 50–150%, Regular/Bold, live preview)

### v0.6.5

- Hockey klok-layout en type tuning (12:55 / Q1 spacing)

### v0.6.4

- Hockey Client PNG-proporties, Glow-mesh slices, Claude Design tokens

### v0.6.0

- Widget `hockeyScorebug`, F1 polish, operator/control parity

Volledige releases: [GitHub Releases](https://github.com/Ferrywell/ProVerlay/releases)

---

## Structuur

```
ProVerlay/
├── server/                    # API + Socket.io
├── public/control/            # Dashboard + Edit settings
├── public/operator/           # Touch operator
├── public/render/             # OBS overlay output
├── public/editor/             # WYSIWYG scorebord
├── data/projects/{id}/        # Dev-projecten (repo only)
├── docs/MAC-HANDOVER.md       # Install + gebruik + Cloud prompt
└── companion/                 # Bitfocus Companion module
```

---

## Projecten

- Start in **Blanco project** (Mac-app) of dev-map `data/`
- CRUD, activeren, **export/import** `.proverlay`
- Assets per project: `data/projects/{id}/assets/`

---

## Companion

```bash
cd companion && npm install
```

Module toevoegen aan Companion developer path. Host: `127.0.0.1`, port: `2014`.

Zie [`docs/COMPANION.md`](docs/COMPANION.md)

---

## Agents & docs

| Document | Inhoud |
|----------|--------|
| [`docs/MAC-HANDOVER.md`](docs/MAC-HANDOVER.md) | **Mac install, OBS, operator, troubleshooting, Cloud prompt** |
| [`docs/APP.md`](docs/APP.md) | Electron, data-paden, build |
| [`AGENTS.md`](AGENTS.md) | Agent-rollen (dev, UX, QA) |
| [`docs/PRODUCT.md`](docs/PRODUCT.md) | Productvisie |
