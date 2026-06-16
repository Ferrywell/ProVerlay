# Ticker & Countdown — implementatie-advies

## Aanbevolen aanpak (Odido / StreamNL)

| Overlay | Patroon | Waarom |
|---------|---------|--------|
| Scorebalk | `matchScoreboard` + PNG + geplaatste tekstvelden | Design volledig in PNG; alleen data (NED, score, tijd) live |
| Tickertape | `customTicker` + PNG + scrollende tekstzone | Logo + balk in PNG; tekst apart met instelbare linkerrand |
| Start-countdown | `streamCountdown` losse widget | Rest van startscherm in vMix; alleen klok als OBS/browser bron |

Dit volgt hetzelfde principe als de scorebord-editor: **pixel-perfect design in assets, live data erbovenop**.

## customTicker

- **PNG upload** via dashboard → Design referenties of scorebord editor (achtergrond).
- **`textInsetLeft`**: slider % waar tekst begint (na logo-zwarte box).
- **`fadeWidth`**: zachte fade zodat tekst verdwijnt vóór het logo.
- **`speed`**: pixels per seconde (60–180 typisch).
- **`messages[]`**: losse berichten; render voegt samen met separator en herhaalt voor naadloze loop.

## streamCountdown

- **`targetDateTime`**: ISO / datetime-local (wanneer stream start).
- **`format`**: `mm:ss` (totaal minuten) of `h:mm:ss`.
- **Kerning**: tabular nums + per-digit spans + letter-spacing op basis van lengte.
- Transparante achtergrond — overlay in vMix naast je eigen graphic.

## Workflow klant

1. Lever PNG's: `scorebar.png`, `ticker-bar.png`
2. Upload naar project assets
3. Koppel in widget-panel (ticker) of editor (scorebord)
4. Stel `textInsetLeft` af met slider tot tekst net na logo verdwijnt
5. Countdown als aparte render-laag over vMix startscherm
