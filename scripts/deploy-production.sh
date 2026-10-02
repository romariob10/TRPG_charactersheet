#!/usr/bin/env bash
set -euo pipefail

# Serialize deployments; the production checkout must never run PR code.
: "${DEPLOY_SHA:?DEPLOY_SHA must be the verified main commit}"
[[ "$DEPLOY_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo 'Invalid deployment SHA.' >&2; exit 64; }
exec 9>"$(git rev-parse --git-dir)/mycharacter-deploy.lock"
flock -w 600 9
if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
  echo 'Production checkout has local changes; refusing to overwrite them.' >&2
  exit 1
fi
verify_main() {
  git fetch origin main:refs/remotes/origin/main
  [[ "$(git rev-parse refs/remotes/origin/main)" == "$DEPLOY_SHA" ]] || {
    echo 'Main has advanced; refusing an outdated deployment.' >&2
    return 1
  }
}
verify_main
previous_sha=$(git rev-parse HEAD)
git checkout --detach "$DEPLOY_SHA"
export MYCHARACTER_IMAGE_TAG="sha-$DEPLOY_SHA"
compose=(docker compose --env-file .env.prod -f compose.prod.yaml)
if ! "${compose[@]}" pull web api worker migrate; then
  git checkout --detach "$previous_sha"
  exit 1
fi
if ! verify_main; then
  git checkout --detach "$previous_sha"
  exit 1
fi
"${compose[@]}" up -d --no-build --remove-orphans --wait --wait-timeout 180
"${compose[@]}" ps
printf '%s\n' "$DEPLOY_SHA" > "$(git rev-parse --git-dir)/mycharacter-deployed-sha"
# Only untagged images and old build cache. Keep named rollback images and all volumes.
docker image prune -f --filter until=168h
docker builder prune -f --filter until=168h
