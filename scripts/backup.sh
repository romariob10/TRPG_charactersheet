#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${STORAGE_ROOT:?STORAGE_ROOT is required}"
: "${BACKUP_ROOT:?BACKUP_ROOT is required}"

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_path="$BACKUP_ROOT/$timestamp"
umask 077
mkdir -p "$BACKUP_ROOT"
if [ -e "$backup_path" ]; then
  echo "Backup destination already exists: $backup_path" >&2
  exit 73
fi
mkdir "$backup_path"

before_manifest="$backup_path/storage.before.json"
after_manifest="$backup_path/storage.after.json"
node /app/scripts/verify-storage.mjs --manifest "$before_manifest"

pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-acl \
  --file="$backup_path/database.dump"

tar -C "$STORAGE_ROOT" -cf "$backup_path/storage.tar" .
(
  cd "$STORAGE_ROOT"
  find . -type f -print0 | sort -z | xargs -0 -r sha256sum
) > "$backup_path/storage.sha256"

node /app/scripts/verify-storage.mjs --manifest "$after_manifest"
if ! cmp -s "$before_manifest" "$after_manifest"; then
  echo "Data changed while the backup was running. Stop application traffic and retry." >&2
  exit 75
fi

cat > "$backup_path/metadata.json" <<EOF
{
  "formatVersion": 1,
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "databaseFormat": "PostgreSQL custom",
  "storageFormat": "POSIX tar"
}
EOF
rm "$before_manifest" "$after_manifest"
(
  cd "$backup_path"
  sha256sum database.dump storage.tar storage.sha256 metadata.json > SHA256SUMS
)

echo "Backup completed: $backup_path"
