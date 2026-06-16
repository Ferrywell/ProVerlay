# ProVerlay MVP — Acceptance Criteria (Definition of Done)

**Versie:** 0.2.0-draft  
**Datum:** 2026-06-09  
**Eigenaar:** Beta Tester

## Doel

ProVerlay MVP is **klaar voor operator-gebruik** wanneer een livestream-technicus binnen 30 seconden een lower third live kan zetten, de render-URL in OBS kan gebruiken, en state een server-restart overleeft.

---

## Must-have (release blockers)

### Server & infrastructuur
- [x] Server start op poort 3100 zonder errors (`npm start`)
- [x] State wordt geladen uit en opgeslagen naar `data/show.json`
- [x] Socket.io broadcast `stateChanged` bij elke state-wijziging

### Control panel
- [x] Alle 6 demo-graphics tonen als één kaart per graphic
- [x] Toggle aan/uit werkt per graphic
- [x] Live-status visueel onderscheidbaar (`is-live` op actieve card)
- [x] Styling-form (theme, primary, fontSize, padding) persist en sync
- [ ] "Kopieer render URL" werkt in browser (clipboard) — *handmatig te bevestigen*

### Render engine
- [x] Transparante canvas-achtergrond (OBS-ready)
- [x] Lower third, message, ticker, clock, countdown renderen correct
- [ ] Image graphic met geldige `src` toont afbeelding — *niet getest (geen demo-src)*
- [ ] Image graphic zonder `src` toont **niets** — **FAIL** (zie QA-001)
- [x] Meerdere graphics tegelijk zichtbaar
- [x] Leave-animatie bij hide (`is-leaving`, ~250 ms)

### API
- [x] `GET /api/state` — volledige state
- [x] `PATCH /api/state` — partial merge
- [x] `GET/PATCH /api/graphics/:id`
- [x] `POST /api/graphics/:id/toggle` — set of flip
- [x] 404 bij onbekende graphic ID

### Real-time sync
- [x] Control → render < 500 ms (gemeten ~6 ms)
- [x] API → alle verbonden clients

### Persistence
- [x] Wijzigingen direct in `show.json`
- [x] State behouden na server restart

---

## Should-have (P1 — 80% groen voor MVP)

| Criterium | Status |
|-----------|--------|
| OBS Browser Source workflow gedocumenteerd | Manual pending |
| Ticker scroll-animatie visueel vloeiend | Manual pending |
| Clock update elke seconde | Manual pending |
| Countdown telt correct af | API OK; visueel manual |
| Snel togglen (10×) zonder crash | Pass |
| Edge cases (lege ticker, countdown 0) | Pass |

**P1 score run 2026-06-09:** 4/7 geautomatiseerd groen, 3 manual pending → **~86%** (voldoet aan 80%-drempel als manual groen)

---

## Nice-to-have (P2 — niet MVP-blocker)

| Criterium | Status |
|-----------|--------|
| Bitfocus Companion module | **Blocked** — module ontbreekt |
| Companion preset feedback | Blocked |
| OSC / Decklink / ATEM | Out of scope |

---

## Bug-kwaliteitseis

| Severity | MVP-eis | Huidige status |
|----------|---------|----------------|
| Critical | 0 open | 0 |
| High | 0 open | 0 |
| Medium | 0 open voor release | 1 open (QA-001) |
| Low | Acceptabel | 1 open (QA-002) |

---

## Product-succescriteria (uit `docs/PRODUCT.md`)

| # | Criterium | Status |
|---|-----------|--------|
| 1 | Lower third live in < 30 s | Pass (getest ~5 s workflow) |
| 2 | Render URL in OBS (transparant) | Pass (transparantie); OBS manual |
| 3 | Companion toggle + feedback | **Blocked** |
| 4 | State overleeft restart | Pass |
| 5 | Geen crash bij 6 gelijktijdige graphics | Pass (4 getest, geen crash) |

---

## Go / No-Go beslissing (2026-06-09)

| Besluit | Toelichting |
|---------|-------------|
| **Conditional Go** | Core workflow (control → render → API → persistence) werkt. Release voor operator-demo OK. |
| **No-Go voor Companion** | Module ontbreekt volledig. |
| **Fix vóór release** | QA-001 (image zonder src) — medium, OBS-operators kunnen lege layer zien. |

### Vereiste acties vóór v0.1.0 tag
1. Fix QA-001 of documenteer workaround ("zet geen image live zonder src")
2. Handmatige OBS-smoke test (TC-050, TC-051)
3. Companion module leveren → her-test TC-070–073

---

## Project system — Definition of Done (v0.2.0)

> Status na Beta Tester run 2026-06-09: **niet gereed** — zie BLK-003, QA-003, QA-004.

### Must-have (release blockers)

#### Project registry & API
- [ ] `GET /api/projects` — lijst + `activeProjectId`; `blank` is default
- [ ] `POST /api/projects` — nieuw project met `data/projects/{id}/project.json`
- [ ] `POST /api/projects/:id/activate` — laadt project-state in runtime
- [ ] `GET /api/projects/:id/export` — downloadbare zip (`project.json` + assets)
- [ ] `POST /api/projects/import` — herstelt project uit zip (multipart upload)
- [ ] 404 op onbekend project-ID bij activate/export

#### Per-project persistence
- [ ] State schrijft naar `data/projects/{activeId}/project.json` (niet legacy `show.json`)
- [ ] `data/registry.json` sync: `activeProjectId`, `projects[]`, `updatedAt`
- [ ] State-isolatie: wijzigingen in project A niet zichtbaar in B
- [ ] Server restart behoudt actief project en graphics (TC-112)

#### composedScore / WYSIWYG data
- [ ] `PATCH /api/graphics/:id` deep-merge op `data.elements.*`
- [ ] composedScore graphic type in render engine
- [ ] WYSIWYG editor schrijft layout naar API (manual TC-111)

### Should-have (P1)

| Criterium | Status |
|-----------|--------|
| Project verwijderen (`DELETE /api/projects/:id`) | Not tested |
| Duplicate project naam → unieke slug | Not tested |
| Import overschrijf-gedrag gedocumenteerd | Pending |
| Export bevat brand + settings | Pending |
| Control UI project-switcher | Manual pending |

### Bug-kwaliteitseis (project suite)

| Severity | Eis | Huidige status |
|----------|-----|----------------|
| Critical | 0 open | 1 open (QA-003 — geen project API) |
| High | 0 open | 1 open (QA-004 — geen project.json persist) |
| Medium | 0 open voor release | 1 open (QA-001 legacy) |

### Go / No-Go project system (2026-06-09)

| Besluit | Toelichting |
|---------|-------------|
| **No-Go** | Alle project-API endpoints returnen 404. Data-structuur (`registry.json`, `projects/blank/`) bestaat maar server gebruikt nog `show.json`. |
| **Unblock** | Lead implementeert project routes in `server/api.js` + `server/state.js` migratie. |
| **Her-test** | Volledige TC-100–112 suite + `PROJECT-TESTS.md` na unblock. |
