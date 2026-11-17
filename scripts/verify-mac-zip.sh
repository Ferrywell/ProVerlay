#!/usr/bin/env bash
# Verify a packaged Mac zip before it is published.
#
#   scripts/verify-mac-zip.sh dist/ProVerlay-mac-arm64.zip arm64 [expected-version]
#
# Checks: no AppleDouble (._) or __MACOSX entries, a single top-level ProVerlay.app,
# a valid code signature after extraction (codesign --verify --deep --strict), the
# bundled seed data, the main binary's architecture and (optionally) the app version.
set -euo pipefail

zip_path="${1:?usage: verify-mac-zip.sh <zip> <arm64|x64|universal> [version]}"
arch="${2:?usage: verify-mac-zip.sh <zip> <arm64|x64|universal> [version]}"
expected_version="${3:-}"

fail() {
  echo "verify-mac-zip: FAIL — $*" >&2
  exit 1
}

[ -f "$zip_path" ] || fail "$zip_path not found"

entries="$(zipinfo -1 "$zip_path")"

if grep -Eq '(^|/)\._|(^|/)__MACOSX/' <<<"$entries"; then
  grep -E '(^|/)\._|(^|/)__MACOSX/' <<<"$entries" | head -5 >&2
  fail "zip contains AppleDouble entries"
fi

top_level="$(cut -d/ -f1 <<<"$entries" | sort -u)"
[ "$top_level" = "ProVerlay.app" ] || fail "expected only ProVerlay.app at the top level, got: $top_level"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
ditto -x -k "$zip_path" "$work"
app="$work/ProVerlay.app"

codesign --verify --deep --strict "$app" || fail "codesign verification failed"

[ -f "$app/Contents/Resources/seed-data/registry.json" ] || fail "seed-data/registry.json missing"
[ -f "$app/Contents/Resources/app/package.json" ] || fail "app/package.json missing"

archs="$(lipo -archs "$app/Contents/MacOS/ProVerlay")"
case "$arch" in
  arm64) [ "$archs" = "arm64" ] || fail "expected arm64 binary, got: $archs" ;;
  x64) [ "$archs" = "x86_64" ] || fail "expected x86_64 binary, got: $archs" ;;
  universal)
    if ! grep -q arm64 <<<"$archs" || ! grep -q x86_64 <<<"$archs"; then
      fail "expected universal binary, got: $archs"
    fi
    ;;
  *) fail "unknown arch $arch" ;;
esac

if [ -n "$expected_version" ]; then
  version="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$app/Contents/Info.plist")"
  [ "$version" = "$expected_version" ] || fail "app version $version, expected $expected_version"
fi

signature="$(codesign -dv "$app" 2>&1 | grep -E '^(Signature|Authority)=' | head -1 || true)"
echo "verify-mac-zip: OK — $zip_path ($arch: $archs, ${signature:-unknown signature}, $(du -h "$zip_path" | cut -f1))"
