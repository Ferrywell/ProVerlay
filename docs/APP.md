# ProVerlay desktop app (Electron)

The desktop app wraps the same Node server and browser UIs you get with `npm start`
in an Electron shell with a menu-bar (macOS) or notification-area (Windows) icon.
Downloads on the [releases page](https://github.com/Ferrywell/ProVerlay/releases):

| Platform | Download |
|----------|----------|
| macOS, Apple Silicon (M1 and later) | `ProVerlay-mac-arm64.zip` |
| macOS, Intel | `ProVerlay-mac-x64.zip` |
| Windows 10/11, x64 — **beta** | `ProVerlay-win-x64-setup.exe` |

`SHA256SUMS.txt` on the same page lists the checksum of every download. The Windows
app is in **beta** until it has been tested on more real hardware; please report
problems in the [issues](https://github.com/Ferrywell/ProVerlay/issues).

## Install (macOS)

Download the latest release from the
[releases page](https://github.com/Ferrywell/ProVerlay/releases).

1. Unzip and drag `ProVerlay.app` to **Applications**.
2. The first time, **right-click → Open → Open** (do not double-click).
3. If macOS still refuses ("can't be opened"), clear the quarantine flag in Terminal:

   ```bash
   xattr -cr /Applications/ProVerlay.app
   ```

The build is **ad-hoc signed** and not notarized with an Apple Developer ID, so
Gatekeeper blocks it after download. This happens on every Mac, Apple Silicon or
Intel; it is not an architecture problem.

## Install (Windows, beta)

1. Download `ProVerlay-win-x64-setup.exe` and run it.
2. The installer is **not code-signed** yet, so Windows Defender SmartScreen shows
   *"Windows protected your PC"*. Click **More info → Run anyway**. Edge or Chrome may
   also call the download uncommon; choose **Keep**.
3. Keep the default **Only for me**: ProVerlay installs into
   `%LOCALAPPDATA%\Programs\ProVerlay` without administrator rights and adds
   **ProVerlay** shortcuts to the Start menu and the desktop. *Anyone who uses this
   computer* installs into `C:\Program Files\ProVerlay` and asks for admin rights.
4. On first start ProVerlay explains the firewall prompt that follows. When **Windows
   Defender Firewall** asks, allow ProVerlay on **Private networks** (leave *Public*
   unticked). That lets an iPad, phone or Companion on your network connect. OBS or
   vMix on the same PC work either way, because traffic to `127.0.0.1` is not
   firewalled. If you clicked *Cancel*, see
   [USER-GUIDE.md → Windows Firewall](USER-GUIDE.md#windows-firewall-blocks-the-ipad-or-companion).

Updating: run the new `ProVerlay-win-x64-setup.exe`; it replaces the program and keeps
your projects. Uninstalling (**Settings → Apps → Installed apps → ProVerlay →
Uninstall**) removes the program and shortcuts but **keeps your projects** in
`%APPDATA%\ProVerlay\data`. Delete that folder yourself for a clean removal.

For deployment, `ProVerlay-win-x64-setup.exe /S` installs silently for the current
user. Checksums: `Get-FileHash .\ProVerlay-win-x64-setup.exe -Algorithm SHA256` in
PowerShell, compared with `SHA256SUMS.txt`.

## Behaviour

- The app starts the ProVerlay server internally on port **2014** (changeable in
  Preferences, see below). If a ProVerlay server is already running on that port (for
  example `npm run dev`), it connects to that one instead of starting a second server.
- The main window shows the dashboard (`/control`).
- **macOS:** the menu-bar icon opens a menu to open the dashboard, copy the operator and
  render URLs, open Preferences and quit. Closing the window only hides it; quit with
  **Cmd+Q** or from the menu-bar menu.
- **Windows:** the ProVerlay icon sits in the notification area (system tray; it may be
  under the **^** overflow arrow — drag it onto the taskbar to keep it visible). Click it
  to open the dashboard; right-click for the same menu as on macOS. Closing the window
  only hides it; quit from the tray menu.
- While the app runs, the server keeps running too, so OBS/vMix keep their overlay with
  the window closed.

### Preferences

Open **Preferences…** from the menu-bar/tray menu (on macOS also **Cmd+,**):

- **Port** — the port the server listens on (1024–65535, default 2014). After a change,
  use the new port in every URL: OBS/vMix inputs, the operator bookmark and the
  Companion connection.
- **Open the dashboard when ProVerlay starts.**
- **Start ProVerlay when you log in** — handy on a dedicated streaming PC, so the
  overlay is available as soon as OBS or vMix starts.
- **Updates** — *Check for Updates* asks GitHub for the latest release (see
  [Updates](#updates)).
- **Troubleshooting** — *Open* starts the Debug console (see [Debug console](#debug-console)).

If the port is taken when ProVerlay starts, it shows an error with a button to choose
another port. Running from source, set the `PORT` environment variable instead.

### Updates

ProVerlay never updates by itself and does not check in the background. In
**Preferences → Updates** (or **ProVerlay → Check for Updates…** on macOS, **Check for
Updates…** in the tray menu):

1. **Check for Updates** asks GitHub for the latest release of
   [Ferrywell/ProVerlay](https://github.com/Ferrywell/ProVerlay/releases). Pre-releases
   are skipped.
2. **Download** fetches the file for this computer (`ProVerlay-mac-arm64.zip`,
   `ProVerlay-mac-x64.zip` or `ProVerlay-win-x64-setup.exe`) and checks its size and its
   SHA-256 against `SHA256SUMS.txt` from the same release. On macOS the app inside the
   zip is unpacked and checked as well: valid signature, ProVerlay's bundle id and the
   expected version.
3. **Install and Restart** (macOS) / **Quit and Install** (Windows) asks for
   confirmation first and warns when graphics are on air. ProVerlay quits, so OBS, vMix
   and operators lose the connection for a few seconds; they reconnect by themselves and
   graphics that were on air are on air again.
   - **macOS:** a small helper waits until ProVerlay has quit, swaps
     `ProVerlay.app` for the new one (the old app is put back if that fails) and starts
     it. ProVerlay has to be in a folder you can write to, normally Applications; a copy
     started from a disk image or Downloads (App Translocation) cannot update itself.
   - **Windows:** the installer starts and finds the existing installation (for you or
     for everyone on the computer). Follow its steps.

Projects and settings are not touched by an update. Running from source, *Download* is
not available; use `git pull`.

### Debug console

**Preferences → Troubleshooting → Open** (or **Debug Console** in the menu-bar/tray
menu) opens a window with what the server is doing right now:

- **Outputs and pages** — every connected render output (an OBS browser source is
  recognised as such; vMix and browsers show as *Render page*), with its size, how long
  it has been connected and the last error it reported, plus open dashboards and
  operator pages.
- **Connectors** — data sources (where they read from, rows, last update, errors, held
  changes) and F1 timing towers (manual list or MultiViewer: address, poll and delay
  settings, connection, cars, snapshot buffer).
- **Graphics and where their content comes from** — per graphic: on air or not, and
  whether its content is typed in, comes from a data source, from MultiViewer, and which
  `{{variables}}` it uses.
- **Log** — a live log of state changes (on/off air, edits), API writes with who sent
  them (dashboard, operator, Companion or a script), data refreshes, MultiViewer
  connects and errors, image auto-hide/carousel steps, and graphics a render output
  could not draw (with the error). Filter by area, level or text; *Copy report* puts the
  snapshot and the last 300 log lines on the clipboard for a bug report.

The log lives in memory (the last 1000 lines) and is gone after a restart. The console
also works in a browser on the ProVerlay computer at `http://localhost:2014/debug`; from
other devices it is refused, because it shows file paths and data-source links.

## Data

| Situation | Location |
|-----------|----------|
| Mac app | `~/Library/Application Support/ProVerlay/data` |
| Windows app | `%APPDATA%\ProVerlay\data` (e.g. `C:\Users\<you>\AppData\Roaming\ProVerlay\data`) |
| Running from source | `data/` in the repository (gitignored) |
| Custom | set `PROVERLAY_DATA_DIR` (read by `server/paths.js`) |

- Data survives app updates; an update never overwrites existing projects. On Windows
  an uninstall keeps it too.
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
npm run dist:win      # build the Windows installer → dist/ProVerlay-win-x64-setup.exe
```

`npm run dist:mac` generates the seed data, runs electron-builder and then signs and
zips the app in one step (`scripts/package-mac-app.mjs`). Without the signing step
macOS refuses to open the app.

`npm run dist:win` builds the unsigned NSIS installer; it cross-builds on macOS and
Linux too, but running and testing it needs Windows. Release builds, verification and
signing are described in [RELEASING.md](RELEASING.md).

The server alone also runs on Windows from source (`npm start` with Node 22), and the
browser UIs work in any modern browser.
