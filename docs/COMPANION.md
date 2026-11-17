# Bitfocus Companion integration

ProVerlay ships a [Bitfocus Companion](https://bitfocus.io/companion) module in [`companion/`](../companion/) so you
can trigger graphics from a Stream Deck or any other Companion surface. The module is MIT-licensed (see
[`companion/LICENSE`](../companion/LICENSE)); the rest of ProVerlay is GPL-3.0.

Installation and development steps are in [`companion/README.md`](../companion/README.md). The user help that
Companion shows is [`companion/companion/HELP.md`](../companion/companion/HELP.md). Requires **Companion 4.3+**
(module API 2.x, Node 22 runtime).

## How it talks to ProVerlay

```
Companion module ──Socket.io──► stateChanged (full state: dropdowns, feedbacks, variables, presets)
                 ──REST──────► /api/graphics/:id/score, /clock, /toggle, /toggle-solo, /hide, PATCH …
```

- The module connects to `http://<host>:<port>` with Socket.io (no custom headers: ProVerlay accepts requests
  without an `Origin`). The server sends `stateChanged` on connect and after every change. If no state arrives
  within 3 s after connecting, the module falls back to `GET /api/state`.
- Reconnects use socket.io's exponential backoff (1 s → 30 s, jittered). After a clean server shutdown
  (`io server disconnect`) the module reconnects by itself as well.
- Actions are REST calls. Every response is checked; a non-2xx answer is logged with the server's `error` message
  (for example `Score failed: POST /api/graphics/x/score: HTTP 404 – Graphic not found`).
- Module status: **Connecting** (socket not up or no state yet), **OK** (state received), **Disconnected** /
  **Connection failure** (retrying), **Bad config** (invalid host/port).

### Atomic operations

Scores and clocks never send the module's cached `data`. They use the server's atomic endpoints, which run inside the
state write queue:

| Action                  | Request                                                                           |
| ----------------------- | --------------------------------------------------------------------------------- |
| Score add / subtract    | `POST /api/graphics/:id/score {side, delta}`                                      |
| Score set               | `POST /api/graphics/:id/score {side, value}`                                      |
| Clock                   | `POST /api/graphics/:id/clock {action: start\|pause\|toggle\|reset\|adjust\|set, ms?}` |
| Toggle (combined/solo)  | `POST /api/graphics/:id/toggle` / `toggle-solo` without a body (server flips)     |
| Hide                    | `POST /api/graphics/:id/hide`                                                     |
| Speaker                 | `POST /api/graphics/:id/entries/:entryId/show`                                    |

Two presses before the socket echo arrives therefore count twice, and **Start** never resets a running clock.

Other actions send small partial PATCHes (the server deep-merges objects):

- match / hockey period: `PATCH {data: {clock: {period}}}` — only the period field. Before a hockey break a running
  clock is paused through `/clock` (the render does not tick during a break).
- ticker message on/off and add: the `messages` array is replaced by the server, so the module sends every current
  message id (`{id}` only — the server keeps their text and state) plus the changed or new message. A message added
  by someone else at the very same moment could be dropped.
- countdown: `PATCH {data: {targetDateTime}}` (start = server time + duration; stop = now).
- quiz: `PATCH {visible: true, data: {activeQuestionId, revealed: false}}` / `PATCH {data: {revealed}}`.
- message: `PATCH {data: {text}, visible?}`.

Next / previous speaker, the "toggle" answer of a quiz, ticker "toggle" and hockey next / previous period are
computed from the last received state.

## Configuration

| Field | Default     | Notes                                                                 |
| ----- | ----------- | --------------------------------------------------------------------- |
| Host  | `127.0.0.1` | IP address or LAN host name of the machine running ProVerlay          |
| Port  | `2014`      | ProVerlay server port                                                 |

Version 1.0.0 removed the *Auto reconnect* and *Reconnect interval* fields (reconnecting is always on, with
backoff); the upgrade script removes them from existing connections.

## Actions

| Action (id)                                                   | Options                                                    | Widget types                       |
| ------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------- |
| Graphic: show / hide / toggle, combined (`graphic_visibility`) | graphic, mode                                              | all                                |
| Graphic: show / hide / toggle, solo (`graphic_solo`)          | graphic, mode                                              | all                                |
| Score: +1 / −1 / set (`score`)                                | graphic, side, mode (add/subtract/set), amount             | matchScoreboard, hockeyScorebug    |
| Clock (`clock`)                                               | graphic, action, seconds (adjust), time mm:ss (set)        | matchScoreboard, hockeyScorebug    |
| Match: set period (`match_period`)                            | graphic, period                                            | matchScoreboard                    |
| Hockey: next / previous / set period (`hockey_period`)        | graphic, mode, period, includeBreaks, resetClock           | hockeyScorebug                     |
| Ticker: enable / disable / toggle a message (`ticker_message`) | message, mode                                             | customTicker                       |
| Ticker: add message (`ticker_add`)                            | graphic, text, enabled                                     | customTicker                       |
| Countdown: start (`countdown_start`)                          | graphic, minutes, seconds                                  | streamCountdown                    |
| Countdown: stop (`countdown_stop`)                            | graphic                                                    | streamCountdown                    |
| Countdown: set target time (`countdown_target`)               | graphic, target (`HH:MM`, `HH:MM:SS`, ISO)                 | streamCountdown                    |
| Lower thirds: show speaker (`lower_third_show`)               | speaker                                                    | lowerThirdShow                     |
| Lower thirds: next / previous speaker (`lower_third_step`)    | graphic, direction, wrap                                   | lowerThirdShow                     |
| Lower thirds: hide (`lower_third_hide`)                       | graphic                                                    | lowerThirdShow                     |
| Quiz: show question (`quiz_show`)                             | question                                                   | quizShow                           |
| Quiz: reveal / hide / toggle answer (`quiz_reveal`)           | graphic, mode                                              | quizShow                           |
| Quiz: hide (`quiz_hide`)                                      | graphic                                                    | quizShow                           |
| Message: set text and show (`message_set`)                    | graphic, text, show                                        | message                            |
| Brand: set primary colour (`brand_primary_color`)             | color                                                      | project (`brand.colors.primary`)   |

Hockey "next" after a break continues with the quarter after the last one played (the module remembers it, because
the server only stores `break`). With *includeBreaks* the order is Q1 → break → Q2 → break → Q3 → break → Q4.

## Feedbacks

| Feedback (id)                                   | Condition                                                  | Default style |
| ----------------------------------------------- | ---------------------------------------------------------- | ------------- |
| Graphic on air, combined (`graphic_on_air`)     | `graphic.visible`                                          | red (ON AIR)  |
| Graphic on air, solo (`graphic_solo_on_air`)    | `graphic.soloVisible`                                      | red (ON AIR)  |
| Clock running (`clock_running`)                 | `data.clock.running && data.clock.runningSince`            | green         |
| Speaker on air (`lower_third_entry_active`)     | roster visible and `data.activeEntryId` is this speaker    | red (ON AIR)  |
| Quiz question on air (`quiz_question_active`)   | quiz visible and `data.activeQuestionId` is this question  | red (ON AIR)  |
| Answer revealed (`quiz_revealed`)               | `data.revealed`                                            | yellow        |
| Ticker message enabled (`ticker_message_enabled`) | message `enabled`                                        | green         |

## Variables

`<id>` is the graphic id with every character other than letters, digits and `_` replaced by `_`
(`match-scoreboard-3f9a1c2e` → `match_scoreboard_3f9a1c2e`).

| Variable                                     | Value                                                            |
| -------------------------------------------- | ---------------------------------------------------------------- |
| `project_name`, `project_id`                 | Active project (`client.name`, falls back to the id)             |
| `graphic_count`, `visible_count`             | Graphics in the project / on the combined output                 |
| `name_<id>`, `onair_<id>`, `solo_<id>`       | Name, on air (combined), on air (solo)                           |
| `code_<id>_home` / `_away`                   | Team codes (match, hockey)                                       |
| `score_<id>_home` / `_away`                  | Scores                                                           |
| `clock_<id>`, `clock_<id>_running`           | Clock as on air, running flag                                    |
| `period_<id>`                                | `1st half` … `Extra time 2`, `Q1` … `Q4`, `BREAK` (hockey break) |
| `countdown_<id>`                             | Remaining time (`M:SS` or `H:MM:SS`, like the render)            |
| `ticker_<id>_current`, `ticker_<id>_enabled` | Enabled messages joined with ` • `, count of enabled messages    |
| `speaker_<id>_name`, `speaker_<id>_title`    | Active speaker                                                   |
| `quiz_<id>_question`, `quiz_<id>_revealed`   | Active question, revealed flag                                   |
| `message_<id>`                               | Message text                                                     |

The legacy `theme` variable was removed (the server no longer has a theme field).

Clock and countdown variables are computed in the module with the same rules as the render
(`public/shared/match-utils.js`, `hockey-utils.js`, `countdown-utils.js`: match counts up with floor, hockey and
countdown count down with ceil, `45+2:13` stoppage format). The module corrects for clock skew with the
`serverNow` field of each state, recomputes every 250 ms and only pushes values that changed — no extra HTTP
traffic while a clock runs.

## Presets

Generated from the active project: one section per widget type, one group per graphic.

| Widget                | Presets                                                                                         |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| every graphic         | On air toggle (`$(proverlay:name_<id>)`, red when on air), solo toggle                          |
| match / hockey        | Home/away +1 (shows code and score), −1, clock start/pause (shows clock + period, green while running), clock −1 s / +1 s, reset; match: one button per period; hockey: previous / next period |
| ticker                | One toggle per message (green while enabled)                                                    |
| countdown             | Start 5:00 / 10:00 / 15:00, stop (shows the remaining time)                                     |
| lower-thirds roster   | One button per speaker (red while on air), previous / next speaker, hide                        |
| quiz                  | One button per question (red while on air), reveal / hide answer (yellow), hide quiz            |
| message               | On air toggle shows the message text                                                            |

Presets use the connection label in variable references, so they keep working when the connection is not called
`proverlay`.

### When definitions are rebuilt

Actions, feedbacks, variable definitions and presets are rebuilt only when the *graphics signature* changes: graphic
ids, names and types, plus the items that appear in dropdowns (roster speakers, quiz questions, ticker messages).
Score, clock, visibility and active-entry changes only update variable values (diffed) and re-check feedbacks.
Switching projects in ProVerlay changes the signature, so the module follows automatically.

## Upgrading from the 0.x developer module

`src/upgrades.js` converts buttons made with the earlier developer module: `showGraphic` / `hideGraphic` /
`toggleGraphic` → `graphic_visibility`, the solo variants → `graphic_solo`, `scorePlus` / `scoreMinus` → `score`,
`clockStart` / `clockPause` → `clock`, `startCountdownDuration` → `countdown_start`, `showLowerThirdEntry` →
`lower_third_show`, `hideLowerThirdShow` → `lower_third_hide`, `setPrimaryColor` → `brand_primary_color`; feedbacks
`graphic_visible` / `lower_third_visible` → `graphic_on_air`, `graphic_solo_visible` → `graphic_solo_on_air`.

## Using the API directly

Anything the module does you can also do yourself, from a script or another controller:

```bash
# Toggle a graphic on the combined output (the server flips it atomically)
curl -X POST http://127.0.0.1:2014/api/graphics/<id>/toggle -H 'Content-Type: application/json' -d '{}'

# Home score +1
curl -X POST http://127.0.0.1:2014/api/graphics/<id>/score -H 'Content-Type: application/json' \
  -d '{"side": "home", "delta": 1}'

# Start / pause the clock
curl -X POST http://127.0.0.1:2014/api/graphics/<id>/clock -H 'Content-Type: application/json' \
  -d '{"action": "toggle"}'
```

```javascript
import { io } from 'socket.io-client'

const socket = io('http://127.0.0.1:2014')
socket.on('stateChanged', (state) => console.log(state.graphics.length))
```

The socket API is read-only (`stateChanged`, `getState`); all writes go through REST. Graphic ids are visible in the
render URL you copy from the dashboard (`/render?graphic=<id>`) and in `GET /api/graphics`.

## Testing

1. `cd companion && npm test` — unit tests (actions with a stubbed API, clock formatting, presets, rebuild logic,
   upgrade scripts).
2. `npm run test:integration` — starts the ProVerlay server from this repository on port 2403 with a temporary data
   folder, creates one widget of every type and runs every action through the real module instance (socket + REST),
   including a server restart.
3. `npm run test:connection` — quick check against a running ProVerlay.
4. In Companion: add a **ProVerlay** connection, drag presets onto the emulator and check that `/render` reacts.
