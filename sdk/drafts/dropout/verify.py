#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""DROPOUT's gates, run on the vendored dsp56kEmu alone (tools/fxtest.py, tools/fxhost.cpp).

    python3 -B sdk/drafts/dropout/verify.py            # every gate; exit 1 on a failure
    python3 -B sdk/drafts/dropout/verify.py --fx DIR   # also render fx:audit's signals in DIR into DIR-renders

None of them reads firmware; none of them can see the panel, the dispatcher's real register state, the base's
loader or the hardware.
"""
import argparse
import importlib.util
import pathlib
import sys

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE / 'tools'))
sys.path.insert(0, str(HERE.parents[1] / 'octabam/tools'))
import toolpath  # noqa: E402,F401
import fxtest as F  # noqa: E402

spec = importlib.util.spec_from_file_location('dropout_manifest', HERE / 'manifest.py')
manifest = importlib.util.module_from_spec(spec)
spec.loader.exec_module(manifest)
MODULE = manifest.MODULE
DEFAULTS = [p.default or 0 for p in MODULE.params]
SLOT = {p.name.decode(): i for i, p in enumerate(MODULE.params) if p.name}
FS = 44100
BUFFER = 0x800                       # Claims(buffer_words=2048)
FX1_BASE, FX2_BASE = 0x1c00, 0x4000  # an FX1 slot (not 2K-aligned) and an FX2 slot


def knobs(**kw):
    v = list(DEFAULTS)
    for k, x in kw.items():
        v[SLOT[k]] = x
    return v


def segments(mask):
    """(start, end) of each run of True."""
    m = np.r_[False, mask, False].astype(int)
    d = np.diff(m)
    return list(zip(np.flatnonzero(d == 1), np.flatnonzero(d == -1)))


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--fx', type=pathlib.Path)
    a = ap.parse_args(argv)
    build = F.assemble(HERE / 'dropout.asm', MODULE.dsp.ptable)
    results, failed = [], 0

    def gate(name, ok, detail=''):
        nonlocal failed
        results.append('%s  %-36s %s' % ('PASS' if ok else 'FAIL', name, detail))
        failed += not ok

    def run(x, p, **kw):
        kw.setdefault('ywords', BUFFER)
        kw.setdefault('ybase', FX1_BASE)
        return F.run(build, x, p, **kw)

    gate('assembles, no mpysu, no rep', True, '%d program words + %d table words' % (len(build['words']), len(MODULE.dsp.ptable)))

    music = F.sine(997, 1.0, 0.25) + F.sine(3100, 1.0, 0.1) + 0.05 * np.random.default_rng(1).standard_normal(FS)
    xi = F.to_raw(music)
    # no dropout, no change: CHNC 0 in every mode, from garbage state and buffer, with trig splits
    worst, viol = 0, 0
    for mode in (0, 1, 2):
        for split in (0, 5):
            _, yi, r = run(music, knobs(CHNC=0, MODE=mode, TONE=127), dirty=1, split=split)
            worst = max(worst, int(np.abs(yi - xi[:len(yi)]).max()))
            viol += r['violations']
    gate('CHNC 0 is the dry, bit for bit', worst == 0, 'largest difference %d LSB' % worst)
    # DPTH 0 and TONE 0: dropouts come and go, and change nothing
    worst = 0
    for mode in (0, 1, 2):
        _, yi, r = run(music, knobs(CHNC=127, LEN=40, DPTH=0, TONE=0, MODE=mode), dirty=1, split=7)
        worst = max(worst, int(np.abs(yi - xi[:len(yi)]).max()))
        viol += r['violations']
    gate('DPTH 0 and TONE 0 change nothing', worst == 0, 'largest difference %d LSB' % worst)

    # how often and how long, against CHNC and LEN (GAP, all the way, the shortest edge)
    steady = np.full(6 * FS, 0.5)
    for chnc, ln in ((100, 40), (120, 70)):
        y, _, r = run(steady, knobs(CHNC=chnc, LEN=ln, DPTH=127, EDGE=0, MODE=0), ybase=FX2_BASE)
        viol += r['violations']
        segs = segments(y[:, 0] < 0.25)
        lens = np.array([e - s for s, e in segs]) / FS
        gaps = np.array([segs[i + 1][0] - segs[i][1] for i in range(len(segs) - 1)]) / FS
        want_len = manifest.L_TABLE[ln] / FS
        want_gap = 1.0 / (manifest.P_TABLE[chnc] / 0x800000) / FS
        ok = abs(lens.mean() / want_len - 1) < 0.2 and abs(gaps.mean() / want_gap - 1) < 0.35 and len(segs) > 8
        gate('CHNC %d, LEN %d' % (chnc, ln), ok, '%d dropouts, %.0f ms long (want %.0f), %.0f ms apart (want %.0f)' % (
            len(segs), 1000 * lens.mean(), 1000 * want_len, 1000 * gaps.mean(), 1000 * want_gap))

    # GAP at DPTH 64: the level halves during a dropout
    y, _, _ = run(steady, knobs(CHNC=110, LEN=60, DPTH=64, EDGE=0, MODE=0))
    low = y[:, 0][(y[:, 0] < 0.4)]
    gate('GAP at DPTH 64 halves the level', abs(np.median(low) / 0.5 - 0.5) < 0.01, 'level %.4f of the dry' % (np.median(low) / 0.5))

    # HOLD: inside a dropout the output repeats with the loop's period, 64 + 7 SIZE frames
    noise = 0.3 * np.random.default_rng(2).standard_normal(4 * FS)
    for size in (0, 48, 127):
        period = 64 + 7 * size
        y, yi, r = run(noise, knobs(CHNC=100, LEN=80, DPTH=127, EDGE=0, MODE=1, SIZE=size))
        viol += r['violations']
        x4 = F.to_raw(noise)[:len(yi)]
        held = [(s, e) for s, e in segments(yi[:, 0] != x4[:, 0]) if e - s > 3 * period]
        errs = [np.abs(yi[s + period + 8:e - 8, 0] - yi[s + 8:e - period - 8, 0]).max() for s, e in held]
        ok = len(held) > 2 and max(errs) <= 8         # DPTH 127 is 1 - 2^-23: a few LSB of the dry remain
        gate('HOLD loops %d frames (SIZE %d)' % (period, size), ok, '%d held dropouts, largest repeat error %d LSB' % (
            len(held), max(errs) if errs else -1))

    # HOLD never plays what it did not record: garbage buffer, a quiet input, loops longer than what was written
    quiet = F.sine(300, 1.0, 0.01)
    y, yi, r = run(quiet, knobs(CHNC=127, LEN=127, DPTH=127, EDGE=0, MODE=1, SIZE=127), dirty=1)
    viol += r['violations']
    gate('HOLD plays only what it recorded', F.peak_dbfs(y) <= F.peak_dbfs(quiet) + 0.01,
         'peak %.1f dBFS from a -40 dBFS input over a garbage buffer' % F.peak_dbfs(y))

    # CRSH: inside a dropout, values on the 6-bit grid, held for 2 + SIZE/4 samples
    ramp = F.sine(1500, 2.0, 0.9)
    for size in (0, 64):
        hold = 2 + size // 4
        y, yi, r = run(ramp, knobs(CHNC=100, LEN=80, DPTH=127, EDGE=0, MODE=2, SIZE=size))
        viol += r['violations']
        x2 = F.to_raw(ramp)[:len(yi)]
        held = [(s, e) for s, e in segments(np.abs(yi[:, 0] - x2[:, 0]) > 64) if e - s > 4 * hold]
        on_grid = all((np.abs(((yi[s + 8:e - 8, 0] + 0x20000) % 0x40000) - 0x20000) <= 8).all() for s, e in held)
        runs = []
        for s, e in held:
            seg = yi[s + 8:e - 8, 0]
            change = np.flatnonzero(np.abs(np.diff(seg)) > 8)   # a few LSB of the dry ride on the held value
            if len(change) > 2:
                runs += list(np.diff(change))
        steps = np.median(runs) if runs else 0
        gate('CRSH holds %d samples on 6 bits' % hold, len(held) > 2 and on_grid and abs(steps - hold) <= 1,
             '%d dropouts, median hold %d, on the grid: %s' % (len(held), steps, on_grid))

    # TONE darkens a 5 kHz tone while it drops out (DPTH 0: only the darkening acts)
    t5k = F.sine(5000, 3.0, 0.25)
    y, yi, _ = run(t5k, knobs(CHNC=110, LEN=80, DPTH=0, EDGE=0, MODE=0, TONE=127))
    x5 = F.to_raw(t5k)[:len(yi)]
    dark = [(s, e) for s, e in segments(yi[:, 0] != x5[:, 0]) if e - s > 1000]
    drop = np.mean([F.dbfs(y[s + 200:e - 200, 0]) for s, e in dark]) - F.dbfs(t5k)
    gate('TONE darkens a dropout', len(dark) > 2 and drop < -12, '5 kHz %.1f dB inside %d dropouts' % (drop, len(dark)))

    # EDGE: the ramp lasts 0.1 ms at 0 and 50 ms at 127
    for edge, want in ((0, 4), (127, 2205)):
        y, _, _ = run(steady[:2 * FS], knobs(CHNC=100, LEN=127, DPTH=127, EDGE=edge, MODE=0))
        g = y[:, 0] / 0.5
        fall = np.flatnonzero((g[1:] < 0.9) & (g[:-1] >= 0.9))
        lengths = []
        for f in fall[:3]:
            end = f + np.argmax(g[f:] < 0.02)
            lengths.append(end - f)
        got = np.median(lengths) if lengths else -1
        gate('EDGE %d ramps in %d samples' % (edge, want), lengths and abs(got / (want * 0.88) - 1) < 0.25,
             'median %d samples from 90 %% to 2 %%' % got)

    # idle: after a burst, silence in every mode, dropouts and all
    burst = np.concatenate([F.sine(440, 0.3, 0.9), np.zeros(3 * FS)])
    for mode in (0, 1, 2):
        y, _, r = run(burst, knobs(CHNC=120, LEN=40, DPTH=127, TONE=127, MODE=mode))
        viol += r['violations']
        gate('idle settles (MODE %d)' % mode, F.peak_dbfs(y[-FS // 2:]) < -90, 'tail peak %.1f dBFS' % F.peak_dbfs(y[-FS // 2:]))

    gate('memory guard, every run', viol == 0, '%d words written outside the state, audio and buffer' % viol)

    dear = knobs(**MODULE.dear)
    y, yi, r = run(music[:FS // 2], dear)
    gate('instructions per frame', r['maxInstructionsPerCall'] / 16 < 250,
         '%d a 16-frame call, %.0f a frame' % (r['maxInstructionsPerCall'], r['maxInstructionsPerCall'] / 16))

    # fx:audit: the dropouts are time-varying on purpose and would read as residual; CRSH dropouts back to back
    # are the module's one nonlinearity, so the audit renders MODE CRSH with dropouts as long and close as they go.
    AUDIT = knobs(CHNC=127, LEN=127, DPTH=127, EDGE=0, TONE=0, MODE=2, SIZE=0)
    if a.fx:
        out = a.fx.parent / (a.fx.name + '-renders')
        out.mkdir(parents=True, exist_ok=True)
        for raw in sorted(a.fx.glob('*.raw')):
            sig = np.fromfile(raw, dtype='<i4').astype(float) / 0x800000
            _, yi, _ = run(sig, AUDIT)
            yi.astype('<i4').tofile(out / raw.name)
        results.append('fx:audit renders written to %s' % out)

    print('\n'.join(results))
    print('%d failed' % failed if failed else 'all passed')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
