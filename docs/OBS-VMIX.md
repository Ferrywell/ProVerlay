# ProVerlay in OBS and vMix

ProVerlay renders its graphics as a local web page. OBS (**Browser Source**) and vMix
(**Web Browser** input) both display that page with an embedded Chromium (CEF), so the
setup is almost the same in both. OBS runs on macOS and Windows; vMix is Windows-only.
ProVerlay runs on the same machine (Mac app, Windows app or `npm start`) or on another
computer in the network.

**Default URL:** `http://127.0.0.1:2014/render`
**Port:** `2014` (change it in the app under **Preferences… → Port**, or with the `PORT`
environment variable when running from source)

Use `127.0.0.1` rather than `localhost`: ProVerlay listens on IPv4, and on some
machines (Windows in particular) `localhost` resolves to the IPv6 address `::1` first.

---

## OBS Studio

1. Start ProVerlay on the streaming machine (Mac app or `npm start`).
2. In the scene, **Sources → + → Browser**.
3. **URL:** `http://127.0.0.1:2014/render`
4. **Width / Height:** `1920` × `1080` (or your project canvas size, see *Edit project →
   Render canvas*).
5. Leave **Custom CSS** at its default (it sets a transparent body) or clear it — the
   render page is transparent by itself.
6. Optional: tick **Shutdown source when not visible** only if you do not mind the page
   reloading when you switch scenes; ProVerlay restores the live state on reload.
7. Put the Browser Source **above** your camera/video sources.

### OBS on Windows

The Browser Source settings are the same as on macOS. In addition:

- **Settings → Advanced → Sources → Enable Browser Source Hardware Acceleration** should
  stay on (the default). Turn it off only if the source stays black or flickers with
  your GPU driver, then restart OBS.
- Leave **Use custom frame rate** off so the source follows the OBS canvas frame rate.
- On a laptop with two GPUs, let OBS run on the dedicated GPU: **Settings → System →
  Display → Graphics**, add OBS and choose **High performance**.
- Windows Defender Firewall does not matter when OBS and ProVerlay run on the same PC.

## vMix

