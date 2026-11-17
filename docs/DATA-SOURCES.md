# Data sources and variables

Prepare names, titles, ticker lines, quiz questions or image lists in a spreadsheet,
and ProVerlay picks them up, also during the show: fix a typo in the sheet and it is
fixed on air. Everything is on the **Data** page (`/data`, in the header next to
Layout).

## Sources

| Source | How | Updates |
|--------|-----|---------|
| **Google Sheet** | Paste the sheet link. The sheet must be shared as *anyone with the link* (viewer) or published with *File → Share → Publish to web*. No Google login. | Checked every 30 s by default (5 s minimum), plus **Refresh now** |
| **CSV or Excel file** | Upload a `.csv` or `.xlsx`. It is stored in the project. | Upload a new version with **New file** |
| **Linked file** | The full path of a `.csv` or `.xlsx` on the ProVerlay computer. | Re-read as soon as the file is saved |

- CSV files may use `,`, `;` (Dutch Excel exports) or tab as separator, UTF-8 with or
  without BOM (older Windows-1252 exports work too), and quoted fields.
- The first non-empty row holds the column names. Empty rows are skipped.
- For an Excel file, pick the sheet on the source card.
- Each source shows when it was last updated, how many rows it has and the last
  error, plus a preview of the first rows (empty and very long cells are marked).

### Offline

The last good copy of every source is saved in the project folder
(`data-sources/<id>.cache.json`) and goes along with an export. When the internet
or the file is gone, the source shows *using the last saved copy* and the graphics
keep their content.

## Filling a widget's list

On a source card, open **Use this data in a widget**, pick the widget and choose
which column fills which field:

| Widget | Fields |
|--------|--------|
| Lower thirds | Name (required), Title, Organization |
| Ticker | Message (required). Switching a message on/off in the operator survives updates. |
| Quiz | Question (required), Answer A–D, Correct answer (`1`–`4`, `A`–`D` or the answer text) |
| Image | File name of an image in the project assets (required), Display name |

The widget's list is then replaced by the rows of the source on every update. The
person, question or image on air stays on air when its row changes (a title fix shows
right away). When its row disappears, the item at the same position takes over, or
the widget goes off air when nothing is left.

**Hold list changes while the widget is on air** (per source) postpones the update
for a widget until it goes off air. Variables are always live.

**Unlink** keeps the current list and makes it editable in the dashboard again.

## Variables

Use `{{name}}` in the text fields of messages, lower thirds (single and roster,
including text elements of a PNG design), the quiz and the ticker:
`{{event.title}}`, `{{sponsor.line}}`. Names use letters, digits, `.`, `_` and `-`.

- **Project variables:** key/value pairs on the Data page.
- **From a source:** pick a source and its key and value columns. These override
  project variables with the same name.
- **Built-in:** `{{date}}`, `{{time}}`, and from the project's scorebug (the one on
  air, else the first): `{{home.code}}`, `{{home.name}}`, `{{home.score}}`,
  `{{away.code}}`, `{{away.name}}`, `{{away.score}}`, `{{clock}}`, `{{period}}`.

Graphics on air update as soon as a value changes. `{{time}}`, `{{date}}` and
`{{clock}}` tick by themselves, except in a ticker (that would restart the scroll):
there they update with the next change to the ticker or another value. An unknown
variable shows as empty on air; the Data page lists the ones that are used but not
defined.

## Security

ProVerlay has no login, so anyone on the network can add a source. That is why:

- sheet links are fetched over **https only**, from **Google Sheets** by default;
  other hosts must be added under **Allowed hosts**, which only works on the ProVerlay
  computer itself;
- every address a link (or a redirect) points to must be public: private and
  loopback addresses are never fetched, with a 10 s timeout and a 5 MB limit;
- **linked files** can only be added on the ProVerlay computer itself;
- an imported project drops linked file paths and allowed hosts; link the file and
  allow the hosts again on this computer.

## Technical notes

- Server: `server/dataSources.js` (sources, polling, file watch, cache, applying),
  `server/dataParse.js` (CSV parser, Excel via
  [read-excel-file](https://www.npmjs.com/package/read-excel-file), MIT),
  `server/dataFetch.js` (fetch rules), `server/dataBindings.js` (rows → list items),
  `server/dataFiles.js` (file names for export/import).
- Variables: `public/shared/variables.js`, one helper for the render and the
  dashboard previews.
- API: see [ARCHITECTURE.md](ARCHITECTURE.md#rest--data-sources-and-variables).
- Companion variables for project variables are not there yet.
