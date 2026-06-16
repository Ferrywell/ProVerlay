# ProVerlay QA — Blockers

**Datum:** 2026-06-09  
**Laatste update:** Beta Tester run #2 (project system)

## Actieve blockers

### BLK-003 — Project API niet geïmplementeerd (P0)

| Veld | Waarde |
|------|--------|
| Severity | Critical |
| Component | Server / API |
| Status | Open |
| Eigenaar | Lead Developer |

**Beschrijving**  
Multi-project data-structuur is aanwezig (`data/registry.json`, `data/projects/blank/project.json`, zip-dependencies in `package.json`), maar `server/api.js` en `server/state.js` kennen geen project-routes. Alle `/api/projects/*` calls returnen 404.

**Geblokkeerde tests**
- TC-100 — GET /api/projects
- TC-101 — POST /api/projects
- TC-102 — POST activate
- TC-103 — State isolation
- TC-105 — Export zip
- TC-106 — Import zip
- TC-107 — Invalid import
- TC-108 — Unknown project 404
- TC-112 — Restart active project
- TC-111 — WYSIWYG editor (afhankelijk van project switch)

**Wat wél werkt**
- `data/registry.json` met `blank` default
- `data/projects/blank/project.json` template (composedScore)
- Legacy API (`/api/state`, `/api/graphics/:id`) op `show.json`
- PATCH deep merge op `data.elements` (legacy graphic type)

**Unblock-criteria**
1. `GET/POST /api/projects` in `server/api.js`
2. `POST /api/projects/:id/activate` laadt `data/projects/{id}/project.json`
3. `GET /api/projects/:id/export` → zip via archiver
4. `POST /api/projects/import` → unzipper + registry update
5. `server/state.js` schrijft naar actief project-bestand (niet `show.json`)
6. Beta Tester her-run TC-100–112

**Workaround**
Geen — project-workflow niet bruikbaar tot API live is.

---

### BLK-001 — Companion module installeren in Bitfocus Companion (P2)

| Veld | Waarde |
|------|--------|
| Severity | Medium (voor Companion-workflow) |
| Component | Companion |
| Status | Gedeeltelijk opgelost — module code in `companion/` |
| Eigenaar | Operator / Lead Developer |

**Beschrijving**  
De Companion-module code staat in `companion/`, maar moet nog handmatig aan Companion gekoppeld worden via Developer modules path.

**Geblokkeerde tests**
- TC-070 — Module beschikbaar
- TC-071 — `toggleGraphic` via Companion
- TC-072 — Preset feedback (graphic visible)
- TC-073 — End-to-end Stream Deck workflow

**Wat wél werkt (niet geblokkeerd)**
- Socket.io server-events zijn geïmplementeerd (`server/index.js`)
- REST `POST /api/graphics/:id/toggle` werkt als fallback
- Documentatie in `docs/COMPANION.md` beschrijft het contract

**Unblock-criteria**
1. ~~`companion/` module met configureerbare host/port~~ ✅
2. ~~Actions: show, hide, toggle graphic~~ ✅
3. ~~Feedback: graphic visible state~~ ✅
4. ~~Auto-preset per graphic~~ ✅
5. Module toegevoegd aan Companion developer path + handmatige E2E test

**Workaround voor testen**
```bash
# Simuleer Companion toggle via REST
curl -X POST http://localhost:3100/api/graphics/lt-host/toggle \
  -H "Content-Type: application/json" \
  -d '{"visible": true}'
```

---

### BLK-002 — OBS smoke test niet geautomatiseerd (P1)

| Veld | Waarde |
|------|--------|
| Severity | Medium |
| Component | Render / OBS |
| Status | Open |
| Eigenaar | Beta Tester (manual) |

**Beschrijving**  
Transparante CSS-achtergrond is bevestigd in browser, maar OBS Browser Source gedrag (1920×1080, alpha channel) vereist handmatige verificatie.

**Geblokkeerde tests**
- TC-050 — Browser Source render URL
- TC-051 — Graphics over video

**Unblock-criteria**
- OBS Studio geïnstalleerd
- Testronde met Browser Source + kleurbron of camera input

---

## Opgeloste / geen blockers

| Item | Status |
|------|--------|
| Server start op 2014 | OK |
| Legacy API beschikbaar | OK |
| Socket.io sync | OK |
| show.json persistence | OK (legacy) |
| registry.json + project dirs | OK (data only) |

---

## Afhankelijkheden tussen agents

| Blocker | Wacht op |
|---------|----------|
| BLK-001 | Lead Developer — Companion E2E in Companion app |
| BLK-002 | Operator met OBS — manual QA-ronde |
| BLK-003 | Lead Developer — project API + state migratie |
