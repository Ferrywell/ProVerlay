# Compose — implementatieplan

**Datum:** 9 juni 2026  
**Status:** Fase 1 gebouwd · Fase 2–4 gepland  
**Agents:** UX/UI (#2) + Frontend Design (#3) — zie `COMPOSE-AGENT-ADVICE.md`

---

## Doel

Vanuit het dashboard een PNG-design omzetten naar een ProVerlay-overlay, voor **alle vijf widgettypes**:

| Type | API-key | Na aanmaken |
|------|---------|-------------|
| Wedstrijdscore | `matchScoreboard` | `/editor?graphic=…` |
| Tickertape | `customTicker` | `/control` (dashboard) |
| Start countdown | `streamCountdown` | `/control` |
| Lower third | `lowerThird` | `/control` |
| Bericht | `message` | `/control` |

**Naamgeving (consensus agents):**

- Dashboard-knop: **Uit design maken**
- Paginatitel: **Design importeren**
- Route: `/compose`

---

## Architectuur

```
/control ──► /compose (3 fasen)
                │
                ├─ POST /api/projects/:id/assets          (PNG opslaan)
                ├─ POST /api/projects/:id/analyze-image   (dimensies + regio's)
                └─ POST /api/projects/:id/compose-widget  (graphic + data)
                        │
                        ▼
              matchScoreboard → /editor
              overige types   → /control
```

### Bestanden (Fase 1 — live)

| Pad | Rol |
|-----|-----|
| `public/compose/index.html` | Wizard UI (upload → review → aanmaken) |
| `public/compose/compose.css` | Layout + bbox tokens (Design #3) |
| `public/compose/compose.js` | Client flow, regio-lijst, API-calls |
| `server/composeAnalyze.js` | PNG-dimensies, `buildGraphicDataFromCompose()` |
| `server/api.js` | `analyze-image`, `compose-widget` |
| `public/shared/wysiwyg-history.js` | Undo/redo stack (editor) |
| `public/shared/range-number-sync.js` | Slider ↔ number sync (editor) |

---

## Wizard-fasen

### 1. Upload

- Widgettype kiezen (alle 5 types)
- Optionele naam
- PNG upload (drag & drop)
- Actie: **Analyseren en controleren**

### 2. Controleren

Split view (Design-wireframe):

```
┌─────────────────────────────┬──────────────────┐
│ Canvas + bbox overlay       │ Regio-lijst       │
│ (editor DNA)                │ tekst + bind      │
└─────────────────────────────┴──────────────────┘
```

- Handmatig veld toevoegen/verwijderen
- Geen placement-sliders (editor heeft dit al voor score-strip)
- OCR-hint als er 0 regio's zijn (Fase 1: altijd handmatig of defaults)

### 3. Aanmaken

- Samenvatting (naam, type, PNG, aantal velden)
- **Widget aanmaken en openen** → redirect

---

## Per widgettype

### Wedstrijdscore (`matchScoreboard`)

- **PNG:** horizontale strip (bijv. 3197×335)
- **Velden:** home/away code, score, klok, periode — bind dropdown NL
- **Na creatie:** editor voor placement (0–100% breedte), fonts, referentie
- **OCR Fase 2:** Tesseract op strip; score/klok regex uit `suggestBind()`

### Tickertape (`customTicker`)

- **PNG:** lange balk; tekst scrollt over achtergrond
- **Compose:** geen tekstvelden verplicht; messages leeg → dashboard vullen
- **Data:** `layout.background`, barHeight afgeleid van PNG-hoogte

### Start countdown (`streamCountdown`)

- **PNG:** optionele achtergrond of transparant
- **Compose:** geen velden; targetDateTime default +15 min
- **Finetune:** dashboard inspector (font, kleur, formaat)

### Lower third (`lowerThird`)

- **Velden:** naam, titel, organisatie (bind + tekst)
- **OCR Fase 2:** 2–3 regio's detecteren
- **Finetune:** dashboard + toekomstige lower-third editor

### Bericht (`message`)

- **Velden:** één of meer tekstregio's
- **Data:** `text` + optionele `elements[]` voor WYSIWYG later

---

## Editor-verbeteringen (parallel, live)

| Feature | Implementatie |
|---------|----------------|
| Breedte 0–100% | `placement-w` min=0; strip sync 0–100 |
| Undo/redo | Ctrl+Z / Ctrl+Shift+Z via `wysiwyg-history.js` |
| Bewerkbare getallen | Slider + `<input type="number">` placement, font size, positie X/Y |

---

## Roadmap

### Fase 1 ✅ (huidige build)

- [x] Route `/compose` + dashboard entry
- [x] Upload + analyze stub (PNG dimensies)
- [x] Review UI + handmatige velden
- [x] `compose-widget` voor alle 5 types
- [x] Editor: undo, editable numbers, width 0%

### Fase 2 — OCR

- [ ] `tesseract.js` server-side of worker
- [ ] Regio's vullen in `analyzeImageBuffer()`
- [ ] Confidence pills «Onzeker» in regio-lijst
- [ ] Blokkeer aanmaken bij dubbele bind (score thuis)

### Fase 3 — Type-specifieke editors

- [ ] Lower-third editor (hergebruik editor DNA)
- [ ] Ticker preview in compose (scroll-snelheid)
- [ ] Countdown font/positie in compose of mini-editor
- [ ] Deep link `/compose?asset=design-….png` vanuit `/project`

### Fase 4 — Polish (UX sign-off)

- [ ] Entry zonder scroll op laptop
- [ ] Alle labels NL in compose-inspector
- [ ] «Opnieuw scannen» in editor (secundair)
- [ ] E2E: PNG → compose → editor → render OBS

---

## API-contract

### `POST /api/projects/:id/analyze-image`

**Body:** `multipart/form-data` — `file` (PNG), `widgetType`

**Response:**

```json
{
  "width": 3197,
  "height": 335,
  "widgetType": "matchScoreboard",
  "regions": [],
  "ocrAvailable": false,
  "hint": "…"
}
```

### `POST /api/projects/:id/compose-widget`

**Body:** JSON

```json
{
  "type": "matchScoreboard",
  "name": "ODIDO score",
  "filename": "score-strip.png",
  "width": 3197,
  "height": 335,
  "regions": [{ "text": "0", "bind": "homeScore", "bbox": { "x": 0, "y": 0, "w": 100, "h": 50 } }],
  "placement": { "x": 50, "y": 5.5, "width": 83.25 },
  "designFrameWidth": 3840
}
```

**Response:** `{ "graphic": { … }, "state": { … } }`

---

## Design tokens (bbox)

| State | Stijl |
|-------|--------|
| Default | `1px solid rgba(0,122,255,0.45)` |
| Selected | `--pv-accent` + inset ring |
| Lijst-sync | `.is-selected` op card + bbox |

Zie `public/compose/compose.css` — aligned met `editor-element.is-selected`.

---

## Testplan (handmatig)

1. Dashboard → **Uit design maken** → `/compose`
2. Upload ODIDO strip PNG → wedstrijdscore → 2 default velden zichtbaar
3. Widget aanmaken → editor opent → breedte naar 0% en terug
4. Ctrl+Z na verplaatsen tekstveld
5. Tickertape PNG → geen velden verplicht → dashboard toont nieuwe overlay
6. `/render?graphic=…` toont score strip na editor opslaan

---

## Gerelateerde docs

- `docs/ux/COMPOSE-AGENT-ADVICE.md` — agent consensus
- `docs/ux/IMAGE-TO-WIDGET-TOOL.md` — oorspronkelijk voorstel
- `docs/ux/EDITOR-DESIGN-PASS.md` — editor UX
