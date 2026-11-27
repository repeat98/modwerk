# SPDX-License-Identifier: GPL-3.0-or-later
"""Compare UART transmit bytes and timing. Fail on empty or hanging notes."""
import json
import sys
from collections import Counter
from pathlib import Path


def decode(stream):
    active = set()
    count = Counter()
    cc_values = set()
    messages = []
    status = None
    data = []
    for sample, byte in stream:
        if byte >= 0xf8:
            messages.append((sample, (byte,)))
            continue
        if byte & 0x80:
            if data or byte >= 0xf0:
                raise ValueError("incomplete or unsupported MIDI message")
            status = byte
            continue
        if status is None:
            raise ValueError("missing MIDI status")
        data.append(byte)
        kind = status >> 4
        if len(data) < (1 if kind in (12, 13) else 2):
            continue
        key = (status & 15, data[0])
        if kind == 9 and data[1]:
            if key in active:
                raise ValueError(f"duplicate note-on {key}")
            count[key] += 1
            active.add(key)
        elif kind == 8 or (kind == 9 and not data[1]):
            if key not in active:
                raise ValueError(f"unpaired note-off {key}")
            active.remove(key)
        elif kind == 11 and key == (1, 1):
            cc_values.add(data[1])
        messages.append((sample, (status, *data)))
        data.clear()
    if data or active or not {(0, 48), (1, 67)} <= count.keys():
        raise ValueError(f"incomplete two-channel note fixture: {count}, active={active}")
    if not {34, 42} <= cc_values:
        raise ValueError(f"missing step-locked CC values: {cc_values}")
    return count, messages


def grade(left, right):
    counts, actual = decode(left)
    _, reference = decode(right)
    same_messages = [m for _, m in actual] == [m for _, m in reference]
    print(f"Decoded messages {len(actual)}/{len(reference)}, identical={same_messages}; note counts {counts}")
    if same_messages:
        deviation = max(abs((x-actual[0][0]) - (y-reference[0][0]))
                        for (x,_), (y,_) in zip(actual,reference))
        print(f"Maximum relative message-end deviation {deviation:.3f} samples")
    if [b for _, b in left] != [b for _, b in right]:
        raise ValueError("wire bytes differ")
    delta = max(abs((a-left[0][0]) - (b-right[0][0])) for (a,_), (b,_) in zip(left,right))
    print(f"{len(left)} wire bytes; note-on counts {counts}; maximum relative deviation {delta:.3f} samples")
    if delta > 0.100001:
        raise ValueError("relative UART timestamps differ at capture precision")


if __name__ == "__main__":
    grade(*(json.loads(Path(name).read_text()) for name in sys.argv[1:]))
