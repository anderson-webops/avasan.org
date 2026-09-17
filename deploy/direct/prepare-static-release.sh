#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=deploy/direct/select-node.sh
source "$script_dir/select-node.sh"

release_root="${RELEASE_ROOT:-/srv/avasan.org/releases}"

if [[ $# -ne 1 ]]; then
  echo "Usage: prepare-static-release.sh /srv/avasan.org/releases/<release>" >&2
  exit 2
fi
if [[ ${EUID:-$(id -u)} -eq 0 ]]; then
  echo "Prepare releases as an unprivileged deployment user, not root." >&2
  exit 1
fi

release_root_real="$(realpath -e -- "$release_root")"
candidate="$(realpath -e -- "$1")"
case "$candidate/" in
  "$release_root_real/"*) ;;
  *) echo "Candidate must resolve beneath $release_root_real: $candidate" >&2; exit 1 ;;
esac

if [[ ! -f "$candidate/package-lock.json" ]] || ! git -C "$candidate" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Candidate must be a complete Git checkout with the committed root lockfile." >&2
  exit 1
fi
if [[ -n "$(git -C "$candidate" status --porcelain)" ]]; then
  echo "Candidate checkout must be clean before preparation." >&2
  exit 1
fi
if [[ "$(node --version)" != "v24.18.1" || "$(npm --version)" != "12.0.2" ]]; then
  echo "Preparation requires Node 24.18.1 and npm 12.0.2." >&2
  exit 1
fi

export AVASAN_RELEASE_REVISION AVASAN_RELEASE_VERSION
AVASAN_RELEASE_REVISION="$(git -C "$candidate" rev-parse HEAD)"
AVASAN_RELEASE_VERSION="$(node -p 'require(process.argv[1]).version' "$candidate/package.json")"
"$candidate/deploy/direct/verify-release-source.sh" \
  "$candidate" "$AVASAN_RELEASE_VERSION"

if [[ "$candidate" == "$release_root_real" ]]; then
  echo 'Candidate must be strictly beneath the release root.' >&2; exit 1
fi
# Build inputs must not include host/private environment files.
for directory in "$candidate" "$candidate/front-end"; do
  for env_file in "$directory"/.env "$directory"/.env.*; do
    [[ -e "$env_file" || -L "$env_file" ]] || continue
    [[ "${env_file##*/}" == .env.example ]] && continue
    echo 'Keep private environment files outside the release checkout.' >&2; exit 1
  done
done
export SOURCE_RELEASE_REQUIRED=1
cd -- "$candidate"
node scripts/write-release-metadata.mjs
npm ci --include=optional --strict-allow-scripts
npm run verify:native-bindings
npm run verify:dependency-graph
npm run audit
npm run audit:production
npm run audit:signatures
npm run lint
npm run typecheck
npm test
npm run build

node scripts/static-artifact.mjs create "$candidate"

echo "Prepared direct static release $candidate at $AVASAN_RELEASE_REVISION."
