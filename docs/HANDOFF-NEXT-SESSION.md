# Handoff — volgende sessie (na v0.6.1)

**Datum:** 2026-07-30  
**Laatste release:** [v0.6.1](https://github.com/Ferrywell/ProVerlay/releases/tag/v0.6.1)  
**Branch:** `main`

## Wat er vandaag landde

- Widget **`hockeyScorebug`**: Odido-goedgekeurde look — zwarte cirkelklok **zonder** Glow-ring; teamcodes op Glow-mesh; scores wit op zwart (`docs/brand/assets/odido-hockey-scorebug-basis.png`)
- Hockey operate: scores, codes, start/pauze, nudges; spinner minute/second houdt de klok lopend
- F1 lap-header spacing: `LAP · cijfers · / · totaal` via CSS gap; SC/VSC met scheidingslijn
- Mac zip + GitHub release; README download-links
- Odido brand docs: `docs/brand/ODIDO.md`, `odido-tokens.css`

## Open / volgende prioriteiten

1. **Hockey in productie-stream** — echte tegenstander bevestigen (PNG-voorbeeld = SPA); kwartlengte (15′ vs 17.5′)
2. **Companion** — `hockeyScorebug` toevoegen aan score-actions
3. **Operate UI** — teamkleur-pickers zijn visueel minder relevant (Glow-mesh vast); eventueel vereenvoudigen
4. **QA** — hockey flows + visuele parity met `odido-hockey-scorebug-basis.png`
5. **Mac Gatekeeper** — ad-hoc signed; notarisatie later
6. **vMix/OBS** — hockey scorebug op 1920×1080 laten zien

## Belangrijke paden

| Onderdeel | Pad |
|-----------|-----|
| Hockey render | `public/render/render-hockey.css`, `buildHockeyScorebug` in `render.js` |
| Goedgekeurde visual | `docs/brand/assets/odido-hockey-scorebug-basis.png` |
| Hockey clock/operate | `public/shared/hockey-utils.js`, `operate-hockey.js` |
| Defaults | `server/graphicDefaults.js` → `hockeyScorebug` |
| Spec | `docs/superpowers/specs/2026-07-30-hockey-scorebug-design.md` |
| F1 lap UI | `syncF1LapText` / `.f1-tower__lap` in `render.js` + `render.css` |
| Build | `nvm use 22 && npm run dist:mac` → `dist/ProVerlay-mac-arm64.zip` |

## Niet committen / lokaal

- `.cursor/settings.json`
- `.tmp-hockey-crops/`
- `dist/` (gitignored; wel als GitHub Release asset)

## Dev-server

Poort **2014**, Node **22** voor Electron-builds. Actief project meestal **odido**.
