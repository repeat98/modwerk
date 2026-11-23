#!/usr/bin/env python3
"""Write src/width-table.h: what the band types send and how the FILTER graph draws them.

A 2-pole band-pass with Q below 0.5 is a 1-pole high-pass at fL and a 1-pole low-pass at fH in series, and at any Q
its -3 dB edges satisfy centre = sqrt(fL fH) and Q = centre / (fH - fL). So a band w semitones wide needs
Q = 1 / (2^(w/24) - 2^(-w/24)), and the resonance word comes from the measured Q curve (tools/calibration.json),
interpolated in log Q; w = 0 takes the 1-semitone word. For the graph, per width: log2 Q and the measured peak gain
(at the chosen word); and two shape tables, the same at every width: log2 of u(d) = 2^(d/12) - 2^(-d/12) for d
semitones from the centre, and 10 log10(1 + 4^s) for s = log2(Q u), so the response is gain - that.

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
U_STEP = 4            # log2 u in quarter semitones (a narrow band's peak needs them)
U_ENTRIES = 128 * U_STEP + 1   # d = 0..128 semitones
S_MIN, S_STEPS = -8, 16 * 12 + 1   # s from -8 to +4 in sixteenths


def q_of(w):
    w = max(w, 1)
    return 1 / (2 ** (w / 24) - 2 ** (-w / 24))


def points():
    return json.loads((HERE / 'calibration.json').read_text())['points']


def word_of(q, pts):
    pts = sorted(pts, key=lambda p: p['q'])
    if q <= pts[0]['q']:
        return pts[0]['word']
    if q >= pts[-1]['q']:
        return pts[-1]['word']
    for a, b in zip(pts, pts[1:]):
        if a['q'] <= q <= b['q']:
            t = math.log(q / a['q']) / math.log(b['q'] / a['q'])
            return round(a['word'] + t * (b['word'] - a['word']))
    raise ValueError(q)


def gain_of(word, pts):
    pts = sorted(pts, key=lambda p: p['word'])
    if word <= pts[0]['word']:
        return pts[0]['gain_db']
    if word >= pts[-1]['word']:
        return pts[-1]['gain_db']
    for a, b in zip(pts, pts[1:]):
        if a['word'] <= word <= b['word']:
            t = (word - a['word']) / (b['word'] - a['word'])
            return a['gain_db'] + t * (b['gain_db'] - a['gain_db'])
    raise ValueError(word)


def tables():
    pts = points()
    words = [word_of(q_of(w), pts) for w in range(ENTRIES)]
    log2q = [round(256 * math.log2(q_of(w))) for w in range(ENTRIES)]
    gain = [round(8 * gain_of(words[w], pts)) for w in range(ENTRIES)]
    log2u = [-4096] + [round(256 * math.log2(2 ** (d / 12 / U_STEP) - 2 ** (-d / 12 / U_STEP))) for d in range(1, U_ENTRIES)]
    att = [round(8 * 10 * math.log10(1 + 4 ** (S_MIN + i / 16))) for i in range(S_STEPS)]
    return words, log2q, gain, log2u, att


def rows(t, per=10):
    return '\n'.join('    ' + ', '.join('%d' % v for v in t[i:i + per]) + ',' for i in range(0, len(t), per))


def text():
    words, log2q, gain, log2u, att = tables()
    return ('// Written by tools/width_table.py from tools/calibration.json: do not edit.\n'
            '#define FLTR_WIDTH_ENTRIES %d\n'
            '// The resonance word for a band w semitones wide (index w), signed.\n'
            'const short fltr_width_words[FLTR_WIDTH_ENTRIES] = {\n%s\n};\n'
            '#ifdef FLTR_GRAPH_TABLES\n'
            '// log2 Q (8.8) and the measured peak gain (dB x 8) of a band w semitones wide.\n'
            'static const short fltr_width_log2q[FLTR_WIDTH_ENTRIES] = {\n%s\n};\n'
            'static const short fltr_width_gain[FLTR_WIDTH_ENTRIES] = {\n%s\n};\n'
            '// log2 (2^(d/12) - 2^(-d/12)) (8.8), d = 0..%d semitones from the centre in quarters.\n'
            'static const short fltr_log2u[%d] = {\n%s\n};\n'
            '// 10 log10(1 + 4^s) (dB x 8), s = %d + i/16.\n'
            'static const unsigned char fltr_att[%d] = {\n%s\n};\n'
            '#endif\n' % (ENTRIES, rows(words, 8), rows(log2q), rows(gain), (U_ENTRIES - 1) // U_STEP, U_ENTRIES, rows(log2u, 16),
                          S_MIN, S_STEPS, rows(att, 16)))


if __name__ == '__main__':
    if '--check' in sys.argv:
        sys.exit(0 if OUT.exists() and OUT.read_text() == text() else 'src/width-table.h is stale: run tools/width_table.py')
    OUT.write_text(text())
    words, log2q, gain, _, att = tables()
    for w in (1, 6, 12, 24, 36, 48, 60):
        print('w %2d st  Q %6.3f  word %6d (0x%04x)  gain %5.1f dB' % (w, q_of(w), words[w], words[w] & 0xffff, gain[w] / 8))
    print('att max', max(att))
