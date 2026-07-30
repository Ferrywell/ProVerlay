# Match graphics architecture

ProVerlay match overlays share one **universal graphic model** (`matchScoreboard`) with sport-specific presets, modular layout layers, and bindable elements. This document describes the target architecture, current state, and phased roadmap.

## Universal graphic model

```json
{
  "id": "score-main",
  "type": "matchScoreboard",
  "data": {
    "sport": "football",
    "homeCode": "NED",
    "awayCode": "JAP",
    "homeScore": 0,
    "awayScore": 0,
    "clock": { "period": "second_half", "minute": 0, "second": 0, "running": false },
    "widgets": { "homeCode": true, "awayCode": true, "homeScore": true, "awayScore": true, "clock": true },
    "layout": {
      "refWidth": 3197,
      "refHeight": 335,
      "background": "scorebar.png",
      "placement": { "x": 50, "y": 3.5, "width": 35.2, "anchor": "top-center" },
      "clockPlate": {
        "enabled": true,
        "mode": "pill",
        "heightPx": 120,
        "minWidthPx": 180,
        "paddingXPx": 24,
        "borderRadiusPx": 60,
        "background": "rgba(0,0,0,0.85)",
        "gapPx": 12,
        "anchor": "right"
      }
    },
    "elements": [
      { "bind": "homeCode", "x": 13, "y": 50, "fontSize": 240 },
      { "bind": "clock", "x": 95.5, "y": 49, "fontSize": 219, "anchor": "center-right" }
    ]
  }
}
```

| Field | Role |
|-------|------|
| `sport` | Preset key (`football`, `basketball`, `cs2`, …) — selects element packs and clock rules |
| `layout` | Strip/plate geometry, PNG background, placement on canvas |
| `elements[]` | Bindable widgets positioned in ref-space (%, refWidth scaling) |
| `widgets` | Visibility toggles per bind key |
| `clock` | Match clock state (period, stoppage, running) |

`matchScoreboard` is the **template**; presets supply default `elements`, `layout`, and optional extra binds — not separate hardcoded render branches per sport.

## Modular layers

```
┌─────────────────────────────────────────────────────────┐
│  Canvas placement (layout.placement, strip vs full)      │
├─────────────────────────────────────────────────────────┤
│  Background layer — PNG strip or transparent             │
├─────────────────────────────────────────────────────────┤
│  Element layer — bindable text (codes, scores, labels)   │
├─────────────────────────────────────────────────────────┤
│  Clock style — pill (CSS) | png (crop) | none          │
├─────────────────────────────────────────────────────────┤
│  Branding — project brand fonts/colors per element       │
└─────────────────────────────────────────────────────────┘
```

### Clock styles

| Mode | Config | Render behaviour |
|------|--------|------------------|
| `pill` | `layout.clockPlate.mode: "pill"` | CSS `.clock-pill` behind clock text; width grows with content; height/radius fixed |
| `png` | `layout.clockPlateWidth` (legacy) | Clip-path crops PNG clock zone when clock hidden |
| `none` | `clockPlate.enabled: false` | Clock text only, no plate |

Pill sizing uses `refWidth` scaling (`cqw` in modern browsers, px fallback via `data-render-compat` for vMix).

### Branding

Per-project `brand.fontFamily`, `brand.colors`, and per-element `fontFamily` / `color` override defaults. Assets live under `data/projects/{id}/assets/`.

## Sport presets (recommendation)

**Do not** add `if (sport === 'basketball')` branches in `render.js`. Instead:

1. **`data.sport`** selects a preset pack (JSON or JS module).
2. **Element packs** define which binds exist and default positions.
3. **Clock rules** (periods, stoppage, countdown vs count-up) live in preset config or small strategy modules.
4. **Render** stays generic: `resolveBindText(bind, data)` + `elements[]` loop.

### Football (current)

- Binds: `homeCode`, `awayCode`, `homeScore`, `awayScore`, `clock`, optional `penalties`
- Clock: count-up, stoppage (`45+`), halves + extra time
- Strip PNG + CSS clock pill (Odido)

### Basketball (next)

- Same `matchScoreboard` type with `sport: 'basketball'`
- Preset adds: quarter clock, shot clock bind (optional), team names prominent
- Element pack replaces football-specific penalty widgets

### Esports (CS2, etc.)

Two viable paths:

| Approach | Pros | Cons |
|----------|------|------|
| **A. Flexible `matchScoreboard` + `sport: 'cs2'` preset** | One operate UI pattern; shared clock/score infra | Complex element packs; crowded inspector |
| **B. Dedicated graphic types** (`esportsScoreboard`, `roundTimer`) | Clear separation; simpler per-game UX | More types to maintain |

**Recommendation:** Start with **preset packs on `matchScoreboard`** for map score + round timer on one strip. Add **separate graphic types** only when a game needs wholly different operate flows (e.g. economy overlay, agent picks) that do not fit the score strip model.

Esports-specific binds (future): `mapScore`, `round`, `bombTimer`, `teamEconomy` — registered in preset element packs, resolved via extended `resolveBindText`.

## Migration: Odido football

| Before | After |
|--------|-------|
| Clock on PNG black zone | `layout.clockPlate.mode: "pill"` — CSS pill, PNG zone optional |
| Hide clock via `clockPlateWidth` clip | Pill opacity hide; `clockPlateWidth` kept as fallback when `mode !== 'pill'` |
| Team codes in widget inspector only | Editable in `/control` operate + `/operator` match card |
| No sport field | `data.sport: "football"` for preset hook |

Existing projects without `clockPlate` continue using PNG crop if `clockPlateWidth > 0`.

## Phased roadmap

| Phase | Status | Deliverable |
|-------|--------|-------------|
| 1 | ✅ Done | CSS clock pill (`layout.clockPlate`), vMix px compat |
| 2 | ✅ Done | Team code/name editing from operate UI |
| 3 | Planned | Preset registry (`sport` → element pack + clock rules) |
| 3b | Planned | **Field hockey (veldhockey)** preset: quarters/halves, countdown option, no stoppage, optional PC binds — reuse `matchScoreboard`, do not fork a new type unless operate UI outgrows presets (see `docs/qa/ROBUSTNESS-PASS-2026-07-30.md`) |
| 4 | Planned | Basketball preset (quarters, shot clock bind) |
| 5 | Planned | Esports scoreboard preset or dedicated type |
| 6 | Future | Editor panel for `clockPlate` tuning |
| 7 | Future | Companion actions per sport preset |

## Key files

| Area | Files |
|------|-------|
| Render | `public/render/render.js`, `public/render/render.css` |
| Layout/scaling | `public/shared/canvas-layout.js` |
| Match data/bindings | `public/shared/match-utils.js`, `public/shared/operate-match.js` |
| Operate UI | `public/shared/operate-handlers.js`, `public/operator/operator.js` |
| Defaults | `server/matchClock.js` |
| Reference project | `data/projects/odido/project.json` |

## Related docs

- [ARCHITECTURE.md](./ARCHITECTURE.md) — server, state, API
- [PRODUCT.md](./PRODUCT.md) — operator UX goals
