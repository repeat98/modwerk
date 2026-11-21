#!/bin/sh
# Rebuild one SYNTIZ 0.1.1 trial candidate: ./build.sh A|B|C [out.mwrm]
# Run from the repository root. Needs the m68k-elf toolchain the loader build uses.
#   A  0.1.0's code at 0.1.1's data addresses (a CONTROL: its package repeats stock bytes, never commit or publish it)
#   B  0.1.1's code padded so the engine tables, read-only data and bss sit at 0.1.0's positions mod 16
#   C  0.1.1 with explicit alignment: desc pages at 2 mod 4 (stride 460), voices, wave_ratio, wave_tables aligned(16)
set -eu
V=${1:?usage: build.sh A|B|C [out.mwrm]}
OUT=${2:-/tmp/syntiz-trial-$V/syntiz.mwrm}   # keep the file name: the module id derives from it
mkdir -p "$(dirname "$OUT")"
M=sdk/octatrack/modules/syntiz
D=sdk/octatrack/modules/zz-trial-$V   # inside the tree: the loader build finds modwerk_events.h from here
rm -rf "$D"; mkdir -p "$D"
trap 'rm -rf "$D"' EXIT
cp "$M"/*.c "$M"/*.h "$D"/
cp "$M"/trials/"$V"/*.c "$D"/
if [ "$V" = C ]; then
  sed -i.bak 's/^static const int16_t wave_tables\[WAVE_TABLES\]\[WAVE_TABLE_LEN\] = {/static const int16_t wave_tables[WAVE_TABLES][WAVE_TABLE_LEN] __attribute__((aligned(16))) = {/' "$D/tables.h"
  rm -f "$D/tables.h.bak"
  grep -q 'aligned(16)' "$D/tables.h"
fi
python3 -B sdk/runtime/loader/build.py "$D/engine.c" "$D/machine_map.c" "$D/machine.c" \
  --subscribe ot_machines:wave_machine:50 --raise ev_trig_muted -o "$OUT"
shasum -a 256 "$OUT"
