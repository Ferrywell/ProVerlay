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
`PROVERLAY_EXPERIMENTAL` (comma separated) switches on experimental features;
the only flag today is `f1` (F1 timing tower).
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

`GET /api/state` (and every `stateChanged`) adds runtime-only fields that are
never persisted (clients may echo them back in a `PATCH /api/state`; they are
ignored):

- `projectId`: the active project's id
- `projectName`: the active project's display name from the registry
  (changes on rename)
- `customCssVersion`: short hash of the active project's `custom.css`, `''`
  when it has none (changes on every save; /render reloads the sheet)
- `experimental`: enabled experimental flags from `PROVERLAY_EXPERIMENTAL`
  (e.g. `["f1"]`); pages and the Companion module hide experimental widget types
  that are not listed (`server/experimental.js`, `public/shared/experimental.js`)
- `widgetTypes`: which widget types have steps and which actions they offer,
  for remote controls (see [Steps and actions](#steps-and-actions))
- `serverNow`: server clock in ms, used by clients to sync running clocks

Data source keys stored in `project.json` (see [DATA-SOURCES.md](DATA-SOURCES.md)):
`dataSources[]`, `variables`, `variableSource`, `sourceVariables`, `dataSettings`.
A bound widget has `data.dataBinding = { sourceId, columns }`. Source files and
caches live in `projects/<id>/data-sources/` and travel with export, import and
duplicate.

### Project folder

```
<dataDir>/
  registry.json              { activeProjectId, projects: [{ id, name, createdAt, updatedAt }] }
  projects/<id>/
    project.json             the state (+ project.json.bak, previous save)
    custom.css               optional per-project stylesheet (+ custom.css.bak)
    assets/                  uploaded images and fonts
  trash/<id>-<timestamp>/    deleted projects (moved, never hard-deleted)
```

The id is a slug fixed at creation; the display `name` lives in the registry
and can be renamed freely.

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
| `image` | images[] (`{ id, src, name, alt }`, src = asset file name), activeImageId, variant (`free` / `lowerThirdSlot` / `fullScreen`), size (`{ mode: original \| fitWidth \| fitCanvas \| percent, percent }`), autoHideMs, rotation (`{ enabled, intervalMs }`). Old `{ src, alt }` widgets are migrated on load to a one-image list (`server/imageMigration.js`) |
| `matchScoreboard` | home/away codes & scores, FIFA clock, layout strip |
| `f1Timing` | drivers/session, MultiViewer or manual (experimental, see below) |
| `hockeyScorebug` | home/away codes & scores & colors, quarter countdown clock + SVG ring |

### Describing a widget type

A widget type can be described once, as a list of fields, instead of being
written out in several files. The description lives in
`public/shared/widget-types.js` (loaded by the server and by the pages):

```js
message: describe({
  label: 'Message',            // name on the operate card
  position: 'custom',          // where a new widget is placed
  operator: false,             // listed on /operator when created
  fields: [
    { key: 'text', kind: 'text', label: 'Message text', default: 'Message', live: true, lenient: true }
  ],
  summary: ['text'],           // fields that make up the card's status line
  extraData: { placementFree: { x: 50, y: 82 } }   // default data that is not a field
})
```

| kind | control | value | limits |
|------|---------|-------|--------|
| `text` | one-line input | string | `maxLength` |
| `multiline` | textarea | string | `maxLength` |
| `number` | number input | number | `min`, `max`, `step`, `integer` |
| `boolean` | on/off button | boolean | |
| `choice` | select | one of `options` (`[{ value, label }]` or plain values) | |
| `color` | colour picker | CSS colour text, or `''` for "not set" | |

Every field needs a `default`. Optional: `description` (tooltip), `live` (save
while typing instead of when the field is left) and, for text kinds, `lenient`
(see below).

`public/shared/widget-fields.js` (pure functions, no imports) derives from a
list of fields:

- **the default data** of a new widget (`fieldDefaults`; `server/graphicDefaults.js`
  builds the template from the description);
- **the validation** of a (partial) `data` object (`validateFieldData`, called from
  `server/validation.js` for `PATCH /api/graphics/:id` and `PATCH /api/state`): the
  value must be of the field's kind and within its limits, the message names the
  field (`data.title: at most 80 characters`). Only keys that are sent are
  checked; keys the list does not describe are left alone;
- **the form controls** (`fieldsHtml`) and the conversion of what a control holds
  into a value (`coerceFieldInput`).

`public/shared/operate-fields.js` turns a description into a complete operate
card; `operate-card.js` registers one for every described type. A described type
therefore needs no entry in `graphicDefaults.js`, `validation.js`,
`operate-widgets.js` or `operate-card.js`. What it still needs by hand: its HTML
and CSS on the render, its labels in the dashboard menus, and (for
`{{variables}}`) a line in `public/shared/variables.js`.

`message` and `lowerThird` are described this way. Their text fields are
`lenient`: the API never checked them, so numbers, booleans and `null` are still
accepted and stored as sent (the render shows them as text), and there is no
maximum length. One thing changed: a list or an object in such a field is now
rejected with 400. It used to be stored, after which the field could no longer
be changed (a text can not be merged over a list or object).

**Cards with their own controls** (score, clock, ticker, quiz, images) keep
their module. Such a card can still hand its plain fields to the description:
it sets `fields` on its module and places `fieldsHtml(fields, g.data)` (a card
cell) or `fieldControlsHtml(fields, g.data)` (bare controls for its own grid) in
its `primary()`/`more()` HTML. `operate-card.js` saves, toggles and refreshes
the controls of those fields; the card's own `field()`, `action()` and
`update()` only deal with its custom controls. Fields are top-level keys of
`data`: nested values (`layout.background`) and lists still need their own code.

### Transitions

Every graphic has an optional top-level `transition` object that controls show/hide behavior in the render:

```json
{ "transition": { "in": "auto", "out": "auto", "duration": 450 } }
```

- `in` / `out`: `auto` (type-specific animation, default), `fade`, `wipe`, `cut`
- `duration`: milliseconds (100–3000), applies to fade/wipe
- Editable per widget in the dashboard inspector ("Transition" panel)

### Positions

`center`, `top-left`, `top-center`, `top-right`, `bottom-left`,
`bottom-center`, `bottom-full`, and `custom` (free placement from
`data.placementFree` `{ x, y }` in percent, set by the layout editor).

Defaults for new widgets (`server/graphicDefaults.js`) are chosen so widgets
that are live together do not overlap:

| Type | Default |
|------|---------|
| `matchScoreboard`, `hockeyScorebug` | `top-center` (alternatives for one show) |
| `streamCountdown` | `center` |
| `customTicker` | `bottom-full` |
| `message` | `custom` at x 50 %, y 82 % (bottom center, above the ticker) |
| `lowerThird`, `lowerThirdShow` | `bottom-left` |
| `quizShow` | `top-left` (the panel is placed by `data.panel`, left side) |
| `f1Timing` | `custom` (left side) |
| `image` | `center` (free placement; the lower-third slot and full-screen variants place themselves) |

Existing widgets keep their stored position.

## Routes (UI)

| Path | Description |
|------|-------------|
| `/` | UA redirect: `mobile`/`tablet` → `/operator`, `desktop` → `/control` (`?view=` overrides) |
| `/control` | Desktop dashboard |
| `/operator` | Multi-widget operator (`?focus=<id>` highlights one widget) |
| `/operate` | Single-widget operate view (`?graphic=<id>` or `/operate/<id>`) |
| `/editor` | WYSIWYG editor (`?graphic=<id>`; `/editor/<id>` redirects to query form) |
| `/render` | OBS browser source (`?graphic=<id>` solo layer; uses `soloVisible`, not `visible`) |
| `/debug` | Debug console: live server log, connected outputs, where each graphic's content comes from (data loaded from `GET /api/debug`, **loopback only**) |

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
| POST | `/api/graphics/:id/hide` | | Hide (a `lowerThirdShow` keeps its active person, so "next" continues from there) |
| POST | `/api/graphics/:id/step` | `{ delta: 1 \| -1, wrap? }` | Next / previous item of any widget with steps (see [Steps and actions](#steps-and-actions)) |
| POST | `/api/graphics/:id/actions/:actionId` | the action's payload | Run an action the widget's type declares (see [Steps and actions](#steps-and-actions)) |
| POST | `/api/graphics/:id/score` | `{ side, delta? }` or `{ side, value }` | Atomic score change (see below) |
| POST | `/api/graphics/:id/clock` | `{ action, ms? }` | Atomic clock action (see below) |
| GET | `/api/graphics/:id/entries` | | `lowerThirdShow` roster |
| POST | `/api/graphics/:id/entries` | `{ name, title?, company?, keywords? }` | Add a person (201) |
| PATCH | `/api/graphics/:id/entries/:entryId` | partial entry | Edit a person |
| DELETE | `/api/graphics/:id/entries/:entryId` | | Remove a person (also takes the widget off air) |
| POST | `/api/graphics/:id/entries/:entryId/show` | | Put that person on air |
| GET | `/api/graphics/:id/images` | | `image` widget list |
| POST | `/api/graphics/:id/images` | `{ src, name?, alt? }` or `{ images: [...] }` | Add images (src = a file uploaded with `POST /api/projects/:id/assets`) (201) |
| PUT | `/api/graphics/:id/images/order` | `{ ids }` | New order (every image id once) |
| PATCH | `/api/graphics/:id/images/:imageId` | `{ name?, alt?, src? }` | Edit an image |
| DELETE | `/api/graphics/:id/images/:imageId` | | Remove from the list (the asset file stays; takes the widget off air when it was on air) |
| POST | `/api/graphics/:id/images/:imageId/show` | | Put that image on air |
| POST | `/api/graphics/:id/images/step` | `{ direction: next \| previous, wrap? }` | Next/previous image on air |
| GET | `/api/brands` | | Brand presets (bundled `templates/brands` + `<dataDir>/brands`) |
| POST | `/api/brands/:id/apply` | | Apply a preset to `brand`/`brandId` |
| GET | `/api/f1/:id/live` | | Current F1 tower rows (`f1Timing`, experimental) |
| POST | `/api/f1/:id/import-drivers` | | Copy the MultiViewer grid into `data.drivers` |
| POST | `/api/system/open-multiviewer` | | Try to open the MultiViewer app locally |
| GET | `/api/device` | | Device class from the User-Agent |
| GET | `/api/network` | | LAN URLs for operator/control/render |

Widget types accepted by `POST /api/graphics`: `matchScoreboard`,
`hockeyScorebug`, `customTicker`, `streamCountdown`, `lowerThird`,
`lowerThirdShow`, `message`, `quizShow`, `image`, and `f1Timing` only while
`PROVERLAY_EXPERIMENTAL=f1` is set (otherwise 400). Existing `f1Timing` widgets can
always be updated, toggled and rendered. Ids are generated by the server
(`<type-slug>-<8 hex>`).

### REST — data sources and variables

See [DATA-SOURCES.md](DATA-SOURCES.md). Status of every source goes to the pages as
the `dataSourcesStatus` socket event (same body as `GET /api/data-sources`).

| Method | Path | Body | Action |
|--------|------|------|--------|
| GET | `/api/data-sources` | | Sources of the active project with status (`state`, `lastUpdated`, `rowCount`, `headers`, `sheets`, `error`, `held`), `variableSource`, `dataSettings` |
| POST | `/api/data-sources` | `{ url, name?, pollMs? }` or `{ path, name? }` | Add a sheet link, or link a local file (**loopback only**) (201) |
| POST | `/api/data-sources/upload` | multipart `file` (`.csv`/`.xlsx`), `name?` | Upload a file as a source (201) |
| PATCH | `/api/data-sources/:id` | `{ name?, pollMs?, holdWhileOnAir?, sheet?, url? }` | Edit a source |
| DELETE | `/api/data-sources/:id` | | Remove it and its files; bound widgets keep their list |
| POST | `/api/data-sources/:id/refresh` | | Re-read now |
| POST | `/api/data-sources/:id/file` | multipart `file` | New file for an uploaded source |
| GET | `/api/data-sources/:id/rows?limit=` | | First rows (preview) |
| PUT | `/api/data-settings` | `{ allowedHosts }` | Extra hosts for sheet links (**loopback only**) |
| PUT | `/api/graphics/:id/data-binding` | `{ sourceId, columns }` or `{ sourceId: null }` | Fill a list from a source / unlink |
| PUT | `/api/variables` | `{ variables }` | Replace the project variables |
| PUT | `/api/variable-source` | `{ sourceId, keyColumn, valueColumn }` or `{ sourceId: null }` | Variables from a key/value source |

`dataSources`, `dataSettings`, `variableSource` and `sourceVariables` are managed by
these routes only and ignored in a `PATCH /api/state` body. `variables` may also be
patched there.

### REST — debug

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/debug` | Snapshot for the Debug console (**loopback only**): server (version, port, uptime, data dir, experimental flags), connected pages, graphics with `origin` (typed in / data source / MultiViewer, variables used), data-source and F1 connector status, and the log. `?log=0` leaves the log out. |

The log (`server/debugLog.js`) is an in-memory ring buffer of 1000 lines, areas
`state`, `api`, `render`, `data`, `f1`, `image`, `server`. Connectors log transitions
(connected, error changed), not every poll. Every API write (`POST`/`PUT`/`PATCH`/`DELETE`)
is logged with its result and the client that sent it (Referer page, or Companion/script).

### REST — projects and assets

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/projects` | Registry entries with an `active` flag |
| POST | `/api/projects` | `{ name, clientName? }` (strings) → new project (201) |
| POST | `/api/projects/:id/activate` | Load + validate, then make active; returns `{ ...project, state }`. 404 unknown id, 422 damaged project (active project unchanged) |
| PATCH | `/api/projects/:id` | `{ name }` → rename (display name only; the id and folder stay). Returns the entry. When it is the active project, a `stateChanged` with the new `projectName` goes out |
| POST | `/api/projects/:id/duplicate` | `{ name? }` → copy `project.json`, assets and `custom.css` to a new, inactive project with a new unique id (201). Default name `"<name> copy"` |
| DELETE | `/api/projects/:id` | Move the folder to `<dataDir>/trash/<id>-<timestamp>` and remove it from the registry. **409** for the active project or the last remaining project |
| GET | `/api/projects/:id/custom-css` | `{ css, version, maxBytes }` |
| PUT | `/api/projects/:id/custom-css` | `{ css }` → save (empty string removes it). `@import` statements are removed. Returns `{ version, bytes, removedImports, maxBytes }`. **413** above 200 KB |
| GET | `/api/projects/active/export` | Download the active project as `.proverlay` (zip, includes `custom.css`) |
| POST | `/api/projects/import` | multipart `file` (`.proverlay`) → new, inactive project (201) |
| GET | `/api/projects/:id/assets` | List assets |
| POST | `/api/projects/:id/assets` | multipart `file` → upload an asset |
| POST | `/api/projects/:id/analyze-image` | multipart PNG/WebP → region analysis (compose) |
| POST | `/api/projects/:id/compose-widget` | Create a widget from a composed PNG |
| GET | `/projects/:id/assets/<file>` | Serve an asset (static, `nosniff`; SVG files get a sandbox CSP so a script inside one never runs) |
| GET | `/projects/:id/custom.css` | Serve the project's custom CSS (`text/css`, `nosniff`, `no-cache`); 404 when it has none |

All project routes return 404 for ids that are not a registered slug (no
path traversal). Rename, duplicate, delete and custom CSS saves run in the
write queue like every other write.

### Custom CSS

An optional per-project stylesheet (`projects/<id>/custom.css`, max 200 KB)
for client-specific looks without forking the code. /render links it for the
active project after the built-in stylesheets, as
`/projects/<id>/custom.css?v=<customCssVersion>`, and swaps it when
`customCssVersion` changes. Because it is served next to `assets/`, relative
URLs such as `url(assets/plate.png)` resolve to the project's own assets.

Custom CSS is **trusted local content**: it is written by the operator and
can restyle (or hide) anything on the render output. The server only removes
`@import` statements (also escaped spellings like `@\69mport`) on save and
on import, so a stylesheet cannot pull in remote CSS. Remote `url()`
references are not blocked; avoid them so overlays keep working offline.
It is included in `.proverlay` exports and imports.
Asset types (upload, import, serving): `png`, `jpg`, `jpeg`, `webp`, `gif`,
`ttf`, `otf`, `woff`, `woff2`. SVG and HTML are refused because they can
carry script. Uploads are capped at 25 MB.

### Steps and actions

One way to operate any widget from a remote control (Stream Deck, script), so a
button does not have to know the widget's type. Both routes run inside the write
queue and return the updated graphic.

**Declared per type** in `public/shared/widget-types.js`, next to the fields:

```js
quizShow: describeWidget({
  label: 'Quiz',
  steps: true,
  actions: [
    { id: 'reveal', label: 'Reveal answer' },
    { id: 'show-question', label: 'Show question by number',
      fields: [{ key: 'number', kind: 'number', label: 'Question number', default: 1, min: 1, integer: true }] }
  ]
})
```

`steps` and `actions` do not need `fields`: `lowerThirdShow`, `image` and
`quizShow` declare them and keep their own defaults, validation and card. What a
step or an action does is in `server/widgetActions.js`, which maps each type to
the function its own route already uses; the server refuses to start when a
declaration has no code or the other way round.

**Discovery.** Every state (`GET /api/state`, `stateChanged`) carries

```json
"widgetTypes": {
  "lowerThirdShow": { "steps": true, "actions": [] },
  "image": { "steps": true, "actions": [] },
  "quizShow": { "steps": true, "actions": [
    { "id": "reveal", "label": "Reveal answer", "fields": [] },
    { "id": "hide-answer", "label": "Hide answer", "fields": [] },
    { "id": "show-question", "label": "Show question by number", "fields": [{ "key": "number", "kind": "number", "…": "…" }] }
  ] }
}
```

A type that is not listed has no steps and no actions. It is in the state, not
behind a route of its own, because every client already receives the state: the
Companion module builds its dropdowns from it without an extra request, and a
type that gains an action shows up there without a module update.

**`POST /api/graphics/:id/step`** — `{ "delta": 1 }` (next, the default) or
`{ "delta": -1 }` (previous), optional `"wrap": false`.

| Type | A step |
|------|--------|
| `lowerThirdShow` | next / previous person in the roster |
| `image` | next / previous image (the code behind `/images/step`) |
| `quizShow` | question → its answer → next question → … ; previous walks the same sequence back (answer revealed → hide it; answer hidden → previous question with its answer shown) |

Rules for every type:

- A step puts the widget on air (combined output).
- A widget that never showed anything starts at the first item (previous: the last).
- After a hide, the item that was on air is remembered: next continues with the
  item after it.
- At the end of the list a step wraps around to the other end. With
  `"wrap": false` nothing changes there (a widget that is off air stays off air).

For the quiz, going on air never shows an answer: off air, next puts the current
question back when its answer was not revealed yet, otherwise the next question;
previous puts the question before it on air; both with the answer hidden.

Errors: 404 unknown graphic; 400 a type without steps, or a `delta` other than
1 / -1; 409 nothing to step through (empty roster, image list or quiz).

**`POST /api/graphics/:id/actions/:actionId`** — the body is the payload the
action's `fields` describe (checked like widget data; a field that is not sent
gets its default, other keys are ignored).

| Type | Action | Payload | Does |
|------|--------|---------|------|
| `quizShow` | `reveal` | | Reveals the answer of the question on air (409 when none is on air) |
| `quizShow` | `hide-answer` | | Hides the answer |
| `quizShow` | `show-question` | `{ number }` (1 = first) | Puts that question on air, answer hidden |

Errors: 404 unknown graphic or an action the type does not declare (the message
lists the ones it has); 400 a payload that does not fit.

Score and clock keep their own atomic routes (below), and every type's own
routes (`/entries/:entryId/show`, `/images/step`, a `PATCH` for the quiz) work
as before.

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
`public/shared/hockey-utils.js`. Clients never send whole cached `data`
objects: the operate cards (`public/shared/operate-*.js`, used by the
dashboard, `/operate` and `/operator`), the dashboard's Edit settings forms
(`/control?configure=<id>`) and the Companion module change scores and clocks
through these endpoints and save everything else with a partial
`PATCH /api/graphics/:id` that contains only the changed fields (arrays such as
ticker messages are sent whole, only when they changed). Edit settings diffs
the form against the server state it was filled with
(`public/shared/patch-diff.js`), never PATCHes score or running-clock fields,
and keeps unsaved edits when another client changes the same widget.

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
  below). For described widget types (`message`, `lowerThird`) each field in
  `data` is checked against its description, see
  [Describing a widget type](#describing-a-widget-type).
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
| `stateChanged` | server → client | full state, sent on connect and after every change (also on rename of the active project and on custom CSS saves) |
| `projectsChanged` | server → client | project list (as `GET /api/projects`) after create, rename, duplicate, delete, import or activate |
| `getState` | client → server | ack(state) |
| `f1TimingUpdate` | server → client | `{ graphicId, rows, session, status }` |
| `debug:hello` | client → server | `{ page, width, height, obs?, obsVersion?, filter? }`: a page describes itself for the Debug console (render, dashboard, operator) |
| `debug:renderError` | client → server | `{ graphicId?, phase, message, stack? }`: a render output could not draw a graphic or load an image (max 20 per output per minute) |
| `debug:subscribe` | client → server | ack(`{ entries }`) and join the `debug` room; refused for non-loopback clients |
| `debug:log` | server → `debug` room | one new log line `{ seq, at, area, level, message, detail?, graphicId? }` |

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
6. Link the active project's `custom.css` last (when `customCssVersion` is set)

## Companion integration

See `docs/COMPANION.md`. The module connects to `http://<host>:2014`:
- Socket.io `stateChanged` → refresh action choices, feedbacks and presets
- Actions call the REST API (toggle, toggle-solo, graphic/state PATCH,
  lower-third show/hide, the generic `/step` and `/actions/:actionId`)
- "Next", "Previous" and "Run action" list what `state.widgetTypes` reports
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
