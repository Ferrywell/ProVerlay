## ProVerlay

ProVerlay is eenvoudige live broadcast graphics software. Deze module bedient ProVerlay vanuit Bitfocus Companion (Stream Deck).

### Vereisten

- ProVerlay draait (`npm start` in de ProVerlay map)
- Standaard poort: **2014**

### Configuratie

| Veld | Standaard | Beschrijving |
|------|-----------|--------------|
| Host | 127.0.0.1 | IP van de machine met ProVerlay |
| Port | 2014 | ProVerlay server poort |
| Reconnect | aan | Automatisch opnieuw verbinden |

### Acties

- **Show graphic** — zet een graphic aan
- **Hide graphic** — zet een graphic uit
- **Toggle graphic** — wissel zichtbaarheid
- **Set theme** — wijzig overlay theme
- **Set primary color** — wijzig accentkleur

### Presets

Bij verbinden worden automatisch toggle-presets gegenereerd per graphic in je show.

### API

ProVerlay gebruikt Socket.io op `http://host:port` met event `stateChanged`.
