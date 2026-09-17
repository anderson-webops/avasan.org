#!/usr/bin/env bash
set -euo pipefail
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=deploy/direct/select-node.sh
source "$script_dir/select-node.sh"

release_root="${RELEASE_ROOT:-/srv/avasan.org/releases}"
current_link="${CURRENT_LINK:-/srv/avasan.org/current}"
host_header="${HOST_HEADER:-avasan.org}"
site_origin="${SITE_ORIGIN:-https://$host_header}"
health_url="${HEALTH_URL:-$site_origin/release.json}"
resolve_address="${RESOLVE_ADDRESS:-127.0.0.1}"
resolve_address_ipv6="${RESOLVE_ADDRESS_IPV6:-[::1]}"
snippet_root="${NGINX_SNIPPET_ROOT:-/etc/nginx/snippets}"
maps_target="$snippet_root/avasan.org-http-maps.conf"
policy_target="$snippet_root/avasan.org-server-policy.conf"

if [[ $# -ne 1 ]]; then
  echo "Usage: promote-static-release.sh /srv/avasan.org/releases/<prepared-release>" >&2
  exit 2
fi
if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "Run promotion with root privileges." >&2
  exit 1
fi

release_root_real="$(realpath -e -- "$release_root")"
candidate="$(realpath -e -- "$1")"
case "$candidate/" in
  "$release_root_real/"*) ;;
  *) echo "Candidate must resolve beneath $release_root_real: $candidate" >&2; exit 1 ;;
esac

for required_file in front-end/.output/public/index.html front-end/.output/public/404.html front-end/.output/public/release.json .avasan-static-release.json deploy/direct/verify-release-source.sh deploy/direct/verify-nginx-snippet-dump.sh deploy/nginx/http-maps.conf deploy/nginx/server-policy.conf; do
  if [[ ! -f "$candidate/$required_file" ]] || [[ -L "$candidate/$required_file" ]]; then
    echo "Prepared release is missing $required_file." >&2
    exit 1
  fi
done
if find "$candidate/front-end/.output/public" -type l -print -quit | grep -q .; then
  echo "Prepared public output must not contain symbolic links." >&2
  exit 1
fi
if ! git -C "$candidate" diff --quiet -- . \
  || ! git -C "$candidate" diff --cached --quiet -- .; then
  echo "Prepared release has tracked source changes after preparation." >&2
  exit 1
fi
node "$script_dir/../../scripts/static-artifact.mjs" verify "$candidate" "${ARTIFACT_MANIFEST:-$candidate/.avasan-static-artifact.json}" "$(git -C "$candidate" rev-parse HEAD)"
release_version="$(node -p 'require(process.argv[1]).version' "$candidate/package.json")"
"$candidate/deploy/direct/verify-release-source.sh" \
  "$candidate" "$release_version"
backup_root="${DEPLOYMENT_RECOVERY_ROOT:-$(dirname -- "$current_link")/.deployment-recovery}"
if [[ ! -e "$backup_root" ]]; then mkdir -m 0700 -- "$backup_root"; fi
if [[ ! -d "$backup_root" || -L "$backup_root" || "$(stat -c '%u:%a' "$backup_root")" != '0:700' ]]; then
  echo 'Recovery storage must be a real root-owned directory with mode0700.' >&2; exit 1
fi
exec 9>"$backup_root/promotion.lock"
if ! flock -n 9; then
  echo 'Another Avasan promotion is active.' >&2; exit 1
fi
if [[ ! -L "$current_link" ]]; then
  echo "Promotion requires an existing verified current release symlink: $current_link" >&2
  exit 1
fi
if [[ ! -d "$snippet_root" ]]; then
  echo "Nginx snippet directory does not exist: $snippet_root" >&2
  exit 1
fi
for target in "$maps_target" "$policy_target"; do
  if [[ -L "$target" || ( -e "$target" && ! -f "$target" ) ]]; then
    echo "Refusing to replace non-file Nginx snippet: $target" >&2
    exit 1
  fi
done

previous_target="$(readlink -f -- "$current_link" 2>/dev/null || true)"
case "$previous_target/" in
  "$release_root_real/"*) ;;
  *) echo "Current release must resolve beneath $release_root_real: ${previous_target:-missing}" >&2; exit 1 ;;
esac
for previous_file in front-end/.output/public/index.html front-end/.output/public/404.html front-end/.output/public/release.json; do
  if [[ ! -f "$previous_target/$previous_file" ]] || [[ -L "$previous_target/$previous_file" ]]; then
    echo "Current release is not a valid rollback target: $previous_file" >&2
    exit 1
  fi
done
if [[ "$candidate" == "$release_root_real" || "$previous_target" == "$release_root_real" ]]; then
  echo 'Release targets must be strictly beneath the release root.' >&2; exit 1
