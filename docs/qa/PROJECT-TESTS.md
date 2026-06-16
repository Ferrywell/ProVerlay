# ProVerlay — Project System Test Cases

**Versie:** 1.0  
**Datum:** 2026-06-09  
**Tester:** Beta Tester agent  
**Scope:** Multi-project API, export/import, per-project persistence, composedScore WYSIWYG data  
**Referenties:** `TEST-PLAN.md` (TC-100–112), `data/registry.json`, `data/projects/`

---

## Doel

Verifiëren dat operators meerdere shows/projecten kunnen beheren, per project onafhankelijke graphic-state hebben, projecten kunnen exporteren/importeren als zip, en composedScore-elementen via API kunnen patchen voor de WYSIWYG-editor.

---

## Preconditions

| Item | Waarde |
|------|--------|
| Server | `cd /Users/ferrywell/Documents/ProVerlay && npm install && npm start` |
| Base URL | `http://localhost:2014` |
| Default project | `blank` in `data/registry.json` |
| Template state | `data/projects/blank/project.json` (composedScore) |
| Legacy file | `data/show.json` (nog in gebruik tot project-API live is) |

---

## TC-100 — List projects (default blank)

| Veld | Waarde |
|------|--------|
| ID | TC-100 |
| Prioriteit | P0 |
| Type | API (curl) |
| Endpoint | `GET /api/projects` |

### Stappen
1. Start server.
2. `curl -s http://localhost:2014/api/projects`

### Verwacht resultaat
```json
{
  "activeProjectId": "blank",
  "projects": [
    { "id": "blank", "name": "Blanco project", "createdAt": "...", "updatedAt": "..." }
  ]
}
```

### Acceptatie
- [ ] HTTP 200
- [ ] `activeProjectId === "blank"`
- [ ] Minstens één project in `projects`
- [ ] Elk project heeft `id`, `name`, `createdAt`, `updatedAt`

### Automatisatie
```bash
curl -s -w "\n%{http_code}" http://localhost:2014/api/projects
```

---

## TC-101 — Create project

| Veld | Waarde |
|------|--------|
| ID | TC-101 |
| Prioriteit | P0 |
| Type | API (curl) |
| Endpoint | `POST /api/projects` |

### Stappen
1. `POST /api/projects` body: `{"name":"QA Test Show"}`.
2. Lees `data/registry.json`.
3. Controleer `data/projects/{newId}/project.json` bestaat.

### Verwacht resultaat
- Nieuw project met slug-achtige `id` (bijv. `qa-test-show` of UUID).
- Registry bevat 2+ projecten.
- Nieuw `project.json` met standaard graphics (minstens composedScore template).

### Acceptatie
- [ ] HTTP 201 of 200
- [ ] Response bevat aangemaakt project-object
- [ ] Directory `data/projects/{id}/` bestaat
- [ ] `project.json` is geldig JSON

### Automatisatie
```bash
curl -s -X POST http://localhost:2014/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"QA Test Show"}'
ls -la data/projects/
```

---

## TC-102 — Activate project (state switch)

| Veld | Waarde |
|------|--------|
| ID | TC-102 |
| Prioriteit | P0 |
| Type | API (curl) |
| Endpoint | `POST /api/projects/:id/activate` |

### Stappen
1. Noteer huidige state: `GET /api/state` → aantal graphics, types.
2. `POST /api/projects/blank/activate`.
3. `GET /api/state` opnieuw.
4. Vergelijk met `data/projects/blank/project.json`.

### Verwacht resultaat
- Na activate `blank`: state bevat `composedScore` graphic (`score-main`), niet legacy `footballScore` uit `show.json`.
- `registry.json` → `activeProjectId: "blank"`.

### Acceptatie
- [ ] HTTP 200
- [ ] `GET /api/state` graphics komen overeen met geactiveerd `project.json`
- [ ] `activeProjectId` in registry bijgewerkt
- [ ] Socket.io clients ontvangen `stateChanged`

### Automatisatie
```bash
curl -s -X POST http://localhost:2014/api/projects/blank/activate
curl -s http://localhost:2014/api/state | jq '[.graphics[].type]'
# verwacht: ["composedScore"] (of meer types in template)
```

