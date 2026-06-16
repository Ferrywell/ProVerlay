# Form controls & WYSIWYG design pass

**Datum:** 10 juni 2026  
**Scope:** Editor, compose, dashboard, project — gedeelde form patterns

---

## Probleem

Sliders stonden op één regel naast number inputs → slider ~15% breed, niet bruikbaar voor finetune.

Editor preview ≠ OBS overlay voor scores door andere DOM/CSS (animation wrapper, geen flex op min-width boxes).

---

## Oplossing

### Gedeeld: `public/shared/form-controls.css`

- Slider **full width** op eigen regel
- Number + unit rechts uitgelijnd eronder
- Toegepast op: editor, compose, control (ticker sliders)

### WYSIWYG parity

- `elementBoxStyle()` → `display:flex` + `align-items:center` + anchor-aware `justify-content`
- Editor gebruikt zelfde `score-el` + `score-el-text` structuur als render
- Render: score animation wrapper zonder extra vertical offset (`line-height:1`, `height:1em`)

### Uitlijnen (editor toolbar)

| Actie | Gedrag |
|-------|--------|
| **Y uitlijnen** | Gemiddelde Y van 2+ geselecteerde velden (shift+klik) |
| **X uitlijnen** | Gemiddelde X |
| **Grootte gelijk** | Zelfde fontSize |
| **Scores rij** | home/away score, scheidingsteken `-`, klok op één Y; codes op één Y |

---

## Pagina-checklist

| Pagina | Status |
|--------|--------|
| `/editor` | Sliders + uitlijnen + WYSIWYG fix |
| `/compose` | form-controls.css |
| `/control` | form-controls.css (ticker ranges) |
| `/project` | tahoe forms — volgende pass indien ranges toegevoegd |
| `/operator` | geen range inputs |
| `/render` | score-el flex parity |

---

## Tips operator

Na «Scores rij»: opslaan → preview `/render` → finetune Y per veld indien font metrics afwijken.
