# Frontend Design Pass — 11 juni 2026 (operator chrome + score semantics)

## Pages touched

- `public/operator/` — compact header, score button colors, focus chip logic
- `public/shared/operate-panel.css` — operator ticker row alignment with dashboard

## Philosophy alignment

- **Content over chrome:** sync indicator moved into nav bar (dot-only); standalone sync row removed — saves ~36px before first widget.
- **Honest hierarchy:** green (`button--live`) reserved for Go live / Start clock; score +/- uses neutral gray + subtle tint — no false primary actions.
- **Progressive disclosure:** focus chip hidden when only one operator widget (redundant with card context).

## Changes

### Before → After

| Area | Before | After |
|------|--------|-------|
| Header chrome | Nav bar + separate sync bar row + focus chip subtitle | Single compact nav; sync dot inline next to Preview; focus chip only when 2+ widgets |
| Nav padding | `--pv-space-xs` top + sync bar `--pv-space-sm` bottom | `--pv-space-2xs` top/bottom; safe-area preserved |
| Score − / + | `secondary` / **`primary` blue** | **`gray`** / **`tinted`** (neutral, not on-air) |
| Pause clock | Already gray when running | Unchanged — verified correct |
| Ticker rows | Duplicate list reset in operator.css | Shared `operate-panel.css` row layout; operator-scoped compose padding |
| Main gap | `--pv-space-lg` | `--pv-space-md` + `--pv-space-xs` top padding |

### Files

- `public/operator/index.html` — sync pill into `pv-nav-bar__side--end`; removed `pv-sync-bar`
- `public/operator/operator.css` — compact nav overrides, score button class, tighter section heads
- `public/operator/operator.js` — score button classes; focus chip gated on `itemCount > 1`; `operator--single` body class
- `public/shared/operate-panel.css` — `.operator` ticker row + compose input sizing

## Responsive verified

- [x] CSS review — safe-area insets on nav + main margins preserved
- [ ] 390 phone — visual spot-check pending
- [ ] 768 tablet — visual spot-check pending

## Open for UX agent

- Sync dot-only in nav: consider tooltip or brief toast on offline transition (screen reader still gets `status-label`)
- Quiz “Reveal answer” still uses `button--primary` when hidden — intentional secondary-primary, not score control

---

# Lead Dev — 11 juni 2026 (Overlay layout editor + fixes)

## New page

- `public/layout/` — **Overlay layout editor** (`/layout`, link in dashboard header)
  - Live WYSIWYG canvas: embeds `/render?preview=1` (same-origin iframe, real render pipeline)
  - Layer panel: eye = editor-only visibility (postMessage, never touches live state), LIVE badge, FIXED badge
  - Drag-to-place: writes back to each widget's own settings (source of truth):
    - strip scoreboard → `data.layout.placement`
    - quiz → `data.panel`
    - lower thirds (PNG template) → `data.template.layout.placement`
    - countdown/lower third/message → `position: 'custom'` + `data.placementFree {x,y}` (new render support, `.pos-custom`)
  - Center snap, arrow-key nudge, X/Y/W inspector

## Render changes

- `position: 'custom'` + `data.placementFree` (free placement, center anchor)
- `?preview=1` mode: renders all graphics regardless of `visible`, layer toggles via postMessage
- Layer position class re-applied on every sync (position changes now apply live)
- Clock plate crop animates (`clip-path` transition 480ms); clock digits sit in the cropped zone so they crop along

## Bug fixes

- **`currentProjectId()` undefined in `render.js`** — ReferenceError when rendering the ticker killed every graphic after it in the sync loop (regression from ticker preview refactor)
- Ticker preview in dashboard: removed `min-height` that pushed text above the tape at narrow widths; bar now bottom-aligned in frame
- `custom` option added to position selects (widget + countdown panels)

---

# Frontend Design Pass — 11 juni 2026 (iOS design pass)

## Pages touched

