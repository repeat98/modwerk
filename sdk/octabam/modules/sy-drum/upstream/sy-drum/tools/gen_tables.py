#!/usr/bin/env python3
"""Regenerate the SY DRUM engine's original mathematical lookup data.

The assembler constants in engine.inc.s are the calibration source. Run this
script after changing U2's sweep tau limits, U5's exponential-FM depth, U6's
VCA tau limits, U7's pole frequencies/tracking, U10's pseudo-saw slope ratio,
or U12's dedicated LFO/S&H rates, depths, and taper exponent.
Other constants are evaluated by the assembler. --check detects a stale generated section without writing.
"""
from __future__ import annotations
import argparse
import math
from pathlib import Path
import re

ENGINE = Path(__file__).resolve().parents[1] / 'engine.inc.s'
BEGIN = '| BEGIN GENERATED MODEL TABLES -- sy-drum/tools/gen_tables.py'
END = '| END GENERATED MODEL TABLES'


def assembler_constant(text: str, name: str) -> int:
    match = re.search(r'^\s*\.set\s+' + re.escape(name) + r',\s*(0x[0-9a-fA-F]+|[0-9]+)\b', text, re.M)
    if match is None:
        raise ValueError(f'{name} must be a positive integer assembler constant')
    return int(match.group(1), 0)


def lfo_rates(text: str) -> list[float]:
    """Keep legacy raw 0..knee exactly; extend above the knee exponentially."""
    low = assembler_constant(text, 'SY1_U12_RATE_MIN_MHZ') / 1000
    high = assembler_constant(text, 'SY1_U12_RATE_MAX_MHZ') / 1000
    legacy_high = assembler_constant(text, 'SY1_U12_RATE_LEGACY_MAX_MHZ') / 1000
    knee_raw = assembler_constant(text, 'SY1_U12_RATE_KNEE_RAW')
    if not (0 < low <= legacy_high and 0 < knee_raw < 127):
        raise ValueError('LFO legacy endpoints and raw knee must be positive and increasing')
    knee_hz = low * (legacy_high / low) ** (knee_raw / 127)
    if not (knee_hz < high < 44100 / 32):
        raise ValueError('LFO upper endpoint must exceed the knee and stay below control Nyquist')
    return [low * (legacy_high / low) ** (i / 127) if i <= knee_raw
            else knee_hz * (high / knee_hz) ** ((i - knee_raw) / (127 - knee_raw))
            for i in range(128)]


def regenerate_display(text: str, engine: str) -> str:
    """Display centihertz and DSP increments derive from the same rate curve."""
    values = [round(hz * 100) for hz in lfo_rates(engine)]
    if max(values) > 65535:
        raise ValueError('LFO display centihertz must fit the unsigned word table')
    block = ['sy1_lspd_centi:']
    block += ['        .word   ' + ','.join(str(v) for v in values[i:i+8]) for i in range(0, 128, 8)]
    result, count = re.subn(r'^sy1_lspd_centi:\n(?:[ \t]*\.word[^\n]*\n)+',
                           '\n'.join(block) + '\n', text, count=1, flags=re.M)
    if count != 1:
        raise ValueError('LFO display table was not found')
    return result


