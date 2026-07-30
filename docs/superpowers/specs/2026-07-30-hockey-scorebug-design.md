# Hockey scorebug (`hockeyScorebug`) — design

**Status:** approved 2026-07-30  
**Mockup:** `docs/ux/hockey-scorebug-mockup.html`  
**Brand:** `docs/brand/ODIDO.md` §8

## Summary

New CSS-built overlay type (F1 pattern): circular clock with Glow one progress ring outside the disc, solid team stripes, score tiles. Not a PNG strip / `matchScoreboard` preset.

## Data

```js
{
  homeCode, awayCode, homeScore, awayScore,
  homeColor, awayColor, // manual hex
  clock: {
    period: 'q1'|'q2'|'q3'|'q4'|'break',
    remainingMs, quarterMs, running, runningSince
  },
  animation: { enabled, durationMs },
  style: { scale }
}
```

Ring progress = elapsed / quarter (fills clockwise; empty at start, full at 00:00). Break → ring idle.

## Animations

- Enter/leave: drop like match-board (+ light arm/clock stagger)
- Scores: existing `animateScore` roll
- Clock/ring: in-place update (no DOM wipe per tick)
- Period/code/color: CSS transitions

## Operate

Score ±, Q1–Q4/RUST, start/pause, reset quarter, nudges, codes + colors, quarter length.

## Files

`graphicDefaults.js`, `hockey-utils.js`, `operate-hockey.js`, `render.js`/`render.css`, `operate-handlers.js`, `operator.js`, `control`, Odido `project.json`
