# ProVerlay — Test Results

## Run: 2026-06-09 (Beta Tester agent)

| Veld | Waarde |
|------|--------|
| Versie | 0.1.0 |
| Tester | Beta Tester agent |
| Omgeving | macOS darwin 25.0.0, Node v18.18.0 |
| Server | http://localhost:3100 |
| Methoden | curl, Python JSON parse, browser CDP, DOM inspectie |

### Samenvatting

| Categorie | Pass | Fail | Blocked | Manual |
|-----------|------|------|---------|--------|
| Smoke (P0) | 5 | 0 | 0 | 0 |
| Control UI (P0) | 3 | 0 | 0 | 1 |
| Render engine (P0) | 5 | 1 | 0 | 2 |
| API (P1) | 6 | 0 | 0 | 0 |
| Real-time sync (P0) | 2 | 0 | 0 | 0 |
| Persistence (P1) | 2 | 0 | 0 | 0 |
| OBS (P1) | 0 | 0 | 0 | 2 |
| Companion (P2) | 0 | 0 | 4 | 0 |
| Edge cases (P2) | 4 | 0 | 0 | 1 |
| **Totaal** | **27** | **1** | **4** | **6** |

**Geautomatiseerde score:** 27 passed, 1 failed, 4 blocked (38 uitvoerbare cases)  
**Pass rate (excl. blocked/manual):** 27/28 = **96.4%**

---

## Gedetailleerde resultaten

### 1. Smoke tests (P0)

| ID | Test | Result | Opmerking |
|----|------|--------|-----------|
| TC-001 | Server start | **Pass** | Server draait op :3100; herstart na kill OK |
| TC-002 | /control laadt | **Pass** | HTTP 200 |
| TC-003 | /render laadt | **Pass** | HTTP 200 |
| TC-004 | GET /api/state | **Pass** | Geldig JSON, 6 graphics |
| TC-005 | Transparante achtergrond | **Pass** | `rgba(0, 0, 0, 0)` op body |

### 2. Control UI (P0)

| ID | Test | Result | Opmerking |
|----|------|--------|-----------|
| TC-010 | 6 graphics in lijst | **Pass** | Alle types aanwezig |
| TC-011 | Toggle via control | **Pass** | "Aan" → "Uit", graphic live |
| TC-012 | Live-status visueel | **Pass** | `is-live` class op actieve card |
| TC-013 | Styling sync | **Pass** | `--primary`, `--font-size` op render |
| TC-014 | Kopieer render URL | **Manual** | Clipboard niet geautomatiseerd (browser-permissie) |

### 3. Render engine (P0)

| ID | Test | Result | Opmerking |
|----|------|--------|-----------|
| TC-020 | Lower third | **Pass** | name + meta correct |
| TC-021 | Message | **Pass** | Via multi-graphic API-test |
| TC-022 | Ticker scrollt | **Manual** | Layer mount OK; animatie niet 3s geobserveerd |
| TC-023 | Clock tikt | **Manual** | Layer mount OK; 2s interval niet gemeten |
| TC-024 | Countdown | **Pass** | API edge case seconds=0 OK |
| TC-025 | Image met src | **Manual** | Demo `src` is leeg; geen testbeeld |
| TC-026 | Image zonder src | **Fail** | Lege layer op stage → QA-001 |
| TC-027 | Multi-graphic | **Pass** | 4 layers tegelijk |
| TC-028 | Hide animatie | **Pass** | `is-leaving` binnen 50 ms |

### 4. API (P1)

| ID | Test | Result | Opmerking |
|----|------|--------|-----------|
| TC-030 | GET /api/graphics | **Pass** | 6 items |
| TC-031 | GET /api/graphics/:id | **Pass** | 404 op invalid-id |
| TC-032 | POST toggle set | **Pass** | `visible: true` |
| TC-033 | POST toggle flip | **Pass** | Zonder body wisselt state |
| TC-034 | PATCH /api/state | **Pass** | fontSize 3 → teruggezet |
| TC-035 | PATCH graphic data | **Pass** | name merge OK |

### 5. Real-time sync (P0)

| ID | Test | Result | Opmerking |
|----|------|--------|-----------|
| TC-040 | Control → render | **Pass** | stateChanged ~6 ms |
| TC-041 | API → clients | **Pass** | Control + render updaten |

### 6. OBS workflow (P1)

| ID | Test | Result | Opmerking |
|----|------|--------|-----------|
| TC-050 | Browser Source | **Manual** | Vereist OBS installatie |
| TC-051 | Over video | **Manual** | Vereist OBS + testbeeld |

### 7. Persistence (P1)

| ID | Test | Result | Opmerking |
|----|------|--------|-----------|
| TC-060 | show.json write | **Pass** | visible=true direct in bestand |
| TC-061 | Server restart | **Pass** | lt-host visible=true na herstart |

### 8. Companion (P2)

