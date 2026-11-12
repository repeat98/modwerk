#!/usr/bin/env python3
"""Does the engine still hand the DSP what an earlier build of it did, sample for sample?

    git show <commit>:sdk/drafts/amiga/amiga.c > /tmp/earlier.c
    python3 -B reference/compare_engine.py /tmp/earlier.c [--notes 400]

Both sources are compiled for the host and driven as amiga_render drives them, by the same model reader, through
notes with random lengths, loops, pitches and controls that change while the note sounds. Every frame handed on and
every restart must be the same. The earlier source is one with the SPD, GRN and SRR controls (commit c5543f12, the
build first played on a unit); it has no amiga_rest, so it runs blend, declick, crunch and stretch on every call.
"""
import argparse
import ctypes
import pathlib
import random
import subprocess
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
KEEP, OVER = -1, -2


def build(source, tmp, name):
    so = pathlib.Path(tmp) / (name + '.so')
    subprocess.run(['cc', '-O2', '-shared', '-fPIC', '-DAMIGA_HOST', '-o', str(so), str(source)], check=True)
    lib = ctypes.CDLL(str(so))
    lib.amiga_strt.restype = lib.amiga_frame.restype = ctypes.c_uint32
    return lib


def note(lib, rng, sample, rests):
    """One note through `lib`; rng decides everything, so two libraries given equal generators hear the same note."""
    voice = ctypes.create_string_buffer(16384)
    window, loop, length = rng.choice((300, 2000, 5000, 20000, len(sample))), rng.random() < 0.3, len(sample)
    lib.amiga_note(voice, window)
    spd, grn, srr, bits, led, stretch, pitch = 64, 64, 0, 4, 0, 1, 1.0
    reader, read, out_frames, restarts = 0, 0.0, [], []
    for call in range(rng.randrange(200, 3000)):
        if rng.random() < 0.01:  # a knob moves
            spd = rng.choice((64, 64, 64, 0, 20, 32, 63, 65, 100, 127))
            grn = rng.choice((64, 64, 0, 10, 40, 100, 127))
            pitch = rng.choice((1.0, 1.0, 1.0, 0.5, 0.75, 1.3, 2.0, 4.0))
            srr = rng.choice((0, 0, 0, 1, 16, 40, 127))
            bits = rng.choice((4, 4, 0, 8, 12))
            led = rng.choice((0, 0, 1))
            stretch = rng.choice((1, 1, 1, 0))
        out = rng.choice((7, 8, 9))
        src = int(read + out * pitch) - int(read)
        read += out * pitch
        a = (ctypes.c_int32 * (2 * src))(*[sample[(reader + i // 2) % length][i % 2] if loop or reader + i // 2 < length else 0 for i in range(2 * src)])
        reader += src
        rest = 0
        if rests and stretch:
            rest = lib.amiga_rest(voice, out, src, spd)
        if src:  # amiga_render: the packet's PCM
            if stretch and rest != 2:
                lib.amiga_blend(voice, a, src)
            if not rest:
                lib.amiga_declick(voice, a, src)
            lib.amiga_crunch(voice, a, src, srr, bits, led)
        out_frames.extend(a)
        if rest == 1:
            lib.amiga_pass(voice, out, grn)
        elif stretch and not rest:
            at = lib.amiga_stretch(voice, out, src, spd, grn, int(loop))
            if at == OVER:
                break
            if at != KEEP:
                frame = lib.amiga_frame(lib.amiga_strt(at, length), length)
                restarts.append((call, at))
                reader = frame
                lib.amiga_seek(voice, frame)
    return out_frames, restarts


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('earlier', type=pathlib.Path)
    p.add_argument('--notes', type=int, default=400)
    a = p.parse_args()
    with tempfile.TemporaryDirectory() as tmp:
        then, now = build(a.earlier, tmp, 'then'), build(HERE.parent / 'amiga.c', tmp, 'now')
        seed = random.Random(1)
        sample = [(seed.randrange(-2 ** 31, 2 ** 31) & ~0xffff, seed.randrange(-2 ** 31, 2 ** 31) & ~0xffff) for _ in range(30000)]
        frames = rested = 0
        for n in range(a.notes):
            x = note(then, random.Random(n), sample, False)
            y = note(now, random.Random(n), sample, True)
            if x != y:
                at = next((i for i, (p_, q_) in enumerate(zip(x[0], y[0])) if p_ != q_), None)
                raise SystemExit(f'note {n} differs: first at long {at} of {len(x[0])}/{len(y[0])}; restarts {x[1][:4]} / {y[1][:4]}')
            frames += len(x[0]) // 2
        print(f'{a.notes} notes, {frames} frames: the same, sample for sample and restart for restart')
