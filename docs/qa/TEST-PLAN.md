# ProVerlay — Test Plan (MVP v0.1.0)

**Versie:** 1.1  
**Datum:** 2026-06-09 (project suite: 2026-06-09)  
**Tester:** Beta Tester agent  
**Gebaseerd op:** `docs/QA-TEST-PLAN.md`, `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`

## Testomgeving

| Item | Waarde |
|------|--------|
| Start | `npm install && npm start` |
| Control | http://localhost:2014/control |
| Render | http://localhost:2014/render |
| Operator | http://localhost:2014/operator |
| API | http://localhost:2014/api/state |
| Projects API | http://localhost:2014/api/projects |
| Poort | 2014 (`PORT` env override) |
| Legacy state | `data/show.json` (pre-project) |
| Project registry | `data/registry.json` |
| Per-project state | `data/projects/{id}/project.json` |
| Node | v18.18.0 |
| OS | macOS (darwin 25.0.0) |

## Severity-definities

| Level | Definitie |
|-------|-----------|
| Critical | Render werkt niet / data loss / crash |
| High | Graphic type werkt niet / geen sync |
| Medium | Styling bug / UX verwarring |
| Low | Cosmetisch / a11y |

## Legenda status

| Status | Betekenis |
|--------|-----------|
| Pass | Verwacht gedrag bevestigd |
| Fail | Afwijking gevonden (zie `BUGS.md`) |
| Blocked | Feature/module ontbreekt |
| Manual | Niet automatiseerbaar in deze run; handmatig te verifiëren |

---

## 1. Smoke tests (P0)

### TC-001 — Server start
| Veld | Waarde |
|------|--------|
| Prioriteit | P0 |
| Component | Server |

**Stappen**
1. Voer `npm install && npm start` uit.
2. Controleer console-output.

**Verwacht**
- Server luistert op poort 3100 zonder crash.
- URLs voor control, render en API worden gelogd.

---

### TC-002 — Control-pagina laadt
| Veld | Waarde |
|------|--------|
| Prioriteit | P0 |
| Component | Control |

**Stappen**
1. Open `GET http://localhost:3100/control`.

**Verwacht**
- HTTP 200.
- HTML bevat `#graphics-list`, `#style-form`, `#copy-render-url`.
- Socket.io client script geladen.

---

### TC-003 — Render-pagina laadt
| Veld | Waarde |
|------|--------|
| Prioriteit | P0 |
| Component | Render |

**Stappen**
1. Open `GET http://localhost:3100/render`.

**Verwacht**
- HTTP 200.
- `#stage` aanwezig.
- Theme + render CSS geladen.

---

### TC-004 — API state endpoint
| Veld | Waarde |
|------|--------|
| Prioriteit | P0 |
| Component | API |

**Stappen**
1. `curl http://localhost:3100/api/state`

**Verwacht**
- HTTP 200, `Content-Type: application/json`.
- Body bevat `version`, `theme`, `colors`, `settings`, `graphics[]` (6 items in demo-show).

---

### TC-005 — Transparante render-achtergrond
| Veld | Waarde |
|------|--------|
| Prioriteit | P0 |
| Component | Render |

**Stappen**
1. Open render-pagina.
2. Inspecteer `document.body` computed `background-color`.

**Verwacht**
- `canvasBackground` = `transparent` in state.
- Body-achtergrond is transparant (`rgba(0, 0, 0, 0)`).

---

## 2. Functional — Control UI (P0)

### TC-010 — Alle graphics zichtbaar in control
| Veld | Waarde |
|------|--------|
| Prioriteit | P0 |
| Component | Control |

**Stappen**
1. Open control, wacht op state-load.

**Verwacht**
- 6 graphic-cards: lowerThird, message, ticker, clock, countdown, image.

---

### TC-011 — Toggle graphic aan/uit via control
| Veld | Waarde |
|------|--------|
| Prioriteit | P0 |
| Component | Control |

**Stappen**
1. Klik "Aan" op eerste graphic (Host Lower Third).
2. Controleer knoptekst en card-state.

**Verwacht**
- Knop wordt "Uit".
- Card krijgt `is-live` class.

---

### TC-012 — Live-status visueel onderscheidbaar
| Veld | Waarde |
|------|--------|
| Prioriteit | P0 |
| Component | Control |

**Stappen**
1. Zet één graphic live, laat anderen uit.

**Verwacht**
- Alleen live card heeft `is-live` styling (border/glow per `control.css`).

---

### TC-013 — Styling wijzigingen sync naar render
| Veld | Waarde |
|------|--------|
| Prioriteit | P0 |
| Component | Control / Render |

**Stappen**
1. Open control + render in twee tabs.
2. PATCH primary kleur en fontSize via API of style-form.

