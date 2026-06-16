# WYSIWYG Scoreboard Editor — UX spec

## Doel

Visuele composer op `/editor` voor scorebord-overlays: PNG-achtergrond + vrij positioneerbare tekstvelden. Output wordt opgeslagen in `graphic.data` en gerenderd op `/render`. Gericht op desktop/tablet (touch-vriendelijke controls).

## Layout

```
┌──────────────────────────────────────────────────────────────────┐
│ ← Dashboard    Scorebord editor          [Opslaan] [Preview ↗]   │
├────────────────────────────────────┬─────────────────────────────┤
│                                    │  Eigenschappen              │
│   ┌─────────────────────────┐      │  ─────────────────          │
│   │  Canvas 16:9            │      │  Tekst                      │
│   │  [PNG achtergrond]      │      │  Lettertype                 │
│   │  draggable labels       │      │  Grootte (slider)           │
│   └─────────────────────────┘      │  Kleur                      │
│   Upload PNG hint                    │  Rol / binding              │
│   [+ Tekstveld]                      │  Positie X/Y % (readonly)   │
└────────────────────────────────────┴─────────────────────────────┘
```

### Header

| Element | Id | Actie |
|---------|-----|-------|
| Terug | link `/control` | Dashboard |
| Titel | — | "Scorebord editor" |
| Opslaan | `#editor-save` | `PATCH /api/graphics/:id` |
| Preview | link `/render` | Nieuw tabblad |

### Canvas (`#editor-canvas`)

- Vaste **16:9** aspect ratio, schaalt binnen viewport
- Class: `.editor-canvas`, inner `.editor-canvas__stage`
- Achtergrond: `background-image` van asset URL  
  `/projects/{projectId}/assets/{filename}`
- Rasterhint optioneel (CSS subtiele grid, geen snap in v1)

### Achtergrond upload (`#editor-bg-upload`)

- Dropzone-stijl hint: "Sleep een PNG hierheen of klik om te uploaden"
- Accept: `image/png`
- **Lead gap:** `POST /api/projects/:id/assets` (multipart `file`) — UX toont preview via `URL.createObjectURL` tot upload klaar is
- Na upload: `layout.background = filename` in graphic data

### Tekst-elementen (`.editor-element`)

Elk element is `position: absolute` met `left`/`top` in **percentage** (0–100) t.o.v. canvas.

| Dataveld | Type | Beschrijving |
|----------|------|--------------|
| `id` | string | uniek binnen layout |
| `label` | string | Editor-weergavenaam |
| `bind` | string | Data-key: `homeTeam`, `awayTeam`, `homeScore`, `awayScore`, `period`, `minute`, `custom` |
| `text` | string | Statische preview of placeholder |
| `x`, `y` | number | Percentage positie |
| `fontSize` | number | px op referentiebreedte 1920 |
| `color` | string | `#rrggbb` |
| `fontFamily` | string | CSS font stack |

**Standaard set** (nieuw project / lege layout):

| bind | label | preview |
|------|-------|---------|
| homeTeam | Thuis team | Thuis |
| homeScore | Thuis score | 0 |
| awayTeam | Uit team | Uit |
| awayScore | Uit score | 0 |
| period | Periode | 1e helft |
| minute | Minuut | 0' |

### Interactie

| Actie | Desktop | Touch |
|-------|---------|-------|
| Selecteren | klik element | tap |
| Verplaatsen | drag | drag (pointer events) |
| Deselect | klik leeg canvas | tap leeg |
| Verwijderen | Delete / knop in sidebar | knop **Verwijder veld** (min 44px) |

Selected state: `.is-selected` — blauwe outline `#007AFF`, resize handles niet in v1.

### Zijbalk (`#editor-inspector`)

Alleen zichtbaar als element geselecteerd; anders lege staat: "Selecteer een tekstveld op het canvas."

| Control | Id | Type |
|---------|-----|------|
| Tekst | `#prop-text` | text input |
| Lettertype | `#prop-font` | select (system presets + brand font) |
| Grootte | `#prop-size` | range 12–120, touch-friendly hoogte |
| Kleur | `#prop-color` | color input |
| Binding | `#prop-bind` | select (data keys) |
| Verwijder | `#prop-delete` | `button--danger` |

### Graphic selector (`#editor-graphic-select`)

- Dropdown als meerdere bewerkbare graphics (`footballScore` of `customScoreboard`)
- Query override: `?graphic=id`

## Data model (voorstel aan lead)

Opgeslagen in `PATCH /api/graphics/:id`:

```json
{
  "data": {
    "homeTeam": "Ajax",
    "awayScore": 0,
    "layout": {
      "refWidth": 1920,
      "refHeight": 1080,
      "background": "scoreboard.png"
    },
    "elements": [
      {
        "id": "el-home-team",
        "bind": "homeTeam",
        "label": "Thuis team",
        "x": 18,
        "y": 42,
        "fontSize": 36,
        "color": "#ffffff",
        "fontFamily": "-apple-system, BlinkMacSystemFont, sans-serif"
      }
    ]
  }
}
```

Render-engine leest `layout` + `elements` voor custom scoreboard type (lead implementatie).

## Opslaan & sync

1. **Opslaan** → `PATCH /api/graphics/:id` met volledige `data` merge
2. Socket `stateChanged` werkt canvas bij als extern gewijzigd
3. Succes: korte status "Opgeslagen" (2s)

## Tahoe styling

- Zelfde tokens als `tahoe.css` (`glass`, `button--primary`, `--pv-accent`)
- Canvas op wit/grijs vlak met schaduw; sidebar `glass` panel
- Geen donkere broadcast-UI

## Touch targets

- Minimaal **44px** hoogte op knoppen, sliders, color inputs in inspector
- `touch-action: none` op canvas tijdens drag

## API gebruikt door `editor.js`

| Method | Path |
|--------|------|
| GET | `/api/state` |
| PATCH | `/api/graphics/:id` |
| GET | assets `/projects/:projectId/assets/:filename` |

## Lead gaps

1. **Asset upload** endpoint voor PNG achtergrond
2. **Render type** `customScoreboard` of uitbreiding `footballScore` met `layout`/`elements`
3. **projectId** in state response (`state.projectId`) voor asset URLs
4. **Validatie** element ids en bind keys server-side
5. **Undo/redo** — niet in v1
