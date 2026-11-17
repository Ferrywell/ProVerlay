# ProVerlay — Architecture

## Overview

```
┌─────────────┐   REST + Socket.io   ┌──────────────┐
│   Control   │ ◄──────────────────► │  Node server │
│  Operator   │                      │  :2014       │
│  (browser)  │                      └──────┬───────┘
└─────────────┘                             │ reads/writes (write queue,
                                            │ atomic temp+rename)
┌─────────────┐   Socket.io (read)          ▼
│   Render    │ ◄────────────────── ┌───────────────────────────┐
│  (OBS src)  │                     │ <dataDir>/registry.json   │
└─────────────┘                     │ <dataDir>/projects/<id>/  │
                                    │   project.json (+ .bak)   │
┌─────────────┐   REST (writes)     │   assets/                 │
│  Companion  │ ──────────────────► └───────────────────────────┘
│   module    │ ◄── Socket.io stateChanged
└─────────────┘
```

`<dataDir>` is `./data` when running `node server/index.js`, or
`PROVERLAY_DATA_DIR` (the Electron app points it at its user-data folder).
The server code is a factory: `createApp({ dataDir, port, host })` /
`startServer(...)` in `server/app.js`; `server/index.js` is the CLI/Electron
entry that starts it on `PORT` (default 2014).

## State model

One JSON document per project: `<dataDir>/projects/<id>/project.json`.
`registry.json` lists the projects and the `activeProjectId`; only the active
project is loaded and served as "the state".

```json
{
  "version": 4,
  "client": { "name": "", "notes": "" },
  "brandId": null,
  "brand": { "name": "", "fontFamily": "...", "fontUrl": "", "colors": { "primary": "...", "secondary": "...", "text": "...", "background": "...", "accent": "..." } },
  "settings": { "canvasWidth": 1920, "canvasHeight": 1080, "fontSize": 2.2, "padding": 2.5, "canvasBackground": "transparent" },
  "graphics": [
    {
      "id": "lower-third-3f9a1c2e",
      "type": "lowerThird",
      "name": "Host Lower Third",
      "visible": false,
      "soloVisible": false,
      "position": "bottom-left",
      "operator": false,
      "transition": { "in": "auto", "out": "auto", "duration": 450 },
      "data": { "name": "...", "title": "...", "company": "..." }
    }
  ]
}
```

`GET /api/state` adds two runtime-only fields: `projectId` (active project)
and `serverNow` (server clock in ms, used by clients to sync running clocks).
They are never persisted.

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
| `matchScoreboard` | home/away codes & scores, FIFA clock, layout strip |
| `f1Timing` | drivers/session, MultiViewer or manual |
| `hockeyScorebug` | home/away codes & scores & colors, quarter countdown clock + SVG ring |

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

All writes go through the REST API. Every read-modify-write runs inside a
single server-side write queue, so concurrent requests (several operators,
Companion buttons) are applied one after another and never overwrite each
other. Errors are JSON: `{ "error": "message" }`.

### REST — state and graphics

| Method | Path | Body | Description |
|--------|------|------|-------------|
| GET | `/api/state` | | Full state of the active project (+ `projectId`, `serverNow`) |
| PATCH | `/api/state` | partial state | Deep-merge into the state (see validation) |
| GET | `/api/graphics` | | All graphics |
| POST | `/api/graphics` | `{ type, name? }` | Create a widget; returns the graphic (201) |
| GET | `/api/graphics/:id` | | One graphic |
| PATCH | `/api/graphics/:id` | partial graphic | Deep-merge into one graphic; returns the graphic |
| DELETE | `/api/graphics/:id` | | Remove a graphic |
| POST | `/api/graphics/:id/toggle` | `{ visible? }` | Set `visible`, or flip it when omitted (flip computed server-side) |
| POST | `/api/graphics/:id/toggle-solo` | `{ soloVisible? }` | Same for `soloVisible` (`/render?graphic=<id>`) |
| POST | `/api/graphics/:id/hide` | | Hide (for `lowerThirdShow` also clears the live entry) |
| POST | `/api/graphics/:id/score` | `{ side, delta? }` or `{ side, value }` | Atomic score change (see below) |
| POST | `/api/graphics/:id/clock` | `{ action, ms? }` | Atomic clock action (see below) |
| GET | `/api/graphics/:id/entries` | | `lowerThirdShow` roster |
| POST | `/api/graphics/:id/entries` | `{ name, title?, company?, keywords? }` | Add a person (201) |
| PATCH | `/api/graphics/:id/entries/:entryId` | partial entry | Edit a person |
| DELETE | `/api/graphics/:id/entries/:entryId` | | Remove a person (also takes the widget off air) |
| POST | `/api/graphics/:id/entries/:entryId/show` | | Put that person on air |
| GET | `/api/brands` | | Brand presets (bundled `templates/brands` + `<dataDir>/brands`) |
| POST | `/api/brands/:id/apply` | | Apply a preset to `brand`/`brandId` |
| GET | `/api/f1/:id/live` | | Current F1 tower rows (`f1Timing`) |
| POST | `/api/f1/:id/import-drivers` | | Copy the MultiViewer grid into `data.drivers` |
| POST | `/api/system/open-multiviewer` | | Try to open the MultiViewer app locally |
| GET | `/api/device` | | Device class from the User-Agent |
| GET | `/api/network` | | LAN URLs for operator/control/render |

