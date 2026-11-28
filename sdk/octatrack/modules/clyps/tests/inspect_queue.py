# SPDX-License-Identifier: GPL-3.0-or-later
"""Report strict differences and the flag-clear time relative to first observation."""
import json
from pathlib import Path
import argparse

MASK = 0x46c7fe44


def witness(path, tick):
    rows = [json.loads(line) for line in path.read_text().splitlines()]
    window = [r for r in rows if tick-1 <= r['tick'] <= tick+1]
    samples = [r for r in window if r['tick'] == tick]
    first, second = samples[:2]
    builders = [raw.split(':')[1] for r in samples for raw in r['hits']]
    counts = {pc: builders.count(pc) for pc in ('400a2d60', '4009d1e8', '4009cf4c')}
    writes = []
    for r in window:
        for raw in r['writes']:
            sample, pc, address, value, width, _ = raw.split(':')
            lane = int(address, 16) - MASK
            if 0 <= lane < 8:
                writes.append(dict(lane=lane, pc=pc, value=int(value,16), width=int(width,16),
                                   deltaSamples=round(float(sample)-first['sample'],3)))
    return dict(firstSample=first['sample'], firstMask=first['queue'],
                nextSample=second['sample'], nextMask=second['queue'],
                selectorReturnsAndBuilders=counts, mutations=writes)


def compare(candidate, stock):
    result = {}
    for key in ('events', 'writes', 'states'):
        a,b = candidate[key], stock[key]
        diff = [i for i in range(min(len(a),len(b))) if a[i] != b[i]]
        result[key] = dict(candidate=len(a), stock=len(b), differentIndices=diff,
                           overlapCompared=min(len(a),len(b)))
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('candidate','stock','candidate_clock','stock_clock'):
        parser.add_argument(name, type=Path)
    args = parser.parse_args()
    result = compare(json.loads(args.candidate.read_text()), json.loads(args.stock.read_text()))
    result['tick193'] = [witness(path,193) for path in (args.candidate_clock,args.stock_clock)]
    print(json.dumps(result, indent=2))
