# iOS Design Audit — ProVerlay (juni 2026)

**Doel:** De web-UI laten aanvoelen als Apple-software (spacing, hiërarchie, componenten) zonder platform-lock-in — de app wordt ook naar Windows/Electron geport.

**Testomgeving:** Browser op **iPhone 14 Pro** (393×852 CSS px, DPR 3) tegen `http://localhost:2014`.

**Pagina’s beoordeeld:** `/operator`, `/control?view=control`, `/project`, `/editor`.

---

## Samenvatting

| Route | Mobile-first? | iOS-gevoel (1–5) | Prioriteit |
|-------|---------------|------------------|------------|
| `/operator` | Ja | **3.5** — beste basis, nog te “web-dashboard” | Hoog |
| `/control` | Nee (desktop) | **2** — ingekrompen admin op 393px | Medium (redirect bestaat al) |
| `/project` | Deels | **2.5** — kaarten OK, geen mobile-nav | Laag |
| `/editor` | Deels | **2** — toolbar te compact op phone | Laag (desktop-tool) |

**Kernconclusie:** De Tahoe-basis (`tahoe.css`) zit op het juiste spoor — juiste achtergrondkleur, accent, glass, system font stack. Wat ontbreekt is vooral **iOS-structuur** (navigation bar, grouped lists, typografische schaal) en **component-polish** (native-achtige toggles, segmented controls, hairline separators). De operator-pagina is het belangrijkste oppervlak en levert de grootste winst.

---

## Designfilosofie — “iOS-gevoel” cross-platform

Dit is geen verzoek om een pixel-perfecte iOS-clone. Het gaat om principes uit Apple’s Human Interface Guidelines die **in CSS werken op Mac én Windows**:

### 1. Clarity (duidelijkheid)
- Eén primaire actie per scherm/context (Pause/Live, Save, Go live).
- Labels in mensentaal; technische IDs alleen in code.
- Grote, leesbare cijfers voor score/klok (operator doet dit al goed).

### 2. Deference (inhoud eerst)
- UI-chrome minimaliseren; content (score, ticker, roster) domineert.
- Minder geneste kaarten; meer **inset grouped lists** op lichtgrijs vlak.
- Progressive disclosure: inspector/sheets pas na selectie (control/editor doen dit al).

### 3. Depth (diepte zonder skeuomorphisme)
- Subtiele lagen: `#f5f5f7` canvas → witte grouped cells → hairline separators.
- Glass/blur **spaarzaam** (nav bar, modals) — niet elke sectie in een glass-card.
- `@supports (backdrop-filter)` + vaste fallback voor Windows oudere builds.

### 8pt-grid & typografie (web-safe)

| iOS-rol | Gewicht | Grootte (phone) | CSS-token voorstel |
|---------|---------|-----------------|-------------------|
| Large Title | 700 | 34px / 28px compact | `--pv-type-large-title` |
| Title 1 | 700 | 28px | `--pv-type-title-1` |
| Title 2 | 700 | 22px | `--pv-type-title-2` |
| Headline | 600 | 17px | `--pv-type-headline` |
| Body | 400 | 17px | `--pv-type-body` |
| Callout | 400 | 16px | `--pv-type-callout` |
| Subhead | 400 | 15px | `--pv-type-subhead` |
| Footnote | 400 | 13px | `--pv-text-secondary` |
| Caption | 400 | 12px | `--pv-type-caption` |

**Spacing-schaal uitbreiden** (nu 0.35–1.25rem is te compact voor iOS):

```css
--pv-space-2xs: 0.25rem;  /* 4px */
--pv-space-xs:  0.5rem;   /* 8px  — iOS base unit */
--pv-space-sm:  0.75rem;  /* 12px */
--pv-space-md:  1rem;     /* 16px */
--pv-space-lg:  1.25rem;  /* 20px */
--pv-space-xl:  1.5rem;   /* 24px */
--pv-space-2xl: 2rem;     /* 32px */
--pv-screen-margin: 1rem; /* 16px horizontal screen inset */
```

### Wat wél cross-platform is