**Verwacht**
- Render CSS-variabelen `--primary` en `--font-size` updaten binnen 500 ms.

---

### TC-014 — Kopieer render URL
| Veld | Waarde |
|------|--------|
| Prioriteit | P0 |
| Component | Control |

**Stappen**
1. Klik "Kopieer render URL".
2. Plak uit klembord.

**Verwacht**
- URL = `http://localhost:3100/render` (of huidige origin + `/render`).
- Knoptekst tijdelijk "Gekopieerd!".

---

## 3. Functional — Render engine (P0)

### TC-020 — Lower third toont velden
| Veld | Waarde |
|------|--------|
| Prioriteit | P0 |
| Component | Render |

**Stappen**
1. Zet `lt-host` visible.
2. Inspecteer DOM.

**Verwacht**
- `.name` = "Jan de Vries".
- `.meta` bevat title en company.

---

### TC-021 — Message toont tekst
| Veld | Waarde |
|------|--------|
| Prioriteit | P0 |
| Component | Render |

**Stappen**
1. Zet `msg-break` visible.

**Verwacht**
- `.graphic--message .text` = "We zijn zo terug".

---

### TC-022 — Ticker scrollt
| Veld | Waarde |
|------|--------|
| Prioriteit | P0 |
| Component | Render |

**Stappen**
1. Zet `ticker-news` visible.
2. Observeer `.track` transform gedurende 3 seconden.

**Verwacht**
- `translateX` waarde verandert (scroll-animatie actief).

---

### TC-023 — Clock tikt elke seconde
| Veld | Waarde |
|------|--------|
| Prioriteit | P0 |
| Component | Render |

**Stappen**
1. Zet `clock-live` visible.
2. Noteer tijd, wacht 2 seconden.

**Verwacht**
- `.time` tekst update minstens één keer per seconde.
- Formaat 24H: `HH:MM`.

---

### TC-024 — Countdown telt af
| Veld | Waarde |
|------|--------|
| Prioriteit | P0 |
| Component | Render |

**Stappen**
1. Zet `countdown-main` visible met `seconds: 10`, `running: true`.
2. Wacht 3 seconden.

**Verwacht**
- Weergave daalt (bijv. `00:10` → `00:07`).

---

### TC-025 — Image met src
| Veld | Waarde |
|------|--------|
| Prioriteit | P0 |
| Component | Render |

**Stappen**
1. PATCH `logo-event` met geldige `data.src` URL.
2. Zet visible.

**Verwacht**
- `<img>` element zichtbaar met correcte `src` en `alt`.

---

### TC-026 — Image zonder src
| Veld | Waarde |
|------|--------|
| Prioriteit | P0 |
| Component | Render |

**Stappen**
1. Zet `logo-event` visible met lege `data.src`.

**Verwacht**
- Geen lege graphic-layer op stage (geen zichtbaar placeholder-blok).

---

### TC-027 — Meerdere graphics tegelijk
| Veld | Waarde |
|------|--------|
| Prioriteit | P0 |
| Component | Render |

**Stappen**
1. Zet lt-host, msg-break, ticker-news, clock-live tegelijk visible via API.

**Verwacht**
- 4 `.graphic-layer` elementen op stage, elk op juiste positie.

---

### TC-028 — Hide-animatie
| Veld | Waarde |
|------|--------|
| Prioriteit | P0 |
| Component | Render |

**Stappen**
1. Zet graphic visible, daarna hide via toggle.
2. Inspecteer DOM binnen 50 ms na hide.

**Verwacht**
- `.graphic` krijgt `is-leaving` class.
- Layer verwijderd na ~250 ms.

---

## 4. API (P1)

### TC-030 — GET /api/graphics
**Verwacht:** Array van 6 graphics.

### TC-031 — GET /api/graphics/:id
**Verwacht:** Enkel graphic-object; 404 + `{ error }` bij onbekend ID.

### TC-032 — POST /api/graphics/:id/toggle met body
```bash
curl -X POST http://localhost:3100/api/graphics/lt-host/toggle \
  -H "Content-Type: application/json" \
  -d '{"visible": true}'
```
**Verwacht:** `visible: true` in response en state.

### TC-033 — POST toggle zonder body (flip)
**Verwacht:** Visibility wisselt naar tegenovergestelde waarde.

### TC-034 — PATCH /api/state
```bash
curl -X PATCH http://localhost:3100/api/state \
  -H "Content-Type: application/json" \
  -d '{"settings": {"fontSize": 3}}'
```
**Verwacht:** `settings.fontSize` = 3 in response en `show.json`.

### TC-035 — PATCH /api/graphics/:id data
**Verwacht:** Graphic `data` velden mergen zonder andere velden te verliezen.

---

## 5. Real-time sync (P0)

