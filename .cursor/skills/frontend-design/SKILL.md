---
name: frontend-design
description: >-
  Frontend design expert for ProVerlay dashboard (/control), operator (/operator),
  editor (/editor), and project (/project) pages. Use when polishing UI layout,
  responsive behavior, visual hierarchy, tahoe.css tokens, or running a design pass.
  Analyzes anti-cliche dashboard principles before editing.
---

# Frontend Design Expert — ProVerlay

## Scope (only these surfaces)

| Route | Files | Primary user |
|-------|-------|--------------|
| `/control` | `public/control/*` | Desktop TD / setup |
| `/operator` | `public/operator/*` | iPhone/iPad live bediening |
| `/editor` | `public/editor/*` | WYSIWYG scorebord |
| `/project` | `public/project/*` | Assets + canvas per klant |

**Out of scope:** `public/render/` (overlay output), `server/`, API, Companion.

## Before editing — read (in order)

1. [REFERENCE.md](REFERENCE.md) — design philosophy + anti-clichés
2. `docs/UX-DESIGN-BRIEF.md` — Apple Tahoe direction
3. `public/shared/tahoe.css` — shared tokens & components
4. Target page HTML + CSS + JS (structure only, no logic changes unless layout requires)

## Design philosophy (summary)

Build a **workflow tool**, not a template dashboard. See REFERENCE.md for full analysis.

- **Task-first:** primary action visible within 3 seconds (Zet live, Bedienen, Opslaan)
- **No clichés:** no fake stat cards, sidebar nav theatre, purple gradients, chart widgets
- **Real state:** UI reflects live data; empty states explain next step
- **Hierarchy:** one primary column (overlays) + contextual inspector — not everything at once
- **Tahoe light:** glass panels, `#f5f5f7` bg, `#007aff` accent, generous whitespace
- **Responsive with intent:** desktop = density OK; operator = 52px+ touch, safe areas

## Design pass workflow

```
Progress:
- [ ] 1. Audit current page (screenshots or browser)
- [ ] 2. List issues vs REFERENCE checklist
- [ ] 3. Token audit (use --pv-* from tahoe.css, no one-off hex)
- [ ] 4. Implement CSS/HTML (minimal JS unless structure needed)
- [ ] 5. Responsive breakpoints: 980px, 768px, 390px (operator)
- [ ] 6. Write deliverable in docs/ux/FRONTEND-DESIGN-PASS.md
- [ ] 7. Hand off to UX agent for flow copy/hierarchy review
```

## Implementation rules

1. **Extend tahoe.css** for shared patterns; page CSS only for layout unique to that route
2. **Spacing scale:** 0.35 / 0.55 / 0.75 / 1 / 1.25 / 1.5 rem — stay consistent
3. **Typography:** eyebrow (0.72rem uppercase) → h1/h2 (700) → body (secondary `#6e6e73`)
4. **Buttons:** primary = one per panel; secondary for alternatives; live = green only when on-air
5. **Cards:** overlay cards = selectable row; selected = blue inset ring (already in control.css)
6. **Operator:** min 52px tap targets, `env(safe-area-inset-*)`, no hover-only affordances
7. **Editor:** canvas is hero; inspector secondary; toolbar compact
8. **Do not** change server routes, state shape, or render overlay logic

## Responsive breakpoints

| Breakpoint | Control | Operator | Editor |
|------------|---------|----------|--------|
| ≥980px | 2-col grid (overlays + sidebar) | single col, max-width centered | workspace + inspector |
| 768–979px | stack sidebar below | full width cards | stack inspector below |
| ≤767px | overlay toolbar wraps | score controls full width | canvas full width |

## Deliverable format

Write or append to `docs/ux/FRONTEND-DESIGN-PASS.md`:

```markdown
# Frontend Design Pass — [date]

## Pages touched
- control / operator / editor / project

## Philosophy alignment
- [what improved vs anti-cliché principles]

## Changes
- file: summary

## Responsive verified
- [ ] 1920 desktop  [ ] 768 tablet  [ ] 390 phone (operator)

## Open for UX agent
- [flow/copy/hierarchy items]
```

## Coordination

- **UX/UI Designer (agent 2):** flow, labels, inspector logic — see `AGENTS.md`
- **Beta Tester (agent 3):** regressions after design changes — `docs/qa/TEST-PLAN.md`
- **Lead Developer:** API/state — do not modify without handoff note in deliverable
