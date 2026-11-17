<#
.SYNOPSIS
  Smoke test for the Windows installer: install, run, uninstall.

.DESCRIPTION
  Runs on a Windows machine (the release workflow's windows-latest job, or by hand):

    pwsh scripts/smoke-test-win-installer.ps1 -Phase install   -Installer dist\ProVerlay-win-x64-setup.exe -Version 0.8.0
    pwsh scripts/smoke-test-win-installer.ps1 -Phase server    -Version 0.8.0
    pwsh scripts/smoke-test-win-installer.ps1 -Phase gui
    pwsh scripts/smoke-test-win-installer.ps1 -Phase uninstall

  install    silent per-user install (/S /currentuser); checks the install folder
             (scripts/verify-win-installer.mjs --app-dir), the uninstall registry entry
             and the desktop + Start-menu shortcuts.
  server     starts the installed app's server headless
             (ELECTRON_RUN_AS_NODE=1 ProVerlay.exe resources\app\server\index.js) with a
             temporary PROVERLAY_DATA_DIR and checks /control, /render and /api/state.
  gui        starts ProVerlay.exe normally (it runs the server in-process) and checks
             that the port answers. Needs an interactive desktop session.
  uninstall  silent uninstall; checks that the program folder and the shortcuts are
             gone and that user data in %APPDATA% is kept.

  Use a machine without a previous ProVerlay installation, or expect the install
  phase to upgrade it.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [ValidateSet('install', 'server', 'gui', 'uninstall')]
  [string] $Phase,
  [string] $Installer = 'dist\ProVerlay-win-x64-setup.exe',
  [string] $Version = '',
  [int] $Port = 2014,
  [int] $TimeoutSeconds = 60
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$InstallDir = Join-Path $env:LOCALAPPDATA 'Programs\ProVerlay'
$AppExe = Join-Path $InstallDir 'ProVerlay.exe'
$DesktopLink = Join-Path ([Environment]::GetFolderPath('Desktop')) 'ProVerlay.lnk'
$StartMenuLink = Join-Path ([Environment]::GetFolderPath('Programs')) 'ProVerlay.lnk'
$LogDir = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [IO.Path]::GetTempPath() }
$RepoRoot = Split-Path -Parent $PSScriptRoot

function Step([string] $message) { Write-Host "smoke-test: $message" }
function Fail([string] $message) { throw "smoke-test: FAIL - $message" }

function Get-UninstallEntry {
  Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue |
    Where-Object { $_.PSObject.Properties['DisplayName'] -and $_.DisplayName -like 'ProVerlay*' } |
    Select-Object -First 1
}

function Wait-Http([string[]] $paths, [System.Diagnostics.Process] $process) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  foreach ($path in $paths) {
    $url = "http://127.0.0.1:$Port/$path"
    while ($true) {
      if ($process -and $process.HasExited) { Fail "process exited with code $($process.ExitCode) before $url answered" }
      try {
        $res = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
        if ($res.StatusCode -eq 200) {
          Step "GET $url -> 200 ($($res.RawContentLength) bytes)"
          break
        }
        Step "GET $url -> $($res.StatusCode)"
      } catch {
        # not up yet
      }
      if ((Get-Date) -gt $deadline) { Fail "$url did not answer 200 within $TimeoutSeconds s" }
      Start-Sleep -Milliseconds 500
    }
  }
}

function Stop-App {
  Get-Process -Name 'ProVerlay' -ErrorAction SilentlyContinue | ForEach-Object {
    Step "stopping ProVerlay.exe (pid $($_.Id))"
    & taskkill.exe /PID $_.Id /T /F | Out-Null
  }
  Start-Sleep -Seconds 1
}

function Assert-PortFree {
  $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if ($listener) { Fail "port $Port is already in use (pid $($listener[0].OwningProcess))" }
}

function Show-Log([string] $file) {
  if (Test-Path $file) {
    Write-Host "----- $file -----"
    Get-Content $file -Tail 40 | ForEach-Object { Write-Host $_ }
  }
}