| ID | Test | Result | Opmerking |
|----|------|--------|-----------|
| TC-070 | Module | **Blocked** | `companion/` ontbreekt |
| TC-071 | toggleGraphic | **Blocked** | Zie BLOCKERS.md |
| TC-072 | Feedback | **Blocked** | — |
| TC-073 | REST fallback | **Blocked** | API werkt; Companion-integratie niet testbaar |

### 9. Edge cases (P2)

| ID | Test | Result | Opmerking |
|----|------|--------|-----------|
| TC-080 | 10× rapid toggle | **Pass** | Geen crash; eindstate even=true |
| TC-081 | Lege ticker | **Pass** | `items: []` geaccepteerd |
| TC-082 | Countdown 0 | **Pass** | seconds=0 via API |
| TC-083 | Invalid ID 404 | **Pass** | `{ error: "Graphic not found" }` |
| TC-084 | Twee control tabs | **Manual** | Niet in deze run |

---

## Commando-log (representatief)

```bash
# Smoke
curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/control   # 200
curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/render    # 200
curl -s http://localhost:3100/api/state | jq .version                   # 1

# Toggle
curl -X POST http://localhost:3100/api/graphics/lt-host/toggle \
  -H "Content-Type: application/json" -d '{"visible": true}'

# 404
curl -s http://localhost:3100/api/graphics/invalid-id  # {"error":"Graphic not found"}

# Persistence
# lt-host visible=true in data/show.json → kill server → restart → still true
```

---

## Volgende run

- [ ] OBS smoke (TC-050, TC-051)
- [ ] Clipboard test TC-014 in Chrome/Safari
- [ ] Ticker/clock visuele observatie (TC-022, TC-023)
- [ ] Image met echte src (TC-025)
- [ ] Companion suite na module-levering (TC-070–073)
- [ ] Retest QA-001 na fix

---

## Run: 2026-06-09 — Project system (Beta Tester agent)

| Veld | Waarde |
|------|--------|
| Versie | 0.2.0-draft (multi-project) |
| Tester | Beta Tester agent |
| Omgeving | macOS darwin 25.0.0, Node v18.18.0 |
| Server | http://localhost:2014 |
| Methoden | curl, filesystem inspect (`registry.json`, `project.json`, `show.json`) |
| Detailcases | `PROJECT-TESTS.md` |

### Samenvatting

| Categorie | Pass | Fail | Partial | Blocked | Manual |
|-----------|------|------|---------|---------|--------|
| Project API (P0) | 0 | 6 | 0 | 0 | 0 |
| Project persistence (P0) | 0 | 1 | 0 | 0 | 0 |
| composedScore PATCH (P0) | 0 | 0 | 1 | 0 | 0 |
| Registry / filesystem (P1) | 1 | 0 | 0 | 0 | 0 |
| WYSIWYG editor (P1) | 0 | 0 | 0 | 0 | 1 |
| Restart persistence (P0) | 0 | 0 | 0 | 1 | 0 |
| **Totaal** | **1** | **7** | **1** | **1** | **1** |

**Geautomatiseerde score (project suite):** 1 pass, 7 fail, 1 partial, 1 blocked  
**Pass rate (excl. blocked/manual/partial):** 1/8 = **12.5%**  
**Besluit:** **No-Go** voor project system — BLK-003

### Gedetailleerde resultaten

| ID | Test | Result | Opmerking |
|----|------|--------|-----------|
| TC-100 | GET /api/projects | **Fail** | HTTP 404 `Cannot GET /api/projects` → QA-003 |
| TC-101 | POST /api/projects | **Fail** | HTTP 404 `Cannot POST /api/projects` |
| TC-102 | POST activate blank | **Fail** | HTTP 404; state blijft `show.json` (4 graphics, footballScore) |
| TC-103 | State isolation | **Fail** | Kan niet testen zonder create/activate API |
| TC-104 | Persist project.json | **Fail** | PATCH schrijft `show.json`; `project.json` ongewijzigd → QA-004 |
| TC-105 | Export zip | **Fail** | HTTP 404; response is HTML, geen zip |
| TC-106 | Import zip | **Fail** | HTTP 404 `Cannot POST /api/projects/import` |
| TC-107 | Import invalid | **Blocked** | Endpoint ontbreekt |
| TC-108 | Activate unknown ID | **Blocked** | Endpoint ontbreekt |
| TC-109 | PATCH composedScore elements | **Partial** | PATCH 200 + deep merge `elements` op legacy `footballScore` in `show.json`; composedScore template niet geladen |
| TC-110 | Registry consistency | **Pass** | `registry.json` + `data/projects/blank/` consistent (1 project) |
| TC-111 | WYSIWYG editor UI | **Manual** | Editor niet getest; afhankelijk van project API + UI |
| TC-112 | Restart active project | **Blocked** | Activate API ontbreekt |

### Commando-log (project run)

