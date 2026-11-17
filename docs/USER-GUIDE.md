# ProVerlay user guide

This guide walks you through a first show: starting ProVerlay on a Mac or Windows PC,
setting up a project, adding widgets, getting them into OBS or vMix and controlling
them from an iPad.

- [1. First start](#1-first-start)
- [2. The screens](#2-the-screens)
- [3. Create a project](#3-create-a-project)
- [Manage projects (rename, duplicate, delete)](#manage-projects-rename-duplicate-delete)
- [4. Add widgets](#4-add-widgets)
  - [Custom CSS per project](#custom-css-per-project)
- [5. Connect OBS or vMix](#5-connect-obs-or-vmix)
- [6. Go live](#6-go-live)
- [7. Operator on iPad or iPhone](#7-operator-on-ipad-or-iphone)
- [8. Stream Deck (Companion)](#8-stream-deck-companion)
- [9. Export and import projects](#9-export-and-import-projects)
- [10. Troubleshooting](#10-troubleshooting)

## 1. First start

**Mac app.** Download the latest release from the
[releases page](https://github.com/Ferrywell/ProVerlay/releases) (`ProVerlay-mac-arm64.zip`
for Apple Silicon, `ProVerlay-mac-x64.zip` for Intel Macs), unzip it, move
`ProVerlay.app` to Applications and open it with **right-click → Open** the first
time (see [Gatekeeper](#macos-says-the-app-cant-be-opened) if that fails). The
dashboard opens in the app window and a ProVerlay icon appears in the menu bar.

**Windows app (beta).** Download `ProVerlay-win-x64-setup.exe` from the same releases
page and run it (Windows 10 or 11, x64):

1. The installer is not code-signed yet, so SmartScreen says *"Windows protected your
   PC"*. Click **More info → Run anyway** (see
   [SmartScreen](#windows-smartscreen-blocks-the-installer)).
2. Keep **Only for me**: no administrator rights needed. ProVerlay gets a Start menu
   and a desktop shortcut.
3. When **Windows Defender Firewall** asks whether ProVerlay may communicate on
   networks, tick **Private networks**, leave *Public networks* unticked and click
   **Allow access**. This is only needed for an iPad, phone or Stream Deck on another
   device; OBS or vMix on the same PC work without it.

The dashboard opens in the app window and a ProVerlay icon appears in the notification
area (bottom right, possibly under the **^** arrow). Click it to reopen the dashboard
after closing the window; right-click it to quit. Installing a newer version keeps your
projects, and so does uninstalling (**Settings → Apps → Installed apps → ProVerlay**).
The Windows app is in beta: please report problems in the
[issues](https://github.com/Ferrywell/ProVerlay/issues). More in [APP.md](APP.md).

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
| Windows app | `%APPDATA%\ProVerlay\data` — paste it in the File Explorer address bar |
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

New projects use **Inter** as their font. It ships with ProVerlay, so the render looks
the same in OBS or vMix on a Mac and on a Windows PC. A font that is only *installed*
on one computer (for example SF Pro on a Mac or Segoe UI on Windows) looks different —
or is missing — on another; upload the client's font files as project assets instead,
so they travel with the project and its `.proverlay` export. Existing projects keep
the font they already have.

You can also just keep working in the default **New client** project; projects are
only a way to keep shows apart.

### Manage projects (rename, duplicate, delete)

The **Projects** list at the top of the project page (`/project`, or **Edit client —
branding & assets** in the dashboard) shows every project:

- **Activate** switches the whole show (dashboard, operator, render) to that project.
- **Rename** changes the display name. The project's id (its folder name) stays the
  same, so URLs and Companion buttons keep working.
- **Duplicate** copies the widgets, branding, assets and custom CSS into a new project,
  e.g. to prepare next week's match from this week's. The copy is not activated.
- **Delete** asks for confirmation and then moves the project folder to the `trash`
  folder in the ProVerlay data directory instead of erasing it, so nothing is lost
  if you delete the wrong project.
  The **active** project and the **last** project cannot be deleted: activate another
  project first.

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
| Image | Pre-designed graphics from a designer: PNG lower thirds, logos, sponsor boards, full-screen slides |

Select a widget to see its **Live controls** (score, clock, texts) in the side panel.
Use **Edit settings** on the widget for its configuration: position, transition,
typography and so on. **Overlay layout** (`/layout`) lets you drag widgets to a free
position on the canvas.

For custom score strips, see [DESIGN-PNG-WORKFLOW.md](DESIGN-PNG-WORKFLOW.md).

### Image: pre-designed graphics

Add an **Image** widget and open **Edit settings**. Drop your files on the drop zone (or
choose several at once): PNG, WebP, JPEG, SVG and animated GIF/APNG work. The files are
stored in the project, so they go along with an export. Reorder them with ↑ ↓.

- **Placement:** *Free placement* uses the overlay position and a size (original, fit
  canvas width, fit canvas, or a percentage of the canvas width). *Lower-third slot*
  puts every image in the same spot at the bottom left. *Full screen* fills the canvas
  (good for full-frame PNGs with transparency).
- **Live controls:** tap a thumbnail to put it on air, tap it again to take it off.
  **Next** / **Previous** step through the list. Switching while on air fades (or wipes,
  see *Transition*) from one image to the next.
- **Hide after** takes the image off air after a number of seconds. The **carousel**
  rotates through the list while the widget is on air, e.g. for sponsor boards.

Sizes follow the canvas size, so a 4K canvas shows 4K images: export your designs at the
canvas resolution for the sharpest result.

New widgets get a default position that does not collide with the others: match score
and hockey scorebug at the top center, the stream countdown in the center, the ticker
along the bottom, a message just above the ticker, lower thirds bottom left and the quiz
on the left. You can change any of these in **Edit settings** or `/layout`.

### Data from a spreadsheet

Names, titles, ticker lines, quiz questions and image lists can come from a Google
Sheet, a CSV or an Excel file, and text fields can use variables such as
`{{event.title}}` or `{{home.score}}`. Open **Data** in the header. See
[DATA-SOURCES.md](DATA-SOURCES.md).

### Custom CSS per project

For a look the settings cannot give you (a client-specific scorebug, other corner radii,
a background plate), every project can have its own stylesheet. Open the project page
(`/project`) and scroll to **Custom CSS**:

1. Type or paste CSS in the editor and click **Save CSS** (or press ⌘S / Ctrl+S).
2. Every open render (OBS, vMix, previews) picks up the change within a second; no
   need to refresh the browser source.
3. Leave the editor empty and save to remove the custom CSS again.

Example: give the hockey clock a project asset as background (upload `plate.png` under
**Assets** first):

```css
.hockey-clock {
  background: url(assets/plate.png) center / cover !important;
}
.graphic--message .text {
  border-radius: 0;
  font-weight: 800;
}
```

Good to know:

- The stylesheet is loaded after ProVerlay's own CSS, so equal selectors win. Use
  `!important` when a built-in rule is more specific.
- **Class names and variables** under the editor lists the main class names
  (`.graphic--<type>`, `.match-board`, `.hockey-clock`, …) and CSS variables
  (`--primary`, `--brand-font`, …). Each overlay layer also carries
  `data-id="<widget id>"` to target one specific widget.
- Use `url(assets/<file>)` for project assets. `@import` is removed when you save.
  Avoid links to websites so the overlay keeps working without internet.
- The limit is 200 KB. Custom CSS is part of `.proverlay` exports and of **Duplicate**.
- Custom CSS can change or hide anything on the render output; only use CSS you trust.

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
project settings, its custom CSS and all its assets).

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
- On Windows, see [Windows Firewall](#windows-firewall-blocks-the-ipad-or-companion).
- Check from the device's browser that `http://<computer-ip>:2014/api/state`
  returns text.

### Windows Firewall blocks the iPad or Companion

OBS and vMix on the same PC always reach ProVerlay (`127.0.0.1` is not firewalled), but
other devices only do when Windows Defender Firewall allows it.

- The first time ProVerlay starts, Windows asks whether it may communicate on
  networks: tick **Private networks** and click **Allow access**. Allowing it may need
  an administrator account.
- Make sure the network you are on is set to **Private** (**Settings → Network &
  internet → Wi-Fi or Ethernet → your network → Network profile type → Private
  network**). On a *Public* network the rule for private networks does not apply.
- Clicked *Cancel*, or need to change it later? Open **Windows Security → Firewall &
  network protection → Allow an app through firewall → Change settings**, find
  **ProVerlay** (running from source: **Node.js JavaScript Runtime**) and tick
  **Private**.

### Windows SmartScreen blocks the installer

The Windows installer is not code-signed yet, so SmartScreen shows *"Windows protected
your PC"*. Click **More info**, check that the app is `ProVerlay-win-x64-setup.exe`,
then **Run anyway**. Your browser may also warn that the file is not commonly
downloaded; choose **Keep**. To check the download, compare
`Get-FileHash .\ProVerlay-win-x64-setup.exe -Algorithm SHA256` (PowerShell) with
`SHA256SUMS.txt` on the release page.

### Port 2014 is already in use

ProVerlay cannot start its server: the app shows an error (with a button to choose
another port), and `npm start` stops with *"ProVerlay could not bind to port 2014
(already in use)"*.

- Another ProVerlay is probably still running (the app in the menu bar or notification
  area, or an `npm start` in another terminal). Quit it, or let the app use it — the
  app connects to an existing ProVerlay server instead of starting a second one.
- Find what is using the port. macOS: `lsof -nP -iTCP:2014 -sTCP:LISTEN`. Windows
  (Command Prompt): `netstat -ano | findstr :2014`, then
  `tasklist /FI "PID eq <pid>"` with the number from the last column.
- Choose another port: in the app under **Preferences… → Port**, or from source with
  `PORT=2015 npm start` (Windows PowerShell: `$env:PORT=2015; npm start`). Then use that
  port in every URL — OBS/vMix, the operator — and in Companion.

**Windows: port reserved by Hyper-V, WSL or Docker.** On PCs with Hyper-V, WSL 2 or
Docker Desktop, Windows reserves blocks of ports for itself. If 2014 falls in such a
block, ProVerlay cannot use it although nothing shows up in `netstat` (from source the
error says *permission denied*). List the reserved ranges:

```bat
netsh interface ipv4 show excludedportrange protocol=tcp
```

If 2014 is inside one of the ranges, pick a port outside all of them in
**Preferences… → Port** (or with `PORT`). The ranges can change after a reboot.

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
