# PNG design → live overlay

How to turn a PNG score strip into a live `matchScoreboard` overlay that looks the
same in the editor and in OBS/vMix.

## Workflow

1. Export **only the score strip** as a PNG (transparent, or with the pill shapes
   baked in), e.g. `800×72 px`. Do not place it on a full 1920×1080 frame.
2. Open the scoreboard editor (`/editor`) and upload the PNG as background. The canvas
   takes the PNG's dimensions automatically.
3. When ProVerlay detects a score bar it offers to **auto-place the text fields**;
   accept, or click **Auto-place fields** later.
4. Drag the fields until they sit inside the pills / timer area (arrow keys move 1 px,
   Shift+click selects several fields, Ctrl+Z undoes).
5. **Save** and check `/render` — it should match the editor 1:1.

## Common pitfalls

| Problem | Cause | Fix |
|---------|-------|-----|
| Fields at the wrong height | Strip placed on a 1920×1080 canvas | Upload only the strip; strip mode keeps the PNG's own aspect ratio |
| Score overlaps team code | Loose fields without a fixed width | Score and clock use `tabular-nums` and a `min-width`; keep fields inside their pill |

## How it works

- Font sizes use `cqw` (percentage of the canvas width), identical in the editor and
  the render. In vMix and in browsers without container queries the render falls
  back to pixel sizes automatically.
- Scores and clock use `tabular-nums` plus a `min-width`, so digits do not shift.
- Strip mode: when `refHeight < 280px` the widget uses the exact PNG aspect ratio
  instead of a 16:9 canvas.
- Editor and render share the same layout code (`public/shared/canvas-layout.js`).

## Handing over a PNG

When you pass a design to someone else to wire up, mention:

- which binds go where (team code, score, clock);
- the font and size used in the design tool;
- whether the pill shapes are **in** the PNG (only text is live) or **not** (the PNG is
  only a background).

Fully automatic "PNG to overlay" conversion is still limited: **Create from design**
(`/compose`, beta) suggests fields, but expect to fine-tune them in the editor.
