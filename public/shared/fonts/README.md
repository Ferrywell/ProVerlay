# Bundled fonts

## Inter

| | |
|---|---|
| Font | Inter by Rasmus Andersson and The Inter Project Authors |
| Version | 4.1 (font revision 4.001, `git-9221beed3`) |
| Source | <https://github.com/rsms/inter/releases/tag/v4.1> — `Inter-4.1.zip`, SHA-256 `9883fdd4a49d4fb66bd8177ba6625ef9a64aa45899767dde3d36aa425756b11e` |
| License | SIL Open Font License 1.1, see [OFL.txt](OFL.txt) (copied verbatim from `LICENSE.txt` in the release). No Reserved Font Name is declared. |
| File | `InterVariable.woff2` (137 KB), registered as `font-family: 'Inter'` in [inter.css](inter.css) |

ProVerlay uses Inter as the default brand font for new projects (`'Inter', system-ui, sans-serif`)
so overlays render identically in OBS and vMix on macOS and Windows instead of falling back to
SF Pro on a Mac and Segoe UI or Arial on a PC. Existing projects keep the font they have stored.

### What was changed from the release

`InterVariable.woff2` is a subset of `web/InterVariable.woff2` from the release zip, made with
[fontTools](https://github.com/fonttools/fonttools) 4.68:

- the optical-size axis (`opsz`) is pinned to its default (14, the regular Inter text design);
  the full weight axis (`wght` 100–900) is kept;
- only Latin and Latin Extended characters are kept (plus general punctuation, currency signs,
  arrows and a few symbols). Other scripts fall back to the system font;
- all OpenType features are kept, including `tnum` (tabular figures for clocks and scores),
  `case`, `zero` and the character variants;
- the italic is not bundled; italic text uses the browser's synthesized oblique.

```sh
fonttools varLib.instancer web/InterVariable.woff2 opsz=drop -o pinned.ttf
pyftsubset pinned.ttf --layout-features='*' --flavor=woff2 \
  --output-file=InterVariable.woff2 \
  --unicodes="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD,U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+20A0-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF,U+2190-2199,U+25B2,U+25B6,U+25BC,U+25C0,U+25CF,U+2713,U+2715"
```

To update: download a newer release, check that `LICENSE.txt` is still OFL 1.1 without a
Reserved Font Name, re-run the commands above, replace `InterVariable.woff2` and `OFL.txt`, and
update the version table here.
