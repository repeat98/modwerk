#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-2.0-only
"""Envelopes' DEC/REL and HLD curves: knob value -> table word for the stock readers.

DEC/REL (AMP DEC, FILTER DEC and REL; the time to fall 60 dB, shown as the knob text):
    0          instant
    1..25      0.2 ms steps, 0.2 .. 5 ms
    26..45     0.5 ms steps, 5.5 .. 15 ms
    46..55     1 ms steps, 16 .. 25 ms
    56..65     2.5 ms steps, 27.5 .. 50 ms
    66..75     5 ms steps, 55 .. 100 ms
    76..85     10 ms steps, 110 .. 200 ms
    86..89     25 ms steps, 225 .. 300 ms
    90..127    x r a step, to 45 s (AMP 127 stays INF, which the OS never reads)
A word is a 20-bit coefficient (e = c[19:16], m = c[15:0]) of a one-pole segment: per tick
(2 samples) the level keeps p = 1 - step / 2^31 of its distance, step = ((0x7FFFFFFF - (m << 14))
>> e) - 32768, as stock's tables (0x401ee61c, 0x401ef030). The AMP table is built for the unit's
VCA, which decays at 0.918x the OS model (EV06); the filter runs at the model's speed (EV13).

HLD (AMP hold, 0 = no hold, 127 = AUTO): ticks of 2 samples, whole blocks of 16 ticks (0.667 ms),
as the OS counts the hold:
    1..15      1 block, 0.67 .. 10 ms
    16..21     2 blocks, 11.3 .. 18 ms
    22..31     5 blocks, 21.3 .. 51.3 ms
    32..42     10 blocks, 58 .. 124.7 ms
    43..46     10 blocks, 131 .. 151 ms
    47..57     20 blocks, 164 .. 298 ms
    58..126    x r a step, to 15.5 s

The hold itself is counted in steps of the voice's track on the musical clock (src/improved-amp.c):
the second HLD table is each value's steps x 225,000, the ticks above x 75 (3000 ticks are a step at
120 BPM and 1x), with 13 values set on the step grid for FUNC + turn: 0.125, 0.25, 0.5, 0.75, 1, 1.5, 2,
3, 4, 8, 16, 32 and 64 steps.

Prints the C tables for src/improved-amp.c (there named improved_amp_*); --check prints each value
back from the table, HLD in ms from the ticks.
"""
import math
import sys

TICKS_PER_MS = 24.0
HW_AMP, HW_FLT = 0.918, 1.0          # decay speed against the OS model (EV06, EV13)
DEC_TOP_MS = 45000.0                  # stock DEC 127's time to -60 dB
HLD_TOP_MS = 15500.0                  # stock HLD 126
BLOCK = 16                            # ticks the hold counter moves a block


def dec_ms():
    segs = [(0.2, 5.0), (0.5, 15.0), (1.0, 25.0), (2.5, 50.0), (5.0, 100.0), (10.0, 200.0), (25.0, 300.0)]
    t = [0.0]
    for step, end in segs:
        n = round((end - t[-1]) / step)
        base = t[-1]
        for i in range(1, n + 1):
            t.append(base + step * i)
    k0 = len(t) - 1
    r = (DEC_TOP_MS / t[k0]) ** (1.0 / (127 - k0))
    for k in range(k0 + 1, 128):
        t.append(t[k0] * r ** (k - k0))
    assert len(t) == 128
    return t


def hld_blocks():
    b = [0]
    for step, count in [(1, 15), (2, 6), (5, 10), (10, 11), (10, 4), (20, 11)]:
        for _ in range(count):
            b.append(b[-1] + step)
    k0 = len(b) - 1
    top = HLD_TOP_MS * TICKS_PER_MS / BLOCK
    r = (top / b[k0]) ** (1.0 / (126 - k0))
    for k in range(k0 + 1, 127):
        b.append(max(b[-1] + 1, round(b[k0] * r ** (k - k0))))
    b.append(b[-1])                    # 127 is AUTO: never read
    assert len(b) == 128
    return b


