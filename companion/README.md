# companion-module-proverlay

[Bitfocus Companion](https://bitfocus.io/companion) module for
[ProVerlay](https://github.com/Ferrywell/ProVerlay) live graphics: show and hide
graphics, change scores, run clocks and countdowns, and put speakers on air from a
Stream Deck.

Requires **Companion 4.3+** (module API 2.x) and a running ProVerlay server
(default port **2014**).

This module is licensed under the **MIT license** (see [LICENSE](LICENSE)). The rest of
the ProVerlay repository is licensed under GPL-3.0.

## Install (development)

The module is not in the Companion module store yet. Load it as a developer module:

1. Start ProVerlay (Mac app, or `npm start` in the repository root).

2. Link and install the module:

   ```bash
   cd companion
   npm run setup-dev
   ```

   This creates a symlink `~/companion-module-dev/companion-module-proverlay` and
   installs the dependencies. Set `COMPANION_DEV_PATH` to use another folder.

3. In the **Companion Launcher** (not the web UI):

   - click the cog icon → **Advanced**
   - **Developer modules path:** `~/companion-module-dev` (the parent folder, not the
     module folder itself)
   - restart Companion

4. Add a connection:

   - Type: **ProVerlay**
   - Module version: **Dev**
   - Host: `127.0.0.1`, Port: `2014`

### Common errors

| Error | Cause |
|-------|-------|
| Connection not found or not running | Wrong developer path, or the module crashes on start |
| No config data loaded | The module is not running; check the Companion logs |
| Connection failed | ProVerlay is not running on the configured host/port |

The developer path must be the **parent folder** that contains `companion-module-*`
folders. Do not point Companion at the `companion/` folder directly.

## Configuration

| Field | Default |
|-------|---------|
| Host | `127.0.0.1` |
| Port | `2014` |
| Auto reconnect | on |
| Reconnect interval (ms) | `5000` |

## Test the connection

```bash
cd companion
npm run test:connection
```

Prints the number of graphics in the active project. Use `PROVERLAY_HOST` and
`PROVERLAY_PORT` to test another machine.

## Actions, feedbacks and presets

- Show / hide / toggle a graphic — main output (`/render`) and solo output
  (`/render?graphic=<id>`)
- Start a stream countdown (minutes + seconds)
- Score +1 / −1, start / pause the match clock (`matchScoreboard`)
- Show a speaker from a lower-thirds roster, hide the roster
- Set the project's primary brand colour

Feedbacks light up buttons while a graphic (main or solo) or speaker is on air.
Presets are generated automatically per graphic and per speaker from the ProVerlay
state.

Full reference: [docs/COMPANION.md](../docs/COMPANION.md).
