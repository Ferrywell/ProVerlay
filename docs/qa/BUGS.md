# ProVerlay — Bug Reports

Gebruik `BUG-REPORT-TEMPLATE.md` voor nieuwe entries.

---

## QA-001 — Image graphic zonder src toont lege layer

```
ID: QA-001
Datum: 2026-06-09
Tester: Beta Tester agent
Severity: Medium
Component: Render

## Samenvatting
Wanneer een image-graphic visible is maar `data.src` leeg is, mount de render-engine een lege graphic-layer op het stage.

## Stappen om te reproduceren
1. Start ProVerlay (`npm start`).
2. Zorg dat `logo-event` in show.json `data.src: ""` heeft (standaard demo).
3. `POST /api/graphics/logo-event/toggle` met `{"visible": true}`.
4. Open http://localhost:3100/render.

## Verwacht gedrag
Geen zichtbaar element op stage; image-graphic wordt overgeslagen als src ontbreekt.

## Werkelijk gedrag
- 1 `.graphic-layer` met `.graphic--image` op stage.
- `innerHTML` is leeg, geen `<img>`.
- Lege layer kan layout/positie beïnvloeden in OBS.

## Omgeving
- OS: macOS darwin 25.0.0
- Browser: Cursor IDE browser (Chromium)
- Node versie: v18.18.0
- ProVerlay versie: 0.1.0

## Screenshots / logs
DOM inspectie:
- `layers: 1`
- `imageExists: true`
- `hasImg: false`
- `innerHTML: ""`

## Opmerkingen
Relevante code: `public/render/render.js` — `case 'image'` rendert alleen innerHTML als `graphic.data.src` truthy is, maar `syncGraphics` mount de layer toch omdat `visible: true`.
```

---

## QA-002 — Graphic toggle-knoppen ontbreken in accessibility snapshot

```
ID: QA-002
Datum: 2026-06-09
Tester: Beta Tester agent
Severity: Low
Component: Control

## Samenvatting
De dynamisch gegenereerde Aan/Uit-knoppen per graphic-card zijn niet zichtbaar in de browser accessibility snapshot (alleen via DOM-query).

## Stappen om te reproduceren
1. Open http://localhost:3100/control.
2. Maak browser accessibility snapshot.
3. Vergelijk met `document.querySelectorAll('.graphic-card button').length`.

## Verwacht gedrag
6 toggle-knoppen zichtbaar in accessibility tree voor screen readers.

## Werkelijk gedrag
Snapshot toont alleen header/styling controls; 6 knoppen bestaan in DOM maar niet in a11y tree.

## Omgeving
- OS: macOS darwin 25.0.0
- Browser: Cursor IDE browser (Chromium)
- Node versie: v18.18.0
- ProVerlay versie: 0.1.0

## Screenshots / logs
- a11y snapshot: 7 interactive refs (geen graphic toggles)
- DOM: 6 `.graphic-card` met button "Aan"/"Uit"

## Opmerkingen
Functioneel werken de knoppen; impact voor screen reader operators.
```

---

## QA-003 — Project API endpoints ontbreken (404)

```
ID: QA-003
Datum: 2026-06-09
Tester: Beta Tester agent
Severity: Critical
Component: Server / API

## Samenvatting
Alle multi-project API-routes returnen HTTP 404. Data-structuur (`data/registry.json`, `data/projects/blank/project.json`) bestaat, maar `server/api.js` exposeert geen `/api/projects` endpoints.

## Stappen om te reproduceren
1. Start ProVerlay (`npm start`, poort 2014).
2. `curl -s -w "\n%{http_code}\n" http://localhost:2014/api/projects`
3. `curl -s -X POST http://localhost:2014/api/projects -H "Content-Type: application/json" -d '{"name":"Test"}'`
4. `curl -s -X POST http://localhost:2014/api/projects/blank/activate`
5. `curl -s http://localhost:2014/api/projects/blank/export`
6. `curl -s -X POST http://localhost:2014/api/projects/import -F "file=@export.zip"`

## Verwacht gedrag
- GET /api/projects → 200 met `{ activeProjectId, projects[] }`
- POST /api/projects → 201 met nieuw project
- POST /api/projects/:id/activate → 200, state wisselt
- GET /api/projects/:id/export → 200 zip download
- POST /api/projects/import → 200/201 hersteld project

## Werkelijk gedrag
- Alle requests: HTTP 404 met Express HTML error page (`Cannot GET/POST /api/projects...`).

## Omgeving
- OS: macOS darwin 25.0.0
- Node: v18.18.0
- ProVerlay versie: 0.2.0-draft

## Opmerkingen
Geblokkeert TC-100–108, TC-112. Zie BLK-003. Dependencies `archiver`, `multer`, `unzipper` zijn geïnstalleerd maar niet wired in API router.
```

---

## QA-004 — State schrijft naar show.json, niet project.json

```
ID: QA-004
Datum: 2026-06-09
Tester: Beta Tester agent
Severity: High
Component: Server / Persistence

## Samenvatting
`server/state.js` laadt en bewaart state uitsluitend in `data/show.json`. Wijzigingen via PATCH API komen niet terecht in `data/projects/{id}/project.json`, terwijl `registry.json` `activeProjectId: "blank"` aangeeft.

## Stappen om te reproduceren
1. Start server.
2. `curl -s -X PATCH http://localhost:2014/api/graphics/score-main \
     -H "Content-Type: application/json" \
     -d '{"data":{"homeScore":42}}'`
