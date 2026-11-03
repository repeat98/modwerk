#!/usr/bin/env bash
# SPDX-License-Identifier: Elastic-2.0
# Copyright (c) 2026 Jannik Aßfalg (repeat98)
set -euo pipefail
[ "$#" -eq 3 ] || { echo 'usage: build-elemod-isolated.sh clean-checkout new-output image-id' >&2; exit 2; }
source_dir=$(cd "$1" && pwd -P)
output_dir=$2
image_id=$3
[[ "$image_id" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo 'Use the immutable Docker image ID.' >&2; exit 2; }
[ ! -e "$output_dir" ] || { echo 'Output already exists.' >&2; exit 2; }
source_commit=$(git -C "$source_dir" rev-parse HEAD)
[ -z "$(git -C "$source_dir" status --porcelain --untracked-files=all)" ] || { echo 'The source checkout must be clean.' >&2; exit 2; }
# Archive tracked source only. Ignored local firmware, history and secrets never mount.
staging_dir=$(mktemp -d)
trap 'rm -rf "$staging_dir"' EXIT
git -C "$source_dir" archive "$source_commit" | tar -x -C "$staging_dir"
mkdir -p "$output_dir"
output_dir=$(cd "$output_dir" && pwd -P)
docker run --rm --network none --cap-drop ALL --security-opt no-new-privileges --read-only --user "$(id -u):$(id -g)" --cpus 2 --memory 4g --pids-limit 128 --tmpfs /tmp:rw,nosuid,nodev,noexec,size=256m --tmpfs /test:rw,nosuid,nodev,exec,size=16m,mode=1777 --env HOME=/tmp --env LC_ALL=C --env TZ=UTC --env SOURCE_DATE_EPOCH=0 --mount "type=bind,source=$staging_dir,target=/source,readonly" --mount "type=bind,source=$output_dir,target=/output" "$image_id" node scripts/build-elemod-packages.mjs --output /output --source-commit "$source_commit"
