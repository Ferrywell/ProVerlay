# Design input — screenshots & referenties

Gebruik dit document wanneer je visuele voorbeelden deelt (screenshots, Figma-export, PNG mockups).

## Waar designs terechtkomen

1. **Dashboard → Design referenties** — upload PNG/JPEG/WebP; bestanden worden opgeslagen in `data/projects/{actief}/assets/` met prefix `design-`.
2. **Scorebord editor** (`/editor`) — gebruik een design als achtergrond-PNG of als visuele referentie naast het canvas.

## Aanbevolen formaat

| Eigenschap | Waarde |
|------------|--------|
| Resolutie | 1920×1080 (zelfde als editor canvas) |
| Formaat | PNG met transparantie waar nodig |
| Naam | `design-scorebalk-wk.png`, `design-penalties.png` |

## Wat je per screenshot kunt aangeven

- Welke widgets zichtbaar zijn (codes, score, klok, penalties)
- Positie overlay (boven/onder, links/rechts)
- Typografie en kleuren (of “zoals WK 2026”)
- Animatie-wensen (score-roll, fade-in overlay)

## Volgende stap na upload

Deel in de chat:

1. Welk design bij welke overlay hoort
2. Welke elementen draggable/data-bound moeten zijn
3. Verschil tussen **operator** (mobiel) en **dashboard** (desktop) indien van toepassing

De editor ondersteunt al `matchScoreboard` binds: `homeCode`, `awayCode`, `homeScore`, `awayScore`, `clock`.
