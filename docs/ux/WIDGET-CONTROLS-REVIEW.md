# Widget Controls UX Review

**Datum:** 9 juni 2026  
**Scope:** `public/control/` (dashboard), `public/operator/`, `docs/ux/CONTROL-WIREFRAME.md`  
**User asks:** meer widget-controle op dashboard, lopende wedstrijdklok, geen double-tap zoom op iPhone operator, geen instructietekst in operator.

---

## 1. Geïmplementeerd vs. ontbrekend

### Dashboard — Widget bediening (`#widget-panel`)

| Feature | Status | Prioriteit indien missing |
|---------|--------|---------------------------|
| Panel zichtbaar bij `matchScoreboard` graphic | ✅ Geïmplementeerd | — |
| Overlay positie (6 opties) | ✅ | — |
| Widget visibility: codes, scores, klok, penalties | ✅ Checkboxes | — |
| Team codes + optionele namen (inputs) | ✅ Inputs | — |
| **`showNames` toggle** (namen op render) | ❌ Dataveld bestaat (`match-utils.js`, `project.json`); geen checkbox in form | **P0** |
| Klok: minuut/seconde/periode handmatig | ✅ | — |
| Klok: 90+ / blessuretijd modus | ✅ | — |
| Klok: Start / Pauze / Sync | ✅ Knoppen in `control.js` | — |
| **Lopende klok live in dashboard** | ❌ `fillWidgetForm()` gebruikt `resolveLiveClock` alleen bij `stateChanged`; geen `setInterval` zoals operator/render | **P1** |
| **Running-state visueel op klokknoppen** | ❌ Start/Pauze knoppen wisselen niet van stijl bij lopende klok | **P1** |
| Score +/- vanaf dashboard | ❌ Alleen via operator of API | **P0** |
| Penalty aan/uit, kicks, reset | ❌ Alleen operator | **P1** |
| Animatie aan/duur | ✅ | — |
| Wijzigingen pas na **Widgets opslaan** | ⚠️ Geen live apply; toggles/knoppen buiten submit vereisen aparte handlers | **P0** (UX-frictie) |
| Widget panel vindbaarheid | ⚠️ Verstopt onder 4+ andere panels in sidebar; scroll verplicht op laptop | **P1** |

### Lopende wedstrijdklok (end-to-end)

| Laag | Status |
|------|--------|
| Data model (`running`, `runningSince`) | ✅ `match-utils.js` |
| Render tick (1s) | ✅ `render.js` → `tickMatchClocks` |
| Operator tick (1s) | ✅ `operator.js` → `tickLiveClocks` + `formatClock` |
| Dashboard start/pause/sync | ✅ PATCH via `patchGraphic` |
| Dashboard live weergave | ❌ Zie boven |

**Conclusie klok:** Backend + render + operator zijn in orde. Dashboard is configure-only, geen live spiegel.

### Operator — mobile UX asks

| Feature | Status | Prioriteit |
|---------|--------|------------|
| Viewport `maximum-scale=1, user-scalable=no` | ✅ `operator/index.html` | — |
| `touch-action: manipulation` op html/body/knoppen | ✅ `operator.css` | — |
| **Instructietekst verwijderen** | ❌ `.op-http-hint` staat nog in `index.html` regel 23 | **P0** |
| Double-tap zoom volledig uit | ⚠️ Gedeeltelijk — number/select inputs in `.clock-controls` missen `font-size: 16px`; iOS zoomt bij focus | **P0** |
| `touch-action` op hele interactieve zones | ⚠️ Alleen `.touch-btn`; inputs/toolbars niet overal | **P1** |
| Penalty UI alleen als widget aan | ❌ Sectie altijd zichtbaar | **P2** |

### Design referenties panel

| Feature | Status | Prioriteit |
|---------|--------|------------|
| Upload PNG/JPEG/WebP → project assets | ✅ Prefix `design-` | — |
| Thumbnail + link lijst | ✅ | — |
| Delete / rename asset | ❌ | **P2** |
| “Gebruik in editor” shortcut | ❌ Editor uploadt apart; geen koppeling | **P1** |
| Metadata (widgets, positie) bij upload | ❌ Alleen bestandsnaam | **P1** |
| Link naar `docs/DESIGN-INPUT.md` | ❌ | **P2** |

