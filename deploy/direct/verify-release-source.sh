#!/usr/bin/env bash
set -euo pipefail
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH

if [[ $# -ne 2 ]]; then
  echo "Usage: verify-release-source.sh /path/to/checkout <package-version>" >&2
  exit 2
fi

candidate="$(realpath -- "$1")"
release_version="$2"
if [[ ! "$release_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]; then
  echo "Release version is not a supported semantic version: $release_version" >&2
  exit 1
fi

source_revision="$(git -C "$candidate" rev-parse --verify HEAD^{commit})"
origin_url="$(git -C "$candidate" remote get-url origin 2>/dev/null || true)"
if [[ ! "$origin_url" =~ ^(git@github\.com:|ssh://git@github\.com/|https://github\.com/)anderson-webops/avasan\.org(\.git)?$ ]]; then
  echo "Candidate origin is not anderson-webops/avasan.org: ${origin_url:-missing}" >&2
  exit 1
fi

origin_main="$(git -C "$candidate" rev-parse --verify refs/remotes/origin/main^{commit} 2>/dev/null || true)"
if [[ -z "$origin_main" ]]; then
  echo "Candidate is missing the fetched origin/main revision." >&2
  exit 1
fi
if [[ "$source_revision" != "$origin_main" ]]; then
  echo "Candidate HEAD is not the exact fetched origin/main revision." >&2
  exit 1
fi

release_tag="v${release_version}"
tag_type="$(git -C "$candidate" cat-file -t "refs/tags/$release_tag" 2>/dev/null || true)"
if [[ "$tag_type" != "tag" ]]; then
  echo "Release tag $release_tag must exist as an annotated tag." >&2
  exit 1
fi
tag_revision="$(git -C "$candidate" rev-parse --verify "refs/tags/$release_tag^{commit}")"
if [[ "$tag_revision" != "$source_revision" ]]; then
  echo "Annotated release tag $release_tag does not resolve to candidate HEAD." >&2
  exit 1
fi

echo "Verified annotated $release_tag at exact origin/main revision $source_revision."
