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
echo "Developer module ready:"
echo "  Symlink: $LINK_PATH -> $MODULE_DIR"
echo ""
echo "In the Companion Launcher:"
echo "  1. Open the Companion Launcher (not the web UI)"
echo "  2. Click the cog icon → Advanced"
echo "  3. Developer modules path: $DEV_DIR"
echo "  4. Restart Companion"
echo "  5. Add a 'ProVerlay' connection (Module Version: Dev)"
echo ""
