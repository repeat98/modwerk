#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""ColdFire C code generation guard for everything Modwerk compiles to run on a unit.

GCC 16.2's late-combine pass (-O2) folds a post-increment load and a store
indexed off the same address register into one instruction,
`move.b (%a0)+,(0,%a0,%d0.l)`. The CPU forms the destination from the register
it has just incremented, so every store lands one element late: the
controller board wrote stock COMPRESSOR's descriptor one byte high, which
enabled the wrong page slots and jumped through an odd widget pointer
(address error at 0x40037c2a). GCC's own semantics read the old register, so
the source looks right and host builds never show it.

FLAGS turns the pass off for every ColdFire C compile. check() disassembles
the C objects a build produced and refuses any instruction whose source
post-increments or pre-decrements an address register that its destination
also uses, so a later compiler or flag change cannot ship it silently.

    python3 -B sdk/runtime/m68k_codegen.py [--objdump m68k-elf-objdump] OBJECT.o ...
"""
import argparse
import re
import subprocess
import sys
import tempfile
from pathlib import Path

FLAGS = ('-fno-late-combine-instructions',)
_ALIASES = {'fp': 'a6', 'sp': 'a7'}
_REGISTER = re.compile(r'%(a[0-7]|fp|sp)\b')
_STEP = re.compile(r'%(a[0-7]|fp|sp)@[+-]')
_LINE = re.compile(r'^\s*([0-9a-f]+):\s+(?:[0-9a-f]{4} )+\s*(\S+)\s+(.*)$')


def _operands(text):
    out, depth, start = [], 0, 0
    for i, c in enumerate(text):
        depth += c == '('
        depth -= c == ')'
        if c == ',' and not depth:
            out.append(text[start:i])
            start = i + 1
    return out + [text[start:]]


def _registers(operand):
    return {_ALIASES.get(r, r) for r in _REGISTER.findall(operand)}


def hits(disassembly):
    """Lines of `objdump -d` text (MIT syntax) whose source steps an address register a later operand also uses.

    Only the source side: the CPU evaluates the source, step included, before the destination, so a stepped
    destination after a source that reads the same register (`move.l (8,%sp),-(%sp)`, every push of an
    argument) means what GCC meant."""
    found, function = [], '?'
    for line in disassembly.splitlines():
        label = re.match(r'^[0-9a-f]+ <(.+)>:$', line)
        if label:
            function = label.group(1)
            continue
        m = _LINE.match(line)
        if not m:
            continue
        operands = _operands(m.group(3).split('<')[0].strip())
        if len(operands) < 2:
            continue
        for stepped in _STEP.findall(operands[0]):
            if any(_ALIASES.get(stepped, stepped) in _registers(other) for other in operands[1:]):
                found.append('%s+0x%s: %s %s' % (function, m.group(1), m.group(2), m.group(3).strip()))
    return found


def _check_objects(objects, objdump, instrument=False):
    objects = tuple(objects)
    problems, indexes = [], []
    for obj in objects:
        text = subprocess.run([str(objdump), '-d', str(obj)], check=True, capture_output=True, text=True).stdout
        problems += ['%s: %s' % (Path(obj).name, h) for h in hits(text)]
        if instrument:
            indexes += ['%s: %s' % (Path(obj).name, h) for h in index_hits(text)]
    if problems:
        raise ValueError('ColdFire code reuses a post-incremented or pre-decremented address register in the same '
                         'instruction (GCC late-combine; sdk/runtime/m68k_codegen.py):\n  ' + '\n  '.join(problems))
    if indexes:
        raise ValueError('MCF54455-incompatible indexed addressing:\n  ' + '\n  '.join(indexes))
    return len(objects)


def check(objects, objdump='m68k-elf-objdump'):
    """Refuse stepped-register reuse, disassembling each input object once."""
    return _check_objects(objects, objdump)


def index_hits(disassembly):
    """MCF54455 rejects word indexes and scale-eight indexed addresses (RM 3.3.4.2).

    The emulator's MCF5475 target accepts them; emulator execution is therefore
    not this check. Keep this explicit for shipping MCF54455 builds rather than
    silently changing the contract of older emulator-only research fixtures.
    """
    found, function = [], '?'
    for line in disassembly.splitlines():
        label = re.match(r'^[0-9a-f]+ <(.+)>:$', line)
        if label:
            function = label.group(1)
        m = _LINE.match(line)
        if m and re.search(r'%(?:[ad][0-7]|fp|sp):w|:[wl]:8', m.group(3)):
            found.append('%s+0x%s: %s %s' % (function, m.group(1), m.group(2), m.group(3).strip()))
    return found


def check_mcf54455(objects, objdump='m68k-elf-objdump'):
    """Shipping C code: late-combine safety AND the instrument's indexed modes."""
    return _check_objects(objects, objdump, instrument=True)


def check_assembly(assembly, cross='m68k-elf-', cpu='54455'):
    """The same check for compiler output kept as assembly (gcc -S): assembled privately, then disassembled."""
    with tempfile.TemporaryDirectory(prefix='modwerk-codegen-') as tmp:
        obj = Path(tmp) / 'check.o'
        subprocess.run([cross + 'as', '-mcpu=' + cpu, str(assembly), '-o', str(obj)], check=True, capture_output=True)
        return check([obj], cross + 'objdump')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--objdump', default='m68k-elf-objdump')
    parser.add_argument('objects', nargs='+', type=Path)
    args = parser.parse_args()
    try:
        check(args.objects, args.objdump)
    except ValueError as error:
        sys.exit(str(error))