vMix runs on Windows only. Run ProVerlay on the vMix PC (the Windows app, beta, or
`npm start`) or on a Mac in the same network (see [Network](#network-and-other-machines)).

1. Start ProVerlay on the same machine as vMix (or see [Network](#network-and-other-machines)).
2. **Add Input → More → Web Browser**.
3. **URL:** `http://127.0.0.1:2014/render`
4. **Width / Height:** `1920` × `1080` (or your project canvas size).
5. Put the input on an **Overlay** channel (1–4) or use it fullscreen.
6. Check the transparency — see [Transparency](#transparency).

vMix uses the page's alpha channel for the Web Browser input, so the transparent render
needs no chroma key. Web Browser inputs are rendered on the GPU: on a laptop with two
GPUs, set vMix to **High performance** under **Settings → System → Display → Graphics**
in Windows, and keep the GPU driver up to date.

The render page detects vMix (and browsers without container-query support) and
switches to a pixel-based compatibility mode automatically.

---

## URL variants

| URL | Use |
|-----|-----|
| `/render` | **All widgets that are live** — recommended, one browser input |
| `/render?graphic=<id>` | **One widget** on its own input, positioned separately in OBS/vMix |

Copy a per-widget URL from the dashboard (`/control`): the **link icon** next to the
widget name. The **Combined render URL** button in the header copies `/render`.

Use **one** combined `/render` where you can — each browser input costs memory and
CPU.

### Main vs. solo

| Output | Flag | URL | Dashboard control |
|--------|------|-----|-------------------|
| Main (combined) | `visible` | `/render` | **Go live** |
| Solo (own layer) | `soloVisible` | `/render?graphic=<id>` | Solo button next to the link icon |

Main and solo are independent: a countdown can be live on its own vMix overlay while
the combined source shows the score bug. Companion has separate actions and feedbacks
for both (see [COMPANION.md](COMPANION.md)).

---

## Transparency

The render page sets `background: transparent` and `overflow: hidden` on `html` and
`body`. If you still see a white background:

1. Make sure you load the **render** URL, not `/control` or `/operator`.
2. Do not set a background colour on the input.
3. In OBS, restore the default Custom CSS of the Browser Source. In vMix, if your
   version supports custom CSS for Web Browser inputs, add:

```css
html, body {
  margin: 0;
  padding: 0;
  background-color: rgba(0, 0, 0, 0);
  overflow: hidden;
}
```

---

## Fonts

New projects use **Inter**, which ships with ProVerlay (`/public/shared/fonts/`), so
the render looks the same in OBS and vMix on macOS and Windows. Fonts that are only
installed on a computer differ per machine: SF Pro exists only on a Mac, Segoe UI only
on Windows, and a missing font silently falls back to another one. For a client font,
upload the font files as project assets (**Edit project → Assets**) so every machine
renders the same glyphs. Projects created before the switch keep their stored font;
set the font family to `'Inter', system-ui, sans-serif` (or pick **Inter (bundled)**
where a font menu is offered) to switch them.

---

## Resolution and positioning

| Setting | Advice |
|---------|--------|
| Browser width/height | Same as the ProVerlay canvas (default **1920×1080**) |
| Single widget (`?graphic=<id>`) | Can be smaller (e.g. a ticker at 1920×120); position it in OBS/vMix |
| Output resolution | Independent; the browser renders at the pixel size you set |

Do not upscale a smaller browser input — set the input size to the output size
instead, otherwise text gets blurry.

---

## Frame rate and animations

vMix renders Web Browser inputs at the **project frame rate** (25p, 50i, 60p, …); OBS
uses the FPS set on the Browser Source / canvas.

| Symptom | What to try |
|---------|-------------|
| Animations look half speed (seen with vMix on Windows at 25p) | Try a 50i/50p project, or simpler animations |
| Ticker stutters | Lower the ticker speed |
| Score animation too long | Lower the animation duration in the widget settings |

ProVerlay uses lightweight CSS animations and `transform`-based movement on purpose.

---

## Network and other machines

| Scenario | URL |
|----------|-----|
| OBS/vMix and ProVerlay on the **same** machine | `http://127.0.0.1:2014/render` |
| ProVerlay on **another** machine | `http://<ip-of-proverlay-machine>:2014/render` — allow ProVerlay in that machine's firewall (Windows: **Private networks**, see [USER-GUIDE.md](USER-GUIDE.md#windows-firewall-blocks-the-ipad-or-companion)) |

The dashboard shows the LAN addresses under **Project & network → Network**. The
operator iPad uses the same IP. ProVerlay has no authentication: only run it on a
network you trust (see [SECURITY.md](../SECURITY.md)).

---

## OBS vs. vMix

| Topic | OBS Browser Source | vMix Web Browser |
|-------|-------------------|------------------|
| Engine | CEF (Chromium) | CEF (Chromium) |
| Transparency | Default Custom CSS makes the body transparent | Relies on the page being transparent |
| Hidden source | "Shutdown source when not visible" option | Overlay off ≠ input stopped |
| Hardware acceleration | OBS advanced settings | vMix High Input Performance Mode |
| Per-widget URL | Same | Same |

ProVerlay needs no separate render code per host — only the setup differs.

---

## Performance tips

1. One browser input for the combined render.
2. Take widgets off air in ProVerlay instead of only closing the overlay in vMix/OBS —
   hidden widgets stop their timers.
3. Keep animations light; no video loops in the same input.
4. vMix: enable **High Input Performance Mode** if your GPU can handle it.
5. If memory grows over a long show, refresh the browser input.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| White background | Load `/render`, not `/control`; see [Transparency](#transparency) |
| Page does not load | Is ProVerlay running? Open `http://127.0.0.1:2014/api/state` in a browser. Use `127.0.0.1`, not `localhost` |
| Port in use or reserved (Windows) | See [USER-GUIDE.md → Port 2014 is already in use](USER-GUIDE.md#port-2014-is-already-in-use) |
| Text looks different on another machine | The project uses an installed font; see [Fonts](#fonts) |
| Graphics do not update | Firewall; same network; Socket.io (WebSocket) not blocked |
| Ticker/clock keeps running while the overlay is off | Take the widget off air in ProVerlay |
| Blurry text | Input width/height = output resolution; do not upscale |
| Scrollbars | Should not happen (`overflow: hidden` is built in); refresh the input |

---

## Related

- [USER-GUIDE.md](USER-GUIDE.md) — first start, projects, going live
- [COMPANION.md](COMPANION.md) — Stream Deck control (works alongside OBS/vMix)