switch ($Phase) {
  'install' {
    $setup = (Resolve-Path $Installer).Path
    Step "installing $setup (silent, per-user)"
    $p = Start-Process -FilePath $setup -ArgumentList '/S', '/currentuser' -Wait -PassThru
    if ($p.ExitCode -ne 0) { Fail "installer exited with code $($p.ExitCode)" }
    if (-not (Test-Path $AppExe)) { Fail "$AppExe not found after install" }
    Step "installed to $InstallDir"
    Get-ChildItem $InstallDir | Format-Table Name, Length -AutoSize | Out-String | Write-Host
    Get-ChildItem (Join-Path $InstallDir 'resources') | Format-Table Name -AutoSize | Out-String | Write-Host

    $verifyArgs = @((Join-Path $RepoRoot 'scripts\verify-win-installer.mjs'), '--app-dir', $InstallDir)
    if ($Version) { $verifyArgs += @('--version', $Version) }
    & node @verifyArgs
    if ($LASTEXITCODE -ne 0) { Fail 'installed app folder failed verification' }

    $entry = Get-UninstallEntry
    if (-not $entry) { Fail 'no ProVerlay entry under HKCU\...\Uninstall' }
    Step "uninstall entry: $($entry.DisplayName) $($entry.DisplayVersion) by $($entry.Publisher)"
    if ($Version -and $entry.DisplayVersion -ne $Version) { Fail "DisplayVersion $($entry.DisplayVersion), expected $Version" }

    foreach ($link in @($DesktopLink, $StartMenuLink)) {
      if (-not (Test-Path $link)) { Fail "shortcut $link missing" }
      Step "shortcut $link"
    }
  }

  'server' {
    if (-not (Test-Path $AppExe)) { Fail "$AppExe not found - run the install phase first" }
    Assert-PortFree
    $dataDir = Join-Path $LogDir 'proverlay-smoke-data'
    Remove-Item $dataDir -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Path $dataDir | Out-Null
    $server = Join-Path $InstallDir 'resources\app\server\index.js'
    $out = Join-Path $LogDir 'proverlay-server.out.log'
    $err = Join-Path $LogDir 'proverlay-server.err.log'

    $env:ELECTRON_RUN_AS_NODE = '1'
    $env:PORT = "$Port"
    $env:PROVERLAY_DATA_DIR = $dataDir
    Step "starting $AppExe $server (ELECTRON_RUN_AS_NODE, PORT=$Port, data in $dataDir)"
    $p = Start-Process -FilePath $AppExe -ArgumentList "`"$server`"" -PassThru -NoNewWindow `
      -RedirectStandardOutput $out -RedirectStandardError $err
    Remove-Item Env:ELECTRON_RUN_AS_NODE, Env:PORT, Env:PROVERLAY_DATA_DIR
    try {
      Wait-Http @('api/state', 'control', 'render') $p
      $state = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/state" -TimeoutSec 5
      Step "api/state keys: $(($state.PSObject.Properties.Name | Select-Object -First 12) -join ', ')"
      if (-not (Test-Path (Join-Path $dataDir 'registry.json'))) { Fail "server did not create $dataDir\registry.json" }
    } finally {
      & taskkill.exe /PID $p.Id /T /F | Out-Null
      Show-Log $out
      Show-Log $err
    }
  }

  'gui' {
    if (-not (Test-Path $AppExe)) { Fail "$AppExe not found - run the install phase first" }
    Assert-PortFree
    Step "launching $AppExe (GUI)"
    $p = Start-Process -FilePath $AppExe -PassThru
    try {
      Wait-Http @('api/state', 'control') $p
      Step 'GUI app serves the dashboard'
      $userData = Get-ChildItem $env:APPDATA -Directory | Where-Object { $_.Name -like 'proverlay' }
      if ($userData) { Step "user data folder: $($userData.FullName)" }
    } finally {
      Stop-App
    }
  }

  'uninstall' {
    Stop-App
    $uninstaller = Join-Path $InstallDir 'Uninstall ProVerlay.exe'
    if (-not (Test-Path $uninstaller)) { Fail "$uninstaller not found" }
    $userDataBefore = @(Get-ChildItem $env:APPDATA -Directory | Where-Object { $_.Name -like 'proverlay' })
    Step "uninstalling (silent): $uninstaller"
    # The NSIS uninstaller copies itself to %TEMP% and exits early; poll for the result.
    $p = Start-Process -FilePath $uninstaller -ArgumentList '/S', '/currentuser' -Wait -PassThru
    if ($p.ExitCode -ne 0) { Fail "uninstaller exited with code $($p.ExitCode)" }
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Test-Path $AppExe) -or (Get-UninstallEntry)) {
      if ((Get-Date) -gt $deadline) { Fail "app or uninstall entry still present $TimeoutSeconds s after uninstall" }
      Start-Sleep -Milliseconds 500
    }
    Step "program files removed ($InstallDir)"
    foreach ($link in @($DesktopLink, $StartMenuLink)) {
      if (Test-Path $link) { Fail "shortcut $link still present" }
    }
    Step 'shortcuts removed'
    foreach ($dir in $userDataBefore) {
      if (-not (Test-Path $dir.FullName)) { Fail "user data $($dir.FullName) was deleted by the uninstaller" }
      Step "user data kept: $($dir.FullName)"
    }
  }
}

Step "$Phase OK"
