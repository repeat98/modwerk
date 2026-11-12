#!/usr/bin/env python3
"""Count the instructions AMIGA's engine executes per audio frame, on ot_emu's ColdFire (emulator, not a chip).

    python3 -B bench.py --emulator <ot_emu> --main <a MAIN image the emulator boots> --output <new private folder>

amiga.c is compiled for the ColdFire as the package is, placed in free emulator RAM, and its engine is
called the way amiga_render calls it: rest, then blend, declick, crunch, and stretch or pass, and seek at a restart, for the two
render calls of every frame of a note, with the frame interrupt off. A PC watch at each function's entry
and at its return gives the instructions in between. It is the module's own code only: stock's reader and
START, which the render also calls, are the instrument's (docs/MODULE_PERFORMANCE.md). Instructions become
time at Tuner's 9.44 ns each, which prices a division or a multiply-accumulate like a move: read the result
as a floor. The firmware and the emulator stay outside the repository.
"""
import argparse
import json
import pathlib
import random
import struct
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
SDK = next(p for p in HERE.parents if (p / 'machines/octatrack/include/modwerk_events.h').exists())
sys.path.insert(0, str(SDK / 'octabam/modules/track-solo'))  # its ot_emu session: poke, call, watch
from emulator_test import Emulator  # noqa: E402

CODE, VOICE, PCM = 0x47031000, 0x47038000, 0x4703c000
NS, FRAME_US = 9.44, 362.8
FLAGS = ['-mcpu=5475', '-msoft-float', '-O2', '-ffreestanding', '-fno-builtin', '-fno-common', '-fno-jump-tables',
         '-fno-asynchronous-unwind-tables', '-fno-ident', '-fomit-frame-pointer', '-I', str(SDK / 'machines/octatrack/include')]
CASES = {  # pitch in semitones, SPD, GRN, SRR, BITS (saved value), LED, as the page counts them; RATE full forward
    'plain: SPD 64, SRR 0, BITS 16': dict(pitch=0, spd=64, grn=64, srr=0, bits=12, led=0),
    'defaults: 8 bits': dict(pitch=0, spd=64, grn=64, srr=0, bits=4, led=0),
    'SPD 32 (twice as long), 8 bits': dict(pitch=0, spd=32, grn=64, srr=0, bits=4, led=0),
    'an octave up at its own length, 8 bits': dict(pitch=12, spd=64, grn=64, srr=0, bits=4, led=0),
    'SRR 16 alone, 8 bits': dict(pitch=0, spd=64, grn=64, srr=16, bits=4, led=0),
    'LED alone, 8 bits': dict(pitch=0, spd=64, grn=64, srr=0, bits=4, led=1),
    'an octave up with SRR 16 and LED': dict(pitch=12, spd=64, grn=64, srr=16, bits=4, led=1),
    'dearest found: an octave up, GRN 0, SRR 6, LED': dict(pitch=12, spd=32, grn=0, srr=6, bits=4, led=1),
}


def build(tmp):
    elf, flat = tmp / 'amiga.elf', tmp / 'amiga.bin'
    subprocess.run(['m68k-elf-gcc', *FLAGS, '-c', str(HERE / 'amiga.c'), '-o', str(tmp / 'amiga.o')], check=True)
    subprocess.run(['m68k-elf-ld', f'-Ttext={CODE:#x}', '-e', 'amiga_crunch', str(tmp / 'amiga.o'), '-o', str(elf)], check=True, capture_output=True)
    subprocess.run(['m68k-elf-objcopy', '-O', 'binary', '-j', '.text', '-j', '.rodata', '-j', '.data', str(elf), str(flat)], check=True)
    names = {}
    for line in subprocess.run(['m68k-elf-nm', str(elf)], check=True, capture_output=True, text=True).stdout.splitlines():
        at, _, name = line.split()
        names[name] = int(at, 16)
    return flat.read_bytes(), names


