#!/usr/bin/env bash
# Publish origin/main to t3lluz.com/ytmq: build the app, the YouTube Music
# bridge and the extension (Chrome zip, signed Firefox .xpi), swap the new build in at once, and restart
# the server when its code moved.
#
# ytmq-deploy.timer runs this every minute; it does nothing unless main has
# moved. Run it by hand any time; --force rebuilds regardless.
#
# The whole script is one function, called on the last line, so bash has
# read all of it before `git reset` can rewrite this very file.
set -euo pipefail

main() {
  local home="${YTMQ_HOME:-$HOME/docker/ytmq}"
  local repo="$home/repo" build="$home/build" branch=main
  local force="${1:-}"
  local -a compose=(docker compose -f "$repo/deploy/server/compose.yml" --project-directory "$home")

  cd "$home"
  exec 9>"$home/.deploy.lock"
  flock -n 9 || exit 0

  git -C "$repo" fetch --quiet origin "$branch"
  local old new sha current
  old=$(git -C "$repo" rev-parse HEAD)
  new=$(git -C "$repo" rev-parse "origin/$branch")
  sha=${new:0:7}
  current=$(readlink "$build/current" 2>/dev/null || true)
  if [[ "$current" == "site-$sha" && "$force" != "--force" ]]; then
    exit 0
  fi
  # A build that failed stays failed until main moves again.
  if [[ "$(cat "$home/.failed" 2>/dev/null)" == "$new" && "$force" != "--force" ]]; then
    exit 0
  fi

  if ! git -C "$repo" cat-file -e "$new:deploy/server/compose.yml" 2>/dev/null; then
    echo "origin/$branch ($sha) has no deploy/server; leaving ${current:-nothing} in place"
    exit 0
  fi

  git -C "$repo" reset --quiet --hard "$new"
  git -C "$repo" clean --quiet -fd -e node_modules

  if ! build_site "$repo" "$sha"; then
    echo "$new" >"$home/.failed"
    echo "build of $sha failed; ${current:-nothing} stays live" >&2
    exit 1
  fi
  rm -f "$home/.failed"
  sign_firefox "$home" "$repo"

  local stage="$build/.site-$sha.tmp"
  rm -rf "$stage" "$build/site-$sha"
  cp -a "$repo/dist" "$stage"
  echo "$new" >"$stage/version.txt"
  mv "$stage" "$build/site-$sha"
  ln -sfn "site-$sha" "$build/.current.tmp"
  mv -T "$build/.current.tmp" "$build/current"

  # Keep the three newest builds; older ones only take space.
  ls -1dt "$build"/site-* | tail -n +4 | xargs -r rm -rf

  # Recreates the container only if compose.yml changed.
  "${compose[@]}" up -d --remove-orphans --quiet-pull

  # The server holds its code in memory: restart it when that code moved.
  if [[ "$old" != "$new" ]] && ! git -C "$repo" diff --quiet "$old" "$new" -- server; then
    "${compose[@]}" restart ytmq
    echo "restarted ytmq (server code changed)"
  fi

  echo "deployed $sha"
}

# build_site REPO SHA: npm ci when the lockfile moved, then the full build.
build_site() {
  local repo="$1"
  local stamp="$repo/node_modules/.lock-sha"
  local lock_sha
  lock_sha=$(sha1sum "$repo/package-lock.json" | cut -d' ' -f1)
  if [[ "$(cat "$stamp" 2>/dev/null)" != "$lock_sha" ]]; then
    (cd "$repo" && npm ci --no-audit --no-fund --loglevel=error) || return 1
    echo "$lock_sha" >"$stamp"
  fi
  (
    cd "$repo"
    export VITE_PUBLIC_SITE_URL=https://t3lluz.com/ytmq
    npm run --silent build >/dev/null &&
      node scripts/verify-dist-bridge.mjs >/dev/null
  )
}

# sign_firefox HOME REPO: have Mozilla sign the Firefox build, or keep the
# last signed one. Keys live in HOME/amo.env (AMO_JWT_ISSUER, AMO_JWT_SECRET).
# Never fails the deploy: Chrome and the app do not depend on it.
sign_firefox() {
  local home="$1" repo="$2"
  (
    if [[ -f "$home/amo.env" ]]; then
      set -a
      # shellcheck disable=SC1091
      source "$home/amo.env"
      set +a
    fi
    cd "$repo"
    YTMQ_FIREFOX_DIR="$home/firefox" timeout 20m node scripts/sign-firefox.mjs
  ) || echo "firefox signing did not finish; the last signed build stays up" >&2
}

main "$@"
exit