---

## TC-103 — Per-project state isolation

| Veld | Waarde |
|------|--------|
| ID | TC-103 |
| Prioriteit | P0 |
| Type | API (curl) |

### Stappen
1. Maak project `proj-a` en `proj-b` (of gebruik blank + nieuw).
2. Activeer A: `PATCH score-main` → `homeScore: 10`, `visible: true`.
3. Activeer B: controleer `homeScore` ≠ 10.
4. Activeer A: `homeScore` weer 10, `visible: true`.

### Verwacht resultaat
- Geen cross-contamination tussen project-bestanden.

### Acceptatie
- [ ] `data/projects/A/project.json` ≠ `data/projects/B/project.json` na wijzigingen
- [ ] Activate herlaadt juiste snapshot

---

## TC-104 — Persist to project.json (niet show.json)

| Veld | Waarde |
|------|--------|
| ID | TC-104 |
| Prioriteit | P0 |
| Type | API + filesystem |

### Stappen
1. Activeer `blank`.
2. `PATCH /api/graphics/score-main` → `{"data":{"homeScore":42}}`.
3. Lees `data/projects/blank/project.json`.
4. Lees `data/show.json` (indien nog aanwezig).

### Verwacht resultaat
- `project.json` bevat `homeScore: 42`.
- Legacy `show.json` wordt **niet** primair schrijfdoel (mag ongewijzigd blijven of deprecated).

### Acceptatie
- [ ] Wijziging in `data/projects/blank/project.json`
- [ ] `registry.json` `updatedAt` van blank bijgewerkt

### Run 2026-06-09 observatie
- **FAIL:** PATCH schrijft naar `show.json`; `project.json` blijft `homeScore: 0` (zie QA-004).

---

## TC-105 — Export project as zip

| Veld | Waarde |
|------|--------|
| ID | TC-105 |
| Prioriteit | P0 |
| Type | API (curl) |
| Endpoint | `GET /api/projects/:id/export` |

### Stappen
1. Plaats test-asset in `data/projects/blank/assets/logo.png` (optioneel).
2. `GET /api/projects/blank/export` → sla op als zip.
3. `unzip -l blank-export.zip`.

### Verwacht resultaat
- Downloadbare zip met minstens `project.json`.
- Assets-map meegenomen indien aanwezig.

### Acceptatie
- [ ] HTTP 200
- [ ] Response is binary zip (`file` command: Zip archive)
- [ ] `Content-Disposition` attachment header
- [ ] Zip bevat `project.json` met geldige state

### Automatisatie
```bash
curl -s -D /tmp/headers.txt -o /tmp/blank-export.zip \
  http://localhost:2014/api/projects/blank/export
file /tmp/blank-export.zip
unzip -l /tmp/blank-export.zip
```

---

## TC-106 — Import project from zip

| Veld | Waarde |
|------|--------|
| ID | TC-106 |
| Prioriteit | P0 |
| Type | API (curl) |
| Endpoint | `POST /api/projects/import` |

### Stappen
1. Export `blank` (TC-105).
2. `POST /api/projects/import` met `-F "file=@blank-export.zip"`.
3. Activeer geïmporteerd project.
4. `GET /api/state` — graphics en assets beschikbaar.

### Verwacht resultaat
- Nieuw project-ID of overschrijf volgens API-contract.
- Assets uitgepakt naar `data/projects/{id}/assets/`.

### Acceptatie
- [ ] HTTP 200/201
- [ ] Geïmporteerd project in registry
- [ ] Graphics na activate identiek aan export-bron
- [ ] Asset-URLs/paden werken in render

### Automatisatie
```bash
curl -s -X POST http://localhost:2014/api/projects/import \
  -F "file=@/tmp/blank-export.zip"
```

---

## TC-107 — Import invalid file

| Veld | Waarde |
|------|--------|
| ID | TC-107 |
| Prioriteit | P1 |
| Type | API (curl) |

### Stappen
1. Upload niet-zip of lege zip.
2. Upload zip zonder `project.json`.

