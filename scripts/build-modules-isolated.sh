#!/usr/bin/env bash
# SPDX-License-Identifier: Elastic-2.0
# Copyright (c) 2026 Jannik Aßfalg (repeat98)
set -euo pipefail
# Supply a clean checkout root, NEW output directory and locally built image ID.
[ "$#" -eq 3 ] || { echo 'usage: build-modules-isolated.sh clean-checkout new-output image-id' >&2; exit 2; }
source_dir=$(cd "$1" && pwd -P)
output_dir=$2
image_id=$3
[[ "$image_id" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo 'Use the immutable Docker image ID, not a mutable tag.' >&2; exit 2; }
[ ! -e "$output_dir" ] || { echo 'Output already exists.' >&2; exit 2; }
source_commit=$(git -C "$source_dir" rev-parse HEAD)
[ -z "$(git -C "$source_dir" status --porcelain --untracked-files=all)" ] || { echo 'The release checkout must be clean.' >&2; exit 2; }
# Mount ONLY tracked source. A developer checkout may contain ignored firmware,
# credentials and outputs, which must never be visible to the container.
staging_dir=$(mktemp -d)
trap 'rm -rf "$staging_dir"' EXIT
git -C "$source_dir" archive "$source_commit" | tar -x -C "$staging_dir"
# Copy only this commit object and its exact source tree, not repository history.
git -C "$staging_dir" init -q
git -C "$source_dir" cat-file commit "$source_commit" | git -C "$staging_dir" hash-object -t commit -w --stdin > /dev/null
git -C "$source_dir" rev-parse "$source_commit^{tree}" | git -C "$source_dir" pack-objects --revs --stdout | git -C "$staging_dir" unpack-objects -q
git -C "$staging_dir" update-ref HEAD "$source_commit"
git -C "$staging_dir" read-tree "$source_commit"
mkdir -p "$output_dir"
output_dir=$(cd "$output_dir" && pwd -P)
docker run --rm --network none --cap-drop ALL --security-opt no-new-privileges --read-only --user "$(id -u):$(id -g)" --cpus 2 --memory 4g --pids-limit 128 --tmpfs /tmp:rw,nosuid,nodev,size=256m --env HOME=/tmp --mount "type=bind,source=$staging_dir,target=/source,readonly" --mount "type=bind,source=$output_dir,target=/output" "$image_id" python3 -B scripts/build-module-packages.py --vendor /opt/toolchain/vendor --output /output/packages --source-commit "$source_commit"
