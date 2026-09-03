#!/usr/bin/env bash
# /mnt/E is NTFS (fuseblk, noexec) — npm binaries cannot run there.
# Sync project to an ext4 path and run the given npm script there.
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${ISTEATHAN_LINUX_DIR:-$HOME/work/isteathan}"
SCRIPT="${1:-vite:dev}"
shift || true

mkdir -p "$(dirname "$DEST")"

# If we are already inside the Linux working copy, just run the script.
if [[ "$SRC" == "$DEST" ]]; then
  cd "$DEST"
  env -u npm_config_devdir npm run "$SCRIPT" -- "$@"
  exit $?
fi

rsync -a --delete \
  --exclude node_modules \
  --exclude dist \
  --exclude .git \
  --exclude android/keystore \
  --exclude android/keystore.properties \
  --exclude android/app/build \
  --exclude apk \
  "$SRC/" "$DEST/"

if [[ -f "$SRC/.env" && "$SRC/.env" != "$DEST/.env" ]]; then
  cp "$SRC/.env" "$DEST/.env"
fi

cd "$DEST"

need_install=0
if [[ ! -x node_modules/.bin/vite ]]; then
  need_install=1
elif [[ package.json -nt node_modules || package-lock.json -nt node_modules ]]; then
  need_install=1
fi

if [[ "$need_install" -eq 1 ]]; then
  echo "Installing dependencies in $DEST ..."
  env -u npm_config_devdir npm install
  if [[ -f node_modules/esbuild/install.js ]]; then
    node node_modules/esbuild/install.js || true
  fi
fi

echo "Running npm run $SCRIPT in $DEST"
env -u npm_config_devdir npm run "$SCRIPT" -- "$@"
STATUS=$?

# Builds happen in $DEST, but the deployable output must land back in the
# workspace so it is the folder actually uploaded to hosting.
if [[ $STATUS -eq 0 && "$SCRIPT" == vite:build && -d "$DEST/dist" ]]; then
  rm -rf "$SRC/dist"
  rsync -a "$DEST/dist/" "$SRC/dist/"
  echo "Build copied to $SRC/dist"
fi

exit $STATUS