3. Lees `data/show.json` → homeScore: 42.
4. Lees `data/projects/blank/project.json` → homeScore: 0 (ongewijzigd).

## Verwacht gedrag
- Actief project (`blank`) persist naar `data/projects/blank/project.json`.
- Legacy `show.json` niet meer primair schrijfdoel na project-migratie.

## Werkelijk gedrag
- Alleen `show.json` wordt bijgewerkt.
- `project.json` blijft op template-waarden (composedScore, homeScore: 0).
- Runtime state komt uit `show.json` (footballScore), niet uit project template.

## Omgeving
- OS: macOS darwin 25.0.0
- Node: v18.18.0
- ProVerlay versie: 0.2.0-draft

## Opmerkingen
Gerelateerd aan QA-003. `loadState()` in `server/state.js` gebruikt `SHOW_PATH` hardcoded. Blokkeert TC-104, TC-103, TC-112.
```

---

## QA-005 — GET /api/projects/:id/assets crasht (assetsDir niet geïmporteerd)

```
ID: QA-005
Datum: 2026-06-09
Tester: Beta Tester agent
Severity: High
Component: Server / API

## Samenvatting
De route `GET /api/projects/:id/assets` roept `assetsDir()` aan in `server/api.js`, maar `assetsDir` ontbreekt in de import uit `./projects.js`. POST upload via `saveAsset` werkt wél.

## Stappen om te reproduceren
1. Start ProVerlay (`node server/index.js`, poort 2014).
2. `curl -s -w "\n%{http_code}\n" http://localhost:2014/api/projects/blank/assets`
3. Optioneel: upload eerst een bestand via POST (dat lukt) en herhaal GET.

## Verwacht gedrag
HTTP 200 met JSON-array `[{ filename, url }]` (leeg array als geen assets).

## Werkelijk gedrag
HTTP 500 met `{"error":"assetsDir is not defined"}`.

## Omgeving
- OS: macOS darwin 25.0.0
- Node: v18.18.0
- ProVerlay versie: 0.2.0-draft

## Opmerkingen
- `POST /api/projects/:id/assets` retourneert 200 (gebruikt `saveAsset`, niet `assetsDir` direct).
- Static serving `/projects/:id/assets/:file` werkt (HTTP 200).
- Control-panel `loadDesignAssets()` toont foutmelding; design-lijst blijft leeg ondanks uploads.
- Fix: voeg `assetsDir` toe aan import in `server/api.js` regel 18–26.
```

---

## QA-006 — Control widget-opslaan spoelt live klok terug

```
ID: QA-006
Datum: 2026-06-09
Tester: Beta Tester agent
Severity: Medium
Component: Control

## Samenvatting
Het widget-paneel in `/control` heeft geen live klok-ticker (geen `setInterval`). Minuut/seconde-velden blijven op de waarde van de laatste `stateChanged`. Bij opslaan terwijl `clock.running === true` zet `widgetPayloadFromForm()` `runningSince` op `new Date()` mét verouderde form-waarden → opgeslagen tijd springt terug.

## Stappen om te reproduceren
1. Start klok via operator of API (`running: true`, `runningSince` nu, `minute: 0`, `second: 0`).
2. Wacht 30+ seconden (render/operator tonen 0:30+).
3. Open `/control` — klokvelden tonen nog `0` / `0`.
4. Wijzig een widget-checkbox of klik "Widgets opslaan".

## Verwacht gedrag
Opgeslagen speeltijd blijft synchroon met live klok (minstens huidige resolved tijd).

## Werkelijk gedrag
`runningSince` wordt vernieuwd met form-base `0:00` → klok springt terug naar startwaarde.

## Omgeving
- OS: macOS darwin 25.0.0
- Node: v18.18.0
- ProVerlay versie: 0.2.0-draft

## Opmerkingen
Relevante code: `public/control/control.js` — `widgetPayloadFromForm()` regel 292–298; geen ticker zoals `operator.js` `tickLiveClocks` / `render.js` `tickMatchClocks`.
"Pauze" in control gebruikt `freezeClock()` op payload en compenseert deels via `resolveLiveClock`, maar widget-opslaan niet.
```

---

## QA-007 — Operator klok-inputs niet live bij lopende klok

```
ID: QA-007
Datum: 2026-06-09
Tester: Beta Tester agent
Severity: Low
Component: Operator

## Samenvatting
Op `/operator` updatet `tickLiveClocks` alleen `[data-bind="clock"]`. De number-inputs `data-field="minute"` en `data-field="second"` blijven op de statische server-base (`clock.minute`/`clock.second`), niet op `resolveLiveClock()`.

## Stappen om te reproduceren
1. Start klok op operator.
2. Wacht 20 seconden.
3. Display toont bv. `0:20`; inputs tonen nog `0` / `0`.

## Verwacht gedrag
Inputs en display tonen dezelfde live tijd (of inputs zijn read-only tijdens run).

## Werkelijk gedrag
Display tikt door; inputs tonen verouderde base-waarden.

## Omgeving
- OS: macOS darwin 25.0.0
- Browser: file/code review + API
- ProVerlay versie: 0.2.0-draft

## Opmerkingen
Handmatige wijziging via inputs roept `freezeClock()` aan (`handleFieldChange`) — dat pad is correct. Puur visuele inconsistentie.
```
