# Design Philosophy Reference

Based on the discourse in [r/SideProject — tired of cliché and frontend-only dashboards](https://www.reddit.com/r/SideProject/comments/1o32kzd/tired_of_cliche_and_frontendonly_dashboard/) and adjacent anti-template sentiment in the indie/SaaS builder community.

> Reddit thread was not fully fetchable; principles below synthesize the post title, thread genre, and linked "headless dashboard" counter-movement (Rawdash, DashboardKit): **separate real product workflow from decorative admin UI**.

## What people are tired of

### 1. Frontend-only dashboards
Templates that ship pretty UI with `mockData.json`, fake charts, and no connection to the actual job. They look like products but behave like Dribbble shots.

**ProVerlay rule:** Every control reflects real `stateChanged` data. No placeholder metrics, no "Total users" cards.

### 2. Cliché visual language
Repeated patterns that signal "I downloaded a template":

- Left sidebar + top bar + 4 stat cards + line chart
- Inter + purple/indigo gradient hero
- shadcn/ui gallery pages (`/ui-elements`, `/charts`) as the product
- Dark mode as default with neon accents ("gamer admin")
- Equal-weight grid of widgets with no primary action

**ProVerlay rule:** Apple Tahoe light — glass, system fonts, one accent (`#007aff`). Identity from broadcast workflow, not from chart libraries.

### 3. Feature showcase over workflow
Dashboards built to display *capabilities* (RBAC, billing, analytics) instead of completing *one job fast*.

**ProVerlay rule:** Primary job = **graphic on air in <30 seconds**. Secondary = configure branding/assets. Everything else is progressive disclosure (select overlay → inspector).

### 4. Headless vs chrome confusion
Good systems (DashboardKit, Rawdash) separate **data/runtime** from **panel chrome**. Bad clones copy the chrome without the engine.

**ProVerlay rule:** Server/state is truth; UI is thin. Design changes must not break sync. Visual polish serves operator speed, not decoration.

## What good looks like (for ProVerlay)

| Principle | Control | Operator | Editor |
|-----------|---------|----------|--------|
| One obvious primary action | Zet live on selected overlay | grote score +/- | Opslaan |
| Progressive disclosure | Inspector only when overlay selected | één graphic focus via URL | Properties on select |
| Content over chrome | Overlay list dominates left | Score + clock dominate | Canvas dominates |
| Honest empty states | "Selecteer een overlay…" | hide irrelevant cards | "Selecteer tekstveld" |
| Touch-safe | buttons ≥44px | ≥52px, safe-area | drag handles large enough |
| No fake depth | subtle glass shadow, no skeuomorphism | flat cards, clear live state | grid on frame, not decorative |

## Anti-patterns checklist (reject in review)

- [ ] Stat cards without real metrics
- [ ] Sidebar navigation to pages that don't exist
- [ ] More than one primary button competing in same panel
- [ ] Chart or graph on control dashboard
- [ ] Labels that describe implementation ("matchScoreboard") instead of user language
- [ ] Horizontal scroll on 390px operator without intention
- [ ] Font sizes below 14px on operator
- [ ] Inspector panels all visible at once (pre-selection)

## ProVerlay file map

```
public/shared/tahoe.css     ← tokens, .glass, .button, .pill
public/control/control.css  ← dashboard layout
public/operator/operator.css← touch operator
public/editor/editor.css    ← WYSIWYG layout
public/project/project.css  ← project/assets page
docs/ux/DESIGN-TOKENS.md    ← legacy dark tokens (control migrated to Tahoe — prefer tahoe.css)
```

## Responsive strategy

**Don't** scale down a desktop admin layout for phone.

**Do** use route-specific layouts:
- `/control` → desktop-first; stack at 980px
- `/operator` → mobile-first; device redirect from `/`
- `/editor` → desktop; collapse inspector at 900px

Use `min()`, `clamp()`, and flex wrap — avoid fixed px widths for containers (canvas preview excepted).

## References

- Internal: `docs/UX-DESIGN-BRIEF.md`, `docs/ux/CONTROL-WIREFRAME.md`
- External: [DashboardKit — headless runtime](https://github.com/loykin/dashboardkit) (panel chrome is host's job)
- External: [Rawdash — headless backend](https://rawdash.dev/) (data layer ≠ UI template)
