#!/usr/bin/env bash
set -euo pipefail
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH

if [[ $# -lt 2 ]]; then
  echo "Usage: verify-nginx-snippet-dump.sh <nginx-T-output> <snippet> [snippet ...]" >&2
  exit 2
fi

nginx_dump="$(realpath -- "$1")"
shift

for snippet in "$@"; do
  marker="# configuration file $snippet:"
  occurrence_count="$(grep -Fxc -- "$marker" "$nginx_dump" || true)"
  if [[ "$occurrence_count" -ne 1 ]]; then
    echo "Expected Nginx to load $snippet exactly once; found $occurrence_count occurrences." >&2
    exit 1
  fi
done

echo "Verified each required Avasan Nginx snippet is loaded exactly once."