```bash
# TC-100 — list projects (FAIL 404)
curl -s -w "\nHTTP:%{http_code}\n" http://localhost:2014/api/projects

# TC-101 — create (FAIL 404)
curl -s -X POST http://localhost:2014/api/projects \
  -H "Content-Type: application/json" \
  -d '{"name":"QA Test Show"}'

# TC-102 — activate (FAIL 404)
curl -s -X POST http://localhost:2014/api/projects/blank/activate

# TC-103 — state na activate (legacy show.json)
curl -s http://localhost:2014/api/state | jq '[.graphics[].type]'
# Output: ["footballScore","lowerThird","message","clock"]

# TC-105 — export (FAIL 404, HTML body)
curl -s -D - -o /tmp/blank-export.zip http://localhost:2014/api/projects/blank/export
file /tmp/blank-export.zip   # HTML document

# TC-106 — import (FAIL 404)
curl -s -X POST http://localhost:2014/api/projects/import \
  -F "file=@/tmp/blank-export.zip"

# TC-109 — PATCH elements (partial — show.json only)
curl -s -X PATCH http://localhost:2014/api/graphics/score-main \
  -H "Content-Type: application/json" \
  -d '{"data":{"homeScore":3,"elements":{"homeScore":{"x":25,"y":40,"fontSize":36}}}}'
# HTTP 200; type footballScore; elements merged in show.json

# Filesystem check TC-104
# show.json homeScore: 3
# project.json homeScore: 0 (unchanged)
```

### Smoke (basis server — nog OK)

| Check | Result |
|-------|--------|
| Server start :2014 | **Pass** |
| GET /api/state | **Pass** (legacy state) |
| GET /control | **Pass** HTTP 200 |

### Volgende run (project)

- [ ] Her-test TC-100–112 na BLK-003 unblock (Lead: project API)
- [ ] Verifieer composedScore render na activate blank
- [ ] Export/import round-trip met assets
- [ ] WYSIWYG editor manual (TC-111)
- [ ] Retest QA-003, QA-004 na fix

---

## Run: 2026-06-09 — Recent changes (Beta Tester agent)

| Veld | Waarde |
|------|--------|
| Versie | 0.2.0-draft |
| Tester | Beta Tester agent |
| Omgeving | macOS darwin 25.0.0, Node v18.18.0 |
| Server | http://127.0.0.1:2014 |
| Scope | Live clock (`match-utils.js`), widget panel `/control`, operator zoom fix, penalty UI, `GET /api/projects/:id/assets` |
| Methoden | curl, Node ESM unit checks, HTML/CSS file review, filesystem (`project.json`) |

### Samenvatting

| Feature | Result | Opmerking |
|---------|--------|-----------|
| Live running clock (`resolveLiveClock` + `runningSince`) | **Pass** | +3s delta correct; operator/render tickers aanwezig |
| Widget controls panel `/control` | **Partial** | HTML + PATCH widgets OK; stale form bij running clock → QA-006 |
| Operator double-tap zoom (viewport, `touch-action`) | **Pass** | `user-scalable=no`, `touch-action: manipulation` op root + `.touch-btn` |
| Penalty UI zonder instructietekst | **Pass** | Geen `penalty-hint` in operator HTML; alleen knoppen |
| `GET /api/projects/:id/assets` | **Fail** | HTTP 500 `assetsDir is not defined` → QA-005 |
| Project API (retest QA-003) | **Pass** | GET/POST/activate/export 200 |
| Project persistence (retest QA-004) | **Pass** | PATCH schrijft naar `data/projects/blank/project.json` |

| Categorie | Pass | Fail | Partial | Manual |
|-----------|------|------|---------|--------|
| Live clock | 4 | 0 | 0 | 0 |
| Widget panel | 3 | 0 | 1 | 0 |
| Operator UX | 3 | 0 | 0 | 1 |
| Assets API | 1 | 1 | 0 | 0 |
| Regression (project system) | 3 | 0 | 0 | 0 |
| **Totaal** | **14** | **1** | **1** | **1** |

**Geautomatiseerde score:** 14 pass, 1 fail, 1 partial  
**Besluit:** **Conditional Go** — kernklok en operator OK; assets-lijst en control save-while-running blokkeren design-panel en riskante live workflow.

### Gedetailleerde resultaten

