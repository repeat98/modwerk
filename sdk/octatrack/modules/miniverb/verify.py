#!/usr/bin/env python3
"""Render Mini Verb through the existing native assembler and DSP host.

Needs a disposable Octabam tree, its patched vendor toolchain, DSP_HOST and
an original local MAIN OS extraction. All binary output stays outside Git.
This is an offline DSP proof, not shared-builder or hardware qualification.
"""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import struct
import subprocess
import sys
from types import SimpleNamespace

ap = argparse.ArgumentParser(description=__doc__)
ap.add_argument('--sdk', type=Path, required=True)
ap.add_argument('--stock', type=Path, required=True)
ap.add_argument('--output', type=Path, required=True)
args = ap.parse_args()
sdk, output = args.sdk.resolve(), args.output.resolve()
output.mkdir(parents=True, exist_ok=True)
os.chdir(sdk)
sys.path.insert(0, str(sdk / 'tools'))
import toolpath  # noqa: E402,F401
import benchmark_reverbs as bench  # noqa: E402
import send_probe  # noqa: E402
from remix import registry  # noqa: E402

bench.OUT = output
# Guarded 30-second interpreter renders can exceed the benchmark's ordinary
# three-minute timeout. Only this test's host calls get the longer deadline.
bench.subprocess = SimpleNamespace(run=lambda command, **kw: subprocess.run(command, **{**kw, 'timeout': 900}))
folder = Path(__file__).resolve().parent
baseline = registry._load_one(folder / 'upstream/manifest-0.2.0.py')
baseline_asm = folder / 'upstream/miniverb-0.2.0.asm'
candidate = registry._load_one(folder / 'manifest.py')
# Select the existing module profile just as the source-package compiler does.
from remix.schema import Remix  # noqa: E402
registry.remix = lambda _: Remix(name='miniverb-tone-test', doc='Private DSP regression.', modules=('MINIVERB',), fallback='NONE')
import build_bus  # noqa: E402
assert [p.name.decode() for p in candidate.params[:6]] == ['DECAY', 'DAMP', 'TONE', 'MOD', 'RATE', 'MIX']
report = {'moduleVersion': '0.2.3-experimental', 'sampleRate': 44100,
          'framesPerBlock': 16, 'hardware': 'not tested', 'checks': [], 'loads': [],
          'sources': {name: hashlib.sha256((folder / name).read_bytes()).hexdigest()
                      for name in ('miniverb.asm', 'manifest.py', 'verify.py')},
          'stockMainSha256': hashlib.sha256(args.stock.read_bytes()).hexdigest(),
          'baselineSources': {name: hashlib.sha256((folder / 'upstream' / {'miniverb.asm': 'miniverb-0.2.0.asm', 'manifest.py': 'manifest-0.2.0.py'}[name]).read_bytes()).hexdigest()
                              for name in ('miniverb.asm', 'manifest.py')}}

