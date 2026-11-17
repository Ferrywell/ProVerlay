## ProVerlay

ProVerlay is live broadcast graphics software for OBS and vMix. This module controls
ProVerlay from Bitfocus Companion (Stream Deck).

### Requirements

- ProVerlay is running (the Mac app, or `npm start` in the ProVerlay folder)
- Default port: **2014**

### Configuration

| Field | Default | Description |
|-------|---------|-------------|
| Host | 127.0.0.1 | IP of the machine running ProVerlay |
| Port | 2014 | ProVerlay server port |
| Auto reconnect | on | Reconnect automatically |
| Reconnect interval (ms) | 5000 | Time between reconnect attempts |

### Actions

- **Show / Hide / Toggle graphic (main)** — on the combined `/render` output
- **Show / Hide / Toggle graphic (solo)** — on the graphic's own `/render?graphic=<id>` output
- **Start countdown (minutes + seconds)** — for stream countdown graphics
- **Score +1 / Score −1** — home or away, for match score graphics
- **Start / Pause match clock** — for match score graphics
- **Show speaker / Hide speaker lower third** — for lower-thirds rosters
- **Set primary color** — the project's primary brand colour

### Feedbacks

- **Graphic is visible (main)**
- **Graphic is visible (solo)**
- **Speaker lower third on air**

### Presets

When connected, the module generates toggle presets for every graphic (main and
solo) and a button for every speaker in a lower-thirds roster. They update
automatically when the project changes.

### API

ProVerlay uses Socket.io on `http://host:port` (event `stateChanged`) and a REST
API under `/api`. No authentication — use ProVerlay on a trusted network only.
