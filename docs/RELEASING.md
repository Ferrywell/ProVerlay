# Releasing ProVerlay

Releases are built and published by GitHub Actions
([`.github/workflows/release.yml`](../.github/workflows/release.yml)) when a version
tag is pushed. Nobody needs to build or upload a Mac app by hand.

## Cutting a release

1. **Prepare a pull request** that:
   - bumps `version` in `package.json` (and `package-lock.json`):
     `npm version 0.8.0 --no-git-tag-version`;
   - turns the **Unreleased** section of [CHANGELOG.md](../CHANGELOG.md) into
     `## [0.8.0] - YYYY-MM-DD`, adds a fresh empty `## [Unreleased]` above it and
     updates the compare links at the bottom.

   The test suite checks that the `package.json` version has a CHANGELOG section,
   and the PR build job (see below) builds the app, so a broken release PR fails
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
| `SHA256SUMS.txt` | SHA-256 checksums of both zips |

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
`SHA256SUMS.txt`.

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
  v0.7.0 (v0.7.0 itself was built and uploaded by hand).
- **The code itself was wrong**: do not move the tag. Fix it on `main` and release a
  new patch version.

## Pull request builds

Pull requests that touch `electron/`, `build/`, `scripts/`, `electron-builder.yml`,
`package.json`, `package-lock.json` or the workflow itself run the same build and
verification without publishing. The zips are attached to the workflow run as
artifacts for 5 days (**Actions → the run → Artifacts**), so a packaging change can
be tried on a real Mac before it is merged.

## Building locally

```bash
npm run dist:mac        # → dist/ProVerlay-mac-arm64.zip
npm run dist:mac:x64    # → dist/ProVerlay-mac-x64.zip
bash scripts/verify-mac-zip.sh dist/ProVerlay-mac-arm64.zip arm64 "$(node -p "require('./package.json').version")"
```

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
