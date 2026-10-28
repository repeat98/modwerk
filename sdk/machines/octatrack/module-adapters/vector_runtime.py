# SPDX-License-Identifier: MIT
"""Guarded VECTOR runtime address arithmetic, without changing imported source."""
from dataclasses import replace
import hashlib
from pathlib import Path

CONTROL_SHA256 = 'c4f829e437ffbde1275c00827031b694a86011013d37269077e4696818323471'
ARITHMETIC = (
    ('\tsub.l #staging-268525901,%a1', '\tadd.l #268525901,%a1\n\tsub.l #staging,%a1'),
    ('\tlea saved-1187503478,%a1', '\tlea saved,%a1\n\tsub.l #1187503478,%a1'),
    ('\tlea saved-1187503778,%a1', '\tlea saved,%a1\n\tsub.l #1187503778,%a1'),
)
# SRC SETUP's second page: the card build's st_setup_draw6 asks st_setup_page on chooser row 5 only, and st_setup_page
# also wants SRC SETUP's cursor (0x460d5c30) on row 5, the card's VECTOR row. Over USB VECTOR's row is wherever the
# base's table puts it (5-8), and the base asks the page only with the cursor on that row and the track a VECTOR track
# (machine_registry.c mw_setup_page, MODWERK_MACHINE_SETUP_PAGE), so the package drops the row-5 test.
SETUP_ROW = ('\tjne .L702\n\tmov3q.l #5,%d0\n\tcmp.l 1175280688.l,%d0\n\tjne .L702\n\tmove.l %d1,12(%sp)\n',
             '\tjne .L702\n\tmove.l %d1,12(%sp)\n')


def source_variant(original):
    """Keep self-references inside the package; address arithmetic does not alter CCR. SRC SETUP's page is asked on
    VECTOR's own row, wherever the base puts it."""
    if hashlib.sha256(original.encode()).hexdigest() != CONTROL_SHA256:
        raise ValueError('Reviewed VECTOR runtime source changed.')
    for before, after in ARITHMETIC:
        if original.count(before) != 1:
            raise ValueError('VECTOR address arithmetic seam changed.')
        original = original.replace(before, after)
    if original.count(SETUP_ROW[0]) != 1:
        raise ValueError('VECTOR SRC SETUP row seam changed.')
    return original.replace(*SETUP_ROW)


def port(module, sdk_root, work):
    """Preserve every effective claim/export/copy; adapt only its control unit."""
    if module.name != 'vector':
        raise ValueError('VECTOR runtime adapter received another module.')
    sdk = Path(sdk_root).resolve()
    folder = Path(work).resolve();folder.mkdir(parents=True, exist_ok=True)
    units = []
    found = False
    for unit in module.linked:
        if unit.label != 'vector':
            units.append(unit);continue
        source = Path(unit.source)
        source = source if source.is_absolute() else sdk / source
        private = folder / 'vector-runtime.s'
        private.write_text(source_variant(source.read_text()))
        units.append(replace(unit, source=str(private), dram=True, cave_addr=None))
        found = True
    if not found:
        raise ValueError('VECTOR runtime control unit missing.')
    return replace(module, linked=tuple(units))
