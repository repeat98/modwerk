#!/usr/bin/env python3
"""Matched worst-case SPRING REV benchmark for Mini Verb, on Air Chorus's benchmark.py protocol.

One instance per core (positions 0 and 4: core 0 and core 1), audio at X:0, 4,096 blocks of 16
frames, identical tone/transient inputs, the null stub's peak subtracted per split and core,
trigger splits 0..15. Fixed defaults, every SPRING TYPE, Mini Verb's dark/bright Tone paths and the
benchmark's moving schedule (minima, maxima, ramps, endpoint jumps). Each Mini Verb source is
injected into the private stock memory dumps as verify.py does. Units are executed dsp_host
instructions per sample: not modeled cycles and not chip timing. Raw dumps, inputs and logs stay in
--output; only statistics belong in the repository.

  DSP_HOST=/abs/dsp_host python3 -B benchmark.py --sdk /abs/disposable/octabam --output /abs/private \\
    --asm 'MINIVERB 0.2.1=/abs/upstream/miniverb-0.2.1.asm' --asm 'MINIVERB 0.2.2=/abs/miniverb.asm'
"""
import argparse, hashlib, json, os, struct, sys
from pathlib import Path
from types import SimpleNamespace

ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
ap.add_argument('--sdk', type=Path, required=True, help='disposable Octabam tree with vendor/ and out/raw/ (private MAIN OS)')
ap.add_argument('--output', type=Path, required=True)
ap.add_argument('--asm', action='append', default=[], help='LABEL=path to a Mini Verb source; repeatable')
ap.add_argument('--blocks', type=int, default=4096)
a = ap.parse_args()
sdk, out = a.sdk.resolve(), a.output.resolve()
out.mkdir(parents=True, exist_ok=True)
os.chdir(sdk)
sys.path.insert(0, str(sdk / 'tools'))
import toolpath  # noqa: E402,F401
import benchmark_reverbs as br, send_probe  # noqa: E402
from remix import registry, stock  # noqa: E402
from remix.schema import Remix  # noqa: E402
registry.remix = lambda _: Remix(name='miniverb-bench', doc='Private benchmark.', modules=('MINIVERB',), fallback='NONE')
import build_bus  # noqa: E402
br.OUT = out
stock_mems = [send_probe.dump_mem(stock.STOCK_IMAGE, out / f'stock_{p}.mem', p) for p in 'AB']
miniverb, spring = registry.by_key('MINIVERB'), registry.by_key('SPRING REV')


def inject(label, path):
    words, init, proc = build_bus.assemble(Path(path).read_text(), 0x2000, 'MINIVERB')
    chunk = lambda space, at, data: struct.pack('<BII', space, at, len(data)) + struct.pack('<' + 'I' * len(data), *data)
    mems = []
    for c, mem in enumerate(stock_mems):
        blob = mem.read_bytes()
        assert blob[-9] == 255
        blob = blob[:-9] + chunk(0, 0x2000, words) + chunk(1, 0x215 + 0x17, [init]) + chunk(1, 0x235 + 0x17, [proc]) + blob[-9:]
        p = out / f'{label}_{c}.mem'; p.write_bytes(blob); mems.append(p)
    return mems, len(words), hashlib.sha256(Path(path).read_bytes()).hexdigest()


def knob_values(mod, overrides):
    vals = br.knobs(mod)  # defaults with MIX 127
    for name, value in overrides.items():
        vals[[p.name for p in mod.params].index(name.encode())] = value
    return vals


null = SimpleNamespace(key='NULL STUB', name='null', menu=SimpleNamespace(fx2_id=0),
                       params=[SimpleNamespace(default=0, active=False, name=b'', count=128)] * 12)
inputs = [br.source(a.blocks, k) for k in range(2)]
effects = [('SPRING REV', spring, stock_mems, None, None)]
for spec in a.asm:
    label, path = spec.split('=', 1)
    effects.append((label, miniverb, *inject(label.replace(' ', '_'), path)))