- `public/shared/tahoe.css` — iOS tokens + nav bar, grouped list, segmented control
- `public/shared/form-controls.css` — styled selects/inputs
- `public/operator/` — full restructure (nav, grouped widgets, segmented clock)
- `public/control/` — mobile operator hint
- `public/project/` — nav bar + segmented canvas presets
- `public/editor/` — desktop-only gate ≤767px

## Philosophy alignment

- **Deference:** operator widgets use inset grouped lists (white on `#f5f5f7`) instead of glass-in-glass cards.
- **Clarity:** nav title fixed to “Live control”; widget names only in cards when multiple operator overlays.
- **Cross-platform:** system font stack, CSS-only components, `@supports` glass fallback — no SF Symbols / native APIs.

## Changes

See **`docs/ux/DEV-HANDOFF-IOS-DESIGN-PASS.md`** for lead-dev sync (DOM/class renames, no API changes).

## Responsive verified

- [x] 393×852 operator (iPhone 14 Pro, browser CDP)
- [x] 393×852 control (mobile hint visible)
- [x] 768 tablet — operator layout max-width 720px centered (CSS review)
- [ ] Windows Electron smoke — pending (lead dev na rebuild `dist/`)

## Open for UX agent

- Control dashboard header still desktop-style; intentional — phone users should use Operator.
- Segmented clock buttons: consider Dutch labels if product language switches.

---

# Frontend Design Pass — 11 juni 2026 (v2)

## Pages touched

- all `public/` pages — full English copy pass (operator/render/shared by lead, rest via translation agent)
- `public/operator/` — navigation & live controls rework
- `public/render/` — penalty bars, default lower third, animation fix (lead-approved render changes)

## Philosophy alignment

- **Task-first:** operator back-button now top-left (natural reach), Preview in header; removed the fixed bottom nav bar that covered content.
- **Real state:** ticker card now has a live speed slider (debounced, px/s readout); lower thirds card rebuilds in place without wiping inputs in other cards.
- **Clarity:** all UI copy in English with consistent terminology (Go live/Hide, Live/Off pills, "Lower thirds" + "people", Match score/Ticker/Stream countdown).

## Changes

- `public/operator/index.html|css|js`: header nav (`.op-back`, `.op-header__actions`), ticker speed slider (`.field--slider`), lower-third touch grid, full English copy
- `public/render/render.css`: penalty bars redesigned at broadcast scale (cqw units on `.match-board` container, glassy plate, larger dots); default `.lt-plate` lower third (dark glass, brand accent border, nowrap); enter/leave animations moved from `transform` to `translate` so the inline centering transform survives (fixes overlay jumping right after toggle)
- `public/shared/match-utils.js`: clock minutes always 2 digits (00:00 centered like 68:00); PERIOD_OPTIONS in English
- `public/shared/project-fonts.js`: font option labels in English
- `server/*`: API error messages and default widget names in English
- bugfix `public/editor/editor.js`: missing `inspectorTitle` DOM ref crashed init ("Could not load state")

## Responsive verified

- [x] 1024 browser (operator + control via CDP screenshots)
- [ ] 768 tablet — visual spot-check pending
- [ ] 390 phone (operator) — visual spot-check pending

## Open for UX agent

- Control: green "Hide" button doubles as live indicator — consider explicit on-air affordance separate from the action label
- Project names in data ("Blanco klant", "Voetbal Demo Club") are user data, not translated

---

# Frontend Design Pass — 10 juni 2026

## Pages touched

- `public/control/` — dashboard
- `public/operator/` — live bediening
- `public/editor/` — scorebord editor
- `public/project/` — project aanpassen
- `public/shared/tahoe.css` — gedeelde tokens & componenten

## Philosophy alignment

- **Task-first:** overlay-lijst blijft visuele anker; live-knop gegroepeerd apart van secundaire acties (Bedienen, Editor, Render URL).
- **Geen clichés:** geen stat cards of decoratieve widgets; netwerk-panel collapsible i.p.v. permanent sidebar-theater.
- **Echte state:** On-air pill op overlay-cards en operator-cards; groene rand bij live overlays.
- **Menselijke labels:** overlay-type toont Nederlandse namen (Wedstrijdscore, Tickertape, …) i.p.v. implementatienamen.
- **Touch-safe operator:** 52px+ targets, safe-area padding, penalty-toolbar verborgen wanneer inactief.

