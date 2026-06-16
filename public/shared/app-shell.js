// Detecteert of de pagina in de ProVerlay desktop-app (Electron) draait.
// De app gebruikt een verborgen titelbalk; de paginakop wordt dan het
// sleepgebied van het venster (zie tahoe.css `.is-electron`).
if (navigator.userAgent.includes('Electron')) {
  document.documentElement.classList.add('is-electron')
}