def gate(name, ok, **detail):
    report['checks'].append({'name': name, 'passed': bool(ok), **detail})
    (output / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(('PASS ' if ok else 'FAIL ') + name + ' ' + json.dumps(detail), flush=True)
    if not ok:
        raise AssertionError(name)

base_mems = [send_probe.dump_mem(args.stock, output / f'stock_{c}.mem', c) for c in 'AB']

def assembled(name, path):
    words, init, proc = build_bus.assemble(path.read_text(), 0x2000, 'MINIVERB')
    gate(name + ': assembler/disassembler round-trip', len(words) > 0, words=len(words))
    report[name + 'Words'] = len(words)
    report[name + 'ProgramSha256'] = hashlib.sha256(struct.pack('<' + 'I' * len(words), *words)).hexdigest()
    def chunk(space, address, data):
        return struct.pack('<BII', space, address, len(data)) + struct.pack('<' + 'I' * len(data), *data)
    mems = []
    for c, mem in enumerate(base_mems):
        blob = mem.read_bytes()
        assert blob[-9] == 255
        blob = blob[:-9] + chunk(0, 0x2000, words)
        blob += chunk(1, 0x215 + 0x17, [init]) + chunk(1, 0x235 + 0x17, [proc]) + mem.read_bytes()[-9:]
        p = output / f'{name}_{c}.mem'; p.write_bytes(blob); mems.append(p)
    return mems

old = assembled('baseline', baseline_asm)
new = assembled('candidate', folder / 'miniverb.asm')
published_asm = folder / 'upstream/miniverb-0.2.2.asm'
pub = assembled('published', published_asm)
import cycle_count  # noqa: E402
for name, path in (('baseline', baseline_asm), ('published', published_asm), ('candidate', folder / 'miniverb.asm')):
    cycle_count._ASM['miniverb'] = path
    static = cycle_count.measure('miniverb')
    gate(name + ': static cycle marker preserves code', cycle_count.verify('miniverb', static))
    report[name + 'Static'] = {k: v for k, v in static.items() if k in ('words', 'cycles', 'total_words', 'loop_end')}


def render(mod, mems, tag, blocks, values=None, **kw):
    events = values or [(0, bench.knobs(mod))]
    csv = output / (tag + '.csv')
    csv.write_text(''.join(','.join(map(str, [block, *knobs])) + '\n' for block, knobs in events))
    extra = ['-paramfile', str(csv), *kw.pop('extra', [])]
    return bench.run(mod, mems, tag, blocks, extra=extra, **kw)

def knobs(tone=64, mix=127):
    p = bench.knobs(candidate); p[2] = tone; p[5] = mix; return p

# 0.2.3 only wraps the ring at 15,870 words instead of 16,384 (reads end at 13,749) and clears that span in
# the same 128 dry calls; the published 0.2.2 program is the oracle, so every output must be bit-identical:
# eight moving instances on both cores, every trig split on both cores, and the hot mixer input at each
# Tone endpoint.
splits = [1, 3, 7, 15, 15, 7, 3, 1]
cases = [('eight', dict(split=splits))] + [(f'split{s}', dict(instances=2, positions=[0, 4], split=[s, s])) for s in range(16)]
for tag, kw in cases:
    ins = [bench.source(2048, k) for k in range(kw.get('instances', 8))]
    _, x = bench.run(candidate, new, 'ident_new_' + tag, 2048, automate=True, inputs=ins, **kw)
    _, y = bench.run(candidate, pub, 'ident_pub_' + tag, 2048, automate=True, inputs=ins, **kw)
    gate(f'moving controls, {tag}: bit-identical to published 0.2.2', x == y, instances=len(x))
hot = bench.raw(output / 'ident_hot.raw', [round(.9 * 8388607 * math.sin(2 * math.pi * 733 * n / 44100)) for n in range(4096 * 16)])
for tone in (0, 64, 127):
    p = knobs(tone, 32)
    kw = dict(instances=2, inputs=[hot, hot], positions=[0, 4], split=[7, 7], extra=['-audio', '0'])
    _, x = render(candidate, new, f'ident_hot_new_{tone}', 4096, [(0, p)], **kw)
    _, y = render(candidate, pub, f'ident_hot_pub_{tone}', 4096, [(0, p)], **kw)
    gate(f'0.9 FS, MIX 32, TONE {tone}, both cores: bit-identical to published 0.2.2', x == y)


# Low-level neutral audio retains the tank and differs only by the bounded
# three-bit multiplier quantization. The published 0.2.0 source is the oracle.
blocks = 1400
inputs = [bench.source(blocks, k) for k in range(8)]
for split in (0, 1, 7, 15):
    events = []
    previous = []
    for b in range(blocks):
        p = knobs(); p[0] = (b * 3) % 128; p[1] = (b * 5) % 128
        p[3] = (b * 7) % 128; p[4] = (b // 41) % 8; p[5] = (b * 11) % 128
        events.append((b, p)); previous.append((b, p))
    _, a = render(candidate, new, f'neutral_new_{split}', blocks, events, instances=1, inputs=[inputs[0]], split=[split])
    _, b = render(baseline, old, f'neutral_old_{split}', blocks, previous, instances=1, inputs=[inputs[0]], split=[split])
    error = max(abs(x-y) for x,y in zip(a[0],b[0]))
    gate(f'TONE 64: low-level accepted voice within 8 LSB, split {split}', error <= 8, peakDifferenceLsb=error)

# Full-range dry input must remain exact even at the colored endpoints.
ramp = [round(-8388607 + i * 16777214 / (blocks * 16 - 1)) for i in range(blocks * 16)]
path = bench.raw(output / 'bipolar.raw', ramp)
for tone in (0, 64, 127):
    _, a = render(candidate, new, f'dry_{tone}', blocks, [(0, knobs(tone, 0))], instances=1, inputs=[path])
    gate(f'MIX 0: exact dry at TONE {tone}', list(a[0][::2]) == ramp and list(a[0][1::2]) == ramp)

# Measure wet audio before the mixer. Using a full-wet render of the old
# mixer as the oracle hides its clipped wet-minus-dry difference and confounds
# that with output clipping. The reference removes only the two mix bodies;
# their final stores bound the measured wet output. Judge only samples where
# that wet store did not limit, with the known dry input still within range.
mix_body = '''        move    x:(r7+$2a),y1
        move    x:(r0),b
        sub     b,a
        asr     #$3,a,a
        move    a,x0
        mpy     x0,y1,a
        asl     #$3,a,a
        add     b,a
        move    a,x:(r0)+'''
source = (folder / 'miniverb.asm').read_text()
assert source.count(mix_body) == 2
reference_source = source.replace(mix_body, '        nop\n' * 8 + '        move    a,x:(r0)+')
reference_path = output / 'raw-wet-only.asm'
reference_path.write_text(reference_source)
report['rawWetMeasurementSourceSha256'] = hashlib.sha256(reference_source.encode()).hexdigest()
wet_mems = assembled('rawWetMeasurement', reference_path)
for amplitude in (.24, .9):
    blocks = 8192
    samples = [round(amplitude * 8388607 * math.sin(2 * math.pi * 733 * n / 44100))
               for n in range(blocks * 16)]
    path = bench.raw(output / f'hot_input_{amplitude}.raw', samples)
    dry = [value for value in samples for _ in range(2)]
    for core in (0, 1):
        p = knobs(64, 32)
        options = dict(instances=1, inputs=[path], positions=[core * 4], split=[7], extra=['-audio', '0'])
        _, wet = render(candidate, wet_mems, f'raw_wet_{amplitude}_{core}', blocks, [(0, p)], **options)
        _, before = render(baseline, old, f'old_mix_{amplitude}_{core}', blocks, [(0, p)], **options)
        row, after = render(candidate, new, f'new_mix_{amplitude}_{core}', blocks, [(0, p)], **options)
        indexes = [i for i in range(44100 * 2, len(dry)) if abs(wet[0][i]) < 8388600]
        errors = [[track[0][i] - (.75 * dry[i] + .25 * wet[0][i]) for i in indexes]
                  for track in (before, after)]
        peaks = [max(map(abs, error)) for error in errors]
        gate(f'{amplitude} FS, core {core}: raw wet and 25% mix stay affine',
             bool(indexes) and peaks[1] <= 512 and row['clipped_samples'] == 0,
             eligibleSamples=len(indexes), oldPeakErrorLsb=peaks[0], newPeakErrorLsb=peaks[1],
             rawWetLimitedSamples=sum(abs(v) >= 8388600 for v in wet[0][44100 * 2:]),
             mixedClippedSamples=row['clipped_samples'])
        if amplitude == .9:
            gate(f'core {core}: published mixer reproduces intermediate clipping', peaks[0] > 512)

# Frequency ratios compare actual rendered reverberation with the accepted
# neutral voice; equal parameters and stationary modulation isolate Tone.
for hz in (70, 4000):
    nblocks = 6500
    samples = [round(.1 * 8388607 * math.sin(2 * math.pi * hz * n / 44100))
               if n >= bench.WARM * 16 else 0 for n in range(nblocks * 16)]
    path = bench.raw(output / f'sine_{hz}.raw', samples)
    energy = {}
    for tone in (0, 64, 127):
        p = knobs(tone); p[3] = 0
        row, a = render(candidate, new, f'spectrum_{hz}_{tone}', nblocks, [(0, p)], instances=1, inputs=[path])
        gate(f'TONE {tone}, {hz} Hz: finite unclipped wet signal', row['clipped_samples'] == 0 and row['peak_audio'] > 0)
        energy[tone] = sum(v * v for v in a[0][-44100 * 2:])
    gains = {tone: 10 * math.log10(energy[tone] / energy[64]) for tone in (0, 127)}
    if hz == 70:
        gate('bright endpoint removes lows; dark endpoint retains lows', gains[127] < -8 and abs(gains[0]) < 1, gainDb=gains)
    else:
        gate('dark endpoint removes highs; bright endpoint retains highs', gains[0] < -10 and abs(gains[127]) < 1, gainDb=gains)

# The benchmark's automation drives all six controls independently. Real
# per-core allocator regions and r7 strides exercise all eight instances.
splits = [1, 3, 7, 15, 15, 7, 3, 1]
row, together = bench.run(candidate, new, 'eight_moving', 2048, automate=True,
                          inputs=[bench.source(2048, k) for k in range(8)], split=splits,
                          extra=['-guard', '15870', '-guard-shared'])
report['loads'].append(row)
gate('eight instances: private and shared Y/program bounds',
     len(re.findall(r'\b0 stray write regions, 0 CLOBBERING', (output / 'miniverb_eight_moving.log').read_text())) == 8)
# Control: published 0.2.2's ring and clear covered all 16,384 words, Sidechain Compressor's key window
# (+$3dfe..+$3fff) included, so the same 15,870-word guard must catch it on every instance.
bench.run(candidate, pub, 'published_guard', 2048, automate=True,
          inputs=[bench.source(2048, k) for k in range(8)], split=splits,
          extra=['-guard', '15870', '-guard-shared'])
gate('control: the same guard catches published 0.2.2 writing past +$3dfd',
     len(re.findall(r'\b[1-9][0-9]* stray write regions', (output / 'miniverb_published_guard.log').read_text())) == 8)
for k in range(8):
    _, solo = bench.run(candidate, new, f'solo_{k}', 2048, instances=1, automate=True,
                       inputs=[bench.source(2048, k)], positions=[k], split=[splits[k]])
    gate(f'instance {k}: simultaneous and isolated output identical', together[k] == solo[0])
for k in range(8):
    _, one = bench.run(candidate, new, f'onehot_{k}', 1024, automate=True, mask=1 << k,
                      inputs=[bench.source(1024, j) for j in range(8)])
    gate(f'instance {k}: all seven unexcited instances stay exactly silent',
         any(one[k]) and not any(v for j, channel in enumerate(one) if j != k for v in channel))
_, skew = bench.run(candidate, new, 'skew', 2048, automate=True,
                   inputs=[bench.source(2048, k) for k in range(8)], split=splits, extra=['-skew', '97'])
gate('interleaved cores preserve all eight outputs', skew == together)
_, quiet = bench.run(candidate, new, 'dirty_silent', 1024, automate=True, mask=0,
                    extra=['-dirty', '56300', '-guard', '15870', '-guard-shared'])
gate('dirty delay buffers: all eight silent after init', not any(v for channel in quiet for v in channel))
# Explicitly dirty all scalars, including both new tone histories.
dirty = []
for c, mem in enumerate(new):
    blob = mem.read_bytes(); body = blob[:-9]
    for k in range(4):
        body += struct.pack('<BII', 1, 0x6200 + k * 0x300, 0x100) + struct.pack('<I', 0x5a5a5a) * 0x100
    p = output / f'dirty_scalar_{c}.mem'; p.write_bytes(body + blob[-9:]); dirty.append(p)
_, a = bench.run(candidate, dirty, 'dirty_scalars', 1024, automate=True, mask=0)
gate('dirty scalar blocks: Tone states clear on every init', not any(v for channel in a for v in channel))

# Budget compares the exact current baseline on the same workload. Its
# numbers are executed instructions, never fabricated chip cycle counts.
base_row, _ = bench.run(baseline, old, 'baseline_load', 2048, automate=True, split=splits)
report['loads'].append(base_row)
peak = max(c['peak_block'] for c in row['cores'])
base_peak = max(c['peak_block'] for c in base_row['cores'])
gate('processing stays within 2% of published 0.2.0 cost', peak <= base_peak * 1.02,
     candidatePeak=peak, baselinePeak=base_peak, extraPercent=100 * (peak / base_peak - 1))
row, _ = bench.run(candidate, new, 'neutral_load', 2048)
report['loads'].append(row)

# This is an eight-instance DSP stress render, not a project/voice-engine stress
# test. Every continuous control moves, and bounds remain armed for all 30 s.
row, _ = bench.run(candidate, new, 'stress_30s', math.ceil(30 * 44100 / 16), automate=True,
                   split=splits, inputs=[bench.source(math.ceil(30 * 44100 / 16), k) for k in range(8)],
                   extra=['-dirty', '56300', '-guard', '15870', '-guard-shared'])
report['loads'].append(row)
gate('30 seconds: eight moving instances, dirty init and all buffer guards',
     len(re.findall(r'\b0 stray write regions, 0 CLOBBERING', (output / 'miniverb_stress_30s.log').read_text())) == 8
     and row['clipped_samples'] == 0, blocks=row['blocks'], peak=max(c['peak_block'] for c in row['cores']))

# Review audio: same deterministic percussion at all three colors, preserving
# actual gain and stereo. All WAVs remain in the private output directory.
nblocks = 14000
samples = []
for n in range(nblocks * 16):
    t = n - bench.WARM * 16
    beat = t % 22050
    value = .3 * math.sin(2 * math.pi * (60 * beat / 44100 + .15 * (1 - math.exp(-beat / 700)))) * math.exp(-beat / 2000)
    value += .08 * math.sin(2 * math.pi * 4000 * t / 44100) * math.exp(-(t % 5512) / 140)
    samples.append(round(value * 8388607) if 0 <= t < 3 * 44100 else 0)
path = bench.raw(output / 'percussion.raw', samples)
for tone, name in ((0, 'dark'), (64, 'neutral'), (127, 'bright')):
    row, a = render(candidate, new, 'percussion_' + name, nblocks, [(0, knobs(tone))], instances=1, inputs=[path])
    gate(name + ': stereo, no clipping and decaying percussion tail', row['clipped_samples'] == 0
         and any(l != r for l, r in zip(a[0][::2], a[0][1::2]))
         and sum(v*v for v in a[0][-44100:]) < sum(v*v for v in a[0][-88200:-44100]))
    bench.wav(output / (name + '.wav'), a[0][bench.WARM * 16 * 2:])

# Move through neutral in both directions while rendering a sustained input;
# the bounded smoother must settle back to exact neutral rather than retaining
# a sub-LSB bias. The -track channel sees the actual DSP state every block.
p = knobs(0); neutral = knobs(64); bright = knobs(127)
track = output / 'tone-state.txt'
row, _ = render(candidate, new, 'tone_slew', 6500, [(0, p), (1800, bright), (3600, neutral)],
                instances=1, inputs=[bench.source(6500)], split=[7],
                extra=['-track', '2f', '-trackout', str(track)])
states = [int(line.split()[1]) for line in track.read_text().splitlines()]
gate('smoothed endpoints and return to exact neutral', states[1700] == 0x800000
     and states[3500] == 0x7fffff and states[-1] == 0, lastState=states[-1])
signed = lambda v: (v ^ 0x800000) - 0x800000
movement = max(abs(signed(b) - signed(a)) for a, b in zip(states, states[1:]))
gate('full-range Tone jumps retain the per-sample slew bound', movement < 0x100000, maxBlockStep=movement)
report['complete'] = True
(output / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
print(f"{len(report['checks'])} draft DSP checks passed", flush=True)
