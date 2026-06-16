# QA Test Plan — ProVerlay (Beta Tester Brief)

## Jouw opdracht

Schrijf en voer een gestructureerd testplan uit voor ProVerlay MVP v0.1.0. Documenteer alles in `docs/qa/`.

## Testomgeving

| Item | Waarde |
|------|--------|
| App start | `npm install && npm start` |
| Control URL | http://localhost:3100/control |
| Render URL | http://localhost:3100/render |
| API | http://localhost:3100/api/state |
| Poort | 3100 |
| State file | `data/show.json` |

## Testcategorieën

### 1. Smoke tests (P0)
- Server start zonder errors
- `/control` laadt
- `/render` laadt met transparante achtergrond
- `GET /api/state` retourneert JSON

### 2. Functional — Control UI (P0)
- Elke graphic kan aan/uit
- Live-status visueel zichtbaar in control
- Styling wijzigingen (kleur, font, padding) reflecteren op render
- "Kopieer render URL" werkt

### 3. Functional — Render engine (P0)
- Lower third toont naam/title/company
- Message toont tekst
- Ticker scrollt
- Clock tikt elke seconde
- Countdown telt af
- Image toont wanneer src gezet is
- Meerdere graphics tegelijk zichtbaar
- Hide animatie werkt

### 4. API (P1)
```bash
# Toggle graphic
curl -X POST http://localhost:3100/api/graphics/lt-host/toggle \
  -H "Content-Type: application/json" \
  -d '{"visible": true}'

# Patch state
curl -X PATCH http://localhost:3100/api/state \
  -H "Content-Type: application/json" \
  -d '{"settings": {"fontSize": 3}}'
```

### 5. Real-time sync (P0)
- Open control + render in twee browser tabs
- Toggle in control → render update < 500ms
- Toggle via API → beide tabs updaten

### 6. OBS workflow (P1)
- Browser Source met render URL
- Transparante achtergrond
- 1920x1080 canvas
- Graphics over video zichtbaar

### 7. Persistence (P1)
- Wijzig state via control
- Herstart server
- State behouden in `data/show.json`

### 8. Companion (P2 — wanneer module klaar)
- Verbinding met ProVerlay instance
- Presets per graphic
- Toggle via Stream Deck
- Feedback toont actieve status

### 9. Edge cases (P2)
- Snel achter elkaar togglen (10x)
- Lege ticker items
- Countdown op 0
- Ongeldige graphic ID via API → 404
- Twee browser tabs control tegelijk

## Deliverables (maak aan in `docs/qa/`)

1. **TEST-PLAN.md** — dit document uitgewerkt met test cases (ID, steps, expected)
2. **ACCEPTANCE-CRITERIA.md** — MVP definition of done
3. **BUG-REPORT-TEMPLATE.md**
4. **TEST-RESULTS.md** — resultaten per run (datum, pass/fail)
5. **BLOCKERS.md** — features die testen blokkeren

## Bug severity

| Level | Definitie |
|-------|-----------|
| Critical | Render werkt niet / data loss / crash |
| High | Graphic type werkt niet / geen sync |
| Medium | Styling bug / UX verwarring |
| Low | Cosmetisch |

## MVP Definition of Done

- [ ] Alle P0 tests groen
- [ ] 80%+ P1 tests groen
- [ ] Geen open Critical/High bugs
- [ ] OBS workflow gedocumenteerd en getest
- [ ] Testresultaten gepubliceerd in `docs/qa/TEST-RESULTS.md`

## Vergelijking met Holographics

Test ook of ProVerlay dezelfde **workflow** ondersteunt:
1. Render URL in OBS → ✅/❌
2. Real-time toggle → ✅/❌
3. Companion trigger → ✅/❌ (later)
4. Multi-graphic → ✅/❌

Noteer verschillen in `docs/qa/HOLOGRAPHICS-PARITY.md`
