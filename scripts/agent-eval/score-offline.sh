#!/usr/bin/env bash
set -eu

# The runner owns the snapshot (mode 0700). Use its UID and GID to enter the read-only mount.
exec docker run --rm --user "$(id -u):$(id -g)" \
  --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
  --pids-limit 64 --memory 384m --cpus 1 -v "$2:/case:ro" \
  -v "$PWD/scripts/agent-eval:/grader:ro" node:24.21.0-bookworm-slim \
  node /grader/grade.mjs "$1" /case
