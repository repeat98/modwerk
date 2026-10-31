#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""SHORTWAVE's gates, run on the vendored dsp56kEmu alone (tools/fxtest.py, tools/fxhost.cpp).

    python3 -B sdk/drafts/shortwave/verify.py            # every gate; exit 1 on a failure
    python3 -B sdk/drafts/shortwave/verify.py --fx DIR   # also render fx:audit's signals in DIR into DIR-renders

What each gate pins is in its line. None of them reads firmware; none of them can see the panel, the dispatcher's
real register state, the base's loader or the hardware.
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

spec = importlib.util.spec_from_file_location('shortwave_manifest', HERE / 'manifest.py')
manifest = importlib.util.module_from_spec(spec)
spec.loader.exec_module(manifest)
MODULE = manifest.MODULE
DEFAULTS = [p.default or 0 for p in MODULE.params]
SLOT = {p.name.decode(): i for i, p in enumerate(MODULE.params) if p.name}
FS = 44100


def knobs(**kw):
    v = list(DEFAULTS)
    for k, x in kw.items():
        v[SLOT[k]] = x
    return v


def peak_freq(x, lo=20, hi=20000, fine=False):
    """The strongest component's frequency; fine: refined by a parabola through the log magnitudes (Hann)."""
    x = np.asarray(x, dtype=float)
    w = np.hanning(len(x))
    s = np.abs(np.fft.rfft(x * w))
    f = np.fft.rfftfreq(len(x), 1 / FS)
    band = np.flatnonzero((f >= lo) & (f <= hi))
    i = band[np.argmax(s[band])]
    if not fine:
        return f[i]
    a, b, c = np.log(s[i - 1:i + 2] + 1e-30)
    return f[i] + 0.5 * (a - c) / (a - 2 * b + c) * (f[1] - f[0])


def level_at(x, freq):
    """The amplitude (dB) of the component at exactly freq: the Hann-windowed DTFT there, so no bin's scalloping."""
    x = np.asarray(x, dtype=float)
    w = np.hanning(len(x))
    e = np.exp(-2j * np.pi * freq * np.arange(len(x)) / FS)
    return 20 * np.log10(2 * abs(np.sum(x * w * e)) / w.sum() + 1e-30)


def shift_hz(k):
    """The SSB detector's shift at TUNE k, as manifest.py's S table means it."""
    return 500.0 * (k / 127) ** 2


