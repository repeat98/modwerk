#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Is hand-written ColdFire assembly inside the instruction set of the unit's CPU?

The Octatrack MKII's MCF54455 has no FPU, and it answers a scale-eight or
word-sized index with an address error (reference manual 3.3.4.2). The
emulator's MCF5475 target runs those forms, and so does an assembler told
-mcpu=5475, which octabam's units default to. m68k_codegen.py holds the C
objects of a build to the MCF54455; this holds the assembly sources to it.

Each source is assembled for the MCF54455, and the assembler itself refuses
every instruction that CPU lacks, with the line. That reads statements, so
tables and text between the routines are never taken for code, as a
disassembly of the built bytes would take them. The build still assembles a
unit for its own target; the two encode the same instruction the same way,
apart from a far branch (bra.l or jmp), which the unit runs either way.

A source that does not assemble alone needs its build (generated includes,
symbols the linker defines): it is listed as not checked, never as passed.

    python3 -B sdk/runtime/coldfire_isa.py [--cross m68k-elf-] [--strict] [PATH ...]

Without paths: the Octatrack's trees. It reports and exits 0; --strict exits 1
on a finding. It needs the m68k-elf toolchain and no firmware.
"""
import argparse
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CPU = '54455'
OCTATRACK = ('sdk/octabam/modules', 'sdk/octabam/platform', 'sdk/machines/octatrack', 'sdk/runtime')
# What the assembler says when the CPU, not the build context, is the reason.
_ISA = re.compile(r'invalid instruction for this architecture|invalid on this architecture|invalid index size')
_MESSAGE = re.compile(r'^(?:.*?):(\d+): Error: (.*?)(?: -- statement `(.*)\' ignored)?$')


def _errors(source, cross):
    """[(line, message, statement)] from assembling `source` for the MCF54455; [] when it assembles."""
    with tempfile.TemporaryDirectory(prefix='modwerk-isa-') as out:
        made = subprocess.run([cross + 'as', '-mcpu=' + CPU, '-I', str(Path(source).parent), str(source), '-o', str(Path(out) / 'unit.o')],
                              capture_output=True, text=True)
    if not made.returncode:
        return []
    errors = [m.groups() for m in map(_MESSAGE.match, made.stderr.splitlines()) if m]
    return [(int(line), re.sub(r'; needs .*| \(68020.*', '', text), statement or '') for line, text, statement in errors] \
        or [(0, made.stderr.strip().splitlines()[-1] if made.stderr.strip() else 'the assembler failed', '')]


def check_source(source, cross='m68k-elf-'):
    """('ok' | 'isa' | 'unchecked', [lines]) for one assembly source.

    'isa': an instruction the MCF54455 lacks. 'unchecked': it does not assemble alone and needs its build."""
    errors = _errors(source, cross)
    found = ['line %d: %s%s' % (line, text, ': ' + statement if statement else '')
             for line, text, statement in errors if _ISA.search(text)]
    if found:
        return 'isa', found
    return ('unchecked', ['line %d: %s' % (line, text) for line, text, _ in errors[:2]]) if errors else ('ok', [])


def sources(paths):
    for path in paths:
        path = Path(path)
        yield from sorted(p for p in ([path] if path.is_file() else path.rglob('*.s')) if 'upstream' not in p.parts)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--cross', default='m68k-elf-')
    parser.add_argument('--strict', action='store_true', help='exit 1 when a source is outside the instruction set')
    parser.add_argument('--verbose', action='store_true', help='also list why each unchecked source did not assemble')
    parser.add_argument('paths', nargs='*', type=Path)
    args = parser.parse_args(argv)
    counts, unchecked = {'ok': 0, 'isa': 0, 'unchecked': 0}, []
    for source in sources(args.paths or [ROOT / p for p in OCTATRACK]):
        result, lines = check_source(source, args.cross)
        counts[result] += 1
        name = source.resolve().relative_to(ROOT).as_posix() if source.resolve().is_relative_to(ROOT) else str(source)
        if result == 'isa':
            print('%s: outside the MCF%s instruction set\n  %s' % (name, CPU, '\n  '.join(lines)))
        elif result == 'unchecked':
            unchecked.append((name, lines))
    if unchecked:
        print('Not checked, each needs its own build (generated includes or linker symbols):')
        for name, lines in unchecked:
            print('  ' + name + (': ' + lines[0] if args.verbose and lines else ''))
    print('%d sources inside the MCF%s instruction set, %d outside, %d not checked.' % (counts['ok'], CPU, counts['isa'], counts['unchecked']))
    return 1 if args.strict and counts['isa'] else 0


if __name__ == '__main__':
    sys.exit(main())
