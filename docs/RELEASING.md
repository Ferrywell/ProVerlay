# Releasing ProVerlay

Releases are built and published by GitHub Actions
([`.github/workflows/release.yml`](../.github/workflows/release.yml)) when a version
tag is pushed. Nobody needs to build or upload a Mac app or Windows installer by hand.

## Cutting a release

1. **Prepare a pull request** that:
   - bumps `version` in `package.json` (and `package-lock.json`):
     `npm version 0.8.0 --no-git-tag-version`;
   - turns the **Unreleased** section of [CHANGELOG.md](../CHANGELOG.md) into
     `## [0.8.0] - YYYY-MM-DD`, adds a fresh empty `## [Unreleased]` above it and
     updates the compare links at the bottom.

   The test suite checks that the `package.json` version has a CHANGELOG section,
   and the PR build job (see below) builds the Windows installer, so a broken release PR fails
   before it is merged. `npm run changelog -- 0.8.0` shows the notes exactly as
   they will appear on the release page.
2. **Merge** the pull request into `main`.
3. **Tag the merge commit and push the tag:**

   ```bash
   git switch main && git pull
   git tag v0.8.0
   git push origin v0.8.0
   ```

4. The **Release** workflow then:
   1. checks that the tag (`v0.8.0`) matches `package.json` (`0.8.0`) — it stops
      otherwise;
   2. runs `npm test`, then builds the Apple Silicon and Intel apps one after the other
      on a single macOS runner (`npm run dist:mac` and `npm run dist:mac:x64`). GitHub's
      hosted macOS runners are often busy; needing only one keeps a release from being
      cancelled while it waits in the queue. If a run is cancelled anyway ("The job was not
      acquired by Runner"), re-run it from the Actions tab or with `gh run rerun <id>`;
      In parallel, a Windows runner runs `npm test` and builds the x64 installer
      (`npm run dist:win`), verifies it (`scripts/verify-win-installer.mjs`) and
      smoke-tests it (see [Windows](#windows) below);
   3. verifies each zip (`scripts/verify-mac-zip.sh`): no AppleDouble `._` entries,
      `codesign --verify --deep --strict` passes after unzipping, the seed data
      (`Contents/Resources/seed-data/registry.json`) is bundled, the binary has the
      right architecture and the app version matches;
   4. writes `SHA256SUMS.txt` and extracts the release notes from CHANGELOG.md
      (`scripts/changelog-section.mjs`);
   5. creates the GitHub release `v0.8.0` with those notes and assets — or, if the
      release already exists, replaces its assets (`gh release upload --clobber`)
      and leaves the notes alone.

   Tags with a suffix (`v0.8.0-beta.1`) are published as a **pre-release**; they
   need a matching `version` and CHANGELOG section too.

Follow the run under **Actions → Release**. The run summary shows the version, the
notes and the checksums.

## Release assets

| Asset | Contents |
|-------|----------|
| `ProVerlay-mac-arm64.zip` | `ProVerlay.app` for Apple Silicon (M1 and later) |
| `ProVerlay-mac-x64.zip` | `ProVerlay.app` for Intel Macs |
| `ProVerlay-win-x64-setup.exe` | Windows installer (x64, Windows 10 and later) |
| `SHA256SUMS.txt` | SHA-256 checksums of the zips and the installer |

These names are a contract: the in-app updater (`electron/updater.js`) looks for exactly
these assets on the latest release and checks the download against `SHA256SUMS.txt`.
Renaming one breaks updating for every installed copy. A release marked *pre-release*
is never offered as an update.

### Testing the in-app update

Build the app locally (`npm run dist:mac`), copy `dist/mac-arm64/ProVerlay.app` to a
folder you can write to and start it as an older version against its own data:

```bash
PROVERLAY_UPDATE_PRETEND_VERSION=0.0.1 PROVERLAY_USER_DATA_DIR=/tmp/pv-update-test PORT=2398 \
  /tmp/pv-update-test/ProVerlay.app/Contents/MacOS/ProVerlay
```

Preferences → Updates then offers the latest release; *Install and Restart* replaces
that copy and starts the new version. The helper's log is
`$TMPDIR/ProVerlay-update-<version>/install-update.log`.

Two separate zips rather than one universal app: each download is half the size, and
the Intel build is a plain `electron-builder --x64` run on the same Apple Silicon
runner (the app has no native modules, so nothing has to be compiled for x64).

## Verifying a download

```bash
cd ~/Downloads
shasum -a 256 -c --ignore-missing SHA256SUMS.txt
# ProVerlay-mac-arm64.zip: OK
```

Or compare `shasum -a 256 ProVerlay-mac-arm64.zip` by eye with the line in
`SHA256SUMS.txt`. On Windows (PowerShell):

```powershell
Get-FileHash ~\Downloads\ProVerlay-win-x64-setup.exe -Algorithm SHA256
```

## Gatekeeper (note for users)

Releases are **ad-hoc signed** and not notarized, so macOS blocks the app after
download. The first time, **right-click → Open → Open**. If macOS still refuses:

```bash
xattr -cr /Applications/ProVerlay.app
```

This applies to both Apple Silicon and Intel builds. Once Developer ID signing and
notarization are enabled (below), these steps are no longer needed.

## Re-running a release

- **A job failed** (flaky runner, network): use **Re-run failed jobs** on the
  workflow run.
- **Rebuild an existing tag** (for example after fixing the workflow on `main`):
  **Actions → Release → Run workflow**, enter the tag (`v0.8.0`). The build uses the
  code *at the tag* and the workflow file from `main`; the existing release keeps its
  notes and gets its assets replaced. Tick **dry run** to build and verify without
  touching the release — the zips are then available as workflow artifacts.
  This only works for tags that contain the release scripts, i.e. releases after
  v0.7.0 (v0.7.0 itself was built and uploaded by hand). Tags without the
  `dist:win` script (v0.8.0 and older) skip the Windows job and are republished
  with the Mac zips only.
- **The code itself was wrong**: do not move the tag. Fix it on `main` and release a
  new patch version.

## Pull request builds

Pull requests that touch `electron/`, `build/`, `scripts/`, `electron-builder.yml`,
`package.json`, `package-lock.json` or the workflow itself run the same build and
verification without publishing for the **Windows installer**, including its
install/uninstall smoke test. `ProVerlay-win-x64-setup.exe` is attached to the
workflow run as an artifact for 5 days (**Actions → the run → Artifacts**), so a
packaging change can be tried on a real PC before it is merged. Pull request builds are
never signed.

The **Mac build is skipped on pull requests**, and the CI tests run on Linux and Windows
only (macOS on a manual *Run workflow* of CI). GitHub's hosted macOS runners are often
out of capacity; a job that is never picked up is cancelled after about an hour and
reported as a failed run, with an email, although nothing failed. To check a Mac
packaging change before merging, build it locally (`npm run dist:mac`, see below); every
release tag builds and tests on macOS anyway.

## Building locally

```bash
npm run dist:mac        # → dist/ProVerlay-mac-arm64.zip
npm run dist:mac:x64    # → dist/ProVerlay-mac-x64.zip
bash scripts/verify-mac-zip.sh dist/ProVerlay-mac-arm64.zip arm64 "$(node -p "require('./package.json').version")"
npm run dist:win        # → dist/ProVerlay-win-x64-setup.exe (on Windows, macOS or Linux)
node scripts/verify-win-installer.mjs dist/ProVerlay-win-x64-setup.exe \
  --version "$(node -p "require('./package.json').version")" --app-dir dist/win-unpacked
```

The unsigned Windows installer cross-builds on macOS and Linux without Wine
(electron-builder downloads NSIS and edits the `.exe` resources itself). Running and
smoke-testing it needs Windows — see [Windows](#windows).

## Windows

### The installer

`ProVerlay-win-x64-setup.exe` is an NSIS installer built by electron-builder
([`electron-builder.yml`](../electron-builder.yml), `win` and `nsis` sections):

- **Per-user by default**, no administrator rights needed: it installs into
  `%LOCALAPPDATA%\Programs\ProVerlay`. The first page offers *Only for me* (default)
  or *Anyone who uses this computer* (asks for admin rights, installs into
  `C:\Program Files\ProVerlay`); the next page lets you change the folder.
- Desktop and Start-menu shortcuts named **ProVerlay**; *Run ProVerlay* on the
  last page.
- Uninstall via **Settings → Apps** or the Start menu. The uninstaller removes the
  program folder and shortcuts but **keeps projects and settings** in
  `%APPDATA%\proverlay\data` (the Electron user-data folder), so a reinstall or
  update picks them up again.
- Silent install for deployment: `ProVerlay-win-x64-setup.exe /S` (per-user; add
  `/allusers` from an elevated prompt for a machine-wide install, `/D=C:\path` to
  choose the folder — it must be the last argument).

The app icon is `build/icon.ico` (16, 24, 32, 48, 64, 128 and 256 px), generated from
`build/icon.png` by `npm run icon:win` (`scripts/generate-win-icon.mjs`). The `.ico`
is committed; `npm test` fails if it no longer matches `icon.png`, so after changing
the PNG run `npm run icon:win` and commit both.

### What CI checks

The `build (Windows x64)` job runs on `windows-latest`:

1. `npm ci`, `npm test`, `npm run dist:win`;
2. `scripts/verify-win-installer.mjs`: the installer exists, is between 40 and 400 MB,
   is a valid PE/NSIS executable, and its version resource says `ProVerlay` with the
   `package.json` version; in `dist/win-unpacked`, `ProVerlay.exe` is a 64-bit
   executable with the ProVerlay icon and version, and the server, templates,
   dependencies and seed data are bundled (and no dev dependencies);
3. `scripts/smoke-test-win-installer.ps1`:
   - **install**: silent per-user install, then the same folder check on the
     installed copy, the *Apps* (uninstall) registry entry and both shortcuts;
   - **server**: starts the installed server headless
     (`ELECTRON_RUN_AS_NODE=1 ProVerlay.exe resources\app\server\index.js`, port
     2014, a temporary `PROVERLAY_DATA_DIR`) and requires HTTP 200 from `/api/state`,
     `/control` and `/render`;
   - **gui**: starts `ProVerlay.exe` normally and waits for port 2014. This depends on
     the runner's desktop session, so it is **non-blocking** (a failure shows as a
     warning on the step, not a failed build);
   - **uninstall**: silent uninstall; the program folder, registry entry and
     shortcuts must be gone and the user-data folder must still exist.

The same script works on any Windows PC (PowerShell 7, Node 22, a checkout of the
repo, port 2014 free):

```powershell
npm ci; npm run dist:win
./scripts/smoke-test-win-installer.ps1 -Phase install -Version 0.8.0
./scripts/smoke-test-win-installer.ps1 -Phase server
./scripts/smoke-test-win-installer.ps1 -Phase gui
./scripts/smoke-test-win-installer.ps1 -Phase uninstall
```

### SmartScreen (note for users)

The installer is **not code-signed** yet, so Windows Defender SmartScreen warns
*"Windows protected your PC"* when it is opened. Click **More info → Run anyway**.
Some browsers (Edge, Chrome) may also flag the download as uncommon; choose
**Keep**. Once signing is enabled (below) the publisher shows as ProductionPro; a new
certificate still needs some download reputation before the warning disappears
completely.

### Enabling Windows code signing (later)

The workflow already contains the steps; they are skipped while the secrets below are
missing and never run on pull requests. When a signing method is configured,
electron-builder signs `ProVerlay.exe`, the uninstaller and the installer, and the
verify step additionally requires an Authenticode signature (`--require-signed`).
The job summary shows which mode was used (`none`, `pfx` or `azure`).

**Option A — certificate file (`.pfx`)** (OV/EV certificate exported with its key).
Repository secrets:

| Secret | Value |
|--------|-------|
| `WIN_CSC_LINK` | The `.pfx` file, base64-encoded (`base64 -i cert.pfx \| pbcopy`), or an `https://` link to it |
| `WIN_CSC_KEY_PASSWORD` | The `.pfx` password |

Certificates issued since mid-2023 live on a hardware token or in a cloud HSM and
cannot be exported as `.pfx`; use option B (or a custom `win.signtoolOptions.sign`
script for your HSM vendor) for those.

**Option B — Azure Trusted Signing** (takes precedence when both are configured).
Repository secrets for an Entra ID app registration with the *Trusted Signing
Certificate Profile Signer* role:

| Secret | Value |
|--------|-------|
| `AZURE_TENANT_ID` | Directory (tenant) ID |
| `AZURE_CLIENT_ID` | Application (client) ID |
| `AZURE_CLIENT_SECRET` | Client secret |

and repository **variables** (Settings → Secrets and variables → Actions →
Variables):

| Variable | Value |
|----------|-------|
| `AZURE_SIGNING_ENDPOINT` | Account endpoint, e.g. `https://weu.codesigning.azure.net` |
| `AZURE_SIGNING_ACCOUNT` | Trusted Signing account name |
| `AZURE_SIGNING_PROFILE` | Certificate profile name |
| `AZURE_SIGNING_PUBLISHER` | Publisher name exactly as in the certificate subject (CN), e.g. `ProductionPro` |

These are passed to electron-builder as `win.azureSignOptions` on the command line,
so `electron-builder.yml` needs no change. Test a signing setup with
**Run workflow** + **dry run** on an existing tag that includes the Windows build
(not v0.8.0 or older) before the next release. After the
first signed release, update the SmartScreen notes in the README, the user docs and
the website.

## Enabling Developer ID signing and notarization (later)

The workflow already contains the steps; they are skipped while the secrets below are
missing and never run on pull requests. With the secrets set, the release build
re-signs the app with the hardened runtime
([`build/entitlements.mac.plist`](../build/entitlements.mac.plist)), submits it to
Apple's notary service, staples the ticket and re-zips it. Users then no longer see
the Gatekeeper warning.

Add these as **repository secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
|--------|-------|
| `MAC_CERT_P12_BASE64` | The *Developer ID Application* certificate and private key, exported from Keychain Access as `.p12`, base64-encoded: `base64 -i cert.p12 \| pbcopy` |
| `MAC_CERT_PASSWORD` | The password chosen when exporting the `.p12` |
| `MAC_CODESIGN_IDENTITY` | The signing identity, e.g. `Developer ID Application: ProductionPro (TEAMID1234)` |
| `APPLE_ID` | Apple ID email of a member of the developer team |
| `APPLE_APP_SPECIFIC_PASSWORD` | An app-specific password for that Apple ID (appleid.apple.com → Sign-In and Security) |
| `APPLE_TEAM_ID` | The 10-character team ID |

The three `MAC_CERT_*`/`MAC_CODESIGN_IDENTITY` secrets switch on signing; the three
`APPLE_*` secrets additionally switch on notarization (signing without notarization
does not get past Gatekeeper, so set all six).

Signing is done by `scripts/package-mac-app.mjs`, which reads
`MAC_CODESIGN_IDENTITY`, `MAC_CODESIGN_KEYCHAIN` and `MAC_NOTARIZE_APPLE_ID`/
`MAC_NOTARIZE_PASSWORD`/`MAC_NOTARIZE_TEAM_ID`, so it can be tested locally with a
certificate in your login keychain:

```bash
npm run dist:mac
MAC_CODESIGN_IDENTITY="Developer ID Application: …" \
MAC_NOTARIZE_APPLE_ID=… MAC_NOTARIZE_PASSWORD=… MAC_NOTARIZE_TEAM_ID=… \
  node scripts/package-mac-app.mjs arm64
ditto -x -k dist/ProVerlay-mac-arm64.zip /tmp/pv-check
spctl --assess --type execute -vv /tmp/pv-check/ProVerlay.app   # "source=Notarized Developer ID"
```

After the first notarized release, update the Gatekeeper notes in the README,
[docs/APP.md](APP.md), [docs/USER-GUIDE.md](USER-GUIDE.md) and the website.
