#!/usr/bin/env bash
# check-generated.sh: the one "generated files are up to date" check, run by CI and by
# scripts/validator.py. devocionales/vendor/tailwind.css, the manifests, devocionales/sw.js and the
# build stamp devocionales/js/devotional-build.js are committed (GitHub Pages has no build step).
#
# Read-only, and checks what is committed: it exports a commit (`git archive`) into a temp
# directory and runs the read-only checks there, so uncommitted edits neither block nor fool it, a
# generated file that was never committed fails, and the work tree is never written. Tailwind has no
# --check mode, so it is built to a temp file and compared.
# Which commit: with --pushed-refs (the pre-push hook) it reads the pushed refs from stdin ("<local ref> <local sha>
# <remote ref> <remote sha>" per line; deletions are skipped) and checks every pushed sha; with no
# flag, or no refs on stdin (a manual or CI run), it checks HEAD. Stdin is only read when asked, so
# a CI step with an idle open pipe can never hang here.
# The first run may need the network: build-tailwind.sh installs the pinned Tailwind CLI into a user
# cache when it is missing.
set -euo pipefail

cd "$(dirname "$0")/.."

REBUILD='bash scripts/build-tailwind.sh && node scripts/build-manifests.js && node scripts/build-sw.js'
CSS=devocionales/vendor/tailwind.css

shas=()
if [ "${1:-}" = --pushed-refs ]; then
  while read -r _local_ref local_sha _rest; do
    case "${local_sha}" in
      '' | *[!0]*) [ -n "${local_sha}" ] && shas+=("${local_sha}") ;;  # all zeros = deletion
    esac
  done
fi
[ "${#shas[@]}" -gt 0 ] || shas=("$(git rev-parse HEAD)")

TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT

stale=0
for sha in "${shas[@]}"; do
  dir="${TMP}/${sha}"
  mkdir -p "${dir}"
  git archive "${sha}" | tar -x -C "${dir}"
  echo "Checking generated files at ${sha}"
  (
    cd "${dir}"
    failed=0
    if ! bash scripts/build-tailwind.sh "${dir}/tailwind.check.css"; then
      echo "${CSS}: the Tailwind build failed." >&2
      failed=1
    elif ! cmp -s "${dir}/tailwind.check.css" "${CSS}"; then
      echo "${CSS} out of date." >&2
      failed=1
    fi
    node scripts/build-manifests.js --check || failed=1
    node scripts/build-sw.js --check || failed=1
    exit "${failed}"
  ) || stale=1
done

if [ "${stale}" -ne 0 ]; then
  echo "Committed generated files are stale, missing or could not be built. Rebuild, commit and push:" >&2
  echo "  ${REBUILD}" >&2
  exit 1
fi
echo "Generated files are up to date."
