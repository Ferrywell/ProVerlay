# Lower Third Roster — technisch ontwerp

**Datum:** juni 2026  
**Status:** ontwerp (niet geïmplementeerd)  
**Fase:** Roadmap F2  
**Referentie:** Holographics `LowerThird` (`hasEntries: true`, `multipleVisibleEntries: false`)

---

## Probleem

ProVerlay heeft nu **één graphic per lower third**. Bij een talkshow, panel of WK-studio met 15+ sprekers levert dat:

- onoverzichtelijke control-lijst
- veel dubbele templates
- moeilijke Stream Deck-mapping (15 presets handmatig)

Holographics lost dit op met **entries** onder één widget. ProVerlay volgt dat patroon.

---

## Doel

- **Eén** lower-third template (PNG of CSS)
- **Veel** sprekers in een roster
- Operator: één tik → juiste naam/titel on air
- Companion: auto-preset per entry
- CSV import voor bulk (F4)

---

## Datamodel

### Nieuw graphic-type: `lowerThirdShow`

Vervangt op termijn losse `lowerThird` graphics voor roster-use-cases. Bestaande `lowerThird` blijft werken (legacy).

```json
{
  "id": "lt-show",
  "type": "lowerThirdShow",
  "name": "Sprekers",
  "visible": false,
  "position": "bottom-left",
  "operator": true,
  "data": {
    "template": {
      "mode": "png",
      "background": "lower-third-bar.png",
      "layout": { "refWidth": 1920, "refHeight": 1080 },
      "elements": [
        {
          "id": "el-name",
          "bind": "name",
          "x": 12,
          "y": 78,
          "fontSize": 42,
          "color": "#ffffff"
        },
        {
          "id": "el-title",
          "bind": "title",
          "x": 12,
          "y": 86,
          "fontSize": 28,
          "color": "#cccccc"
        }
      ],
      "animation": {
        "in": "slide-up",
        "out": "fade",
        "durationMs": 400
      }
    },
    "activeEntryId": null,
    "entries": [
      {
        "id": "sp-001",
        "name": "Jan de Vries",
        "title": "Hoofdcommentator",
        "company": "NOS",
        "photo": null,
        "keywords": ["jan", "commentator"]
      },
      {
        "id": "sp-002",
        "name": "Anna Jansen",
        "title": "Studio-analist",
        "company": "",
        "photo": "anna.jpg",
        "keywords": []
      }
    ]
  }
}
```

### Entry-velden

| Veld | Type | Verplicht | Render bind |
|------|------|-----------|-------------|
| `id` | string | ja | — |
| `name` | string | ja | `name` |
| `title` | string | nee | `title` |
| `company` | string | nee | `company` |
| `photo` | asset filename | nee | `photo` (F3) |
| `keywords` | string[] | nee | zoeken in UI |

### Gedrag

| Regel | Waarde |
|-------|--------|
| Zichtbare entries tegelijk | **1** (`multipleVisibleEntries: false`) |
| `visible: true` op graphic | Lower third on air |
| `activeEntryId` | Welke entry getoond wordt |
| Entry wisselen terwijl live | Animatie out → in (optioneel direct swap) |

---

## API (gepland)

Bestaande endpoints blijven; uitbreiding op graphic PATCH:

```http
PATCH /api/graphics/lt-show
Content-Type: application/json

{
  "visible": true,
  "data": {
    "activeEntryId": "sp-002"
  }
}
```

### Nieuwe endpoints (F2)

| Method | Path | Beschrijving |
|--------|------|--------------|
| `GET` | `/api/graphics/:id/entries` | Lijst entries |
| `POST` | `/api/graphics/:id/entries` | Entry toevoegen |
| `PATCH` | `/api/graphics/:id/entries/:entryId` | Entry wijzigen |
| `DELETE` | `/api/graphics/:id/entries/:entryId` | Entry verwijderen |
| `POST` | `/api/graphics/:id/entries/:entryId/show` | `activeEntryId` + `visible: true` |
| `POST` | `/api/graphics/:id/hide` | `visible: false` |
| `POST` | `/api/graphics/:id/entries/import` | CSV upload (F4) |

**Shortcut `show`:** één call voor operator — voorkomt race tussen entry + visible.

### Socket.io

Bestaande `stateChanged` volstaat. Optioneel later:

