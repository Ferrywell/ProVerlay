# ProVerlay vs Holographics — Workflow Parity

**Datum:** 2026-06-09  
**Tester:** Beta Tester agent  
**Referentie:** `docs/PRODUCT.md`, Holographics module-patroon

## Doel

Vergelijk of ProVerlay dezelfde **operator-workflow** ondersteunt als Holographics voor live broadcast graphics, niet feature-pariteit op widget-niveau.

---

## Workflow-vergelijking

| # | Workflow-stap | Holographics | ProVerlay MVP | Status | Opmerkingen |
|---|---------------|--------------|---------------|--------|-------------|
| 1 | Render URL in OBS Browser Source | Ja | Ja | ✅ | `http://host:3100/render`, transparante body bevestigd |
| 2 | Real-time toggle (control → output) | Ja (Socket.io) | Ja (Socket.io `stateChanged`) | ✅ | Sync ~6 ms gemeten |
| 3 | Companion / Stream Deck trigger | Ja (companion-module-hologfx) | Nee (module ontbreekt) | ❌ | REST API werkt; Companion-module TODO |
| 4 | Multi-graphic tegelijk | Ja | Ja | ✅ | 4 graphics parallel getest |
| 5 | State persistent na restart | Ja (show file) | Ja (`data/show.json`) | ✅ | Restart-test geslaagd |
| 6 | Eén kaart per graphic in control | Nee (widgets + entries) | Ja | ✅ | ProVerlay differentiator |
| 7 | Lower third live < 30 s | Ja | Ja | ✅ | ~5 s in test |
| 8 | Theming / kleuren | Ja (Stylus/themes) | Ja (CSS vars + clean theme) | ✅ | PATCH primary werkt |
| 9 | API toggle voor automatisering | Ja | Ja | ✅ | `POST /api/graphics/:id/toggle` |
| 10 | OSC triggers | Ja | Nee | ⬜ | Post-MVP, bewust out of scope |

---

## Graphic-type pariteit (MVP)

| Type | Holographics widget | ProVerlay type | Getest | Notities |
|------|---------------------|----------------|--------|----------|
| Lower third | LowerThird | `lowerThird` | ✅ | Naam/title/company OK |
| Broadcast message | BroadcastMessage | `message` | ✅ | Tekst OK |
| Ticker | Ticker | `ticker` | 🟡 | Mount OK; scroll manual |
| Clock | Clock | `clock` | 🟡 | Mount OK; tick manual |
| Countdown | Countdown | `countdown` | 🟡 | API OK; visueel manual |
| Image | Image | `image` | ❌ | Lege src bug (QA-001) |
| CSS themes | Ja | `themes/clean.css` | ✅ | Eén theme in MVP |

---

## Architectuur-verschillen (bewust)

| Aspect | Holographics | ProVerlay |
|--------|--------------|-----------|
| Runtime | Electron + geobfusceerde server | Node + Express |
| Datamodel | widgets + entries | `graphics[]` enkelvoudig |
| Styling | Stylus/Pug/Vue compile | Plain CSS + CSS variables |
| Poort | Variabel | 3100 (default) |
| Companion events | widgets.toggle, entries.patch | `toggleGraphic`, `patchState` |

**Impact op operator:** ProVerlay is eenvoudiger te begrijpen; Companion-configuratie wacht op nieuwe module.

---

## Companion-pariteit (geblokkeerd)

Holographics Companion-module biedt:
- Auto-presets per widget/entry
- Visibility feedback op Stream Deck
- Socket.io SDK met reconnect

ProVerlay status:
- Socket.io server-events **geïmplementeerd** (`toggleGraphic`, `stateChanged`, `getState`)
- REST fallback **geïmplementeerd**
- Companion-module in `companion/` **ontbreekt**
- Handmatige Companion-test **niet mogelijk**

Zie `BLOCKERS.md` TC-070.

---

## OBS-workflow (manual checklist)

| Stap | Holographics | ProVerlay | Getest |
|------|--------------|-----------|--------|
| Browser Source URL | `http://localhost:PORT/render` | `http://localhost:3100/render` | Manual |
| Width/Height 1920×1080 | Ja | Ja (responsive vmin) | Manual |
| Custom CSS voor transparantie | Soms nodig | Niet nodig (ingebouwd) | Partial (CSS OK) |
| Shutdown source when not visible | Aanbevolen | Aanbevolen | Manual |

---

## Conclusie

| Domein | Pariteit |
|--------|----------|
| Core OBS + control workflow | **Hoog** — render URL, sync, multi-graphic, persistence |
| Operator eenvoud | **Beter** — één graphic = één kaart |
| Companion / Stream Deck | **Geen** — module ontbreekt |
| Geavanceerde features (OSC, Decklink) | **N.v.t.** — out of scope |

**Aanbeveling:** ProVerlay is workflow-pariteit met Holographics voor **standalone control + OBS**. Companion-pariteit is de grootste gap voor teams die op Stream Deck vertrouwen.
