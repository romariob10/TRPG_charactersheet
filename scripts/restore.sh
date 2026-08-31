#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${STORAGE_ROOT:?STORAGE_ROOT is required}"
: "${BACKUP_PATH:?BACKUP_PATH is required}"

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

if [ ! -f "$BACKUP_PATH/SHA256SUMS" ]; then
  echo "Backup is incomplete: SHA256SUMS is missing." >&2
  exit 66
fi
if find "$STORAGE_ROOT" -mindepth 1 -print -quit | grep -q .; then
  echo "Restore refused: target PDF storage is not empty." >&2
  exit 65
fi
if [ "$(psql "$DATABASE_URL" --no-psqlrc --tuples-only --no-align --command "select to_regclass('public.users') is null")" != "t" ]; then
  echo "Restore refused: target database is not empty." >&2
  exit 65
fi

(
  cd "$BACKUP_PATH"
  sha256sum --check SHA256SUMS
)

pg_restore \
  --dbname="$DATABASE_URL" \
  --no-owner \
  --no-acl \
  --exit-on-error \
  "$BACKUP_PATH/database.dump"
tar -C "$STORAGE_ROOT" -xf "$BACKUP_PATH/storage.tar"
(
  cd "$STORAGE_ROOT"
  sha256sum --check "$BACKUP_PATH/storage.sha256"
)
node "$script_dir/verify-storage.mjs"

echo "Restore completed and verified."
