#!/usr/bin/env python3
"""AMIGA's gate: the engine in amiga.c (crunch, stretch, crossfade, declick) compiled for the host.

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


U32 = ctypes.c_uint32


class Voice(ctypes.Structure):
    _fields_ = [(name, U32) for name in ('rest', 'left', 'rem', 'back')] + [('l', ctypes.c_int32), ('r', ctypes.c_int32), ('phase', U32), ('al', ctypes.c_int32), ('ar', ctypes.c_int32),
                ('count', U32), ('ic', ctypes.c_int32 * 4)] + [(name, U32) for name in (
                    'pos', 'window', 'grain', 'played', 'since', 'got', 'first', 'length', 'sample', 'flags', 'origin', 'end')] + [
                ('last', ctypes.c_int32 * 2), ('off', ctypes.c_int32 * 2)] + [(name, U32) for name in (
                    'fade', 'jump', 'tail', 'down', 'xk', 'xlen', 'xstep', 'xnext')] + [
                ('page', ctypes.c_void_p), ('pfirst', U32), ('pcount', U32), ('slice', U32), ('strt', U32)]


LOCATE = ctypes.CFUNCTYPE(ctypes.c_size_t, ctypes.c_void_p, U32, ctypes.POINTER(U32), ctypes.POINTER(U32))


class Sample(ctypes.Structure):
    _fields_ = [('locate', LOCATE), ('ctx', ctypes.c_void_p), ('frames', U32), ('bytes', U32), ('channels', U32)]


def big_endian(frames, nbytes=2, channels=2):
    """frames ([(l, r)] of 16-bit values) as the instrument's sample pages hold them: big-endian words, the low byte 0x5a for 24 bits."""
    out = bytearray()
    for f in frames:
        for c in range(channels):
            out += (f[c] & 0xffff).to_bytes(2, 'big') + (b'\x5a' if nbytes == 3 else b'')
    return ctypes.create_string_buffer(bytes(out), len(out))


def sample(buf, frames, nbytes=2, channels=2, page=0):
    """The sample in one run, or (page > 0) in pages of that many frames, each found through `locate`."""
    s = Sample(LOCATE(), ctypes.cast(buf, ctypes.c_void_p), frames, nbytes, channels)
    if page:
        base = ctypes.addressof(buf)

        def locate(ctx, frame, first, count):
            first[0], count[0] = frame - frame % page, page
            return base + (frame - frame % page) * nbytes * channels
        s.locate = LOCATE(locate)
        s.keep = s.locate  # the callback must outlive the calls
    return s


