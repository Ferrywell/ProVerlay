# ProVerlay

Live broadcast overlays met eigen identiteit — minimalistisch, Apple Tahoe UI, mobiel operator-paneel en Companion/Stream Deck.

**Huidige versie:** [v0.6.4](https://github.com/Ferrywell/ProVerlay/releases/tag/v0.6.4)

## Mac-app (Apple Silicon)

Download: **[ProVerlay-mac-arm64.zip](https://github.com/Ferrywell/ProVerlay/releases/latest/download/ProVerlay-mac-arm64.zip)**

1. Zip uitpakken → `ProVerlay.app` naar **Applications**
2. Eerste keer: rechtsklik → **Open** → nogmaals **Open**
3. Bij blokkade: `xattr -cr /Applications/ProVerlay.app`

Poort **2014** · OBS/vMix render: `http://localhost:2014/render` · Operator: `http://<ip>:2014/operator`

Zie `docs/APP.md` voor details.

## Starten (dev)

```bash
nvm use 22   # aanbevolen voor Electron-builds
npm install
npm start
```

| Interface | URL | Voor wie |
|-----------|-----|----------|
| Dashboard | http://localhost:2014/control | Mac / desktop setup |
| Operator | http://localhost:2014/operator | iPhone / iPad live bediening |
| Render | http://localhost:2014/render | OBS Browser Source |

Op mobiel opent `/` automatisch het operator-paneel.

## Highlights

- **Eigen look** — licht, glass, Apple-achtig (geen Holographics-clone)
- **Hockey scorebug** — circulaire klok met Odido Glow-ring, Q1–Q4, teamkleuren
- **F1 timing tower** — MultiViewer live of handmatig, tyres, track status, animaties
- **Voetbalscore overlay** — PNG-strip + live bediening vanaf iPad
- **Klant branding** — projectfonts, kleuren, assets per project
- **Drie triggers** — web, mobiel (lokaal netwerk), Companion/Stream Deck

### v0.6.4

- Hockey scorebug: Claude Design / PNG-tokens (proporties, Regular type, Glow-mesh slices)

### v0.6.3

- F1 lap-counter spacing (LAP / cijfers / SC·VSC) netter

### v0.6.0

- Nieuw widget `hockeyScorebug` (render + operator/control)
- Hockey-klok: blijft lopen bij minute/second-spinner; Start/Pause betrouwbaarder
- F1-polish: animaties, lap-rollers, MultiViewer-hulp, operate-parity
- Odido brand tokens/docs + scorebug-mockup

## Structuur

```
ProVerlay/
├── server/                    # API + Socket.io
├── public/control/            # Desktop dashboard
├── public/operator/           # Touch operator UI
├── public/editor/             # WYSIWYG scorebord composer
├── public/render/             # OBS overlay output
├── data/registry.json         # Actief project + lijst
├── data/projects/{id}/        # project.json + assets/
├── companion/                 # Bitfocus Companion module
└── docs/                      # Product & agent docs
```

## Projecten

- Start altijd in **Blanco project**
- Maak projecten aan, wissel via dashboard
- **Exporteren** → `.proverlay` zip (instellingen + assets)
- **Importeren** → nieuwe installatie in één stap

## Scorebord WYSIWYG

1. Open http://localhost:2014/editor
2. Upload PNG-achtergrond
3. Sleep tekstvelden (teams, scores) naar positie
4. Pas lettertype, grootte en kleur aan
5. Opslaan → direct live op render + operator

## Companion

```bash
cd companion && npm install
```

Voeg `companion/` toe aan Companion developer modules path. Port: **2014**.

## Agents

Zie `AGENTS.md` voor UX, QA en development workflow.
