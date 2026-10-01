#!/bin/bash
set -euo pipefail
PATH=/usr/sbin:/usr/bin:/sbin:/bin
export PATH
unset NODE_OPTIONS NODE_PATH PYTHONHOME PYTHONPATH
umask 077

trusted_root=/usr/local/libexec/avasan.org
trusted_script="$trusted_root/deploy/direct/promote-attested-release.sh"
artifact_tool="$trusted_root/deploy/direct/verified-static-artifact.py"
snippet_gate="$trusted_root/deploy/direct/verify-nginx-snippet-dump.sh"
base=/srv/avasan.org
release_root="$base/artifact-releases"
incoming_root="$base/artifact-incoming"
recovery_root="$base/.deployment-recovery"
current_link="$base/current"
snippet_root=/etc/nginx/snippets
maps_target="$snippet_root/avasan.org-http-maps.conf"
policy_target="$snippet_root/avasan.org-server-policy.conf"
site_origin=https://avasan.org

if [[ $# -ne 6 ]]; then
  echo 'Usage: promote-attested-release.sh <protected-archive> <protected-attestation> <sha256> <commit> <version> <expected-current-commit>' >&2
  exit 2
fi
if [[ ${EUID:-$(id -u)} -ne 0 || "$(realpath -e -- "$0")" != "$trusted_script" ]]; then
  echo 'Run only the separately installed root-owned Avasan promoter.' >&2
  exit 1
fi

archive="$1"
bundle="$2"
archive_sha="$3"
commit="$4"
version="$5"
expected_current="$6"
if [[ "$archive" != "$incoming_root/"* || "$bundle" != "$incoming_root/"* \
  || ! "$archive_sha" =~ ^[0-9a-f]{64}$ || ! "$commit" =~ ^[0-9a-f]{40}$ \
  || ! "$expected_current" =~ ^[0-9a-f]{40}$ \
  || ! "$version" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
  echo 'Pass protected absolute artifact paths and exact lowercase release identities.' >&2
  exit 1
fi
if [[ "$(basename -- "$archive")" != "avasan-v$version-${commit:0:12}-static.tar.gz" ]]; then
  echo 'Artifact filename differs from the exact source identity.' >&2
  exit 1
fi

/usr/bin/python3 -I -B - "$trusted_root" "$base" "$release_root" "$incoming_root" \
  "$recovery_root" "$snippet_root" "$archive" "$bundle" "$maps_target" "$policy_target" <<'PY'
import os
from pathlib import Path
import stat
import sys

for raw in sys.argv[1:]:
    if not raw.startswith('/') or any(part in ('.', '..') for part in raw.split('/')):
        raise SystemExit('Host update required: unsafe administrative path')
    path = Path(raw)
    for item in (path, *path.parents):
        metadata = item.lstat()
        if (stat.S_ISLNK(metadata.st_mode) or metadata.st_uid != 0
                or metadata.st_mode & 0o022
                or not (stat.S_ISDIR(metadata.st_mode) or stat.S_ISREG(metadata.st_mode))):
            raise SystemExit('Host update required: mutable administrative path')
for path in Path(sys.argv[1]).rglob('*'):
    metadata = path.lstat()
    if (stat.S_ISLNK(metadata.st_mode) or metadata.st_uid != 0
            or metadata.st_mode & 0o022
            or not (stat.S_ISDIR(metadata.st_mode) or stat.S_ISREG(metadata.st_mode))):
        raise SystemExit('Host update required: mutable installed helper')
PY

for executable in /usr/bin/python3 /usr/bin/gh /usr/bin/timeout /usr/bin/curl \
  /usr/sbin/nginx /usr/bin/systemctl; do
  if [[ ! -x "$executable" ]]; then
    echo "Host update required: missing $executable" >&2
    exit 1
  fi
done
for directory in "$release_root" "$incoming_root" "$recovery_root"; do
  if [[ ! -d "$directory" || -L "$directory" ]]; then
    echo "Host update required: missing protected directory $directory" >&2
    exit 1
  fi
done
if [[ "$(stat -c '%s' "$archive")" -gt 134217728 \
  || "$(stat -c '%s' "$bundle")" -gt 8388608 ]]; then
  echo 'Release artifact or attestation exceeds the reviewed size bound.' >&2
  exit 1
fi
if [[ "$(stat -c '%u:%a' "$release_root")" != '0:755' \
  || "$(stat -c '%u:%a' "$incoming_root")" != '0:700' \
  || "$(stat -c '%u:%a' "$recovery_root")" != '0:700' ]]; then
  echo 'Host update required: protected directory mode or ownership differs.' >&2
  exit 1
fi
if [[ ! -L "$current_link" || ! -f "$maps_target" || ! -f "$policy_target" ]]; then
  echo 'Host update required: sealed current release or Nginx policies are absent.' >&2
  exit 1
fi
/usr/sbin/nginx -t

exec 9>"$recovery_root/promotion.lock"
if ! /usr/bin/flock -n 9; then
  echo 'Another Avasan promotion is active.' >&2
  exit 1
fi
if /usr/bin/find "$recovery_root" -maxdepth 1 -type f -name 'promotion-state-*' -print -quit | /usr/bin/grep -q .; then
  echo 'A protected recovery record requires operator review before another activation.' >&2
  exit 1
fi

previous_target="$(readlink -f -- "$current_link")"
case "$previous_target/" in
  "$release_root/"*) ;;
  *) echo 'Host update required: current release is not a sealed artifact.' >&2; exit 1 ;;
esac
if [[ "$previous_target" == "$release_root" ]]; then
  echo 'Host update required: current release points at the artifact root.' >&2
  exit 1
fi
if [[ "$(dirname -- "$previous_target")" != "$release_root" ]]; then
  echo 'Host update required: retained release is not a direct protected child.' >&2
  exit 1
fi
previous_version="$(/usr/bin/timeout --signal=KILL 30s /usr/bin/python3 -I -B "$artifact_tool" \
  verify --retained "$previous_target" "$expected_current")"
if ! /usr/bin/cmp -s "$previous_target/deploy/nginx/http-maps.conf" "$maps_target" \
  || ! /usr/bin/cmp -s "$previous_target/deploy/nginx/server-policy.conf" "$policy_target"; then
  echo 'Host update required: active Nginx policy differs from the sealed rollback artifact.' >&2
  exit 1
fi

candidate="$release_root/$commit-${archive_sha:0:16}"
candidate_temp=''
backup_directory=''
state_record=''
next_link="${current_link}.next.$$"
maps_next="${maps_target}.next.$$"
policy_next="${policy_target}.next.$$"
response_file="$(mktemp)"
headers_file="$(mktemp)"
nginx_dump="$(mktemp)"
mutation_started=false
finished=false
rollback_failed=false

cleanup() {
  [[ ! -L "$next_link" ]] || /usr/bin/unlink -- "$next_link"
  /usr/bin/rm -f -- "$maps_next" "$policy_next" "$response_file" "$headers_file" "$nginx_dump"
  if [[ -n "$candidate_temp" && -d "$candidate_temp" ]]; then
    /usr/bin/chmod -R u+rwX -- "$candidate_temp" 2>/dev/null || true
    /usr/bin/rm -rf -- "$candidate_temp"
  fi
  if [[ "$rollback_failed" == false ]]; then
    if [[ -n "$state_record" ]]; then /usr/bin/rm -f -- "$state_record"; fi
    if [[ -n "$backup_directory" ]]; then
      /usr/bin/rm -f -- "$backup_directory/http-maps.conf" "$backup_directory/server-policy.conf"
      /usr/bin/rmdir -- "$backup_directory"
    fi
  fi
}

activate_target() {
  local target="$1"
  if [[ -L "$next_link" ]]; then /usr/bin/unlink -- "$next_link" || return 1; fi
  /usr/bin/ln -s -- "$target" "$next_link" && /usr/bin/mv -Tf -- "$next_link" "$current_link"
}

restore_snippet() {
  local backup="$1" target="$2" next="$3"
  /usr/bin/cp -p -- "$backup" "$next" && /usr/bin/mv -Tf -- "$next" "$target"
}

probe_release() {
  local target="$1" strict="$2" address status attempt
  for ((attempt = 1; attempt <= 20; attempt += 1)); do
    local complete=true
    for address in '127.0.0.1' '[::1]'; do
      if ! /usr/bin/curl --noproxy '*' --silent --show-error --fail --max-time 5 \
        --resolve "avasan.org:443:$address" "$site_origin/release.json" \
        --output "$response_file" \
        || ! /usr/bin/cmp -s "$target/front-end/.output/public/release.json" "$response_file"; then
        complete=false; break
      fi
      status="$(/usr/bin/curl --noproxy '*' --silent --show-error --max-time 5 \
        --resolve "avasan.org:443:$address" --output "$response_file" \
        --dump-header "$headers_file" --write-out '%{http_code}' "$site_origin/")" || { complete=false; break; }
      if [[ "$status" != 200 ]]; then complete=false; break; fi
      if [[ "$strict" == true ]] && {
        ! /usr/bin/grep -Eiq '^Cross-Origin-Opener-Policy:[[:space:]]*same-origin' "$headers_file" \
          || ! /usr/bin/grep -Eiq '^Cross-Origin-Resource-Policy:[[:space:]]*same-origin' "$headers_file";
      }; then complete=false; break; fi
      status="$(/usr/bin/curl --noproxy '*' --silent --show-error --max-time 5 \
        --resolve "avasan.org:443:$address" --output "$response_file" \
        --write-out '%{http_code}' "$site_origin/__avasan-deployment-probe-missing")" || { complete=false; break; }
      if [[ "$status" != 404 ]] || ! /usr/bin/grep -Fq 'Page not found' "$response_file"; then
        complete=false; break
      fi
    done
    if [[ "$complete" == true ]]; then return 0; fi
    /usr/bin/sleep 1
  done
  return 1
}

rollback() {
  local failed=0
  restore_snippet "$backup_directory/http-maps.conf" "$maps_target" "$maps_next" || failed=1
  restore_snippet "$backup_directory/server-policy.conf" "$policy_target" "$policy_next" || failed=1
  activate_target "$previous_target" || failed=1
  if [[ "$failed" == 0 ]] \
    && /usr/bin/timeout --signal=KILL 30s /usr/bin/python3 -I -B "$artifact_tool" \
      verify --retained "$previous_target" "$expected_current" "$previous_version" >/dev/null \
    && /usr/bin/cmp -s "$previous_target/deploy/nginx/http-maps.conf" "$maps_target" \
    && /usr/bin/cmp -s "$previous_target/deploy/nginx/server-policy.conf" "$policy_target" \
    && /usr/sbin/nginx -t && /usr/bin/systemctl reload nginx \
    && probe_release "$previous_target" true; then
    echo 'Restored and verified the sealed previous Avasan release.' >&2
    return 0
  fi
  return 1
}

on_exit() {
  local status=$?
  trap - EXIT HUP INT TERM
  if [[ "$mutation_started" == true && "$finished" != true ]]; then
    if ! rollback; then
      rollback_failed=true
      echo "CRITICAL: protected rollback evidence retained at $backup_directory and $state_record" >&2
    fi
    if [[ "$status" == 0 ]]; then status=1; fi
  fi
  cleanup
  exit "$status"
}
trap on_exit EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

/usr/bin/timeout --signal=KILL 60s /usr/bin/env -u GH_TOKEN -u GITHUB_TOKEN \
  GH_CONFIG_DIR="$recovery_root/gh-config" /usr/bin/gh attestation verify "$archive" \
  --repo anderson-webops/avasan.org --bundle "$bundle" \
  --signer-workflow anderson-webops/avasan.org/.github/workflows/release-source.yml \
  --source-digest "$commit" --source-ref "refs/tags/v$version" \
  --deny-self-hosted-runners >/dev/null

candidate_temp="$(/usr/bin/mktemp -d "$release_root/.candidate-XXXXXXXX")"
/usr/bin/timeout --signal=KILL 30s /usr/bin/python3 -I -B "$artifact_tool" \
  unpack "$archive" "$archive_sha" "$commit" "$version" "$candidate_temp" >/dev/null
if [[ -e "$candidate" || -L "$candidate" ]]; then
  /usr/bin/timeout --signal=KILL 30s /usr/bin/python3 -I -B "$artifact_tool" \
    verify "$candidate" "$commit" "$version" >/dev/null
  /usr/bin/cmp -s "$candidate/.avasan-static-artifact.json" "$candidate_temp/.avasan-static-artifact.json" \
    || { echo 'Existing sealed release differs from the attested archive.' >&2; exit 1; }
else
  /usr/bin/mv -- "$candidate_temp" "$candidate"
  candidate_temp=''
fi

backup_directory="$(/usr/bin/mktemp -d "$recovery_root/avasan-XXXXXXXX")"
/usr/bin/cp -p -- "$maps_target" "$backup_directory/http-maps.conf"
/usr/bin/cp -p -- "$policy_target" "$backup_directory/server-policy.conf"
state_record="$(/usr/bin/mktemp "$recovery_root/promotion-state-XXXXXXXX")"
/usr/bin/printf '%s\n%s\n%s\n' "$previous_target" "$candidate" "$commit" >"$state_record"
mutation_started=true

/usr/bin/install -o 0 -g 0 -m 0644 -- "$candidate/deploy/nginx/http-maps.conf" "$maps_next"
/usr/bin/mv -Tf -- "$maps_next" "$maps_target"
/usr/bin/install -o 0 -g 0 -m 0644 -- "$candidate/deploy/nginx/server-policy.conf" "$policy_next"
/usr/bin/mv -Tf -- "$policy_next" "$policy_target"
if ! /usr/bin/cmp -s "$candidate/deploy/nginx/http-maps.conf" "$maps_target" \
  || ! /usr/bin/cmp -s "$candidate/deploy/nginx/server-policy.conf" "$policy_target" \
  || ! /usr/sbin/nginx -T >"$nginx_dump" 2>&1 \
  || ! "$snippet_gate" "$nginx_dump" "$maps_target" "$policy_target" \
  || ! /usr/sbin/nginx -t \
  || ! activate_target "$candidate" \
  || ! /usr/bin/systemctl reload nginx \
  || ! probe_release "$candidate" true; then
  echo 'Candidate activation failed; restoring the sealed previous release.' >&2
  exit 1
fi

finished=true
echo "Promoted attested immutable Avasan artifact $commit after IPv4/IPv6 acceptance."
