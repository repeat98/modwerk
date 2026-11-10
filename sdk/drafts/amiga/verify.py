#!/usr/bin/env python3
"""AMIGA's gate: amiga_crunch, amiga_stretch and amiga_strt from amiga.c compiled for the host.

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
    _fields_ = [('l', ctypes.c_int32), ('r', ctypes.c_int32), ('phase', ctypes.c_uint32), ('ic', ctypes.c_int32 * 4)] + [
        (name, ctypes.c_uint32) for name in ('pos', 'window', 'grain', 'played', 'since', 'first', 'length', 'sample', 'flags')]


with tempfile.TemporaryDirectory() as tmp:
    so = pathlib.Path(tmp) / 'amiga.so'
    subprocess.run(['cc', '-O2', '-shared', '-fPIC', '-DAMIGA_HOST', '-o', str(so), str(HERE / 'amiga.c')], check=True)
    lib = ctypes.CDLL(str(so))
    lib.amiga_strt.restype = ctypes.c_uint32

    def crunch(samples, srr, bits, led=0, voice=None):
        voice = voice or Voice(phase=0x10000)
        a = (ctypes.c_int32 * len(samples))(*samples)
        lib.amiga_crunch(ctypes.byref(voice), a, len(samples) // 2, srr, bits, led)
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
    check('SRR 16 holds every second frame for two, unsmoothed',
          all(out[4 * i:4 * i + 2] == out[4 * i + 2:4 * i + 4] == ramp[4 * i:4 * i + 2] for i in range(16)))
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
    check('out-of-range controls are clamped', crunch(ramp, 255, 255) == crunch(ramp, 127, 12))

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

    def play(window, spd, grn, pitch=1.0, loop=0, calls=20000):
        """Render calls of 16 output samples; the reader reads pitch frames a sample. Returns (restarts, calls until OVER)."""
        v = Voice()
        lib.amiga_note(ctypes.byref(v), window)
        restarts, read = [], 0.0
        for n in range(calls):
            src = int(read + 16 * pitch) - int(read)
            read += 16 * pitch
            at = lib.amiga_stretch(ctypes.byref(v), 16, src, spd, grn, loop)
            if at == OVER:
                return restarts, n + 1
            if at != KEEP:
                restarts.append((16 * (n + 1), at))
        return restarts, None

    W = 44100
    restarts, over = play(W, 64, 64)
    check('speed 1 at pitch 0 never restarts the reader', restarts == [], str(restarts[:3]))
    check('and ends at the note\'s end', over is not None and abs(over * 16 - W) <= 2400, str(over))
    restarts, over = play(W, 64, 64, pitch=2.0)
    cycle = 96 + 64 * 64 // 2
    check('an octave up, speed 1 restarts every cycle', len(restarts) > 10 and all(b[0] - a[0] in range(cycle, cycle + 17) for a, b in zip(restarts, restarts[1:])))
    check('each restart is where the sample would be at pitch 0', all(abs(at - t) <= 1 for t, at in restarts), str(restarts[:3]))
    check('so the note lasts as long as at pitch 0', over is not None and abs(over * 16 - W) <= 2400, str(over))
    restarts, over = play(W, 32, 30)
    check('speed 1/2 makes the note twice as long', over is not None and abs(over * 16 - 2 * W) <= 2400, str(over))
    restarts, over = play(W, 0, 0, calls=2000)
    check('speed 0 holds the first grain and never ends', over is None and len(restarts) > 100 and all(at == 0 for _, at in restarts))
    restarts, over = play(W, 127, 64, loop=1)
    check('a looped note wraps and never ends', over is None and restarts and all(0 <= at < W for _, at in restarts))
    restarts, over = play(W, 64, 64, loop=1)
    check('a looped note at speed 1 and pitch 0 is left to stock\'s own loop', over is None and restarts == [], str(restarts[:3]))
    check('a note that was not measured is left alone', play(0, 0, 0, pitch=2.0, calls=500) == ([], None))
    for length in (200, 44100, 65536, 10_000_000, 44_860_416):
        worst = max(abs(lib.amiga_strt(at, length) * length / 32768 - at) for at in range(0, length - length // 100, max(1, length // 997)))
        check(f'STRT for a frame lands within the knob\'s step ({length} frames)', worst <= length / 32768 * 2 + 1, f'{worst:.0f}')
    check('STRT stays in the knob\'s range', lib.amiga_strt(99, 100) <= 0x7fff and lib.amiga_strt(5, 0) == 0 and lib.amiga_strt(200, 100) == 0x7fff)

if shutil.which('m68k-elf-gcc'):
    r = subprocess.run([sys.executable, '-B', str(HERE / 'generate.py'), '--check'], capture_output=True, text=True)
    check('amiga_core.s matches amiga.c', r.returncode == 0, (r.stdout + r.stderr).strip()[-300:])
else:
    print('[SKIP] amiga_core.s regeneration: m68k-elf-gcc not on PATH')

sys.exit(1 if failed else 0)