| ID | Test | Result | Opmerking |
|----|------|--------|-----------|
| TC-200 | `resolveLiveClock` unit (+5s elapsed) | **Pass** | `match-utils.js` |
| TC-201 | `running` zonder `runningSince` valt terug op base | **Pass** | Geen drift |
| TC-202 | API PATCH start klok + 3s delta | **Pass** | Stored base + `runningSince`; resolved +3s |
| TC-203 | `startRunningClock` / `freezeClock` helpers | **Pass** | `runningSince` ISO string |
| TC-204 | Render `tickMatchClocks` interval | **Pass** | Code review `render.js` |
| TC-205 | Operator `tickLiveClocks` interval | **Pass** | Code review `operator.js` |
| TC-210 | Widget panel HTML (`#widget-panel`, klokknoppen) | **Pass** | `/control` HTTP 200 |
| TC-211 | PATCH widget visibility (`clock: false`) | **Pass** | `resolveBindText('clock')` → `''` |
| TC-212 | Widget opslaan tijdens running klok | **Partial** | Stale form + `runningSince` reset → QA-006 |
| TC-220 | Operator viewport `maximum-scale=1, user-scalable=no` | **Pass** | `operator/index.html` |
| TC-221 | `touch-action: manipulation` | **Pass** | `operator.css` html/body/`.touch-btn` |
| TC-222 | Double-tap zoom op device | **Manual** | Vereist fysiek iPad/iPhone |
| TC-230 | Penalty sectie zonder hint-tekst | **Pass** | Geen `.penalty-hint` in DOM |
| TC-231 | Penalty knoppen (goal/mis per team) | **Pass** | Template zonder instructieregel |
| TC-240 | GET `/api/projects/blank/assets` | **Fail** | HTTP 500 → QA-005 |
| TC-241 | POST `/api/projects/blank/assets` | **Pass** | Upload OK; static URL 200 |
| TC-242 | Design panel `loadDesignAssets` | **Fail** | Afhankelijk van GET → error state |
| TC-250 | GET `/api/projects` (QA-003 retest) | **Pass** | HTTP 200 |
| TC-251 | PATCH persist `project.json` (QA-004 retest) | **Pass** | `homeScore`/`clock` in blank project |
| TC-252 | Export active project zip | **Pass** | HTTP 200, geldig zip |

### Commando-log (recent changes run)

```bash
# Live clock unit
node --input-type=module -e "import { resolveLiveClock } from './public/shared/match-utils.js'; ..."

# Clock API +3s
curl -X PATCH http://127.0.0.1:2014/api/graphics/score-main \
  -H "Content-Type: application/json" \
  -d '{"data":{"clock":{"minute":0,"second":0,"running":true,"runningSince":"..."}}}'

# Assets GET (FAIL)
curl -s -w "\nHTTP:%{http_code}\n" http://127.0.0.1:2014/api/projects/blank/assets
# {"error":"assetsDir is not defined"} HTTP:500

# Assets POST (PASS)
curl -X POST http://127.0.0.1:2014/api/projects/blank/assets -F "file=@qa-test.png"

# Widget visibility
curl -X PATCH http://127.0.0.1:2014/api/graphics/score-main \
  -H "Content-Type: application/json" \
  -d '{"data":{"widgets":{"clock":false}}}'

# Project regression
curl -s http://127.0.0.1:2014/api/projects        # 200
# data/projects/blank/project.json updated after PATCH
```

### Nieuwe bugs

| ID | Severity | Samenvatting |
|----|----------|--------------|
| QA-005 | High | `assetsDir` niet geïmporteerd → GET assets 500 |
| QA-006 | Medium | Control widget-opslaan spoelt live klok terug |
| QA-007 | Low | Operator minuut/seconde inputs niet live |

### Volgende run

- [ ] Retest TC-240/242 na QA-005 fix (import `assetsDir`)
- [ ] Retest TC-212 na control live-ticker of `freezeClock` vóór save
- [ ] Manual double-tap zoom op iPad (TC-222)
- [ ] Retest QA-003/QA-004 als closed (fixed in deze build)

---

## Run: 2026-06-10 — Dashboard / operator / editor / project (Beta Tester agent)

| Veld | Waarde |
|------|--------|
| Versie | 0.2.0-draft |
| Tester | Beta Tester agent |
| Omgeving | macOS darwin 25.0.0, Node v18.18.0 |
| Server | http://localhost:2014 (`node server/index.js`) |
| Scope | Per-widget render URLs, project canvas 1920×1080, single inspector panel, widget add/remove, editor project fonts |
| Methoden | curl, Node `--check`, browser CDP, DOM inspectie |

### Samenvatting

| Feature | Result | Opmerking |
|---------|--------|-----------|
| Smoke — pagina's HTTP 200 | **Pass** | `/control`, `/operator`, `/editor`, `/project`, `/render`, `/render?graphic=score-main` |
| JS syntax (`control`, `operator`, `editor`, `project`) | **Pass** | `node --check` zonder errors |
| API `GET /api/state` | **Pass** | odido project, 3 graphics, canvas 1920×1080 |
| API `POST /api/projects/odido/activate` | **Pass** | HTTP 200, composedScore state geladen |
| Per-widget render URL (`?graphic=id`) | **Pass** | Geïsoleerd: 1 layer (`score-main`); combined `/render`: 2 layers |
| Per-overlay Render URL knop (control) | **Pass** | `renderUrl(graphic.id)` op kaart-knop (code + title) |
| Project canvas 1920×1080 settings | **Pass** | `/project` toont 1920×1080; PATCH persist naar `project.json` |
| Overlay selectie → single inspector | **Pass** | Leeg: `#inspector-empty`; score geselecteerd: alleen `#widget-panel` |
| Widget add/remove | **Pass** | `POST /api/graphics` 201; `DELETE /api/graphics/:id` 200 |
| Editor fonts uit project assets | **Pass** | Dropdown: Klant branding, OtypicalHeadline Bold, OtypicalText Regular |
| GET assets (QA-005 retest) | **Pass** | HTTP 200, 5 assets incl. 2 fonts |
| Control live klok in widget-form (QA-006 retest) | **Pass** | `tickWidgetClockFields` — minuut/seconde 40/34 bij lopende klok |

