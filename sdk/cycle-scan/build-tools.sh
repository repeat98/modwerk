#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Builds the DSP tools the cycle scan runs: the patched dsp56300 at octabam's pin, with this folder's dsp_host.cpp
# (upstream's, with -steptrace) staged over the harness copy, then dsp_host, dsp_asm and the disassembler.
#
#   sdk/cycle-scan/build-tools.sh [OCTABAM_TREE]   # default sdk/octabam; the vendor tree and binaries stay there, untracked
#
# The harness copy under sdk/octabam/tools is left as it is: tools/ is part of the module-source fingerprint
# (scripts/module-source.mjs), and changing it would make every module package count as rebuilt from new source.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
tree=$(cd "${1:-$here/../octabam}" && pwd)
cd "$tree"
bash scripts/vendor.sh dsp56300
cp "$here/dsp_host.cpp" vendor/dsp56300/source/dsp_host/dsp_host.cpp
cmake -S vendor/dsp56300 -B vendor/dsp56300/build -DCMAKE_BUILD_TYPE=Release
cmake --build vendor/dsp56300/build --target dsp56kDisassemble dsp_asm dsp_host -j"${JOBS:-2}"
vendor/dsp56300/build/source/dsp_host/dsp_host 2>&1 | grep -q steptrace || { echo "dsp_host was built without -steptrace" >&2; exit 1; }
echo "built: $tree/vendor/dsp56300/build/source/dsp_host/dsp_host (with -steptrace)"
