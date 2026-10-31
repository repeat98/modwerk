#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""DROPOUT's gates, run on the vendored dsp56kEmu alone (tools/fxtest.py, tools/fxhost.cpp).

    python3 -B sdk/drafts/dropout/verify.py            # every gate; exit 1 on a failure
    python3 -B sdk/drafts/dropout/verify.py --fx DIR   # also render fx:audit's signals in DIR into DIR-renders

None of them reads firmware; none of them can see the panel, the dispatcher's real register state, the frame
builder's real tempo word, the base's loader or the hardware.
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
BUFFER = 3072                        # Claims(buffer_words=3072)
FX1_BASE, FX2_BASE = 0x1c00, 0x4000  # an FX1 slot (not 2K-aligned) and an FX2 slot
FX1_WORD = (64 << 16) | (1 << 8)      # what an FX1 instance reads at r6+$13: FX2's page-2 slots 8 and 9
CLEAR = 8 * 16                       # the frames the first 8 calls take to clear the ring
FULL = 0x800000


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


def step_samples(bpm, step):
    """A step in samples, as the code derives it: q = 42,336,000 // tempo24 (16 x a MIDI clock), then
    3 q 2^STEP / 16; a tempo word outside 30-300 BPM (0 among them) is 120 BPM."""
    t24 = round(bpm * 24)
    t24 = t24 if 720 <= t24 <= 7200 else 2880
    q = 42336000 // t24
    return (3 * q << step) >> 4


def chance(rate, bpm, step):
    """The chance an error starts in a frame, as the code derives it (RATE's table point, no LFO fraction)."""
    t24 = round(bpm * 24)
    t24 = t24 if 720 <= t24 <= 7200 else 2880
    return ((manifest.R_TABLE[rate] * (t24 << 8)) >> 23 >> step) / FULL