| Categorie | Pass | Fail | Manual |
|-----------|------|------|--------|
| Smoke & syntax | 7 | 0 | 0 |
| API | 4 | 0 | 0 |
| Per-widget render | 3 | 0 | 0 |
| Canvas / project | 3 | 0 | 0 |
| Inspector UX | 2 | 0 | 0 |
| Widget CRUD | 2 | 0 | 0 |
| Editor fonts | 2 | 0 | 0 |
| Regression retests | 2 | 0 | 0 |
| **Totaal** | **25** | **0** | **0** |

**Geautomatiseerde score:** 25 pass, 0 fail  
**Besluit:** **Pass** — recente dashboard/operator/editor/project features werken; geen nieuwe defects in scope.

**Open critical bugs (deze run):** **0**  
**Nieuwe bugs gelogd:** geen

### Gedetailleerde resultaten

| ID | Test | Result | Opmerking |
|----|------|--------|-----------|
| TC-300 | HTTP 200 alle pagina's | **Pass** | control, operator, editor, project, render, render?graphic=score-main |
| TC-301 | `node --check` client JS | **Pass** | control.js, operator.js, editor.js, project.js |
| TC-302 | GET /api/state | **Pass** | `projectId: odido`, canvas 1920×1080 |
| TC-303 | POST activate odido | **Pass** | matchScoreboard + customTicker + streamCountdown |
| TC-310 | Render isolate `?graphic=score-main` | **Pass** | 1 layer, id `score-main` (CDP) |
| TC-311 | Combined `/render` | **Pass** | 2 layers: score-main + ticker-main (beide visible) |
| TC-312 | Control per-card Render URL | **Pass** | `renderUrl()` in control.js regel 301 |
| TC-320 | Project page canvas form | **Pass** | 1920×1080 voor ODIDO |
| TC-321 | PATCH canvas persist | **Pass** | 2560×1440 geschreven naar `data/projects/odido/project.json` |
| TC-322 | Editor canvas hint | **Pass** | "Project 1920×1080px" in UI |
| TC-330 | Inspector zonder selectie | **Pass** | `#inspector-empty` zichtbaar; type-panelen hidden |
| TC-331 | Inspector score geselecteerd | **Pass** | Alleen `#widget-panel` zichtbaar |
| TC-340 | POST widget aanmaken | **Pass** | message widget 201, daarna verwijderd |
| TC-341 | DELETE widget | **Pass** | Terug naar 3 graphics |
| TC-350 | Editor font dropdown | **Pass** | Assets fonts + klant branding |
| TC-351 | GET /api/projects/odido/assets | **Pass** | QA-005 fixed — geen 500 |
| TC-360 | QA-006 control klok-ticker | **Pass** | Live minuut/seconde in widget-form |

### Commando-log

```bash
# Smoke
/usr/bin/curl -s -o /dev/null -w "%{http_code}" http://localhost:2014/control          # 200
/usr/bin/curl -s -o /dev/null -w "%{http_code}" "http://localhost:2014/render?graphic=score-main"  # 200

# Activate
/usr/bin/curl -s -X POST http://localhost:2014/api/projects/odido/activate           # HTTP 200

# Widget CRUD
/usr/bin/curl -s -X POST http://localhost:2014/api/graphics \
  -H "Content-Type: application/json" -d '{"type":"message","name":"QA Test Message"}'  # 201
/usr/bin/curl -s -X DELETE http://localhost:2014/api/graphics/message-...           # 200

# Canvas persist
/usr/bin/curl -s -X PATCH http://localhost:2014/api/state \
  -H "Content-Type: application/json" \
  -d '{"settings":{"canvasWidth":2560,"canvasHeight":1440}}'
# data/projects/odido/project.json → 2560×1440 (hersteld naar 1920×1080 na test)

# Assets (QA-005 retest)
/usr/bin/curl -s http://localhost:2014/api/projects/odido/assets  # HTTP 200, 5 items

# JS syntax
node --check public/control/control.js public/operator/operator.js public/editor/editor.js
```

### Retest bekende bugs

| ID | Status | Opmerking |
|----|--------|-----------|
| QA-005 | **Fixed** | GET assets 200; editor font-lijst gevuld |
| QA-006 | **Fixed** | `tickWidgetClockFields` in control.js |
| QA-003/004 | **Fixed** (vorige run) | Project API + project.json persist |

### Volgende run

- [ ] Manual OBS per-widget browser sources (score + ticker apart)
- [ ] Widget add/remove via control UI (prompt/confirm flow)
- [ ] Retest QA-001 (image zonder src) indien image type terug in project templates

---

## Run: 2026-06-11 (Producer-scenario, StreamNL 2 — NED vs JAP)