def encode(ms, hw):
    """20-bit coefficient whose one-pole falls 60 dB in ms (the unit's time, at speed hw)."""
    if ms <= 0:
        return 0
    ticks = ms / hw * TICKS_PER_MS
    p = math.exp(-math.log(1000.0) / ticks)
    s = int(round((1.0 - p) * 2 ** 31)) + 32768
    n = 32 - s.bit_length() - 1
    m = (0x7FFFFFFF - (s << n)) >> 14
    assert 0 <= n <= 15 and 0 <= m <= 0xFFFF, (ms, s, n, m)
    return (n << 16) | m


GRID = {19: 0.125, 25: 0.25, 33: 0.5, 37: 0.75, 42: 1, 49: 1.5, 53: 2, 61: 3, 66: 4, 78: 8, 90: 16, 102: 32, 114: 64}


def hld_steps(hold):
    cq = [t * 75 for t in hold]
    for k, steps in GRID.items():
        cq[k] = round(steps * 225000)
    assert all(cq[k] < cq[k + 1] for k in range(126))
    return cq


def t60_ms(c, hw):
    e, m = (c >> 16) & 15, c & 0xFFFF
    s = ((0x7FFFFFFF - (m << 14)) >> e) - 32768
    p = 1.0 - s / 2 ** 31
    return math.log(1000.0) / -math.log(p) / TICKS_PER_MS * hw if 0 < p < 1 else 0.0


def emit(name, words, decl, comment, fmt):
    print(comment)
    print(f'{decl} {name}[128] __attribute__((aligned(4))) = {{')
    for i in range(0, 128, 8):
        print('    ' + ', '.join(fmt(w) for w in words[i:i + 8]) + ',')
    print('};')
    print()


def main():
    t = dec_ms()
    amp = [encode(x, HW_AMP) for x in t]
    flt = [encode(x, HW_FLT) for x in t]
    hold = [b * BLOCK for b in hld_blocks()]
    if '--check' in sys.argv:
        for k in range(128):
            ga, gf = t60_ms(amp[k], HW_AMP), t60_ms(flt[k], HW_FLT)
            ea = 0 if t[k] == 0 else (ga - t[k]) / t[k] * 100
            ef = 0 if t[k] == 0 else (gf - t[k]) / t[k] * 100
            print(f'{k:3d} DEC want {t[k]:9.2f} ms  amp {amp[k]:05x} {ga:9.2f} ({ea:+.2f} %)  '
                  f'flt {flt[k]:05x} {gf:9.2f} ({ef:+.2f} %)  HLD {hold[k] / TICKS_PER_MS:8.2f} ms')
        return
    print('// Generated by tools/dec_table.py.')
    emit('envelopes_amp_dec', amp, 'const uint32_t',
         '// AMP DEC knob -> one-pole coefficient (time to -60 dB, for the VCA at 0.918x), read by stock\n'
         '// through the lea at 0x40109bee.', lambda w: f'0x{w:05x}')
    emit('envelopes_flt_dec', flt, 'const uint32_t',
         '// FILTER DEC and REL knob -> coefficient (the filter runs at the OS model\'s speed), read by\n'
         '// stock through the leas at 0x4010d342, 0x4010d3b2 and 0x4010d3da.', lambda w: f'0x{w:05x}')
    emit('envelopes_hold', hold, 'const int32_t',
         '// AMP HLD knob -> hold in ticks of 2 samples, whole blocks of 16, read by stock through the lea\n'
         '// at 0x40109bc2, whose end of the hold the module overrides. 0 is no hold and 127 AUTO (not read).',
         lambda w: f'{w}')
    emit('improved_amp_hold_steps', hld_steps(hold), 'const int32_t',
         '// AMP HLD knob -> hold in steps of the voice\'s track, x 225,000; 13 values on the step grid.',
         lambda w: f'{w}')


if __name__ == '__main__':
    main()