def hilbert_image_db(lo, hi):
    """The worst image (dB) the table's allpass pair leaves between lo and hi: tan(phase error / 2)."""
    def q23(w):
        return (w - (1 << 24) if w & 0x800000 else w) / float(1 << 23)
    coef = [q23(w) for w in manifest.H_TABLE]
    w = 2 * np.pi * np.geomspace(lo, hi, 400) / FS
    z = np.exp(-1j * w)

    def chain(cs):
        h = np.ones_like(z)
        for a in cs:
            h *= (a + z) / (1 + a * z)
        return h
    d = np.angle(chain(coef[3:]) / chain(coef[:3]))     # Q against I: -90 degrees
    err = np.abs(d + np.pi / 2)
    return 20 * np.log10(np.tan(err.max() / 2))


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--fx', type=pathlib.Path, help="fx:audit's plan folder; renders its .raw signals beside it")
    ap.add_argument('--audit-mode', choices=('am', 'usb'), default='am', help='MODE for the --fx renders')
    ap.add_argument('--audit-driv', type=int, default=127, help='DRIV for the --fx renders')
    a = ap.parse_args(argv)
    build = F.assemble(HERE / 'shortwave.asm', MODULE.dsp.ptable)
    results, failed = [], 0

    def gate(name, ok, detail=''):
        nonlocal failed
        results.append('%s  %-34s %s' % ('PASS' if ok else 'FAIL', name, detail))
        failed += not ok

    words = len(build['words'])
    gate('assembles, no mpysu, no rep', True, '%d program words + %d table words' % (words, len(MODULE.dsp.ptable)))

    tone = F.sine(997, 1.0, 0.25) + F.sine(3100, 1.0, 0.1)
    xi = F.to_raw(tone)
    # MIX 0 is the dry, bit for bit, from garbage state, with trig splits, whatever the other knobs say
    worst = 0
    for p in (knobs(), knobs(TUNE=127, BAND=0, FADE=127, RATE=127, NOIS=127, DRIV=127, CRAK=127, DRFT=127),
              knobs(MODE=2, TUNE=127, BAND=0, FADE=127, RATE=127, NOIS=127, DRIV=127, CRAK=127, DRFT=127)):
        for split in (0, 5):
            _, yi, r = F.run(build, tone, p, dirty=1, split=split)
            worst = max(worst, int(np.abs(yi - xi[:len(yi)]).max()))
            gate('guard (MIX 0, split %d)' % split, r['violations'] == 0, r['stderr'].strip()[:80])
    gate('MIX 0 is the dry, bit for bit', worst == 0, 'largest difference %d LSB' % worst)

    # silence in, the receiver's own noises off: exact digital silence, from garbage state too
    # (in USB and LSB the whistle is off, so TUNE may be anything)
    for name, p in (('AM', knobs(MIX=127, NOIS=0, CRAK=0, TUNE=0)),
                    ('USB', knobs(MIX=127, NOIS=0, CRAK=0, TUNE=100, MODE=1, DRFT=127)),
                    ('LSB', knobs(MIX=127, NOIS=0, CRAK=0, TUNE=127, MODE=2))):
        y, yi, r = F.run(build, np.zeros(FS // 2), p, dirty=1)
        gate('silence stays silent (%s, dirty)' % name, int(np.abs(yi).max()) == 0, 'peak %d LSB' % int(np.abs(yi).max()))

    # idle: a burst, then three seconds of silence; the last half second under -90 dBFS
    burst = np.concatenate([F.sine(440, 0.3, 0.9), np.zeros(3 * FS)])
    for name, p in (('BAND 0', knobs(MIX=127, NOIS=0, CRAK=0, TUNE=0, BAND=0, DRIV=127)),
                    ('BAND 127', knobs(MIX=127, NOIS=0, CRAK=0, TUNE=0, BAND=127, DRIV=127)),
                    ('USB, BAND 127', knobs(MIX=127, NOIS=0, CRAK=0, TUNE=90, BAND=127, DRIV=127, MODE=1)),
                    ('LSB, BAND 0', knobs(MIX=127, NOIS=0, CRAK=0, TUNE=127, BAND=0, DRIV=127, MODE=2))):
        y, yi, r = F.run(build, burst, p)
        tail = y[-FS // 2:]
        gate('idle settles (%s)' % name, F.peak_dbfs(tail) < -90, 'tail peak %.1f dBFS' % F.peak_dbfs(tail))

    # a clean station: an in-band tone comes out near the dry's level
    clean = knobs(MIX=127, NOIS=0, CRAK=0, TUNE=0, FADE=0, DRIV=0, BAND=127)
    t1k = F.sine(1000, 1.0, 0.25)
    y, yi, r = F.run(build, t1k, clean)
    d = F.dbfs(y[FS // 4:, 0]) - F.dbfs(t1k[FS // 4:])
    gate('in-band level at DRIV 0', abs(d) < 1.5, '%+.2f dB against the dry' % d)

    # BAND: a 4 kHz tone loses far more at 0 than at 127
    t4k = F.sine(4000, 1.0, 0.25)
    lv = {}
    for band in (0, 127):
        y, _, _ = F.run(build, t4k, knobs(MIX=127, NOIS=0, CRAK=0, TUNE=0, FADE=0, DRIV=0, BAND=band))
        lv[band] = F.dbfs(y[FS // 4:, 0])
    gate('BAND narrows the receiver', lv[0] < lv[127] - 20, '4 kHz: %.1f dBFS at 0, %.1f at 127' % (lv[0], lv[127]))

    # TUNE: the whistle sits at 40 Hz * 2^(7k/127)
    for k in (40, 64, 100):
        y, _, _ = F.run(build, np.zeros(FS), knobs(MIX=127, NOIS=0, CRAK=0, FADE=0, TUNE=k, BAND=127))
        want = 40 * 2 ** (7 * k / 127)
        got = peak_freq(y[FS // 4:, 0])
        gate('whistle at TUNE %d' % k, abs(got / want - 1) < 0.02, '%.1f Hz, want %.1f' % (got, want))

    # the whistle's oscillator keeps its level over 20 s at the fastest step
    y, _, _ = F.run(build, np.zeros(10 * FS), knobs(MIX=127, NOIS=0, CRAK=0, FADE=0, TUNE=127, BAND=127))
    a0, a1 = F.dbfs(y[FS:2 * FS, 0]), F.dbfs(y[-FS:, 0])
    gate('whistle level holds over 10 s', abs(a1 - a0) < 0.5, '%.2f dB then %.2f dB' % (a0, a1))

    # SSB: the table's allpass pair, from the words the build loads
    img_band, img_wide = hilbert_image_db(300, 3000), hilbert_image_db(170, 4300)
    gate('allpass pair (table words)', img_band < -45,
         'image %.1f dB at 300 Hz-3 kHz, %.1f dB at 170 Hz-4.3 kHz' % (img_band, img_wide))

    # SSB: a 1 kHz tone moves by the shift, up in USB and down in LSB, within 1 %
    clean_ssb = dict(MIX=127, NOIS=0, CRAK=0, FADE=0, DRIV=0, BAND=127)
    t1k_long = F.sine(1000, 1.25, 0.1)
    for mode, sign in ((1, 1), (2, -1)):
        worst, got_list = 0.0, []
        for k in (48, 90, 127):
            y, _, _ = F.run(build, t1k_long, knobs(MODE=mode, TUNE=k, **clean_ssb))
            got = peak_freq(y[FS // 4:, 0], 100, 5000, fine=True) - 1000
            want = sign * shift_hz(k)
            worst = max(worst, abs(got / want - 1))
            got_list.append('%+.1f/%+.1f' % (got, want))
        gate('shift, %s' % ('USB' if mode == 1 else 'LSB'), worst < 0.01,
             'TUNE 48/90/127: %s Hz (got/want), worst %.3f %%' % (' '.join(got_list), 100 * worst))

    # SSB: the other sideband, measured: tones over 300 Hz-3 kHz at TUNE 90 (251 Hz). The receiver after the
    # detector (low-pass, clip, output pole) weighs the two sidebands differently, so each ratio is corrected
    # by that path's own gain at the two frequencies, measured in AM and divided by the high-pass before it.
    k_img = 90
    d_img = shift_hz(k_img)
    c_hp = 0x7d5da0 / float(1 << 23)

    def hp_db(f):
        z = np.exp(-2j * np.pi * f / FS)
        return 20 * np.log10(abs(c_hp * (1 - z) / (1 - c_hp * z)))

    post = {}

    def post_db(f):
        if f not in post:
            y, _, _ = F.run(build, F.sine(f, 0.5, 0.1), knobs(MODE=0, TUNE=0, **clean_ssb))
            post[f] = level_at(y[FS // 4:, 0], f) - 20 * np.log10(0.1) - hp_db(f)
        return post[f]

    worst_img, rows = -200.0, []
    for f in (300, 500, 1000, 2000, 3000):
        for mode, sign in ((1, 1), (2, -1)):
            y, _, _ = F.run(build, F.sine(f, 0.5, 0.1), knobs(MODE=mode, TUNE=k_img, **clean_ssb))
            fw, fi = f + sign * d_img, f - sign * d_img
            ratio = level_at(y[FS // 4:, 0], abs(fi)) - level_at(y[FS // 4:, 0], abs(fw))
            ratio -= post_db(abs(fi)) - post_db(abs(fw))
            worst_img = max(worst_img, ratio)
            rows.append('%d%s %.0f' % (f, 'U' if mode == 1 else 'L', ratio))
    gate('other sideband, 300 Hz-3 kHz', worst_img < -30, 'worst %.1f dB; %s' % (worst_img, ', '.join(rows)))

    # SSB: the shifted station keeps the level the AM receiver gives it (1 kHz tone, USB TUNE 64 -> 1127 Hz)
    y, _, _ = F.run(build, t1k_long[:FS], knobs(MODE=1, TUNE=64, **clean_ssb))
    # the detector's own gain: the output against the input, less the high-pass at 1 kHz and the path after it
    lv_ssb = level_at(y[FS // 4:, 0], 1000 + shift_hz(64)) - 20 * np.log10(0.1) - hp_db(1000) - post_db(1000 + shift_hz(64))
    gate('SSB keeps the level', abs(lv_ssb) < 0.5, '%+.2f dB, the detector\'s gain' % lv_ssb)

    # the oscillator's amplitude is renormalised once a call: after 1 s of TUNE jumps with DRFT 127 in AM, a
    # switch to USB gives the same level as a fresh start
    ev = [(b, SLOT['TUNE'], (127, 3, 77, 20)[(b // 7) % 4]) for b in range(0, 2756, 7)]
    ev += [(2756, SLOT['MODE'], 1), (2756, SLOT['TUNE'], 64), (2756, SLOT['DRFT'], 0)]
    sig = np.concatenate([np.zeros(FS), F.sine(1000, 0.75, 0.1)])
    y, _, _ = F.run(build, sig, knobs(MODE=0, TUNE=127, DRFT=127, **clean_ssb), events=ev)
    lv_after = level_at(y[FS + FS // 4:, 0], 1000 + shift_hz(64)) - 20 * np.log10(0.1) - hp_db(1000) - post_db(1000 + shift_hz(64))
    gate('oscillator level holds (renormalised)', abs(lv_after - lv_ssb) < 0.2,
         '%+.2f dB after the TUNE jumps against a fresh start' % (lv_after - lv_ssb))

    # MODE switches glide: AM -> USB -> AM on a tone moves the output no more than the tone itself does
    events = [(200, SLOT['MODE'], 1), (600, SLOT['MODE'], 0)]
    y, yi, r = F.run(build, t1k, knobs(MODE=0, TUNE=0, **clean_ssb), events=events)
    step = np.abs(np.diff(y[:, 0])).max()
    gate('MODE moves without a step', step < 2.5 * np.abs(np.diff(t1k)).max(), 'largest step %.4f' % step)

    # FADE: the station's short-time level wanders at FADE 127 and holds at FADE 0
    steady = F.sine(800, 4.0, 0.25)

    def wander(p):
        y, _, _ = F.run(build, steady, p)
        seg = y[FS:, 0]
        frames = seg[:len(seg) // 2205 * 2205].reshape(-1, 2205)
        lv = 20 * np.log10(np.sqrt(np.mean(frames ** 2, axis=1)) + 1e-9)
        return lv.max() - lv.min()

    w0 = wander(knobs(MIX=127, NOIS=0, CRAK=0, TUNE=0, FADE=0, BAND=127))
    w1 = wander(knobs(MIX=127, NOIS=0, CRAK=0, TUNE=0, FADE=127, RATE=100, BAND=127))
    gate('FADE moves the level', w0 < 0.5 and w1 > 6, 'spread %.2f dB at 0, %.1f dB at 127' % (w0, w1))

    # NOIS and CRAK add their noises to a silent input
    n_lv = {}
    for name, p in (('NOIS', knobs(MIX=127, CRAK=0, TUNE=0, NOIS=127, FADE=0)),
                    ('CRAK', knobs(MIX=127, NOIS=0, TUNE=0, CRAK=127, FADE=0))):
        y, _, _ = F.run(build, np.zeros(FS), p)
        n_lv[name] = F.dbfs(y[:, 0])
    gate('NOIS and CRAK sound', n_lv['NOIS'] > -40 and n_lv['CRAK'] > -60,
         'NOIS %.1f dBFS, CRAK %.1f dBFS' % (n_lv['NOIS'], n_lv['CRAK']))

    # a MIX jump glides: no output step larger than the signal's own largest step plus the glide's
    events = [(200, SLOT['MIX'], 127), (600, SLOT['MIX'], 0)]
    y, yi, r = F.run(build, t1k, knobs(NOIS=0, CRAK=0, TUNE=0, FADE=0, BAND=127, MIX=0), events=events)
    step = np.abs(np.diff(y[:, 0])).max()
    gate('MIX moves without a step', step < 2.5 * np.abs(np.diff(t1k)).max(), 'largest step %.4f' % step)

    # the dearest settings: bounded, and the cost
    dear = knobs(**MODULE.dear)
    loud = F.sine(120, 3.0, 0.99) + 0.0
    y, yi, r = F.run(build, loud, dear, split=7)
    gate('dearest settings stay bounded', np.abs(yi).max() <= 0x7fffff and r['violations'] == 0,
         'peak %.1f dBFS' % F.peak_dbfs(y))
    y, yi, r = F.run(build, loud[:FS // 2], dear)
    frames = 16
    per_frame = r['maxInstructionsPerCall'] / frames
    gate('instructions per frame', per_frame < 314,
         '%d a 16-frame call, %.0f a frame (stock SPRING REV: 314 in octabam\'s benchmark)' % (r['maxInstructionsPerCall'], per_frame))

    # fx:audit renders the processing at its dearest with the receiver's own generators (static, crackle, the
    # whistle, the fading) off: they add noise and a tone on purpose, which the audit would read as aliasing.
    # --audit-mode usb renders the SSB detector in tune (TUNE 0: the analytic pair and the blend, no shift, which
    # the audit would read as a tone that moved).
    AUDIT = knobs(MIX=127, BAND=127, DRIV=a.audit_driv, TUNE=0, FADE=0, NOIS=0, CRAK=0, DRFT=0,
                  MODE={'am': 0, 'usb': 1}[a.audit_mode])
    if a.fx:
        out = a.fx.parent / (a.fx.name + '-renders')
        out.mkdir(parents=True, exist_ok=True)
        for raw in sorted(a.fx.glob('*.raw')):
            sig = np.fromfile(raw, dtype='<i4').astype(float) / 0x800000
            _, yi, _ = F.run(build, sig, AUDIT)
            yi.astype('<i4').tofile(out / raw.name)
        results.append('fx:audit renders written to %s' % out)

    print('\n'.join(results))
    print('%d failed' % failed if failed else 'all passed')
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