| Veld | Waarde |
|------|--------|
| Versie | 0.2.x (na quiz/transities/ticker-fixes) |
| Scenario | Livestream producer, vMix + 2 cams, overlay = score + ticker |
| Omgeving | Verse installatie, geïsoleerde data-dir (`/tmp/proverlay-qa`), poort 2015 |
| Methoden | Operator/control UI via browser, API (curl), render-verificatie via screenshots + DOM |

### Producer-flow (gebaseerd op streamplan 14 juni, 22:00–00:45)

| Stap | Resultaat |
|------|-----------|
| Pre-stream: score NED/JAP 0-0 verborgen, countdown 22:00 live, ticker met 3 berichten, roster (Matthy/Russo/Sneijder) | ✅ Pass |
| Kickoff: Go live + Start clock via operator (2 taps) | ✅ Pass — feedback klopt (pill Live, knop → Pause) |
| Goal 27' (+1 NED), ticker-update | ✅ Pass |
| Mistik-beveiliging: score − vraagt confirm; cancel behoudt stand | ✅ Pass |
| 45+ blessuretijd (toont "45+1:27") | ✅ Pass |
| Rust → 2e helft (45:00, period switch) | ✅ Pass |
| Verlenging (extra_first, 90:00+) | ✅ Pass |
| Penalties: blok verschijnt automatisch bij periode Penalties; beurtwisseling, goal/miss/undo, dots in render | ✅ Pass |
| Lower third gast live tijdens shootout, ticker blijft draaien, 4 overlays tegelijk | ✅ Pass |
| Countdown verlopen + hideWhenExpired | ✅ Pass |
| Editor laadt zonder fouten | ✅ Pass |

### Break-testing

| Test | Resultaat |
|------|-----------|
| XSS in ticker-bericht, lower-third naam (`<img onerror>`, `<script>`) | ✅ Veilig — overal ge-escaped, niets uitgevoerd |
| Snel hide→show binnen uit-animatie | ❌ → **QA-P2, gefixt** (zie hieronder) |
| Project-switch terwijl overlays live | ❌ → **QA-P1, gefixt** (zie hieronder) |
| Widget verwijderen terwijl live | ✅ Layer verdwijnt netjes uit render |
| Actieve quizvraag verwijderen terwijl live | ✅ Overlay verdwijnt |
| Ticker leegmaken terwijl live | ⚠️ PNG-balk blijft staan zonder tekst (acceptabel, zie open punten) |
| Onbekend widget-type / lege naam via API | ✅ Nette 400 / fallback "New widget" |
| Dubbele snelle tap op score + | ⚠️ QA-P3 (open) — tweede tap verloren door read-modify-write race |
| Rare waarden via API (score −3, klok −5:999) | ⚠️ QA-P4 (open) — render toont ze letterlijk; UI beschermt wel |

### Gevonden & gefixt deze run

**QA-P1 (High, fixed): project-switch broadcast ontbrak.**
`reloadState()` riep `notify()` niet aan → render (OBS) bleef het oude project tonen na project activate/import tot de eerstvolgende state-wijziging. Fix: `notify()` in `server/state.js#reloadState`. Geverifieerd: render switcht nu direct mee.

**QA-P2 (High, fixed): overlay verdwijnt definitief bij snel hide→show.**
De geplande layer-verwijdering (na uit-animatie) executeerde ook als de graphic intussen weer zichtbaar was → overlay weg uit OBS tot volgende state-update. Fix: removal-timers per layer geannuleerd en laag herbouwd in `render.js#syncGraphics`. Geverifieerd met toggle binnen 120 ms.

### Open punten

| ID | Severity | Omschrijving |
|----|----------|--------------|
| QA-P3 | Medium | Twee snelle taps op score + binnen socket-roundtrip → één goal verloren (client read-modify-write). Aanbeveling: server-side increment endpoint. In de praktijk zeldzaam (dubbele tap is meestal per ongeluk). |
| QA-P4 | Low | API accepteert negatieve scores en out-of-range klokwaarden ("-5:999" in render). UI clamp werkt wel; server-side clamping aanbevolen. |
| QA-P5 | Low/UX | Widgets kunnen elkaar overlappen zonder waarschuwing (countdown + score beide top-center, tekst dwars door elkaar). Suggestie: positie-conflict tonen in dashboard. |
| QA-P6 | Low/UX | Countdown heeft geen operator-kaart; producer moet bij kickoff naar het dashboard om hem te verbergen. Suggestie: operator-flag of auto-hide bij score Go live. |
| QA-P7 | Cosmetisch | Quiz-kaart toont "answer revealed" terwijl widget verborgen is; reset `revealed` bij hide. |
| QA-P8 | Cosmetisch | Lege ticker laat lege PNG-balk in beeld; overwegen om bij 0 berichten de balk te verbergen. |

---

## Run: 11 juni 2026 — Design Brief + Visual Feedback (Beta Tester agent)

