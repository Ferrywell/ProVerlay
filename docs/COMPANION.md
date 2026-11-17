# Bitfocus Companion integration

ProVerlay ships a [Bitfocus Companion](https://bitfocus.io/companion) module in
[`companion/`](../companion/) so you can trigger graphics from a Stream Deck or any
other Companion surface. The module is MIT-licensed (see
[`companion/LICENSE`](../companion/LICENSE)); the rest of ProVerlay is GPL-3.0.

Installation steps for the module are in [`companion/README.md`](../companion/README.md).
Requires **Companion 4.3+** (module API 2.x).

## How it talks to ProVerlay

```
Companion module ──Socket.io──► stateChanged (live state, feedbacks, presets)
                 ──REST──────► /api/graphics/:id/toggle, /api/state, …
```

- The module connects to `http://<host>:<port>` with Socket.io and listens for
  `stateChanged`, which carries the full state of the active project.
- Actions are sent as REST calls to the same server.

## Configuration

| Field | Default | Notes |
|-------|---------|-------|
| Host | `127.0.0.1` | IP of the machine running ProVerlay |
| Port | `2014` | ProVerlay server port |
| Auto reconnect | on | Reconnect after the server restarts |
| Reconnect interval (ms) | `5000` | 1000–60000 |

## Actions

| Action | What it does |
|--------|--------------|
| Show / Hide / Toggle graphic (main) | Sets `visible` — the graphic appears on the combined `/render` output |
| Show / Hide / Toggle graphic (solo) | Sets `soloVisible` — the graphic appears on its own `/render?graphic=<id>` output |
| Start countdown (minutes + seconds) | Sets a `streamCountdown` target time counted from now |
| Score +1 / Score −1 | Home or away score of a `matchScoreboard` |
| Start / Pause match clock | Match clock of a `matchScoreboard` |
| Show speaker | Puts one entry of a lower-thirds roster (`lowerThirdShow`) on air |
| Hide speaker lower third | Takes the roster's lower third off air |
| Set primary color | Sets the project brand colour (`brand.colors.primary`) |

## Feedbacks

| Feedback | Condition |
|----------|-----------|
| Graphic is visible (main) | `graphic.visible === true` |
| Graphic is visible (solo) | `graphic.soloVisible === true` |
| Speaker lower third on air | A speaker from the selected roster is currently shown |

## Variables

`graphic_count`, `visible_count` (and a legacy `theme` variable).

## Presets

Generated automatically from the active project when the module connects:

- **Graphics** — a two-step show/hide button per graphic for the main output and one
  for the solo output, with a feedback that lights up while it is on air.
- **Speakers** — one button per entry in each lower-thirds roster.

Actions, feedbacks and presets are rebuilt on every state update, so new graphics
(or a newly activated project) show up without restarting the connection.

## Using the API directly

Anything the module does you can also do yourself, e.g. from a script or another
controller:

```bash
# Show a graphic on the combined output
curl -X POST http://127.0.0.1:2014/api/graphics/<id>/toggle \
  -H 'Content-Type: application/json' -d '{"visible": true}'

# Show a graphic on its solo output
curl -X POST http://127.0.0.1:2014/api/graphics/<id>/toggle-solo \
  -H 'Content-Type: application/json' -d '{"soloVisible": true}'
```

```javascript
import { io } from 'socket.io-client'

const socket = io('http://127.0.0.1:2014')
socket.on('stateChanged', (state) => console.log(state.graphics.length))
socket.emit('toggleGraphic', { id: '<id>', visible: true }, (graphic) => {})
```

Graphic ids are visible in the render URL you copy from the dashboard
(`/render?graphic=<id>`) and in `GET /api/graphics`.

## Testing without a Stream Deck

1. Start ProVerlay (`npm start` or the Mac app).
2. `cd companion && npm run test:connection` — prints the number of graphics.
3. In Companion, add a **ProVerlay** connection and assign actions to buttons on the
   emulator or a virtual surface.
4. Check that `/render` reacts.
