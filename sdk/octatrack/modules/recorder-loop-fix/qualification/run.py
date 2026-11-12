#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Assemble authored source, check its upstream oracles and execute the native probe.

Run in the reviewed, network-disabled toolchain container. No OS image is read.
The JSON outputs are sanitized; all compiled bytes stay in a TemporaryDirectory.
Exit 2 means the behavioral probe found a qualification failure (report retained).
"""
import argparse
import ast
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile


def sha(data):
    return hashlib.sha256(data).hexdigest()


def command(arguments, cwd):
    result = subprocess.run([str(arg) for arg in arguments], cwd=cwd,
                            capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr[-3000:] or result.stdout[-3000:])
    return result.stdout


def recorder_oracles(folder):
    """Read literal author bytes without importing/evaluating a native manifest."""
    constants = {}

    def literal(node):
        if isinstance(node, ast.Name):
            return constants[node.id]
        if (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                and isinstance(node.func.value, ast.Name)
                and node.func.value.id == 'bytes' and node.func.attr == 'fromhex'
                and len(node.args) == 1 and not node.keywords):
            return bytes.fromhex(ast.literal_eval(node.args[0]))
        return ast.literal_eval(node)

    tree = ast.parse((folder / 'manifest.py').read_text())
    for node in tree.body:
        if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name):
            try:
                constants[node.targets[0].id] = literal(node.value)
            except (ValueError, KeyError):
                pass
    cases = []
    for node in ast.walk(tree):
        if not (isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
                and node.func.id == 'CavePatch'):
            continue
        fields = {entry.arg: entry.value for entry in node.keywords}
        name = Path(literal(fields['source'])).name
        if name not in {path.name for path in folder.glob('*.s')}:
            raise ValueError('Unknown authored source in cave declaration')
        expected = literal(fields['pinned'])
        if not isinstance(expected, bytes):
            raise ValueError('Expected literal author byte oracle')
        cases.append((name, expected))
    if len(cases) != 8 or len({case[0] for case in cases}) != 8:
        raise ValueError('Expected eight distinct authored recorder caves')
    return cases


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--emulator-build', type=Path, required=True,
                        help='CMake build directory with libot_machine.a and mc68k/lib68kEmu.a')
    parser.add_argument('--vendor', type=Path, required=True,
                        help='Reviewed vendor directory containing pinned mc68k')
    parser.add_argument('--output', type=Path, required=True,
                        help='New directory for sanitized JSON only')
    args = parser.parse_args()
    if not Path('/.dockerenv').exists():
        parser.error('Run native execution inside the reviewed isolated Docker container.')
    folder = Path(__file__).resolve().parents[1]
    module = folder.name
    if module not in ('mute-modes', 'recorder-loop-fix'):
        parser.error('Unexpected module folder')
    output = args.output.resolve()
    if output.exists():
        parser.error('Output already exists; preserve the previous measurement.')
    native = args.emulator_build.resolve()
    vendor = args.vendor.resolve()
    toolchain = command(['m68k-elf-as', '--version'], folder).splitlines()[0]
    rows = []
    with tempfile.TemporaryDirectory(prefix='modwerk-native-probe.') as temporary:
        work = Path(temporary)
        # This layout resolves the author's unchanged .include path.
        source = work / 'modules' / module
        source.mkdir(parents=True)
        for path in folder.iterdir():
            if path.suffix in ('.s', '.inc'):
                shutil.copyfile(path, source / path.name)

        def assemble(name, origin, sidechain=False):
            (work / 'remix.inc').write_text('.set SC_KEY,1\n' if sidechain else '| no SC_KEY\n')
            obj, elf, raw = (work / ('unit.' + suffix) for suffix in ('o', 'elf', 'raw'))
            command(['m68k-elf-as', '-mcpu=' + ('5407' if module == 'mute-modes' else '5475'),
                     '-I', work, '-o', obj, source / name], work)
            command(['m68k-elf-ld', '-Ttext', hex(origin), '-o', elf, obj], work)
            command(['m68k-elf-objcopy', '--only-section=.text', '-O', 'binary', elf, raw], work)
            data = raw.read_bytes()
            return data, dict(source=name, origin=origin, bytes=len(data), sha256=sha(data),
                             matchesAuthor=(name != 'spacing_cave.s'), variant='sidechain' if sidechain else 'plain')

        if module == 'mute-modes':
            cases = [
                ('patch_softmute.s', 0x400d7400, False,
                 'd56d848e51e96f9561028741a46e509872981fdce6b2e17ee55831d47db5d356'),
                ('patch_softmute.s', 0x400d74e4, True,
                 '8814aa2ca49df775371b17c6c14116494bca7c40febd2dca94c7e90fec7e2009'),
                ('patch_mutemode.s', 0x400d7800, False,
                 '4c6702aaae1840d9a95a274bd97e252b4bd1e39338c0e50c5257e96060bd4220')]
            for name, origin, sidechain, expected in cases:
                data, row = assemble(name, origin, sidechain)
                if sha(data) != expected:
                    raise ValueError(name + ': author identity mismatch')
                rows.append(row)
                (work / ('mute-' + ('sidechain' if sidechain else name) + '.raw')).write_bytes(data)
        else:
            for name, expected in recorder_oracles(folder):
                for origin in (0x400d6b80, 0x400d7000, 0x400d24d0):
                    data, row = assemble(name, origin)
                    if data != expected:
                        raise ValueError(name + ': authored cave identity mismatch')
                    rows.append(row)
                (work / (name + '.raw')).write_bytes(expected)
        probe = work / 'probe'
        command(['g++', '-O3', '-std=c++17', '-I', folder.parents[1] / 'tools/emu/ot_emu',
                 '-I', vendor, '-I', vendor / 'mc68k', folder / 'qualification/probe.cpp',
                 '-Wl,--start-group', native / 'libot_machine.a',
                 native / 'mc68k/lib68kEmu.a', '-Wl,--end-group', '-pthread', '-o', probe], work)
        result = subprocess.run([str(probe), str(work)], capture_output=True, text=True, cwd=work)
        if result.returncode not in (0, 2):
            raise RuntimeError(result.stderr[-3000:] or 'Native probe failed')
        measured = json.loads(result.stdout)
        if bool(measured['passed']) != (result.returncode == 0):
            raise ValueError('Probe exit status disagrees with the measured result')
    output.mkdir(parents=True)
    (output / 'source-identity.json').write_text(json.dumps(
        dict(stockRead=False, toolchain=toolchain, results=rows), indent=2) + '\n')
    (output / 'probes.json').write_text(json.dumps(measured, indent=2) + '\n')
    print(module + ': author oracles passed; native behavioral qualification ' +
          ('passed' if measured['passed'] else 'FAILED; inspect probes.json'))
    return result.returncode


if __name__ == '__main__':
    raise SystemExit(main())
