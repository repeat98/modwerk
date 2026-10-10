#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Every stock DSP effect's worst case: executed instructions per sample, one
instance per core, at every trigger split (0-15), knobs fixed and moving, the
null stub subtracted per split. Octabam's harness (benchmark_reverbs, dsp_host),
the method of sdk/drafts/airwindows-chorus-efficiency/benchmark.py extended to
all 13 effects. The dearest sets build_core.py's DSP_RESERVE.

    DSP_HOST=/path/to/dsp_host python3 -B sdk/machines/octatrack/elekloader/stock_dsp_worst.py

Needs the verified original MAIN at sdk/octabam/out/raw (npm run upstream:tools
explains it) and writes sdk/octabam/out/stock_splits (ignored). Emulator
instruction counts, not hardware timing.
"""
import hashlib
import json
import os
from pathlib import Path
import sys
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[3] / 'octabam'
KEYS = ('FILTER', 'EQUALIZER', 'DJ EQ', 'PHASER', 'FLANGER', 'CHORUS', 'SPATIALIZER', 'COMB FILTER', 'COMPRESSOR',
        'LO-FI', 'PLATE REV', 'SPRING REV', 'DARK REV')


def main(blocks=1024):
    os.chdir(ROOT)
    sys.path[:0] = [str(ROOT / 'tools')]
    import toolpath  # noqa: F401
    import benchmark_reverbs as br
    import send_probe
    from remix import registry, stock
    out = ROOT / 'out/stock_splits'
    out.mkdir(parents=True, exist_ok=True)
    br.OUT = out
    mem = [send_probe.dump_mem(stock.STOCK_IMAGE, out / ('stock_%s.mem' % p), p) for p in 'AB']
    inputs = [br.source(blocks, k) for k in range(2)]
    null = SimpleNamespace(key='NULL STUB', name='null', menu=SimpleNamespace(fx2_id=0),
                           params=[SimpleNamespace(default=0, active=False, name=b'', count=128)] * 12)
    run = dict(blocks=blocks, inputs=inputs, positions=[0, 4], extra=('-audio', '0'))
    worst = {}
    for split in range(16):
        base, _ = br.run(null, mem, 'null_s%d' % split, blocks, 2, False, split=[split] * 2,
                         **{k: v for k, v in run.items() if k != 'blocks'})
        for key in KEYS:
            for moving in (False, True):
                row, _ = br.run(registry.by_key(key), mem, '%s_%d_s%d' % (key, moving, split), blocks, 2, moving,
                                split=[split] * 2, **{k: v for k, v in run.items() if k != 'blocks'})
                for core in range(2):
                    net = (row['cores'][core]['peak_block'] - base['cores'][core]['peak_block']) / 16
                    worst[key] = max(worst.get(key, 0), net)
    record = dict(units='executed instructions/sample; not modeled cycles or hardware timing', blocks=blocks,
                  splits='0-15', knobs='fixed and moving',
                  stockMainSha256=hashlib.sha256(stock.STOCK_IMAGE.read_bytes()).hexdigest(),
                  dspHostSha256=hashlib.sha256(br.HOST.read_bytes()).hexdigest(),
                  worst={key: worst[key] for key in sorted(worst, key=worst.get)})
    (out / 'worst.json').write_text(json.dumps(record, indent=1) + '\n')
    print(json.dumps(record, indent=1))


if __name__ == '__main__':
    main()