### Verwacht resultaat
- HTTP 400 met duidelijke foutmelding.
- Registry en bestaande projecten ongewijzigd.

---

## TC-108 — Activate unknown project

| Veld | Waarde |
|------|--------|
| ID | TC-108 |
| Prioriteit | P1 |
| Type | API (curl) |

### Stappen
`POST /api/projects/does-not-exist/activate`

### Verwacht
- HTTP 404 `{ "error": "Project not found" }` (of equivalent).

---

## TC-109 — PATCH composedScore elements

| Veld | Waarde |
|------|--------|
| ID | TC-109 |
| Prioriteit | P0 |
| Type | API (curl) |
| Graphic | `score-main` type `composedScore` |

### Stappen
1. Activeer project met composedScore.
2. Patch scores en element layout:

```bash
curl -s -X PATCH http://localhost:2014/api/graphics/score-main \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "homeScore": 2,
      "awayScore": 1,
      "minute": 67,
      "elements": {
        "homeScore": { "x": 25, "y": 40, "fontSize": 36, "color": "#FFD700", "align": "center" },
        "minute": { "x": 50, "y": 28, "fontSize": 14 }
      }
    }
  }'
```

### Verwacht resultaat
- Deep merge op `data.elements.*` — bestaande keys behouden, nieuwe overschreven.
- Scores en minute bijgewerkt.

### Acceptatie
- [ ] HTTP 200
- [ ] Response `data.elements.homeScore.x === 25`
- [ ] Response `data.homeScore === 2`
- [ ] Persist in actief `project.json`

### Run 2026-06-09 observatie
- **Partial pass:** PATCH merge werkt op legacy `show.json` (`footballScore`); `elements` deep merge OK.
- **Fail:** composedScore template niet geladen (activate API ontbreekt); geen persist naar `project.json`.

---

## TC-110 — Registry consistency

| Veld | Waarde |
|------|--------|
| ID | TC-110 |
| Prioriteit | P1 |
| Type | Filesystem |

### Stappen
1. Na create/import/delete: vergelijk `registry.json` project-IDs met `data/projects/*` directories.

### Verwacht
- Elke registry-entry heeft directory.
- Geen orphan directories zonder registry-entry (behalve `.gitkeep`).

---

## TC-111 — WYSIWYG editor (manual)

| Veld | Waarde |
|------|--------|
| ID | TC-111 |
| Prioriteit | P1 |
| Type | Manual UI |

### Stappen
1. Open `/control`, selecteer composedScore graphic.
2. Open WYSIWYG editor.
3. Sleep `homeScore` element, wijzig kleur/grootte.
4. Sla op, refresh render.

### Verwacht
- Visuele positie = `data.elements` in API.
- Export zip bevat gewijzigde layout.

### Acceptatie
- [ ] Editor laadt canvas uit graphic `data.canvas`
- [ ] Drag update triggert PATCH of batch save
- [ ] Render toont elementen op juiste posities (%)

---

## TC-112 — Restart persistence

| Veld | Waarde |
|------|--------|
| ID | TC-112 |
| Prioriteit | P0 |
| Type | API + restart |

### Stappen
1. Activeer niet-default project, wijzig state.
2. Stop en start server.
3. `GET /api/projects` → `activeProjectId`.
4. `GET /api/state` → zelfde graphics.

### Verwacht
- Actief project en state overleven restart.

---

## Testdata — blank project template

Uit `data/projects/blank/project.json`:

| Graphic ID | Type | Default visible |
|------------|------|-----------------|
| score-main | composedScore | false |

Element keys in `data.elements`: `homeTeam`, `homeScore`, `awayTeam`, `awayScore`, `period`, `minute`.

---

## Uitvoering & resultaten

| Run | Datum | Resultaten |
|-----|-------|------------|
| #1 | 2026-06-09 | Zie `TEST-RESULTS.md` § Project system |

**Samenvatting run #1:** 0/10 project-API cases pass; 1 partial (PATCH merge op legacy state); 2 manual blocked.

**Blocker:** BLK-003 — Project API niet geïmplementeerd in `server/api.js`.
