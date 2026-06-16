# Bitfocus Companion Integration

## Doel

ProVerlay moet triggerbaar zijn vanuit Bitfocus Companion (Stream Deck), net als Holographics.

## Referentie-implementatie

Holographics module: https://github.com/bitfocus/companion-module-hologfx-holographics

### Holographics patroon
```
Companion → Socket.io SDK → widgets.toggle / entries.patch / state.patch
```

### ProVerlay equivalent (eenvoudiger)
```
Companion → Socket.io → toggleGraphic / patchState
```

## ProVerlay Socket.io events

```javascript
// Verbinding
const socket = io('http://127.0.0.1:2014')

// State ophalen
socket.emit('getState', null, (state) => console.log(state))

// Graphic aan
socket.emit('toggleGraphic', { id: 'lt-host', visible: true }, (graphic) => {})

// Luisteren op wijzigingen
socket.on('stateChanged', (state) => { /* refresh presets */ })
```

## REST fallback

```bash
POST /api/graphics/lt-host/toggle
Body: { "visible": true }
```

## Companion actions

| Action | Beschrijving |
|--------|-------------|
| Show / hide / toggle graphic **(main)** | `visible` op `/render` |
| Show / hide / toggle graphic **(solo)** | `soloVisible` op `?graphic=id` |
| Start countdown (minutes + seconds) | Zet `targetDateTime` vanaf nu |
| Score ±, clock, lower third, colors | Zie module |

## Feedbacks

| Feedback | Conditie |
|----------|----------|
| Graphic visible (main) | `graphic.visible === true` |
| Graphic visible (solo) | `graphic.soloVisible === true` |

## Auto-presets

Per graphic in `state.graphics`:
- Toggle button met 2 stappen (show/hide)
- Feedback op actieve status
- Label = `graphic.name`

## Module locatie

`companion/` — te bouwen door lead developer.

Config:
- Host (default `127.0.0.1`)
- Port (default `2014`)
- Reconnect interval
- Polling fallback

## Testen zonder Stream Deck

1. Companion draaien lokaal
2. Voeg "ProVerlay" instance toe
3. Koppel actions aan virtuele knoppen
4. Verifieer render reageert
