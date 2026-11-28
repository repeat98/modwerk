#!/bin/sh
# SPDX-License-Identifier: GPL-3.0-or-later
# Build and run the host tests of the voice (tools/host_test.c) with UBSan. On macOS pass an SDK the linker reads, e.g.
# MS_CFLAGS="-isysroot /Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk".
set -eu
cd "$(dirname "$0")/.."
out="${TMPDIR:-/tmp}/mono-synth-host-test"
cc ${MS_CFLAGS:-} -std=c11 -O1 -g -Wall -Wextra -fsanitize=undefined -fno-sanitize-recover=undefined -DMW_DSP_HOST \
   -I src -I ../../../machines/analog-rytm-mkii/include tools/host_test.c src/ms_dsp.c src/ms_gate.c -lm -o "$out"
"$out"
