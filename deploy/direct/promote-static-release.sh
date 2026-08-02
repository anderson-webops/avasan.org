#!/usr/bin/env bash
set -euo pipefail
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH

release_root="${RELEASE_ROOT:-/srv/avasan.org/releases}"
current_link="${CURRENT_LINK:-/srv/avasan.org/current}"
host_header="${HOST_HEADER:-avasan.org}"
site_origin="${SITE_ORIGIN:-https://$host_header}"
health_url="${HEALTH_URL:-$site_origin/release.json}"
resolve_address="${RESOLVE_ADDRESS:-127.0.0.1}"
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
if ! cmp -s "$candidate/front-end/.output/public/release.json" "$candidate/.avasan-static-release.json"; then
  echo "Prepared release metadata does not match the public release identity." >&2
  exit 1
fi
if ! git -C "$candidate" diff --quiet -- . \
  || ! git -C "$candidate" diff --cached --quiet -- .; then
  echo "Prepared release has tracked source changes after preparation." >&2
  exit 1
fi
release_version="$(node -p "require('$candidate/package.json').version")"
"$candidate/deploy/direct/verify-release-source.sh" \
  "$candidate" "$release_version"
if [[ ! -L "$current_link" ]]; then
  echo "Promotion requires an existing verified current release symlink: $current_link" >&2
  exit 1
fi
if [[ ! -d "$snippet_root" ]]; then
  echo "Nginx snippet directory does not exist: $snippet_root" >&2
  exit 1
fi
for target in "$maps_target" "$policy_target"; do
  if [[ -e "$target" && ! -f "$target" ]]; then
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
next_link="${current_link}.next.$$"
response_file="$(mktemp)"
headers_file="$(mktemp)"
nginx_dump_file="$(mktemp)"
backup_directory="$(mktemp -d)"
cleanup() {
  if [[ -L "$next_link" ]]; then unlink -- "$next_link"; fi
  rm -f -- "${maps_target}.next.$$" "${policy_target}.next.$$"
  rm -f -- "$response_file" "$headers_file" "$nginx_dump_file"
  rm -f -- \
    "$backup_directory/http-maps.conf" "$backup_directory/http-maps.conf.absent" \
    "$backup_directory/server-policy.conf" "$backup_directory/server-policy.conf.absent"
  rmdir -- "$backup_directory"
}
trap cleanup EXIT

activate_target() {
  local target="$1"
  ln -s -- "$target" "$next_link"
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

restore_snippet() {
  local target="$1"
  local backup_name="$2"
  if [[ -f "$backup_directory/$backup_name" ]]; then
    install -m 0644 -- "$backup_directory/$backup_name" "$target"
  elif [[ -f "$backup_directory/$backup_name.absent" ]]; then
    rm -f -- "$target"
  fi
}

restore_snippets() {
  restore_snippet "$maps_target" http-maps.conf
  restore_snippet "$policy_target" server-policy.conf
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
  local attempt
  local missing_status
  for attempt in {1..20}; do
    if curl --fail --silent --show-error --max-time 5 --resolve "$host_header:443:$resolve_address" \
      --header "Host: $host_header" "$health_url" --output "$response_file" \
      && cmp -s "$expected_release" "$response_file" \
      && curl --fail --silent --show-error --max-time 5 --resolve "$host_header:443:$resolve_address" \
        --header "Host: $host_header" \
        --dump-header "$headers_file" "$site_origin/" --output "$response_file" \
      && grep -Eiq '^Cross-Origin-Opener-Policy:[[:space:]]*same-origin' "$headers_file" \
      && grep -Eiq '^Cross-Origin-Resource-Policy:[[:space:]]*same-origin' "$headers_file"; then
      missing_status="$(curl --silent --show-error --max-time 5 --resolve "$host_header:443:$resolve_address" \
        --header "Host: $host_header" \
        --output "$response_file" --write-out '%{http_code}' \
        "$site_origin/__avasan-deployment-probe-missing")"
      if [[ "$missing_status" == "404" ]] \
        && grep -Fq 'Page not found' "$response_file"; then
        return 0
      fi
    fi
    sleep 1
  done
  return 1
}

if ! install_snippet "$candidate/deploy/nginx/http-maps.conf" "$maps_target" http-maps.conf \
  || ! install_snippet "$candidate/deploy/nginx/server-policy.conf" "$policy_target" server-policy.conf \
  || ! verify_installed_snippets \
  || ! activate_target "$candidate"; then
  restore_snippets
  echo "Could not install the candidate release and Nginx snippets." >&2
  exit 1
fi
if ! nginx -t; then
  echo "Nginx validation failed; restoring the previous release." >&2
elif systemctl reload nginx \
  && wait_for_health "$candidate/front-end/.output/public/release.json"; then
  echo "Promoted $candidate and verified $health_url with host $host_header."
  exit 0
else
  echo "Candidate health failed; restoring the previous release." >&2
fi

restore_snippets
activate_target "$previous_target"
if nginx -t \
  && systemctl reload nginx \
  && wait_for_health "$previous_target/front-end/.output/public/release.json"; then
  echo "Restored and verified the previous Avasan release: $previous_target" >&2
else
  echo "CRITICAL: the previous Avasan release could not be verified after rollback." >&2
fi
exit 1
