# Component Spec — HTML contract

Contract tussen UX (HTML/CSS) en Lead Developer (`control.js`, `render.js`). **Wijzig ids niet** zonder overleg.

## Control page (`public/control/index.html`)

### Vaste ids (vereist door `control.js`)

| Id | Element | Gebruik |
|----|---------|---------|
| `graphics-list` | `<div>` | Container voor dynamische graphic kaarten |
| `style-form` | `<form>` | Styling PATCH naar `/api/state` |
| `copy-render-url` | `<button>` | Kopieert `{origin}/render` naar clipboard |

### Style form fields (`name` attributen)

| name | type | API mapping |
|------|------|-------------|
| `theme` | select | `state.theme` → laadt `/themes/{theme}.css` op render |
| `primary` | color | `state.colors.primary` (rgba) |
| `fontSize` | number | `state.settings.fontSize` |
| `padding` | number | `state.settings.padding` |

Theme opties: `clean`, `bold`, `minimal`.

### Dynamische graphic kaart (gegenereerd door `control.js`)

```html
<article class="graphic-card[ is-live]">
  <div class="graphic-card__body">
    <span class="graphic-live-badge" aria-hidden="true">Live</span>
    <div class="graphic-type">{type}</div>
    <div class="graphic-name">{name}</div>
  </div>
  <button class="button[ toggle-off]" type="button">{Aan|Uit}</button>
</article>
```

**Classes:**

| Class | Wanneer | CSS gedrag |
|-------|---------|------------|
| `graphic-card` | altijd | Basis kaart layout |
| `is-live` | `graphic.visible === true` | LIVE badge, rode border, glow |
| `button` | altijd | Primaire actie-stijl |
| `toggle-off` | niet zichtbaar | Grijze "Aan" knop |

> **Lead actie (optioneel):** `control.js` kan `graphic-card__body` en `graphic-live-badge` toevoegen voor betere semantiek. Huidige markup (meta div zonder wrapper) blijft werken via CSS `::before` fallback.

### Project paneel (UX + `control.js`)

| Id | Element | Gebruik |
|----|---------|---------|
| `project-switcher` | `<select>` | `GET /api/projects`, `POST /api/projects/:id/activate` |
| `project-new` | `<button>` | `POST /api/projects` |
| `project-export` | `<button>` | `GET /api/projects/active/export` |
| `project-import` | `<input type="file">` | `POST /api/projects/import` |
| `project-status` | `<p role="status">` | Feedback NL |

### Nieuwe elementen (UX toegevoegd, nog te wiren)

| Id / class | Doel | Lead wiring |
|------------|------|-------------|
| `#connection-status` | Socket verbindingsstatus | Toggle `.is-connected` / `.is-disconnected` op `socket.on('connect')` / `disconnect` |
| `.status-dot` | Visuele indicator | Styled via parent state class |

```javascript
// Voorstel voor control.js (lead):
socket.on('connect', () => {
  document.getElementById('connection-status')?.classList.add('is-connected')
  document.getElementById('connection-status')?.classList.remove('is-disconnected')
})
socket.on('disconnect', () => {
  document.getElementById('connection-status')?.classList.remove('is-connected')
  document.getElementById('connection-status')?.classList.add('is-disconnected')
})
```

## Render page (`public/render/index.html`)

| Id | Element | Gebruik |
|----|---------|---------|
| `stage` | `<div>` | Mount point voor graphic layers |
| `theme-css` | `<link>` | `href` wisselt naar `/themes/{theme}.css` |

**Niet wijzigen:** `render.js` genereert `.graphic-layer`, `.graphic`, `.graphic--{type}`.

## Theme files (`themes/`)

Elk theme definieert op `:root`:

```css
--primary, --secondary, --text, --background, --accent
--font-family, --font-size, --padding, --radius
```

Runtime overrides (via `applyTheme`): `--primary`, `--secondary`, `--text`, `--background`, `--accent`, `--font-size`, `--padding`.

Theme-specifieke `--radius` en `--font-family` komen uit het CSS-bestand.

## API — geen wijzigingen nodig

Bestaande endpoints ondersteunen theme switch:

- `PATCH /api/state` met `{ theme: "bold" }`
- Socket `stateChanged` propagate naar render

## Checklist bij HTML-wijzigingen

- [ ] `graphics-list`, `style-form`, `copy-render-url` ids intact
- [ ] Form `name` attributen ongewijzigd
- [ ] Nederlandse labels behouden
- [ ] Documenteer nieuwe ids in dit bestand
