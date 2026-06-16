#!/bin/sh
# Zip gesigneerde app als ProVerlay.app (staging in /tmp)
set -e
ARCH="${1:-arm64}"
SIGNED="dist/mac-${ARCH}/ProVerlay-signed.app"
ZIP="dist/ProVerlay-mac-${ARCH}.zip"
STAGE=$(mktemp -d)

if [ ! -d "$SIGNED" ]; then
  echo "zip-mac-app: $SIGNED not found" >&2
  exit 1
fi

cp -R -X "$SIGNED" "$STAGE/ProVerlay.app"
rm -f "$ZIP"
ditto -c -k --keepParent "$STAGE/ProVerlay.app" "$ZIP"
rm -rf "$STAGE"
echo "Created $ZIP ($(du -h "$ZIP" | cut -f1))"
