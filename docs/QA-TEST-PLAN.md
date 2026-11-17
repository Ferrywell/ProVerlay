# Manual test plan

A checklist for testing ProVerlay by hand before a release or after a larger UI
change. Automated tests run with `npm test`; this plan covers what they cannot:
real browsers, OBS/vMix and touch devices.

## Test environment

| Item | Value |
|------|-------|
| Start | `npm ci && npm start` (or the Mac or Windows app) |
| Dashboard | http://localhost:2014/control |
| Operator | http://localhost:2014/operator |
| Render | http://localhost:2014/render |
| API | http://localhost:2014/api/state |
| Data | `data/` (from source), `~/Library/Application Support/ProVerlay/data` (Mac app) or `%APPDATA%\ProVerlay\data` (Windows app) |

Tip: use a throwaway data folder so you start from a blank project:
`PROVERLAY_DATA_DIR=$(mktemp -d) npm start`.

## 1. Smoke (P0)

- [ ] Server starts without errors and prints the dashboard/operator/render URLs
- [ ] `/control` loads; the sync pill shows **Live sync**
- [ ] `/render` loads with a transparent background
- [ ] `GET /api/state` returns JSON
- [ ] A fresh data folder starts with one blank project and no widgets

## 2. Dashboard (P0)

- [ ] Every widget type in **Widget type** can be added and removed
- [ ] **Go live** / off works for each widget; the live state is clearly visible
- [ ] The solo button (next to the link icon) toggles the widget on `/render?graphic=<id>` only
- [ ] The link icon copies the per-widget render URL; **Combined render URL** copies `/render`
- [ ] Branding changes in *Edit project* (colours, font) show up on the render

## 3. Render (P0)

- [ ] Match score: score and clock update, clock ticks while running
- [ ] Hockey scorebug: quarter clock counts down, scores and team colours update
- [ ] Ticker scrolls; empty ticker does not break the page
- [ ] Stream countdown counts down; behaviour at 0 matches *Hide when expired*
- [ ] Lower third / lower-thirds roster show name and title
- [ ] Message shows its text
- [ ] Quiz shows the question, reveal highlights the correct answer
- [ ] Without `PROVERLAY_EXPERIMENTAL=f1` the *Add widget* menu has no F1 timing; a project
      that already has one still renders it (see [F1-TIMING.md](F1-TIMING.md))
- [ ] Several widgets visible at the same time without overlap glitches
- [ ] In/out transitions play

## 4. Real-time sync (P0)

- [ ] Dashboard and render in two tabs: going live in the dashboard updates the render in < 500 ms
- [ ] A change via the API updates both tabs
- [ ] Two dashboards open at once stay in sync

## 5. API (P1)

```bash
# Show a graphic on the combined output
curl -X POST http://localhost:2014/api/graphics/<id>/toggle \
  -H "Content-Type: application/json" -d '{"visible": true}'

# Patch the project state
curl -X PATCH http://localhost:2014/api/state \
  -H "Content-Type: application/json" -d '{"settings": {"fontSize": 3}}'

# Unknown id → 404
curl -i -X POST http://localhost:2014/api/graphics/does-not-exist/toggle
```

## 6. Operator on a touch device (P1)

- [ ] iPad/iPhone on the same Wi-Fi opens `http://<mac-ip>:2014/operator`
- [ ] Opening `http://<mac-ip>:2014/` on the device lands on the operator
- [ ] Score, clock and toggles work with touch; layout respects the safe areas

## 7. OBS / vMix (P1)

- [ ] OBS Browser Source, 1920×1080: graphics over video, transparent background
- [ ] vMix Web Browser input, 1920×1080: transparent, no scrollbars
- [ ] A solo URL on a separate input positions independently
- [ ] A new project renders in Inter: the same line breaks and widths in OBS on macOS
      and in OBS/vMix on Windows (compare screenshots of the same project)

See [OBS-VMIX.md](OBS-VMIX.md).

### Windows app (beta)

- [ ] `ProVerlay-win-x64-setup.exe`: SmartScreen *More info → Run anyway*, install
      *Only for me* without admin rights; Start menu and desktop shortcuts work
- [ ] First start: firewall notice, then the Windows Defender Firewall prompt; allow
      *Private networks*; an iPad on the same network opens `/operator`
- [ ] Tray icon: click opens the dashboard, menu copies the render URL, quit stops the
      server
- [ ] Preferences: change the port, the server restarts on it; *Start ProVerlay when
      you log in* survives a sign-out
- [ ] Port taken or inside `netsh interface ipv4 show excludedportrange protocol=tcp`:
      clear error with a way to choose another port
- [ ] Uninstall keeps `%APPDATA%\ProVerlay\data`; reinstall shows the same projects
- [ ] (Experimental, `PROVERLAY_EXPERIMENTAL=f1`) F1 widget → **Open MultiViewer** without
      MultiViewer installed offers the download link; with MultiViewer installed it opens the app

## 8. Persistence and projects (P1)

- [ ] Change state, restart the server: state is kept
- [ ] Create a project, switch with **Activate this project**, switch back
- [ ] **Export** downloads a `.proverlay` file; **Import** creates a new project from it (not activated automatically) including its assets

## 9. Companion (P2)

- [ ] The module connects to ProVerlay (`npm run test:connection` in `companion/`)
- [ ] Presets appear per graphic
- [ ] Toggle from a (virtual) button; the feedback shows the on-air state

See [COMPANION.md](COMPANION.md).

## 10. Edge cases (P2)

- [ ] Toggle the same widget 10× quickly — final state is consistent
- [ ] Server restart while the render is open — render reconnects and shows the current state
- [ ] Port 2014 in use — the server exits with a clear message

## Severity

| Level | Definition |
|-------|------------|
| Critical | Render broken, data loss or crash |
| High | A widget type does not work, or no sync |
| Medium | Styling bug or confusing UX |
| Low | Cosmetic |

Report bugs with the [bug report template](https://github.com/Ferrywell/ProVerlay/issues/new?template=bug_report.yml).