| Veld | Waarde |
|------|--------|
| Versie | 0.2.x |
| Tester | Beta Tester agent |
| Omgeving | macOS darwin 25.0.0, Node v18+ |
| Server | http://localhost:2014 (`npm start`, reeds actief) |
| Scope | Design Brief v1.0 routes/redirects, ticker `{ id, text, enabled }`, `operate-panel.css` op dashboard, `operate-handlers.js` wiring |
| Bronnen | `DESIGN-BRIEF-IMPLEMENTATION-STATUS.md`, `VISUAL-FEEDBACK-PASS.md` |
| Methoden | curl (HTTP + redirect), Node ESM unit checks, HTML/CSS/JS file review, API PATCH round-trip |

### Samenvatting

| Categorie | Pass | Fail | Partial | Manual |
|-----------|------|------|---------|--------|
| Route smoke (`/control`, `/operator`, `/operate/:id`) | 4 | 0 | 0 | 0 |
| Device redirect (`server/device.js`) | 6 | 0 | 0 | 0 |
| Ticker messages model (server + API) | 6 | 0 | 0 | 0 |
| operate-panel.css + operate-handlers wiring | 5 | 0 | 0 | 0 |
| Match operate handlers | 1 | 0 | 1 | 0 |
| Visual feedback regressie (code review) | 4 | 0 | 0 | 2 |
| **Totaal** | **26** | **0** | **1** | **2** |

**Geautomatiseerde score:** 26 pass, 0 fail, 1 partial  
**Besluit:** **Pass** — Design Brief foundation en visual-feedback fixes zijn aanwezig en reageren correct via HTTP/API; geen nieuwe defects in deze scope.

**Nieuwe bugs gelogd:** geen  
**Blockers voor deze run:** geen (Companion/module-tests buiten scope)

### Gedetailleerde resultaten

| ID | Test | Result | Opmerking |
|----|------|--------|-----------|
| TC-400 | GET `/control` HTTP 200 | **Pass** | Dashboard HTML geladen |
| TC-401 | GET `/operator` HTTP 200 | **Pass** | Operator shell geladen |
| TC-402 | GET `/operate/ticker-main` HTTP 200 | **Pass** | Operate shell + `operate-panel.css` |
| TC-403 | GET `/operate/score-main` HTTP 200 | **Pass** | Shell 200; client redirect naar `/operator?focus=…` (by design in `operate.js`) |
| TC-410 | `detectDevice` iPhone → `mobile` | **Pass** | `server/device.js` unit |
| TC-411 | `detectDevice` iPad → `tablet` | **Pass** | — |
| TC-412 | `detectDevice` Android phone/tablet | **Pass** | Mobile + tablet UA’s |
| TC-413 | Desktop UA → `control` redirect | **Pass** | `GET /` → 302 `…/control` |
| TC-414 | Mobile/tablet UA → `operator` redirect | **Pass** | iPhone/iPad → 302 `…/operator` |
| TC-415 | `?view=control` override op mobile | **Pass** | iPhone + `?view=control` → `/control` |
| TC-416 | `GET /api/device` JSON | **Pass** | `{ device: "mobile" \| "desktop" }` |
| TC-420 | `createTickerMessage` default `enabled: false` | **Pass** | `server/tickerMessages.js` |
| TC-421 | `normalizeTickerMessagesInput` string → disabled | **Pass** | — |
| TC-422 | Legacy `string[]` migrate → enabled | **Pass** | `migrateTickerMessages` |
| TC-423 | `enabledTickerTexts` filtert disabled | **Pass** | Alleen `enabled: true` in output |
| TC-424 | API PATCH object `{ enabled: false\|true }` | **Pass** | Round-trip op `ticker-main`; state hersteld |
| TC-425 | API PATCH string-only message → disabled | **Pass** | `{ id, text, enabled: false }` shape |
| TC-430 | `/control` linkt `operate-panel.css` | **Pass** | `<link href="/public/shared/operate-panel.css">` |
| TC-431 | `/operator` + `/operate` linken `operate-panel.css` | **Pass** | Consistent op alle operate surfaces |
| TC-432 | `#dashboard-operate-panel` in control HTML | **Pass** | Rechterkolom operate container |
| TC-433 | `control.js` importeert `operate-handlers.js` | **Pass** | `operateShellHtml`, `wireOperateSection` |
| TC-434 | `operate.js` importeert `operate-handlers.js` | **Pass** | `node --check` OK op beide |
| TC-435 | Semantische knoppen in handlers | **Pass** | Hide=`button--gray`, Go live=`button--live`, delete=`button--danger` |
| TC-440 | Match operate handlers aanwezig | **Partial** | Ticker volledig (`ticker-add/toggle/del`); match/quiz = `genericOperateMountHtml` link of redirect — open per Design Brief §7 |
| TC-441 | `ticker-msg-row` markup + `list-style: none` | **Pass** | Code review `operate-handlers.js` + `operate-panel.css` |
| TC-442 | Embedded operate zonder dubbele h2 | **Pass** | `operateShellHtml({ embedded: true })` |
| TC-450 | Ticker row layout visueel op dashboard | **Manual** | Vereist browser hard-refresh; curl kan dynamische DOM niet verifiëren |
| TC-451 | Project panel inklappen bij operate-selectie | **Manual** | Vereist browser interactie |

