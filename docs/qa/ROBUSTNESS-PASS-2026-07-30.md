# Robustness / bugfix — 30 juli 2026

**Versie:** 0.4.0+ (post-pass fixes)  
**Agents:** [QA regressie](b9769d87-3aec-4145-bb9c-5e520b3e02e3), [Netwerk/MultiViewer](d69f17c6-b61f-4fbc-b8f4-27cca52b19c9), [Hockey-klaarheid](7d064bf1-5435-448a-99d4-97b0f0892723) + Lead  
**Methode:** code review, geïsoleerde server op poort **2015** met temp `PROVERLAY_DATA_DIR` (poort 2014 / ProVerlay.app niet aangeraakt)

## Besluit

**Conditional Go** na fixes van Critical QA-008 en Medium QA-009/010/011/012 + F1 poll-guard.  
Open blijven (bewust niet nu gebouwd): LAN-auth, Socket rooms, sport-presets voor hockey, Electron↔dev identity check.

## Wat er is gefixt (deze pass)

| ID | Severity | Fix |
|----|----------|-----|
| QA-008 | Critical | Schrijfwachtrij + atomaire JSON writes (`server/writeQueue.js`) voor `project.json` / `registry.json` |
| QA-009 | Medium | `projectExists()` vóór asset-upload → 404 i.p.v. orphan-map |
| QA-010 | Medium | Per-widget actiewachtrij + optimistic data in `operate-match.js` (snelle score-taps) |
| QA-011 | Medium | Render `applyState` revision guard zodat stale font-loads geen oude paint overschrijven |
| QA-012 | Low | JSON error middleware → `400 {"error":"Invalid JSON body"}` zonder HTML stack |
| QA-007 | Low | Operator minute/second inputs gebruiken `resolveLiveClock` |
| — | Medium | F1: geen overlappende polls (`inFlight`); IPv6 host brackets |
| — | Medium | `period` bind in `resolveBindText` (was altijd leeg) |

### Verificatie (2015)

- 40 parallelle `PATCH` → alle 200, server blijft up, `registry.json` parseert
- Orphan upload → `404 {"error":"Project not found"}`, geen extra projectmap
- Invalid JSON → `400` JSON body
- `resolveBindText('period', …)` → `1st half`

## Netwerk / poorten / pakketten

| Onderwerp | Bevinding | Risico | Advies |
|-----------|-----------|--------|--------|
| Poort **2014** | `EADDRINUSE` → exit 1 met duidelijke melding | Laag (afgehandeld) | App en `npm start` niet tegelijk |
| Electron + bestaande :2014 | App koppelt aan *elke* gezonde `/api/state` zonder identity | Medium | Niet `npm start` laten draaien tijdens app-test; later identity/version endpoint |
| MultiViewer **10101** | Alleen outbound; clash = MultiViewer/API onbereikbaar | Medium | Live-indicator + timeout-tekst; delay/buffer documenteren |
| F1 poll load | 5 HTTP/s per widget; was overlap bij latency | Hoog → verlaagd | `inFlight` guard; later: dedupe per host, backoff, Socket rooms |
| LAN | `0.0.0.0` + Socket CORS `*` = geen auth | Hoog op onvertrouwd netwerk | Later: LAN-modus + token |
| Packages | Build wil Node 22+; `engines` zegt ≥18; lockfile-versie drift | Medium | Releases op Node 22 bouwen (zoals nu) |
| Arm64-only Mac build | Intel niet ondersteund | Medium | Documenteren / later universal |

## MultiViewer / F1 failure modes (operationeel)

1. Bron moet **MultiViewer (live)** staan — Manual + Import vult alleen de handmatige lijst.
2. Replay vereist **Replay Live Timing** in MultiViewer, niet alleen video.
3. Bij timeout blijft oude buffer zichtbaar tot 5 min; status `connected: false` — check live-dot.
4. Finish-vlag = Status-bit `1024` (empirisch); kan breken als feed-semantiek wijzigt.
5. Delay groter dan buffer → oudste snapshot (geen “buffer filling”-UI nog).
6. Meerdere F1-widgets op dezelfde MV = dubbele polls (nu zonder overlap per widget).

## Veldhockey (niet geïmplementeerd — wel voorbereid)

Zie ook `docs/ARCHITECTURE-MATCH-GRAPHICS.md`.

- **Nu:** één type `matchScoreboard`; layout/elements/scores zijn sport-agnostisch.
- **Blokkerend voor hockey:** periodes, stoppage, auto-90′, count-up clock zijn voetbal-hardcoded; `data.sport` bestaat maar wordt niet gelezen.
- **Pad:** sport-presets (`fieldHockey`: quarters, countdown, geen stoppage) i.p.v. nieuw graphic type, tenzij operate-flow te zwaar wordt.
- **Niet doen:** `if (sport === 'hockey')` in `render.js` — wel preset-driven `formatClock` / period options / operate toggles.

## Bewust niet gefixt (scope / risico)

- LAN pairing / auth
- Socket.IO rooms / delta state
- Server-side atomic `increment-score` endpoint (client queue is genoeg voor nu)
- Control `widgetPayloadFromForm` clock desync (QA-006) — grotere UI-refactor
- Companion fetch timeouts
- Notarized / Intel builds

## Handmatige checklist (operator)

- [ ] App alleen (geen `npm start` op 2014)
- [ ] Match: snelle ++ taps → score +N
- [ ] F1: MultiViewer live + delay + tyre + finish-vlag
- [ ] Operator op LAN-IP (firewall)
- [ ] Project wissel → render volgt mee
