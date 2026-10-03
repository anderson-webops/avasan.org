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
mkdir -p "$fixture/installed" "$fixture/stubs" "$fixture/legacy"
cp -R -- "$root/deploy" "$fixture/installed/deploy"
git -C "$root" show v1.2.12:deploy/static-artifact.json > "$fixture/legacy/contract.json"
git -C "$root" show v1.2.12:deploy/nginx/http-maps.conf > "$fixture/legacy/http-maps.conf"
git -C "$root" show v1.2.12:deploy/nginx/server-policy.conf > "$fixture/legacy/server-policy.conf"
gh api --header 'Accept: application/octet-stream' \
  repos/anderson-webops/avasan.org/releases/assets/602110313 \
  > "$fixture/legacy/avasan-v1.2.12-d696406b0531-static.tar.gz"
gh api --header 'Accept: application/octet-stream' \
  repos/anderson-webops/avasan.org/releases/assets/602110314 \
  > "$fixture/legacy/static-artifact.json"
test "$(sha256sum "$fixture/legacy/contract.json" | cut -d ' ' -f 1)" = b1d26c68826b7f7034169a7acf13267f042f3a116181943cde75c6482895044b
test "$(sha256sum "$fixture/legacy/http-maps.conf" | cut -d ' ' -f 1)" = d2e95bda927a9ccb8f0bb963aa7b048eb2a27575491a17720f97ef2c7eeb718a
test "$(sha256sum "$fixture/legacy/server-policy.conf" | cut -d ' ' -f 1)" = 47543fa3a2efe19b0b514a9c028058ef28c955195e201308bcde0e31c0fa8eb0
test "$(sha256sum "$fixture/legacy/avasan-v1.2.12-d696406b0531-static.tar.gz" | cut -d ' ' -f 1)" = d2ceb57706c1b5f163a723353a2f8af594a754a0ef2b7c2114b435a4b0c502f9
test "$(sha256sum "$fixture/legacy/static-artifact.json" | cut -d ' ' -f 1)" = 9c46331f51490878a607293a021ce40123f4df6b8b335d1c91be6b93e6bc22af
printf '\n' >> "$fixture/installed/deploy/nginx/http-maps.conf"
printf '\n' >> "$fixture/installed/deploy/nginx/server-policy.conf"
for binary in gh nginx curl systemctl sleep; do
  cp -- "$root/scripts/test-attested-promotion-stub.py" "$fixture/stubs/$binary"
  chmod 0755 "$fixture/stubs/$binary"
done
sudo cp -R -- "$fixture/installed" "$fixture/stubs" "$fixture/legacy" "$sandbox_source/"
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
  --dir /source --dir /source/legacy --ro-bind "$sandbox_source/legacy" /source/legacy \
  --ro-bind "$sandbox_source/test.py" /source/test.py \
  --clearenv --setenv PATH /usr/sbin:/usr/bin:/sbin:/bin --setenv HOME /tmp \
  --chdir /tmp /usr/bin/python3 -B /source/test.py
