#!/usr/bin/env bash
# check-generated.sh: the one "generated files are up to date" check, run by CI and by
# scripts/validator.py. devocionales/vendor/tailwind.css, the manifests, devocionales/sw.js and the
# build stamp devocionales/js/devotional-build.js are committed (GitHub Pages has no build step).
# Rebuilds them, in this order because the worker's version hashes the stylesheet, and fails if
# any differs from what is committed. Uses `git status` rather than `git diff`, so a generated file
# that was never committed fails too. The first run may need the network: build-tailwind.sh
# installs the pinned Tailwind CLI into a user cache when it is missing.
set -euo pipefail

cd "$(dirname "$0")/.."

GENERATED=(
  devocionales/vendor/tailwind.css
  devocionales/manifests
  devocionales/sw.js
  devocionales/js/devotional-build.js
)

# The rebuild writes into the work tree: never overwrite edits that are not committed yet.
before="$(git status --porcelain -- "${GENERATED[@]}")"
if [ -n "${before}" ]; then
  echo "Generated files have uncommitted changes; commit or discard them first:"
  echo "${before}"
  exit 1
fi

bash scripts/build-tailwind.sh
node scripts/build-manifests.js
node scripts/build-sw.js

after="$(git status --porcelain -- "${GENERATED[@]}")"
if [ -n "${after}" ]; then
  echo "Generated files are stale or uncommitted. The rebuilt files are in your work tree; commit them."
  echo "${after}"
  exit 1
fi