def run(a):
    a.output.mkdir(parents=True, exist_ok=False)
    with tempfile.TemporaryDirectory() as tmp:
        image, sym = build(pathlib.Path(tmp))
    e = Emulator(a.emulator, a.main, a.output)
    try:
        e.command('frame off')
        for off in range(0, len(image), 2048):
            e.write(CODE + off, image[off:off + 2048])
        returns = {}

        def call(name, *args):
            """The function's result and the instructions it executed."""
            at = sym[name]
            e.command('watch ' + ','.join(hex(v) for v in {at, returns.get(name, at)}))
            d0 = e.call(at, *args)
            rows = [(int(r.split(':')[0], 16), int(r.split(':')[1], 16), int(r.split(':')[7], 16)) for r in e.command('hits').split()[2:]]
            if name not in returns:  # the first call finds where it returns to
                returns[name] = rows[0][2]
                return call(name, *args)
            start = next(c for c, pc, _ in rows if pc == at)
            return d0, next(c for c, pc, _ in rows if pc == returns[name] and c > start) - start

        get = lambda name, v: call(name, v)[0]
        rng, report = random.Random(1), {}
        for label, c in CASES.items():
            for off in range(0, 2048 * 4 + 256, 2048):
                e.write(VOICE + off, bytes(2048))
            window = 44100
            call('amiga_note', VOICE, window)
            ratio, read, frames, restarts = 2 ** (c['pitch'] / 12), 0.0, [], 0
            parts = {}
            for _ in range(a.frames):
                cost = 0
                for out in (9, 7):  # a frame's two render calls
                    n = int(read + out * ratio) - int(read)
                    read += out * ratio
                    e.write(PCM, struct.pack(f'>{2 * n}i', *[rng.randrange(-2 ** 30, 2 ** 30) for _ in range(2 * n)]))
                    rest, used = call('amiga_rest', VOICE, out, n, c['spd'])  # as amiga_render: a note at rest only remembers and counts
                    cost += used
                    parts['amiga_rest'] = parts.get('amiga_rest', 0) + used
                    d0 = (1 << 32) - 1  # KEEP
                    steps = [('amiga_crunch', (VOICE, PCM, n, c['srr'], c['bits'], c['led']))]
                    if rest != 2:
                        steps.insert(0, ('amiga_blend', (VOICE, PCM, n)))
                    if not rest:
                        steps.insert(1, ('amiga_declick', (VOICE, PCM, n)))
                    steps.append(('amiga_pass', (VOICE, out, c['grn'])) if rest == 1 else ('amiga_stretch', (VOICE, out, n, c['spd'], c['grn'], 1)))
                    for name, args in steps:
                        result, used = call(name, *args)
                        if name == 'amiga_stretch':
                            d0 = result
                        cost += used
                        parts[name] = parts.get(name, 0) + used
                    at = d0 - (1 << 32) if d0 >> 31 else d0
                    if at >= 0:
                        restarts += 1
                        cost += call('amiga_seek', VOICE, at)[1]
                frames.append(cost)
            report[label] = dict(settings=c, frames=len(frames), restarts=restarts, meanInstructions=round(sum(frames) / len(frames)),
                                 meanByFunction={name[6:]: round(total / len(frames)) for name, total in parts.items()},
                                 worstInstructions=max(frames), worstMicroseconds=round(max(frames) * NS / 1000, 1),
                                 worstShareOfFramePercent=round(max(frames) * NS / 1000 / FRAME_US * 100, 1))
            print(f"{label}: mean {report[label]['meanInstructions']}, worst {max(frames)} instructions a frame = "
                  f"{report[label]['worstMicroseconds']} us, {report[label]['worstShareOfFramePercent']} % of a frame; {restarts} restarts; by function {report[label]['meanByFunction']}")
        (a.output / 'report.json').write_text(json.dumps(dict(
            method='ot_emu PC-watch instruction counts of the engine functions, entry to return, frame interrupt off; 9.44 ns an instruction',
            hardwareTested=False, cases=report), indent=2) + '\n')
    finally:
        e.close()


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--emulator', type=pathlib.Path, required=True)
    p.add_argument('--main', type=pathlib.Path, required=True)
    p.add_argument('--output', type=pathlib.Path, required=True)
    p.add_argument('--frames', type=int, default=160)
    run(p.parse_args())
