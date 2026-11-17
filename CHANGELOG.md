# Changelog

All notable changes to ProVerlay are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The repository history was rewritten before the open-source release to remove client
material. The entries below are reconstructed from that history; the tags
`v0.4.0`–`v0.6.8` point at the rewritten commits. There was no 0.5.x release.

## [Unreleased]

### Added

- One shared app header on every page (except `/render`): page title, a project chip to
  switch the active project (asks for confirmation while something is ON AIR) or manage
  projects, consistent navigation, the connection pill and one "Preview" label everywhere.
- Dark mode for all control pages, following the system setting or forced to Light/Dark
  from the header menu (stored per device). `/render` is unchanged.

### Changed

- The project chip and the dashboard's project list update live when a project is
  created, renamed, duplicated, deleted, imported or activated in another window.
- On `/operator` the header no longer goes back to the Design setup page during a show.

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

[Unreleased]: https://github.com/Ferrywell/ProVerlay/compare/v0.7.0...HEAD
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
