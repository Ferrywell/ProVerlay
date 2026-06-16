# ProVerlay Companion Module

Bitfocus Companion module voor ProVerlay live graphics.

Vereist **Companion 4.3+** (module API 2.0).

## Installatie (development)

1. Start ProVerlay:

```bash
npm start
```

ProVerlay draait op poort **2014**.

2. Installeer en koppel de dev-module:

```bash
cd companion
npm run setup-dev
```

Dit maakt een symlink aan in `~/companion-module-dev/companion-module-proverlay` en installeert dependencies.

3. In **Companion Launcher** (niet de web-UI):

- Open Companion Launcher
- Klik op het tandwiel → **Advanced**
- **Developer modules path:** `~/companion-module-dev` (de map, niet de module-map zelf)
- Herstart Companion

4. Voeg een connection toe:

- Type: **ProVerlay**
- Module Version: **Dev**
- Host: `127.0.0.1`, Port: `2014`

### Veelvoorkomende fouten

| Fout | Oorzaak |
|------|---------|
| Connection not found or not running | Verkeerd dev-pad, of module crasht bij opstarten |
| No config data loaded | Module draait niet; check Companion logs |
| Connection failed | ProVerlay server draait niet op poort 2014 |

Het dev-pad moet de **bovenliggende map** zijn die submappen `companion-module-*` bevat. Zet niet direct het `companion/` projectpad in Companion.

## Configuratie

| Veld | Default |
|------|---------|
| Host | 127.0.0.1 |
| Port | 2014 |

## Test verbinding

```bash
cd companion
npm run test:connection
```

## Acties

- Show / Hide / Toggle graphic
- Score +1 (footballScore)
- Set primary color

Auto-presets worden gegenereerd per graphic uit ProVerlay state.
