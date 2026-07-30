# F1 Timing Tower

Live F1-positietoren in Odido pill-stijl. Toont de top N (standaard 5) plus de
focusrijder (standaard VER) als aparte rij eronder wanneer hij buiten de top N
rijdt.

## Widget aanmaken

Dashboard → Overlays → Widget type **F1 timing** → *Add widget*.

## Bronnen

### Manual (standaard)
Handmatige lijst rijders (code, naam, gap). Bewerken via *Operate* op het
dashboard of `/operate?graphic=<id>`: volgorde wijzigen met ↑/↓, gaps intypen.
Bruikbaar zonder externe software, of als fallback wanneer MultiViewer wegvalt.

Met **Import from MultiViewer** vul je de lijst in één klik met de actuele
grid uit de live timing (`POST /api/f1/:id/import-drivers`) — handmatig
intypen is dus nooit nodig zolang MultiViewer bereikbaar is.

### MultiViewer (live)
Leest live timing van een draaiende [MultiViewer](https://multiviewer.app)
instantie via de lokale API (`/api/v1/live-timing/...`).

Vereisten op de MultiViewer-machine:
1. MultiViewer draait en is ingelogd met een F1 TV-abonnement.
2. Een sessie is geladen **met Live Timing actief** (bij replays: klik
   *Replay Live Timing* op de sessiekaart — alleen video afspelen geeft géén data).
3. Check: `http://localhost:10101/api/v1/live-timing/SessionInfo` geeft JSON.

Draait MultiViewer op een andere machine dan ProVerlay, zet dan *MultiViewer
host* op het LAN-IP van die machine.

## Sync met het beeld (delay)

MultiViewer synct live timing al met zijn eigen videospeler. De *Delay
(seconds)* instelling is een extra fijnafstelling voor de keten
scherm-capture → encoder → stream. De server bewaart een buffer van 5 minuten
aan snapshots; delay live bijstellen kan zonder dataverlies.

Werkwijze: zet de race fullscreen via MultiViewer, kijk naar de stream-output
en verhoog de delay tot een positiewissel in de toren gelijk valt met het beeld.

## Instellingen

| Veld | Betekenis |
|---|---|
| Focus driver | TLA-code (VER). Gemarkeerde rij; onder de top N als hij daarbuiten rijdt |
| Top positions | Aantal rijen in de toren (1–20) |
| Gap display | Interval (t.o.v. voorligger) of gap naar de leider |
| Gap decimals | Aantal decimalen in de gaptijden: 1 (F1-stijl, standaard), 0, 2, 3 of Feed (onbewerkt) |
| Animation | In-/uitanimatie: Slide in (links → rechts), Drop down, Fade of Cut |
| Lap counter | Toont de LAP x/y pill boven de toren (standaard aan) |
| Tyre compound | Toont per rijder de actuele band als gekleurde ring met letter (S/M/H/I/W) |
| Delay | Vertraging in seconden t.o.v. de live feed |

**Track status:** de lap-pill kleurt mee met de baanstatus uit de feed
(`TrackStatus`): geel bij yellow flag, geel met **SC**/**VSC**-label bij een
(virtual) safety car, rood bij een rode vlag. Wissels animeren subtiel;
werkt zodra de lap counter aan staat.

**Finish:** zodra een coureur over de finish komt (status-bit 1024 in de
feed) verschijnt automatisch een blokjesvlag helemaal rechts in zijn rij,
zoals in de officiële F1-toren.

**Animatie-semantiek:** handmatige config (top N, gap-modus, decimalen,
tyres aan/uit, lap-header) krijgt in-/uit- en swap-animaties. Live
feed-waarden (gaptijden, posities) updaten zonder motion. Track-status en
finish-vlag wél met korte indicator-animatie.

De in-animatie heeft een stagger: P1 verschijnt eerst, de rest volgt kort
erna (70 ms per rij). De uit-animatie loopt in omgekeerde volgorde. Fijnere
afstelling kan via `data.animation.durationMs` en `data.animation.staggerMs`.

**Live-indicator:** bij bron MultiViewer tonen dashboard-operate én operator
een dot: groen = live timing komt binnen, rood = geen data (met foutmelding),
plus een top-5 preview. Daarnaast: **Open MultiViewer** (start de app lokaal
via `POST /api/system/open-multiviewer`) en een dismissible setup-tip die
benadrukt dat **Live Timing** / **Replay Live Timing** aan moet staan.

Styling via `data.style` (widthPx, rowHeightPx, rowGapPx, borderRadiusPx,
fontSize, background, focusBackground, focusColor). De focusrij gebruikt
standaard de Odido-gradient. Positie via Overlay layout (vrije plaatsing,
`data.placementFree`).

## Techniek

- `server/f1Timing.js` — poller per widget (alleen bij bron MultiViewer),
  ringbuffer voor delayed snapshots, broadcast via socket-event
  `f1TimingUpdate`. Live rijen worden bewust **niet** gepersisteerd in
  `project.json`.
- `GET /api/f1/:id/live` — snapshot voor first paint + statuspoll in de
  operate-UI.
- `public/shared/f1-timing.js` — torenlogica (top N + focus, gap-teksten),
  gedeeld door render en operate.
- Render: rijen zijn keyed op rijderscode en verschuiven via
  `transform: translateY(...)` met transitie — positiewissels animeren
  vloeiend, zoals de echte F1-graphics. Vaste px-maten: de rendercanvas is al
  px-gebaseerd, dus vMix v103-safe.
