# Voetbal score overlay — klant template

Voeg dit blok toe aan `data/show.json` onder `graphics`:

```json
{
  "id": "score-main",
  "type": "footballScore",
  "name": "Wedstrijdscore",
  "visible": false,
  "position": "top-center",
  "operator": true,
  "data": {
    "homeTeam": "Thuis",
    "awayTeam": "Uit",
    "homeScore": 0,
    "awayScore": 0,
    "minute": 0,
    "period": "1e helft",
    "showClock": true
  }
}
```

## Bediening

| Interface | URL |
|-----------|-----|
| Dashboard (Mac/desktop) | http://localhost:2014/control |
| Operator (iPhone/iPad) | http://localhost:2014/operator |
| OBS render | http://localhost:2014/render |

Op mobiel/tablet opent `/` automatisch het operator-paneel.

## Klant branding

1. Maak `data/brands/jouw-klant.json`:

```json
{
  "id": "jouw-klant",
  "name": "FC Voorbeeld",
  "fontFamily": "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
  "fontUrl": "https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap",
  "colors": {
    "primary": "#0057B7",
    "secondary": "#FFD700",
    "text": "#111111",
    "background": "rgba(255,255,255,0.82)",
    "accent": "#00A651"
  }
}
```

2. Kies de preset in het dashboard onder **Klant branding**.

## Companion / Stream Deck

Gebruik de ProVerlay Companion-module:
- Toggle overlay on/off
- Score +1 / -1 acties (via `PATCH /api/graphics/score-main`)