| Techniek | Mac | Windows/Electron | Advies |
|----------|-----|------------------|--------|
| `-apple-system, BlinkMacSystemFont, 'Segoe UI'` | SF Pro | Segoe UI | ✅ Huidige stack behouden |
| `backdrop-filter` + fallback bg | ✅ | ✅ Win11+ Chromium | ✅ Met `@supports` fallback |
| `env(safe-area-inset-*)` | ✅ notch/home bar | Neutraal (0) | ✅ Blijven gebruiken op operator |
| CSS custom properties | ✅ | ✅ | ✅ Design system basis |
| `accent-color` op range inputs | ✅ | ✅ | ✅ |
| `font-size: 16px` op inputs | ✅ voorkomt zoom | ✅ | ✅ Operator heeft dit al |

### Wat te vermijden (Windows / licentie)

| Vermijden | Reden | Alternatief |
|-----------|-------|-------------|
| SF Symbols als vereiste font | Apple-licentie, niet op Windows | Lucide / Phosphor icons (SVG), of Unicode spaarzaam |
| `-webkit-appearance: none` zonder eigen styling overal | Inconsistent op Windows | Gedeelde `.pv-toggle`, `.pv-segmented` componenten |
| Alleen hover-states | Geen hover op touch | `:active` + `transform: scale(0.98)` (deels al aanwezig) |
| `position: fixed` bottom bars zonder safe-area | Home indicator overlap | `padding-bottom: env(safe-area-inset-bottom)` |
| Donker “macOS Sonoma” als default | Past niet bij Tahoe-light productrichting | Licht thema first; dark later als optie |

---

## Browser-test bevindingen (iPhone 14 Pro)

### `/operator` — Live bediening

**Wat goed werkt**
- Touch targets: back-knop **44×44px**, score-knoppen **≥52px hoog** (HIG minimum gehaald).
- Safe area: `padding-left/right/bottom` met `env(safe-area-inset-*)`.
- `touch-action: manipulation`, `-webkit-tap-highlight-color: transparent`.
- Inputs op **16px** font (geen iOS zoom bij focus).
- Glass header met `backdrop-filter: saturate(180%) blur(20px)`.
- Live-status via groene border/glow op `.op-card.is-live` — duidelijk en niet cliché.

**Verbeterpunten**

1. **Navigation bar te druk (P0)**  
   Op 393px breed: terug-knop + “Operator” eyebrow + “Match score” titel + “Preview” + “Live sync” pill passen niet in één iOS-navigatiepatroon.  
   *Advies:* iOS **standard navigation bar** — links chevron + optioneel “Dashboard”, midden leeg of truncated title, rechts één text button (“Preview”). Verplaats “Live sync” naar subtiele status onder de nav of als kleine trailing dot.

2. **Dubbele titel (P0)**  
   Header toont “Match score” (h1) én elke card heeft opnieuw “Match score” (h2).  
   *Advies:* Header = context (“Live control” of projectnaam); card = widgetnaam alleen als er meerdere cards zijn.

3. **Geen safe-area-top op header (P1)**  
   Body heeft safe-area; `.op-header` niet. Op echte iPhone met notch kleeft de header tegen de status bar.  
   *Advies:*  
   `padding-top: max(var(--pv-space-md), env(safe-area-inset-top));` op `.operator` of sticky nav wrapper.

4. **Cards-in-cards i.p.v. grouped list (P1)**  
   Elke widget zit in een `.glass.op-card` met border + shadow. iOS Settings-achtige UI gebruikt **witte cellen op grijs vlak**, geen dubbele borders.  
   *Advies:* Nieuwe `.pv-group` / `.pv-group__cell` in `tahoe.css`:
   - Buitenmarge 16px, radius 10–12px op de groep
   - Eerste/laatste cel afgeronde hoeken
   - `border-bottom: 0.5px solid var(--pv-separator)` tussen cellen

5. **Native form controls (P1)**  
   `<select>`, `<input type="number">`, checkboxes zien eruit als browser-defaults.  
   *Advies:* Styled select (chevron SVG), iOS-style **toggle switches** voor boolean velden waar mogelijk.

