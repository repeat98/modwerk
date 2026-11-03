#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Add emulator watch symbols without changing the exact 0.1.8 package bytes."""
import argparse
import ast
import hashlib
import json
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
ASSEMBLY_SHA256 = '837e44f48fa137444e14755d96011731c8fde29a73fa877ffc35edac3510473f'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    out = args.out.resolve()
    if ROOT == out or ROOT in out.parents:
        parser.error('Keep private objects/packages outside the repository')
    out.mkdir(parents=True, exist_ok=False)
    assembly = (HERE / 'unit.s').read_text()
    if hashlib.sha256(assembly.encode()).hexdigest() != ASSEMBLY_SHA256:
        raise ValueError('Re-review the assembly phase boundaries for this build')
    # These aliases and labels emit no instructions, data, padding or relocations.
    aliases = {'index': '.L505', 'publish': '.L512', 'restore': '.L501'}
    for name, label in aliases.items():
        assembly += f'\n.global psl_profile_{name}\n.set psl_profile_{name},{label}\n'
    for name, marker in (
        ('revalidate', '\tjne .L482\n\tjsr psl_native_transport'),
        ('followup', '\tjeq .L501\n\tjsr 1073905152'),
    ):
        if assembly.count(marker) != 1:
            raise ValueError('Ambiguous phase: ' + name)
        branch, call = marker.split('\n')
        assembly = assembly.replace(marker, branch + f'\n.global psl_profile_{name}\npsl_profile_{name}:\n' + call)
    (out / 'phases.s').write_text(assembly)
    for name, source in (('original', HERE / 'unit.s'), ('phases', out / 'phases.s')):
        subprocess.run(['m68k-elf-as', '-mcpu=54455', '--defsym', 'MODWERK_EVENTS=1',
                        str(source), '-o', str(out / (name + '.o'))], check=True)
    subprocess.run(['python3', '-B', str(HERE / 'profile_symbols.py'), '--object',
                    str(out / 'original.o'), '--package', str(args.package),
                    '--out', str(out / 'symbols.json')], check=True)
    tree = ast.parse((ROOT / 'sdk/runtime/loader/build.py').read_text())
    script = next(ast.literal_eval(n.value) for n in tree.body if isinstance(n, ast.Assign)
                  and any(isinstance(t, ast.Name) and t.id == 'SCRIPT' for t in n.targets))
    (out / 'link.ld').write_text(script % 0)
    images = []
    for name in ('original', 'phases'):
        subprocess.run(['m68k-elf-ld', '--no-warn-rwx-segments', '-T', str(out / 'link.ld'),
                        '-o', str(out / (name + '.elf')), str(out / (name + '.o'))], check=True)
        subprocess.run(['m68k-elf-objcopy', '-O', 'binary', '-j', '.image',
                        str(out / (name + '.elf')), str(out / (name + '.bin'))], check=True)
        images.append((out / (name + '.bin')).read_bytes())
    if images[0] != images[1]:
        raise ValueError('Watch labels changed the linked image')
    symbols = {}
    for line in subprocess.check_output(['m68k-elf-nm', str(out / 'phases.elf')], text=True).splitlines():
        value, _, name = line.split()
        if name.startswith('psl_profile_'):
            symbols[name.removeprefix('psl_profile_')] = int(value, 16)
    assert set(symbols) == {'index', 'revalidate', 'publish', 'followup', 'restore'}
    result = json.loads((out / 'symbols.json').read_text())
    result['applyPhases'] = symbols
    result['phaseAssemblySha256'] = ASSEMBLY_SHA256
    result['phaseImageUnchanged'] = True
    (out / 'symbols.json').write_text(json.dumps(result, indent=2) + '\n')
    print('PASS phase watches reproduce the exact package image; runtime unchanged')


if __name__ == '__main__':
    main()
