#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Rebuild the packages bound to the public Octatrack base with only tracked sources.
set -euo pipefail
if [[ $# -lt 1 || $# -gt 2 || ! $1 =~ ^sha256:[a-f0-9]{64}$ ]]; then
  echo 'usage: test-base-bound.sh image-id [local-elekloader-git-checkout]' >&2
  exit 2
fi
image=$1
root=$(git rev-parse --show-toplevel)
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
mkdir "$scratch/source" "$scratch/upstream"
git -C "$root" archive HEAD | tar -x -C "$scratch/source"
cp -R "$scratch/source/sdk/octatrack/modules" "$scratch/source/sdk/octabam/modules"
pin=$(node -p 'require(process.argv[1]).commit' "$scratch/source/vendor/elekloader/kit/kit.json")
[[ $pin =~ ^[a-f0-9]{40}$ ]]
if [[ $# == 2 ]]; then
  upstream=$2
else
  upstream=$scratch/tool.git
  git init -q --bare "$upstream"
  git -C "$upstream" remote add origin https://github.com/irpina/elekloader.git
  git -C "$upstream" fetch --quiet --no-tags --depth=1 --filter=blob:none origin "$pin"
fi
# The comparison imports the kit's Python package. Only those sources enter the container.
git -C "$upstream" archive "$pin" 'elekloader/*.py' | tar -x -C "$scratch/upstream"
docker run --rm --network none --cap-drop ALL --security-opt no-new-privileges --read-only \
  --user "$(id -u):$(id -g)" --cpus 2 --memory 4g --pids-limit 128 --tmpfs /tmp:rw,nosuid,nodev,size=512m \
  --mount "type=bind,source=$scratch/source,target=/source,readonly" \
  --mount "type=bind,source=$scratch/upstream,target=/tools/.cache/modwerk-upstream/elekloader,readonly" \
  --env HOME=/tools --env MODWERK_REQUIRE_BASE_BOUND=1 \
  --env ELEKLOADER_DSP_ASM=/opt/toolchain/vendor/dsp56300/build/source/dsp_host/dsp_asm \
  "$image" python3 -B -m unittest -v sdk.tests.test_base_bound.BaseBound.test_each_package_rebuilds_identically_and_a_controller_needs_its_trust_row
