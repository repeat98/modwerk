#!/usr/bin/env python3
"""Compare executed DSP output with the published source, byte for byte.

Pass a private folder containing chorus.asm from the approved base commit;
no stock firmware is needed. Finite fixture agreement is not chip timing or
hardware qualification. Baseline code and rendered audio remain private.
"""
import argparse
import hashlib
import json
import math
import pathlib
import random
import tempfile
import verify


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', type=pathlib.Path, required=True)
    parser.add_argument('--output', type=pathlib.Path, required=True)
    args = parser.parse_args()
    here = verify.HERE
    baseline = args.baseline.resolve()
    n = 32768  # Cold history, warm history and several full ring wraps.
    rng = random.Random(0xA1C)
    left = [rng.randrange(-verify.Q, verify.Q) for _ in range(n)]
    right = [round(.98*(verify.Q-1)*math.sin(2*math.pi*19000*i/44100)) for i in range(n)]
    cases = [(f'static-{knobs}', knobs, 0, ()) for knobs in
             [(0, 0, 0), (0, 0, 127), (64, 64, 64), (127, 127, 127),
              (127, 0, 127), (0, 127, 127)]]
    schedule = ('1:0:0=127,1:0:1=127,1:0:5=127,'
                '511:0:0=0,511:0:1=0,511:0:5=0,'
                '513:0:0=64,513:0:1=64,513:0:5=64,'
                '1023:0:0=127,1023:0:1=127,1023:0:5=127',)
    cases += [(f'moving-split-{split}', (64, 64, 64), split, schedule) for split in range(16)]
    cases += [(f'random-{i}', tuple(rng.randrange(128) for _ in range(3)), i % 16, schedule) for i in range(8)]
    rows = []
    with tempfile.TemporaryDirectory(prefix='air-chorus-parity-') as tmp:
        root = pathlib.Path(tmp)
        old, new = root/'old', root/'new'
        old.mkdir(); new.mkdir()
        try:
            verify.HERE = baseline
            oldmem, oldsym, oldwords, oldsha = verify.assemble(old)
        finally:
            verify.HERE = here
        newmem, newsym, newwords, newsha = verify.assemble(new)
        for name, knobs, split, schedules in cases:
            before = verify.run(old, oldmem, oldsym, left, right, knobs, dirty=True, split=split, schedules=schedules)
            after = verify.run(new, newmem, newsym, left, right, knobs, dirty=True, split=split, schedules=schedules)
            equal = before[:2] == after[:2]
            verify.check(name, equal, f'bit-identical={equal}; meter {before[2]} -> {after[2]} instructions/sample including harness')
            rows.append({'name': name, 'bitIdentical': equal, 'frames': n,
                         'beforeInstructionsPerSampleIncludingHarness': before[2],
                         'afterInstructionsPerSampleIncludingHarness': after[2]})
    record = {'candidateVersion': json.loads((here/'octamod.module.json').read_text())['version'],
              'baselineSourceSha256': hashlib.sha256((baseline/'chorus.asm').read_bytes()).hexdigest(),
              'optimizedSourceSha256': hashlib.sha256((here/'chorus.asm').read_bytes()).hexdigest(),
              'baselineAssembledSha256': oldsha, 'optimizedAssembledSha256': newsha,
              'baselineProgramWords': oldwords, 'optimizedProgramWords': newwords,
              'conditions': 'Synthetic DSP memory, dirty init, independent full-scale seeded noise and 19 kHz tone, cold/warm history, four ring wraps, endpoints and moving controls. Instructions include the identical synthetic harness; not hardware cycles.',
              'results': rows}
    args.output.write_text(json.dumps(record, indent=2)+'\n')
    if verify.failures:
        raise SystemExit(f'{len(verify.failures)} failed gates')


if __name__ == '__main__':
    main()
