#!/usr/bin/env python3
"""AMIGA's gate: the engine in amiga.c (crunch, stretch, blend, declick) compiled for the host.

    python3 -B verify.py            # needs cc; m68k-elf-gcc for the generated-unit check

It checks the engine only. The START and render glue, the page and the machine
list need the base: the emulator or a unit (TESTING.md).
"""
import ctypes
import math
import pathlib
import shutil
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
failed = []


def check(name, ok, detail=''):
    print(('[PASS] ' if ok else '[FAIL] ') + name + (f': {detail}' if detail and not ok else ''))
    if not ok:
        failed.append(name)


class Voice(ctypes.Structure):
    _fields_ = [('l', ctypes.c_int32), ('r', ctypes.c_int32), ('phase', ctypes.c_uint32), ('al', ctypes.c_int32), ('ar', ctypes.c_int32),
                ('count', ctypes.c_uint32), ('ic', ctypes.c_int32 * 4)] + [(name, ctypes.c_uint32) for name in (
                    'pos', 'frac', 'window', 'grain', 'played', 'since', 'got', 'first', 'length', 'sample', 'flags')] + [
                ('last', ctypes.c_int32 * 2), ('off', ctypes.c_int32 * 2)] + [(name, ctypes.c_uint32) for name in (
                    'fade', 'jump', 'hi', 'floor', 'mix_from', 'mix_len', 'mix_wait', 'mix_k', 'mix_step', 'planned')] + [
                ('hist', ctypes.c_int16 * 4096)]


