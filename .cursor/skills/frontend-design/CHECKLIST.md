# Frontend Design Pass — Page Checklists

Use during audit step before editing.

## /control (dashboard)

- [ ] Overlay list is visual anchor (left, widest column)
- [ ] Selected overlay has clear selected state
- [ ] Inspector empty state when nothing selected
- [ ] Only one widget inspector visible at a time
- [ ] Render URL + Bedienen + Editor actions scannable per card
- [ ] Project "Pas aan" visible but not competing with overlay actions
- [ ] Network block compact (collapsible ideal)
- [ ] No implementation type strings exposed to user (prefer Dutch labels)
- [ ] Breakpoint 980px: sidebar stacks, overlay cards remain usable
- [ ] Focus visible on all interactive elements

## /operator

- [ ] Score +/- minimum 52×52px
- [ ] Clock readable at arm's length
- [ ] Live status obvious (On air / Niet live)
- [ ] Safe area padding bottom for iPhone home indicator
- [ ] No double-tap zoom (`viewport maximum-scale=1` in HTML)
- [ ] Penalty section collapsible or secondary when inactive
- [ ] Bottom nav does not cover content
- [ ] Works at 390×844 and 768×1024

## /editor

- [ ] Project canvas aspect ratio visible (frame grid)
- [ ] Strip placement matches render (WYSIWYG)
- [ ] Inspector does not dominate on wide screens (max ~320px)
- [ ] Upload zone clear but not oversized
- [ ] Font dropdown includes project-uploaded fonts
- [ ] Preview link goes to isolated `/render?graphic=`
- [ ] Save button always reachable (sticky header)

## /project

- [ ] Canvas resolution form prominent
- [ ] Presets (1080p, 4K, vertical) one click
- [ ] Asset list scannable (thumb + name + size)
- [ ] Design references separated from raw assets

## Token compliance

- [ ] Uses `--pv-*` from tahoe.css
- [ ] No new hex outside tahoe unless documented in DESIGN-TOKENS
- [ ] Border radius `--pv-radius` / `--pv-radius-sm` only
- [ ] Secondary text `--pv-text-secondary`
