# Dev handoff — iOS design pass (11 juni 2026)

**Van:** Frontend Design agent  
**Voor:** Lead Developer (server/API, operator logic, integratie)  
**Bron-audit:** `docs/ux/IOS-DESIGN-AUDIT.md`

Dit document beschrijft **wat er is gewijzigd** en waar jij op moet letten bij verdere feature-werk. Er zijn **geen API-, state- of server-wijzigingen**.

---

## Samenvatting

Eén geïntegreerde design pass: iOS-achtige structuur (nav bar, grouped lists, segmented controls) toegepast op alle relevante UI-routes. Operator is het zwaarste oppervlak; control/project/editor kregen lichte mobile-polish.

| Gebied | API/state | DOM/structuur | Gedrag |
|--------|-----------|---------------|--------|
| Operator | ongewijzigd | **wel** | ongewijzigd (`data-action` hetzelfde) |
| Control | ongewijzigd | hint toegevoegd | sessionStorage dismiss |
| Project | ongewijzigd | header + presets | `[data-canvas]` listeners ongewijzigd |
| Editor | ongewijzigd | gate overlay | alleen CSS + `is-narrow` class |
| tahoe.css | — | nieuwe componenten | globale spacing iets ruimer |

---

## Design system — `public/shared/tahoe.css`

### Nieuwe/gewijzigde tokens

- Spacing herschaald naar 8pt-grid (`--pv-space-xs` = 8px, `--pv-space-md` = 16px, enz.).
- `--pv-separator`, `--pv-gray-fill`, `--pv-accent-tint`, `--pv-screen-margin`, typografie-tokens (`--pv-type-*`).
- `@supports not (backdrop-filter)` → `--pv-bg-elevated: #ffffff` fallback (Windows-oudere builds).

### Nieuwe componenten (hergebruik overal)

| Class | Doel |
|-------|------|
| `.pv-nav-bar` + `__back`, `__title`, `__action` | iOS navigation bar (sticky, safe-area-top) |
| `.pv-sync-bar` | Gecentreerde sync-status onder nav (operator) |
| `.pv-group` + `__cell`, `__title` | Inset grouped list (Settings-stijl) |
| `.pv-segmented` + `__btn` | Segmented control (klok, canvas presets) |
| `.button--tinted`, `.button--gray` | iOS button varianten |
| `.pv-section-header` | Sectielabel zonder uppercase eyebrow |
| `.mobile-operator-hint` | Control banner ≤767px |
| `.editor-desktop-gate` | Editor blokkeerscherm op smalle viewports |

### Button-wijziging

`.button--secondary` heeft **geen border meer** — grijze fill (`--pv-gray-fill`). Bestaande secondary knoppen in control/editor zien er iets zachter uit. Geen functionele impact.

### Electron

Drag-region selectors: `.op-header` → `.pv-nav-bar` (`.op-header` bestaat niet meer op operator/project).

---

## Operator — belangrijkste wijzigingen

### HTML (`public/operator/index.html`)

- Glass header vervangen door `.pv-nav-bar` + `.pv-sync-bar`.
- `form-controls.css` toegevoegd (styled selects/inputs).
- Nav-titel: altijd **“Live control”** (niet meer widgetnaam).

### CSS (`public/operator/operator.css`)

- Volledig herschreven voor grouped layout; geen `.glass.op-card` meer.
- Touch targets en safe-area behouden.

### JS (`public/operator/operator.js`) — let op bij nieuwe widget-types

**Nieuwe variabele:** `showWidgetTitles` — `true` als er **meerdere** operator-widgets zijn. Bepaalt of `h2.pv-group__title` in de card-header staat.

**Nieuwe helper:** `sectionHead(graphic, statusText, { livePill, statusBind })` — genereert card-header.

**Class-migratie (breaking voor CSS/tests die oude selectors gebruiken):**

| Oud | Nieuw |
|-----|-------|
| `.glass.op-card` | `.op-section` > `.pv-group` |
| `.op-card-head` | `.op-section-head` |
| `.op-card.is-live` | `.op-section.is-live` |
| `.op-card-head .pill` | `[data-bind="live-pill"]` |

