#!/usr/bin/env bash
set -euo pipefail
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH

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

export AVASAN_RELEASE_REVISION="$(git -C "$candidate" rev-parse HEAD)"
export AVASAN_RELEASE_VERSION="$(node -p "require('$candidate/package.json').version")"
"$candidate/deploy/direct/verify-release-source.sh" \
  "$candidate" "$AVASAN_RELEASE_VERSION"

cd -- "$candidate"
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

node - <<'NODE'
import { readFileSync, writeFileSync } from 'node:fs'

const release = JSON.parse(readFileSync('front-end/.output/public/release.json', 'utf8'))
if (release.revision !== process.env.AVASAN_RELEASE_REVISION)
  throw new Error('Built release identity does not match the candidate commit.')
if (release.version !== process.env.AVASAN_RELEASE_VERSION)
  throw new Error('Built release version does not match the package version.')
writeFileSync('.avasan-static-release.json', `${JSON.stringify(release, null, 2)}\n`, { mode: 0o644 })
NODE

echo "Prepared direct static release $candidate at $AVASAN_RELEASE_REVISION."
