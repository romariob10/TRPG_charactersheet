#!/bin/sh
set -eu

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "SUPABASE_DB_URL is required. Copy a Direct connection or Session pooler URI from Supabase Connect." >&2
  exit 64
fi

MIGRATIONS_DIR=${MIGRATIONS_DIR:-/migrations}
export PGCONNECT_TIMEOUT=${PGCONNECT_TIMEOUT:-15}

psql "$SUPABASE_DB_URL" --no-psqlrc --set ON_ERROR_STOP=1 --quiet <<'SQL'
create schema if not exists mycharacter_internal;
revoke all on schema mycharacter_internal from public, anon, authenticated;
create table if not exists mycharacter_internal.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);
SQL

found=false
for migration in "$MIGRATIONS_DIR"/*.sql; do
  [ -f "$migration" ] || continue
  found=true
  filename=$(basename "$migration")
  version=${filename%%_*}
  case "$version" in
    ''|*[!0-9]*)
      echo "Invalid migration filename: $filename" >&2
      exit 65
      ;;
  esac

  applied=$(psql "$SUPABASE_DB_URL" --no-psqlrc --tuples-only --no-align --quiet \
    --command "select 1 from mycharacter_internal.schema_migrations where version = '$version'")
  if [ "$applied" = "1" ]; then
    echo "Skipping already applied migration $filename"
    continue
  fi

  echo "Applying migration $filename"
  {
    printf '%s\n' 'begin;'
    sed -n '1,$p' "$migration"
    printf "insert into mycharacter_internal.schema_migrations(version) values ('%s');\n" "$version"
    printf '%s\n' 'commit;'
  } | psql "$SUPABASE_DB_URL" --no-psqlrc --set ON_ERROR_STOP=1
done

if [ "$found" = false ]; then
  echo "No migration files found in $MIGRATIONS_DIR" >&2
  exit 66
fi

psql "$SUPABASE_DB_URL" --no-psqlrc --set ON_ERROR_STOP=1 --quiet \
  --command "notify pgrst, 'reload schema';"
echo "Database migrations are up to date."
