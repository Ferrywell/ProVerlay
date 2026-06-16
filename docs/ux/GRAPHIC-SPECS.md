# Graphic Specs — per type

Specificatie voor overlay-rendering. DOM-structuur wordt gegenereerd door `render.js`; styling in `themes/*.css` + `render.css`.

## Algemeen

- **Container:** `.graphic-layer.pos-{position}` → `.graphic.graphic--{type}`
- **Animatie enter:** `.is-entering` + positie-specifieke keyframe
- **Animatie leave:** `.is-leaving` → `pv-leave` (250ms)
- **Eenheden:** vmin voor type/borders; vw voor breedte; vh voor images

## lowerThird

**Posities:** `bottom-left` (default), `bottom-center`

```
┌──────────────────────────────────────┐
│█ Jan de Vries                        │  ← --primary left border
│  Presentator · ProVerlay Demo        │  ← .meta lichter
└──────────────────────────────────────┘
```

| Element | Class | Styling |
|---------|-------|---------|
| Naam | `.name` | Bold, 1.15em |
| Titel + bedrijf | `.meta` | 0.85em, opacity 0.9 |
| Container | `.graphic--lowerThird` | `--background`, left border `--primary` |

**Theme verschillen:**
- `clean` — subtiele radius, semi-transparant
- `bold` — dikke border (0.8vmin), schaduw
- `minimal` — geen achtergrond, alleen tekst + underline accent

## message

**Posities:** `bottom-center`, `top-center`

| Element | Class | Styling |
|---------|-------|---------|
| Tekst | `.text` | Gecentreerd, korte copy |
| Container | `.graphic--message` | Top border accent, compact padding |

Broadcast-waardig: geen flitsende animaties; fade + lichte slide.

## ticker

**Positie:** `bottom-full` (full width)

| Element | Class | Styling |
|---------|-------|---------|
| Track | `.track` | Horizontale scroll via JS transform |
| Item | `.item` | Inline, `margin-right: 4vw` |
| Container | `.graphic--ticker` | `--secondary` bg, top border `--primary` |

Snelheid via `data.speed` (px/s). Geen verticale padding overload.

## clock

**Positie:** `top-right` (aanbevolen)

| Element | Class | Styling |
|---------|-------|---------|
| Tijd | `.time` | `font-variant-numeric: tabular-nums` |
| Container | `.graphic--clock` | Compact, geen overmatige padding |

Formaten: `12H` / `24H` via `data.format`.

## countdown

**Posities:** `top-center`, `top-right`

| Element | Class | Styling |
|---------|-------|---------|
| Tijd | `.time` | Tabular nums, bold, letter-spacing |
| Container | `.graphic--countdown` | Border `--primary`, opvallend maar niet neon |

Formaten: `MM:SS` of raw seconds. `data.running` pauzeert tick.

## image

**Posities:** `top-left`, `top-right`, `bottom-left`

| Element | Class | Styling |
|---------|-------|---------|
| Afbeelding | `img` | `max-height: 12vh`, `max-width: 20vw`, `object-fit: contain` |

Lege `src` → geen render (JS skip). Alt-tekst verplicht in data.

## Positie → animatie mapping

| Positie | Enter animatie |
|---------|----------------|
| `bottom-left`, `bottom-center`, `bottom-full` | Slide omhoog + fade |
| `top-left`, `top-right`, `top-center` | Slide omlaag + fade |
| Overig | Fade + scale |
