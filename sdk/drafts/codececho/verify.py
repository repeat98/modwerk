#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""CODEC ECHO's gates, run on the vendored dsp56kEmu alone (tools/fxtest.py, tools/fxhost.cpp).

    python3 -B sdk/drafts/codececho/verify.py            # every gate; exit 1 on a failure
    python3 -B sdk/drafts/codececho/verify.py --fx DIR   # also render fx:audit's signals in DIR into DIR-renders

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

spec = importlib.util.spec_from_file_location('codececho_manifest', HERE / 'manifest.py')
manifest = importlib.util.module_from_spec(spec)
spec.loader.exec_module(manifest)
MODULE = manifest.MODULE
DEFAULTS = [p.default or 0 for p in MODULE.params]
SLOT = {p.name.decode(): i for i, p in enumerate(MODULE.params) if p.name}
FS = 44100
LINE = 15870                       # Claims(buffer_words=15870): Sidechain's window above stays untouched
CLEAR = 124 * 16                   # the frames the first 124 calls take to clear the line
MAX_D = 30600                      # half-rate samples


def knobs(**kw):
    v = list(DEFAULTS)
    for k, x in kw.items():
        v[SLOT[k]] = x
    return v


def delay_samples(time, bpm):
    """The echo's delay at the full rate, as the code derives it: clocks x (42,336,000 / tempo24) / 32 half-rate
    samples, halved until it fits the line."""
    ticks = 42336000 // round(bpm * 24)
    d = manifest.CLOCKS[time] * ticks // 32
    for _ in range(3):
        if d > MAX_D:
            d //= 2
    return 2 * max(d, 2)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--fx', type=pathlib.Path)
    a = ap.parse_args(argv)
    build = F.assemble(HERE / 'codececho.asm', MODULE.dsp.ptable)
    results, failed = [], 0

    def gate(name, ok, detail=''):
        nonlocal failed
        results.append('%s  %-36s %s' % ('PASS' if ok else 'FAIL', name, detail))
        failed += not ok

    viol = 0

    def run(x, p, **kw):
        nonlocal viol
        kw.setdefault('ywords', LINE)
        kw.setdefault('ybase', 0x4000)
        y, yi, r = F.run(build, x, p, **kw)
        viol += r['violations']
        return y, yi, r

    gate('assembles, no mpysu, no rep', True, '%d program words + %d table words' % (len(build['words']), len(MODULE.dsp.ptable)))

    music = F.sine(997, 1.0, 0.25) + F.sine(3100, 1.0, 0.1) + 0.05 * np.random.default_rng(1).standard_normal(FS)
    xi = F.to_raw(music)
    worst = 0
    for p in (knobs(), knobs(FDBK=127, LOSS=127, DROP=127, PKT=0, TIME=11)):
        for split in (0, 5):
            _, yi, _ = run(music, p, dirty=1, split=split)
            worst = max(worst, int(np.abs(yi - xi[:len(yi)]).max()))
    gate('MIX 0 is the dry, bit for bit', worst == 0, 'largest difference %d LSB' % worst)

    # the line is cleared before anything is heard: garbage buffer, silence in, MIX 127 -> silence out
    y, yi, _ = run(np.zeros(2 * FS), knobs(MIX=127, FDBK=127, DROP=0), dirty=1)
    gate('a garbage line is never heard', int(np.abs(yi).max()) == 0, 'peak %d LSB over 2 s' % int(np.abs(yi).max()))

    # TIME follows the tempo: the first echo of an impulse, at three tempos and three divisions
    for bpm, time in ((120.0, 8), (96.5, 5), (200.0, 11), (60.0, 11)):
        n = int(0.2 * FS) + delay_samples(time, bpm) + FS // 2
        imp = np.zeros(n)
        at = CLEAR + 4410
        imp[at] = 0.8
        y, _, _ = run(imp, knobs(MIX=127, FDBK=0, LOSS=0, DROP=0, TIME=time), tempo=bpm)
        got = int(np.argmax(np.abs(y[:, 0]))) - at
        want = delay_samples(time, bpm)
        gate('TIME %s at %.1f BPM' % (manifest.TIME_LABELS[time], bpm), abs(got - want) <= 3,
             'echo after %d samples, want %d' % (got, want))

    # repeats decay with FDBK and darken with LOSS; after the input stops the line goes to digital silence
    burst = np.concatenate([np.zeros(CLEAR), F.sine(700, 0.1, 0.8), np.zeros(int(9.5 * FS))])
    y, yi, _ = run(burst, knobs(MIX=127, FDBK=127, LOSS=0, DROP=0, TIME=8), tempo=120)
    step = delay_samples(8, 120)
    first = CLEAR + step
    levels = [F.dbfs(y[first + k * step:first + k * step + 4410, 0]) for k in range(6)]
    decays = np.diff(levels)
    gate('FDBK 127 decays each repeat', (decays < 0).all() and (decays > -1.5).all(),
         'repeats %s dB' % ' '.join('%.1f' % v for v in levels))
    # FDBK 127 is 0.95 a repeat; at 64 (0.475) the repeats must reach digital silence, not a limit cycle
    y, yi, _ = run(burst, knobs(MIX=127, FDBK=64, LOSS=0, DROP=0, TIME=8), tempo=120)
    gate('the line settles to silence', int(np.abs(yi[-FS // 2:]).max()) == 0,
         'FDBK 64: last 0.5 s peak %d LSB, %.0f s after the burst' % (int(np.abs(yi[-FS // 2:]).max()), len(burst) / FS - 0.1))
    tones = {}
    for loss in (0, 127):
        t5 = np.concatenate([np.zeros(CLEAR), F.sine(5000, 0.5, 0.5), np.zeros(FS)])
        y, _, _ = run(t5, knobs(MIX=127, FDBK=0, LOSS=loss, DROP=0, TIME=8), tempo=120)
        e = CLEAR + delay_samples(8, 120)
        tones[loss] = F.dbfs(y[e + 2000:e + 20000, 0])
    gate('LOSS darkens the echo', tones[127] < tones[0] - 12, '5 kHz echo %.1f dBFS at LOSS 0, %.1f at 127' % (tones[0], tones[127]))

    # DROP: lost packets (MUTE) leave holes of PKT samples in the echo of a steady tone
    steady = np.concatenate([np.zeros(CLEAR), F.sine(440, 4.0, 0.5)])
    for pkt in (0, 64):
        y, _, _ = run(steady, knobs(MIX=127, FDBK=0, LOSS=0, DROP=64, PKT=pkt, PLC=0, TIME=2), tempo=120)
        env = np.abs(y[CLEAR + 3 * FS // 2:, 0])
        quiet = np.convolve(env < 0.01, np.ones(32) / 32, mode='same') > 0.99
        m = np.r_[False, quiet, False].astype(int)
        runs = np.flatnonzero(np.diff(m) == -1) - np.flatnonzero(np.diff(m) == 1) + 31   # the 32-sample window's edge
        want = 2 * (64 + 7 * pkt + pkt // 2)
        holes = runs[runs > want // 2]
        ok = len(holes) > 3 and abs(np.median(holes) / want - 1) < 0.15
        gate('DROP holes of PKT %d' % pkt, ok, '%d holes, median %d samples, want about %d (full rate)' % (
            len(holes), np.median(holes) if len(holes) else -1, want))
    # RPT repeats the packet before instead: no holes, the tone carries on
    y, _, _ = run(steady, knobs(MIX=127, FDBK=0, LOSS=0, DROP=64, PKT=64, PLC=1, TIME=2), tempo=120)
    env = np.abs(y[CLEAR + 3 * FS // 2:, 0])
    quiet = np.convolve(env < 0.01, np.ones(32) / 32, mode='same') > 0.99
    gate('PLC RPT leaves no holes', quiet.sum() == 0, '%d silent samples' % quiet.sum())

    # a TIME change fades the read head out and back in: no step bigger than the tone's own
    ev = [(CLEAR // 16 + 3000, SLOT['TIME'], 5)]
    tone = np.concatenate([np.zeros(CLEAR), F.sine(300, 3.0, 0.5)])
    y, _, _ = run(tone, knobs(MIX=127, FDBK=0, LOSS=0, DROP=0, TIME=8), tempo=120, events=ev)
    jump = np.abs(np.diff(y[CLEAR + FS:, 0])).max()
    gate('TIME moves without a click', jump < 1.5 * np.abs(np.diff(tone)).max(), 'largest step %.4f' % jump)

    gate('memory guard, every run', viol == 0, '%d words written outside the state, audio and line' % viol)

    dear = knobs(**MODULE.dear)
    _, _, r = run(np.concatenate([np.zeros(CLEAR), music[:FS // 2]]), dear)
    gate('instructions per frame', r['maxInstructionsPerCall'] / 16 < 250,
         '%d a 16-frame call, %.0f a frame' % (r['maxInstructionsPerCall'], r['maxInstructionsPerCall'] / 16))

    # fx:audit: the echo with feedback and the codec at work, no packets lost (lost packets are deliberate gaps).
    AUDIT = knobs(MIX=127, FDBK=96, LOSS=127, DROP=0, TIME=2)
    if a.fx:
        out = a.fx.parent / (a.fx.name + '-renders')
        out.mkdir(parents=True, exist_ok=True)
        for raw in sorted(a.fx.glob('*.raw')):
            sig = np.fromfile(raw, dtype='<i4').astype(float) / 0x800000
            _, yi, _ = run(np.concatenate([np.zeros(CLEAR), sig]), AUDIT)
            yi[CLEAR:].astype('<i4').tofile(out / raw.name)
        results.append('fx:audit renders written to %s' % out)

    print('\n'.join(results))
    print('%d failed' % failed if failed else 'all passed')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