with tempfile.TemporaryDirectory() as tmp:
    so = pathlib.Path(tmp) / 'amiga.so'
    subprocess.run(['cc', '-O2', '-shared', '-fPIC', '-DAMIGA_HOST', '-o', str(so), str(HERE / 'amiga.c')], check=True)
    lib = ctypes.CDLL(str(so))
    lib.amiga_strt.restype = lib.amiga_frame.restype = ctypes.c_uint32

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
    garbage = Voice(l=0x5a5a5a5a, r=0x5a5a5a5a, phase=0xa5a5a5a5)
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

    KEEP, OVER, NONE = -1, -2, 0xffffffff
    W = 44100
    wave_ = [int(0.5 * 0x7fffffff * math.sin(2 * math.pi * 110 * i / 44100)) >> 16 << 16 for i in range(W)]
    pages = big_endian([(x >> 16, x >> 16) for x in wave_])
    whole = sample(pages, W)

    def play(window, spd, grn, pitch=1.0, loop=0, calls=20000, smooth=True, readable=True):
        """Render calls of 16 output samples from a model reader that reads `pitch` frames a sample, as amiga_render
        drives the engine. Returns (restarts, calls until OVER, the frames handed to the DSP)."""
        v = Voice()
        lib.amiga_note(ctypes.byref(v), window)
        restarts, read, reader, stream = [], 0.0, 0, []
        play.rested = 0
        for n in range(calls):
            src = int(read + 16 * pitch) - int(read)
            read += 16 * pitch
            a = (ctypes.c_int32 * (2 * src))(*[wave_[(reader + i // 2) % W] for i in range(2 * src)])
            reader += src
            rest = lib.amiga_rest(ctypes.byref(v), 16, src, spd)
            if smooth and v.xlen:
                lib.amiga_cross(ctypes.byref(v), a, src, ctypes.byref(whole))
            if smooth and not rest:
                lib.amiga_declick(ctypes.byref(v), a, src)
            stream.extend(a[0::2])
            if rest:
                play.rested += 1
                if rest == 1:
                    lib.amiga_pass(ctypes.byref(v), 16, grn)
                continue
            at = lib.amiga_stretch(ctypes.byref(v), 16, src, spd, grn, loop)
            if at == OVER:
                return restarts, n + 1, stream
            if at != KEEP:
                restarts.append((16 * (n + 1), at))
                lib.amiga_seek(ctypes.byref(v), at, reader % W if readable else NONE, 0)
                reader = at
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
    check('the crossfades leave no step where the restarts were', step(stream) < 1.5 * step(wave_) < step(raw) / 4, f'{step(stream)} {step(wave_)} {step(raw)}')
    restarts, over, stream = play(W, 32, 30)
    check('speed 1/2 makes the note twice as long', over is not None and abs(over * 16 - 2 * W) <= 2400, str(over))
    check('without a step', step(stream) < 1.5 * step(wave_), f'{step(stream)} {step(wave_)}')
    restarts, over, stream = play(W, 0, 0, calls=2000)
    check('speed 0 holds the first grain and never ends', over is None and len(restarts) > 100 and all(at < 200 for _, at in restarts))
    restarts, over, stream = play(W, 127, 64)
    check('faster than the pitch reads, it skips ahead without a step', len(restarts) > 5 and step(stream) < 1.5 * step(wave_), f'{step(stream)} {step(wave_)}')
    restarts, over, stream = play(W, 64, 64, pitch=0.75)
    check('a fourth down at its own length, it skips ahead without a step', len(restarts) > 5 and step(stream) < 1.5 * step(wave_), f'{step(stream)} {step(wave_)}')
    stream = play(W, 64, 64, pitch=0.75, readable=False)[2]
    check('a sample it cannot read fades the step out instead', step(stream) < 3 * step(wave_), f'{step(stream)} {step(wave_)}')
    restarts, over, stream = play(W, 127, 64, loop=1)
    check('a looped note wraps and never ends', over is None and restarts and all(0 <= at < W for _, at in restarts))
    restarts, over, stream = play(W, 64, 64, loop=1)
    check('a looped note at speed 1 and pitch 0 is left to stock\'s own loop', over is None and restarts == [], str(restarts[:3]))
    check('a note that was not measured is left alone', play(0, 0, 0, pitch=2.0, calls=500)[:2] == ([], None))
    check('and rests whatever its pitch', play.rested >= 498, str(play.rested))

    # The crossfade itself: the last grain from the sample, fading out under the new one.
    def crossed(tail, down=0, n=600, xnext=400, s=whole, new=0x10000):
        v = Voice(xnext=xnext)
        lib.amiga_seek(ctypes.byref(v), 0, tail, down)
        a = (ctypes.c_int32 * (2 * n))(*([new] * (2 * n)))
        for at in range(0, n, 7):  # in render calls of 7 frames
            if v.xlen:
                lib.amiga_cross(ctypes.byref(v), ctypes.byref(a, 8 * at), min(7, n - at), ctypes.byref(s))
        return v, [x >> 16 for x in a[0::2]], [x >> 16 for x in a[1::2]]
    v, l, r = crossed(1000)
    old = [x >> 16 for x in wave_[1000:1400]]
    check('after a restart the first frame is the last grain\'s next one', l[0] == old[0] and r[0] == old[0], f'{l[0]} {old[0]}')
    check('the last grain fades out in a straight line over half the cycle\'s frames',
          all(abs(l[k] - (old[k] + (1 - old[k]) * k / 400)) <= 2 for k in range(400)), str([(l[k], old[k]) for k in (0, 200, 399)]))
    check('then the new grain plays alone, untouched', l[400:] == [1] * 200 and v.xlen == 0)
    v, l, r = crossed(1000, down=1)
    check('a backward reader\'s last grain is read downwards', all(abs(l[k] - ((wave_[1000 - k] >> 16) * (400 - k) + k) / 400) <= 2 for k in range(400)), str(l[:3]))
    paged = sample(pages, W, page=7)
    check('read through pages of 7 frames it is the same, either way',
          crossed(1000, s=paged)[1] == crossed(1000)[1] and crossed(1000, down=1, s=paged)[1] == crossed(1000, down=1)[1])
    check('past the sample\'s end the last grain is silence', crossed(W - 10)[1][10:20] == [round(k / 400) for k in range(10, 20)])
    st = [(i * 37 % 65536 - 32768, -(i * 91 % 65536 - 32768) // 2) for i in range(500)]
    for nbytes in (2, 3):
        for ch in (1, 2):
            buf = big_endian(st, nbytes, ch)
            v, l, r = crossed(100, s=sample(buf, 500, nbytes, ch), xnext=1000, n=50)
            want_r = [f[1] if ch == 2 else f[0] for f in st[100:150]]
            check(f'{8 * nbytes}-bit {"stereo" if ch == 2 else "mono"} pages read as their top 16 bits',
                  l[0] == st[100][0] and r[0] == want_r[0] and all(abs(l[k] - st[100 + k][0]) <= 1 + abs(st[100 + k][0]) * k // 1000 + 64 for k in range(50))
                  and all(abs(r[k] - want_r[k]) <= 1 + abs(want_r[k]) * k // 1000 + 64 for k in range(50)))
    v = Voice(xnext=4)
    lib.amiga_seek(ctypes.byref(v), 0, 1000, 0)
    check('a crossfade lasts at least 16 frames', v.xlen == 16)
    v = Voice(xnext=400)
    lib.amiga_seek(ctypes.byref(v), 0, NONE, 0)
    check('without the sample there is no crossfade, and the step fades out', v.xlen == 0 and v.jump == 1)
    v = Voice(xnext=400)
    lib.amiga_seek(ctypes.byref(v), 0, 1000, 0)
    lib.amiga_seek(ctypes.byref(v), 0, 2000, 0)
    check('a restart that cuts a crossfade short fades the step out too, and crosses from the newer grain', v.jump == 1 and v.xlen == 400 and v.tail == 2000)

    # A note at rest: speed 64 at the sample's own pitch, the reader where the note should be.
    restarts, over, stream = play(W, 64, 64)
    check('a note at its own speed and pitch rests through nearly all of it', restarts == [] and play.rested > 0.95 * W / 16, str(play.rested))
    check('and still ends at its end', over is not None and abs(over * 16 - W) <= 2400, str(over))
    play(W, 64, 64, pitch=2.0)
    check('an octave up it never rests', play.rested == 0, str(play.rested))
    play(W, 63, 64)
    check('nor at any other speed', play.rested == 0, str(play.rested))

    # RATE: the reader runs at rate/full of its speed, either way, and the place with it.
    def rated(spd, rate, full, per, level, back=0, calls=20000):
        v = Voice()
        lib.amiga_note(ctypes.byref(v), W)
        v.back = back
        restarts, read = [], 0.0
        for n in range(calls):
            src = int(read + 16 * per) - int(read)
            read += 16 * per
            at = lib.amiga_stretch_rate(ctypes.byref(v), 16, src, spd, 64, 0, rate, full, level)
            if at == OVER:
                return restarts, n + 1
            if at != KEEP:
                restarts.append(at)
                lib.amiga_seek(ctypes.byref(v), at, NONE, back)
        return restarts, None
    restarts, over = rated(64, 0x1f80, 0x3f00, 0.5, 1)
    check('at half RATE the note lasts twice as long and nothing restarts', restarts == [] and over is not None and abs(over * 16 - 2 * W) <= 2400, f'{len(restarts)} {over}')
    restarts, over = rated(64, 0x1f80, 0x3f00, 1.0, 0)
    check('at half RATE an octave up it restarts every cycle and still lasts twice as long', len(restarts) > 20 and over is not None and abs(over * 16 - 2 * W) <= 2400, f'{len(restarts)} {over}')
    restarts, over = rated(32, 0x4000, 0x4000, 1.0, 0, back=1)
    check('backwards at half speed the note lasts twice as long too', len(restarts) > 20 and over is not None and abs(over * 16 - 2 * W) <= 2400, f'{len(restarts)} {over}')
    # SYNC: the same fraction carries the project's tempo over the sample's (BPM x 24).
    restarts, over = rated(64, 2160, 2880, 1.0, 0)
    check('SYNC: a 120 BPM sample at 90 BPM lasts a third longer at its own pitch', len(restarts) > 20 and over is not None and abs(over * 16 - W * 4 // 3) <= 2400, f'{len(restarts)} {over}')
    restarts, over = rated(64, 2880, 2160, 1.0, 0)
    check('SYNC: a 90 BPM sample at 120 BPM lasts three quarters as long', len(restarts) > 20 and over is not None and abs(over * 16 - W * 3 // 4) <= 2400, f'{len(restarts)} {over}')
    restarts, over = rated(127, 256 * 7200, 256 * 720, 1.0, 0)
    check('SYNC: the fastest case (300 over 30 BPM, SPD 127) does not overflow', over is not None and abs(over * 16 - W * 64 // 1270) <= 2400, f'{over}')
    v = Voice()
    lib.amiga_note(ctypes.byref(v), W)
    for _ in range(100):
        lib.amiga_stretch(ctypes.byref(v), 16, 16, 64, 64, 0)
    turned = lib.amiga_face(ctypes.byref(v), 1, 0)
    check('a reader that turns round goes on from where it is, counted from the other end',
          turned == 1 and v.back == 1 and v.grain == W - 1600 and v.played == 0 and v.pos == (W - 1600) << 6 and v.xlen == 0,
          f'{turned} {v.grain} {v.pos >> 6}')
    check('and one that does not turn changes nothing', lib.amiga_face(ctypes.byref(v), 1, 0) == 0 and v.grain == W - 1600)
    check('PCH shifts a semitone for each twelfth root of two of length', all(abs(lib.amiga_shift(round(100 * 2 ** (k / 12))) - 1280 * k) <= 130 for k in range(13)))
    check('PCH: half the length is an octave down, and never further than an octave', lib.amiga_shift(50) == -15360 and lib.amiga_shift(25) == -15360 and lib.amiga_shift(400) == 15360 and lib.amiga_shift(100) == 0 and lib.amiga_shift(0) == 0)
    restarts, over, stream = play(W, 64, 127, pitch=4.0)
    check('a long cycle two octaves up still restarts on time', len(restarts) > 5 and over is not None and abs(over * 16 - W) <= 5000, str(over))
    check('and crosses without a step', step(stream) < 1.5 * step(wave_) * 4, f'{step(stream)} {step(wave_)}')

    v = Voice(jump=1); v.last[0], v.last[1] = 0x40000000, -0x40000000
    a = (ctypes.c_int32 * 128)(*([0] * 128))
    lib.amiga_declick(ctypes.byref(v), a, 64)
    check('after a restart the first frame continues the last one', abs(a[0] - 0x40000000) < 0x1000 and abs(a[1] + 0x40000000) < 0x1000, f'{a[0]:x}')
    check('and the offset has run out 32 frames on', all(x == 0 for x in a[64:]) and a[62] != 0)
    v = Voice(jump=1); v.last[0], v.last[1] = 0x7fffffff, -0x80000000
    a = (ctypes.c_int32 * 4)(-0x80000000, 0x7fffffff, 0, 0)
    lib.amiga_declick(ctypes.byref(v), a, 2)
    check('a full-scale step neither wraps nor overflows', a[0] > 0x70000000 and a[1] < -0x70000000, f'{a[0]:x} {a[1]:x}')
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
