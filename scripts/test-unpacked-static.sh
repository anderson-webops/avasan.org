#!/usr/bin/env bash
set -euo pipefail
root=$(realpath "${1:?Pass an exact unpacked artifact}")
scripts=$(cd -- "$(dirname -- "$0")" && pwd)
node=$(realpath "$(command -v node)")
test "$(id -u)" -ne 0
test "$(uname -s)" = Linux
test "$(uname -m)" = aarch64
test "$(node --version)" = v24.18.1
node "$scripts/static-artifact.mjs" runtime "$root"
timeout -k 5 60 bwrap --unshare-all --die-with-parent --new-session \
  --ro-bind /usr /usr --symlink usr/bin /bin --symlink usr/lib /lib \
  --ro-bind "$node" /runtime/node --proc /proc --dev /dev --tmpfs /tmp \
  --ro-bind "$root" /app \
  --ro-bind /etc/nginx/mime.types /etc/nginx/mime.types \
  --ro-bind "$scripts/../deploy/nginx/default.conf" /harness/nginx-server.conf \
  --ro-bind "$scripts/test-static-artifact.mjs" /harness/test-static-artifact.mjs \
  --clearenv --setenv PATH /runtime:/usr/bin:/bin --setenv HOME /tmp \
  --chdir /app /runtime/node /harness/test-static-artifact.mjs
node "$scripts/static-artifact.mjs" runtime "$root"
