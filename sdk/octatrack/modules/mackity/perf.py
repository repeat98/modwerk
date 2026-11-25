#!/usr/bin/env python3
"""MACKITY's performance measurements for evidence/performance.json, in dsp_host.

    python3 -B perf.py            (the tools verify.py finds; about a minute)

static    words of the per-sample loop plus twice the channel routine it calls, one cycle a word (the rule
          tools/build/cycle_count.py prices straight-line loops by; the routine has no branch); the per-call
          setup (knob decode, seeding, the glides' snap) apart. Pipeline cost of bsr/rts is not modelled.
measured  executed instructions a sample from dsp_host's meter, one instance on verify.py's synthetic image (no
          null-stub subtraction): fixed knobs at the defaults and the dearest setting, a moving pattern (both knobs
          swept and jumped every block), each unsplit and with a trig split at every position 1-15.
stress    eight instances, four a core, each on its own stem (drums-like bursts, a full-scale square, a sweep,
          noise, impulses, DC steps, silence, a chord), all twelve parameter words given a new value every
          block through -paramfile (triangle LFOs on TRIM and PAD with random jumps, a square on slot 2, random
          values on slots 3-11, which Mackity does not read), trig splits of 1, 3, 7, 8, 12 and 15 frames, 2 s of
          audio and a 2 s tail, under -guard and -dirty.
"""
import math
import pathlib
import random
import re
import struct
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import verify as V  # noqa: E402

Q = V.Q
BLOCKS = 4096


def static(work):
    blob, syms = V.assemble(work)
    dis = V.disassemble(blob)
    words = {int(l[:6], 16): l for l in dis}
    addrs = sorted(words)
    size = {a: (addrs[i + 1] - a if i + 1 < len(addrs) else 1) for i, a in enumerate(addrs)}

    def span(lo, hi):
        return sum(size[a] for a in addrs if lo <= a < hi)
    loop_lo = next(a for a in addrs if a > syms['proc'] and re.search(r'\bdo\s+n7', words[a]))
    loop_lo += size[loop_lo]
    loop = span(loop_lo, syms['mack_frameend'])
    chan = span(syms['mack_chan'], max(addrs) + 1)
    setup = span(syms['proc'], loop_lo)
    return loop + 2 * chan, loop, chan, setup


def meter(work, mem, syms, params, frames=16, extra=(), tag='m', blocks=BLOCKS):
    n = frames * blocks
    rnd = random.Random(5)
    sig = [round(0.7 * Q * (rnd.random() * 2 - 1)) for _ in range(n)]
    inp = work / f'{tag}.in'
    inp.write_bytes(struct.pack(f'<{2 * n}i', *[s for v in sig for s in (v, v)]))
    cmd = [str(V.DSP_HOST), '-mem', str(mem), '-init', f"{syms['init']:x}", '-proc', f"{syms['proc']:x}",
           '-ctx', '40,41,42', '-frames', str(frames), '-blocks', str(blocks), '-stereo', '-in', str(inp),
           '-out', str(work / f'{tag}.out'), *params, *extra]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=900)
    if r.returncode:
        sys.exit(f'[FAIL] dsp_host exit {r.returncode}: {r.stdout[-1500:]}{r.stderr}')
    m = re.search(r'\(([\d.]+)/sample max', r.stdout)
    return float(m.group(1)), r.stdout