### Wireframe doc (`CONTROL-WIREFRAME.md`)

| Item | Status |
|------|--------|
| Actuele layout (2-koloms grid, sidebar stack) | ❌ Doc beschrijft oude single-column “Styling”-only layout |
| Widget panel, branding, project, netwerk, design | ❌ Niet gedocumenteerd |
| Graphic kaart states (`is-live`, On air) | ⚠️ Deels; huidige copy is “Zet live” / “On air” i.p.v. Aan/Uit |
| Operator als apart scherm | ❌ Niet in wireframe |

**Prioriteit wireframe update:** **P2** (doc drift, geen runtime bug).

---

## 2. Aanbevolen volgende widgets/controls (volgorde)

### Eerst bouwen (P0 — hoogste operator-impact)

1. **Score quick controls op dashboard** — Thuis/Uit `+1` / `−1` inline in widget panel of op overlay-kaart (matchScoreboard card). Operator blijft primair; TD wil soms vanaf laptop corrigeren zonder iPhone.
2. **`showNames` checkbox** — Koppel aan `data.showNames`; editor bind `homeName`/`awayName` werkt al.
3. **Verwijder `.op-http-hint`** — Netwerk-uitleg hoort in dashboard → Netwerk (staat daar al). Operator = zero instructional chrome.
4. **iOS input zoom fix** — `.field--inline input, select { font-size: 16px; }` (+ eventueel `inputmode="numeric"`).

### Daarna (P1 — polish + TD workflow)

5. **Live klok in dashboard** — Read-only `45:23` display + optioneel sync met form fields; Start/Pauze knop toont `button--live` wanneer running (mirror operator).
6. **Instant apply voor visibility toggles** — Checkbox change → PATCH zonder volledige form submit; behoud “Widgets opslaan” alleen voor tekstvelden.
7. **Periode presets** — Knoppen: “Start 2e helft (45:00)”, “Verlenging”, “Penalties modus” naast dropdown.
8. **Penalty strip op dashboard** — Minimaal: Actief toggle + Reset (zelfde actions als operator, compact).
9. **Design → editor bridge** — Per thumbnail: “Als achtergrond in editor” (opent `/editor?bg=…` of PATCH layout.background).

### Later (P2)

10. Widget panel als **expandable sectie op overlay-kaart** (niet alleen sidebar).
11. Operator: verberg penalty-sectie als `widgets.penalties === false`.
12. Design panel: delete, tags, link naar DESIGN-INPUT checklist.

---

## 3. Operator mobile UX — kritische punten

### Wat goed werkt

- Touch targets: `.touch-btn` min-height **52px** (design brief: 52px) ✅
- Safe area: `padding-bottom` met `env(safe-area-inset-bottom)` + fixed nav ✅
- Live klok in UI: `tickLiveClocks` + `formatClock`/`resolveLiveClock` ✅
- Score +/- groot en gescheiden per team ✅
- `?focus=` query sorteert gefocuste graphic bovenaan ✅
- Partial DOM update (`updateMatchCard`) voorkomt scroll/tap verlies ✅

### Problemen

| Issue | Detail | Fix richting |
|-------|--------|--------------|
| **Instructiebanner** | Oranje `.op-http-hint` vult ~3 regels boven content; user vroeg expliciet verwijdering | Verwijder element + CSS; behoud hint alleen in control Netwerk panel |
| **iOS zoom op klokvelden** | Number inputs waarschijnlijk &lt;16px via `font: inherit` | Forceer 16px op operator form controls |
| **Toolbar density** | 6 knoppen in 2-koloms grid: −15s, +15s, −1min, +1min, klok, 90+, on air — risk op mis-taps onder tijdsdruk | Groepeer: rij 1 = klok ±, rij 2 = start/pauze + 90+, rij 3 = on air full-width |
| **Penalty altijd zichtbaar** | 4 goal/miss + undo + reset = 6 extra knoppen ook bij gewone competitiewedstrijd | Collapse wanneer penalties inactief of widget uit |
| **Dubbele score info** | `.op-status` + grote score in teams = redundant | Houd status op “On air / Niet live”; score alleen in team blocks |
| **Geen haptic/visual debounce** | Snelle dubbel-tap op + kan dubbele score geven (API, geen UI guard) | Optioneel: 300ms disable na click op score buttons |
| **Legacy card** | `footballScore` template mist klok/penalties | Documenteer als deprecated of verberg |

