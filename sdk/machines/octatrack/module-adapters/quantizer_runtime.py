# SPDX-License-Identifier: GPL-3.0-or-later
"""Private exact Quantizer mailbox/accessor relocation; no runtime admission.

Original imported files remain unchanged. Shared POLY8 key ownership must be
resolved by the reviewed machine-composition policy before this source port.
"""
import contextlib
from dataclasses import replace
import hashlib
from pathlib import Path
import re

PINS = {
    'keys.s': 'e2ffdbfae34b0828794a4eb4cc229e3efcaed25dc953bf7c05c13f6e37f65587',
    'core.s': '655bf8cb893ecbe8ec167633322491ae89fdf498c818e172ad6ba34c3fc992c8',
    'scale.s': '82242c407847ac61a6f60fe15bdc5b0b4fc852bac82c39745b5c838ec9389c64',
    'quantizer.s': '6883dce6058cfc42eca1cb4c51a1d7d2318579a5adb5e84ae4202d7570c26abb',
}
# A standalone package is one module: quantizer.s's remix.inc (HAVE_SYDRUM, 2.11; HAVE_PANEL_TRANSACTION,
# 2.21) is what the author's include gives a remix without SY DRUM and without FM Synth, written in place
# of both include lines (2.21 includes it twice: the flags, then the panel adapters, which assemble to
# their replays with HAVE_PANEL_TRANSACTION 0).
INCLUDE = '        .include "remix.inc"'
FLAGS = '.set HAVE_SYDRUM, 0\n.set HAVE_PANEL_TRANSACTION, 0\n'


def source_variant(name, source, include=None):
    if name not in PINS or hashlib.sha256(source.encode()).hexdigest() != PINS[name]:
        raise ValueError('Reviewed Quantizer source changed: ' + name)
    if name != 'quantizer.s':
        if include: raise ValueError('Quantizer has an undeclared linked input.')
        return source
    if include is None or source.count(INCLUDE) != 2:
        raise ValueError('Quantizer remix.inc seam changed.')
    standalone = include({})
    if FLAGS not in standalone or not standalone.startswith('.ifndef QZ_PASS1\n'):
        raise ValueError('Quantizer standalone include changed.')
    source = source.replace(INCLUDE, '\n'.join('        ' + line for line in standalone.rstrip('\n').split('\n')))
    for old, new in (('.set    KEYS_AT, 0x400d2cb0', '.set    KEYS_AT, qz_pkey'),
                     ('.set    SCALE_AT, 0x400d2ca8', '.set    SCALE_AT, qz_scale_at')):
        if source.count(old) != 1: raise ValueError('Quantizer fixed-address seam changed.')
        source = source.replace(old, new)
    for symbol in ('qz_pkey', 'qz_pmask', 'qz_clock', 'qz_oct'):
        source, count = re.subn(rf'^ *\.set +{symbol}, KEYS_AT[^\n]*\n', '', source, flags=re.M)
        if count != 1: raise ValueError('Quantizer mailbox alias changed: ' + symbol)
    # Standalone QZ has no private FM renderer. Its existing clock guard and
    # stock FLEX renderer access remain exact; FM uses its separate adapter.
    return source


def port(module, sdk_root, work):
    if module.name != 'quantizer' or {u.label for u in module.linked} != {'qzk', 'qzc', 'qzs', 'qz'}:
        raise ValueError('Quantizer requires its four complete authored units.')
    sdk_root, work = Path(sdk_root).resolve(), Path(work).resolve()
    work.mkdir(parents=True, exist_ok=True)
    units = []
    for unit in module.linked:
        original = (sdk_root / unit.source).resolve()
        if not original.is_relative_to(sdk_root) or unit.defsyms or unit.stock_copies or (unit.include and unit.label != 'qz'):
            raise ValueError('Quantizer has an undeclared linked input.')
        target = work / (unit.label + '.s')
        # 2.21's include reads panel_transaction.inc.s through a path relative to the octabam root (the
        # author's manifest is loaded there), so it is called from there.
        with contextlib.chdir(sdk_root):
            text = source_variant(original.name, original.read_text(), unit.include)
        target.write_text(text)
        units.append(replace(unit, source=str(target), cave_addr=None, dram=True, include=None))
    return replace(module, linked=tuple(units))