### Commando-log

```bash
# Routes
/usr/bin/curl -s -o /dev/null -w "%{http_code}" http://localhost:2014/control           # 200
/usr/bin/curl -s -o /dev/null -w "%{http_code}" http://localhost:2014/operator          # 200
/usr/bin/curl -s -o /dev/null -w "%{http_code}" http://localhost:2014/operate/ticker-main  # 200

# Device redirect (no follow)
/usr/bin/curl -s -o /dev/null -w "%{http_code} %{redirect_url}" http://localhost:2014/
# 302 http://localhost:2014/control
/usr/bin/curl -s -o /dev/null -w "%{http_code} %{redirect_url}" -A "Mozilla/5.0 (iPhone)" http://localhost:2014/
# 302 http://localhost:2014/operator

# operate-panel.css on control
/usr/bin/curl -s http://localhost:2014/control | grep operate-panel.css

# Ticker model unit
node --input-type=module -e "import { createTickerMessage, enabledTickerTexts } from './server/tickerMessages.js'; ..."

# API enabled toggle (ticker-main)
/usr/bin/curl -s -X PATCH http://localhost:2014/api/graphics/ticker-main \
  -H "Content-Type: application/json" \
  -d '{"data":{"messages":[{"id":"qa-test-msg","text":"QA disabled test","enabled":false}]}}'

# JS syntax
node --check public/shared/operate-handlers.js public/control/control.js public/operate/operate.js
```

### Bekende gaps (geen nieuwe QA-IDs)

| Item | Status | Referentie |
|------|--------|------------|
| Match score inline operate in dashboard panel | Open (link only) | `DESIGN-BRIEF-IMPLEMENTATION-STATUS.md` § Nog open |
| `/operate/:id` voor match redirect naar operator | By design | `operate.js` `operatorFocusTypes` |
| Icon-sidebar 44px, dark mode tokens | Open | Design Brief §7.1 / tokens |

### Volgende run

- [ ] Manual TC-450/451 — browser verify ticker row + project panel collapse
- [x] Match operate compact controls in dashboard (TC-440 unblock) — zie run hieronder
- [ ] Retest na icon-sidebar refactor

---

## Run: 11 juni 2026 — Match operate + operator polish (hervat)

**Agent:** Lead dev (match operate), Frontend (operator polish), Beta tester + geautomatiseerde follow-up  
**Script:** `node scripts/qa-design-brief-pass.mjs`  
**Besluit: Pass** — 17/17 automated checks

| ID | Test | Result |
|----|------|--------|
| TC-500 | `matchOperateHtml` exported | **Pass** |
| TC-501 | `refreshOperateSection` wires matchScoreboard | **Pass** |
| TC-502 | Score + uses `button--tinted` (not primary blue) | **Pass** |
| TC-503 | Match stays on `/operate` (no redirect) | **Pass** |
| TC-504 | Operator refactored to `operate-match.js` | **Pass** |
| TC-505 | Operator `pv-sync-bar` removed | **Pass** |
| TC-510–513 | Routes `/control`, `/operator`, `/operate/score-main`, `/operate/ticker-main` | **Pass** |
| TC-520–521 | `operate-panel.css` + `project-setup-details` on control | **Pass** |
| TC-530–531 | Match score API PATCH round-trip | **Pass** |
| TC-540 | Ticker message `enabled: false` PATCH | **Pass** |
| TC-550–551 | Device detect iPhone/desktop | **Pass** |

**TC-440 updated:** Match operate handlers **Pass** (was Partial).

**Nog handmatig:** TC-450 (ticker row visueel), TC-451 (project panel collapse bij selectie).

**Nieuwe bugs:** geen

---

## Run: 30 juli 2026 — Robustness / bugfix (multi-agent)

**Besluit: Conditional Go** (Critical QA-008 gefixt en geverifieerd)

| Veld | Waarde |
|------|--------|
| Versie | 0.4.0 + fixes |
| Agents | QA, Netwerk/MV, Hockey-scan + Lead |
| Omgeving | Geïsoleerd `:2015` + temp data dir |
| Rapport | `docs/qa/ROBUSTNESS-PASS-2026-07-30.md` |

| ID | Severity | Status |
|----|----------|--------|
| QA-008 concurrent registry corrupt | Critical | **Fixed** (write queue + atomic JSON) |
| QA-009 orphan asset dirs | Medium | **Fixed** (projectExists → 404) |
| QA-010 lost score taps | Medium | **Fixed** (operate action queue) |
| QA-011 stale render apply | Medium | **Fixed** (revision guard) |
| QA-012 HTML stack on bad JSON | Low | **Fixed** |
| QA-007 operator clock inputs | Low | **Fixed** |
| F1 overlapping polls | High | **Fixed** (`inFlight`) |
| Hockey sport presets | — | Documented only (not implemented) |

**Open (later):** LAN auth, Socket rooms, Electron↔dev identity, Node engines/lock sync, Intel Mac build.