```javascript
socket.emit('showLowerThirdEntry', { graphicId: 'lt-show', entryId: 'sp-002' })
```

---

## UI-ontwerp

### Control (`/control`)

Nieuwe sectie bij geselecteerde `lowerThirdShow`:

```
┌─ Sprekers roster ─────────────────────────┐
│ [+ Toevoegen]  [CSV importeren]  [Zoek…] │
├──────────────────────────────────────────┤
│ ● Jan de Vries — Hoofdcommentator    [▶] │
│ ○ Anna Jansen — Studio-analist       [▶] │
│ ○ …                                      │
└──────────────────────────────────────────┘
```

- **[▶]** = “On air” (roept `show` endpoint aan)
- **●** = actief op output
- Dubbelklik = bewerk entry inline
- Template bewerken → link naar editor (zelfde als `matchScoreboard`)

### Operator (`/operator`)

Grote touch-knoppen — **alleen** `operator: true` graphics:

```
┌──────────────┐ ┌──────────────┐
│    JAN       │ │    ANNA      │
│ commentator  │ │ analist      │
└──────────────┘ └──────────────┘
┌──────────────────────────────┐
│         VERBERGEN            │
└──────────────────────────────┘
```

Scroll of paginering bij > 8 entries.

### Companion

- Action: **Show entry** — dropdown op `entries[].name`
- Action: **Hide lower third**
- Feedback: **Entry is on air** (boolean op `activeEntryId`)
- Presets: auto-gen per entry (zoals nu per graphic)

---

## Render

```javascript
// Pseudocode render.js
case 'lowerThirdShow': {
  const entry = data.entries.find(e => e.id === data.activeEntryId)
  if (!entry || !graphic.visible) return ''
  return buildFromTemplate(data.template, entry)
}
```

- Hergebruik `buildMatchScoreboard`-achtige element renderer voor `template.elements`
- Animatie bij entry-wissel: CSS class toggle op layer (`graphic--anim-in`)

### Performance

- Eén DOM-layer per `lowerThirdShow`
- Alleen tekst-nodes updaten bij entry switch — geen full re-mount
- Geen animatie als `visible: false`

---

## Migratie van bestaande `lowerThird`

| Huidig | Nieuw |
|--------|-------|
| 10× `lowerThird` graphics | 1× `lowerThirdShow` + 10 entries |
| `data.name/title/company` per graphic | Zelfde velden per entry |
| Companion preset per graphic | Preset per entry |

**Script (F2):** optioneel `POST /api/projects/:id/migrate-lower-thirds` — groepeert op gelijke template.

Legacy `lowerThird` blijft ondersteund voor eenvoudige eenmalige graphics.

---

## CSV-import (F4)

```csv
name,title,company,keywords
Jan de Vries,Hoofdcommentator,NOS,jan
Anna Jansen,Studio-analist,,anna
```

- Encoding UTF-8
- Header verplicht
- Duplicaten: skip of merge (instelling)

---

## Compose-integratie (later)

- Widgettype **Lower third show** in `/compose`
- PNG upload → bbox voor name/title/company
- Maakt `lowerThirdShow` met lege `entries: []`

---

## Implementatie-volgorde

1. **Datamodel** — `lowerThirdShow` in `graphicDefaults.js` + validatie
2. **Render** — template + entry binds
3. **API** — entries CRUD + `show` shortcut
4. **Control** — roster UI + zoeken
5. **Operator** — touch grid
6. **Companion** — actions/feedbacks/presets
7. **Migratie-tool** — optioneel
8. **CSV** — F4

**Geschatte omvang:** ~3–5 dagen focused werk (zonder compose/editor template editor).

---

## Open vragen

| Vraag | Voorstel |
|-------|----------|
| Foto naast naam? | F2: nee; F3: optioneel `photo` asset |
| Meerdere templates? | F3: meerdere `lowerThirdShow` widgets (bijv. “Gast” vs “Host”) |
| Twee sprekers tegelijk? | Niet in F2; aparte graphic of `multipleVisibleEntries` later |

---

## Gerelateerd

- [PRODUCT-ROADMAP.md](../PRODUCT-ROADMAP.md)
- [COMPOSE-IMPLEMENTATION-PLAN.md](./COMPOSE-IMPLEMENTATION-PLAN.md) — lower third in compose
- [HOLOGRAPHICS-PARITY.md](../qa/HOLOGRAPHICS-PARITY.md)
