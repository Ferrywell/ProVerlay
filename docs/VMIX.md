# ProVerlay in vMix

ProVerlay rendert graphics als een lokale webpagina. vMix toont die via **Web Browser** input (Chromium Embedded Framework — dezelfde technologie als OBS Browser Source).

**Standaard URL:** `http://127.0.0.1:2014/render`  
**Poort:** configureerbaar via `PORT` (default `2014`)

---

## Snel starten

1. Start ProVerlay op dezelfde machine als vMix (`npm start` of toekomstige standalone app).
2. In vMix: **Add Input → More → Web Browser**.
3. **URL:** `http://127.0.0.1:2014/render`
4. **Width / Height:** `1920` × `1080` (of match je project canvas in ProVerlay `/project`).
5. Positioneer als **Overlay** (1–4) of fullscreen.
6. Controleer transparantie — zie [Transparantie](#transparantie) hieronder.

---

## URL-varianten

| URL | Gebruik |
|-----|---------|
| `http://127.0.0.1:2014/render` | **Alle zichtbare widgets** — voorkeur (1 browser input) |
| `http://127.0.0.1:2014/render?graphic=score-main` | **Eén widget** — aparte overlay, eigen positie in vMix |
| `http://127.0.0.1:2014/render?graphic=ticker-main` | Tickertape apart (bijv. onderaan) |

Kopieer per-widget URLs vanaf **Control** → kaart → link-icoon naast de widgetnaam.

**Aanbeveling:** Gebruik **één** gecombineerde `/render` waar mogelijk — minder geheugen dan meerdere Web Browser inputs.

---

## Transparantie

vMix vereist een **expliciet transparante** pagina. ProVerlay zet dit in de render-CSS. Als je toch een witte achtergrond ziet:

1. Controleer dat je de **render-URL** laadt, niet `/control`.
2. Zet in vMix geen achtergrondkleur op de input.
3. Bij custom CSS in vMix (indien beschikbaar), voeg toe:

```css
html {
  margin: 0;
  padding: 0;
  overflow: hidden;
}
body {
  margin: 0;
  padding: 0;
  background-color: rgba(0, 0, 0, 0);
  overflow: hidden;
}
```

**Scrollbars:** `overflow: hidden` op `html` en `body` voorkomt horizontale/verticale scrollbalken in de overlay.

---

## Resolutie & positionering

| Instelling | Advies |
|------------|--------|
| Web Browser Width/Height | Gelijk aan ProVerlay canvas (default **1920×1080**) |
| Kleinere widget | Bij `?graphic=id` mag width/height kleiner (bijv. ticker 1920×120); positioneer via Input → Position |
| Output Size vMix | Onafhankelijk; browser rendert op ingestelde pixelgrootte |

vMix centreert kleinere browser inputs initieel — sleep naar positie (bijv. onderkant voor ticker).

---

## Framerate & animaties

vMix Web Browser volgt de **project frame rate** (25p, 50i, 60p, enz.).

| Observatie | Actie |
|------------|--------|
| Animaties lijken “half zo snel” (vooral Windows 11 + 25p) | Test **50i** project rate, of vereenvoudig CSS-animaties |
| Ticker hapert | Verlaag `speed`; vermijd zware effecten |
| Score-animatie te lang | Pas `animation.durationMs` aan in widget data |

ProVerlay gebruikt bewust lichte CSS-animaties en `transform` voor ticker-scroll — zie [PRODUCT-ROADMAP.md](./PRODUCT-ROADMAP.md#render-performance-cef-regels).

---

## Overlays

vMix HD/4K ondersteunt **4 overlay-kanalen** tegelijk.

**Typische WK / watch-along layout:**

| Overlay | Bron |
|---------|------|
| 1 | Gecombineerde ProVerlay `/render` (score + ticker + countdown) |
| 2–4 | Camera’s, NPO niet in vMix (kijker apart) |

Of splits:

| Overlay | URL |
|---------|-----|
| 1 | `?graphic=score-main` |
| 2 | `?graphic=ticker-main` |

Bedien zichtbaarheid via ProVerlay **control/operator**:

| Output | Vlag | URL |
|--------|------|-----|
| Hoofdoverlay (gecombineerd) | `visible` | `/render` |
| Solo (eigen vMix-scene) | `soloVisible` | `/render?graphic=<id>` |

Op de dashboard-kaart: **Go live** = main, **solo-knop** (naast link-icoon) = solo. Companion heeft aparte actions/feedbacks voor main en solo.

---

## Audio

ProVerlay render bevat normaal **geen audio**. vMix Web Browser ondersteunt wel HTML5-audio; niet nodig voor graphics.

---

## Netwerk & andere PC’s

| Scenario | URL |
|----------|-----|
| vMix en ProVerlay op **zelfde PC** | `127.0.0.1:2014` |
| ProVerlay op **andere machine** | `http://{ip-van-proverlay-pc}:2014/render` — firewall poort 2014 open |

Operator-iPad op hetzelfde netwerk gebruikt dezelfde host-IP.

---

## vMix vs OBS — verschillen

| Onderwerp | OBS Browser Source | vMix Web Browser |
|-----------|-------------------|------------------|
| Engine | CEF (Chromium) | CEF (Chromium) |
| Transparantie | OBS injecteert vaak transparante body | Expliciete CSS nodig |
| Shutdown when hidden | Instelling in bron | Overlay uit = input niet in program (handmatig) |
| Hardware acceleration | OBS Advanced setting | vMix High Input Performance Mode (GPU ≥ 3 GB) |
| Per-widget URL | Zelfde | Zelfde |
| Scrollbars | Zeldzaam | Voorkom met `overflow: hidden` |

ProVerlay hoeft **geen** aparte render-code per host — alleen setup verschilt.

---

## Performance-tips (vMix)

1. **Eén** Web Browser input voor gecombineerde render.
2. Verberg widgets in ProVerlay (`visible: false`) i.p.v. alleen vMix overlay dicht — render stopt timers.
3. Geen zware animaties (partikels, video loops in dezelfde input).
4. **High Input Performance Mode** in vMix Settings als GPU het aankan.
5. Bij geheugengroei: herstart Web Browser input of herlaad URL (rechtsklik → refresh).

---

## Watch-along (handmatige sync)

ProVerlay toont score en klok op de stream; kijkers kijken wedstrijd apart (bijv. NPO). **Geen** automatische sync — instructie in stream/chat.

---

## Troubleshooting

| Probleem | Oplossing |
|----------|-----------|
| Witte achtergrond | Transparantie-CSS; juiste `/render` URL |
| Pagina laadt niet | ProVerlay draait? `curl http://127.0.0.1:2014/api/state` |
| Graphics updaten niet | Firewall; zelfde netwerk; Socket.io niet geblokkeerd |
| Ticker / klok loopt door terwijl overlay uit staat | Zet `visible: false` in ProVerlay |
| Wazige tekst | Browser width/height = output resolutie; niet upscalen in vMix |
| Scrollbars zichtbaar | `overflow: hidden` (ingebouwd in render; zie transparantie) |

---

## Gerelateerd

- [PRODUCT-ROADMAP.md](./PRODUCT-ROADMAP.md) — productfases & performance
- [COMPANION.md](./COMPANION.md) — Stream Deck (werkt naast vMix)
- [ux/TICKER-COUNTDOWN-SPEC.md](./ux/TICKER-COUNTDOWN-SPEC.md) — ticker & countdown voor vMix-lagen
