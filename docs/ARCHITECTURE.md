# ProVerlay — Architecture

## Overview

```
┌─────────────┐     REST/WS      ┌──────────────┐
│   Control   │ ◄──────────────► │  Node server │
│  (browser)  │                  │   :2014      │
└─────────────┘                  └──────┬───────┘
                                        │
┌─────────────┐     Socket.io           │ reads/writes
│   Render    │ ◄───────────────────────┤
│  (OBS src)  │                         ▼
└─────────────┘                  ┌──────────────┐
                                 │ data/projects/│
┌─────────────┐     Socket.io    └──────────────┘
│  Companion  │ ◄──────────────►
│   module    │
└─────────────┘
```

## State model

Single JSON document (`data/show.json`):

```json
{
  "version": 1,
  "theme": "clean",
  "colors": { "primary": "...", "text": "...", ... },
  "settings": { "fontSize": 2.4, "padding": 3, "canvasBackground": "transparent" },
  "graphics": [
    {
      "id": "lt-host",
      "type": "lowerThird",
      "name": "Host Lower Third",
      "visible": false,
      "position": "bottom-left",
      "data": { "name": "...", "title": "...", "company": "..." }
    }
  ]
}
```

### Graphic types

| type | data fields |
|------|-------------|
| `lowerThird` | name, title, company |
| `lowerThirdShow` | entries[] (id, name, title, company), activeEntryId, template |
| `quizShow` | questions[] (id, question, options[4], correct), activeQuestionId, revealed, panel (x, y, width in vw/vh) |
| `message` | text |
| `customTicker` | messages[] (`{ id, text, enabled }`), speed, fontSize, color, textInsetLeft, fadeWidth, layout.background |
| `clock` | format (`12H` / `24H`) |
| `countdown` | seconds, running, format |
| `image` | src, alt |

### Transitions

Every graphic has an optional top-level `transition` object that controls show/hide behavior in the render:

```json
{ "transition": { "in": "auto", "out": "auto", "duration": 450 } }
```

- `in` / `out`: `auto` (type-specific animation, default), `fade`, `wipe`, `cut`
- `duration`: milliseconds (100–3000), applies to fade/wipe
- Editable per widget in the dashboard inspector ("Transition" panel)

### Positions

`bottom-left`, `bottom-center`, `bottom-full`, `top-left`, `top-center`, `top-right`

## Routes (UI)

| Path | Description |
|------|-------------|
| `/` | UA redirect: `mobile`/`tablet` → `/operator`, `desktop` → `/control` (`?view=` overrides) |
| `/control` | Desktop dashboard |
| `/operator` | Multi-widget operator (`?focus=<id>` highlights one widget) |
| `/operate` | Single-widget operate view (`?graphic=<id>` or `/operate/<id>`) |
| `/editor` | WYSIWYG editor (`?graphic=<id>`; `/editor/<id>` redirects to query form) |
| `/render` | OBS browser source (`?graphic=<id>` solo layer; uses `soloVisible`, not `visible`) |

Graphics have two visibility flags: `visible` (combined `/render`) and `soloVisible` (`/render?graphic=<id>`).

Client-side device class (layout): `public/shared/device.js` — `desktop` (≥1024px, non-touch), `tablet`, `mobile`.

## API

### REST

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/state` | Full show state |
| PATCH | `/api/state` | Partial update (theme, colors, settings) |
| GET | `/api/graphics` | All graphics |
| GET | `/api/graphics/:id` | Single graphic |
| PATCH | `/api/graphics/:id` | Update graphic data/style/visibility |
| POST | `/api/graphics/:id/toggle` | Toggle or set visibility |

#### Ticker messages (`customTicker.data.messages`)

Shape (v1.0):

```json
[
  { "id": "msg-abc123", "text": "Breaking news", "enabled": true },
  { "id": "msg-def456", "text": "Draft line", "enabled": false }
]
```

- Legacy `string[]` is migrated on project load (strings → `enabled: true`).
- New messages default `enabled: false`.
- Render rotation uses only `enabled: true` messages.
- Reorder: `PATCH /api/graphics/:id` with full `data.messages` array in desired order.
- Toggle: `PATCH` with updated `enabled` on one or more items (by `id`).

### Socket.io

| Event | Direction | Payload |
|-------|-----------|---------|
| `stateChanged` | server → client | full state object |
| `getState` | client → server | ack(state) |
| `patchState` | client → server | patch object, ack(state) |
| `toggleGraphic` | client → server | `{ id, visible }`, ack(graphic) |

## Render engine

1. Fetch initial state via REST
2. Subscribe to `stateChanged`
3. For each visible graphic: mount DOM layer at position
4. On hide: play leave animation, remove layer
5. Theme via CSS variables on `:root`

## Companion integration (planned)

Mirror Holographics pattern:
- Connect via Socket.io to `http://host:3100`
- Listen `stateChanged` → refresh action choices + presets
- Actions: `showGraphic`, `hideGraphic`, `toggleGraphic`, `setTheme`, `setColor`
- Feedbacks: `graphic_visible`
- Auto-generate preset per graphic

## File ownership

| Path | Owner |
|------|-------|
| `server/` | Lead developer |
| `data/show.json` | Lead (schema), UX (defaults) |
| `public/control/` | UX designer |
| `public/render/render.js` | Lead developer |
| `public/render/render.css` | UX designer |
| `themes/` | UX designer |
| `companion/` | Lead developer |
| `docs/ux/` | UX designer |
| `docs/qa/` | Beta tester |