def clip(v):
    return max(-FULL, min(FULL - 1, v))


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--fx', type=pathlib.Path)
    a = ap.parse_args(argv)
    build = F.assemble(HERE / 'dropout.asm', MODULE.dsp.ptable)
    results, failed = [], 0
    viol = 0

    def gate(name, ok, detail=''):
        nonlocal failed
        results.append('%s  %-36s %s' % ('PASS' if ok else 'FAIL', name, detail))
        failed += not ok

    def run(x, p, **kw):
        nonlocal viol
        kw.setdefault('ywords', BUFFER)
        kw.setdefault('ybase', FX1_BASE)
        # an FX1 buffer runs with an FX1 record: tempo24 at r6+$19, FX2's page-2 slots 8/9 (64, 1) at r6+$13
        kw.setdefault('fx1', FX1_WORD if kw['ybase'] < 0x4000 else None)
        y, yi, r = F.run(build, x, p, **kw)
        viol += r['violations']
        return y, yi, r

    gate('assembles, no mpysu, no rep', True, '%d program words + %d table words' % (len(build['words']), len(MODULE.dsp.ptable)))

    music = F.sine(997, 0.5, 0.25) + F.sine(3100, 0.5, 0.1) + 0.05 * np.random.default_rng(1).standard_normal(FS // 2)
    xi = F.to_raw(music)
    # the neutral settings, from a garbage state block and buffer, with and without a trig split
    worst = 0
    for mode in (0, 1, 2):
        for split in (0, 5):
            for p in (knobs(MODE=mode, STEP=mode), knobs(MODE=mode, MIX=0, RATE=127, SIZE=127, BITS=127, FRZ=127, FRM=127)):
                _, yi, _ = run(music, p, dirty=1, split=split, ybase=(FX1_BASE, FX2_BASE)[split > 0])
                worst = max(worst, int(np.abs(yi - xi[:len(yi)]).max()))
    gate('neutral is the dry, bit for bit', worst == 0,
         'defaults and MIX 0 (all else at 127), every MODE: largest difference %d LSB' % worst)

    # HOLD: each error holds the last good sample for 4 + 4 SIZE samples
    tone = F.sine(997, 1.0, 0.5)
    for size in (7, 63):
        n = 4 + 4 * size
        _, yi, _ = run(tone, knobs(RATE=80, SIZE=size, MODE=0))
        x0 = F.to_raw(tone)[:len(yi), 0]
        same = np.abs(np.diff(yi[:, 0])) <= 4
        runs = [(s + 1, e + 1) for s, e in segments(same)]          # the held frames
        lens = np.array([e - s for s, e in runs])
        held_ok = all(abs(int(yi[s, 0]) - int(x0[s - 1])) <= 4 for s, e in runs)
        ok = len(runs) > 8 and np.median(lens) == n and (lens == n).mean() > 0.9 and held_ok
        gate('HOLD holds %d samples (SIZE %d)' % (n, size), ok, '%d errors, %d%% exactly %d long, held at the last good: %s' % (
            len(runs), 100 * (lens == n).mean() if len(lens) else 0, n, held_ok))

    # PCKT: a lost packet of P samples is the packet before it again, by a gain falling from 1 to nothing
    for size, plen in ((0, 64), (127, 256)):
        _, yi, _ = run(tone, knobs(RATE=80, SIZE=size, MODE=1))
        x0 = F.to_raw(tone)[:len(yi), 0].astype(np.int64)
        segs = [(s, e) for s, e in segments(yi[:, 0] != x0) if s > CLEAR]
        whole = [(s, e) for s, e in segs if e - s == plen]
        step = FULL // plen
        errs = []
        for s, e in whole:
            g = 0x7fffff - step * np.arange(plen)
            want = (g * x0[s - plen:s]) >> 23
            errs.append(int(np.abs(yi[s:e, 0] - want).max()))
        ok = len(segs) > 8 and len(whole) / len(segs) > 0.9 and max(errs) <= 8
        gate('PCKT replays %d samples, fading' % plen, ok, '%d lost packets, %d exactly %d long, largest model error %d LSB' % (
            len(segs), len(whole), plen, max(errs) if errs else -1))

    # CIRC: 1-8 bad samples concealed by continuing the last slope; a longer burst muted
    hi = F.sine(3000, 1.0, 0.1)
    for size in (24, 56):
        n = 1 + size // 8
        _, yi, _ = run(hi, knobs(RATE=80, SIZE=size, MODE=2))
        x0 = F.to_raw(hi)[:len(yi), 0].astype(np.int64)
        segs = [(s, e) for s, e in segments(yi[:, 0] != x0) if s > CLEAR]
        whole = [(s, e) for s, e in segs if e - s == n]
        errs = []
        for s, e in whole:
            slope, v = clip(int(x0[s - 1] - x0[s - 2])), int(x0[s - 1])
            for t in range(s, e):
                v = clip(v + slope)
                errs.append(abs(int(yi[t, 0]) - v))
        ok = len(segs) > 8 and len(whole) / len(segs) > 0.9 and max(errs) <= 8
        gate('CIRC conceals %d samples' % n, ok, '%d bursts, %d exactly %d long, largest model error %d LSB' % (
            len(segs), len(whole), n, max(errs) if errs else -1))
    for size in (64, 127):
        n = 16 * (size - 63)
        _, yi, _ = run(tone, knobs(RATE=64 if size == 127 else 80, SIZE=size, MODE=2))
        lens = np.array([e - s for s, e in segments(np.abs(yi[:, 0]) <= 2) if e - s >= 4])
        ok = len(lens) > 4 and (lens == n).mean() > 0.9
        gate('CIRC mutes bursts of %d' % n, ok, '%d bursts, %d%% exactly %d long' % (
            len(lens), 100 * (lens == n).mean() if len(lens) else 0, n))

    # BITS: the ADPCM at 5, 4, 3 and 2 bits; the signal-to-noise ratio falls with the bits, loud and quiet alike
    snr = {}
    for bits in (26, 52, 77, 103):
        for lvl in (0.4, 0.01):
            t = F.sine(440, 0.5, lvl)
            y, _, _ = run(t, knobs(BITS=bits))
            seg = y[4000:, 0]
            nn = np.arange(4000, 4000 + len(seg))
            A = np.stack([np.sin(2 * np.pi * 440 * nn / FS), np.cos(2 * np.pi * 440 * nn / FS)], 1)
            fit = A @ np.linalg.lstsq(A, seg, rcond=None)[0]
            snr[bits, lvl] = F.dbfs(fit) - F.dbfs(seg - fit)
    order = (26, 52, 77, 103)
    falls = all(snr[order[i], l] > snr[order[i + 1], l] for l in (0.4, 0.01) for i in range(3))
    gate('BITS: ADPCM at 5, 4, 3, 2 bits', falls and snr[103, 0.01] > 6,
         'SNR %s dB (-8 dBFS tone), %s dB (-40 dBFS)' % ('/'.join('%.0f' % snr[k, 0.4] for k in order),
                                                           '/'.join('%.0f' % snr[k, 0.01] for k in order)))

    # the step follows the tempo: every step frozen, its first 64 frames pass, so the passing runs start a step apart
    noise = 0.3 * np.random.default_rng(2).standard_normal(int(0.75 * FS))
    for bpm, step, base in ((120.0, 1, FX1_BASE), (96.5, 1, FX1_BASE), (174.0, 0, FX1_BASE), (0.0, 1, FX1_BASE),
                            (174.0, 0, FX2_BASE), (20.0, 1, FX2_BASE), (400.0, 1, FX2_BASE)):
        want = step_samples(bpm, step)
        sig = noise[:CLEAR + 4 * want + 200]
        _, yi, _ = run(sig, knobs(FRZ=127, FRM=0, STEP=step), tempo=bpm, ybase=base)
        x0 = F.to_raw(sig)[:len(yi), 0]
        live = segments(yi[:, 0] == x0)[1:]                          # after the clearing calls' dry
        starts = np.array([s for s, e in live if e - s >= 32])
        gaps = np.diff(starts)
        loops = [int(np.abs(yi[s + 64:s + want - 64, 0] - yi[s:s + want - 128, 0]).max()) for s in starts[:-1]]
        ok = len(gaps) >= 2 and (gaps == want).all() and all(e - s == 64 for s, e in live if e - s >= 32) and max(loops) <= 4
        where = ('FX1', 'FX2')[base >= 0x4000]
        tag = ('%.1f BPM' % bpm) if 30 <= bpm <= 300 else 'tempo %g (120)' % bpm
        gate('FRZ steps of %d, %s %s' % (want, where, tag), ok,
             'step starts %s apart; the frame loops within %d LSB' % (','.join(str(g) for g in gaps), max(loops) if loops else -1))
    # FRZ 64: about half the steps freeze
    want = step_samples(174.0, 0)
    sig = 0.3 * np.random.default_rng(3).standard_normal(CLEAR + 65 * want)
    _, yi, _ = run(sig, knobs(FRZ=64, FRM=0, STEP=0), tempo=174.0)
    x0 = F.to_raw(sig)[:len(yi), 0]
    frozen = [bool((yi[s + 100:s + want - 8, 0] != x0[s + 100:s + want - 8]).any()) for s in range(CLEAR, len(yi) - want, want)]
    gate('FRZ 64 freezes about half the steps', 0.35 < np.mean(frozen) < 0.65, '%d of %d steps' % (sum(frozen), len(frozen)))

    # RATE counts in steps: twice the tempo, twice the errors a second
    counts = {}
    sig = F.sine(997, 2.0, 0.5)
    for bpm in (87.0, 174.0):
        _, yi, _ = run(sig, knobs(RATE=100, SIZE=1, MODE=0, STEP=1), tempo=bpm)
        counts[bpm] = sum(1 for s, e in segments(np.abs(np.diff(yi[:, 0])) <= 4) if e - s >= 6)
        expect = chance(100, bpm, 1) * (len(yi) - CLEAR)
        counts[bpm, 'want'] = expect
    ok = all(abs(counts[b] / counts[b, 'want'] - 1) < 0.25 for b in (87.0, 174.0)) and abs(counts[174.0] / counts[87.0] / 2 - 1) < 0.2
    gate('RATE follows the tempo', ok, '%d errors in 2 s at 87 BPM (want %.0f), %d at 174 (want %.0f)' % (
        counts[87.0], counts[87.0, 'want'], counts[174.0], counts[174.0, 'want']))

    # a garbage buffer is never heard: replayed packets and frozen frames only ever hold what passed
    quiet = F.sine(300, 0.5, 0.01)
    worst = -200.0
    for mode in (1, 2):
        y, _, _ = run(quiet, knobs(RATE=127, SIZE=127, MODE=mode, FRZ=127, FRM=127, STEP=0), dirty=1)
        worst = max(worst, F.peak_dbfs(y))
    gate('a garbage buffer is never heard', worst <= F.peak_dbfs(quiet) + 0.01,
         'peak %.1f dBFS from a %.1f dBFS input over a garbage buffer' % (worst, F.peak_dbfs(quiet)))

    # idle: after a burst, digital silence in every mode, with the codec, the errors and the freezes at work
    burst = np.concatenate([F.sine(440, 0.3, 0.9), np.zeros(3 * FS)])
    for mode in (0, 1, 2):
        _, yi, _ = run(burst, knobs(RATE=100, SIZE=127, BITS=103, FRZ=64, FRM=127, MODE=mode))
        tail = int(np.abs(yi[-FS // 2:]).max())
        gate('idle is digital silence (%s)' % ('HOLD', 'PCKT', 'CIRC')[mode], tail == 0, 'last 0.5 s peak %d LSB' % tail)

    gate('memory guard, every run', viol == 0, '%d words written outside the state, audio and buffer' % viol)

    dear = knobs(**MODULE.dear)
    worst = 0
    for split in (0, 5):
        _, _, r = run(music, dear, split=split, events=[(40, SLOT['MIX'], 127), (80, SLOT['MIX'], 0)])
        worst = max(worst, r['maxInstructionsPerCall'])
    gate('instructions per frame', worst / 16 < 330, '%d a 16-frame call, %.0f a frame (stock SPRING REV: 314)' % (worst, worst / 16))

    # fx:audit: the codec at its coarsest, the module's one nonlinearity; errors and freezes off (they are
    # deliberate discontinuities, read as residual)
    AUDIT = knobs(BITS=127, RATE=0, FRZ=0, MIX=127)
    if a.fx:
        out = a.fx.parent / (a.fx.name + '-renders')
        out.mkdir(parents=True, exist_ok=True)
        for raw in sorted(a.fx.glob('*.raw')):
            sig = np.fromfile(raw, dtype='<i4').astype(float) / FULL
            _, yi, _ = run(np.concatenate([np.zeros(CLEAR), sig]), AUDIT)
            yi[CLEAR:].astype('<i4').tofile(out / raw.name)
        results.append('fx:audit renders written to %s' % out)

    print('\n'.join(results))
    print('%d failed' % failed if failed else 'all passed')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
