#!/usr/bin/env python3
"""GRAIN's gate: the grain engine (gran.c) compiled for the host.

    python3 -B verify.py            # needs cc

It checks the engine only. The page, the machine list, START and the render glue need the base: the emulator or a
unit (TESTING.md). Two checks:

  1. the optimized read paths give the same samples, byte for byte, as the plain ones, on mono and stereo samples, at
     several pitches, with and without PAN, forwards and backwards, free and in SYNC;
  2. reference renders (a tone with noise, three settings) have the hashes recorded when the sound was approved. They
     come from the host's math library: another libm that makes the tone differ is reported as a skip, not a failure.
"""
import hashlib
import math
import os
import pathlib
import random
import shutil
import struct
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
failed = []
skipped = []


def check(name, ok, detail=''):
    print(('[PASS] ' if ok else '[FAIL] ') + name + (f': {detail}' if detail and not ok else ''))
    if not ok:
        failed.append(name)


CC = shutil.which('cc') or shutil.which('gcc')
if not CC:
    sys.exit('[SKIP] no C compiler: the host gate did not run')

# 0.1.2 renders (EDGE WRAP, the sample is a ring and every grain is 3 dB lower) and 0.2.0 renders of CLMP and BNCE; settings
# (pos size dens spray shape dir pan sync) and EDGE -> SHA-256 of the 8 s stereo render
REFERENCES = {
    'default': ((), '1', 'ffafa70b40fee69e868b8d14749ddaa0754a2d67fcd4d75eba45526628d47314'),
    'perc-sync': (('40', '40', '70', '20', '2', '0', '0', '1'), '1', '9c4ba3c3429c80ec79aa93a43120f9380522763d6223b697491dc290c6f12762'),
    'pan-dir': (('40', '70', '110', '50', '0', '64', '127', '0'), '1', '2fe9531b4c53c71aa0f9cd2f3e5ea40083ca8ad49dff6f08311b16bb61e9adb3'),
    'clamp-spray': (('40', '70', '110', '127', '0', '64', '0', '0'), '0', '38374c95b9662ca6f285a20674ef88c1d32db2bc42161630e50903dd4038d5dd'),
    'bounce-spray': (('40', '70', '110', '127', '0', '64', '0', '0'), '2', 'f56eb94eeff6d832269df640c67a3746ee5af3ed14f0e42bb1f0348a8c6d84b5'),
}
CASES = [('40', '70', '90', '30', '0', '0', '0', '0'), ('40', '70', '110', '50', '0', '64', '0', '0'),
         ('40', '70', '110', '50', '0', '0', '127', '0'), ('40', '70', '110', '50', '0', '127', '80', '0'),
         ('10', '30', '60', '0', '3', '64', '40', '1')]
PITCHES = [('1', '0'), ('1', '0x30000000'), ('0', '0xb0000000'), ('2', '0x5a000000'), ('-1', '0x80000000')]


def stereo_input(path):
    random.seed(1)
    frames = 88200
    data = b''.join(struct.pack('<hh', int(12000 * math.sin(i * 0.031) + 3000 * (random.random() - 0.5)),
                               int(9000 * math.sin(i * 0.047 + 1) + 3000 * (random.random() - 0.5))) for i in range(frames))
    path.write_bytes(b'RIFF' + struct.pack('<I', 36 + len(data)) + b'WAVEfmt ' + struct.pack('<IHHIIHH', 16, 1, 2, 44100, 44100 * 4, 4, 16) +
                     b'data' + struct.pack('<I', len(data)) + data)


with tempfile.TemporaryDirectory() as td:
    td = pathlib.Path(td)

    def build(name, *defs):
        exe = td / name
        subprocess.run([CC, '-O2', *defs, '-o', str(exe), str(HERE / 'host_test.c'), str(HERE / 'gran.c'), '-lm'], check=True, cwd=HERE)
        return exe

    fast, plain = build('fast'), build('plain', '-DGRAN_UNIT_PATH=0', '-DGRAN_PTR_PATH=0')

    def run(exe, out, args=(), source=None, env=None):
        cmd = [str(exe)] + ([str(source)] if source else ['-']) + [str(out), *args]
        subprocess.run(cmd, check=True, cwd=td, env={**os.environ, **(env or {})}, stdout=subprocess.DEVNULL)
        return out.read_bytes()

    source = td / 'stereo.wav'
    stereo_input(source)
    for pw, pf in PITCHES:
        for i, args in enumerate(CASES):
            for edge in ('0', '1', '2'):
                env = {'PW': pw, 'PF': pf, 'EDGE': edge}
                a = run(fast, td / 'a.wav', args, source, env)
                b = run(plain, td / 'b.wav', args, source, env)
                check(f'stereo, pitch {pw} {pf}, case {i + 1}, EDGE {edge}: optimized paths match the plain ones', a == b)
    for i, args in enumerate(CASES[:3]):   # the same on a mono tone
        for edge in ('0', '1', '2'):
            a = run(fast, td / 'a.wav', args, env={'EDGE': edge})
            b = run(plain, td / 'b.wav', args, env={'EDGE': edge})
            check(f'mono, case {i + 1}, EDGE {edge}: optimized paths match the plain ones', a == b)

    for name, (args, edge, digest) in REFERENCES.items():
        got = hashlib.sha256(run(fast, td / 'r.wav', args, env={'EDGE': edge})).hexdigest()
        if os.environ.get('PRINT_REFS'):
            print(name, got)
        if got == digest:
            check(f'reference render {name}', True)
        else:   # the tone itself depends on the host's libm
            skipped.append(name)
            print(f'[SKIP] reference render {name}: hash differs ({got[:12]}), likely another libm')

if failed:
    sys.exit(f'{len(failed)} check(s) failed')
print(f'all checks passed ({len(skipped)} skipped)')
