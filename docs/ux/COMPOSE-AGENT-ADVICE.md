# Compose (/compose) — gezamenlijk agent-advies

**Datum:** 10 juni 2026  
**Bron:** UX/UI Designer (#2) + Frontend Design Expert (#3)  
**Input:** `docs/ux/IMAGE-TO-WIDGET-TOOL.md`

---

## Gezamenlijke conclusie

| Vraag | UX (#2) | Design (#3) | **Consensus** |
|-------|---------|-------------|---------------|
| Aparte `/compose`? | **GO** | **GO** | ✅ Ja — niet OCR primair in editor |
| Editor blijft finetune? | ✅ | ✅ | ✅ Redirect na aanmaken → `/editor` |
| Review verplicht? | ✅ | ✅ | ✅ Geen auto-live, geen blind aanmaken |
| Font uit OCR? | ❌ | ❌ | ❌ Altijd brand/project font + handmatig |
| MVP widget-type | Alleen wedstrijdscore | Alleen wedstrijdscore | ✅ `matchScoreboard` |
| Dashboard entry | Naast widget toevoegen | Project + dashboard | ✅ Zichtbaar in overlays-paneel |
| «Opnieuw scannen» in editor | Fase 2 | Later secundair | ⏸️ Niet in MVP |

---

## Naamgeving (afstemmen vóór build)

| Agent | Voorkeur | Argument |
|-------|----------|----------|
| UX | **Uit design maken** | Taakgericht; onderscheidt van «Widget toevoegen» |
| Design | **Design importeren** | Consistent met project-taal; vermijd enkel «Importeren» (conflict .proverlay) |

**Aanbevolen compromis:**

- **Knop dashboard:** `Uit design maken` (korte actie)
- **Paginatitel / route eyebrow:** `Design importeren` — PNG naar overlay
- **Nooit:** «Composer», «AI Wizard», alleen «Importeren»

---

## Wizard-structuur (afstemmen)

| Agent | Structuur |
|-------|-----------|
| UX | **4 stappen:** Upload → Detecteren (transitie) → Velden controleren → Widget aanmaken |
| Design | **3 fasen:** Upload → Controleren (canvas + lijst) → Afmaken |

**Aanbevolen MVP:**

1. **Upload** — PNG + soort widget (alleen Wedstrijdscore) + optionele naam  
2. **Controleren** — split view: canvas met bbox + inspector met regio-lijst (detectie = progress in toolbar, geen apart scherm)  
3. **Aanmaken** — samenvatting + **Widget aanmaken en openen in editor**  

**Placement sliders:** beide agents → **niet in compose MVP** (editor heeft dit al). Design wireframe fase 3 met sliders → uitstellen naar editor.

---

## Layout (Design #3)

```
Header sticky (zoals editor)
Fase-indicator: ● Upload — ○ Controleren — ○ Afmaken

Controleren:
┌─────────────────────────────┬──────────────────┐
│ Canvas (hero) + bbox overlay │ Regio-lijst       │
│ editor-canvas-wrap DNA       │ + bind/font/kleur │
└─────────────────────────────┴──────────────────┘
```

**Compose review (juni 2026):** canvas vult beschikbare viewport-breedte/hoogte; preview op **native asset-ratio** (niet ingebed in 1920×1080-projectframe). Bbox-labels op het canvas. Inspector vaste ~320px kolom rechts.

- **Geen** lijst links + inspector rechts (dubbele sidebar)
- **Geen** 5-staps stepper met nummercirkels
- **Geen** stat cards («12 regio's gevonden», accuracy %)

### Bbox styling (tokens)

| State | Stijl |
|-------|--------|
| Default | `1px solid rgba(0,122,255,0.45)` |
| Hover / lijst-sync | dashed outline |
| Selected | `--pv-accent` + inset ring (zoals `editor-element.is-selected`) |
| Lage confidence | Alleen in lijst pill «Onzeker»; canvas subtiel gestippeld |
| Uitgeschakeld | opacity 0.35 |

---

## UX flows & states (#2)

### Entry points

1. Dashboard overlays: knop naast **Widget toevoegen**  
2. Lege overlay-lijst: twee paden — **Lege widget** vs **Uit design maken**  
3. `/project` op design-asset: **Overlay uit dit design** (deep link `/compose?asset=…`)

### Foutstates

| Situatie | Copy (richting) | Acties |
|----------|-----------------|--------|
| 0 regio's | Gradient/kleine tekst bemoeilijkt detectie | Handmatig in editor, andere PNG, opnieuw analyseren |
| Lage confidence | Sectie «Onzekere detecties» — standaard uit | Expand + handmatig beoordelen |
| Dubbele bind | «Dubbele koppeling: Score thuis» | Doorgaan geblokkeerd |
| Geen project | Selecteer eerst project | Naar dashboard |
| Serverfout | Retry + geen half widget | — |

### Relatie pagina's

```
/project (assets) → /compose → widget aanmaken → /editor (finetune) → /render
/control (live toggle) — compose is pre-show, niet blocking voor live
```

---

## MVP scope (beide agents)

| Wel MVP | Niet MVP |
|---------|----------|
| `POST analyze-image` + Tesseract | Opnieuw scannen in editor |
| Wedstrijdscore alleen | Lower third, ticker, message |
| Review + bind dropdown NL | Font-detectie uit pixels |
| Dashboard entry | Placement wizard-stap |
| Redirect editor | Cloud Vision |
| Handmatig veld toevoegen | Bulk «alle onzekere accepteren» |
| | OCR op operator |

---

## Acceptatiecriteria (UX sign-off samenvatting)

- [ ] Entry zonder scroll op laptop (overlays-header)
- [ ] Alle labels Nederlands (geen `homeCode`, `matchScoreboard`)
- [ ] Review verplicht vóór widget creatie
- [ ] ODIDO-testasset: ≥4 bruikbare regio's
- [ ] 0 regio's → fallback naar editor
- [ ] Redirect `/editor?graphic=…` + widget in dashboard
- [ ] Analyse >10s: zichtbare progress
- [ ] Desktop-first; mobiel: eerlijke «gebruik desktop»-melding

---

## Design deliverables vóór implementatie

1. `docs/ux/COMPOSE-WIREFRAME.md` — 3 fasen + breakpoints  
2. Bbox state tokens (hergebruik editor select ring)  
3. Copy deck (knoppen, fouten, fase-titels)  
4. Component mapping: editor/project classes → compose  

---

## Volgorde implementatie (advies lead)

1. Route `/compose` + shell (header, fase-indicator, tahoe layout)  
2. Server `analyze-image`  
3. Fase Controleren (canvas + lijst + inspector)  
4. Widget create + redirect editor  
5. Dashboard entry + empty state  
6. Design pass + UX copy review  
7. Beta test met ODIDO assets  

---

## Referenties

- Architectuur: `docs/ux/IMAGE-TO-WIDGET-TOOL.md`
- Editor UX: `docs/ux/EDITOR-DESIGN-PASS.md`
- Design tokens: `.cursor/skills/frontend-design/REFERENCE.md`
- Dashboard patterns: `docs/ux/UX-REVIEW-PASS.md`