### TC-040 — Control → render sync
| Veld | Waarde |
|------|--------|
| Prioriteit | P0 |
| Component | Socket.io |

**Stappen**
1. Open control + render.
2. Toggle in control.
3. Meet tijd tot `stateChanged` op render.

**Verwacht**
- Render update < 500 ms.

---

### TC-041 — API toggle → beide clients
| Veld | Waarde |
|------|--------|
| Prioriteit | P0 |
| Component | Socket.io |

**Stappen**
1. Open control + render.
2. Toggle via `curl POST .../toggle`.

**Verwacht**
- Beide tabs reflecteren nieuwe visibility via `stateChanged`.

---

## 6. OBS workflow (P1)

### TC-050 — Browser Source render URL
**Verwacht:** Render URL laadt in OBS Browser Source (1920×1080), transparante achtergrond.

### TC-051 — Graphics over video
**Verwacht:** Lower third en ticker leesbaar over testbeeld/video.

---

## 7. Persistence (P1)

### TC-060 — State naar show.json
**Stappen:** Toggle graphic via API, lees `data/show.json`.  
**Verwacht:** `visible` veld overeenkomstig in bestand.

### TC-061 — State overleeft restart
**Stappen:** Wijzig state, stop server, start opnieuw, GET state.  
**Verwacht:** Zelfde visibility en settings als vóór restart.

---

## 8. Companion (P2)

### TC-070 — Module beschikbaar
**Verwacht:** `companion/` module geïnstalleerd in Companion.

### TC-071 — Socket.io toggleGraphic
**Verwacht:** `toggleGraphic` event zet graphic visibility; ack retourneert graphic.

### TC-072 — stateChanged feedback
**Verwacht:** Companion preset feedback toont actieve status per graphic.

### TC-073 — REST fallback
**Verwacht:** `POST /api/graphics/:id/toggle` werkt als fallback zonder Socket.io.

---

## 9. Edge cases (P2)

### TC-080 — Snel togglen (10×)
**Verwacht:** Geen crash; eindstate consistent (even toggles = origineel).

### TC-081 — Lege ticker items
**Verwacht:** Geen crash; lege track of geen zichtbare items.

### TC-082 — Countdown op 0
**Verwacht:** Toont `00:00`, geen negatieve waarden.

### TC-083 — Ongeldige graphic ID
**Verwacht:** HTTP 404, `{ "error": "Graphic not found" }`.

### TC-084 — Twee control-tabs tegelijk
**Verwacht:** Beide tabs blijven gesynchroniseerd bij toggles.

---

## Testdata (demo show)

| ID | Type | Standaard visible |
|----|------|-------------------|
| lt-host | lowerThird | false |
| msg-break | message | false |
| ticker-news | ticker | false |
| clock-live | clock | false |
| countdown-main | countdown | false |
| logo-event | image | false (lege src) |

## 10. Multi-project system (P0 — v0.2.0)

> Gedetailleerde stappen en edge cases: `PROJECT-TESTS.md`

### TC-100 — GET /api/projects lijst
| Veld | Waarde |
|------|--------|
| Prioriteit | P0 |
| Component | API / Projects |

**Stappen**
1. `GET http://localhost:2014/api/projects`

**Verwacht**
- HTTP 200, JSON met `projects` array en `activeProjectId`.
- Minstens één project met `id: "blank"`.
- `activeProjectId` is `"blank"` bij fresh install.

```bash
curl -s http://localhost:2014/api/projects | jq '{activeProjectId, count: (.projects|length), ids: [.projects[].id]}'
```

---

### TC-101 — POST /api/projects aanmaken
| Veld | Waarde |
|------|--------|
| Prioriteit | P0 |
| Component | API / Projects |

**Stappen**
1. `POST /api/projects` met `{"name":"QA Test Show"}`.

**Verwacht**
- HTTP 201 (of 200).
- Response bevat nieuw project met unieke `id`, `name`, `createdAt`.
- `data/projects/{id}/project.json` aangemaakt (kopie van template of leeg project).
- `data/registry.json` bevat nieuw project.

```bash
curl -s -X POST http://localhost:2014/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"QA Test Show"}'
```

---

### TC-102 — POST /api/projects/:id/activate wisselt state
| Veld | Waarde |
|------|--------|
| Prioriteit | P0 |
| Component | API / Projects |

**Stappen**
1. Maak project A en B aan (of gebruik `blank` + nieuw project).
2. Toggle graphic in project A via API.
3. `POST /api/projects/B/activate`.
4. `GET /api/state` — graphics/settings van B.
5. `POST /api/projects/A/activate` — state van A hersteld.

**Verwacht**
- HTTP 200 bij activate.
- `GET /api/state` reflecteert graphics van geactiveerd project.
- `registry.json` → `activeProjectId` bijgewerkt.
- Socket.io `stateChanged` naar alle clients.

