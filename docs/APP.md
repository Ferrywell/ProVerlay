# ProVerlay desktop app (Electron)

The desktop app wraps the same Node server and browser UIs you get with `npm start`
in an Electron shell with a menu-bar icon. Today it is built for **macOS on Apple
Silicon** only.

## Install (macOS, Apple Silicon)

Download the latest release from the
[releases page](https://github.com/Ferrywell/ProVerlay/releases).

1. Unzip and drag `ProVerlay.app` to **Applications**.
2. The first time, **right-click → Open → Open** (do not double-click).
3. If macOS still refuses ("can't be opened"), clear the quarantine flag in Terminal:

   ```bash
   xattr -cr /Applications/ProVerlay.app
   ```

The build is **ad-hoc signed** and not notarized with an Apple Developer ID, so
Gatekeeper blocks it after download. This happens on every Apple Silicon Mac
(M1/M2/M3/…); it is not an architecture problem. An Intel build is not available yet.

## Behaviour

- The app starts the ProVerlay server internally on port **2014**. If a ProVerlay
  server is already running on that port (for example `npm run dev`), it connects to
  that one instead of starting a second server.
- The main window shows the dashboard (`/control`). The menu-bar icon offers: open
  dashboard, open the operator in your browser, copy the render URL for OBS/vMix, and
  stop ProVerlay.
- Closing the window only hides it; the server keeps running so OBS/vMix keep their
  overlay. Quit with **Cmd+Q** or **Stop ProVerlay** in the menu-bar menu.

## Data

| Situation | Location |
|-----------|----------|
| Mac app | `~/Library/Application Support/ProVerlay/data` |
| Running from source | `data/` in the repository (gitignored) |
| Custom | set `PROVERLAY_DATA_DIR` (read by `server/paths.js`) |

- Data survives app updates; an update never overwrites existing projects.
- On first launch the app copies `seed-data/` from the app bundle if present
  (a blank project). Without seed data the server creates a blank project itself.
- The repository `data/` folder is **never** packaged into the app.
- Regenerate the seed with `npm run generate:seed` (writes `seed-data/`).

## Build from source

```bash
nvm use 22            # Electron tooling needs Node 22
npm ci
npm run app           # run the Electron app against your working copy
npm run dist:mac      # build, ad-hoc sign and zip → dist/ProVerlay-mac-arm64.zip
```

`npm run dist:mac` generates the seed data, runs electron-builder and then signs and
zips the app in one step (`scripts/package-mac-app.mjs`). Without the signing step
macOS refuses to open the app.

## Windows

The server itself is plain Node and runs on Windows (`npm start`), and the browser
UIs work in any modern browser. A packaged Windows desktop app is **planned but not
built yet**: `electron-builder.yml` already contains a `win` target (NSIS, x64).
`server/paths.js` is platform-independent; the packaged Windows app would keep its
data under `%APPDATA%/ProVerlay/data`.
