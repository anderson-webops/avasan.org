#!/usr/bin/env bash
set -euo pipefail
root="$(cd -- "$(dirname -- "$0")/.." && pwd -P)"
if [[ "$(uname -s)" != Linux ]]; then
  echo 'Attested promotion integration runs on the isolated Linux CI runner.'
  exit 0
fi
if [[ "$(id -u)" -eq 0 ]]; then
  echo 'Run the fixture as the CI user, never against a live host.' >&2
  exit 1
fi
printf '\n/.ai-work/\n' >> "$(git -C "$root" rev-parse --git-path info/exclude)"
mkdir -p "$root/.ai-work/runs"
git -C "$root" check-ignore -q .ai-work/runs
fixture="$(mktemp -d "$root/.ai-work/runs/attested-promotion-XXXXXXXX")"
cleanup() {
  sudo chmod -R u+rwX -- "$fixture" 2>/dev/null || true
  sudo rm -rf -- "$fixture"
}
trap cleanup EXIT
mkdir -p "$fixture/installed" "$fixture/stubs"
sudo cp -R -- "$root/deploy" "$fixture/installed/deploy"
for binary in gh nginx curl systemctl sleep; do
  cp -- "$root/scripts/test-attested-promotion-stub.py" "$fixture/stubs/$binary"
  chmod 0755 "$fixture/stubs/$binary"
done
sudo chown -R 0:0 -- "$fixture/installed" "$fixture/stubs"
timeout -k 5 90 sudo bwrap --unshare-all --die-with-parent --new-session --uid 0 --gid 0 \
  --ro-bind /usr /usr --symlink usr/bin /bin --symlink usr/lib /lib \
  --tmpfs /usr/local --dir /usr/local/libexec \
  --ro-bind "$fixture/installed" /usr/local/libexec/avasan.org \
  --ro-bind "$fixture/stubs/gh" /usr/bin/gh \
  --ro-bind "$fixture/stubs/nginx" /usr/sbin/nginx \
  --ro-bind "$fixture/stubs/curl" /usr/bin/curl \
  --ro-bind "$fixture/stubs/systemctl" /usr/bin/systemctl \
  --ro-bind "$fixture/stubs/sleep" /usr/bin/sleep \
  --tmpfs /etc --dir /etc/nginx --dir /etc/nginx/snippets \
  --tmpfs /srv --proc /proc --dev /dev --tmpfs /tmp \
  --dir /source --ro-bind "$root/scripts/test-attested-promotion.py" /source/test.py \
  --clearenv --setenv PATH /usr/sbin:/usr/bin:/sbin:/bin --setenv HOME /tmp \
  --chdir /tmp /usr/bin/python3 -B /source/test.py
