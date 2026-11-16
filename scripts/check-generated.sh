#!/usr/bin/env bash
# check-generated.sh: the one "generated files are up to date" check, run by CI and by
# scripts/validator.py. devocionales/vendor/tailwind.css, the manifests, devocionales/sw.js and the
# build stamp devocionales/js/devotional-build.js are committed (GitHub Pages has no build step).
#
# Read-only, and checks what is committed: it exports HEAD (`git archive`) into a temp directory
# and runs the read-only checks there, so uncommitted edits neither block nor fool it, a generated
# file that was never committed fails, and the work tree is never written. Tailwind has no --check
# mode, so it is built to a temp file and compared. The first run may need the network:
# build-tailwind.sh installs the pinned Tailwind CLI into a user cache when it is missing.
set -euo pipefail

cd "$(dirname "$0")/.."

REBUILD='bash scripts/build-tailwind.sh && node scripts/build-manifests.js && node scripts/build-sw.js'
CSS=devocionales/vendor/tailwind.css

TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT
git archive HEAD | tar -x -C "${TMP}"
cd "${TMP}"

stale=0
bash scripts/build-tailwind.sh "${TMP}/tailwind.check.css"
if ! cmp -s "${TMP}/tailwind.check.css" "${CSS}"; then
  echo "${CSS} out of date." >&2
  stale=1
fi
node scripts/build-manifests.js --check || stale=1
node scripts/build-sw.js --check || stale=1

if [ "${stale}" -ne 0 ]; then
  echo "Committed generated files (at HEAD) are stale or missing. Rebuild, commit and push:" >&2
  echo "  ${REBUILD}" >&2
  exit 1
fi
echo "Generated files at HEAD are up to date."
