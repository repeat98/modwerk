#!/usr/bin/env python3
"""E-Verb's performance measurements for evidence/performance.json. Not hardware.

    python3 modules/everb/perf.py bench  <outdir>                  # from sdk/octabam; about 10 s
    python3 modules/everb/perf.py stress <outdir> [--seconds 32]   # about 12 min

Both build the same private native image as verify.py (stock DSP code built in, E-Verb in the space
of SPRING REV and DARK REV) in a temporary folder and delete it afterwards. They need your own OS 1.40C
extraction (out/raw/section_3_MAIN_OS.bin), the stock baseline (tools/harness/benchmark_stock_dsp.py ->
out/stock_dsp_bench/results.json) and the patched DSP56300 tools. Output is JSON in <outdir>; no image,
dump or audio is kept.

bench   benchmark_reverbs.run as benchmark_stock_dsp.py runs it (one instance per core at positions 0
        and 4, audio at X:0, 4,096 blocks of 16 frames, the null stub's peak subtracted), for E-Verb on
        the private image and SPRING REV, DARK REV, PLATE REV and DJ EQ on the original one, through the
        same cases: fixed knobs, the moving-knob pattern (it reaches every TYPE and MIXF) and a trig split
        at every position 1..15. E-Verb adds its dearest settings, split, and their corners.

stress  stress_project.py needs an Octatrack template project; this drives the same load straight into
        dsp_host: E-Verb on FX2 of all eight tracks (four per core) behind DJ EQ, the dearest stock
        effect, on every FX1; per block, three LFOs (sine, triangle, square) on SIZE, DPTH and MIX and a
        new random value on every slot of both effects each sixteenth at 120 BPM; trig splits on six
        tracks; eight different stems; dsp_host -guard 0x4000 -guard-shared -dirty 0x5a.
"""
import argparse
import array
import hashlib
import importlib.util
import itertools
import json
import math
import pathlib
import random
import re
import subprocess
import sys
import tempfile
import time
from types import SimpleNamespace

FOLDER = pathlib.Path(__file__).resolve().parent
_spec = importlib.util.spec_from_file_location('everb_verify', FOLDER / 'verify.py')
V = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(V)                 # its import sets up sys.path, the environment and the registry
import benchmark_reverbs as br  # noqa: E402
import send_probe  # noqa: E402
from remix import registry  # noqa: E402

ROOT, FR, SR = V.ROOT, V.FR, 44100
STOCK_BENCH = ROOT / 'out/stock_dsp_bench/results.json'


def image(work):
    img, _ = V.build_image(work)
    return img, {c: send_probe.dump_mem(img, work / f'mem_{t}.mem', t) for c, t in ((0, 'A'), (1, 'B'))}


# ---- bench --------------------------------------------------------------------------------------
STOCK_EFFECTS = ('SPRING REV', 'DARK REV', 'PLATE REV', 'DJ EQ')
SPLITS = range(1, 16)