Widget types accepted by `POST /api/graphics`: `matchScoreboard`,
`hockeyScorebug`, `customTicker`, `streamCountdown`, `lowerThird`,
`lowerThirdShow`, `message`, `quizShow`, `f1Timing`. Ids are generated by the
server (`<type-slug>-<8 hex>`).

### REST — projects and assets

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects` | Registry entries with an `active` flag |
| POST | `/api/projects` | `{ name, clientName? }` (strings) → new project (201) |
| POST | `/api/projects/:id/activate` | Load + validate, then make active; returns `{ ...project, state }`. 404 unknown id, 422 damaged project (active project unchanged) |
| GET | `/api/projects/active/export` | Download the active project as `.proverlay` (zip) |
| POST | `/api/projects/import` | multipart `file` (`.proverlay`) → new, inactive project (201) |
| GET | `/api/projects/:id/assets` | List assets |
| POST | `/api/projects/:id/assets` | multipart `file` → upload an asset |
| POST | `/api/projects/:id/analyze-image` | multipart PNG/WebP → region analysis (compose) |
| POST | `/api/projects/:id/compose-widget` | Create a widget from a composed PNG |
| GET | `/projects/:id/assets/<file>` | Serve an asset (static) |

Asset types (upload, import, serving): `png`, `jpg`, `jpeg`, `webp`, `gif`,
`ttf`, `otf`, `woff`, `woff2`. SVG and HTML are refused because they can
carry script. Uploads are capped at 25 MB.

### Atomic score and clock operations

For `matchScoreboard` and `hockeyScorebug`. They exist so clients do not have
to send their (possibly stale) cached `data` back: the change is computed on
the server inside the write queue. Both return the updated graphic.

`POST /api/graphics/:id/score`

- `{ "side": "home" | "away", "delta": 1 }` — add `delta` (integer −100…100,
  default `1`); the score never goes below 0.
- `{ "side": "home" | "away", "value": 3 }` — set an absolute score.

`POST /api/graphics/:id/clock` — `{ "action": "...", "ms": <number> }`

| action | matchScoreboard (counts up, `minute`/`second`) | hockeyScorebug (counts down, `remainingMs`) |
|--------|-----------------------------------------------|---------------------------------------------|
| `start` | Start from the frozen time. **No-op when already running** (elapsed time is kept) | Same; does not run during `break` or at 0 |
| `pause` | Freeze the live time | Freeze the live remaining time |
| `toggle` | `start` when stopped, `pause` when running | idem |
| `reset` | Stop at `ms` (default 0:00), clears `stoppageTime` | Stop with a full quarter (`remainingMs = quarterMs`) |
| `adjust` | Add `ms` (may be negative, rounded to seconds); keeps running | Add `ms` to the remaining time; keeps running |
| `set` | Set the time to `ms`; keeps the run state | Set remaining to `ms` (clamped to the quarter); keeps the run state |

Semantics match the browser helpers in `public/shared/match-utils.js`,
`public/shared/operate-match.js` (`adjustMatchClock`) and
`public/shared/hockey-utils.js`. The dashboard, operator and Companion still
send whole `data` objects today; moving them to these endpoints is a planned
follow-up.

### Validation

Requests that would store an unloadable shape are rejected with **400** and a
message naming the field:

- Bodies must be JSON objects; `__proto__`, `constructor` and `prototype`
  keys are rejected anywhere in a payload.
- `PATCH /api/state` accepts only `version`, `client`, `brandId`, `brand`,
  `settings` and `graphics` (array of graphics with string `id`/`type`,
  unique ids). `projectId`/`serverNow` are ignored. For compatibility a
  top-level `colors` object is applied as `brand.colors`.
- `PATCH /api/graphics/:id`: `id` and `type` are immutable (echoing the
  current value is fine); `visible`/`soloVisible`/`operator` booleans,
  `name`/`position` strings, `transition`/`data` objects. Score fields must be
  non-negative integers; `f1Timing` `multiviewer.host` must be local (see
  below).
- Merging never turns an object into an array, an array into an object, or an
  object/array into a scalar or `null`; arrays replace arrays.
- Unknown widget types (including prototype names such as `constructor`) are
  rejected.

The same structural checks run when a project is loaded, activated or
imported, and before every save.

### Socket.io

Read-only. All writes use REST.

| Event | Direction | Payload |
|-------|-----------|---------|
| `stateChanged` | server → client | full state, sent on connect and after every change |
| `getState` | client → server | ack(state) |
| `f1TimingUpdate` | server → client | `{ graphicId, rows, session, status }` |

### LAN security model

ProVerlay has no login: anyone who can reach the port on the local network can
operate it. The server protects against web pages, not against LAN users:

- **Origin check** (REST and the Socket.io handshake): requests without an
  `Origin` header (Companion, curl, OBS) are allowed. Requests with an
  `Origin` are allowed only if its host is local — `localhost`, a
  loopback/private/link-local IP (10/8, 172.16/12, 192.168/16, 169.254/16,
  100.64/10, `::1`, `fc00::/7`, `fe80::/10`), a single-label name, `*.local`,
  `*.lan`, `*.home.arpa`, `*.internal`, this machine's hostname, or a name in
  `PROVERLAY_ALLOWED_HOSTS` (comma separated). Anything else gets **403**.
  There is no CORS.
- **Host check**: the `Host` header must be an IP literal or one of those
  local names, which blocks DNS-rebinding attacks.
- **Paths**: project ids must match `^[a-z0-9][a-z0-9-]*$` and exist in the
  registry; resolved paths are checked to stay under `projects/`.
- **Uploads / imports**: extension allow-list (no SVG/HTML), every response
  sends `X-Content-Type-Options: nosniff`. Imports are capped at 2000 entries
  and 300 MB uncompressed, extracted into a staging folder and only moved into
  place when complete and valid; errors never include filesystem paths.
- **MultiViewer**: `f1Timing` only connects to hosts on the local network.

### Reliability

- Writes are serialized and atomic (temp file + rename, retried on Windows
  `EPERM`/`EBUSY`). Each save keeps the previous version as
  `project.json.bak`.
- On startup a damaged active project is restored from `project.json.bak`; if
  that fails the server falls back to the `blank` project (recreating it if
  needed) and keeps running. Damaged files are kept as `*.corrupt-<time>`. A
  damaged `registry.json` is rebuilt from the project folders.
- Handler errors become JSON 4xx/5xx responses; unhandled rejections are
  logged instead of stopping the process.

### Ticker messages (`customTicker.data.messages`)

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

## Render engine

1. Fetch initial state via REST
2. Subscribe to `stateChanged`
3. For each visible graphic: mount DOM layer at position
4. On hide: play leave animation, remove layer
5. Theme via CSS variables on `:root`

## Companion integration

See `docs/COMPANION.md`. The module connects to `http://<host>:2014`:
- Socket.io `stateChanged` → refresh action choices, feedbacks and presets
- Actions call the REST API (toggle, toggle-solo, graphic/state PATCH,
  lower-third show/hide)
- Requests from Companion carry no `Origin` header and pass the LAN guard

## Tests

`npm test` runs the `node:test` suites in `test/`. Each suite starts the real
server on port 0 with a fresh temporary data dir. CI runs them on Linux,
Windows and macOS (`.github/workflows/ci.yml`).

## File ownership

| Path | Owner |
|------|-------|
| `server/` | Lead developer |
| `data/projects/*/project.json` | Lead (schema), UX (defaults) |
| `public/control/` | UX designer |
| `public/render/render.js` | Lead developer |
| `public/render/render.css` | UX designer |
| `themes/` | UX designer |
| `companion/` | Lead developer |
| `docs/ux/` (local, not in git) | UX designer |
| `docs/qa/` (local, not in git) | Beta tester |
