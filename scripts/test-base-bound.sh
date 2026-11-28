#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Rebuild the packages bound to the public Octatrack base with only tracked sources.
set -euo pipefail
if [[ $# != 1 || ! $1 =~ ^sha256:[a-f0-9]{64}$ ]]; then
  echo 'usage: test-base-bound.sh image-id' >&2
  exit 2
fi
image=$1
root=$(git rev-parse --show-toplevel)
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
mkdir "$scratch/source"
git -C "$root" archive HEAD | tar -x -C "$scratch/source"
cp -R "$scratch/source/sdk/octatrack/modules" "$scratch/source/sdk/octabam/modules"
docker run --rm --network none --cap-drop ALL --security-opt no-new-privileges --read-only \
  --user "$(id -u):$(id -g)" --cpus 2 --memory 4g --pids-limit 128 --tmpfs /tmp:rw,nosuid,nodev,size=512m \
  --mount "type=bind,source=$scratch/source,target=/source,readonly" \
  --env HOME=/tools --env MODWERK_REQUIRE_BASE_BOUND=1 \
  --env ELEKLOADER_DSP_ASM=/opt/toolchain/vendor/dsp56300/build/source/dsp_host/dsp_asm \
  "$image" python3 -B -m unittest -v sdk.tests.test_base_bound.BaseBound.test_each_package_rebuilds_identically_and_a_controller_needs_its_trust_row
