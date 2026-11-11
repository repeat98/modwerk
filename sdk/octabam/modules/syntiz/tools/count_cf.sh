#!/bin/sh
# SPDX-License-Identifier: MIT
# Instructions wave_render executes per 16-sample frame on a ColdFire, per model, at the defaults and
# heavy settings (bench_cf.c). gcc 12 for MCF54455 in the modwerk-m68k image, then qemu-m68k -cpu cfv4e
# one instruction a trace line. Counts, not cycles or the unit's time: the base's frame guard measures that.
#   tools/count_cf.sh <output dir>
set -e
HERE=$(cd "$(dirname "$0")/.." && pwd); OUT=$(mkdir -p "$1" && cd "$1" && pwd)
docker run --rm --platform linux/amd64 -v "$HERE":/w:ro -v "$OUT":/o -w /w modwerk-m68k:latest sh -c '
for m in 0 1 2 3 4 5; do for l in heavy light; do
  f=; [ $l = light ] && f=-DLIGHT
  m68k-linux-gnu-gcc -mcpu=54455 -msoft-float -O2 -fno-pic -ffreestanding -fno-builtin -fno-tree-loop-distribute-patterns -nostdlib -static $f -DMODEL=$m engine.c bench_cf.c -o /o/b$m$l
  m68k-linux-gnu-nm -S /o/b$m$l | grep " wave_render$" > /o/b$m$l.sym
done; done'
docker run --rm -v "$OUT":/o debian:bookworm-slim sh -c 'apt-get update -qq >/dev/null && apt-get install -y -qq qemu-user >/dev/null 2>&1
for b in /o/b?heavy /o/b?light; do qemu-m68k -cpu cfv4e -singlestep -d nochain,exec -D $b.log $b; done'
python3 -I - "$OUT" <<'PY'
import sys, re
d = sys.argv[1]
for m, name in enumerate(['SAW', 'PULSE', 'ENS', 'TABLE', 'MORPH', 'CHOIR']):
    row = []
    for l in ['light', 'heavy']:
        a, sz = open(f'{d}/b{m}{l}.sym').read().split()[:2]
        lo = int(a, 16); hi = lo + int(sz, 16); n = 0
        for line in open(f'{d}/b{m}{l}.log', errors='replace'):
            mm = re.search(r'\[[0-9a-f]+/([0-9a-f]+)/', line)
            if mm and lo <= int(mm.group(1), 16) < hi: n += 1
        row.append(n / 64)
    print(f'{name:6s} defaults {row[0]:6.0f}  heavy {row[1]:6.0f}  instructions a frame')
PY