### Double-tap zoom — beoordeling

**Niet volledig af.** Viewport + `touch-action: manipulation` op knoppen is baseline correct, maar Safari zoomt nog steeds op **focus van kleine inputs**. Dat raakt precies de klok-minuut/seconde velden — het meest gebruikte niet-knop element. Prioriteit **P0** voor operator.

---

## 4. Voorbereiding user-provided design screenshots

### Huidige flow (werkend)

1. Dashboard → **Design referenties** → upload.
2. Bestand → `data/projects/{id}/assets/design-*.png`.
3. Editor → aparte PNG upload voor canvas background.

### Gaps vóór klant-screenshots bruikbaar zijn

| Gap | Impact |
|-----|--------|
| Geen gestructureerde intake in UI | User weet niet *wat* te labelen per PNG |
| Geen koppeling upload ↔ widget config | UX moet handmatig checkboxes zetten na screenshot |
| Filter toont alle `.png` in assets | Scorebord-PNG en design-ref door elkaar |
| Geen 1920×1080 validatie | Verkeerde aspect ratio merk je pas in editor |

### Aanbevolen intake (UX, geen lead-code vereist)

**Vóór upload — checklist tonen in design panel** (copy uit `docs/DESIGN-INPUT.md`):

- Resolutie 1920×1080, PNG preferred
- Bestandsnaam: `design-{klant}-{variant}.png`
- Per bestand noteren: zichtbare widgets, overlay positie, referentie (bijv. “WK 2026 lower bar”)

**Na upload — handmatige mapping (tot editor-bridge P1 klaar is):**

| Screenshot toont | Dashboard actie |
|------------------|-----------------|
| Alleen score + codes | Zichtbare widgets: codes + scores aan; penalties uit |
| Met klok rechts | Widget klok aan; editor bind `clock` positioneren |
| Penalty shootout | Penalties aan; test operator penalty flow |
| Volledige bar onder | Positie → `bottom-full` of `bottom-center` |

**Wireframe update nodig:** sidebar-volgorde documenteren (Overlays | Netwerk | Project | Branding | **Widget bediening** | Design | Note) zodat TD en UX agent dezelfde mentale map hebben.

### Wat de user moet aanleveren (minimaal)

1. **1× full overlay** @ 1920×1080 (transparante achtergrond waar mogelijk)
2. **Optioneel:** penalty-state variant
3. **Tekst-spec:** font, kleur hex, animatie wensen (score roll ja/nee)
4. **Bind-lijst:** welke tekst is dynamisch (codes, scores, klok, namen)

---

## Samenvatting prioriteiten

| P0 | P1 | P2 |
|----|----|-----|
| Verwijder operator `.op-http-hint` | Live klok display dashboard | Wireframe doc updaten |
| iOS 16px inputs (anti-zoom) | Instant apply widget toggles | Design delete/rename |
| `showNames` toggle | Periode presets + klok running state UI | Penalty collapse operator |
| Score +/- op dashboard | Design → editor shortcut | Widget panel op overlay-kaart |

**Overall:** Widget panel is een solide v1 voor **configuratie** (visibility, positie, klok setup, animatie). Het mist nog **live bediening** vanaf dashboard en een paar datavelden (`showNames`). Operator is functioneel sterk voor klok/score/penalties, maar faalt op twee expliciete user asks: instructietekst staat er nog en double-tap zoom is niet waterdicht. Design-upload is aanwezig maar nog geen end-to-end workflow naar editor.
