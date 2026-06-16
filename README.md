# ProVerlay

Live broadcast overlays met eigen identiteit — minimalistisch, Apple Tahoe UI, mobiel operator-paneel en Companion/Stream Deck.

## Starten

```bash
npm install
npm start
```

Standaard poort: **2014**

| Interface | URL | Voor wie |
|-----------|-----|----------|
| Dashboard | http://localhost:2014/control | Mac / desktop setup |
| Operator | http://localhost:2014/operator | iPhone / iPad live bediening |
| Render | http://localhost:2014/render | OBS Browser Source |

Op mobiel opent `/` automatisch het operator-paneel.

## Highlights

- **Eigen look** — licht, glass, Apple-achtig (geen Holographics-clone)
- **Voetbalscore overlay** — configureerbaar + live bedienbaar vanaf iPad
- **Klant branding** — presets in `data/brands/`, kleuren & fonts live
- **Drie triggers** — web, mobiel (lokaal netwerk), Companion/Stream Deck
- **Windows-ready** — plain Node.js, geen Mac-only dependencies

## Structuur

```
ProVerlay/
├── server/                    # API + Socket.io
├── public/control/            # Desktop dashboard
├── public/operator/           # Touch operator UI
├── public/editor/             # WYSIWYG scorebord composer
├── public/render/               # OBS overlay output
├── data/registry.json         # Actief project + lijst
├── data/projects/{id}/        # project.json + assets/
├── templates/                 # Overlay templates voor klanten
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

## Voetbalscore toevoegen

Zie `templates/football-score.md`.

## Companion

```bash
cd companion && npm install
```

Voeg `companion/` toe aan Companion developer modules path. Port: **2014**.

## Agents

Zie `AGENTS.md` voor UX, QA en development workflow.
