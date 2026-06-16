# PNG design → live overlay

## Wat ging mis (editor vs OBS)

1. **Font-schaal** — editor schaalde tekst mee met canvas; render gebruikte vaste `px` → tekst 2× te groot in OBS, overlap met PNG.
2. **Verkeerd canvas** — scorebalk-PNG op 1920×1080 gezet; pills stonden op ~7% hoogte i.p.v. strip-layout.
3. **Losse pills** — handmatig geplaatste velden zonder vaste breedte → scores overlapten teamcodes bij langere cijfers.

## Juiste workflow

1. Export **alleen de scorebalk** als PNG (transparant of met vaste pill-vormen), bijv. `800×72px`.
2. Editor → upload PNG → afmetingen worden automatisch gezet.
3. Bevestig **“Automatisch tekstvelden plaatsen”** (of klik **Auto-plaats velden**).
4. Sleep velden fijn tot ze in de zwarte pillen / timer vallen.
5. **Opslaan** → preview in `/render` moet 1:1 matchen met editor.

## Techniek

- Fonts: `cqw` (percentage van canvasbreedte) — zelfde in editor en OBS.
- Scores/klok: `tabular-nums` + `min-width` zodat cijfers niet verschuiven.
- Strip-modus: `refHeight < 280px` → geen 16:9 canvas, maar exacte PNG-verhouding.

## PNG aanleveren aan agent

Upload in editor of dashboard → Design referenties. Vermeld:
- Welke binds waar horen (NED, score, klok)
- Font (bijv. SF Pro Bold 42px in design tool → zet in editor slider)
- Of pill-vormen **in** de PNG zitten (alleen tekst live) of **zonder** pills (PNG alleen achtergrond)

Volledige conversie “PNG naar code” zonder handmatig slepen komt in een volgende stap (AI/layout-detectie). Nu: PNG + gegarandeerd WYSIWYG via gedeelde `canvas-layout.js`.
