#!/usr/bin/env bash
# Rebuilds devocionales/vendor/tailwind.css, the committed Tailwind output for /devocionales/.
# The CLI is installed from the lockfile in scripts/tailwind/ into a user cache directory (never
# into the repo, which has no package.json of its own), pinned to the v3 line the Play CDN served
# so the page renders identically. The lockfile pins every transitive dependency too, so a rebuild
# is byte-identical until the lockfile changes.
# Run it again whenever a Tailwind class is added or removed in the files listed in
# scripts/tailwind.config.cjs; CI rebuilds it and fails when the committed file is stale.
set -euo pipefail

cd "$(dirname "$0")/.."

LOCK_DIR="scripts/tailwind"
TAILWIND_VERSION="$(node -p "require('./${LOCK_DIR}/package.json').dependencies.tailwindcss")"
LOCK_SHA="$(node -p "require('node:crypto').createHash('sha256').update(require('node:fs').readFileSync('${LOCK_DIR}/package-lock.json')).digest('hex').slice(0, 16)")"
TOOLS_DIR="${TAILWIND_TOOLS_DIR:-${XDG_CACHE_HOME:-${HOME}/.cache}/develop4god/tailwind-${TAILWIND_VERSION}}"
BIN="${TOOLS_DIR}/node_modules/.bin/tailwindcss"
STAMP="${TOOLS_DIR}/.lock-sha"

# Reinstall when missing or installed from another lockfile, so a stale or damaged install is
# never trusted.
if [ ! -x "${BIN}" ] || [ "$(cat "${STAMP}" 2>/dev/null || true)" != "${LOCK_SHA}" ]; then
  rm -rf "${TOOLS_DIR}"
  mkdir -p "${TOOLS_DIR}"
  cp "${LOCK_DIR}/package.json" "${LOCK_DIR}/package-lock.json" "${TOOLS_DIR}/"
  (cd "${TOOLS_DIR}" && npm ci --silent --ignore-scripts)
  echo "${LOCK_SHA}" > "${STAMP}"
fi

"${BIN}" \
  --config scripts/tailwind.config.cjs \
  --input scripts/tailwind.input.css \
  --output devocionales/vendor/tailwind.css \
  --minify
