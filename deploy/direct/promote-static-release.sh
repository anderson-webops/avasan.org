#!/usr/bin/env bash
set -euo pipefail
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH

release_root="${RELEASE_ROOT:-/srv/avasan.org/releases}"
current_link="${CURRENT_LINK:-/srv/avasan.org/current}"
health_url="${HEALTH_URL:-http://127.0.0.1/release.json}"
host_header="${HOST_HEADER:-avasan.org}"
site_origin="${SITE_ORIGIN:-${health_url%/release.json}}"

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

for required_file in front-end/.output/public/index.html front-end/.output/public/404.html front-end/.output/public/release.json .avasan-static-release.json; do
  if [[ ! -f "$candidate/$required_file" ]]; then
    echo "Prepared release is missing $required_file." >&2
    exit 1
  fi
done
if ! cmp -s "$candidate/front-end/.output/public/release.json" "$candidate/.avasan-static-release.json"; then
  echo "Prepared release metadata does not match the public release identity." >&2
  exit 1
fi
if [[ -e "$current_link" && ! -L "$current_link" ]]; then
  echo "Refusing to replace non-symlink deployment path: $current_link" >&2
  exit 1
fi

previous_target="$(readlink -f -- "$current_link" 2>/dev/null || true)"
next_link="${current_link}.next.$$"
response_file="$(mktemp)"
headers_file="$(mktemp)"
cleanup() {
  if [[ -L "$next_link" ]]; then unlink -- "$next_link"; fi
  rm -f -- "$response_file" "$headers_file"
}
trap cleanup EXIT

activate_target() {
  local target="$1"
  ln -s -- "$target" "$next_link"
  mv -Tf -- "$next_link" "$current_link"
}

wait_for_health() {
  local attempt
  local missing_status
  for attempt in {1..20}; do
    if curl --fail --silent --show-error --max-time 5 --header "Host: $host_header" "$health_url" --output "$response_file" \
      && cmp -s "$candidate/front-end/.output/public/release.json" "$response_file" \
      && curl --fail --silent --show-error --max-time 5 --header "Host: $host_header" \
        --dump-header "$headers_file" "$site_origin/" --output "$response_file" \
      && grep -Eiq '^Cross-Origin-Opener-Policy:[[:space:]]*same-origin' "$headers_file" \
      && grep -Eiq '^Cross-Origin-Resource-Policy:[[:space:]]*same-origin' "$headers_file"; then
      missing_status="$(curl --silent --show-error --max-time 5 --header "Host: $host_header" \
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

activate_target "$candidate"
if ! nginx -t; then
  echo "Nginx validation failed; restoring the previous release." >&2
elif systemctl reload nginx && wait_for_health; then
  echo "Promoted $candidate and verified $health_url with host $host_header."
  exit 0
else
  echo "Candidate health failed; restoring the previous release." >&2
fi

if [[ -n "$previous_target" ]]; then
  activate_target "$previous_target"
  nginx -t && systemctl reload nginx
else
  unlink -- "$current_link"
  nginx -t && systemctl reload nginx
fi
exit 1
