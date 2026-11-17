# F1 timing tower

A live F1 position tower in pill style. It shows the top N (default 5) plus a focus
driver (default VER) as a separate row below the tower whenever that driver is outside
the top N.

## Create the widget

Dashboard → **Overlays** → widget type **F1 timing** → **Add widget**.

## Data sources

### Manual (default)

A hand-maintained driver list (code, name, gap). Edit it via **Operate** in the
dashboard or at `/operate?graphic=<id>`: reorder with ↑/↓ and type the gaps. Works
without any external software, and as a fallback when MultiViewer drops out.

**Import from MultiViewer** fills the list in one click with the current grid from
live timing (`POST /api/f1/:id/import-drivers`), so you never have to type it in as
long as MultiViewer is reachable.

### MultiViewer (live)

Reads live timing from a running [MultiViewer](https://multiviewer.app) instance via
its local API (`/api/v1/live-timing/...`).

Requirements on the MultiViewer machine:

1. MultiViewer is running and signed in with an F1 TV subscription.
2. A session is loaded **with Live Timing active**. For replays, click
   **Replay Live Timing** on the session card — playing only the video gives no data.
3. Check: `http://localhost:10101/api/v1/live-timing/SessionInfo` returns JSON.

If MultiViewer runs on a different machine than ProVerlay, set **MultiViewer host**
to that machine's LAN IP.

## Syncing with the picture (delay)

MultiViewer already syncs live timing with its own video player. The **Delay
(seconds)** setting is an extra fine-tune for the screen-capture → encoder → stream
chain. The server keeps a 5-minute buffer of snapshots, so you can adjust the delay
live without losing data.

How to tune it: put the race fullscreen in MultiViewer, watch the stream output and
increase the delay until a position change in the tower lines up with the picture.

## Settings

| Field | Meaning |
|---|---|
| Focus driver | Three-letter code (e.g. VER). Highlighted row; shown below the top N when outside it |
| Top positions | Number of rows in the tower (1–20) |
| Gap display | Interval (to the car ahead) or gap to the leader |
| Gap decimals | Decimals in gap times: 1 (F1 style, default), 0, 2, 3 or Feed (raw) |
| Animation | In/out animation: Slide in (left → right), Drop down, Fade or Cut |
| Lap counter | Shows the LAP x/y pill above the tower (on by default) |
| Tyre compound | Shows each driver's current tyre as a coloured ring with a letter (S/M/H/I/W) |
| Delay | Delay in seconds relative to the live feed |

**Track status:** the lap pill follows the track status from the feed
(`TrackStatus`): yellow for a yellow flag, yellow with an **SC**/**VSC** label for a
(virtual) safety car, red for a red flag. Changes animate subtly; requires the lap
counter to be on.

**Finish:** as soon as a driver crosses the line (status bit 1024 in the feed) a
chequered flag appears at the far right of their row, like the official F1 tower.

**Animation rules:** manual configuration changes (top N, gap mode, decimals, tyres
on/off, lap header) get in/out and swap animations. Live feed values (gap times,
positions) update without extra motion. Track status and the finish flag use a short
indicator animation.

The in-animation is staggered: P1 appears first, the rest follow shortly after
(70 ms per row). The out-animation runs in reverse order. Fine-tune with
`data.animation.durationMs` and `data.animation.staggerMs`.

**Live indicator:** with the MultiViewer source, the dashboard's Operate panel and
the operator show a status dot — green when live timing is coming in, red when there
is no data (with an error message) — plus a top-5 preview. There is also an
**Open MultiViewer** button (starts the app locally via
`POST /api/system/open-multiviewer`; when MultiViewer is not installed it offers the
download page instead — on Windows ProVerlay checks that the `multiviewer://` protocol
is registered before launching it) and a dismissible setup tip reminding you that
**Live Timing** / **Replay Live Timing** must be on.

Styling via `data.style` (`widthPx`, `rowHeightPx`, `rowGapPx`, `borderRadiusPx`,
`fontSize`, `background`, `focusBackground`, `focusColor`). The focus row uses a
gradient by default. Position the tower with **Overlay layout** (`/layout`, free
placement stored in `data.placementFree`).

## Implementation

- `server/f1Timing.js` — one poller per widget (only for the MultiViewer source), a
  ring buffer for delayed snapshots, broadcast via the Socket.io event
  `f1TimingUpdate`. Live rows are deliberately **not** persisted in `project.json`.
- `GET /api/f1/:id/live` — snapshot for first paint and status polling in the
  operate UI.
- `public/shared/f1-timing.js` — tower logic (top N + focus, gap text), shared by the
  render and the operate UI.
- Render: rows are keyed by driver code and move with
  `transform: translateY(...)` transitions, so position changes animate smoothly.
  Fixed pixel sizes: the render canvas is pixel-based already, so this is safe for
  vMix's compatibility mode.
