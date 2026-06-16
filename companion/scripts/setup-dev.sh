#!/usr/bin/env bash
set -euo pipefail

MODULE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEV_DIR="${COMPANION_DEV_PATH:-$HOME/companion-module-dev}"
LINK_PATH="$DEV_DIR/companion-module-proverlay"

mkdir -p "$DEV_DIR"
ln -sfn "$MODULE_DIR" "$LINK_PATH"

cd "$MODULE_DIR"
npm install

echo ""
echo "Developer module klaar:"
echo "  Symlink: $LINK_PATH -> $MODULE_DIR"
echo ""
echo "In Companion Launcher:"
echo "  1. Open Companion Launcher (niet de web-UI)"
echo "  2. Klik op het tandwiel → Advanced"
echo "  3. Developer modules path: $DEV_DIR"
echo "  4. Herstart Companion"
echo "  5. Voeg connection 'ProVerlay' toe (Module Version: Dev)"
echo ""