6. **Klok-aanpassingsgrid (P2)**  
   Zes gelijke grijze knoppen (`-1s`, `+1s`, …) voelen als web-formulier.  
   *Advies:* **Segmented control** (2–3 segmenten per rij) of horizontale scrollende chip-row — visueel iOS, zelfde HTML buttons onder de motorkap.

7. **Ticker-lijst (P2)**  
   `.ticker-msg-list li` heeft 8px radius en losse borders — meer “admin list” dan iOS list row.  
   *Advies:* Full-width rows in grouped list, swipe-to-delete patroon later (optioneel).

8. **Typografie (P2)**  
   Eyebrow `0.72rem uppercase letter-spacing 0.08em` is SaaS-dashboard, niet iOS. iOS gebruikt **footnote/caption** zonder aggressive uppercase.  
   *Advies:* Section headers als `.pv-section-header` — 13px, semibold, secondary color, **geen** uppercase.

**Metingen (CDP, 393×852)**

| Element | Afmeting | Opmerking |
|---------|----------|-----------|
| Viewport | 393 × 852 | iPhone 14 Pro |
| `.op-header` | 369 × 114px | Te hoog voor nav bar (~56px target) |
| `.op-back` | 44 × 44px | ✅ HIG minimum |
| `.touch-btn` | ~57 × 56px | ✅ |
| h1 font | 21.6px / 700 | iOS Title 2 territory — OK voor card, te klein voor Large Title |

---

### `/control` — Dashboard (mobile override)

**Observatie:** Met `?view=control` op phone krijg je een **gestapelde desktop-layout** (breakpoint 980px). Functioneel bruikbaar voor nood-setup, maar niet iOS-waardig.

**Bevindingen**
- Header stapelt verticaal: logo + 4 knoppen onder elkaar — veel verticale ruimte vóór content.
- Overlay cards + inspector + project panel = lange scroll; geen tab-structuur.
- Glass panel op glass panel; visueel zwaar op small screen.
- Geen `viewport-fit=cover` of safe-area op control.

**Advies**
- **Geen volledige control-mobile redesign nodig** — device redirect naar `/operator` is het juiste productbesluit.
- Wel: op ≤767px een **banner** “Je bent op mobiel — open Operator voor live bediening” met link.
- Als control tóch op phone moet: overweeg **tab bar** (Overlays | Branding | Project) i.p.v. eindeloze stack.

---

### `/project` — Projectbeheer

**Bevindingen**
- Op 393px: 2-koloms grid valt terug naar 1 kolom (900px breakpoint) — correct.
- Padding `var(--pv-space-xl)` (1.25rem) aan zijkanten is krap; iOS gebruikt consistent **16px screen margin**.
- “Back to dashboard” als secundaire button — iOS zou chevron in nav bar gebruiken (zelfde patroon als operator).
- Preset-knoppen (1080p, 4K, Vertical) zijn candidate voor **segmented control**.
- Upload-velden: standaard file input — op iOS WebView vaak lelijk; custom button + hidden input is beter.

---

### `/editor` — Scoreboard editor

**Bevindingen**
- Op 393px: inspector onder canvas (900px breakpoint) — logisch, maar toolbar met 5+ knoppen wrapt rommelig.
- Canvas preview wordt **~240px min-height** — te klein om te werken op phone.
- Sticky glass header met veel controls — niet bedoeld als primary mobile surface.

**Advies**
- Editor **desktop-first houden**; op phone tonen: “Open op desktop of tablet (breedte ≥768px)” of vereenvoudigde read-only preview.
- Geen grote investering in mobile editor tenzij product dat eist.

---

## Component-gaps in `tahoe.css`

Huidige tokens zijn solide; ontbrekende **iOS-achtige bouwblokken**:

| Component | Status | Actie |
|-----------|--------|-------|
| Navigation bar | ❌ | `.pv-nav-bar` — 44px hoogte, blur, border-bottom hairline |
| Grouped list | ❌ | `.pv-group` + `.pv-cell` |
| Segmented control | ❌ | `.pv-segmented` — pill container, active segment wit |
| Toggle switch | ❌ | `.pv-switch` — checkbox replacement |
| List row | ❌ | `.pv-list-row` — 44–52px min-height, chevron rechts |
| Action sheet / bottom bar | ❌ | Optioneel voor operator primary actions |
| Hairline separator | ❌ | `--pv-separator: rgba(60,60,67,0.12)` |
| Large title header | ❌ | Scroll-collapsing optioneel later |

