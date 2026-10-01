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
sandbox_source="$(mktemp -d /tmp/avasan-attested-promotion-XXXXXXXX)"
cleanup() {
  sudo rm -rf -- "$sandbox_source"
  rm -rf -- "$fixture"
}
trap cleanup EXIT
mkdir -p "$fixture/installed" "$fixture/stubs"
cp -R -- "$root/deploy" "$fixture/installed/deploy"
for binary in gh nginx curl systemctl sleep; do
  cp -- "$root/scripts/test-attested-promotion-stub.py" "$fixture/stubs/$binary"
  chmod 0755 "$fixture/stubs/$binary"
done
sudo cp -R -- "$fixture/installed" "$fixture/stubs" "$sandbox_source/"
sudo cp -- "$root/scripts/test-attested-promotion.py" "$sandbox_source/test.py"
sudo chown -R 0:0 -- "$sandbox_source"
sudo chmod 0755 -- "$sandbox_source" "$sandbox_source/installed" "$sandbox_source/stubs"
timeout -k 5 90 sudo bwrap --unshare-all --die-with-parent --new-session --uid 0 --gid 0 \
  --ro-bind /usr /usr --symlink usr/bin /bin --symlink usr/lib /lib \
  --tmpfs /usr/local --dir /usr/local/libexec \
  --ro-bind "$sandbox_source/installed" /usr/local/libexec/avasan.org \
  --ro-bind "$sandbox_source/stubs/gh" /usr/bin/gh \
  --ro-bind "$sandbox_source/stubs/nginx" /usr/sbin/nginx \
  --ro-bind "$sandbox_source/stubs/curl" /usr/bin/curl \
  --ro-bind "$sandbox_source/stubs/systemctl" /usr/bin/systemctl \
  --ro-bind "$sandbox_source/stubs/sleep" /usr/bin/sleep \
  --tmpfs /etc --dir /etc/nginx --dir /etc/nginx/snippets \
  --tmpfs /srv --proc /proc --dev /dev --tmpfs /tmp \
  --dir /source --ro-bind "$sandbox_source/test.py" /source/test.py \
  --clearenv --setenv PATH /usr/sbin:/usr/bin:/sbin:/bin --setenv HOME /tmp \
  --chdir /tmp /usr/bin/python3 -B /source/test.py