```bash
curl -s -X POST http://localhost:2014/api/projects/blank/activate
curl -s http://localhost:2014/api/state | jq '.graphics | length'
```

---

### TC-103 — State-isolatie tussen projecten
| Veld | Waarde |
|------|--------|
| Prioriteit | P0 |
| Component | Persistence |

**Stappen**
1. Activeer project A, zet `score-main` visible=true, homeScore=5.
2. Activeer project B, controleer dat score-main andere waarden heeft.
3. Activeer A opnieuw — homeScore=5 en visible=true.

**Verwacht**
- Wijzigingen in A niet zichtbaar in B en vice versa.

---

### TC-104 — Persist naar data/projects/{id}/project.json
| Veld | Waarde |
|------|--------|
| Prioriteit | P0 |
| Component | Persistence |

**Stappen**
1. Activeer project `blank`.
2. `PATCH /api/graphics/score-main` met `{"data":{"homeScore":7}}`.
3. Lees `data/projects/blank/project.json` van schijf.

**Verwacht**
- `project.json` bevat `homeScore: 7` (niet alleen `show.json`).
- `updatedAt` in registry bijgewerkt.

---

### TC-105 — GET /api/projects/:id/export (zip)
| Veld | Waarde |
|------|--------|
| Prioriteit | P0 |
| Component | API / Export |

**Stappen**
1. `GET /api/projects/blank/export`.

**Verwacht**
- HTTP 200.
- `Content-Type: application/zip` (of `application/octet-stream`).
- `Content-Disposition: attachment; filename="..."`.
- Zip bevat `project.json` en eventuele assets uit `data/projects/blank/assets/`.

```bash
curl -s -D - -o /tmp/blank-export.zip http://localhost:2014/api/projects/blank/export
file /tmp/blank-export.zip   # verwacht: Zip archive
```

---

### TC-106 — POST /api/projects/import herstelt project
| Veld | Waarde |
|------|--------|
| Prioriteit | P0 |
| Component | API / Import |

**Stappen**
1. Export project via TC-105.
2. Verwijder testproject of importeer onder nieuwe naam.
3. `POST /api/projects/import` met multipart `file` = zip.

**Verwacht**
- HTTP 200/201 met nieuw of hersteld project in response.
- `data/projects/{id}/` bevat `project.json` + assets.
- Graphics uit import beschikbaar na activate.

```bash
curl -s -X POST http://localhost:2014/api/projects/import \
  -F "file=@/tmp/blank-export.zip"
```

---

### TC-107 — Import ongeldige zip
**Verwacht:** HTTP 400 met `{ "error": "..." }`, geen corrupt registry.

---

### TC-108 — Activate onbekend project-ID
**Verwacht:** HTTP 404, state ongewijzigd.

---

### TC-109 — PATCH composedScore elements (WYSIWYG data)
| Veld | Waarde |
|------|--------|
| Prioriteit | P0 |
| Component | API / Graphics |

**Stappen**
1. Activeer project met `composedScore` graphic (`score-main`).
2. Patch element-posities en scores.

```bash
curl -s -X PATCH http://localhost:2014/api/graphics/score-main \
  -H "Content-Type: application/json" \
  -d '{"data":{"homeScore":2,"awayScore":1,"elements":{"homeScore":{"x":25,"y":40,"fontSize":36}}}}'
```

**Verwacht**
- HTTP 200; `data.elements.homeScore` gemerged (deep merge).
- `data.homeScore` en `data.awayScore` bijgewerkt.
- Wijziging in actief `project.json` (niet legacy `show.json`).

---

### TC-110 — Registry sync na create/delete
**Verwacht:** `data/registry.json` consistent met `data/projects/` directories.

---

### TC-111 — WYSIWYG editor UI (manual)
| Veld | Waarde |
|------|--------|
| Prioriteit | P1 |
| Component | Control / Editor |

**Stappen**
1. Open control, selecteer composedScore graphic.
2. Open WYSIWYG editor, sleep element, sla op.

**Verwacht**
- Element-posities visueel en in API-state gelijk.
- Export bevat gewijzigde `elements` map.

---

### TC-112 — Server restart behoudt actief project
**Stappen:** Activeer niet-default project, restart server, GET state.  
**Verwacht:** Zelfde `activeProjectId` en graphics als vóór restart.

---

## Uitvoering

Resultaten MVP-run 2026-06-09 staan in `TEST-RESULTS.md`.  
Project-suite run 2026-06-09: zie `TEST-RESULTS.md` § Project system.  
Gedetailleerde project-cases: `PROJECT-TESTS.md`.  
Bekende defects in `BUGS.md`.  
Companion- en project-blockers in `BLOCKERS.md`.
