# ProVerlay — Product Vision

## Identiteit

ProVerlay is **geen Holographics-kloon**. Het is een eigen product met:

- Apple Tahoe-achtige interface (licht, glass, rustig)
- Dashboard + apart **operator-paneel** voor touch (iPad/iPhone)
- Klant-branding als first-class concept
- Custom overlays (PNG-design + live data) per project
- Output naar **OBS en vMix** via browser input (CEF)
- Doel: **standalone app** Mac + Windows (roadmap F3)

**Volledige planning:** [PRODUCT-ROADMAP.md](./PRODUCT-ROADMAP.md)

## Kernbelofte

> Klant branding erin. Overlay live. Score bedienen vanaf iPad. Stream Deck via Companion.

## Interfaces

| Interface | Doel | Device |
|-----------|------|--------|
| `/control` | Setup, branding, overlay overzicht | Mac / desktop |
| `/operator` | Live bediening (score, toggles) | iPhone / iPad |
| `/editor` | WYSIWYG placement (score strips) | Desktop |
| `/compose` | Design importeren (PNG → widget) | Desktop |
| `/render` | OBS / vMix browser output | N/A |

Root `/` detecteert apparaat:

- Phone/tablet → `/operator`
- Desktop → `/control`

## Trigger-methoden

1. **Web dashboard** — overlays aan/uit
2. **Operator mobiel** — score, klok, toggles (lokaal netwerk)
3. **Companion / Stream Deck** — toggles en acties
4. **REST API** — automatisering

## Klant branding

- Presets in `data/brands/*.json`
- Per project: assets, fonts, kleuren
- Render gebruikt CSS variables van `state.brand`

## Widgettypes (huidig)

| Type | Operator | Gebruik |
|------|----------|---------|
| `matchScoreboard` | ✅ | Wedstrijdscore + klok |
| `customTicker` | ✅ | Tickertape over PNG |
| `streamCountdown` | ❌ | Start countdown |
| `lowerThird` | ❌ | Enkele lower third |
| `message` | ❌ | Bericht / break |

**Gepland (F2+):** `lowerThirdShow` (roster), `logoBug`, animatie-presets — zie roadmap.

## Platform

- **Nu:** Node-server (`npm start`), browser-UI’s
- **Vereiste:** Windows-compatibel (geen Mac-only APIs)
- **Poort:** **2014**
- **Output hosts:** [OBS](https://obsproject.com) Browser Source · [vMix](https://www.vmix.com) Web Browser — zie [VMIX.md](./VMIX.md)

## Niet in scope (nu)

- Automatische NPO/sync-pagina voor kijkers
- OCR live wedstrijdklok
- Particle/confetti effecten (CEF-performance)
- Cloud multi-tenant