fi
nginx -t
mutation_started=false
finished=false
retain_backup=false
next_link="${current_link}.next.$$"
response_file="$(mktemp)"
headers_file="$(mktemp)"
nginx_dump_file="$(mktemp)"
backup_directory="$(mktemp -d "$backup_root/avasan-XXXXXXXX")"
# Registered through the EXIT handler.
# shellcheck disable=SC2329
cleanup() {
  if [[ -L "$next_link" ]]; then unlink -- "$next_link"; fi
  rm -f -- "${maps_target}.next.$$" "${policy_target}.next.$$"
  rm -f -- "$response_file" "$headers_file" "$nginx_dump_file"
  if [[ "$retain_backup" == true ]]; then return; fi
  rm -f -- \
    "$backup_directory/http-maps.conf" "$backup_directory/http-maps.conf.absent" \
    "$backup_directory/server-policy.conf" "$backup_directory/server-policy.conf.absent"
  rmdir -- "$backup_directory"
}
# Every unsuccessful exit after mutation, including signals, restores state.
# shellcheck disable=SC2329
on_exit() {
  local status=$?
  trap - EXIT HUP INT TERM
  if [[ "$mutation_started" == true && "$finished" != true ]]; then
    if ! rollback; then
      retain_backup=true
      echo "CRITICAL: rollback needs operator recovery; protected backups retained at $backup_directory" >&2
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

activate_target() {
  local target="$1"
  if [[ -L "$next_link" ]]; then unlink -- "$next_link" || return 1; fi
  ln -s -- "$target" "$next_link" || return 1
  mv -Tf -- "$next_link" "$current_link"
}

install_snippet() {
  local source="$1"
  local target="$2"
  local backup_name="$3"
  if [[ -f "$target" ]]; then
    cp -p -- "$target" "$backup_directory/$backup_name" || return 1
  else
    touch -- "$backup_directory/$backup_name.absent" || return 1
  fi
  install -m 0644 -- "$source" "${target}.next.$$" || return 1
  mv -Tf -- "${target}.next.$$" "$target"
}

# Reached from the EXIT rollback handler.
# shellcheck disable=SC2329
restore_snippet() {
  local target="$1"
  local backup_name="$2"
  if [[ -f "$backup_directory/$backup_name" ]]; then
    cp -p -- "$backup_directory/$backup_name" "${target}.next.$$" \
      && mv -Tf -- "${target}.next.$$" "$target"
  elif [[ -f "$backup_directory/$backup_name.absent" ]]; then
    rm -f -- "$target"
  fi
}

# Reached from the EXIT rollback handler.
# shellcheck disable=SC2329
restore_snippets() {
  local failed=0
  restore_snippet "$maps_target" http-maps.conf || failed=1
  restore_snippet "$policy_target" server-policy.conf || failed=1
  return "$failed"
}

verify_installed_snippets() {
  if ! cmp -s "$candidate/deploy/nginx/http-maps.conf" "$maps_target" \
    || ! cmp -s "$candidate/deploy/nginx/server-policy.conf" "$policy_target"; then
    echo "Installed Avasan Nginx snippets do not match the prepared release." >&2
    return 1
  fi
  nginx -T >"$nginx_dump_file" 2>&1 \
    && "$candidate/deploy/direct/verify-nginx-snippet-dump.sh" \
      "$nginx_dump_file" "$maps_target" "$policy_target"
}

wait_for_health() {
  local expected_release="$1"
  local _attempt
  local address
  local complete
  local missing_status
  for _attempt in {1..20}; do
    complete=true
    for address in "$resolve_address" "$resolve_address_ipv6"; do
    if curl --fail --silent --show-error --max-time 5 --resolve "$host_header:443:$address" \
      --header "Host: $host_header" "$health_url" --output "$response_file" \
      && cmp -s "$expected_release" "$response_file" \
      && curl --fail --silent --show-error --max-time 5 --resolve "$host_header:443:$address" \
        --header "Host: $host_header" \
        --dump-header "$headers_file" "$site_origin/" --output "$response_file" \
      && grep -Eiq '^Cross-Origin-Opener-Policy:[[:space:]]*same-origin' "$headers_file" \
      && grep -Eiq '^Cross-Origin-Resource-Policy:[[:space:]]*same-origin' "$headers_file"; then
      missing_status="$(curl --silent --show-error --max-time 5 --resolve "$host_header:443:$address" \
        --header "Host: $host_header" \
        --output "$response_file" --write-out '%{http_code}' \
        "$site_origin/__avasan-deployment-probe-missing")"
      if [[ "$missing_status" == "404" ]] \
        && grep -Fq 'Page not found' "$response_file"; then
        continue
      fi
    fi
    complete=false
    done
    if [[ "$complete" == true ]]; then return 0; fi
    sleep 1
  done
  return 1
}

# Invoked by the EXIT handler even when a command fails before activation.
# shellcheck disable=SC2329
rollback() {
  local failed=0
  restore_snippets || failed=1
  activate_target "$previous_target" || failed=1
  if [[ "$failed" == 0 ]] && nginx -t && systemctl reload nginx \
    && wait_for_health "$previous_target/front-end/.output/public/release.json"; then
    echo "Restored and verified the previous Avasan release: $previous_target" >&2
    return 0
  fi
  return 1
}
mutation_started=true

if ! install_snippet "$candidate/deploy/nginx/http-maps.conf" "$maps_target" http-maps.conf \
  || ! install_snippet "$candidate/deploy/nginx/server-policy.conf" "$policy_target" server-policy.conf \
  || ! verify_installed_snippets \
  || ! activate_target "$candidate"; then
  echo "Could not install the candidate release and Nginx snippets." >&2
  exit 1
fi
if ! nginx -t; then
  echo "Nginx validation failed; restoring the previous release." >&2
elif systemctl reload nginx \
  && wait_for_health "$candidate/front-end/.output/public/release.json"; then
  finished=true
  echo "Promoted $candidate and verified $health_url with host $host_header."
  exit 0
else
  echo "Candidate health failed; restoring the previous release." >&2
fi

exit 1
