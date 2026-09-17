#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "$0")/.." && pwd)
node=$(realpath "$(command -v node)")
test "$(uname -s)" = Linux
test "$(id -u)" -ne 0
test "$(node --version)" = v24.18.1
# UID 0 exists only inside this disposable namespace. No host state is mounted writable.
timeout -k 5 90 bwrap --unshare-all --die-with-parent --new-session --uid 0 --gid 0 \
  --ro-bind /usr /usr --symlink usr/bin /bin --symlink usr/lib /lib \
  --ro-bind "$node" /runtime/node --proc /proc --dev /dev --tmpfs /tmp \
  --ro-bind "$root/deploy" /source/deploy --ro-bind "$root/scripts" /source/scripts \
  --ro-bind "$root/package.json" /source/package.json \
  --clearenv --setenv PATH /runtime:/usr/bin:/bin --setenv HOME /tmp \
  --chdir /tmp /usr/bin/python3 -B /source/scripts/test-promotion-recovery.py
