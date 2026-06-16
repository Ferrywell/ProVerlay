# ProVerlay als desktop-app (Electron)

## Mac (prioriteit)

```bash
nvm use 22            # Electron-tooling vereist Node >= 22
npm run app           # dev: Electron met lokale server
npm run dist:mac      # build: dist/mac-arm64/ProVerlay.app
```

- Build is **ad-hoc gesigneerd** (geen Apple Developer ID-notarisatie). Werkt op **Apple Silicon** (M1+).
- `npm run dist:mac` signeert en zipt in één stap (`scripts/package-mac-app.mjs`, alles in `/tmp`) — zonder dit weigert macOS de app met "can't be opened".
- Distributie: `dist/ProVerlay-mac-arm64.zip` met `ProVerlay.app` erin.
- Intel-build komt later.

### Opent niet op een andere Mac? ("can't be opened")

Meestal **Gatekeeper-quarantaine** na download (ook op M1/M2/M3):

1. Zip uitpakken, `ProVerlay.app` naar **Applications** slepen.
2. **Rechtsklik** → **Open** → nogmaals **Open** (niet dubbelklikken de eerste keer).
3. Of in Terminal: `xattr -cr /Applications/ProVerlay.app`

Niet verwarren met Intel: een M1 Pro Mac gebruikt dezelfde arm64-build.

## Gedrag

- App start de Node-server intern op poort **2014** (of verbindt als er al één draait, bv. de dev-server).
- Hoofdvenster toont `/control`; menubar-icoon biedt Operator (browser), Render-URL kopiëren en Stop.
- Venster sluiten verbergt het alleen — server blijft draaien voor OBS/vMix. Stoppen via menubar of Cmd+Q.

## Data

- **Gebruikersdata:** `~/Library/Application Support/ProVerlay/data` (schrijfbaar). Blijft bestaan bij app-updates.
- **Eerste installatie:** kopieert alleen `seed-data/` uit de app-bundle (leeg project, geen voorbeelden).
- **Ontwikkeling:** repo-map `data/` bevat werkprojecten (Odido, tests) — wordt **niet** verpakt.
- Seed genereren: `npm run generate:seed` → schrijft naar `seed-data/`.
- De server leest `PROVERLAY_DATA_DIR` (zie `server/paths.js`); dev zonder Electron gebruikt repo-`data/`.

## Windows (later)

- `electron-builder.yml` bevat al een `win`-sectie (NSIS, x64). Bouwen kan t.z.t. met `npx electron-builder --win` op een Windows-machine of via CI.
- `server/paths.js` is platform-onafhankelijk; op Windows wordt de data-map `%APPDATA%/ProVerlay/data`.
