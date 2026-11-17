; Custom NSIS hooks, picked up automatically by electron-builder (nsis.include
; defaults to build/installer.nsh).

; "Start ProVerlay at login" is written by the app itself through
; app.setLoginItemSettings(), so the uninstaller doesn't know about it. Remove the
; Run entry on a real uninstall, but not when the old version is uninstalled as part
; of an update (the setting must survive updates).
!macro customUnInstall
  ${ifNot} ${isUpdated}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "nl.productionpro.proverlay"
  ${endIf}
!macroend
