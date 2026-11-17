# Changelog

All notable changes to ProVerlay are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The repository history was rewritten before the open-source release to remove client
material. The entries below are reconstructed from that history; the tags
`v0.4.0`–`v0.6.8` point at the rewritten commits. There was no 0.5.x release.

## [Unreleased]

## [0.10.0] - 2026-11-17

An Image widget for pre-designed graphics, data from Google Sheets, CSV and Excel with
`{{variables}}` in text fields, and the F1 timing tower moved behind an experimental flag.

### Added

- **Image widget** (#26) for graphics designed elsewhere: PNG lower thirds, logo bugs,
  sponsor boards, full-screen slides. One widget holds a list of images; upload several
  at once (drag-and-drop), reorder, and put one on air with a tap or step through with
  Next/Previous from the dashboard, the operator and Companion. Placement: free (position
  presets or the layout editor, original size / fit width / fit canvas / percentage),
  a lower-third slot, or full screen. Switching images crossfades with the widget's
  transition; images are decoded before they go on air. Optional auto-hide and a
  carousel. PNG, WebP, JPEG, SVG and animated GIF/APNG; SVG files are served with a
  sandbox CSP.
- **Data sources and variables** (#27): a Data page (`/data`) for Google Sheets
  (polled, no login), CSV (`,` `;` tab, BOM, quoting) and Excel `.xlsx` files, uploaded
  or linked on the ProVerlay computer (re-read on save). Each source shows its status
  and a preview, is cached in the project for offline use and travels with an export.
  A source can fill the lower-thirds roster, a ticker, a quiz or an image list (the
  item on air stays on air when its row changes; optionally hold changes while on
  air). `{{variables}}` in the text of messages, lower thirds, quiz and ticker:
  project variables, variables from a key/value source, and built-ins (date, time,
  scorebug teams, score, clock, period). Sheet links are fetched over https from
  Google Sheets only unless other hosts are allowed on the ProVerlay computer, never
  from private addresses, with a timeout and a 5 MB limit. New dependency:
  `read-excel-file` (MIT) for `.xlsx`.
- Companion module 1.1.0: *Image: show image*, *next / previous image* and *hide*
  actions, an *image on air* feedback, an `image_<id>_name` variable and presets.

### Changed

- The F1 timing tower is experimental and no longer part of the default widget set
  (#25): it is gone from the *Add widget* menu, the operator, the Companion presets
  and the README. Start ProVerlay with `PROVERLAY_EXPERIMENTAL=f1` to add one.
  Projects that already contain a tower render exactly as before and keep its
  dashboard card.
- Old single-image widgets (`{ src, alt }`) are migrated on load to the new Image widget
  with that one image on air; they render exactly as before.

## [0.9.0] - 2026-11-17

First Windows release (beta), the same overlay output on every OS, and fixes from a
full Windows 11 beta test (#19) that also affect the Mac app.

### Added

- **Windows app (beta)**: `ProVerlay-win-x64-setup.exe`, a per-user NSIS installer for
  Windows 10/11 x64 (no admin rights; desktop and Start-menu shortcuts; the uninstaller
  keeps your projects). Unsigned for now: SmartScreen asks for *More info → Run anyway*.
  Every release builds, verifies, installs, starts and uninstalls it in CI.
- Desktop app on Windows: frameless window with native caption buttons that follow the
  Light/Dark theme, tray icon with Open Dashboard / Copy Operator URL / Copy Render URL /
  Preferences / Quit, close-to-tray, a firewall explanation before Windows asks, and a
  "Port already in use" dialog with *Choose Another Port…*.
- Preferences window (Ctrl+, / Cmd+,): port, open the dashboard on start, start at login.
- Bundled **Inter** 4.1 font (SIL Open Font License 1.1, Latin + Latin Extended variable
  subset, 137 KB) in `public/shared/fonts/`, loaded by `/render`, the scoreboard editor
  and the dashboard previews. The font menus offer it as "Inter (bundled)".
- Windows documentation: installing with `ProVerlay-win-x64-setup.exe` (SmartScreen,
  per-user install, firewall prompt), data folder `%APPDATA%\ProVerlay\data`, uninstall,
  port in use and Hyper-V/WSL reserved port ranges, OBS on Windows and vMix notes
  (README, user guide, OBS/vMix guide, desktop app guide, manual test plan).
- Website: Windows (beta) download and install steps.

### Changed

- Start at login opens ProVerlay in the background (server and tray, no dashboard
  window).
- New Match score widgets start in the 1st half; new Hockey scorebugs start at Q1 15:00
  with HOME / AWAY. The hockey break label is "BREAK" instead of the Dutch "RUST" (on air,
  in the operator and in the Companion variable). Saved projects are unchanged.
- An imported project whose name already exists gets " (imported)" added to its name.
- The network list leaves out link-local 169.254.x.x addresses that phones can't reach.
- The Companion dev setup (`npm run setup-dev:node`) copies the module instead of linking
  it; `--link` keeps the old behaviour for Companion 4.x.
- Dependencies updated (`npm audit fix`, Express 4.22.3): fixes advisories in
  `proxy-addr`, `body-parser`, `qs`, `multer`, `engine.io`, `ws` and `socket.io-parser`.
- New projects and the bundled `demo-club` preset use `'Inter', system-ui, sans-serif`
  as the brand font instead of the OS UI font (SF Pro on a Mac, Segoe UI or Arial on
  Windows), so the same overlay looks identical in OBS/vMix on every machine. Existing
  projects keep their stored font.
- Running clocks in custom scoreboards and the clock pill use tabular figures; the
  stream countdown digits are tracked slightly wider so heavy digits never touch.

### Fixed

- **OBS/vMix sources, operator and dashboard pages now reconnect after a clean
  restart** of ProVerlay (port change, Quit + start again, update). Before, they kept
  showing the last state until someone pressed Refresh.
- **Lower thirds**: *Edit settings* opens the people list (it opened the image editor,
  so people could not be added in the desktop app). Match score likewise; both panels
  link to the design editor.
- The app no longer mistakes another program on its port for ProVerlay.
- Uninstalling on Windows removes the start-at-login entry.
- The ticker no longer shows an empty brand tab when there is no brand name.
- Leftover Dutch labels in the scoreboard editor are now English.
- The first-run firewall note explains Windows' Public vs Private networks; the close-to-
  tray notice can't be lost to Do Not Disturb; the window fits smaller or scaled screens;
  Chromium caches stay out of the roaming profile on Windows; the export Save dialog has
  a proper title; native select menus follow dark mode.
- **Open MultiViewer** on Windows: the app was reported as opened even when MultiViewer
  was not installed, because `start multiviewer://` always succeeds. ProVerlay now
  checks the `multiviewer:` protocol registration first and offers the download page
  when it is missing.

## [0.8.0] - 2026-11-17

One operator panel everywhere, project management, dark mode, a complete Companion
module and automated release builds.

### Added

- One shared app header on every page (except `/render`): page title, a project chip to
  switch the active project (asks for confirmation while something is ON AIR) or manage
  projects, consistent navigation, the connection pill and one "Preview" label everywhere.
- Dark mode for all control pages, following the system setting or forced to Light/Dark
  from the header menu (stored per device). `/render` is unchanged.
- Project management: rename, duplicate and delete projects from the Project page
  (deleted projects move to a `trash` folder in the data directory; the active and the
  last project cannot be deleted).
- Custom CSS per project (`custom.css`, edited on the Project page), loaded by `/render`
  after the built-in styles and applied live; included in `.proverlay` export/import.
- Operator widget switcher: jump to one widget instead of scrolling through all of them;
  `?focus=<id>` opens a single widget.
- Companion module 1.0: actions for every widget type (score, clock, period, ticker,
  countdown, lower thirds, quiz, message, brand colour), ON AIR and clock feedbacks,
  live variables (scores, clocks, periods, ticker text, quiz) and presets per graphic.
- Automated release builds: pushing a `v*` tag builds Apple Silicon and Intel Mac zips,
  verifies them, writes `SHA256SUMS.txt` and publishes the GitHub release with notes
  from this changelog. See [docs/RELEASING.md](docs/RELEASING.md).

### Changed

- One operate card per widget type, shared by the dashboard, `/operator` and
  `/operate/:id`, with the same labels and a "More controls" section on small screens.
- Score and clock changes from the dashboard, operator and Companion use the atomic
  `/score` and `/clock` endpoints; other edits send only the changed fields. Two
  operators (or an iPad and a Stream Deck) no longer overwrite each other.
- Edit settings saves only the fields you changed and keeps your unsaved edits when the
  widget changes elsewhere.
- The project chip and the dashboard's project list update live when a project is
  created, renamed, duplicated, deleted, imported or activated in another window.
- On `/operator` the header no longer goes back to the Design setup page during a show.
- New widgets get distinct default positions (countdown center, message above the
  ticker, lower thirds bottom-left).
- Server log output is in English.

### Removed

- The outdated `templates/football-score.md`.

## [0.7.0] - 2026-11-17

First open-source release: hardened server, a first test suite, UX and render fixes,
and a clean repository.

### Security

- Origin/Host check on the REST API and the Socket.io handshake; requests from
  non-local web origins are refused (403). Requests without an Origin (Companion,
  scripts) still work.
- Project ids are validated against the registry; path traversal on asset routes
  is no longer possible.
- Uploads are limited to images (png, jpg, webp, gif) and fonts (ttf, otf, woff,
  woff2); every response sends `X-Content-Type-Options: nosniff`.
- `.proverlay` imports are size- and entry-limited and extracted to a staging folder.
- The Socket.io write events were removed; the socket API is read-only.

### Added

- Atomic endpoints `POST /api/graphics/:id/score` and `POST /api/graphics/:id/clock`
  for match and hockey scoreboards.
- Test suite (`npm test`, built-in `node:test`) and CI on macOS, Windows and Linux.
- Rolling `project.json.bak` backups; startup falls back to the backup or the blank
  project instead of crashing.
- Toast notifications, a connection banner that blocks live controls while
  disconnected, an overlap warning when two on-air graphics share a position, and
  undo for deleting ticker messages.
- Editor empty state with PNG upload and drag-and-drop.
- GPL-3.0 license for the application; MIT license for the Companion module
  (`companion/LICENSE`).
- English README and documentation, including a new
  [user guide](docs/USER-GUIDE.md) and OBS setup in [docs/OBS-VMIX.md](docs/OBS-VMIX.md)
  (formerly `docs/VMIX.md`).
- Community files: contributing guide, code of conduct, security policy, issue and
  pull-request templates, `.editorconfig` and `.gitattributes`.
- Product website at [ferrywell.github.io/ProVerlay](https://ferrywell.github.io/ProVerlay/).

### Changed

- Invalid API payloads are rejected with 400 instead of being stored.
- One "ON AIR" language and colour across dashboard, operator, operate and layout;
  "Go live" / "Take off air" buttons.
- All UI text in English, including the Electron tray menu and dialogs.
- Higher-contrast accent and text colours; pinch-zoom allowed on operator pages.
- Every widget type is visible with its default settings, including Match score and
  Stream countdown without a PNG strip.
- Editor and render share one clock-plate geometry (true WYSIWYG).
- Count-down clocks round up, count-up clocks round down, consistently.
- Node.js 22 or newer is required (`.nvmrc`).
- New installs start with a single blank project; the seed script only produces the
  blank project.
- Brand presets ship in `templates/brands/`; your own presets live in `data/brands/`
  and override bundled ones with the same id.
- Hockey scorebug uses generic styling (team colours and the project font) with bold
  defaults for team code, score and clock.
- Font files are parsed generically instead of through a client-specific mapping;
  neutral default team colours.
- Electron dev mode no longer requires a local `data/` folder.
- Companion manifest and package metadata point at the real repository and
  maintainer.

### Removed

- All client material (artwork, fonts, demo projects) from the repository and the
  Mac app seed.
- `data/`, `seed-data/` and internal working documents are no longer tracked by git.

### Fixed

- The server no longer crashes on malformed requests or socket messages.
- A bad PATCH or a broken imported project can no longer make the server unable to
  start.
- Concurrent changes (for example iPad and Stream Deck at the same time) are no
  longer lost; graphic ids are unique.
- One faulty graphic no longer stops the whole render.
- Team codes are no longer truncated in the operate panels.
- Fresh installs and fresh clones start correctly.
- Companion: `npm run test:connection` failed because the script used CommonJS
  `require` in an ES module package.
- Companion: **Set primary color** changed an unused field; it now sets the project
  brand colour that the render uses.

## [0.6.8] - 2026-08-28

### Changed

- The Mac app seed included a complete demo project with all its assets and brand
  preset (removed again in Unreleased).

## [0.6.7] - 2026-08-28

### Added

- Demo project with ticker and brand assets preloaded in the Mac app seed, plus an
  importable `.proverlay` file for existing installs (removed again in Unreleased).

## [0.6.6] - 2026-08-24

### Added

- Hockey scorebug: text size (50–150 %) and weight (Regular/Bold) per category —
  team code, score, clock time, clock period — in **Edit settings**, with live
  preview on the overlay.
- Mac install and handover notes.

## 0.6.5 - 2026-08-24 (untagged, released as part of 0.6.6)

### Changed

- Hockey scorebug: refined clock padding, time/period sizing and optical alignment.

## [0.6.4] - 2026-08-24

### Changed

- Hockey scorebug: locked arm/clock proportions and design tokens; regular-weight
  type.

## [0.6.3] - 2026-08-19

### Changed

- Hockey scorebug: tighter type and spacing, flat inner pill edges, shared code/score
  size and a lighter period label.

## [0.6.2] - 2026-08-19

### Changed

- Hockey scorebug: solid clock circle without a ring; restyled team codes and scores.

## [0.6.1] - 2026-07-30

### Fixed

- F1 timing: spacing of the lap counter and SC/VSC label in the header.

## [0.6.0] - 2026-07-30

### Added

- `hockeyScorebug` widget: Q1–Q4 countdown clock, team codes, scores and colours,
  with operator controls.
- First Mac app release (Apple Silicon).

### Changed

- Hardened hockey clock nudges and start.
- F1 timing and operate UI polish.

## [0.4.0] - 2026-07-02

### Added

- `f1Timing` widget: F1 position tower with a focus driver, fed manually or live
  from MultiViewer, with a delay buffer to sync with the video.
- Staggered in/out animations (slide, drop, fade, cut), lap counter pill, live-data
  status dot and top-5 preview in the operate UI.
- One-click driver import from MultiViewer into the manual list.
- Track status on the lap pill (yellow, SC/VSC, red), tyre compound indicator,
  chequered flag when a driver finishes, configurable gap decimals.
- F1 timing in the overlay layout editor.

### Fixed

- Exit animations are no longer interrupted by live updates; the lap pill stays
  when a lap-count poll is missed.
- Leader row always shows LEADER.
- Copy-to-clipboard falls back gracefully with visible feedback.

## [0.3.0] - 2026-06-16

### Added

- Initial source: Node server with REST API and Socket.io, dashboard, touch
  operator, scoreboard editor, render page for OBS/vMix, project system with
  `.proverlay` export/import, and the Bitfocus Companion module.

[Unreleased]: https://github.com/Ferrywell/ProVerlay/compare/v0.10.0...HEAD
[0.10.0]: https://github.com/Ferrywell/ProVerlay/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/Ferrywell/ProVerlay/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/Ferrywell/ProVerlay/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/Ferrywell/ProVerlay/compare/v0.6.8...v0.7.0
[0.6.8]: https://github.com/Ferrywell/ProVerlay/compare/v0.6.7...v0.6.8
[0.6.7]: https://github.com/Ferrywell/ProVerlay/compare/v0.6.6...v0.6.7
[0.6.6]: https://github.com/Ferrywell/ProVerlay/compare/v0.6.4...v0.6.6
[0.6.4]: https://github.com/Ferrywell/ProVerlay/compare/v0.6.3...v0.6.4
[0.6.3]: https://github.com/Ferrywell/ProVerlay/compare/v0.6.2...v0.6.3
[0.6.2]: https://github.com/Ferrywell/ProVerlay/compare/v0.6.1...v0.6.2
[0.6.1]: https://github.com/Ferrywell/ProVerlay/compare/v0.6.0...v0.6.1
[0.6.0]: https://github.com/Ferrywell/ProVerlay/compare/v0.4.0...v0.6.0
[0.4.0]: https://github.com/Ferrywell/ProVerlay/compare/e542d35...v0.4.0
[0.3.0]: https://github.com/Ferrywell/ProVerlay/commit/e542d35
