# Handoff — volgende sessie (na v0.6.1)

**Datum:** 2026-07-30  
**Laatste release:** [v0.6.1](https://github.com/Ferrywell/ProVerlay/releases/tag/v0.6.1)  
**Branch:** `main`

## Wat er vandaag landde

- Widget **`hockeyScorebug`**: circulaire klok, Glow one-ring buiten de disc, solide teamstrepen, score-roll, Q1–Q4/RUST
- Hockey operate: scores, kleuren, codes, start/pauze, nudges; spinner minute/second houdt de klok lopend
- F1 lap-header spacing: `LAP · cijfers · / · totaal` via CSS gap; SC/VSC met scheidingslijn
- Mac zip + GitHub release; README download-links
- Odido brand docs: `docs/brand/ODIDO.md`, `odido-tokens.css`

## Open / volgende prioriteiten

1. **Hockey in productie-stream** — echte tegenstander (code + kleur) i.p.v. ARG-placeholder; kwartlengte bevestigen (15′ vs 17.5′)
2. **Companion** — `hockeyScorebug` toevoegen aan score-actions (nu vooral `matchScoreboard` / football)
3. **Layout editor** — hockey + F1 als layers in `/layout` verder polijsten indien nodig
4. **QA** — hockey flows in `docs/qa/` (toggle, clock run, ring fill, solo render); F1 lap-header visueel her-checken met SC/VSC/rood
5. **Mac Gatekeeper** — nog ad-hoc signed; notarisatie later als publieke distributie
6. **vMix/OBS** — hockey scorebug op 1920×1080 render even laten zien (vmin-schaal is 2× mockup-basis)

## Belangrijke paden

| Onderdeel | Pad |
|-----------|-----|
| Hockey render | `public/render/render-hockey.css`, `buildHockeyScorebug` in `render.js` |
| Hockey clock/operate | `public/shared/hockey-utils.js`, `operate-hockey.js` |
| Defaults | `server/graphicDefaults.js` → `hockeyScorebug` |
| Mockup | `docs/ux/hockey-scorebug-mockup.html` |
| Spec | `docs/superpowers/specs/2026-07-30-hockey-scorebug-design.md` |
| F1 lap UI | `syncF1LapText` / `.f1-tower__lap` in `render.js` + `render.css` |
| Build | `nvm use 22 && npm run dist:mac` → `dist/ProVerlay-mac-arm64.zip` |

## Niet committen / lokaal

- `.cursor/settings.json`
- `.tmp-hockey-crops/`
- `dist/` (gitignored; wel als GitHub Release asset)

## Dev-server

Poort **2014**, Node **22** voor Electron-builds. Actief project meestal **odido**.
