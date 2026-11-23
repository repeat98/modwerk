#!/usr/bin/env python3
"""Write src/width-table.h: the resonance word for a band w semitones wide, w = 0..61.

A 2-pole band-pass with Q below 0.5 is a 1-pole high-pass at fL and a 1-pole low-pass at fH in series, and at any Q
its -3 dB edges satisfy centre = sqrt(fL fH) and Q = centre / (fH - fL). So a band w semitones wide needs
Q = 1 / (2^(w/24) - 2^(-w/24)), and the word comes from the measured Q curve (tools/calibration.json),
interpolated in log Q. w = 0 takes the 1-semitone word.

    python3 tools/width_table.py            # writes src/width-table.h
    python3 tools/width_table.py --check    # fails if src/width-table.h is stale
"""
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / 'src' / 'width-table.h'
ENTRIES = 62          # w = 0..61: the routine reads w >> 8 and the next entry


def q_of(w):
    w = max(w, 1)
    return 1 / (2 ** (w / 24) - 2 ** (-w / 24))


def word_of(q, points):
    pts = sorted(points, key=lambda p: p['q'])
    if q <= pts[0]['q']:
        return pts[0]['word']
    if q >= pts[-1]['q']:
        return pts[-1]['word']
    for a, b in zip(pts, pts[1:]):
        if a['q'] <= q <= b['q']:
            t = math.log(q / a['q']) / math.log(b['q'] / a['q'])
            return round(a['word'] + t * (b['word'] - a['word']))
    raise ValueError(q)


def table():
    points = json.loads((HERE / 'calibration.json').read_text())['points']
    return [word_of(q_of(w), points) for w in range(ENTRIES)]


def text():
    t = table()
    rows = ['    ' + ', '.join('%6d' % v for v in t[i:i + 8]) + ',' for i in range(0, len(t), 8)]
    return ('// Written by tools/width_table.py from tools/calibration.json: do not edit.\n'
            '// The resonance word for a band w semitones wide (index w), signed.\n'
            '#define FLTR_WIDTH_ENTRIES %d\n'
            'static const short fltr_width_words[FLTR_WIDTH_ENTRIES] = {\n%s\n};\n' % (len(t), '\n'.join(rows)))


if __name__ == '__main__':
    if '--check' in sys.argv:
        sys.exit(0 if OUT.exists() and OUT.read_text() == text() else 'src/width-table.h is stale: run tools/width_table.py')
    OUT.write_text(text())
    for w in (1, 6, 12, 24, 36, 48, 60):
        print('w %2d st  Q %6.3f  word %6d (0x%04x)' % (w, q_of(w), table()[w], table()[w] & 0xffff))