FIXED = {'SPRING REV': [('fixed', {}), ('type0', {'TYPE': 0}), ('type1', {'TYPE': 1}), ('type2', {'TYPE': 2})],
         'MINIVERB': [('fixed', {}), ('dark', {'TONE': 0}), ('bright', {'TONE': 127})]}
rows = []
for split in range(16):
    base, _ = br.run(null, stock_mems, f'null_s{split}', a.blocks, 2, False, split=[split] * 2,
                     inputs=inputs, positions=[0, 4], extra=('-audio', '0'))
    for label, mod, mems, _, _ in effects:
        for tag, overrides, moving in [(t, o, False) for t, o in FIXED[mod.key]] + [('moving', {}, True)]:
            name = f'{label}_{tag}_s{split}'.replace(' ', '_')
            extra = ['-audio', '0']
            if overrides:
                csv = out / (name + '.csv')
                csv.write_text('0,' + ','.join(map(str, knob_values(mod, overrides))) + '\n')
                extra += ['-paramfile', str(csv)] * 2  # one file per instance: both cores
            row, _ = br.run(mod, mems, name, a.blocks, 2, moving, split=[split] * 2,
                            inputs=inputs, positions=[0, 4], extra=tuple(extra))
            rows.append({'effect': label, 'case': tag, 'split': split,
                         'cores': [{'core': c, 'initInstructions': row['cores'][c]['init_instructions'],
                                    'peakBlockInstructions': row['cores'][c]['peak_block'],
                                    'nullBlockInstructions': base['cores'][c]['peak_block'],
                                    'netWorstInstructionsPerSample': (row['cores'][c]['peak_block'] - base['cores'][c]['peak_block']) / 16}
                                   for c in range(2)],
                         'clippedSamples': row['clipped_samples']})
worst = {}
for r in rows:
    for c in r['cores']:
        if c['netWorstInstructionsPerSample'] > worst.get((r['effect'], c['core']), (-1,))[0]:
            worst[(r['effect'], c['core'])] = (c['netWorstInstructionsPerSample'], r['case'], r['split'])
spring_worst = max(v for (e, _), (v, _, _) in worst.items() if e == 'SPRING REV')
record = {'units': 'executed dsp_host instructions/sample; not modeled cycles or chip timing',
          'sampleRate': 44100, 'framesPerBlock': 16, 'blocksPerCase': a.blocks, 'audioBase': 0, 'instancesPerCore': 1,
          'conditions': 'airwindows-chorus/benchmark.py protocol: positions 0 and 4, identical two-core tone/transient '
                        'input, null stub peak subtracted per split and core, splits 0..15; fixed defaults, every SPRING '
                        'TYPE, Mini Verb TONE 0/127 and the benchmark_reverbs.knobs moving schedule. Finite observed maxima. '
                        'Excludes the stock dispatcher, voice engines, ColdFire, DMA, memory wait states and stalls.',
          'stockMainSha256': hashlib.sha256(stock.STOCK_IMAGE.read_bytes()).hexdigest(),
          'dspHostSha256': hashlib.sha256(br.HOST.read_bytes()).hexdigest(),
          'dspHostSourceSha256': hashlib.sha256((sdk / 'tools/harness/dsp_host/dsp_host.cpp').read_bytes()).hexdigest(),
          'benchmarkSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
          'sources': {label: {'sha256': digest, 'words': words} for label, _, _, words, digest in effects if digest},
          'worst': [{'effect': e, 'core': c, 'netWorstInstructionsPerSample': v, 'case': case, 'split': s,
                     'ratioToWorstSpring': round(v / spring_worst, 4)}
                    for (e, c), (v, case, s) in sorted(worst.items())],
          'rows': rows}
(out / 'stock-comparison.json').write_text(json.dumps(record, indent=2) + '\n')
for w in record['worst']:
    print(w, flush=True)
