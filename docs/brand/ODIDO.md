# Odido brand rules — ProVerlay reference

Agent- en developer-referentie voor Odido-overlays (match, hockeyklok, F1-accenten, tickers).

**Bron (gelezen 2026-07-30):** [merk.odido.nl](https://merk.odido.nl/en/)  
Pagina’s: [Introduction](https://merk.odido.nl/en/) · [Colour](https://merk.odido.nl/en/colour) · [Typography](https://merk.odido.nl/en/typography) · [Layout](https://merk.odido.nl/en/layout) · [Shapes](https://merk.odido.nl/en/shapes) · [Logo](https://merk.odido.nl/en/logo)

**Tokens:** [`odido-tokens.css`](./odido-tokens.css)  
**Palette screenshot (archief):** [`assets/odido-colour-palette.png`](./assets/odido-colour-palette.png)

> Hex/RGB/CMYK hieronder komen **rechtstreeks uit de Brand Portal** (hover/copy-labels). Portal = bron van waarheid.

---

## 1. Merkessentie

| Concept | Portal-tekst (samengevat) | Gevolg voor graphics |
|---------|---------------------------|----------------------|
| **Premium for everyone** | Volwassen + speels + down-to-earth | Glass-zwart / wit als basis; Glow als levend accent |
| **Joy of taking part** | Technologie menselijk, leuk, toegankelijk | Ronde capsules, optimistische kleur |
| **Palindrome name** | “Odido” leest voor- en achteruit; letters open & uniek | Logo + **Mirror**-layout zijn symmetrisch |
| **Glow** | Spectrum van connecties; kern van de core palette | Geen single-color telco-balk; gebruik officiële Glows |

---

## 2. Identity levels

| Level | Look | Gebruik |
|-------|------|---------|
| **Entry** | Zwart, premium, clean + **colour logo** | Eerste impressie, idle chrome, “deur openen” |
| **Participation** | Kleurrijk, warm, speels — **Glow** | Live overlays: ring, strepen, Mirror-achtergronden |
| **Functional** | Wit of zwart + accenten (dark mode digitaal) | Operate/dashboard, praktische UI |

**Hockey/match live scorebug:** Entry-basis (zwart glass + wit type) + Participation-accenten (Glow op ring/strepen). Colour logo **niet** op Glow (zie Colour Don’ts).

### Colour proportions across levels (portal)

1. **Entry** — vooral colour logo op zwart  
2. **Participation** — zwart of wit logo (en elementen) op Glow  
3. **Functional** — wit/zwart + secondary accents  

---

## 3. Colour

> “Odido’s core palette is guided by the Glow, celebrating the energy of human connections.”

### 3.1 Core palette

| Name | Role |
|------|------|
| Black `#000000` | Glass, armen, Entry-achtergrond |
| White `#FFFFFF` | Type op dark, tegels |
| Glow one–four | Mesh-gradients uit secondary hues |

**Glow colour stops (portal labels):**

| Glow | Stops (hex) | Karakter |
|------|-------------|----------|
| **one** | `#FF7621` · `#FF808C` · `#2F9A92` | Orange + pink + teal |
| **two** | `#FFAC24` · `#7066FF` · `#2C72FF` | Yellow + purple + blue — sunny |
| **three** | `#2F9A92` · `#2C72FF` · `#FF7621` | Teal + blue + orange — cooler |
| **four** | `#FF7621` · `#7066FF` · `#2C72FF` | Orange + purple + blue — **punchy** |

**ProVerlay default live-accent: Glow four.** Alternatief: Glow two.

Glows zijn **geen** simpele linear fades — benader met gestapelde radials (zie tokens). Portal: “By creating gradients with complementary colours… A neighbouring colour is added to harmonise.” Gebruik **darker Glow** spaarzaam voor leesbaarheid (wit logo/type).

### 3.2 Secondary palette (officieel)

Tint-ladder: **100% → 80 → 60 → 40 → 20 → 10**.

#### Tech blue
| % | Hex | RGB |
|---|-----|-----|
| 100 | `#2C72FF` | 44 114 255 |
| 80 | `#578FFF` | 87 143 255 |
| 60 | `#82ACFF` | 130 172 255 |
| 40 | `#ADC8FF` | 173 200 255 |
| 20 | `#C3D7FF` | 195 215 255 |
| 10 | `#EEF3FF` | 238 243 255 |

#### Charm teal
| % | Hex |
|---|-----|
| 100 | `#2F9A92` |
| 80 | `#59AFA8` |
| 60 | `#84C3BE` |
| 40 | `#AED8D5` |
| 20 | `#D9ECEB` |
| 10 | `#EEF7F6` |

#### Solar yellow
| % | Hex |
|---|-----|
| 100 | `#FFAC24` |
| 80 | `#FFBD51` |
| 60 | `#FFCE7D` |
| 40 | `#FFDFAA` |
| 20 | `#FFF0D7` |
| 10 | `#FFF8ED` |

#### Dutch orange
| % | Hex |
|---|-----|
| 100 | `#FF7621` |
| 80 | `#FF924E` |
| 60 | `#FFAE7C` |
| 40 | `#FFCAA9` |
| 20 | `#FFE6D6` |
| 10 | `#FFF4ED` |

#### Warm pink
| % | Hex |
|---|-----|
| 100 | `#FF808C` |
| 80 | `#FF9AA3` |
| 60 | `#FFB4BB` |
| 40 | `#FFCED2` |
| 20 | `#FFE8EA` |
| 10 | `#FFF5F6` |

#### Lively purple
| % | Hex |
|---|-----|
| 100 | `#7066FF` |
| 80 | `#8D85FF` |
| 60 | `#AAA4FF` |
| 40 | `#C7C4FF` |
| 20 | `#E5E3FF` |
| 10 | `#F3F2FF` |

### 3.3 Colour Don’ts (portal)

1. Te weinig contrast met achtergrond  
2. Geen gradients in typografie  
3. Geen andere kleurcombinaties dan de bestaande Glows  
4. Geen twee solids mixen tot een nieuw “merkpaar”  
5. Geen kleuren buiten de core/secondary palette  
6. Geen twee verschillende Glows dicht bij elkaar  
7. Geen tekst/logo’s op low-contrast beelden  
8. **Geen colour logo op Glow**  
9. Glows niet maskeren met het logo  
10. Geen zwart logo met witte tekst (en omgekeerd) in één inconsistent blok  

---

## 4. Typography

> “Our typography is simple and celebrates the beauty of our bespoke typeface **Otypical**, a geometrical and human sans serif.”

### Family

| Style | Rol |
|-------|-----|
| **Otypical Headline** | Show-stealer; details maximal; impact |
| **Otypical Text** | Getemperde Headline; leesbaarheid body/UI |

**Weights (portal):** Headline Bold / Medium / Regular / Light · Text Bold (+ Italic) / Medium (+ Italic) / Regular (+ Italic) / Light (+ Italic)

**Regel:** copy **≥ 24px → Headline**; **&lt; 24px → Text**.

**Fallback:** Arial Regular / Bold / Italic als Otypical niet kan.

### Hierarchy

In één compositie: Headline altijd groter dan Text — **minstens 40% groter**.

### Setting

| Onderwerp | Regel |
|-----------|-------|
| Alignment | Bij voorkeur **links**; center spaarzaam; **geen** rechts of justified |
| Case | **Sentence case**; geen title case / all caps / all lowercase (don’ts) |
| Tracking Headline | Groot (~80px): 0 · onder ~40px/30pt: +1% of +20 |
| Tracking Text | ~24px: 0 · onder ~18px/14pt: +1,5% of +20 |
| Kerning | Metrics (Cotype); geen handmatige kerning |
| Headline leading | Strak; veilig **100%**; strakker als ascenders/descenders het toelaten |
| Body leading | Altijd **120%** |
| Ligatures | Standard aan; Headline heeft smart/discretionary features |

### Type colour

- Type = **zwart of wit**  
- Secondary **hues** (100%) mogen woorden in headline/sub highlighten  
- **Geen** body-copy in kleur  
- Geen letter-voor-letter kleuren in één woord  
- **Geen** gradient op type  

### Type Don’ts (selectie)

Geen justified / right-align / title case / all caps / alternative fonts / mixed weights in één blok / touching ascenders-descenders / negative tracking / drop shadows / outlines.

---

## 5. Layout — The Mirror

> Adaptive layout die de symmetrie van het logotype echo’t — van clean tot dynamisch.

### Grids & margins

| Grid | Level | Regels |
|------|-------|--------|
| **Participation** | Poster | Kolommen = **veelvoud van 4** (12/16/20/24); margins gelijk; min. margin **1/12** van de kortste zijde (verticaal zelfde) |
| **Functional** | Editorial | **12 kolommen**; min. margin **1/15** kortste zijde; gutter = **1/3** van margin |

Don’t: ongelijke of custom margins per zijde.

### Mirror construction

- 2–3 panels op het grid  
- Panel ≥ **3 kolommen**  
- Ontmoetingspunt van 2 panels = **as voor logo-placement**  
- Gebruik verschillende Glows over touchpoints heen (range behouden)

### Mirror Don’ts (selectie)

1. Glow herhalen zonder mirroring  
2. Glow-oriëntaties mixen in één design  
3. Zo spiegelen dat één “nieuwe” glow ontstaat  
4. Panels verder splitsen / multiples mixen  
5. Lichte + donkere Glows in dezelfde layout  
6. Foto tussen twee Glows tot 16:9  
7. Glow hero maken ten koste van foto  
8. Panel-richtingen mixen  

**Preferred:** zwarte elementen op Glow. Wit logo → darker Glow indien nodig.

---

## 6. Shapes

> Logo vormt de basis van de shape language — levendig, optimistisch, menselijke communicatie.

### Family (4)

| Shape | Gebruik |
|-------|---------|
| **Pill** | Één-regel CTA/button; horizontaal meegroeien; altijd volle afronding |
| **Speech bubble** | URL, korte info, tips; dubbel overlapping = payoff / info+URL; stacked = dialog |
| **Tile** | Langere copy / imagery container; stacked = masonry (Functional) |
| **Speech tile** | Zeldzaam: price stickers, langere tips |

### Construction

- **Pills & speech bubbles:** corner radius altijd **50% van hoogte** (full round), schaalt mee  
- **Tiles & speech tiles:** large rounded; binnen één touchpoint **één absolute radius** (vaak = logo/pill radius)

### Type insets (portal)

- Pill / 1-line bubble: H inset = **100% copy size**, V = **67% copy size**  
- Speech bubble multi-line: inset ≥ leading (en nooit onder copy size)  
- Tile / speech tile: inset = **100% leading**  
- Masonry: homogeniseer insets; min. inset ≈ tile radius  

### Shape Don’ts

1. Geen speech bubbles als de copy geen dialog is  
2. Geen speech tile als imagery-container  
3. Geen imagery-tile volledig op Glow  
4. Geen overlapping speech bubbles voor headlines  

---

## 7. Logo

> Logo mark + word mark; leesbaar beide kanten op; geometrisch op balance grid.

### Versions

| Versie | Level / gebruik |
|--------|-----------------|
| **Colour logo** | Entry — preferred op **zwart** |
| **Solid logo** | Participation & Functional (zwart/wit) |
| **Outlined / Masked** | Specifieke cases (portal) |
| **Standard vs small use** | Standard tot **135px / 30mm**; daaronder **small use verplicht**; small min. **60px / 16mm** |

Clearspace is in het logo ingebouwd — respecteer minimumafstand.

### Placement

- Participation + Glow Mirror: logo **op de Mirror-as**  
- Glow + foto: wit logo op donkere foto, zwart op lichte foto  
- Zonder Mirror: één logo tegelijk  

### Logo + Glow

- Preferred: **zwart solid** op default Glow  
- Wit solid → **darker Glow** voor contrast  
- **Nooit colour logo op Glow** of op photography  

### Logo Don’ts (selectie)

Geen nieuwe kleuren / crop / effects / proporties wijzigen / recreate / colour logo mirroren / oriëntatie draaien / colour logo op foto / logo in running text / low-contrast plaatsing.

---

## 8. ProVerlay — hockey scorebug recept

Indeling (vastgelegd UX):

```
[glow-stripe | CODE | score]  (○ klok + ring)  [score | CODE | glow-stripe]
```

| Element | Spec |
|---------|------|
| Niveau | Entry glass + Participation Glow accents |
| Armen | `#000` @ 85% opacity, capsule buitenhoeken (pill-taal) |
| Streep | **Glow four** fill (of two) — duidelijk zichtbaar |
| Score | Wit/licht tegel, ink zwart, Otypical Headline |
| Klok | Zwart glass; periode `Q1`–`Q4` |
| Ring | SVG stroke met Glow-four stops; dik genoeg op veldgroen |
| Merkje | Solid/mini mark — **niet** colour logo op Glow-disc |
| Type | ≥24px Headline; wit op glass |

Mockup: `docs/ux/hockey-scorebug-mockup.html`

---

## 9. Projectbestanden

| Pad | Rol |
|-----|-----|
| `docs/brand/odido-tokens.css` | CSS-variabelen (officiële hex) |
| `data/projects/odido/assets/Otypical*.ttf` | Fonts |
| `data/projects/odido/assets/ODIDO_SCOREBALK_BASIS.png` | Legacy strip |
| `AGENTS.md` | Verwijst naar dit document |

---

## 10. Onderhoud

1. Bij twijfel: opnieuw [merk.odido.nl](https://merk.odido.nl/en/) openen (Colour → hover copy).  
2. Tokens + dit doc **samen** updaten.  
3. Geen ad-hoc hex in `render.js` voor Odido-widgets.
