"""Compile the one-shot private menu contribution plus full-boot preview fixture."""
import argparse
import importlib.util
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
    # The common compiler validates private output and stock identity, builds
    # the exact source backend and checks its eight-page reservation.
    subprocess.run([sys.executable, '-B', str(ROOT / 'source_boot_native.py'),
                    '--output', str(args.output), '--main', str(args.main)], check=True)
    out = args.output.resolve()
    receipt = out / 'source-boot.json'
    report = json.loads(receipt.read_text())
    spec = importlib.util.spec_from_file_location('guard', ROOT.parents[2] / 'sdk/runtime/m68k_codegen.py')
    guard = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(guard)
    objects = [out / name for name in report['objectSha256']]
    added = []
    for name in ('editor_menu', 'test_menu_boot'):
        obj = out / (name + '.o')
        run('m68k-elf-gcc', *report['flags'], '-c', str(ROOT / (name + '.c')), '-o', str(obj))
        added.append(obj)
    guard.check(added)
    objects += added
    elf, binary, symbols = out / 'source-boot.elf', out / 'source-boot.bin', out / 'source-boot.symbols'
    run('m68k-elf-ld', '--no-undefined', '-e', 'bs_worker_test_init',
        '-Ttext=' + hex(report['textBase']), *map(str, objects), '-o', str(elf))
    if run('m68k-elf-nm', '-u', str(elf)):
        parser.error('Unresolved runtime helpers.')
    run('m68k-elf-objcopy', '-O', 'binary', str(elf), str(binary))
    symbols.write_text(run('m68k-elf-nm', str(elf)) + '\n')
    end = [int(line.split()[0], 16) for line in symbols.read_text().splitlines() if line.split()[-1] == '_end'][0]
    if end + 32 > 0x46025de0:
        parser.error('Menu/preview fixture exceeds its explicit eight-page reservation.')
    report.update({'scope': 'Original one-shot menu contribution plus preview fixture; compilation only, not execution',
                   'binarySha256': sha(binary), 'symbolsSha256': sha(symbols), 'fixtureEnd': end,
                   'objectSha256': {obj.name: sha(obj) for obj in objects}})
    report['sourceSha256'].update({name: sha(ROOT / name) for name in
                                  ('menu_boot_native.py', 'editor_menu.c', 'editor_menu.h', 'test_menu_boot.c')})
    receipt.write_text(json.dumps(report, indent=2) + '\n')
    print('Compiled original one-shot menu fixture; execution remains separate.')


if __name__ == '__main__':
    main()
