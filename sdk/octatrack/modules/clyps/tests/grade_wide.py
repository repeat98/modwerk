"""Grade the fixed eight-track candidate against the stock composite."""
import argparse
from copy import deepcopy
import json
from pathlib import Path


def grade(candidate, stock):
    assert candidate == stock, 'stock mismatch'
    assert len(stock['events']) == 624 and len(stock['writes']) == 608
    assert len(stock['states']) == 219 and all(len(s[1]) == 3 for s in stock['states'])
    steps = {lane: time for lane, slot, time in stock['states'][90][1][0] if slot == 0}
    assert set(steps) == set(range(8))
    assert steps[1]-steps[0] == 5292000 and steps[2]-steps[1] == 5080320


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    for name in ('candidate', 'stock'):
        p.add_argument(name, type=Path)
    args = p.parse_args()
    if not __debug__:
        p.error('Assertions required')
    candidate, stock = (json.loads(f.read_text()) for f in (args.candidate, args.stock))
    grade(candidate, stock)
    for field in ('events', 'writes', 'states'):
        damaged = deepcopy(candidate)
        damaged[field].pop()
        try:
            grade(damaged, stock)
        except AssertionError:
            continue
        raise AssertionError(field)
    print('Eight-lane stock composite matched; three truncated streams rejected.')
