#!/usr/bin/env bash
# install-hooks.sh — symlinks tracked hook scripts into .git/hooks/.
# Run once per clone: ./scripts/install-hooks.sh
set -e
cd "$(git rev-parse --show-toplevel)"
ln -sf ../../scripts/pre-push .git/hooks/pre-push
chmod +x scripts/pre-push
echo "Installed pre-push hook -> scripts/validator.py"
