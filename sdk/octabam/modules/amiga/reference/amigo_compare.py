#!/usr/bin/env python3
"""Listening clips and band energies: the installed Amigo Audio Unit against a host model of this draft.

    clang++ -std=c++17 -O1 amigo_host.cpp -framework AudioToolbox -framework CoreFoundation -o <folder>/host
    <folder>/host state <folder>/default.plist        # the plug-in's own default state, never committed
    python3 -B amigo_compare.py <folder>              # writes <folder>/listen/*.wav and prints the comparison

macOS, with Amigo installed by its owner; needs numpy. The plug-in is hosted as a black box: its saved state
is pointed at a test sample, a note is played and the output recorded. The model is amiga.c's engine with a
model reader and a linear-interpolation repitch standing in for the Octatrack's. Nothing of the plug-in is
kept in the repository.
"""
import ctypes, math, pathlib, plistlib, random, struct, subprocess, sys, wave
here = pathlib.Path(sys.argv[1]).resolve()
HOST, SRC = here / 'host', pathlib.Path(__file__).resolve().parents[1] / 'amiga.c'
def wav(name, samples):
    with wave.open(str(here / name), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(44100)
        w.writeframes(b''.join(struct.pack('<h', max(-32767, min(32767, int(s * 32767)))) for s in samples))
def state(name, path):
    """The plug-in's default state with its sample path set (a JUCE value tree: a one-byte size, type 5, the string)."""
    p = plistlib.load(open(here / 'default.plist', 'rb'))
    s = p['jucePluginState']; old = b'pathname\x00\x01\x02\x05\x00'
    assert s.count(old) == 1
    b = str(path).encode() + b'\x00'; n = len(b) + 1
    size = bytes([1, n]) if n < 256 else bytes([2, n & 255, n >> 8])
    p['jucePluginState'] = s.replace(old, b'pathname\x00' + size + b'\x05' + b)
    plistlib.dump(p, open(here / name, 'wb'))
subprocess.run(['cc', '-O2', '-shared', '-fPIC', '-DAMIGA_HOST', '-o', str(here / 'amiga.so'), str(SRC)], check=True)
lib = ctypes.CDLL(str(here / 'amiga.so')); lib.amiga_strt.restype = ctypes.c_uint32; lib.amiga_frame.restype = lib.amiga_rate.restype = ctypes.c_uint32
class Voice(ctypes.Structure):
    _fields_ = [('l', ctypes.c_int32), ('r', ctypes.c_int32), ('phase', ctypes.c_uint32), ('al', ctypes.c_int32), ('ar', ctypes.c_int32),
                ('count', ctypes.c_uint32), ('ic', ctypes.c_int32 * 4)] + [(n, ctypes.c_uint32) for n in
                ('pos', 'frac', 'window', 'grain', 'played', 'since', 'got', 'first', 'length', 'sample', 'flags')] + [
                ('last', ctypes.c_int32 * 2), ('off', ctypes.c_int32 * 2)] + [(n, ctypes.c_uint32) for n in
                ('fade', 'jump', 'hi', 'floor', 'mix_from', 'mix_len', 'mix_wait', 'mix_k', 'mix_step', 'planned')] + [('hist', ctypes.c_int16 * 8192)]

# The source: a synthetic chord stab, 1.5 s, mono.
random.seed(1); N = 66150; src = []
ph = [0.0] * 6; fr = [f * d for f in (130.81, 155.56, 196.0) for d in (0.996, 1.004)]; lp = 0.0
for i in range(N):
    t = i / 44100; s = 0.0
    for k in range(6):
        ph[k] = (ph[k] + fr[k] / 44100) % 1.0; s += 2 * ph[k] - 1
    cut = 0.03 + 0.5 * math.exp(-t * 3.5); lp += cut * (s / 6 - lp)
    src.append(0.9 * lp * min(1, t * 400) * math.exp(-t * 1.2) * min(1, (1.5 - t) * 50))
peak = max(map(abs, src)); src = [0.9 * v / peak for v in src]
wav('stab.wav', src); state('stab.plist', here / 'stab.wav')

def ours(pitch, spd, grn, srr, bits, led, strech, seconds):
    v = Voice(); lib.amiga_note(ctypes.byref(v), N if strech else 0); v.first = 0; v.length = N
    pcm = [int(s * 0x7fffffff) for s in src]; stream = []; reader = 0; phase = 0.0; ratio = 2 ** ((pitch + (lib.amiga_shift(lib.amiga_percent(spd)) / 1280 if strech == 2 else 0)) / 12)
    for _ in range(int(seconds * 44100 / 16)):
        n = int(phase + 16 * ratio) - int(phase); phase += 16 * ratio
        a = (ctypes.c_int32 * (2 * n))(*[pcm[reader + i // 2] if reader + i // 2 < N else 0 for i in range(2 * n)])
        reader += n
        if strech: lib.amiga_blend(ctypes.byref(v), a, n)
        lib.amiga_declick(ctypes.byref(v), a, n); lib.amiga_crunch(ctypes.byref(v), a, n, lib.amiga_rate(srr), bits, led)
        stream.extend(a[0::2])
        at = lib.amiga_stretch(ctypes.byref(v), 16, n, 409600 // lib.amiga_percent(spd) if strech == 1 else 4096, lib.amiga_cycle(grn), 0)
        if at == -2: reader = N
        elif at >= 0:
            reader = lib.amiga_frame(lib.amiga_strt(at, N), N); lib.amiga_seek(ctypes.byref(v), reader)
    out = []
    for k in range(int(seconds * 44100)):  # the DSP's repitch, modelled as linear interpolation
        x = k * ratio; i = int(x); f = x - i
        out.append(((stream[i] * (1 - f) + stream[i + 1] * f) if i + 1 < len(stream) else 0) / 0x7fffffff)
    return out

def amigo(sets, seconds):
    args = [str(HOST), 'render', '--state', str(here / 'stab.plist'), '--seconds', str(seconds), '--hold', str(seconds - 0.05), '--out', str(here / 'tmp.raw')]
    for k, val in sets.items(): args += ['--set', str(k), str(val)]
    subprocess.run(args, check=True)
    d = (here / 'tmp.raw').read_bytes(); return list(struct.unpack('<%df' % (len(d) // 4), d)[0::2])

STRETCH, LEN, CYC, COMP = 265611013, 1725499947, 1367412556, 1071803359
clips = [
    ('1 crunch only, 8 bit at half rate', {STRETCH: 0}, dict(pitch=0, spd=32, grn=60, srr=29, bits=4, led=0, strech=0), 1.6),
    ('2 stretch to 200 percent', {STRETCH: 1, LEN: 100 / 1900}, dict(pitch=0, spd=52, grn=60, srr=29, bits=4, led=0, strech=1), 3.2),
    ('3 stretch to 400 percent', {STRETCH: 1, LEN: 300 / 1900}, dict(pitch=0, spd=78, grn=60, srr=29, bits=4, led=0, strech=1), 6.2),
    ('4 an octave up at the same length', {STRETCH: 1, LEN: 100 / 1900, COMP: 1}, dict(pitch=0, spd=52, grn=60, srr=29, bits=4, led=0, strech=2), 1.6),
]
outdir = here / 'listen'; outdir.mkdir(exist_ok=True)
import statistics
for name, sets, mine, seconds in clips:
    for who, x in (('Amigo', amigo(sets, seconds)), ('draft model', ours(seconds=seconds, **mine))):
        pk = max(map(abs, x)) or 1; rms = math.sqrt(sum(v * v for v in x) / len(x)) / pk
        end = max((i for i, v in enumerate(x) if abs(v) > 0.01 * pk), default=0) / 44100
        print(f'{name:36s} {who:12s} peak {pk:.3f} crest {1 / rms:.1f} sounds until {end:.2f} s')
        with wave.open(str(outdir / f'{name} - {who}.wav'), 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(44100)
            w.writeframes(b''.join(struct.pack('<h', int(32000 * v / pk)) for v in x))

import numpy as np
bands = [(0,250),(250,1000),(1000,4000),(4000,8000),(8000,11000),(11000,16000),(16000,22050)]
def prof(pth):
    w = wave.open(str(pth)); d = w.readframes(w.getnframes()); x = np.array(struct.unpack('<%dh' % (len(d)//2), d), float)
    X = np.abs(np.fft.rfft(x * np.hanning(len(x))))**2; f = np.fft.rfftfreq(len(x), 1/44100); tot = X.sum()
    return [10*math.log10(X[(f>=a)&(f<b)].sum()/tot + 1e-12) for a,b in bands]
for name, *_ in clips:
    d = [m - a for a, m in zip(prof(outdir / f'{name} - Amigo.wav'), prof(outdir / f'{name} - draft model.wav'))]
    print(name, 'model minus Amigo by band:', ' '.join('%5.1f' % v for v in d))
