# Project UX — multi-project & export/import

## Doel

Operators en TD's werken met **projecten**: elk project bevat eigen overlays, branding en assets (scorebord-PNG's). Standaard start ProVerlay met één leeg project. Projecten wisselen zonder server herstart; export/import deelt complete shows als `.proverlay` zip.

## Plaatsing in UI

Het **projectpaneel** staat in het dashboard (`/control`), bovenaan de rechterkolom (`side-stack`), vóór klant branding. Reden: projectkeuze is setup-context — beïnvloedt alles wat daaronder staat.

```
┌─────────────────────────────────────────────────────────────┐
│  Header: ProVerlay · sync · Operator · Render URL · Preview │
├──────────────────────────────┬──────────────────────────────┤
│  Overlays (graphics list)    │  ▶ Project (switcher)        │
│                              │    Klant branding            │
│                              │    Custom overlays / editor  │
└──────────────────────────────┴──────────────────────────────┘
```

## Componenten

### Project switcher (`#project-switcher`)

| Eigenschap | Waarde |
|------------|--------|
| Type | `<select>` binnen `.field` |
| Label | Actief project |
| Inhoud | Lijst uit `GET /api/projects` |
| Actief item | `project.active === true` of `id === activeId` |
| Actie bij wijziging | `POST /api/projects/:id/activate` → herlaad state via socket/`GET /api/state` |

**Gedrag:** Na activatie verversen overlays en branding-formulier. Geen bevestigingsdialoog bij wissel (snelle workflow). Bij onopgeslagen branding-wijzigingen: lead kan later dirty-state toevoegen; UX toont geen blocker in v1.

### Nieuw project (`#project-new`)

1. Klik **Nieuw project**
2. Browser `prompt`: projectnaam (verplicht, min 1 teken)
3. `POST /api/projects` body: `{ "name": "..." }`
4. Server maakt leeg project, activeert optioneel automatisch (lead-beslissing)
5. UI: statusmelding + switcher verversen

**Leeg project:** geen graphics, default brand, geen assets. Operator toont lege staat.

### Exporteren (`#project-export`)

1. Klik **Exporteren**
2. `GET /api/projects/active/export` → blob download
3. Bestandsnaam voorstel: `{projectName}.proverlay` (uit `Content-Disposition` of fallback)
4. Status: "Export gestart…" / "Export voltooid"

### Importeren (`#project-import`)

1. Klik **Importeren** (verborgen `<input type="file">`)
2. Accept: `.proverlay`, `.zip`
3. `POST /api/projects/import` multipart veld `file`
4. Response: nieuw of overschreven project-id
5. Activeer geïmporteerd project (lead) of toon in switcher
6. Status + state refresh

**Fouten:** ongeldig zip → rode status "Import mislukt: …"

### Statusregel (`#project-status`)

- Rol: `role="status"`, `aria-live="polite"`
- Classes: `.project-status`, `.is-error` bij fout
- Korte Nederlandse teksten, geen technische stack traces

### Scorebord editor link

Primair: **Scorebord editor** → `/editor` (optioneel `?graphic=score-main`).

## States & feedback

| State | Visueel |
|-------|---------|
| Laden | Switcher disabled, status "Projecten laden…" |
| Klaar | Switcher enabled, actief project geselecteerd |
| Bezig | Knoppen disabled, status toont actie |
| Fout | `.is-error` op status, switcher blijft bruikbaar |

## API-contract (UX verwacht)

| Method | Path | UX gebruik |
|--------|------|------------|
| GET | `/api/projects` | `[{ id, name, active?, updatedAt? }]` |
| POST | `/api/projects` | `{ name }` → `{ id, name }` |
| POST | `/api/projects/:id/activate` | active project wisselen |
| GET | `/api/projects/active/export` | binary `.proverlay` |
| POST | `/api/projects/import` | `multipart/form-data`, veld `file` |

## Toegankelijkheid

- Switcher heeft zichtbaar `<label>`
- Import via `<label>` gekoppeld aan hidden file input (grote kliktarget)
- Status voor screenreaders via `aria-live`

## Lead gaps (te bevestigen)

1. **DELETE project** — niet in scope UX v1; documenteer later indien nodig
2. **Rename project** — alleen via export/re-import of toekomstige PATCH
3. **Dirty guard** bij projectwissel met open branding-formulier
4. **Import conflict** —zelfde id: overschrijven vs. nieuwe id (server policy)
