#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "$0")/.." && pwd)
cd -- "$root"
test "$(uname -s)" = Linux
test "$(uname -m)" = aarch64
test "$(node --version)" = v24.18.1
test "$(npm --version)" = 12.0.2
test -z "$(git status --porcelain)"
output=$(realpath "${1:?Pass an empty owned output directory under .ai-work/runs}")
case "$output/" in "$root/.ai-work/runs/"*) ;; *) exit 1;; esac
test -z "$(find "$output" -mindepth 1 -maxdepth 1 -print -quit)"
export SOURCE_RELEASE_REQUIRED=1
node scripts/write-release-metadata.mjs
node scripts/static-artifact.mjs create "$root"
commit=$(git rev-parse HEAD)
version=$(node -p 'require("./package.json").version')
stage="$output/stage"
mkdir -p "$stage/front-end/.output" "$stage/deploy/nginx"
cp -R front-end/.output/public "$stage/front-end/.output/"
cp deploy/nginx/http-maps.conf deploy/nginx/server-policy.conf "$stage/deploy/nginx/"
cp .avasan-static-artifact.json .avasan-static-release.json "$stage/"
node scripts/static-artifact.mjs runtime "$stage" "$root/.avasan-static-artifact.json" "$commit"
archive="$output/avasan-v$version-${commit:0:12}-static.tar.gz"
tar -czf "$archive" -C "$stage" .avasan-static-artifact.json .avasan-static-release.json front-end deploy
sha=$(sha256sum "$archive" | cut -d ' ' -f 1)
printf '%s  %s\n' "$sha" "$(basename "$archive")" > "$output/SHA256SUMS"
cp .avasan-static-artifact.json "$output/static-artifact.json"
mkdir "$output/unpacked"
python3 -B - "$archive" "$output/unpacked" "$sha" <<'PY'
import hashlib, sys, tarfile
from pathlib import Path
archive = Path(sys.argv[1])
assert hashlib.sha256(archive.read_bytes()).hexdigest() == sys.argv[3]
with tarfile.open(archive) as source:
    assert all(item.isdir() or item.isfile() for item in source.getmembers())
    source.extractall(sys.argv[2], filter='data')
PY
node scripts/static-artifact.mjs runtime "$output/unpacked" "$output/static-artifact.json" "$commit"
bash scripts/test-promotion-recovery.sh
bash scripts/test-unpacked-static.sh "$output/unpacked"
cp -R "$output/unpacked" "$output/copied"
node scripts/static-artifact.mjs runtime "$output/copied" "$output/static-artifact.json" "$commit"
bash scripts/test-unpacked-static.sh "$output/copied"
rm -- "$output/copied/front-end/.output/public/favicon.svg"
if node scripts/static-artifact.mjs runtime "$output/copied" "$output/static-artifact.json" "$commit"; then
  echo 'Missing required asset was incorrectly accepted' >&2; exit 1
fi
python3 -B - "$output" "$archive" "$commit" "$sha" <<'PY'
import datetime, hashlib, json, sys
from pathlib import Path
output, archive = Path(sys.argv[1]), Path(sys.argv[2])
receipt = {"commit": sys.argv[3], "archive": archive.name, "sha256": sys.argv[4], "bytes": archive.stat().st_size,
           "acceptedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
           "checks": ["required paths and hashes", "exact annotated identity", "static-only archive", "isolated unpacked routes and assets", "copied artifact", "missing-asset rejection", "isolated root promotion fault injection"],
           "harnessSha256": {name: hashlib.sha256(Path(name).read_bytes()).hexdigest() for name in [
               "deploy/static-artifact.json", "deploy/nginx/default.conf", "deploy/nginx/http-maps.conf", "deploy/nginx/server-policy.conf", "scripts/release-identity.mjs", "scripts/static-artifact.mjs", "scripts/package-static-release.sh", "scripts/test-unpacked-static.sh", "scripts/static-preview-server.mjs", "scripts/static-deployment-smoke.mjs", "scripts/test-static-artifact.mjs", "scripts/test-promotion-recovery.sh", "scripts/test-promotion-recovery.py", "deploy/direct/promote-static-release.sh", "deploy/direct/select-node.sh", "deploy/direct/verify-release-source.sh", "deploy/direct/verify-nginx-snippet-dump.sh"]}}
(output / "acceptance.json").write_text(json.dumps(receipt, indent=2) + "\n")
PY
echo "Accepted exact static artifact: $archive"
