# Design Tokens — ProVerlay

Centrale referentie voor control UI en overlay graphics. Overlay-themes gebruiken dezelfde variabelenamen in `themes/*.css`; control UI gebruikt het `--pv-*` prefix.

## Control UI (`public/control/control.css`)

| Token | Waarde | Gebruik |
|-------|--------|---------|
| `--pv-bg` | `#0b1220` | Pagina-achtergrond |
| `--pv-bg-elevated` | `#0f172a` | Kaarten, inputs |
| `--pv-panel` | `#111827` | Panelvlakken |
| `--pv-border` | `#1f2937` | Randen, scheidingen |
| `--pv-border-subtle` | `#1e293b` | Lichte scheiding binnen kaarten |
| `--pv-text` | `#f8fafc` | Primaire tekst |
| `--pv-muted` | `#94a3b8` | Labels, hints, type badges |
| `--pv-accent` | `#38bdf8` | Links, focus, secundaire acties |
| `--pv-live` | `#ef4444` | Live indicator, actieve graphic |
| `--pv-live-glow` | `rgba(239, 68, 68, 0.35)` | Glow op live kaarten |
| `--pv-on` | `#22c55e` | Toggle "Aan" bevestiging |
| `--pv-off` | `#475569` | Toggle uit-status |
| `--pv-radius-sm` | `8px` | Inputs, badges |
| `--pv-radius-md` | `12px` | Kaarten |
| `--pv-radius-lg` | `14px` | Panels |
| `--pv-shadow-panel` | `0 4px 24px rgba(0, 0, 0, 0.25)` | Panel diepte |
| `--pv-font` | `Inter, system-ui, sans-serif` | UI lettertype |
| `--pv-touch-min` | `48px` | Minimale toggle-hoogte (tablet) |

### Spacing

| Token | Waarde |
|-------|--------|
| `--pv-space-xs` | `0.35rem` |
| `--pv-space-sm` | `0.65rem` |
| `--pv-space-md` | `1rem` |
| `--pv-space-lg` | `1.5rem` |
| `--pv-space-xl` | `2rem` |

## Overlay graphics (`themes/*.css` + runtime via `render.js`)

Deze variabelen worden op `:root` gezet door de server state en `applyTheme()`:

| Token | Default (clean) | Beschrijving |
|-------|-----------------|--------------|
| `--primary` | `rgba(220, 38, 38, 1)` | Accent, borders, highlights |
| `--secondary` | `rgba(30, 41, 59, 1)` | Ticker/track achtergrond |
| `--text` | `rgba(255, 255, 255, 1)` | Tekstkleur |
| `--background` | `rgba(15, 23, 42, 0.92)` | Graphic achtergrond |
| `--accent` | `rgba(248, 250, 252, 1)` | Secundaire tekst / highlights |
| `--font-family` | `Inter, Segoe UI, system-ui` | Overlay lettertype |
| `--font-size` | `2.4vmin` | Basisgrootte (via settings) |
| `--padding` | `3vmin` | Canvas padding (via settings) |
| `--radius` | theme-specifiek | Hoekradius graphic elementen |

### Responsive eenheden

- **vmin** — font-size, padding, borders (schaalt met kleinste viewport-as; 16:9 én 9:16)
- **vw** — breedte lower third, ticker spacing
- **vh** — image max-height

## Thema-profielen

| Theme | Karakter | `--background` | `--radius` |
|-------|----------|----------------|------------|
| `clean` | Modern zakelijk | Semi-transparant donker | `0.4vmin` |
| `bold` | Sterk, dikke randen | Ondoorzichtig + schaduw | `0.2vmin` |
| `minimal` | Alleen tekst | `transparent` | `0` |

## Animaties (`public/render/render.css`)

| Naam | Duur | Gebruik |
|------|------|---------|
| `pv-enter-bottom` | `0.4s ease-out` | bottom-* posities |
| `pv-enter-top` | `0.35s ease-out` | top-* posities |
| `pv-enter-center` | `0.35s ease-out` | center posities |
| `pv-leave` | `0.25s ease-in` | alle hide-acties |

## Toegankelijkheid

- Contrast control UI: tekst op `--pv-panel` ≥ 4.5:1
- Focus ring: `2px solid var(--pv-accent)` op interactieve elementen
- Live status: niet alleen kleur — ook "LIVE" label en border
