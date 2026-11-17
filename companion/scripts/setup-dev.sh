#!/usr/bin/env bash
# Kept for `npm run setup-dev`; the cross-platform logic lives in setup-dev.mjs
# (copies the module by default, `--link` for a symlink). See companion/README.md.
set -euo pipefail

exec node "$(cd "$(dirname "$0")" && pwd)/setup-dev.mjs" "$@"