def bench(out):
    """E-Verb and the stock effects through the same cases, so the comparison is matched: fixed knobs, the
    stock benchmark's moving pattern (it reaches every TYPE and MIXF), and both again with a trig split at
    every position 1..15. E-Verb adds its dearest settings and their corners."""
    blocks = 4096
    mod = V.MOD
    with tempfile.TemporaryDirectory(prefix='everb-perf.') as tmp:
        work = pathlib.Path(tmp)
        img, mems = image(work)
        stock_mems = {c: send_probe.dump_mem(V.STOCK, work / f'stock_{t}.mem', t) for c, t in ((0, 'A'), (1, 'B'))}
        br.OUT = work
        inputs = [br.source(blocks, k) for k in range(2)]
        null = SimpleNamespace(key='NULL STUB', name='null', menu=SimpleNamespace(fx2_id=0),
                               params=[SimpleNamespace(default=0, active=False, name=b'', count=128)] * 12)
        stock_knobs = br.knobs

        def peak(row):
            return max(c['peak_block'] for c in row['cores'])

        def mean(row):
            return max(c['mean_block'] for c in row['cores'])

        def run(m, image_mems, tag, auto=False, split=None, **kw):
            def k(mm, block=None, instance=0):
                vals = stock_knobs(mm, block, instance)
                if block is None and mm is mod:
                    for name, v in kw.items():
                        vals[V.NAMES.index(name)] = v
                return vals
            br.knobs = k
            try:
                row, _ = br.run(m, [image_mems[0], image_mems[1]], tag, blocks, 2, auto, split=split, inputs=inputs,
                                positions=[0, 4], extra=('-audio', '0'))
            finally:
                br.knobs = stock_knobs
            return row

        nulls = {'everb': peak(run(null, mems, 'null_everb')), 'stock': peak(run(null, stock_mems, 'null_stock'))}
        table = []

        def case(effect, image_key, m, tag, auto=False, split=None, **kw):
            row = run(m, mems if image_key == 'everb' else stock_mems, f'{effect}_{tag}'.replace(' ', '_'), auto, split, **kw)
            table.append(dict(effect=effect, case=tag, split=split[0] if split else 0, peakBlock=peak(row),
                              perSamplePeak=round((peak(row) - nulls[image_key]) / 16, 2),
                              perSampleMean=round((mean(row) - nulls[image_key]) / 16, 2), clippedSamples=row['clipped_samples']))

        dear = dict(mod.dear)
        for effect in ('E-Verb',) + STOCK_EFFECTS:
            m, key = (mod, 'everb') if effect == 'E-Verb' else (registry.by_key(effect), 'stock')
            case(effect, key, m, 'fixed')
            case(effect, key, m, 'moving', auto=True)
            for k in SPLITS:
                case(effect, key, m, f'moving_split{k}', auto=True, split=[k, k])
        for k in SPLITS:
            case('E-Verb', 'everb', mod, f'dear_split{k}', split=[k, k], **dear)
        case('E-Verb', 'everb', mod, 'dear', **dear)
        for dpth in (0, 32, 64, 100, 111, 112, 120, 127):
            case('E-Verb', 'everb', mod, f'dear_dpth{dpth}', **{**dear, 'DPTH': dpth})
        for rev in (0, 1):
            case('E-Verb', 'everb', mod, f'dear_rev{rev}', **{**dear, 'REV': rev})
        case('E-Verb', 'everb', mod, 'dear_mix0', **{**dear, 'MIX': 0})
        case('E-Verb', 'everb', mod, 'dear_mix0_split7', split=[7, 7], **{**dear, 'MIX': 0})
        for size, dpth in itertools.product((0, 64, 127), (0, 64, 100, 127)):
            case('E-Verb', 'everb', mod, f'dear_size{size}_dpth{dpth}', **{**dear, 'SIZE': size, 'DPTH': dpth})
        image_sha = hashlib.sha256(img.read_bytes()).hexdigest()
        stock_sha = hashlib.sha256(V.STOCK.read_bytes()).hexdigest()
    stock = json.loads(STOCK_BENCH.read_text())
    reference = {r['effect']: r for r in stock['table']}
    summary = {}
    for effect in ('E-Verb',) + STOCK_EFFECTS:
        rows = [r for r in table if r['effect'] == effect]
        unsplit = [r for r in rows if not r['split']]
        summary[effect] = dict(worstUnsplit=max(r['perSamplePeak'] for r in unsplit),
                               worstWithSplits=max(r['perSamplePeak'] for r in rows),
                               worstCase=max(rows, key=lambda r: r['perSamplePeak'])['case'])
        if effect in reference:   # positive control: the unsplit cases reproduce benchmark_stock_dsp.py
            summary[effect]['benchmarkStockDsp'] = reference[effect]['worst']
    record = dict(method=bench.__doc__.replace('\n   ', ''), imageSha256=image_sha, stockSha256=stock_sha,
                  nullPeakBlock=nulls, summary=summary, table=table)
    (out / 'bench.json').write_text(json.dumps(record, indent=1) + '\n')
    for effect, row in summary.items():
        print('%-10s worst unsplit %7.2f  with splits %7.2f (%s)%s' % (
            effect, row['worstUnsplit'], row['worstWithSplits'], row['worstCase'],
            '  benchmark_stock_dsp %.2f' % row['benchmarkStockDsp'] if 'benchmarkStockDsp' in row else ''))


# ---- stress -------------------------------------------------------------------------------------
STEP_BLOCKS = 345                     # a sixteenth at 120 BPM: 5,512.5 frames
TRACKS = [5, 6, 7, 8, 1, 2, 3, 4]     # dispatch order: core 0 (T5-8) first
CORE_OF = {t: (0 if t >= 5 else 1) for t in range(1, 9)}
POS_OF = {t: (t - 1) % 4 for t in range(1, 9)}
SPLIT = {1: 0, 2: 3, 3: 8, 4: 15, 5: 1, 6: 7, 7: 12, 8: 0}   # frames before the trig; 0 = no trig


