#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Compare two builds of an Octatrack DSP effect on Modwerk's bench (dspbench.cpp): bit-identical output under
knob automation and every split position, and the instructions each executes a block (not chip cycles).

  ELEKLOADER_DSP_ASM=.../dsp_asm python3 dspbench.py --bench BIN BASE.asm CANDIDATE.asm [--blocks 600]

Each source is assembled with Elekloader's dsp_assemble (the builder's own path), relocated for P:$2000 and
called through `init` and `proc` labels. Exit status 1 when the outputs differ."""
import argparse, os, random, subprocess, sys, tempfile
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[4]))  # sdk/, for firmware_codec
import firmware_codec  # noqa: E402
firmware_codec.use_elekloader(os.environ.get('ELEKLOADER_UPSTREAM', Path.home() / '.cache/modwerk-upstream/elekloader'))
from elekloader.sdk.build import dsp_assemble  # noqa: E402

CODE = 0x2000


def build(src, work):
    words, labels, relocations = dsp_assemble(str(src), work)
    placed = list(words)
    for at, offset in relocations:  # dsp_assemble zeroes an address word and gives its offset into the code
        placed[at] = CODE + offset
    path = Path(work) / (Path(src).stem + '.bin')
    path.write_bytes(b''.join(w.to_bytes(3, 'little') for w in placed))
    return path, labels['init'], labels['proc'], len(words)


def run(bench, code, init, proc, blocks, work, tag, inp, params, split):
    out = Path(work) / (tag + '.raw')
    cmd = [bench, '-code', str(code), '-init', '%x' % init, '-proc', '%x' % proc, '-blocks', str(blocks),
           '-out', str(out), '-in', str(inp), '-params', str(params)]
    if split: cmd += ['-split', str(split)]
    cmd += ['-clobber', '1']  # other effects scratch X:$20-$FF between calls on the unit
    line = [l for l in subprocess.run(cmd, capture_output=True, text=True, check=True).stdout.splitlines() if l.startswith('instructions/block')][-1]
    return out.read_bytes(), line


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--bench', required=True)
    ap.add_argument('--blocks', type=int, default=600)
    ap.add_argument('base'); ap.add_argument('candidate')
    a = ap.parse_args()
    work = tempfile.mkdtemp(prefix='dspbench-')
    rng = random.Random(1)
    inp = Path(work) / 'in.raw'  # noise with a few silences: both reverbs' tails and their quiet paths
    inp.write_bytes(b''.join(int(0 if (n // 4000) % 3 == 2 else rng.randint(-2**21, 2**21)).to_bytes(4, 'little', signed=True)
                             for n in range(a.blocks * 32)))
    params = Path(work) / 'knobs.csv'  # every knob moving at its own rate, through every value
    params.write_text(''.join('%d,%s\n' % (b, ','.join(str((b * m + o) % 128) for m, o in ((3, 0), (5, 17), (13, 64), (7, 9), (1, 0), (11, 100))))
                              for b in range(a.blocks)))
    builds = [build(a.base, work), build(a.candidate, work)]
    for tag, (code, init, proc, n) in zip(('base', 'candidate'), builds):
        print('%s: %d words, init %#x, proc %#x' % (tag, n, init, proc))
    failed = 0
    for split in (0, 1, 7, 15):
        results = [run(a.bench, *b[:3], a.blocks, work, '%s_%d' % (t, split), inp, params, split) for t, b in zip(('base', 'candidate'), builds)]
        same = results[0][0] == results[1][0]
        failed += not same
        print('%s split %2d: %s' % ('PASS' if same else 'FAIL', split, 'bit-identical' if same else 'outputs differ'))
        if split == 0:
            for tag, (_, line) in zip(('base', 'candidate'), results): print('  %s %s' % (tag, line))
    sys.exit(1 if failed else 0)


main()
