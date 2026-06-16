# Editor Design & UX Pass — Scorebord editor

**Datum:** 10 juni 2026  
**Agents:** Frontend Design (#3) + UX/UI (#2)  
**Scope:** `/editor` — WYSIWYG scorebord, referentie-overlay, PNG-positionering

---

## Executive summary

De scorebord editor miste drie kernfuncties voor professioneel designwerk: een **referentiebeeld** over het volledige canvas, **PNG-schaal/positie** controls, en **correcte klantfonts** in preview. Dashboard had te zware copy voor stand-alone URLs.

| Prioriteit | Item | Status |
|------------|------|--------|
| P0 | Referentie-overlay (transparant, volledig frame) | ✅ Geïmplementeerd |
| P0 | Placement sliders + sleep-modus voor scorebalk | ✅ Geïmplementeerd |
| P0 | Brand/project fonts in editor preview | ✅ Geïmplementeerd |
| P1 | Fontgrootte slider tot 280px (ODIDO ~184px) | ✅ Geïmplementeerd |
| P1 | Stand-alone URL als link-icoon na widgetnaam | ✅ Dashboard |
| P2 | Klok ±1s knoppen (dashboard + operator) | ✅ Geïmplementeerd |

---

## Design review (Frontend Design)

### Referentie-overlay

- **Doel:** TD ziet klant-screenshot (bijv. volledige 1920×1080 uitzending) over het editorcanvas en kan tekstvelden pixel-perfect afstemmen.
- **Gedrag:** Overlay op `editor-frame` (niet op strip alleen), `pointer-events: none`, opacity 5–90%, toggle in toolbar.
- **Opslag:** `layout.referenceImage`, `referenceOpacity`, `referenceVisible` — **niet** zichtbaar in OBS render.
- **Bron:** Design assets uit project (`design-*` prefix) of upload via inspector.

### PNG positie & schaal

- **Strip-modus:** Scorebalk-PNG (3197×335) leeft in `placement` op projectcanvas (x/y/width %).
- **Controls:** Sliders in inspector + **PNG verplaatsen** modus met sleep-handvat.
- **WYSIWYG:** Zelfde `resolvePlacement()` als `/render`.

### Typografie

- **Bug:** Lege `fontFamily: ""` op elementen overschreef klant-branding → generieke sans in editor.
- **Fix:** `resolveElementFontFamily()` + `injectBrandFontFace()` bij laden.
- **Tip:** Kies per veld **Otypical Headline** of **Otypical Text** uit dropdown als brand-stack niet volstaat.

---

## UX review

### Flow: referentie → tekst → opslaan

1. Upload referentie (screenshot klantdesign) via inspector of `/project`.
2. Zet opacity ~40–50%, toggle **Referentie** aan.
3. Auto-plaats velden of handmatig slepen op PNG.
4. Finetune fonts/grootte tot match met referentie.
5. **Opslaan** → preview via link-icoon op dashboard.

### Dashboard: stand-alone URL

- **Was:** Grote knop “Deze overlay (OBS)” in footer — visuele ruis.
- **Nu:** Compact link-icoon direct na widgetnaam, tooltip **“Gebruik widget stand-alone”**, kopieert URL bij klik.
- Header behoudt **Alle overlays (render)** voor gecombineerde OBS-source.

### Klok bijsturen

- Dashboard widget-panel: rij **−1s / +1s / −1 min / +1 min** onder Start/Pauze.
- Operator: compacte **±1s** vóór bestaande ±15s knoppen.

---

## Open punten (volgende iteratie)

| Item | Notitie |
|------|---------|
| Referentie in project.json seed | Upload `ODIDO_SCOREBALK_BASIS_VOORBEELD.png` als `design-…` in project assets |
| Per-element font default | Bulk “Pas klantfont toe op alle velden” knop |
| Snap-to-grid | Optioneel 1% grid snap bij slepen |
| Ticker editor | Aparte editor-route voor tickertape layout |

---

## Verwijzingen

- `docs/ux/EDITOR-WYSIWYG.md` — technische spec
- `docs/ux/UX-REVIEW-PASS.md` — dashboard/operator pass
- `public/shared/canvas-layout.js` — placement math
