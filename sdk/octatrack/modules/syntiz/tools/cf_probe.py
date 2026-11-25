#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""SYNTIZ's render on an emulated ColdFire, through the machine glue (wave_render_track), and two versions compared.

    python3 -B tools/cf_probe.py count [REV]        instructions a frame per model, at C3, for this tree or a git revision
    python3 -B tools/cf_probe.py compare REV [N]    N random scenarios (default 300): this tree's samples must equal REV's
    python3 -B tools/cf_probe.py host REV           tools/render_matrix.c on the host: this tree's engine against REV's

The image is linked as build.py links the package, with build.py's flags. cf_probe.cpp runs it on upstream ot_emu's V4e
core (`npm run upstream:tools`, then Octabam's `make emu-cf`; OCTABAM names another checkout) against a synthetic stock
environment: the Part's signature, the parameter record, the live lane, the event bytes and a 2^(x/12) curve built as
test_machine_map.c builds it (no stock byte). Emulator counts, not cycles: the base's frame guard on a unit is the measure.
"allowance" weighs each executed instruction with Grain's zero-wait allowances (grain/evidence/timing/bound.py): a
yardstick that counts memory operands, multiplies and divides above register work, not a cycle count.
"""
import os
import random
import re
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
ROOT = HERE.parents[3]
sys.path.insert(0, str(ROOT / 'sdk/runtime/loader'))
import build  # noqa: E402

CROSS = 'm68k-elf-'
UPSTREAM = Path(os.environ.get('OCTABAM', Path.home() / '.cache/modwerk-upstream/octabam'))
ORIGIN = 0x47000000
BANK, PART_OFF, SIG = 0x46200000, 0x8ed80, 60
FPREC, LANE, EVENTS, CURVE = 0x80300000, 0x80000810, 0x46104d0c, 0x400aa294
NAMES = ['SAW', 'PULSE', 'ENS', 'TABLE', 'MORPH', 'CHOIR']
# SRC A-F and SETUP A-F bytes (SRC A, PTCH, is the parameter word): each model's defaults, and bench_cf.c's heavy settings.
DEFAULTS = {0: ([64, 24, 0, 0, 0, 0], [64, 3, 64, 0, 0, 0]), 1: ([64, 64, 0, 0, 0, 0], [64, 3, 64, 0, 16, 0]),
            2: ([64, 24, 24, 24, 0, 64], [64, 3, 64, 0, 0, 0]), 3: ([64, 0, 0, 0, 0, 0], [64, 3, 64, 0, 0, 0]),
            4: ([64, 8, 64, 24, 0, 0], [64, 3, 64, 0, 0, 0]), 5: ([64, 24, 24, 24, 108, 64], [64, 3, 64, 0, 0, 0])}
HEAVY = {0: ([64, 40, 127, 90, 90, 90], [64, 3, 64, 0, 0, 0]), 1: ([64, 64, 100, 30, 90, 90], [64, 3, 64, 0, 40, 127]),
         2: ([64, 27, 31, 36, 32, 100], [64, 3, 64, 0, 90, 90]), 3: ([64, 64, 0, 30, 80, 90], [64, 3, 64, 0, 90, 0]),
         4: ([64, 8, 64, 60, 80, 127], [64, 3, 64, 0, 60, 90]), 5: ([64, 27, 31, 36, 52, 100], [64, 3, 64, 0, 90, 90])}
BRANCH = re.compile(r'b(?:hi|ls|cc|cs|ne|eq|vc|vs|pl|mi|ge|lt|gt|le|ra)[swl]?')


def sources(rev, tmp):
    """The module folder of this tree, or of a git revision exported under tmp (with the header machine.c includes)."""
    if rev is None:
        return HERE
    out = tmp / rev.replace('/', '_')
    out.mkdir()
    tar = subprocess.check_output(['git', 'archive', rev, 'sdk/octatrack/modules/syntiz', 'sdk/machines/octatrack/include'], cwd=ROOT)
    subprocess.run(['tar', '-x', '-C', str(out)], input=tar, check=True)
    return out / 'sdk/octatrack/modules/syntiz'


def image(folder, tmp):
    out = Path(tempfile.mkdtemp(dir=tmp))
    objs = []
    for s in ('engine.c', 'machine_map.c', 'machine.c'):
        subprocess.run([CROSS + 'gcc', *build.CFLAGS, '-fno-late-combine-instructions', '-c', str(folder / s), '-o',
                        str(out / (s + '.o'))], check=True)
        objs.append(out / (s + '.o'))
    (out / 'link.ld').write_text(build.SCRIPT % ORIGIN)
    subprocess.run([CROSS + 'ld', '--orphan-handling=error', '--no-warn-rwx-segments', '-T', str(out / 'link.ld'), '-o',
                    str(out / 'syn.elf'), *map(str, objs)], check=True)
    subprocess.run([CROSS + 'objcopy', '-O', 'binary', '-j', '.image', str(out / 'syn.elf'), str(out / 'image')], check=True)
    nm = subprocess.check_output([CROSS + 'nm', str(out / 'syn.elf')], text=True)
    render = next(int(l.split()[0], 16) for l in nm.splitlines() if l.endswith(' wave_render_track'))
    return out, render


def probe(tmp):
    exe, emu = tmp / 'cf_probe', UPSTREAM / 'out/emu'
    if not (emu / 'libot_machine.a').exists():
        sys.exit('[SKIP] no ot_emu build under %s (npm run upstream:tools, then make emu-cf there)' % UPSTREAM)
    subprocess.run(['c++', '-std=c++17', '-O2', '-I', str(UPSTREAM / 'tools/emu/ot_emu'), '-I', str(UPSTREAM / 'vendor'),
                    '-I', str(UPSTREAM / 'vendor/dsp56300/source'), str(HERE / 'tools/cf_probe.cpp'),
                    *[str(emu / a) for a in ('libot_machine.a', 'mc68k/lib68kEmu.a', 'dsp56300/dsp56kEmu/libdsp56kEmu.a',
                                             'dsp56300/dsp56kBase/libdsp56kBase.a', 'dsp56300/asmjit/libasmjit.a')],
                    '-o', str(exe)], check=True)
    return exe


def env():
    s = ['w32 46c82456 %x' % BANK, 'w8 100b14cf 0', 'w32 800062a8 %x' % FPREC]
    return s + ['w32 %x %x' % (CURVE + 4 * i, round(2 ** ((i * 32 - 0x0400) / 0x500 / 12) * (1 << 26))) for i in range(1024)]


def track(t, model, src, setup, ptch=0x4000):
    part = BANK + PART_OFF + SIG + 30 * t
    s = ['w8 %x 1' % (BANK + PART_OFF + 0x22 + t), 'w8 %x 57' % part, 'w8 %x 56' % (part + 1), 'w8 %x %x' % (part + 2, model + 1),
         'w16 %x %x' % (FPREC, ptch)]
    return s + ['w16 %x %x' % (FPREC + 2 * k, src[k] << 8) for k in range(1, 6)] + \
        ['w8 %x %x' % (LANE + 72 * t + 0x20 + k, setup[k]) for k in range(6)]


def run(exe, img, script, profile):
    p = subprocess.run([str(exe), str(img[0] / 'image'), hex(ORIGIN), hex(img[1]), str(profile)],
                       input='\n'.join(script) + '\n', capture_output=True, text=True)
    if p.returncode:
        sys.exit('[FAIL] the probe stopped (%d): %s' % (p.returncode, p.stderr.strip()))
    return [list(map(int, l.split()[1:])) for l in p.stdout.splitlines()]


def weight(op, arg):
    if op.startswith(('rem', 'div')): return 48
    if op == 'moveml': return 64
    if op in ('jsr', 'rts', 'linkw', 'unlk') or op.startswith('bsr'): return 16
    if BRANCH.fullmatch(op): return 8
    if op.startswith('mul'): return 16
    return 12 if '@' in arg or ' <' in arg else 4


def count(rev, tmp, frames=64):
    exe, img = probe(tmp), image(sources(rev, tmp), tmp)
    ops = {}
    for line in subprocess.check_output([CROSS + 'objdump', '-d', '--no-show-raw-insn', str(img[0] / 'syn.elf')], text=True).splitlines():
        m = re.match(r'^\s*([0-9a-f]+):\s+(\S+)\s*(.*)', line)
        if m: ops[int(m[1], 16)] = (m[2], m[3])
    pcs = sorted(ops)
    size = {a: b - a for a, b in zip(pcs, pcs[1:])}
    print('One track at C3, 63 frames after the first, each frame a [0,0) and a [0,16) call (no trig):')
    for model in range(6):
        for label, table in (('defaults', DEFAULTS), ('heavy', HEAVY)):
            src, setup = table[model]
            s = env() + track(1, model, src, setup)
            for fr in range(frames):  # MORPH heavy: WAV1 alternates each frame, a crossfade always running
                s += (['w16 %x %x' % (FPREC + 2, (8 if fr & 1 else 108) << 8)] if model == 4 and label == 'heavy' else []) + \
                     ['call 1 0 0 0', 'call 1 0 0 16'] + (['reset'] if not fr else [])
            outs = run(exe, img, s, tmp / 'profile.txt')
            hist = {int(a, 16): int(b) for a, b in (l.split() for l in (tmp / 'profile.txt').read_text().splitlines())}
            lines = {pc >> 4 for pc in hist} | {(pc + size.get(pc, 2) - 1) >> 4 for pc in hist}
            per = lambda f: sum(k for pc, k in hist.items() if f(*ops.get(pc, ('', '')))) / (frames - 1)
            print('%-6s %-8s %5.0f instructions, %4d code bytes, %3.0f multiplies, %2.0f divides, %4.0f memory operands, '
                  '%6.0f allowance a frame' % (NAMES[model], label, sum(o[1] for o in outs[2:]) / (frames - 1), len(lines) * 16,
                  per(lambda o, a: o.startswith(('mul', 'mac', 'msac'))), per(lambda o, a: o.startswith(('div', 'rem'))),
                  per(lambda o, a: '@' in a and not o.startswith(('lea', 'pea', 'j', 'b'))),
                  sum(k * weight(*ops.get(pc, ('nop', ''))) for pc, k in hist.items()) / (frames - 1)))


def scenario(rng, frames):
    """Two tracks: models, knobs and PTCH moving, model changes, trigs (RTRG on or off), split frames."""
    s = env()
    for t in (1, 4):
        s += track(t, rng.randrange(6), [64] + [rng.choice([0, 1, 63, 64, 65, 126, 127, rng.randrange(128)]) for _ in range(5)],
                   [rng.randrange(128), rng.randrange(7), rng.randrange(128), rng.choice([0, 0, 1]), rng.randrange(128),
                    rng.randrange(128)], rng.randrange(0x10000))
    for _ in range(frames):
        t, r = rng.choice((1, 4)), rng.random()
        if r < 0.05: s.append('w8 %x %x' % (BANK + PART_OFF + SIG + 30 * t + 2, rng.randrange(1, 7)))
        elif r < 0.25: s.append('w16 %x %x' % (FPREC + 2 * rng.randrange(1, 6), rng.choice([0, 1, 63, 64, 127, rng.randrange(128)]) << 8 | rng.randrange(256)))
        elif r < 0.35: s.append('w8 %x %x' % (LANE + 72 * t + 0x20 + rng.randrange(6), rng.choice([0, 1, 3, 6, 64, 127, rng.randrange(256)])))
        elif r < 0.55: s.append('w16 %x %x' % (FPREC, rng.choice([rng.randrange(0x10000), 0x4000, 0x0400, 0x7c00, 0])))
        trig = rng.random() < 0.15
        s.append('w8 %x %x' % (EVENTS + t, 16 if trig else rng.choice([0, 0, 0, 0xef])))
        k = rng.randrange(17) if trig or rng.random() < 0.1 else 0
        s += ['call %d 0 0 %d' % (t, k), 'call %d 1 %d 16' % (t, k)]
    return s


def compare(rev, tmp, n=300, frames=600):
    exe = probe(tmp)
    old, new = image(sources(rev, tmp), tmp), image(HERE, tmp)
    rng, total = random.Random(7), 0
    for i in range(n):
        s = scenario(rng, frames)
        a, b = run(exe, old, s, tmp / 'p'), run(exe, new, s, tmp / 'p')
        for k, (x, y) in enumerate(zip(a, b)):
            if x[0] != y[0] or x[2:] != y[2:]:
                sys.exit('[FAIL] scenario %d, call %d: %s against %s' % (i, k, y[:8], x[:8]))
        total += sum(x[0] for x in a)
    print('[PASS] %d scenarios, %d samples through wave_render_track: identical to %s' % (n, total, rev))


def host(rev, tmp):
    raws = []
    for folder in (sources(rev, tmp), HERE):
        exe = tmp / ('matrix%d' % len(raws))
        subprocess.run(['cc', '-std=c11', '-O1', '-g', '-fsanitize=undefined,address', '-fno-sanitize-recover=all',
                        '-I', str(folder), '-o', str(exe), str(HERE / 'tools/render_matrix.c'),
                        str(folder / 'engine.c'), '-lm'], check=True)
        raws.append(subprocess.run([str(exe)], check=True, capture_output=True).stdout)
    if raws[0] != raws[1]:
        sys.exit('[FAIL] the engine renders differently from %s' % rev)
    print('[PASS] %d samples from tools/render_matrix.c: identical to %s' % (len(raws[0]) // 2, rev))


if __name__ == '__main__':
    with tempfile.TemporaryDirectory() as tmp:
        cmd, args = sys.argv[1], sys.argv[2:]
        if cmd == 'count': count(args[0] if args else None, Path(tmp))
        elif cmd == 'compare': compare(args[0], Path(tmp), *map(int, args[1:]))
        elif cmd == 'host': host(args[0], Path(tmp))
        else: sys.exit(__doc__)