**Klok-aanpassingen:** zes losse `button--secondary` knoppen → twee `.pv-segmented` rijen (3 kolommen). **`data-action` waarden ongewijzigd** (`sec-minus-1`, `sec-plus-1`, enz.) — click handler hoeft niet aangepast.

**Render-titel:** `title.textContent` is vast `'Live control'`; focus-chip (`#op-focus-chip`) toont nog `Focus: {name}` bij `?focus=`.

**Lege staat:** class `empty-state` (geen `glass`).

### Nieuwe operator-widget toevoegen?

Gebruik dit patroon:

```html
<section class="op-section${visible ? ' is-live' : ''}" data-graphic-id="…" data-type="…">
  <div class="pv-group">
    ${sectionHead(graphic, 'status tekst')}
    <div class="pv-group__cell">…inhoud…</div>
    <div class="pv-group__cell pv-group__cell--actions">
      <div class="op-toolbar op-toolbar--primary">…</div>
    </div>
  </div>
</section>
```

`updateLiveState()` zoekt `[data-bind="live-pill"]` — zorg dat die in `sectionHead` blijft of handmatig aanwezig is.

---

## Control — `public/control/`

- **HTML:** `<aside class="mobile-operator-hint">` bovenaan body.
- **JS:** `initMobileOperatorHint()` — toont op ≤767px, dismiss → `sessionStorage['pv-dismiss-mobile-hint']`.
- **CSS:** smallere padding op mobile (`--pv-screen-margin`).

Geen wijzigingen aan socket/API/overlay-logica.

---

## Project — `public/project/`

- Header: `.shell-header` → `.pv-nav-bar` (zelfde patroon als operator).
- Canvas presets: buttons in `.pv-segmented` — **`data-canvas` attributen ongewijzigd**, `project.js` blijft werken.

---

## Editor — `public/editor/`

- **HTML:** `.editor-desktop-gate` + inline script dat `body.is-narrow` zet bij `max-width: 767px`.
- **CSS:** gate bedekt editor op smalle schermen; canvas/inspector `visibility: hidden` (niet `display: none` — geen state-reset nodig).

Editor blijft desktop-first; geen layout-wijziging op ≥768px.

---

## Form controls — `public/shared/form-controls.css`

- Styled `<select>` (chevron SVG, geen native border).
- Inputs in `.pv-group` krijgen transparante achtergrond (inset list look).
- Pagina's zonder `form-controls.css` houden oude `.field` styling uit `tahoe.css`.

**Operator laadt nu ook form-controls.css** — nieuwe dependency in `index.html`.

---

## Wat niet is gedaan (bewust)

- Geen toggle switches voor checkboxes in control (alleen operator-styled inputs).
- Control dashboard geen volledige mobile redesign (redirect/hint is voldoende).
- Geen wijzigingen aan `public/render/`, `server/`, `companion/`.
- `dist/` niet bijgewerkt — rebuild Electron app na merge.

---

## Test-checklist voor lead dev

1. Operator: score +/-, klok segmented knoppen, pause/hide, penalties, ticker, lower thirds, quiz — alle `data-action` flows.
2. Operator met 1 widget: geen dubbele titel in card.
3. Operator met 2+ widgets: widgetnaam in card-header.
4. `?focus=graphicId` — focus chip + volgorde cards.
5. Control op phone: hint zichtbaar, dismiss onthouden per sessie.
6. Project: canvas preset segmented buttons → width/height update.
7. Editor op phone: gate zichtbaar; op desktop normaal.
8. Electron (Mac): nav bar sleepgebied + traffic-light padding.
9. Windows/Chromium: geen ontbrekende UI als `backdrop-filter` ontbreekt.

---

## Bestanden gewijzigd (compleet)

```
public/shared/tahoe.css
public/shared/form-controls.css
public/operator/index.html
public/operator/operator.css
public/operator/operator.js
public/control/index.html
public/control/control.css
public/control/control.js
public/project/index.html
public/project/project.css
public/editor/index.html
public/editor/editor.css
docs/ux/FRONTEND-DESIGN-PASS.md
docs/ux/DEV-HANDOFF-IOS-DESIGN-PASS.md  (dit bestand)
```

---

*Vragen over visuele keuzes → UX agent. Regressies → Beta tester (`docs/qa/TEST-PLAN.md`).*
