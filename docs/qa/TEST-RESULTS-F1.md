# ProVerlay — F1 Functional QA Results

## Executive Summary

Full functional QA was run against `http://127.0.0.1:2014` using Playwright from `/tmp/pv-test/qa-full-f1.mjs`. The server was already up, and port `10101` already had MultiViewer processes listening (`5588`, `5722`), so no fake simulator was started.

Core dashboard, operator, standalone operate, render, layout, API, socket sync, and F1 MultiViewer flows passed. One Medium issue was found: solo URL copy actions emit `console.error` when clipboard permission is denied, although the dashboard remains usable.

## Findings

| ID | Severity | Area | Description | Steps to reproduce | Expected vs Actual |
|----|----------|------|-------------|--------------------|--------------------|
| QA-F1-001 | Medium | `/control` solo URL copy | Copying solo URLs logs browser console errors when clipboard permission is denied. | Open `/control`, click the solo URL copy button on one or more widget cards in a browser/headless context where clipboard write is denied. | Expected: no `console.error`; show inline feedback or graceful fallback. Actual: each click logs `Copy solo URL failed: NotAllowedError: Failed to execute 'writeText' on 'Clipboard': Write permission denied.` |

## Passed Coverage

- `/control`: add-widget flow passed for Match score, F1 timing, Ticker, Stream countdown, Lower third, Lower thirds, Quiz, and Message. Name prompt appeared, accepted typed names, and each widget appeared in `GET /api/graphics`.
- `/control`: Go live/Hide updated `visible` via API for every temporary widget type. Renderable temporary widgets appeared/disappeared on `/render`; Lower thirds and Quiz correctly require active content before drawing a render layer.
- `/control`: solo URL buttons were clickable, Edit settings links existed per card, and the Overlay layout link existed.
- `/control` operate panel: Match score +/- buttons, score decrement confirmation, clock start/pause, minute/second fields, period select, and team code inputs worked.
- `/control` F1 operate panel: Manual/MultiViewer source, focus driver, top positions, gap display, animation select, lap counter toggle, MultiViewer host/port/delay fields, status dot, add/edit/reorder/delete driver rows, and Import from MultiViewer worked. Import returned `Imported 22 drivers from MultiViewer`.
- `/operator`: operator-enabled temporary widget types rendered; Match score controls worked; Go live/Hide worked; F1 Source/Focus/Top/Delay fields and live status dot worked.
- Socket sync: toggling a temporary match widget in `/control` updated `/operator` immediately.
- `/operate?graphic=<id>`: standalone Match score and F1 operate pages loaded and controls worked.
- `/render`: F1 tower rendered 5 top rows, showed lap header `LAP 3/50`, and row entrance animation had staggered delays (`0ms`, `100ms`, `200ms`, `300ms` observed).
- `/render?graphic=<id>`: isolated F1 render followed solo visibility and hid again.
- `/layout`: selecting a temporary F1 widget and saving X/Y free placement fields worked.
- API sanity: `GET /api/state`, `POST /api/graphics`, `DELETE /api/graphics/:id`, `PATCH /api/graphics/:id`, `POST /api/graphics/:id/toggle`, `GET /api/f1/:id/live`, and `POST /api/f1/:id/import-drivers` returned clean JSON and expected status shapes.
- Console capture: no page crashes or page errors were observed; only the copy-URL clipboard errors listed in the finding were captured.

## UX Suggestions

1. Replace clipboard `console.error` with user-facing copy feedback and a manual-copy fallback when permission is denied.
2. Add a small hint for Lower thirds/Quiz cards when live state is on but no active entry/question exists, so operators understand why nothing appears on render.
3. Include MultiViewer host/port and driver count in the F1 import success/error line for faster troubleshooting.
4. Show a per-field “Saved” pulse in `/layout` after X/Y changes to make autosave timing clearer.
5. Consider labeling the solo toggle separately from copy URL, since both controls sit together and affect different outputs.

## Cleanup Confirmation

All temporary QA widgets created during the final pass were deleted:

- `match-scoreboard-1783002033836`
- `f1-timing-1783002033893`
- `custom-ticker-1783002033968`
- `stream-countdown-1783002034027`
- `lower-third-1783002034093`
- `lower-third-show-1783002034150`
- `quiz-show-1783002034210`
- `message-1783002034267`
- `message-1783002054438`

Existing widgets were not deleted or reconfigured. Final verification reported no remaining test widgets and no changes to existing widgets' original `visible` / `soloVisible` state.
