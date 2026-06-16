# Control Panel Wireframe

Operator-first layout voor `/control`. Doel: graphic live zetten in &lt; 2 seconden.

## Desktop (≥ 900px)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  LIVE GRAPHICS          ● Verbonden          [Open render] [Kopieer URL]   │
│  ProVerlay                                                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────────── Graphics ────────────────────────────────┐ │
│  │ Zet graphics aan of uit. Wijzigingen verschijnen direct op render.   │ │
│  │                                                                        │ │
│  │ ┌─ LIVE ─────────────────────────────────────────────────── [ UIT ] ─┐ │ │
│  │ │ LOWER THIRD                                                        │ │ │
│  │ │ Host Lower Third                                                   │ │ │
│  │ └────────────────────────────────────────────────────────────────────┘ │ │
│  │                                                                        │ │
│  │ ┌──────────────────────────────────────────────────────── [ AAN ] ───┐ │ │
│  │ │ MESSAGE                                                            │ │ │
│  │ │ Break Message                                                      │ │ │
│  │ └────────────────────────────────────────────────────────────────────┘ │ │
│  │  ... meer kaarten ...                                                │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌──────────────────────────── Styling ─────────────────────────────────┐ │
│  │ Thema          [ Clean ▼ ]                                           │ │
│  │ Primary kleur  [■]                                                   │ │
│  │ Font size      [ 2.4 ] vmin                                          │ │
│  │ Padding        [ 3.0 ] vmin                                          │ │
│  │ [ Opslaan ]                                                          │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Mobiel / tablet (&lt; 900px)

```
┌──────────────────────────┐
│ LIVE GRAPHICS            │
│ ProVerlay                │
│ ● Verbonden              │
│ [Open render]            │
│ [Kopieer render URL]     │
├──────────────────────────┤
│ Graphics                 │
│ ┌──────────────────────┐ │
│ │ LIVE                 │ │
│ │ LOWER THIRD          │ │
│ │ Host LT    [ UIT ]   │ │
│ └──────────────────────┘ │
│ ...                      │
├──────────────────────────┤
│ Styling                  │
│ (form stacked)           │
└──────────────────────────┘
```

## Interactie-states

### Graphic kaart — uit

- Neutrale border (`--pv-border`)
- Donkere achtergrond
- Grote grijze knop **Aan** (min 48px hoog)

### Graphic kaart — live (`is-live`)

- Rode linker accent-balk (4px)
- "LIVE" badge linksboven (pulse animatie)
- Rode border + subtiele glow
- Knop **Uit** in `--pv-live` rood

### Header status

- Groene dot + "Verbonden" wanneer socket actief
- Grijs + "Verbinding verbroken" bij disconnect (lead wired)

## Journey-mapping

| Journey | UI-element |
|---------|------------|
| Eerste setup | Kopieer render URL (prominent in header) |
| Live show | Graphics-lijst bovenaan, grote toggles |
| Branding | Styling panel rechts (onder op mobiel) |

## Breakpoints

| Breedte | Gedrag |
|---------|--------|
| ≥ 1280px | Ruime grid, 2 kolommen 1.5fr / 1fr |
| 900–1279px | 2 kolommen 1.4fr / 1fr |
| &lt; 900px | Single column, header stacked |
