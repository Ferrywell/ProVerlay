# ProVerlay — First-run experience (voor redesign-agent)

> Status: richtlijn, geen final UI. Volledige redesign volgt apart.

## Onderzoek vergelijkbare tools

| Product | Patroon |
|---------|---------|
| **OBS Browser Source** | Eén URL in OBS/vMix; aparte control UI (web of app). Geen mixed “één scherm doet alles”. |
| **MakeTheBoard** | Dashboard op telefoon + **publieke view-URL** voor OBS. WebSocket sync. |
| **UNO Overlays** | Expliciet **Output URL** (render) vs **Control URL** (bediening) — twee kopieerknoppen. |
| **Holographics / RCG** | Desktop app + render outputs; operator vaak tablet/phone. |
| **ClosingCredits / HUDS** | Lokale server (`127.0.0.1:poort`) + browser source 1920×1080. |

**Gemeenschappelijk:** gebruikers begrijpen pas na uitleg dat **bediening** en **beeld in de stream** twee verschillende URLs/schermen zijn.

---

## Wat een nieuwe gebruiker moet zien (eerste start)

### 1. Welkom + kernconcept (kort, niet als muur tekst)

Drie rollen in één zin:

1. **Dashboard** (dit venster) — project en overlays instellen  
2. **Render** — wat vMix/OBS toont (browser source, transparant)  
3. **Operator** — telefoon/tablet tijdens de show (score, ticker, live)

### 2. De twee belangrijkste URLs (visueel scheiden)

| URL | Pad | Wie | Waar |
|-----|-----|-----|------|
| **Render (output)** | `http://<ip>:2014/render` | vMix/OBS browser input | 1920×1080, transparant |
| **Operator (control)** | `http://<ip>:2014/operator` | Producer op telefoon | Safari, bookmark |

Optioneel per overlay: `?graphic=score-main` — alleen als je bronnen wilt splitsen.

**Dashboard** (`/control`) = setup vóór en na de show, niet op de stream.

### 3. Eerste stappen-checklist (3–5 items)

1. Nieuw project aanmaken of activeren  
2. Widget toevoegen (bijv. Match score) → instellen → **Go live**  
3. Render-URL kopiëren → in vMix/OBS plakken  
4. Operator-URL op telefoon openen (zelfde Wi‑Fi, **http** niet https)  
5. Test: toggle in operator → zichtbaar in render

### 4. Lege staat dashboard

- **Geen** vooraf gevulde Odido/voorbeeldprojecten  
- Overlay-lijst leeg tot gebruiker widget toevoegt  
- Project heet “New client” tot hernoemd  
- Netwerkblok met lokale IP-URLs (al aanwezig in Project & network)

### 5. Wat níet tonen bij first-run

- Geen quiz/lower-thirds tenzij zelf toegevoegd  
- Geen design-references of PNG-voorbeelden uit dev-map  
- Geen live widgets (alles uit)  
- Geen client-specifieke teamcodes (HOME/AWAY alleen bij nieuwe score-widget)

---

## Technische scheiding (blijft zo)

| Locatie | Inhoud |
|---------|--------|
| **App bundle** (`Resources/seed-data`) | Alleen `blank` project, lege graphics, registry |
| **User data** (`~/Library/Application Support/ProVerlay/data`) | Echte projecten, assets, instellingen — blijft bij app-update |
| **Repo `data/`** | Dev/werkprojecten (Odido, tests) — **niet** verpakken |

---

## Aanbevelingen voor redesign (prioriteit)

1. **First-run modal of welcome panel** — concept uitleg + copy-knoppen render + operator  
2. **Visuele scheiding** “Setup” vs “Live” vs “Output” in navigatie  
3. **Empty state** overlay-lijst met CTA “Add your first widget”  
4. **Network panel** prominenter op first-run (QR naar operator op mobiel?)  
5. **Geen wizard van 10 stappen** — producers willen binnen 30 sec iets live zetten (PRODUCT.md)

---

## Open punten (niet nu bouwen)

- Apple-notarisatie / geen `xattr` na download  
- In-app vMix/OBS setup guide met screenshots  
- Companion-module als aparte install flow
