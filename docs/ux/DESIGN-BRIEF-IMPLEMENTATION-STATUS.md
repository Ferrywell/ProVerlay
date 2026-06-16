# Design Brief v1.0 — implementatiestatus

**Bron:** `docs/ux/Proverlay_Design_Brief.docx` (juni 2026)  
**Lead dev agent:** backend foundation (routes, ticker model)  
**Frontend agent:** tokens, operate/dashboard scheiding, semantische knoppen

---

## Gedaan

| Brief-eis | Status |
|-----------|--------|
| Route `/operate/:widgetId` | ✅ Skeleton + ticker operate |
| Device redirect mobile → operator | ✅ `server/device.js` (`mobile`/`tablet`) |
| Client device detect | ✅ `public/shared/device.js` |
| Ticker `{ id, text, enabled }` | ✅ Server + render filter |
| Nieuw ticker-bericht = disabled | ✅ Operator + operate |
| Hide = grijs, geen rood | ✅ Operator, operate, dashboard cards |
| Pause = grijs, Start/Go live = groen | ✅ Operator match card |
| Rood alleen permanent verwijderen | ✅ Ticker delete |
| Dashboard rechterpaneel = operate | ✅ `#dashboard-operate-panel` |
| Instellingen via `?configure=id` of editor | ✅ `Edit settings` per kaart |
| Kaartacties Operate + Edit settings | ✅ |
| Design tokens #FAFAF9, semantisch groen | ✅ `tahoe.css` |
| Brief in repo | ✅ `docs/ux/Proverlay_Design_Brief.docx` |
| Widget-type kleurcodering badges | ✅ `pill--type-*` in `tahoe.css` |
| Match operate compact (dashboard + `/operate`) | ✅ `operate-match.js` + `matchOperateHtml` |
| Operator chrome reductie | ✅ Sync in nav, focus chip bij 1 widget verborgen |
| Score +/- semantiek (geen blauw primary) | ✅ Operator + operate-panel |

---

## Nog open (volgende sprint)

| Brief-eis | Opmerking |
|-----------|-----------|
| Dashboard icon-sidebar (44px) | Layout §7.1 — grote HTML/CSS refactor |
| Ticker editor drag-and-drop volgorde | §5.2 — Pointer Events, apart scherm |
| Penalties / stoppage in compact operate | Blijft in `/operator` |
| `prefers-color-scheme: dark` | Brief vereist tokens; niet gestart |
| iPad split-view dashboard + operate | §3.2 — breakpoint work |

---

## Routes overzicht

| URL | Modus |
|-----|-------|
| `/control` | Dashboard — operate rechts, configure via `?configure=` |
| `/operate/:id` | Live bediening één widget |
| `/operator` | Alle widgets (phone default) |
| `/editor?graphic=id` | WYSIWYG scoreboard / lower thirds |

---

## Dev: server herstarten

Na pull: `npm start` op poort **2014**. Oude processen krijgen SIGTERM (exit 143) als poort bezet is.

---

*Laatste update: 11 juni 2026 (match operate + QA pass)*