def moving(path, blocks=BLOCKS, seed=1, every_slot=False):
    """TRIM and PAD swept by triangles and jumped every 37 blocks. every_slot (the stress run): a third LFO, a
    square, on slot 2, and a new random value on slots 3-11 every block, so all twelve parameter words change each
    block; Mackity reads only slots 0 and 1."""
    rnd = random.Random(seed)
    rows = []
    for b in range(blocks):
        tri = abs((b % 256) - 128)
        trim, pad = min(127, tri), 127 - min(127, abs(((b + 64) % 256) - 128))
        if b % 37 == 0:
            trim, pad = rnd.randrange(128), rnd.randrange(128)
        rest = [127 if (b // 50) % 2 else 0] + [rnd.randrange(128) for _ in range(9)] if every_slot else [0] * 10
        rows.append(','.join(map(str, [b, trim, pad, *rest])))
    path.write_text('\n'.join(rows) + '\n')


def main():
    only_stress = '--stress' in sys.argv
    with tempfile.TemporaryDirectory() as tmp:
        work = pathlib.Path(tmp)
        total, loop, chan, setup = static(work)
        print(f'static: {total} cycles/sample in the loop ({loop} loop words + 2 x {chan} channel words); '
              f'per-call setup {setup} words')
        blob, syms = V.assemble(work)
        mem = work / 'm.mem'
        V.write_mem(blob, mem)
        mv = work / 'moving.params'
        moving(mv)
        cases = {'defaults': ['-params', '13,127,0,0,0,0,0,0,0,0,0,0'],
                 'dearest': ['-params', '127,127,0,0,0,0,0,0,0,0,0,0'],
                 'moving': ['-params', '13,127,0,0,0,0,0,0,0,0,0,0', '-paramfile', str(mv)]}
        worst = (0.0, '')
        results = {}
        for name, params in ({} if only_stress else cases).items():
            for split in [0] + list(range(1, 16)):
                v, _ = meter(work, mem, syms, params, extra=('-split', str(split)) if split else (), tag=name)
                results[(name, split)] = v
                if v > worst[0]:
                    worst = (v, f'{name}, split {split}')
            print(f'measured {name}: unsplit {results[(name, 0)]:.2f}, worst with a split '
                  f'{max(results[(name, s)] for s in range(1, 16)):.2f}')
        if results:
            print(f'measured worst: {worst[0]:.2f} executed instructions/sample ({worst[1]}); {len(results)} cases')

        # stress
        n = 44100 * 2 + 44100 * 2
        frames = 16
        blocks = n // frames
        rnd = random.Random(9)
        stems = [
            [round(0.9 * Q * (rnd.random() * 2 - 1) * math.exp(-(i % 11025) / 1500)) if i < 88200 else 0 for i in range(n)],
            [(Q - 1 if (i // 110) % 2 else -Q) if i < 88200 else 0 for i in range(n)],
            [round(0.9 * Q * math.sin(2 * math.pi * (20 * (1000 ** (i / 88200))) * i / 44100)) if i < 88200 else 0
             for i in range(n)],
            [round(Q * (rnd.random() * 2 - 1)) if i < 88200 else 0 for i in range(n)],
            [(Q - 1 if i % 4410 == 0 else 0) if i < 88200 else 0 for i in range(n)],
            [((Q - 1) if (i // 8820) % 2 else -Q) if i < 88200 else 0 for i in range(n)],
            [0] * n,
            [round(0.3 * Q * sum(math.sin(2 * math.pi * f * i / 44100) for f in (220, 277.2, 329.6)))
             if i < 88200 else 0 for i in range(n)],
        ]
        ins, pfs = [], []
        for k, stem in enumerate(stems):
            p = work / f's{k}.in'
            p.write_bytes(struct.pack(f'<{2 * n}i', *[s for v in stem for s in (v, v)]))
            ins.append(str(p))
            pf = work / f's{k}.params'
            moving(pf, blocks, seed=k + 11, every_slot=True)
            pfs += ['-params', '13,127,0,0,0,0,0,0,0,0,0,0', '-paramfile', str(pf)]
        cmd = [str(V.DSP_HOST), '-mem', str(mem), '-memB', str(mem), '-init', f"{syms['init']:x}",
               '-proc', f"{syms['proc']:x}", '-ctx', '40,41,42', '-ctxB', '40,41,42', '-frames', str(frames), '-blocks', str(blocks),
               '-inst', '8', '-core', '0,0,0,0,1,1,1,1', '-split', '1,3,7,8,12,15,0,0', '-stereo',
               '-in', ','.join(ins), '-out', str(work / 'stress.out'), *pfs, '-dirty', '0x5a', '-guard']
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
        print(f'stress: dsp_host exit {r.returncode}')
        for line in r.stdout.splitlines():
            if re.search(r'meter|guard|clobber|stray|hang|instance \d', line, re.I):
                print('  ' + line.strip())
        if r.returncode:
            print(r.stdout[-2000:], r.stderr[-2000:])


if __name__ == '__main__':
    main()
