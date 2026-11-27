"""Compare a near-wrap panel run with the matching native stock composite."""
import argparse
import json
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('phase', choices=('early', 'late'))
parser.add_argument('candidate', type=Path)
parser.add_argument('reference', type=Path)
args = parser.parse_args()
if not __debug__:
    parser.error('Assertions required')
candidate, reference = (json.loads(p.read_text()) for p in (args.candidate, args.reference))
early = args.phase == 'early'
# Captured stock coverage for these two fixed NORMAL-16 replays, including tick zero.
call_count, write_count = (576, 560) if early else (848, 816)
select_edge, restore_edge, restore_observed = (89, 185, 185) if early else (91, 187, 188)
assert reference['panel_requests'] == []
first = 90 if early else 186
last = first + 96
assert candidate['wraps'] == reference['wraps'] == list(range(90, last+1, 96))

events = candidate['events']
assert len(events) == len(reference['events']) == call_count, 'incomplete native call stream'
assert [e[:5] for e in events] == [e[:5] for e in reference['events']]
for event, control in zip(events, reference['events']):
    if event[1] == 0x400a536c:  # stock trig dispatch
        assert len(event) == len(control) == 4
    else:
        assert event[1] in (0x4009d1e8, 0x4009cf4c)
        assert len(event) == len(control) == 6, 'missing builder source'
        tick, pc, _, track, _, source = event
        assert control[5] == (tick >= first) + (tick >= last)
        foreign = pc == 0x4009d1e8 and track < 3 and tick >= first and (track != 1 or tick < last)
        assert source == int(foreign), (tick, track, source)

def writes(trace):
    return [(pc, addr, width, val) for _, pc, addr, val, width in trace['writes']
            if any(base <= addr < base+96 for base in (0x80001904, 0x80001984))]

actual, stock = writes(candidate), writes(reference)
assert len(actual) == len(stock) == write_count, 'incomplete native timestamp stream'
offset = (actual[0][3] - stock[0][3]) & 0xffffffff
for a, b in zip(actual, stock):
    assert a[:3] == b[:3] and (a[3]-b[3]) & 0xffffffff == offset
assert len(candidate['states']) == len(reference['states']) == last+16
for tick, (a, b) in enumerate(zip(candidate['states'], reference['states']), 1):
    assert a[0] == b[0] == tick and a[2:] == b[2:]
    assert len(a[1]) == len(b[1]) == 3
    for left, right in zip(a[1], b[1]):
        assert len(left) == len(right), (tick, left, right)
        for (tr, slot, val), (other, pos, target) in zip(left, right):
            assert (tr, slot) == (other, pos) and (val-target) & 0xffffffff == offset
# The first queue sample after the wrap includes three simultaneous step-1 trigs.
# T2 is straight. T1 must precede it and the swung T3 must follow it.
step = candidate['states'][first][1][0]
deadlines = {tr: val for tr, slot, val in step if slot == 0}
assert deadlines[1] - deadlines[0] == 5292000 and deadlines[2] - deadlines[1] == 5080320
print(args.phase, len(events), 'ordered calls including tick zero,', len(actual),
      'timestamp writes,', len(candidate['states']), 'ticks; deadlines', deadlines)
assert candidate['panel_requests'] == [
    dict(edge=select_edge, observed=select_edge, playing=0, pending=0x111),
    dict(edge=restore_edge, observed=restore_observed, playing=0x111, pending=0x101),
], 'missing or incorrect pending selection evidence'
