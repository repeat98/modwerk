"""Compile a private fixture at the base-owned idle/job hook sites with an engine-owned preview service.

Stock replay bytes are hash-checked and extracted only into private output.
No production base patch, service admission or package is produced.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from source_boot_native import ROOT, run, sha


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--main', type=Path, required=True)
    args = parser.parse_args()
    subprocess.run([sys.executable, '-B', str(ROOT / 'source_boot_native.py'),
                    '--output', str(args.output), '--main', str(args.main)], check=True)
    out = args.output.resolve()
    receipt = out / 'source-boot.json'
    report = json.loads(receipt.read_text())
    import importlib.util
    repo = ROOT.parents[2]
    spec = importlib.util.spec_from_file_location('guard', repo / 'sdk/runtime/m68k_codegen.py')
    guard = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(guard)
    guard_path = repo / 'sdk/runtime/logging/stock-guards.json'
    guards = json.loads(guard_path.read_text())
    stock = args.main.read_bytes()
    added = []
    for name in ('engine_boundary', 'test_engine_service'):
        obj = out / (name + '.o')
        run('m68k-elf-gcc', *report['flags'], '-c', str(ROOT / (name + '.c')), '-o', str(obj))
        added.append(obj)
    guard.check(added)
    assembly = ['.text', '.align 2']
    for name, address in (('idle', 0x4008484e), ('job', 0x4008485e)):
        entry = guards[name]
        assert entry['address'] == address and entry['length'] == 6
        replay = stock[address - 0x40000400:address - 0x40000400 + 6]
        assert hashlib.sha256(replay).hexdigest() == entry['sha256']
        replay_path = out / (name + '-replay.private.bin')
        replay_path.write_bytes(replay)
        # These reviewed sites contain no PC-relative replay instruction. Save
        # all data/address registers exactly as the existing base hooks do.
        assembly += [f'.globl bs_engine_{name}_entry', f'bs_engine_{name}_entry:',
                     'lea -60(%sp),%sp', 'movem.l %d0-%d7/%a0-%a6,(%sp)',
                     *((['move.l %a2,-(%sp)', 'jsr bs_service_job', 'addq.l #4,%sp']) if name == 'job' else ['jsr bs_service_idle']), 'movem.l (%sp),%d0-%d7/%a0-%a6',
                     'lea 60(%sp),%sp', f'.incbin "{replay_path}"', f'jmp {address + 6:#x}']
    asm = out / 'engine-hooks.private.S'
    asm.write_text('\n'.join(assembly) + '\n')
    obj = out / 'engine-hooks.private.o'
    run('m68k-elf-gcc', '-mcpu=5475', '-c', str(asm), '-o', str(obj))
    objects = [out / name for name in report['objectSha256']] + added + [obj]
    elf, binary, symbols = out / 'source-boot.elf', out / 'source-boot.bin', out / 'source-boot.symbols'
    run('m68k-elf-ld', '--no-undefined', '-e', 'bs_service_init',
        '-Ttext=' + hex(report['textBase']), *map(str, objects), '-o', str(elf))
    if run('m68k-elf-nm', '-u', str(elf)):
        parser.error('Unresolved runtime helpers.')
    run('m68k-elf-objcopy', '-O', 'binary', str(elf), str(binary))
    symbols.write_text(run('m68k-elf-nm', str(elf)) + '\n')
    end = [int(line.split()[0], 16) for line in symbols.read_text().splitlines() if line.split()[-1] == '_end'][0]
    if end + 32 > 0x46025de0:
        parser.error('Fixture exceeds its explicit eight-page reservation.')
    report.update({'scope': 'Engine-owned bounded preview scheduling fixture; private compilation, not a base release',
                   'binarySha256': sha(binary), 'symbolsSha256': sha(symbols), 'fixtureEnd': end,
                   'objectSha256': {item.name: sha(item) for item in objects},
                   'hookGuardSha256': sha(guard_path),
                   'hookSites': {name: guards[name] for name in ('idle', 'job')}})
    report['sourceSha256'].update({name: sha(ROOT / name) for name in
                                  ('engine_service_native.py', 'engine_boundary.c', 'engine_boundary.h', 'test_engine_service.c')})
    receipt.write_text(json.dumps(report, indent=2) + '\n')
    print('Compiled private engine-owned preview service; execution remains separate.')


if __name__ == '__main__':
    main()
