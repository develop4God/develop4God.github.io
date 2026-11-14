#!/usr/bin/env bash
# Rebuilds devocionales/vendor/tailwind.css, the committed Tailwind output for /devocionales/.
# The CLI is installed into a user cache directory (never into the repo, which has no package.json),
# pinned to the v3 line the Play CDN served so the page renders identically. The Tailwind 3 CLI
# bundles autoprefixer, cssnano and its browser data, so tailwindcss and postcss are the only
# versions that can change the output; both are pinned here.
# Run it again whenever a Tailwind class is added or removed in the files listed in
# scripts/tailwind.config.cjs; CI rebuilds it and fails when the committed file is stale.
set -euo pipefail

TAILWIND_VERSION="3.4.19"
POSTCSS_VERSION="8.5.33"
TOOLS_DIR="${TAILWIND_TOOLS_DIR:-${XDG_CACHE_HOME:-${HOME}/.cache}/develop4god/tailwind-${TAILWIND_VERSION}}"
BIN="${TOOLS_DIR}/node_modules/.bin/tailwindcss"

installed_version() {
  node -p "require('${TOOLS_DIR}/node_modules/tailwindcss/package.json').version" 2>/dev/null || true
}

# Reinstall when missing or at another version, so a stale or damaged install is never trusted.
if [ ! -x "${BIN}" ] || [ "$(installed_version)" != "${TAILWIND_VERSION}" ]; then
  rm -rf "${TOOLS_DIR}"
  mkdir -p "${TOOLS_DIR}"
  (cd "${TOOLS_DIR}" && npm install --no-save --silent "tailwindcss@${TAILWIND_VERSION}" "postcss@${POSTCSS_VERSION}")
fi

cd "$(dirname "$0")/.."
"${BIN}" \
  --config scripts/tailwind.config.cjs \
  --input scripts/tailwind.input.css \
  --output devocionales/vendor/tailwind.css \
  --minify
