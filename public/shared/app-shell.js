// Runs synchronously in <head>, before the stylesheets, so the page paints
// in the right theme and with the right window chrome on the first frame.
// Not loaded by /render (that page stays transparent and theme-less).
;(function () {
  var root = document.documentElement
  var ua = navigator.userAgent || ''

  // ProVerlay desktop app (Electron) uses a hidden title bar: the app header
  // becomes the window drag area (see tahoe.css `.is-electron`). Only macOS
  // draws traffic lights inside the page, so only there do we reserve space.
  if (ua.indexOf('Electron') !== -1) {
    root.classList.add('is-electron')
    if (/Macintosh|Mac OS X/.test(ua)) root.classList.add('is-macos')
  }

  // Theme: "system" (default) follows prefers-color-scheme; "light" / "dark"
  // force it via data-theme on <html>. Stored per device.
  var theme = 'system'
  try {
    theme = localStorage.getItem('pv-theme') || 'system'
  } catch (e) {
    /* storage blocked (private mode) */
  }
  if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme)
})()