with tempfile.TemporaryDirectory() as tmp:
    so = pathlib.Path(tmp) / 'amiga.so'
    subprocess.run(['cc', '-O2', '-shared', '-fPIC', '-DAMIGA_HOST', '-o', str(so), str(HERE / 'amiga.c')], check=True)
    lib = ctypes.CDLL(str(so))
    lib.amiga_strt.restype = lib.amiga_frame.restype = lib.amiga_rate.restype = ctypes.c_uint32

    def crunch(samples, srr, bits, led=0, voice=None):
        voice = voice or Voice(phase=0x10000)
        a = (ctypes.c_int32 * len(samples))(*samples)
        lib.amiga_crunch(ctypes.byref(voice), a, len(samples) // 2, 16 * 65536 // (16 + srr), bits, led)  # srr: 16/(16+srr) of the rate
        return list(a)

    ramp = [((i * 0x01234567) & 0x7fffffff) - 0x40000000 for i in range(64)]
    check('SRR 0, BITS 16, LED off leaves every sample as it was', crunch(ramp, 0, 12) == ramp)
    out = crunch(ramp, 0, 4)
    check('BITS 8 keeps the top 8 bits', all(v & 0xffffff == 0 for v in out))
    check('BITS 8 rounds to nearest (within half a step)', all(abs(o - i) <= 0x800000 for o, i in zip(out, ramp)))
    check('BITS 4 keeps the top 4 bits', all(v & 0x0fffffff == 0 for v in crunch(ramp, 0, 0)))
    top = crunch([0x7fffffff, -0x80000000], 0, 4)
    check('full scale does not wrap', top[0] > 0 and top[1] == -0x80000000, str(top))
    out = crunch(ramp, 16, 12)  # half the storage rate
    pair = lambda i: [((ramp[4 * i - 2 + c] >> 4) + (ramp[4 * i + c] >> 4)) // 2 << 4 for c in (0, 1)]
    check('SRR 16 holds each stored sample for two frames', all(out[4 * i:4 * i + 2] == out[4 * i + 2:4 * i + 4] for i in range(16)))
    check('SRR 16 stores the average of the two frames it replaces',
          out[:2] == ramp[:2] and all(max(abs(o - e) for o, e in zip(out[4 * i:4 * i + 2], pair(i))) <= 32 for i in range(1, 16)))
    out = crunch(ramp, 127, 12)
    runs = sum(1 for i in range(2, 64, 2) if out[i] != out[i - 2]) + 1
    check('SRR 127 stores about one frame in nine', 3 <= runs <= 4, str(runs))
    for led in (0, 1):
        v = Voice(phase=0x10000)
        whole = crunch(ramp, 40, 4, led)
        parts = crunch(ramp[:22], 40, 4, led, v) + crunch(ramp[22:], 40, 4, led, v)
        check(f'split into two calls it renders the same (LED {led})', whole == parts)
    garbage = Voice(0x5a5a5a5a, 0x5a5a5a5a, 0xa5a5a5a5)
    check('a garbage state takes a sample at once', crunch(ramp, 127, 12, 0, garbage)[:2] == ramp[:2])
    check('out-of-range controls are clamped', crunch(ramp, 10 ** 6, 255) == crunch(ramp, 240, 12))

    def tone(hz, n=4096, amp=0.5):
        return [int(amp * 0x7fffffff * math.sin(2 * math.pi * hz * (i // 2) / 44100)) for i in range(2 * n)]

    def level(hz):  # dB against the input, left channel, after the filter has settled
        out = crunch(tone(hz), 0, 12, 1)[2048::2]
        rms = lambda x: math.sqrt(sum(v * v for v in x) / len(x))
        return 20 * math.log10(max(rms(out), 1) / rms(tone(hz)[2048::2]))

    check('LED: flat at 800 Hz', abs(level(800)) < 1.0, f'{level(800):.1f} dB')
    check('LED: about -3 dB at 3.3 kHz', -4.5 < level(3300) < -1.5, f'{level(3300):.1f} dB')
    check('LED: about -12 dB at 6.6 kHz', -17 < level(6600) < -10, f'{level(6600):.1f} dB')
    st = [v if i % 2 == 0 else -v // 3 for i, v in enumerate(tone(700))]
    both = crunch(st, 20, 4, 1)
    check('a stereo sample filters each channel on its own', both[0::2] == crunch(tone(700), 20, 4, 1)[0::2] and both[1::2] != both[0::2])
    loud = crunch(tone(1000, amp=1.0), 0, 12, 1)
    check('full scale through the filter neither wraps nor loses level', max(loud) > 0x70000000 and min(loud) < -0x70000000
          and all(abs(loud[i] - loud[i - 2]) < 0x30000000 for i in range(2, len(loud))))
    silence = crunch([0] * 8192, 0, 12, 1)
    check('silence stays silent through the filter', max(map(abs, silence)) == 0, str(max(map(abs, silence))))

    KEEP, OVER = -1, -2
    W = 44100
    wave_ = [int(0.5 * 0x7fffffff * math.sin(2 * math.pi * 110 * i / 44100)) for i in range(W)]

    def play(window, spd, grn, pitch=1.0, loop=0, calls=20000, smooth=True):
        """Render calls of 16 output samples from a model reader that reads `pitch` frames a sample.
        Returns (restarts, calls until OVER, the frames handed to the DSP)."""
        v = Voice()
        lib.amiga_note(ctypes.byref(v), window)
        restarts, read, reader, stream = [], 0.0, 0, []
        for n in range(calls):
            src = int(read + 16 * pitch) - int(read)
            read += 16 * pitch
            a = (ctypes.c_int32 * (2 * src))(*[wave_[(reader + i // 2) % W] for i in range(2 * src)])
            reader += src
            if smooth:
                lib.amiga_blend(ctypes.byref(v), a, src)
                lib.amiga_declick(ctypes.byref(v), a, src)
            stream.extend(a[0::2])
            at = lib.amiga_stretch(ctypes.byref(v), 16, src, spd * 64, 96 + grn * grn // 4, loop)  # spd 64: the note's own speed
            if at == OVER:
                return restarts, n + 1, stream
            if at != KEEP:
                restarts.append((16 * (n + 1), at))
                reader = at
                lib.amiga_seek(ctypes.byref(v), at)
        return restarts, None, stream

    step = lambda x: max(abs(b - a) for a, b in zip(x, x[1:]))
    restarts, over, stream = play(W, 64, 64)
    check('speed 1 at pitch 0 never restarts the reader', restarts == [], str(restarts[:3]))
    check('and hands the DSP the sample untouched', stream[:W] == wave_)
    check('and ends at the note\'s end', over is not None and abs(over * 16 - W) <= 2400, str(over))
    restarts, over, stream = play(W, 64, 64, pitch=2.0)
    cycle = 96 + 64 * 64 // 4
    check('an octave up, speed 1 restarts every cycle', len(restarts) > 10 and all(b[0] - a[0] in range(cycle, cycle + 17) for a, b in zip(restarts, restarts[1:])))
    check('each restart is where the sample would be at pitch 0', all(abs(at - t) <= 48 for t, at in restarts), str(restarts[:3]))
    check('so the note lasts as long as at pitch 0', over is not None and abs(over * 16 - W) <= 2400, str(over))
    raw = play(W, 64, 64, pitch=2.0, smooth=False)[2]
    check('the fades leave no step where the restarts were', step(stream) < 1.5 * step(wave_) < step(raw) / 4, f'{step(stream)} {step(wave_)} {step(raw)}')
    restarts, over, stream = play(W, 32, 30)
    check('speed 1/2 makes the note twice as long', over is not None and abs(over * 16 - 2 * W) <= 2400, str(over))
    check('without a step', step(stream) < 1.5 * step(wave_), f'{step(stream)} {step(wave_)}')
    restarts, over, stream = play(W, 0, 0, calls=2000)
    check('speed 0 holds the first grain and never ends', over is None and len(restarts) > 100 and all(at < 200 for _, at in restarts))
    restarts, over, stream = play(W, 127, 64)
    check('faster than the pitch reads, it skips ahead with the step faded out', len(restarts) > 5 and step(stream) < 3 * step(wave_), f'{step(stream)} {step(wave_)}')
    restarts, over, stream = play(W, 127, 64, loop=1)
    check('a looped note wraps and never ends', over is None and restarts and all(0 <= at < W for _, at in restarts))
    restarts, over, stream = play(W, 64, 64, loop=1)
    check('a looped note at speed 1 and pitch 0 is left to stock\'s own loop', over is None and restarts == [], str(restarts[:3]))
    check('a note that was not measured is left alone', play(0, 0, 0, pitch=2.0, calls=500)[:2] == ([], None))
    restarts, over, stream = play(W, 64, 127, pitch=4.0)
    check('a long cycle two octaves up, beyond the memory, still restarts on time', len(restarts) > 5 and over is not None and abs(over * 16 - W) <= 5000, str(over))

    v = Voice(jump=1); v.last[0], v.last[1] = 0x40000000, -0x40000000
    a = (ctypes.c_int32 * 128)(*([0] * 128))
    lib.amiga_declick(ctypes.byref(v), a, 64)
    check('after a restart the first frame continues the last one', abs(a[0] - 0x40000000) < 0x1000 and abs(a[1] + 0x40000000) < 0x1000, f'{a[0]:x}')
    check('and the offset has run out 32 frames on', all(x == 0 for x in a[64:]) and a[62] != 0)
    v = Voice(jump=1); v.last[0], v.last[1] = 0x7fffffff, -0x80000000
    a = (ctypes.c_int32 * 4)(-0x80000000, 0x7fffffff, 0, 0)
    lib.amiga_declick(ctypes.byref(v), a, 2)
    check('a full-scale step neither wraps nor overflows', a[0] > 0x70000000 and a[1] < -0x70000000, f'{a[0]:x} {a[1]:x}')
    pct = [lib.amiga_percent(v) for v in range(128)]
    check('STCH reads 50 to 2100 percent, rising, then HOLD', pct[0] == 50 and pct[32] == 100 and pct[52] == 200 and pct[126] == 2100
          and pct[127] == 0 and all(b > a for a, b in zip(pct, pct[1:127])), str(pct[:4]))
    check('CYL reads 100 to 4132 samples, 1000 at 60', [lib.amiga_cycle(v) for v in (0, 60, 127, 999)] == [100, 1000, 4132, 4132])
    hz = [lib.amiga_hz(v) for v in range(38)]
    check('RATE reads a tracker\'s note rates, then the sample\'s own', hz[0] == 4143 and hz[29] == 22168 and hz[35] == 31388 and hz[36] == hz[37] == 44100
          and all(abs(b / a - 2 ** (1 / 12)) < 0.01 for a, b in zip(hz, hz[1:36])), str(hz[:3]))
    check('and stores at that share of 44.1 kHz', all(abs(lib.amiga_rate(v) / 65536 - hz[v] / 44100) < 1e-4 for v in range(38)))
    check('PCH shifts a semitone for each twelfth root of two of length', all(abs(lib.amiga_shift(round(100 * 2 ** (k / 12))) - 1280 * k) <= 130 for k in range(13))
          and lib.amiga_shift(200) == 15360 and lib.amiga_shift(2100) == 15360 and lib.amiga_shift(100) == 0 and lib.amiga_shift(50) == -15360
          and lib.amiga_shift(0) == 0 and abs(lib.amiga_shift(71) + 7680) <= 200, str([lib.amiga_shift(x) for x in (100, 141, 200, 71, 50)]))
    for length in (200, 44100, 65536, 10_000_000, 44_860_416):
        worst = max(abs(lib.amiga_strt(at, length) * length / 32768 - at) for at in range(0, length - length // 100, max(1, length // 997)))
        check(f'STRT for a frame lands within the knob\'s step ({length} frames)', worst <= length / 32768 * 2 + 1, f'{worst:.0f}')
    check('the frame STRT starts at', all(abs(lib.amiga_frame(f, n) - f * n // 32768) <= 1 for f in (0, 1, 12345, 0x7fff) for n in (200, 65537, 44_860_416)))
    check('STRT stays in the knob\'s range', lib.amiga_strt(99, 100) <= 0x7fff and lib.amiga_strt(5, 0) == 0 and lib.amiga_strt(200, 100) == 0x7fff)

if shutil.which('m68k-elf-gcc'):
    r = subprocess.run([sys.executable, '-B', str(HERE / 'generate.py'), '--check'], capture_output=True, text=True)
    check('amiga_core.s matches amiga.c', r.returncode == 0, (r.stdout + r.stderr).strip()[-300:])
else:
    print('[SKIP] amiga_core.s regeneration: m68k-elf-gcc not on PATH')

sys.exit(1 if failed else 0)
