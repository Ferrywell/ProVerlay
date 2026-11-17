# Design input — screenshots and references

How to bring visual designs (screenshots, Figma exports, PNG mock-ups) into a
ProVerlay project.

## Where designs go

1. **Edit project → Design references** (`/project`) — upload PNG/JPEG/WebP. Files are
   stored in the active project's assets folder
   (`data/projects/<project-id>/assets/`) with a `design-` prefix, and travel with the
   project when you export it.
2. **Scoreboard editor** (`/editor`) — use a design as the PNG background of a score
   strip, or load it as a semi-transparent **reference image** over the canvas while
   you place fields (the reference is never visible in OBS/vMix).
3. **Create from design** (`/compose`, beta) — upload a design and let ProVerlay
   suggest the text fields, then create a widget from it.

## Recommended format

| Property | Value |
|----------|-------|
| Full-frame references | 1920×1080 (same as the default canvas) |
| Score strips | Only the strip itself, e.g. 800×72 px — see [DESIGN-PNG-WORKFLOW.md](DESIGN-PNG-WORKFLOW.md) |
| Format | PNG, with transparency where needed |
| Name | Descriptive, e.g. `design-scorebar.png`, `design-penalties.png` |

## What to note per design

When you hand a design to someone building the overlay, note:

- which elements are live data (team codes, score, clock, penalties) and which are
  static artwork;
- the position on screen (top/bottom, left/right);
- typography and colours;
- desired animations (score roll, fade-in);
- differences between what the **operator** (phone/tablet) and the **dashboard**
  (desktop) need to control.

The editor supports these `matchScoreboard` binds: `homeCode`, `awayCode`,
`homeScore`, `awayScore`, `clock`, plus static text fields.
