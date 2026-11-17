# ProVerlay user guide

This guide walks you through a first show: starting ProVerlay, setting up a project,
adding widgets, getting them into OBS or vMix and controlling them from an iPad.

- [1. First start](#1-first-start)
- [2. The screens](#2-the-screens)
- [3. Create a project](#3-create-a-project)
- [4. Add widgets](#4-add-widgets)
- [5. Connect OBS or vMix](#5-connect-obs-or-vmix)
- [6. Go live](#6-go-live)
- [7. Operator on iPad or iPhone](#7-operator-on-ipad-or-iphone)
- [8. Stream Deck (Companion)](#8-stream-deck-companion)
- [9. Export and import projects](#9-export-and-import-projects)
- [10. Troubleshooting](#10-troubleshooting)

## 1. First start

**Mac app (Apple Silicon).** Download the latest release from the
[releases page](https://github.com/Ferrywell/ProVerlay/releases), unzip it, move
`ProVerlay.app` to Applications and open it with **right-click → Open** the first
time (see [Gatekeeper](#macos-says-the-app-cant-be-opened) if that fails). The
dashboard opens in the app window and a ProVerlay icon appears in the menu bar.

**From source (any OS with Node 22).**

```bash
git clone https://github.com/Ferrywell/ProVerlay.git
cd ProVerlay
npm ci
npm start
```

Then open http://localhost:2014/control in your browser. The terminal prints the
local and LAN URLs for the dashboard, operator and render.

On first start ProVerlay creates one empty project called **New client**, with no
widgets. Your data is stored in:

| How you run it | Data folder |
|----------------|-------------|
| Mac app | `~/Library/Application Support/ProVerlay/data` |
| From source | `data/` in the repository (not tracked by git) |

## 2. The screens

| Screen | URL | Use it for |
|--------|-----|-----------|
| Dashboard | `/control` | Setting up projects and widgets, going live (desktop) |
| Operator | `/operator` | Live control on a phone or tablet: scores, clock, toggles |
| Render | `/render` | The output page you load in OBS/vMix (transparent, 1920×1080) |

All screens stay in sync over Socket.io: a change on one shows up on the others
immediately. Opening `http://<host>:2014/` on a phone or tablet takes you to the
operator; on a desktop it takes you to the dashboard.

Other pages you can reach from the dashboard: **Edit project** (`/project`:
canvas size, branding, assets), **Design** (`/design`), **Overlay layout**
(`/layout`: free placement of widgets), the **scoreboard editor** (`/editor`) and
**Create from design** (`/compose`, beta).

## 3. Create a project

A project holds everything for one show or client: widgets, branding and assets
(logos, fonts, PNG designs).

1. In the dashboard, open **Project & network**.
2. Click **New project** and enter a name.
3. Select it in the **Project** dropdown and click **Activate this project**.
   Everything you see in the dashboard, operator and render now belongs to that
   project.
4. Click **Edit client — branding & assets** to:
   - set the **render canvas** (default 1920×1080);
   - pick a **client preset** or set colours, font family and an optional web-font URL;
   - upload **assets** (PNG logos, backgrounds, `.ttf/.otf/.woff/.woff2` fonts);
   - upload **design references** for the scoreboard editor.

You can also just keep working in the default **New client** project; projects are
only a way to keep shows apart.

## 4. Add widgets

In the dashboard, choose a **Widget type** and click **Add widget**.

| Widget type | What it is |
|-------------|------------|
| Match score | Score and match clock; can use a PNG score strip from the scoreboard editor |
| Hockey scorebug | Team codes, scores, team colours and a Q1–Q4 countdown clock |
| F1 timing | F1 position tower, manual or live from MultiViewer — see [F1-TIMING.md](F1-TIMING.md) |
| Ticker | Scrolling text bar |
| Stream countdown | Countdown to the start of the stream |
| Lower third (single) | One name + title |
| Lower thirds | A roster of people; put one on air with a click |
| Quiz | Multiple-choice question with answer reveal |
| Message | A text message, e.g. for a break |

Select a widget to see its **Live controls** (score, clock, texts) in the side panel.
Use **Edit settings** on the widget for its configuration: position, transition,
typography and so on. **Overlay layout** (`/layout`) lets you drag widgets to a free
position on the canvas.

For custom score strips, see [DESIGN-PNG-WORKFLOW.md](DESIGN-PNG-WORKFLOW.md).

## 5. Connect OBS or vMix

Add one browser input that shows all live widgets:

| | OBS | vMix |
|-|-----|------|
| Input | **Browser** source | **Add Input → More → Web Browser** |
| URL | `http://127.0.0.1:2014/render` | `http://127.0.0.1:2014/render` |
| Size | 1920 × 1080 | 1920 × 1080 |

The page is transparent, so the graphics sit on top of your video. The
**Combined render URL** button in the dashboard header copies this URL.

Need a widget on its own layer (for example a countdown you want to position
separately)? Click the **link icon** next to the widget name to copy its solo URL
(`/render?graphic=<id>`) and add a second browser input for it.

If ProVerlay runs on another computer than OBS/vMix, replace `127.0.0.1` with that
computer's IP address. More detail: [OBS-VMIX.md](OBS-VMIX.md).

## 6. Go live

- **Go live** on a widget card shows it on the combined output (`/render`); click
  **Hide combined** to take it off.
- The **solo** button next to the link icon shows the widget on its own solo URL,
  independently of the combined output.
- Cards show a **Combined** and/or **Solo source** badge while they are on air.
- **Preview** in the header opens the render page so you can check what is on air.

## 7. Operator on iPad or iPhone

1. Connect the iPad/iPhone to the **same Wi-Fi network** as the computer running
   ProVerlay.
2. In the dashboard, open **Project & network → Network** to see the LAN addresses.
3. On the device, open `http://<computer-ip>:2014/operator` — use **http**, not https.
4. Optional: add it to the home screen (Share → Add to Home Screen).

The operator shows the widgets meant for live control (match score, hockey scorebug,
F1 timing, ticker, lower thirds, quiz) with large touch controls.

**Working with the operator**

- The bar under the header lists every operator widget. Tap a name to show only
  that widget, or **All** to see them all. A red dot means the widget is on air.
  The choice is remembered; links like `/operator?focus=<id>` open one widget.
- Every widget is one card, the same as in the dashboard's Operate panel and on
  `/operate/<id>`: the header has the **ON AIR** badge and **Go live** /
  **Take off air**; below it are the main controls (score −/+, **Start clock** /
  **Pause clock**, period, people, questions, messages).
- **More controls** holds the rest: exact minute/second, ±1s/15s/1 min, stoppage
  time, hide clock, quarter length, team colours, ticker speed and font size.
  It starts closed on phones and open on larger screens, and remembers your choice.
- Lowering a score asks for confirmation on the operator, so a mis-tap does not
  change the score on air.
- Score and clock changes are sent as single steps (for example "+1 home"), so
  two operators or a Stream Deck can work on the same match without overwriting
  each other.
- While the connection is lost, a banner appears and the controls are locked
  until ProVerlay is reachable again.

## 8. Stream Deck (Companion)

ProVerlay includes a Bitfocus Companion module with actions for showing and hiding
graphics, scores, clocks, countdowns and speakers, plus automatic presets. See
[`companion/README.md`](../companion/README.md) for installation and
[COMPANION.md](COMPANION.md) for the full list.

## 9. Export and import projects

Projects can move between computers as a single `.proverlay` file (a zip with the
project settings and all its assets).

- **Export:** activate the project, then **Project & network → Export**. The browser
  downloads `<project-name>.proverlay`.
- **Import:** **Project & network → Import** and pick a `.proverlay` (or `.zip`) file.
  The import is added as a **new** project and is **not** activated automatically —
  select it and click **Activate this project** when you are ready to switch.

## 10. Troubleshooting

### White or black background in OBS/vMix

- Make sure the input loads `/render`, not `/control` or `/operator`.
- Do not set a background colour on the browser input.
- In OBS, restore the Browser Source's default **Custom CSS**.
- Set the input size to the output resolution (1920×1080) instead of scaling it.

See [OBS-VMIX.md → Transparency](OBS-VMIX.md#transparency).

### The iPad or iPhone can't connect

- Both devices must be on the same network. Guest Wi-Fi and some venue networks
  block traffic between devices ("client isolation") — use another network or a
  travel router.
- Use `http://` — if the browser shows `ERR_SSL_PROTOCOL_ERROR`, the address bar has
  `https://`.
- Use the IP shown under **Project & network → Network**, not `localhost`.
- When macOS asks whether ProVerlay (or `node`) may accept incoming network
  connections, click **Allow**. If you clicked Deny, change it in **System Settings →
  Network → Firewall → Options**.
- Check from the device's browser that `http://<computer-ip>:2014/api/state`
  returns text.

### Port 2014 is already in use

The server stops with *"ProVerlay could not bind to port 2014 (already in use)"*.

- Another ProVerlay is probably still running (the Mac app in the menu bar, or an
  `npm start` in another terminal). Quit it, or let the Mac app use it — the app
  connects to an existing ProVerlay server instead of starting a second one.
- Find what is using the port: `lsof -nP -iTCP:2014 -sTCP:LISTEN`.
- When running from source you can use another port: `PORT=2015 npm start` (then use
  that port in every URL and in Companion). The Mac app uses port 2014.

### macOS says the app can't be opened

The Mac app is ad-hoc signed and not notarized, so Gatekeeper blocks it after
download. Open it with **right-click → Open → Open**, or remove the quarantine flag:

```bash
xattr -cr /Applications/ProVerlay.app
```

### Graphics do not update

- Check the **Live sync** pill in the dashboard header.
- Refresh the browser input in OBS/vMix.
- Check that a firewall or proxy does not block WebSocket connections on port 2014.

## Security

ProVerlay has **no login**. Anyone who can reach port 2014 on your network can open
the dashboard and change or take your graphics on air. Use it on a network you trust.
See [SECURITY.md](../SECURITY.md).
