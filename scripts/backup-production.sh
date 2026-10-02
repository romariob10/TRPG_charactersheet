#!/usr/bin/env bash
set -euo pipefail
umask 077
backup_root=${BACKUP_ROOT:-/home/user/backups/mycharacter}
container_prefix=${CONTAINER_PREFIX:-mycharacter-production}
mkdir -p "$backup_root"
chmod 700 "$backup_root"
exec 9>"$backup_root/.backup.lock"
flock -w 300 9
staging=$(mktemp -d "$backup_root/.incomplete.XXXXXXXX")
trap 'rm -rf -- "$staging"' EXIT
# Credentials stay inside the PostgreSQL container and never reach logs.
docker exec "${container_prefix}-postgres-1" sh -c 'pg_dump --format=custom --no-owner --no-acl -U "$POSTGRES_USER" -d "$POSTGRES_DB"' > "$staging/database.dump"
docker exec -i "${container_prefix}-postgres-1" pg_restore --list < "$staging/database.dump" > /dev/null
docker exec "${container_prefix}-api-1" tar -C /var/lib/mycharacter/pdfs -cf - . > "$staging/storage.tar"
(cd "$staging" && sha256sum database.dump storage.tar > SHA256SUMS)
backup_path="$backup_root/mycharacter-$(date -u +%Y%m%dT%H%M%SZ)"
[[ ! -e "$backup_path" ]] || { echo 'Backup already exists.' >&2; exit 1; }
mv "$staging" "$backup_path"
trap - EXIT
# Rotate only directories created by this script, never unrelated backups.
find "$backup_root" -mindepth 1 -maxdepth 1 -type d -name 'mycharacter-20??????T??????Z' -mtime +14 -exec rm -rf -- {} +
printf 'Production backup completed: %s\n' "$backup_path"