## Changes

### `public/shared/tahoe.css`

- Spacing scale tokens (`--pv-space-*`).
- Gedeelde `.field`, `.panel-head`, `.action-group`, `.pv-details` (collapsible).
- `.pill--muted`, `.pill--type`, `.button--compact`, `.inspector-empty-state`.
- Focus-visible op textarea; sync-dot glow bij verbinding.

### `public/control/`

- **index.html:** Netwerk in `<details>`; inspector panels met `panel--inspector`; lege inspector met eyebrow + dashed empty state.
- **control.css:** Overlay-cards als kolom met footer (acties vs live-knop); toolbar in subtiele box; inspector header-scheiding; responsive stack footer op ≤980px.
- **control.js:** `TYPE_LABELS` mapping; card markup met meta-pills en gegroepeerde footer (minimale presentatiewijziging).

### `public/operator/`

- **operator.css:** Safe-area op alle zijden; `is-live` card glow; op-card-head met live-pill; 52px inputs/nav/ticker-delete; penalty-sectie dim + toolbar hidden wanneer niet actief.
- **operator.js:** Live-pill + `is-live` class in templates; `updateLiveState()` voor sync; penalty `is-active` class.

### `public/editor/`

- **index.html:** Toolbar in `toolbar-group`; inspector eyebrow + head wrapper.
- **editor.css:** Canvas hero (min 52vh); inspector max 320px; sticky header; toolbar border; breakpoint **900px** stack; dashed empty inspector.

### `public/project/`

- **index.html:** Canvas settings in `canvas-settings` box met preset-label en button group.
- **project.css:** Highlighted settings panel; 2-koloms width/height; preset eyebrow; hover op asset rows; responsive single column ≤900px.

## Responsive verified

- [x] 1920 desktop — control 2-col, editor workspace+inspector, project 2-col assets
- [x] 768 tablet — control sidebar stacks; operator centered max 720px; editor stacks at 900px
- [x] 390 phone (operator) — 52px touch targets, safe-area bottom nav, score clamp typography

## Open for UX agent

- Widget type dropdown label nog "Widget type" — overweeg "Overlay type".
- Inspector fieldsets (klok, zichtbare widgets) kunnen accordion worden bij lange formulieren.
- Operator penalty-sectie: copy wanneer inactief ("Schakel penalties in om te bedienen").
- Project canvas: live aspect-ratio preview bij wijziging width/height (vereist kleine JS hook).

---

# Visual feedback pass — 11 juni 2026

## Pages touched

- `public/shared/operate-panel.css` (new) — ticker rows, compose row, dashboard embed
- `public/shared/operate-handlers.js` — embedded operate shell, shared markup
- `public/control/` — operate-panel CSS link, compact inspector head
- `public/operator/` — aligned ticker markup + compose row; removed duplicate ticker CSS

## Fixes

- Ticker message row layout broken on dashboard (missing CSS + wrong field grid)
- Duplicate operate titles collapsed to panel head + status line
- Delete button oversized → `button--icon` ghost style
- Add message inline with input (dashboard + operator)

## Doc

Full findings: **`docs/ux/VISUAL-FEEDBACK-PASS.md`**

## Responsive verified

- [x] 1440 desktop — ticker operate panel row alignment
- [ ] iPhone operator ticker — spot-check pending

## Open

- Match score inline operate in dashboard panel
- Operator vertical chrome reduction
- Score +/- button color semantics on operator

## Follow-up — 11 juni 2026 (hervat na token-limiet)

- Heading weight 500 (control + tahoe + operator touch)
- Widget-type color badges per brief §7.3
- Dashboard solid cards (no glass blur on `.dashboard .glass`)
- Ghost buttons on overlay card actions
- Project & network auto-collapse + side-stack dim during operate focus
- Header button grouping (nav | Preview)
