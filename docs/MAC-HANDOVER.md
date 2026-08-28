# ProVerlay — Mac installatie & gebruik (overdracht)

> **Doel van dit document:** iemand anders (collega, klant, Cloud-agent) kan ProVerlay op een **eigen Mac (Apple Silicon)** installeren, testen en gebruiken voor live overlays in OBS/vMix — zonder toegang tot de ontwikkelomgeving van Ferrywell.
>
> **Repo:** https://github.com/Ferrywell/ProVerlay  
> **Poort:** `2014` (vast)  
> **Laatste app-release:** zie [GitHub Releases](https://github.com/Ferrywell/ProVerlay/releases/latest)

---

## 1. Wat is ProVerlay?

ProVerlay is een **lokale broadcast-graphics server** met drie rollen:

| Rol | URL (lokaal) | Wie | Waarvoor |
|-----|----------------|-----|----------|
| **Dashboard** | `http://localhost:2014/control` | Producer / TD op Mac | Projecten, overlays aanmaken, **Edit settings**, layout |
| **Render (output)** | `http://localhost:2014/render` | OBS / vMix Browser Source | Wat de kijker ziet (transparante overlay) |
| **Operator** | `http://<mac-ip>:2014/operator` | iPad / iPhone op set | Live bediening (score, klok, ticker) |

**Belangrijk:** bediening en beeld zijn **twee verschillende URLs**. OBS toont alleen `/render`; de operator bedient via `/operator` of het dashboard.

---

## 2. Systeemvereisten

| Vereiste | Detail |
|----------|--------|
| **Mac** | Apple Silicon (M1/M2/M3/M4) — **arm64-build** |
| **macOS** | Ventura of nieuwer aanbevolen |
| **Netwerk** | Wi‑Fi/LAN voor operator op telefoon (zelfde netwerk als Mac) |
| **OBS / vMix** | Browser Source / Browser Input ondersteuning |
| **Node.js** | Alleen nodig voor **ontwikkelen/builden**, niet voor de `.app` |

Intel Macs: huidige release is **arm64-only**. Intel-build staat op de roadmap.

---

## 3. Installatie (Mac-app — aanbevolen)

### 3.1 Download

1. Ga naar **https://github.com/Ferrywell/ProVerlay/releases/latest**
2. Download **`ProVerlay-mac-arm64.zip`**
3. Pak uit → je krijgt **`ProVerlay.app`**

Directe link (latest):  
https://github.com/Ferrywell/ProVerlay/releases/latest/download/ProVerlay-mac-arm64.zip

### 3.2 Installeren

1. Sleep **`ProVerlay.app`** naar **Applications**
2. **Eerste keer openen:** rechtsklik op de app → **Open** → nogmaals **Open**  
   (Niet dubbelklikken — macOS Gatekeeper blokkeert dan soms unsigned apps.)
3. Als macOS nog blokkeert, in Terminal:

```bash
xattr -cr /Applications/ProVerlay.app
```

4. Start **ProVerlay** — menubar-icoon verschijnt; dashboard opent op `/control`

### 3.3 Wat gebeurt er bij eerste start?

- De app start een **lokale server op poort 2014**
- Gebruikersdata wordt opgeslagen in:  
  **`~/Library/Application Support/ProVerlay/data`**
- Eerste run kopieert een **leeg seed-project** (geen Odido-demo in productie-app)
- Venster sluiten **stopt de server niet** — gebruik menubar → Stop of Cmd+Q

---

## 4. Snelle test (5 minuten)

### Stap 1 — App draait

- Dashboard bereikbaar: http://localhost:2014/control
- Status: verbonden (groen) in de UI

### Stap 2 — Overlay live

1. Selecteer een overlay in de lijst (of maak nieuwe widget)
2. Zet **Combined** aan (toggle) zodat overlay op `/render` verschijnt
3. Open http://localhost:2014/render in Safari — overlay zichtbaar?

### Stap 3 — OBS Browser Source

1. OBS → Sources → **Browser**
2. URL: `http://localhost:2014/render`
3. Width: **1920**, Height: **1080**
4. Vink **Shutdown source when not visible** uit (optioneel)
5. Custom CSS leeg laten; achtergrond transparant

### Stap 4 — Operator op telefoon

1. Op Mac: dashboard → **Project & network** → noteer LAN-IP (bijv. `192.168.1.42`)
2. Op iPhone/iPad (zelfde Wi‑Fi): `http://192.168.1.42:2014/operator`
3. **Gebruik http, niet https** — anders `ERR_SSL_PROTOCOL_ERROR`
4. Wijzig score/klok → direct zichtbaar in render + OBS

---

## 5. Hockey scorebug (Odido) — v0.6.6+

### 5.1 Widget type

- Type: **`hockeyScorebug`**
- Layout: teamcode (Glow-mesh) · zwarte score · **zwarte klokcirkel** (geen ring) · spiegel away-kant
- Klok: Q1–Q4 / RUST, countdown, start/pause via operator

### 5.2 Operate vs Edit settings

| Menu | Waar | Wat |
|------|------|-----|
| **Operate** | Dashboard (overlay selecteren) of `/operator` | Scores, teamcodes, kleuren, klok, periode |
| **Edit settings** | Overlay-kaart → link, of `/control?configure=<id>` | **Typografie** (grootte/dikte per categorie) + **Transition** |

Typografie-categorieën (live preview, geen aparte Save-knop):

- **Team code** (NED / SPA)
- **Score**
- **Clock — time** (12:55)
- **Clock — period** (Q1)

Size: 50–150% (multiplier op designer-baseline). Weight: Regular (400) of Bold (700).  
Layout-proporties (armen, gaps, Glow-mesh) blijven vast — alleen tekst schaalt.

### 5.3 Solo Browser Source (optioneel)

Per overlay een **eigen OBS-laag**:

- URL: `http://localhost:2014/render?graphic=hockey-scorebug-main`
- Of via dashboard: kopieer **solo URL** op de overlay-kaart

### 5.4 Odido huisstijl — logo + oranje balk

**Geen apart logo-widget.** Logo en oranje tickerbalk zitten in **PNG-assets**, gekoppeld aan widgets:

| Wat je ziet | Widget | PNG-asset |
|-------------|--------|-----------|
| **Oranje balk + Odido-logo onderin** | **Ticker** (`ticker-main`) | `ODIDO_TICKERBALK_BASIS_BALK.png` |
| **Scorebalk bovenin (voetbal)** | **Match score** (`score-main`) | `ODIDO_SCOREBALK_BASIS.png` |
| **Hockey scorebug bovenin** | **Hockey scorebug** | CSS (geen logo in widget zelf) |

**Typische setups:**

| Format | Bovenin | Onderin |
|--------|---------|---------|
| **Hockey** | Hockey scorebug **aan** | Ticker **aan** ← logo + oranje balk |
| **Voetbal** | Match score **aan** | Ticker **aan** |

Check in dashboard: overlay **Ticker** moet **Combined** (live) aan staan. Zonder ticker zie je geen logo/oranje balk.

**v0.6.7+:** Mac-app start met **Odido-demoproject** (Ticker + Hockey scorebug standaard aan).

**Bestaande installatie (vóór 0.6.7):** importeer `Odido.proverlay` uit de release, of wis data en herinstalleer:

```bash
# Optioneel — verse Odido seed (let op: wist lokale projecten)
rm -rf ~/Library/Application\ Support/ProVerlay/data
# Start app opnieuw
```

---

## 6. Projecten & data

### 6.1 Project wisselen / importeren

- Dashboard → project-dropdown → activeren
- **Export:** `.proverlay` zip (instellingen + assets)
- **Import:** nieuwe installatie in één stap

### 6.2 Waar staan bestanden?

| Omgeving | Data-pad |
|----------|----------|
| **Mac .app (v0.6.7+)** | `~/Library/Application Support/ProVerlay/data` — bevat **Odido-demoproject** |
| **Mac .app (oud)** | Alleen blanco project — import `Odido.proverlay` |
| **Dev (git clone)** | `./data/` in de repo |

### 6.3 Fonts & branding

- Project → **Edit client — branding & assets**
- Upload Otypical / klantfonts
- Actief project bepaalt fonts op render

---

## 7. Ontwikkelen & zelf builden (optioneel)

Alleen nodig als je **van source** werkt of een nieuwe `.app` wilt maken.

```bash
# Vereisten
brew install nvm   # of bestaande Node 22+
cd ProVerlay
nvm use 22
npm install

# Dev-server (zonder Electron)
npm start
# → http://localhost:2014/control

# Dev met Electron-venster
npm run app

# Mac arm64 build + zip
npm run dist:mac
# → dist/ProVerlay-mac-arm64.zip
```

Build-details: `docs/APP.md`

---

## 8. Problemen oplossen

| Symptoom | Oplossing |
|----------|-----------|
| App opent niet | Rechtsklik → Open; of `xattr -cr /Applications/ProVerlay.app` |
| Poort 2014 bezet | Andere ProVerlay/dev-server stoppen; `lsof -i :2014` |
| Operator laadt niet op telefoon | Zelfde Wi‑Fi; **http://** niet https; firewall Mac |
| Render zwart / leeg | Overlay **Combined** aan? Juiste URL? |
| Wijziging niet zichtbaar | Render-tab verversen; OBS browser source refresh |
| Hockey Glow mist | Assets in app-bundle: `public/render/assets/hockey-glow-*.png` |
| Typografie reset | `data.style.typography` per categorie in project.json of via Edit settings |

---

## 9. Versie-overzicht (recent)

| Versie | Hoogtepunten |
|--------|----------------|
| **0.6.7** | Odido demoproject in Mac-app; Ticker + assets standaard; `Odido.proverlay` import |
| **0.6.6** | Hockey typografie per categorie in Edit settings (live) |
| **0.6.5** | Hockey klok-layout/type tuning |
| **0.6.4** | Hockey Odido PNG-proporties + Glow-mesh slices |
| **0.6.3** | F1 lap/SC spacing |
| **0.6.0** | Hockey scorebug widget + F1 polish |

Volledige changelog: GitHub Releases.

---

## 10. Cloud-agent instructies (copy-paste prompt)

Gebruik onderstaande blok als startprompt voor een Cloud-agent die dit project moet overdragen of ondersteunen:

```
Je helpt met ProVerlay op macOS (Apple Silicon).

Lees eerst:
- docs/MAC-HANDOVER.md (dit document)
- docs/APP.md (Electron/data-paden)
- README.md (overzicht)

Kern:
- Poort 2014; render=/render; operator=/operator; dashboard=/control
- Mac-app: GitHub release ProVerlay-mac-arm64.zip → Applications → rechtsklik Open
- Data: ~/Library/Application Support/ProVerlay/data
- Hockey: operate=scores/klok; Edit settings=typografie (data.style.typography)

Taken:
1. Verifieer installatie (localhost:2014/control bereikbaar)
2. Test render + OBS browser source workflow
3. Bij bugs: check poort, http vs https, overlay visible toggle
4. Build alleen met: nvm use 22 && npm run dist:mac

Repo: https://github.com/Ferrywell/ProVerlay
```

---

## 11. Contact & repo-structuur

```
ProVerlay/
├── public/control/     # Dashboard + Edit settings
├── public/operator/    # Touch bediening
├── public/render/      # OBS output (+ render-hockey.css)
├── server/             # API + Socket.io
├── data/               # Dev-projecten (niet in .app)
├── docs/MAC-HANDOVER.md
└── companion/          # Bitfocus Companion module
```

Agent-rollen en workflow: `AGENTS.md`  
Productvisie: `docs/PRODUCT.md`

---

*Document versie: 0.6.6 — augustus 2026*
