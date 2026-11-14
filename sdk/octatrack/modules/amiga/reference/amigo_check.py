#!/usr/bin/env python3
"""The stretch's crossfades against Amigo's: fade width and the clicks left at the restarts.

    clang++ -std=c++17 -O1 reference/amigo_host.cpp -framework AudioToolbox -framework CoreFoundation -o <folder>/host
    <folder>/host state <folder>/default.plist        # the plug-in's own default state, never committed
    python3 -B reference/amigo_check.py <folder>

macOS, with Amigo installed by its owner; needs numpy. The plug-in is hosted as a black box: its saved state is pointed
at a sine, a note is played and the output recorded. The model is amiga.c's engine with a model reader standing in for
the Octatrack's. A crossfade between two grains of a sine dips where their phases differ, so the dips' width is the
fade's. Nothing of the plug-in is kept in the repository.
"""
import ctypes, math, pathlib, plistlib, struct, subprocess, sys, wave
import numpy as np

here = pathlib.Path(sys.argv[1]).resolve()
U = ctypes.c_uint32
STRETCH, LEN, CYC, INTERP = 265611013, 1725499947, 1367412556, 479783141  # Amigo's parameter ids; LEN 0 is 100 %, 1 is 2000 %


class Voice(ctypes.Structure):
    _fields_ = [(n, U) for n in ('rest', 'left', 'rem', 'back')] + [('l', ctypes.c_int32), ('r', ctypes.c_int32), ('phase', U), ('al', ctypes.c_int32),
                ('ar', ctypes.c_int32), ('count', U), ('ic', ctypes.c_int32 * 4)] + [(n, U) for n in (
                    'pos', 'window', 'grain', 'played', 'since', 'got', 'first', 'length', 'sample', 'flags', 'origin', 'end')] + [
                ('last', ctypes.c_int32 * 2), ('off', ctypes.c_int32 * 2)] + [(n, U) for n in ('fade', 'jump', 'tail', 'down', 'xk', 'xlen', 'xstep', 'xnext')] + [
                ('page', ctypes.c_void_p), ('pfirst', U), ('pcount', U), ('slice', U), ('strt', U)]


class Sample(ctypes.Structure):
    _fields_ = [('locate', ctypes.c_void_p), ('ctx', ctypes.c_void_p), ('frames', U), ('bytes', U), ('channels', U)]


N = 88200
sine = 0.8 * np.sin(2 * np.pi * 441 * np.arange(N) / 44100)
with wave.open(str(here / 'sine.wav'), 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(44100); w.writeframes((sine * 32767).astype('<i2').tobytes())
p = plistlib.load(open(here / 'default.plist', 'rb'))  # the default state with its sample path set (a JUCE value tree string)
s, old = p['jucePluginState'], b'pathname\x00\x01\x02\x05\x00'
assert s.count(old) == 1
b = str(here / 'sine.wav').encode() + b'\x00'
size = bytes([1, len(b) + 1]) if len(b) + 1 < 256 else bytes([2, (len(b) + 1) & 255, (len(b) + 1) >> 8])
p['jucePluginState'] = s.replace(old, b'pathname\x00' + size + b'\x05' + b)
plistlib.dump(p, open(here / 'sine.plist', 'wb'))


def amigo(cyc):
    """Amigo at 200 %, linear interpolation on."""
    args = [str(here / 'host'), 'render', '--state', str(here / 'sine.plist'), '--seconds', '1.2', '--hold', '1.15', '--out', str(here / 'out.raw'),
            '--set', str(STRETCH), '1', '--set', str(LEN), str(100 / 1900), '--set', str(CYC), str(cyc), '--set', str(INTERP), '1']
    subprocess.run(args, check=True)
    d = (here / 'out.raw').read_bytes()
    return np.array(struct.unpack('<%df' % (len(d) // 4), d)[0::2])


subprocess.run(['cc', '-O2', '-shared', '-fPIC', '-DAMIGA_HOST', '-o', str(here / 'amiga.so'), str(pathlib.Path(__file__).resolve().parents[1] / 'amiga.c')], check=True)
lib = ctypes.CDLL(str(here / 'amiga.so'))


def ours(grn, seconds=1.0):
    """SPD 32 (twice as long) at the sample's pitch, 16 bits, as amiga_render drives the engine."""
    q = (sine * 32767).astype('>i2')
    be = ctypes.create_string_buffer(q.tobytes(), len(q) * 2)
    smp = Sample(None, ctypes.cast(be, ctypes.c_void_p), N, 2, 1)
    v = Voice(); lib.amiga_note(ctypes.byref(v), N)
    pcm, stream, reader = [int(x) << 16 for x in q.astype(np.int32)], [], 0
    for _ in range(int(seconds * 44100 / 16)):
        a = (ctypes.c_int32 * 32)(*[pcm[(reader + i // 2) % N] for i in range(32)])
        reader += 16
        if v.xlen: lib.amiga_cross(ctypes.byref(v), a, 16, ctypes.byref(smp))
        lib.amiga_declick(ctypes.byref(v), a, 16)
        stream.extend(a[0::2])
        at = lib.amiga_stretch(ctypes.byref(v), 16, 16, 32, grn, 0)
        if at >= 0:
            lib.amiga_seek(ctypes.byref(v), at, reader, 0); reader = at
    return np.array(stream, float) / 2 ** 31


def width(y):
    env = np.sqrt(np.convolve(y * y, np.ones(100) / 100, 'same')) * math.sqrt(2)
    low, runs, i = env < 0.97 * np.median(env), [], 0
    while i < len(low):
        j = i
        while j < len(low) and low[j]: j += 1
        if j > i: runs.append(j - i)
        i = j + 1
    return int(np.median(runs)) if runs else 0


def clicks(y):
    """Energy above 6 kHz in 2 ms windows, the 95th percentile in dB of full scale: a sine has none of its own."""
    X = np.fft.rfft(y); X[np.fft.rfftfreq(len(y), 1 / 44100) < 6000] = 0; h = np.fft.irfft(X, len(y))
    return np.percentile(20 * np.log10(np.sqrt((h[: len(h) // 88 * 88].reshape(-1, 88) ** 2).mean(1)) + 1e-12), 95)


for cyc, grn in ((0.2, 46), (0.8, 85)):  # GRN for about Amigo's cycle at that CYL
    a, m = amigo(cyc)[4000:40000], ours(grn)[4000:40000]
    print(f'GRN {grn} ({96 + grn * grn // 4}-sample cycle): fade width Amigo {width(a)}, Amiga {width(m)} samples; '
          f'above 6 kHz Amigo {clicks(a):.1f} dB (its 8-bit word), Amiga {clicks(m):.1f} dB (16 bits)')