def regenerate(text: str) -> str:
    def constant(name: str) -> int:
        return assembler_constant(text, name)

    speed_min = constant('SY1_U2_SPEED_MIN_US') / 1e6
    speed_max = constant('SY1_U2_SPEED_MAX_US') / 1e6
    decay_min = constant('SY1_U6_DEC_MIN_US') / 1e6
    decay_max = constant('SY1_U6_DEC_MAX_US') / 1e6
    fm_depth = constant('SY1_U5_FM_OCT_NUM') / constant('SY1_U5_FM_OCT_DEN')
    rise = constant('SY1_U10_N_RISE')
    if not (0 < speed_min <= speed_max and 0 < decay_min <= decay_max):
        raise ValueError('Envelope tau limits must be positive and increasing')
    if not (0 < rise < 64 and 0 <= fm_depth <= 3):
        raise ValueError('The fixed-point core supports N_RISE 1..63 and FM depth 0..3 octaves')
    rates = lfo_rates(text)
    depth_exp = constant('SY1_U12_DEPTH_EXP_NUM') / constant('SY1_U12_DEPTH_EXP_DEN')
    tri_range = constant('SY1_U12_TRI_RANGE_SEMI') / 12
    sq_range = constant('SY1_U12_SQ_RANGE_SEMI') / 12
    sh_range = constant('SY1_U12_SH_RANGE_SEMI') / 12
    if depth_exp <= 0:
        raise ValueError('LFO taper exponent must be positive')
    if not all(0 < value < 4 for value in [tri_range, sq_range, sh_range]):
        raise ValueError('LFO/S&H depth must stay below four octaves for Q13 multiply headroom')
    frame = 16 / 44100
    tables = {
        'sy1_lfo_rate': [round(hz * frame * 2**32) for hz in rates],
        'sy1_lfo_tri_depth': [round(tri_range * (i/127)**depth_exp * 2**13) for i in range(128)],
        'sy1_lfo_sq_depth': [round(sq_range * (i/127)**depth_exp * 2**13) for i in range(128)],
        'sy1_k1': [min(0x7fffffff, round(-math.expm1(-frame / (speed_min * (speed_max / speed_min) ** (i / 127))) * 2**31)) for i in range(128)],
        'sy1_decay_x': [round(frame / (decay_min * (decay_max / decay_min) ** (i / 127)) * 2**26) for i in range(128)],
        'sy1_loss': [round(-math.expm1(-i / 32) * 2**31) for i in range(257)],
        # Nearest selection has a 0.44-cent worst-case error at the 1.5-octave default.
        'sy1_fm': [round(2 ** (fm_depth * (i / 2048 - 1)) * 2**27) for i in range(4097)],
        'sy1_saw': [round((-1 + 2 * i / 8192 * (rise + 1) if i / 8192 < 1 / (rise + 1)
                          else 1 - 2 * (i / 8192 - 1 / (rise + 1)) * (rise + 1) / rise) * 16384)
                    for i in range(8192)],
    }
    if max(tables['sy1_fm']) >= 2**31:
        raise ValueError('FM lookup would exceed the positive signed Q27 range')
    block = [BEGIN, '| Original mathematical data; no captured firmware bytes.']
    for name, values in tables.items():
        block += ['        .align 4', name + ':']
        directive = '.word ' if name in ('sy1_saw','sy1_lfo_tri_depth','sy1_lfo_sq_depth') else '.long '
        block += ['        ' + directive + ', '.join(str(x) for x in values[i:i+6]) for i in range(0, len(values), 6)]
    block += ['', END]
    start, stop = text.index(BEGIN), text.index(END) + len(END)
    result = text[:start] + '\n'.join(block) + text[stop:]
    rate = round(math.log2(2 * rise / (rise + 1)) * 65536)
    derived = {'SY1_SH_GAIN_Q13': round(sh_range * 2**13),
               'SY1_U10_E_RATE_Q16': rate,
               'SY1_E_RATE_Q29': round((2 * rise / (rise + 1)) * 2**29),
               'SY1_P1_BYPASS_Q16': math.ceil(math.log2(0x73000000 / constant('SY1_U7_POLE1_INC')) * 65536),
               # Map the old bus threshold into the tracked exponent domain.
               # This preserves the exact full-open fast-bypass transition.
               'SY1_P2_BYPASS_Q16': (math.ceil(math.log2(0x73000000 / constant('SY1_U7_POLE2_INC')) * 65536 * constant('SY1_U7_TRACK2_DEN') / constant('SY1_U7_TRACK2_NUM'))
                                     * constant('SY1_U7_TRACK2_NUM') // constant('SY1_U7_TRACK2_DEN'))}
    for name, value in derived.items():
        result = re.sub(r'(\.set ' + name + r', )\d+', lambda m: m[1] + str(value), result)
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--engine', type=Path, default=ENGINE)
    parser.add_argument('--poly', type=Path, help='display source (default: sydrum.s beside engine.inc.s)')
    args = parser.parse_args()
    before = args.engine.read_text()
    after = regenerate(before)
    poly = args.poly or args.engine.parent / 'sydrum.s'
    display_before = poly.read_text()
    display_after = regenerate_display(display_before, before)
    if args.check:
        if before != after or display_before != display_after:
            raise SystemExit('SY DRUM model tables are stale; run gen_tables.py')
        print('SY DRUM model and LFO display tables match the named calibration constants')
    else:
        args.engine.write_text(after)
        poly.write_text(display_after)
        print(f'Regenerated {args.engine}')
        print(f'Regenerated LFO display table in {poly}')


if __name__ == '__main__':
    main()
