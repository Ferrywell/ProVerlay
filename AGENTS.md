# ProVerlay — Agent Orchestration

Dit document stuurt de samenwerking tussen vier agents aan.

## Rollen

### 1. Lead Developer (hoofd-agent)
**Verantwoordelijk voor:** server, API, state management, Companion-module, integratie van UX-output.

**Werkt in:**
- `server/`
- `public/render/` (logica)
- `companion/`
- `data/show.json`

**Niet aanpassen zonder overleg:**
- Visuele stijl in `public/control/`, `public/operator/`, `public/editor/`, `public/project/` → Frontend Design agent
- Flow/copy wireframes in `docs/ux/` → UX agent
- Testdocumenten in `docs/qa/` → Beta tester

---

### 2. UX/UI Designer
**Verantwoordelijk voor:** operator experience, visuele hiërarchie, flows, labels, wireframes, graphic styling specs.

**Lees eerst:**
- `docs/PRODUCT.md`
- `docs/UX-DESIGN-BRIEF.md`
- `docs/ARCHITECTURE.md`
- `.cursor/skills/frontend-design/REFERENCE.md` (anti-cliché principes)

**Lever op in:**
- `docs/ux/` — wireframes, design tokens, component specs, flow reviews
- `public/render/render.css` — positionering en animaties (spec, geen dashboard-chrome)

**Design-principes:**
1. Operator moet binnen 30 seconden een graphic live kunnen zetten
2. Control UI = Apple Tahoe licht, glass, rustig (niet template-SaaS)
3. Render = transparant, responsive (`vmin`/`vw`), geen vaste pixels
4. Eén graphic = één kaart; inspector pas na selectie
5. Live-status visueel duidelijk (border/glow op actieve graphics)
6. Geen cliché-dashboard patterns (stat cards, fake charts, sidebar theatre)

**Niet doen:**
- Server/API logica wijzigen
- Nieuwe graphic types toevoegen zonder overleg met lead
- HTML/CSS van dashboard/operator/editor zonder Frontend Design agent (tenzij copy-only)

---

### 3. Frontend Design Expert *(nieuw)*
**Verantwoordelijk voor:** visuele implementatie, responsive layout, tahoe.css tokens, polish van dashboard/operator/editor/project.

**Skill:** `.cursor/skills/frontend-design/SKILL.md` — **altijd eerst lezen**

**Lees ook:**
- `.cursor/skills/frontend-design/REFERENCE.md` — Reddit anti-cliché analyse
- `.cursor/skills/frontend-design/CHECKLIST.md` — per-page audit
- `public/shared/tahoe.css`

**Werkt in:**
- `public/control/` — dashboard HTML/CSS
- `public/operator/` — touch operator HTML/CSS
- `public/editor/` — WYSIWYG editor HTML/CSS
- `public/project/` — project/assets pagina HTML/CSS
- `public/shared/tahoe.css` — gedeelde tokens/components

**Lever op in:**
- `docs/ux/FRONTEND-DESIGN-PASS.md` — changelog + responsive verificatie

**Niet doen:**
- Server/API/state wijzigen
- Render overlay logica
- UX copy/flows herontwerpen (→ UX agent)

---

### 4. Beta Tester
**Verantwoordelijk voor:** testplan, acceptatiecriteria, regressies, gebruikersflows, bugrapporten.

**Lees eerst:**
- `docs/PRODUCT.md`
- `docs/QA-TEST-PLAN.md`
- `docs/COMPANION.md`

**Lever op in:**
- `docs/qa/TEST-PLAN.md` — volledig testplan
- `docs/qa/ACCEPTANCE-CRITERIA.md` — MVP definition of done
- `docs/qa/BUG-REPORT-TEMPLATE.md`
- `docs/qa/TEST-RESULTS.md` — resultaten na elke testronde

**Testflows (prioriteit):**
1. Control → render sync (toggle graphic)
2. OBS Browser Source workflow
3. Socket.io `stateChanged` events
4. REST API (`PATCH /api/graphics/:id`, `POST toggle`)
5. Styling wijzigen (theme, kleuren)
6. Multi-graphic scenario's
7. Companion integratie (zodra module klaar is)

**Rapporteer bugs als:**
```
ID: QA-001
Severity: High/Medium/Low
Steps to reproduce
Expected vs Actual
Environment (browser, OS)
```

---

## Workflow

```
1. Lead bouwt MVP skeleton          ✅
2. Frontend Design — tahoe polish   → dashboard/operator/editor/project
3. UX — flows, copy, wireframes     → parallel na design pass
4. Beta tester schrijft/voert tests → na UX sign-off
5. Lead integreert API waar nodig
6. Herhaal design → ux → qa bij grote UI wijzigingen
```

## Communicatie tussen agents

- Frontend Design wijzigingen: documenteer in `docs/ux/FRONTEND-DESIGN-PASS.md`
- UX wijzigingen die HTML-structuur raken: documenteer in `docs/ux/COMPONENT-SPEC.md`
- API-contract wijzigingen: lead update `docs/ARCHITECTURE.md` eerst
- Beta tester blokkeert op ontbrekende features → noteer in `docs/qa/BLOCKERS.md`
- Reddit/design filosofie: `.cursor/skills/frontend-design/REFERENCE.md`

## Huidige status (v0.6.2)

| Component | Status |
|-----------|--------|
| Project systeem | ✅ CRUD, activate, export/import .proverlay |
| Assets per project | ✅ `data/projects/{id}/assets/` |
| WYSIWYG editor | ✅ `/editor` — PNG + draggable text |
| customScoreboard render | ✅ layout + elements |
| Control UI | ✅ Project panel (UX agent) |
| Operator / Companion | ✅ Score bediening |
| Design hub | ✅ `/design` — setup checklist |
| F1 timing tower | ✅ `f1Timing` widget — MultiViewer live + manual (`docs/F1-TIMING.md`) |
| Hockey scorebug | ✅ `hockeyScorebug` — Odido PNG-basis (geen ring; Glow in codes) |
| QA project tests | 🟡 Beta agent — her-test na API |

## Poorten

- ProVerlay: **2014**
- Companion module: host `127.0.0.1`, port `2014`

## Productrichting (juni 2026)

- Eigen identiteit — Apple Tahoe UI, geen Holographics-clone
- Klant **Odido**: volg `docs/brand/ODIDO.md` + `docs/brand/odido-tokens.css` (Glow 2/4, Otypical, identity levels)
- `/control` = desktop dashboard, `/operator` = iPad/iPhone bediening
- Device detectie op `/` → mobiel naar operator
- Klant branding via `data/brands/` + live editor
- Custom overlays via JSON (voetbalscore als referentie)
