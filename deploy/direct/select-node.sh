#!/usr/bin/env bash
# Sourced by the reviewed preparation/promotion scripts; no host runtime changes.
node_bin_dir="${NODE_BIN_DIR:-/usr/bin}"
if [[ "$node_bin_dir" != /* || ! -x "$node_bin_dir/node" ]]; then
  echo 'NODE_BIN_DIR must be an absolute directory containing the reviewed Node runtime.' >&2
  exit 1
fi
node_bin_dir_real="$(cd -- "$node_bin_dir" && pwd -P)"
PATH="$node_bin_dir_real:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
export PATH
if [[ "$(node --version)" != v24.18.1 ]]; then
  echo 'Node 24.18.1 is required; select its existing directory with NODE_BIN_DIR.' >&2
  exit 1
fi
