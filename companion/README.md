# companion-module-proverlay

[Bitfocus Companion](https://bitfocus.io/companion) module for [ProVerlay](https://github.com/Ferrywell/ProVerlay)
live graphics: put graphics on air, change scores, run match and hockey clocks, drive tickers, countdowns, lower
thirds, quizzes and messages from a Stream Deck.

Tested with **Companion 4.3+ and 5.x** (module API 2.x, Node 22 runtime). Needs a running ProVerlay server (default
port **2014**).

This module is licensed under the **MIT license** (see [LICENSE](LICENSE)). The rest of the ProVerlay repository is
licensed under GPL-3.0.

The user-facing reference (setup, every action, feedback and variable) is [companion/HELP.md](companion/HELP.md);
it is what Companion shows under the module's help button. The integration overview is in
[docs/COMPANION.md](../docs/COMPANION.md).

## Install (development)

Until the module is in the Companion module store, load it as a developer module:

1. Start ProVerlay (Mac app, or `npm start` in the repository root).
2. Copy and install the module:

   ```bash
   cd companion
   npm run setup-dev:node   # any OS, also Windows
   npm run setup-dev        # the same, from bash
   ```

   This copies this folder (without `node_modules`, `.git`, `pkg/` and `*.tgz`) to
   `~/companion-module-dev/companion-module-proverlay` and runs `npm install --omit=dev` in the copy. Set
   `COMPANION_DEV_PATH` to use another folder. **Run it again after changing the module**; Companion picks up the new
   copy.

   Companion 5 does not load a symlinked or junctioned module: it runs modules under Node's permission model, resolves
   the link to the real path and then denies reading `manifest.json` through the link path (`ERR_ACCESS_DENIED`, the
   connection keeps restarting as _Crashed_). That is why the script copies. On Companion 4.x you can still link
   instead, so edits show up without re-running: `npm run setup-dev:node -- --link` (a directory junction on
   Windows).

3. In the **Companion Launcher** (not the web UI): cog icon → **Advanced** → **Developer modules path:**
   `~/companion-module-dev` (the parent folder, not the module folder), then restart Companion.
4. Add a connection: type **ProVerlay**, module version **Dev**, host `127.0.0.1`, port `2014`.

| Error                               | Cause                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| Connection not found or not running | Wrong developer path, or the module crashes on start (check the log)         |
| Crashed, `ERR_ACCESS_DENIED`        | Companion 5 with a linked module: run `npm run setup-dev:node` (copy)        |
| Bad config                          | Host or port is not valid                                                    |
| Connection failure                  | ProVerlay is not running on the configured host/port (module keeps retrying) |

## What the module does

- **Actions** — show / hide / toggle (combined and solo output); score +1 / −1 / set and clock start / pause / toggle /
  reset / adjust / set for match scoreboards and hockey scorebugs (atomic server endpoints, so rapid presses never
  get lost); match period; hockey next / previous / set period; ticker message enable / disable / toggle and add;
  countdown start / stop / target time; lower thirds show / next / previous / hide; quiz show question / reveal /
  hide; message set text + show; brand primary colour.
- **Feedbacks** — graphic on air (combined, solo), clock running, speaker on air, quiz question on air, answer
  revealed, ticker message enabled.
- **Variables** — project name, per graphic: name, on air, team codes, scores, clock (`mm:ss`, ticking locally),
  period, countdown, ticker text, active speaker, quiz question, message text.
- **Presets** — generated per graphic and grouped by widget type, with live variable text and ON AIR feedbacks.

Action, feedback, variable and preset definitions are only rebuilt when the set of graphics (ids, names, types, and
dropdown items such as speakers or ticker messages) changes. Scores, clocks and visibility only update variable
values and feedbacks.

## Development

```bash
cd companion
npm ci
npm test                 # unit tests (node:test)
npm run test:integration # starts ../server on port 2403 with a temp data dir and drives every action
npm run lint             # eslint (Companion module config)
npm run format           # prettier
npm run package          # companion-module-build → proverlay-<version>.tgz
npm run test:connection  # quick check against a running ProVerlay (PROVERLAY_HOST / PROVERLAY_PORT)
```

`PROVERLAY_URL=http://host:port npm run test:integration` runs the integration test against a server that is
already running (use a throwaway project: it creates and changes graphics).

Source layout:

| File               | Contents                                                                    |
| ------------------ | --------------------------------------------------------------------------- |
| `index.js`         | Instance: connection, status, state handling, rebuild logic, clock ticks    |
| `src/api.js`       | REST client (checks every response, timeouts, server error messages)        |
| `src/model.js`     | Pure helpers: clock formatting, choices, signature, period / entry stepping |
| `src/actions.js`   | Action definitions                                                          |
| `src/feedbacks.js` | Feedback definitions                                                        |
| `src/variables.js` | Variable definitions and values                                             |
| `src/presets.js`   | Preset generation                                                           |
| `src/upgrades.js`  | Upgrade scripts (append only)                                               |
| `companion/`       | `manifest.json` and `HELP.md` for Companion                                 |

When an action id, option or config field changes, append an upgrade script to `src/upgrades.js` and bump the
version in both `package.json` and `companion/manifest.json`.
