# UX/UI Design Brief — ProVerlay (bijgewerkt)

## Design direction: Apple Tahoe

- Licht thema (`#f5f5f7` achtergrond)
- Glass panels met `backdrop-filter` blur
- System font stack (SF Pro op Mac, Segoe UI op Windows)
- Accent: `#007AFF`
- Minimalistisch — veel witruimte, weinig visuele ruis
- **Geen** donker broadcast/Holographics-esthetiek

## Twee dashboards

### Dashboard (`/control`) — desktop
- Overlay overzicht + branding editor
- Link naar operator-paneel
- Voor technische director / setup

### Operator (`/operator`) — touch
- Grote knoppen (min 52px)
- Score +/- , on air toggle
- Safe area voor iPhone home indicator
- Auto-default op phone/tablet via `/`

## Device responsiveness

Server detecteert User-Agent:
- `phone` / `tablet` → redirect naar `/operator`
- `desktop` → redirect naar `/control`
- Override: `?view=control` of `?view=operator`

## Klant branding UI

Dashboard bevat:
- Brand preset dropdown (`data/brands/`)
- Kleuren (primary, secondary, text, background)
- Font family + optionele Google Fonts URL
- Live sync naar render

## Overlay design

Render overlays gebruiken `state.brand` — geen losse theme-bestanden meer.
Voetbalscore: compact scorebord, glass background, teamkleuren via brand.

## Deliverables locaties

- `public/shared/tahoe.css` — design system
- `public/control/` — dashboard
- `public/operator/` — touch UI
- `public/render/render.css` — overlay styling