**Button-hiërarchie (iOS mapping)**

| iOS style | Huidige class | Aanpassing |
|-----------|---------------|------------|
| Filled (prominent) | `.button--primary` | Radius 10–12px, min-height 50px op touch |
| Tinted (secondary) | `.button--secondary` | `background: rgba(0,122,255,0.12); color: var(--pv-accent)` i.p.v. grijs |
| Gray (neutral) | — | `background: rgba(120,120,128,0.12)` |
| Plain (text) | links in header | Geen background box, alleen accent color |

---

## Visuele inconsistenties (alle pagina’s)

1. **Border-radius mix:** 4px, 6px, 8px, 10px, 12px, 14px door elkaar — iOS is stricter (10pt cells, 12pt buttons, 13–16pt sheets).
2. **1px borders** overal — iOS separators zijn **0.5px** (`transform: scaleY(0.5)` of `border-width: 0.5px` waar supported).
3. **Eyebrow uppercase** op alle pagina’s — vervangen door iOS section headers op operator/project.
4. **Brand mark gradient** (`#007aff → #5856d6`) — OK als product-identiteit; iOS apps gebruiken vaker flat icon — geen blocker.
5. **Glass overuse** — op mobile lists liever solid `#ffffff` op `#f5f5f7`.

---

## Aanbevolen implementatievolgorde

### Fase 1 — Operator polish (1–2 dagen)
1. Nav bar patroon: compacter, safe-area-top, minder elementen.
2. Verwijder dubbele titels; focus chip alleen bij `?graphic=`.
3. Vervang `.op-card.glass` door `.pv-group` voor score/ticker/roster secties.
4. Tinted button style voor secundaire acties; filled green alleen voor live/pause.

### Fase 2 — Design system (`tahoe.css`) (1 dag)
1. Typografie- en spacing-tokens uitbreiden (zie tabellen hierboven).
2. `--pv-separator`, `.pv-group`, `.pv-segmented`, `.pv-switch`.
3. `@supports not (backdrop-filter)` fallback: `--pv-bg-elevated: #ffffff`.

### Fase 3 — Form controls (1 dag)
1. Gedeelde styled select in `form-controls.css`.
2. Operator checkboxes → toggles waar het live bediening betreft.
3. Klok-aanpassingen als segmented control.

### Fase 4 — Desktop surfaces (optioneel)
1. Control: mobile redirect-banner.
2. Project: nav bar + segmented presets.
3. Editor: desktop-only gate op `<768px`.

---

## Acceptatiecriteria (voor dev handoff)

- [ ] Operator nav bar ≤56px content-hoogte + safe-area-top op echte iPhone simulator
- [ ] Alle touch targets operator ≥44×44pt (primair ≥50pt)
- [ ] Geen dubbele widget-titel in header én card
- [ ] Minstens 2 widget-secties gebruiken grouped list i.p.v. glass card
- [ ] Typografie: geen uppercase eyebrows op operator; section headers 13px secondary
- [ ] `@supports` fallback voor glass zonder blur
- [ ] Windows smoke test: operator + control leesbaar in Electron/Chromium (Segoe UI, geen ontbrekende icons)
- [ ] Spacing: 16px horizontale screen margin op 390px breakpoint

---

## Referenties

- Intern: `docs/UX-DESIGN-BRIEF.md`, `.cursor/skills/frontend-design/SKILL.md`, `public/shared/tahoe.css`
- Apple HIG (publiek): [Typography](https://developer.apple.com/design/human-interface-guidelines/typography), [Layout](https://developer.apple.com/design/human-interface-guidelines/layout), [Lists and tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables)
- Cross-platform: system font stack, CSS-only components, geen native-only APIs

---

*Audit uitgevoerd: 11 juni 2026 — viewport iPhone 14 Pro (393×852), server poort 2014.*
