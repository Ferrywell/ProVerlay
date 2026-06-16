# Visuele feedback pass — 11 juni 2026

Gebaseerd op screenshot dashboard (Ticker operate-panel) en browser-inspectie.

---

## Kritieke bugs (gefixed)

| # | Probleem | Oorzaak | Fix |
|---|----------|---------|-----|
| 1 | Ticker-rij: checkbox zweeft, bullet, tekst en × los | Dashboard laadde **geen** operate-CSS; `field field--inline` + `.field { display: grid }` brak layout | Nieuwe `operate-panel.css`; markup `ticker-msg-row` |
| 2 | Dubbele titels “Operate / Ticker / customTicker” | Panel-head + operate-shell header overlap | `embedded: true` mode zonder h2; status = “1 of 1 enabled” |
| 3 | Enorme rode ×-knop onder tekst | `touch-btn` (52px) op delete | `button--icon` (36px) |
| 4 | Add-knop full-width onder input | Losse block button | Inline `ticker-compose__row` |
| 5 | Geen `list-style: none` op dashboard | operator.css niet geladen op `/control` | Shared CSS op control + operate + operator |

---

## Visuele inconsistenties

### Dashboard header — ✅ gefixed
- Eyebrow sentence case, geen uppercase
- Headings font-weight 500
- Header-knoppen gegroepeerd (nav | Preview)

### Overlay-kaarten — deels open
- ~~Live border oude groen~~ → `#3B6D11` ✅
- ~~Widget-type badge kleuren~~ → brief §7.3 ✅
- ~~Operate/Edit ghost buttons~~ ✅
- ~~Solid cards, 0.5px borders~~ ✅
- Actierij nog krap op smalle kolom (minor)
- Link-icoon naast titel licht uit lijn (minor)

### Rechterkolom — deels open
- ~~Project & network inklappen bij operate-selectie~~ ✅
- ~~Side-stack dimming tijdens operate~~ ✅
- Dubbele “Live controls” empty state (minor)

### Operate-panel structuur
- ~~Match score inline controls~~ ✅ compact score/clock in dashboard + `/operate`
- Quiz / lower thirds: nog link naar operator

### Operator (phone) — open
- Focus chip + nav + sync = veel verticale chrome vóór content
- Score +/- blauw primary — brief: groen alleen go live
- Touch button weight 500 (was 700) ✅

---

## Aanbevolen volgorde fixes

1. ~~Ticker row layout~~ ✅
2. ~~Font-weight 500 op headings~~ ✅
3. ~~Widget-type badge kleuren~~ ✅
4. ~~Project panel inklappen bij operate~~ ✅
5. ~~Match score compact controls in dashboard operate-panel~~ ✅
6. ~~Glass → solid cards op dashboard~~ ✅

---

## Bestanden aangepast in deze pass

- `public/shared/operate-panel.css` (nieuw)
- `public/shared/operate-handlers.js`
- `public/shared/tahoe.css` — type pills, ghost button, typography
- `public/control/index.html`, `control.css`, `control.js`
- `public/operator/index.html`, `operator.js`, `operator.css`
- `public/operate/index.html`

---

*Herlaad `/control` (hard refresh) om CSS te zien.*