def stems(n, seed):
    """Eight deterministic stereo stems of n frames."""
    rnd = random.Random(seed)
    out = {}
    for t in range(1, 9):
        L, R = [0.0] * n, [0.0] * n
        kind, ph, amp, f0 = t % 8, 0.0, 0.0, 110.0
        for i in range(n):
            s = i / SR
            if kind == 0:      # drum loop: kicks, snares, full-scale clicks
                beat = i % 11025
                v = (0.95 * math.sin(2 * math.pi * 55 * beat / SR) * math.exp(-beat / 2500.0)
                     + 0.6 * (rnd.random() * 2 - 1) * math.exp(-((i + 5512) % 11025) / 1200.0))
                L[i] = R[i] = 0.999 if i % 22050 == 0 else v
            elif kind == 1:    # a sustained chord at full level
                v = sum(0.3 * math.sin(2 * math.pi * f * s) for f in (220.0, 277.18, 329.63))
                L[i], R[i] = v, -v
            elif kind == 2:    # noise bursts and silence
                on = (i // 4410) % 3 == 0
                L[i] = (rnd.random() * 2 - 1) * 0.9 if on else 0.0
                R[i] = (rnd.random() * 2 - 1) * 0.9 if on else 0.0
            elif kind == 3:    # an exponential sweep 20 Hz to 20 kHz every 4 s
                ph += 2 * math.pi * 20.0 * (1000.0 ** ((s % 4.0) / 4.0)) / SR
                L[i] = R[i] = 0.8 * math.sin(ph)
            elif kind == 4:    # full-scale square, the clipping input
                L[i] = 0.999 if (i // 50) % 2 else -0.999
                R[i] = -L[i]
            elif kind == 5:    # impulses every 0.37 s, then silence: tails and idle
                L[i] = R[i] = 0.999 if i % 16317 == 0 and s < 20 else 0.0
            elif kind == 6:    # DC steps and a low tone
                L[i] = 0.5 * (1 if (i // 30000) % 2 else -1) + 0.2 * math.sin(2 * math.pi * 40 * s)
                R[i] = 0.2 * math.sin(2 * math.pi * 41 * s)
            else:              # random-level plucks
                k = i % 5512
                if k == 0:
                    amp, f0 = rnd.random(), 110 * 2 ** (rnd.randrange(24) / 12)
                L[i] = R[i] = amp * math.sin(2 * math.pi * f0 * k / SR) * math.exp(-k / 3000.0)
        out[t] = (L, R)
    return out


def automation(mod, blocks, rnd, lfo_slots):
    """Per-block rows: every named slot redrawn each step, three LFOs (sine, triangle and a square,
    which jumps) added on top, clamped to the slot's count."""
    counts = [((p.count or 128) if p.name else 1) for p in mod.params] + [1] * (12 - len(mod.params))
    named = [k for k, p in enumerate(mod.params) if p.name]
    lfos = [(slot, shape, rnd.uniform(0.2, 6.0), rnd.uniform(20, 63)) for slot, shape in zip(lfo_slots, ('sine', 'tri', 'square'))]
    rows, lock = [], [0] * 12
    for b in range(blocks):
        if b % STEP_BLOCKS == 0:
            for k in named:
                lock[k] = rnd.randrange(counts[k])
        v = list(lock)
        t = b * FR / SR
        for slot, shape, hz, depth in lfos:
            x = (t * hz) % 1.0
            w = (math.sin(2 * math.pi * x) if shape == 'sine' else (4 * x - 1 if x < 0.5 else 3 - 4 * x) if shape == 'tri'
                 else (1.0 if x < 0.5 else -1.0))
            v[slot] = max(0, min(counts[slot] - 1, int(round(v[slot] + depth * w))))
        rows.append(v[:12])
    return rows, len(named), lfos


def stress(out, seconds, tail=2.0, seed=20261008):
    everb, djeq = V.MOD, registry.by_key('DJ EQ')
    with tempfile.TemporaryDirectory(prefix='everb-stress.') as tmp:
        work = pathlib.Path(tmp)
        img, mems = image(work)
        ep = {(c, k): send_probe.entry_points(mems[c], m.menu.fx2_id) for c in (0, 1) for k, m in (('EVERB', everb), ('DJ EQ', djeq))}
        for c in (0, 1):
            none = send_probe.entry_points(mems[c], 0)
            assert ep[(c, 'EVERB')] != none and ep[(c, 'DJ EQ')] != none, 'EVERB or DJ EQ missing from the payload'
        pad = send_probe.WARMUP_BLOCKS * FR
        n_src = int(seconds * SR)
        blocks = -(-(pad + n_src + int(tail * SR)) // FR)
        rnd = random.Random(seed)
        audio = stems(n_src, seed)
        inst, raws = [], {}
        for t in TRACKS:
            L, R = audio[t]
            buf = array.array('i', [0] * (2 * blocks * FR))
            for i in range(n_src):
                buf[2 * (pad + i)] = max(-8388608, min(8388607, int(L[i] * 8388607)))
                buf[2 * (pad + i) + 1] = max(-8388608, min(8388607, int(R[i] * 8388607)))
            raws[t] = work / f'in_T{t}.raw'
            raws[t].write_bytes(buf.tobytes())
            for fx, key, mod, lfo_slots in ((1, 'DJ EQ', djeq, (0, 2, 3)), (2, 'EVERB', everb, (0, 3, 5))):
                rows, nlocked, lfos = automation(mod, blocks, rnd, lfo_slots)
                pf = work / f'auto_T{t}_FX{fx}.csv'
                pf.write_text('\n'.join(','.join(map(str, [b, *r])) for b, r in enumerate(rows)) + '\n')
                pos, core = POS_OF[t], CORE_OF[t]
                inst.append(dict(track=t, fx=fx, key=key, core=core, alloc=2 * pos + (fx - 1), r7=1 + 3 * pos + (fx - 1),
                                 ep=ep[(core, key)], paramfile=pf, locked=nlocked,
                                 lfos=[dict(slot=s, shape=sh, hz=round(hz, 3), depth=round(d, 1)) for s, sh, hz, d in lfos]))
        host_out = work / 'out.raw'
        cmd = [str(send_probe.HOST), '-mem', str(mems[0]), '-memB', str(mems[1]),
               '-init', ','.join('%x' % i['ep'][0] for i in inst), '-proc', ','.join('%x' % i['ep'][1] for i in inst),
               '-inst', str(len(inst)), '-core', ','.join(str(i['core']) for i in inst),
               '-alloc', ','.join(str(i['alloc']) for i in inst), '-r7', ','.join(str(i['r7']) for i in inst),
               '-audioidx', ','.join(str(i['track'] - 1) for i in inst), '-audio', '9000',
               '-in', ','.join(str(raws[i['track']]) for i in inst), '-split', ','.join(str(SPLIT[i['track']]) for i in inst),
               '-frames', str(FR), '-blocks', str(blocks), '-stereo',
               '-guard', '0x4000', '-guard-shared', '-dirty', '0x5a', '-out', str(host_out), '-meter', str(work / 'meter.txt')]
        for i in inst:
            cmd += ['-paramfile', str(i['paramfile'])]
        t0 = time.time()
        r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
        wall = time.time() - t0
        text = r.stdout + r.stderr
        guard = {int(k): (int(s), int(c)) for k, s, c in
                 re.findall(r'instance (\d+): \d+ non-zero output samples, (\d+) stray write regions, (\d+) CLOBBERING', text)}
        meter = [list(map(int, l.split())) for l in (work / 'meter.txt').read_text().split('\n') if l.strip() and not l.startswith('#')]
        per_core = {c: max(row[1 + c] for row in meter[send_probe.WARMUP_BLOCKS:]) for c in (0, 1)}
        image_sha = hashlib.sha256(img.read_bytes()).hexdigest()
    everb_k = [k for k, i in enumerate(inst) if i['key'] == 'EVERB']
    record = dict(
        imageSha256=image_sha, seconds=seconds, tailSeconds=tail, blocks=blocks, framesPerBlock=FR, seed=seed,
        layout=[{k: v for k, v in i.items() if k not in ('paramfile', 'ep')} for i in inst],
        everbPerCore={str(c): sum(1 for i in inst if i['core'] == c and i['key'] == 'EVERB') for c in (0, 1)},
        splits={f'T{t}': s for t, s in SPLIT.items()}, lfosPerTrack=3,
        slotsChangedPerStep=min(sum(i['locked'] for i in inst if i['track'] == t) for t in TRACKS),
        stepBlocks=STEP_BLOCKS, guard='-guard 0x4000 -guard-shared', dirty='0x5a',
        hostExit=r.returncode, hangs=text.count('HANG'),
        everbStrayRegions=sum(guard.get(k, (0, 0))[0] for k in everb_k), everbClobbers=sum(guard.get(k, (0, 0))[1] for k in everb_k),
        allClobbers=sum(c for _, c in guard.values()), guardedInstances=len(guard),
        stockStrayRegions=sum(s for k, (s, _) in guard.items() if k not in everb_k),
        peakPerCorePerSample={str(c): round(v / FR, 1) for c, v in per_core.items()}, wallSeconds=round(wall, 1))
    (out / 'stress.json').write_text(json.dumps(record, indent=1) + '\n')
    print(json.dumps({k: v for k, v in record.items() if k != 'layout'}, indent=1))
    return 1 if (r.returncode or record['hangs'] or record['allClobbers'] or record['guardedInstances'] != 16) else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('what', choices=('bench', 'stress'))
    ap.add_argument('out', type=pathlib.Path)
    ap.add_argument('--seconds', type=float, default=32.0)
    a = ap.parse_args()
    out = a.out.resolve()
    out.mkdir(parents=True, exist_ok=True)
    if not STOCK_BENCH.is_file():
        sys.exit(f'missing {STOCK_BENCH}: python3 tools/harness/benchmark_stock_dsp.py')
    return bench(out) if a.what == 'bench' else stress(out, a.seconds)


if __name__ == '__main__':
    sys.exit(main())
