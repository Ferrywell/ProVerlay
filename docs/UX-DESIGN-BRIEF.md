# UX and UI design brief

The design direction for ProVerlay's control interfaces. Read this before changing
the dashboard, operator, editor or project pages.

## Direction

- Light theme with warm off-white backgrounds (`--pv-bg` in `public/shared/tahoe.css`),
  plus a calm dark theme for dark control rooms. Both use the same tokens: dark values
  live under `prefers-color-scheme: dark` and `html[data-theme="dark"]`; the header menu
  offers System / Light / Dark (stored per device). Never hard-code colours in page CSS —
  use a token so both themes work. `/render` has no theme.
- Glass panels using `backdrop-filter` blur, with a solid fallback where blur is not
  supported.
- System font stack for the control UIs: SF Pro on macOS, Segoe UI on Windows. The
  render output is different: it uses the project's brand font, by default the bundled
  Inter, so overlays look the same on every machine.
- One calm accent colour (`--pv-accent`).
- Minimal: generous whitespace, little visual noise.
- **Not** a dark broadcast-console look, and no template-SaaS dashboard patterns
  (stat cards, fake charts, decorative sidebars).

The render output (`/render`) is a separate concern: it is transparent and only shows
the graphics, styled by the project brand.

## App header

Every page except `/render` uses the shared header (`public/shared/app-header.js`,
styles in `tahoe.css` → `.pv-app-header`): logo + page title, the **project chip**
(active project; switch project, confirm when something is ON AIR; "Manage projects…"),
main navigation (Dashboard, Operator, Layout, Design — in the ⋯ menu below 1100 px),
page actions, the connection pill, **Preview** and the ⋯ menu (navigation + theme).
Pages provide only `.pv-app-header__title` and `.pv-app-header__actions` in their markup.
Below 768 px secondary items (`.pv-app-header__hide-narrow`) hide so nothing overlaps.

## Two control surfaces

### Dashboard (`/control`) — desktop

- Overview of the overlays in the active project; select one to operate it.
- Project, network and branding setup.
- Links to the operator, design hub, overlay layout and render preview.
- For the technical director / person setting up the show.

### Operator (`/operator`) — touch

- Large touch targets (at least 44 px).
- Score ±, clock, on-air toggles.
- Respects the iPhone/iPad safe areas (home indicator, notch).
- Default on phones and tablets via `/`.

## Device handling

The server looks at the User-Agent:

- phone / tablet → `/` redirects to `/operator` (and `/control` does too)
- desktop → `/` redirects to `/control`
- override on `/`: `?view=control` or `?view=operator`

## Branding UI

*Edit project* (`/project`) contains:

- a client preset dropdown (bundled presets from `templates/brands/`, your own from
  `data/brands/`);
- colours (primary, secondary, text, background) and an overlay size;
- font family plus an optional web-font URL, and font files uploaded as assets;
- changes sync live to the render.

## Overlay styling

Overlays use `state.brand` (CSS variables) and per-widget settings. The CSS files in
`themes/` are legacy and are not loaded by the render.

## Where things live

| Area | Files |
|------|-------|
| Design system (tokens, components) | `public/shared/tahoe.css` |
| Dashboard | `public/control/` |
| Touch operator | `public/operator/` |
| Project page | `public/project/` |
| Scoreboard editor | `public/editor/` |
| Overlay styling | `public/render/render.css` |
