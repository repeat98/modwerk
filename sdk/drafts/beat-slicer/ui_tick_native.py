"""Compile a private native UI fixture using the existing base tick topology.

All stock replay/input bytes and binaries stay in private output. This creates
no production base patch, exported editor ABI or installable module package.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
from source_boot_native import ROOT, run, sha


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--main', type=Path, required=True)
    p.add_argument('--core-recipe', type=Path, required=True)
    p.add_argument('--core-recipe-sha256', required=True)
    a = p.parse_args()
    if sha(a.core_recipe) != a.core_recipe_sha256:
        p.error('Use the exact reviewed Elekloader core recipe.')
    recipe = json.loads(a.core_recipe.read_text())
    tick, = [row for row in recipe['sites'] if row.get('target') == 'core_tick']
    tick_at = int(tick['addr'], 0)
    expected = bytes.fromhex(tick['stock'])
    assert tick_at == 0x40061e94 and tick['op'] == 'jsr' and len(expected) == 6
    assert expected[:2] == bytes.fromhex('4eb9')
    tick_next = int.from_bytes(expected[2:], 'big')
    assert tick_next == int(recipe['defsym']['TICK_NEXT'], 0)
    subprocess.run([sys.executable, '-B', str(ROOT / 'grid_ui_boot_native.py'),
                    '--output', str(a.output), '--main', str(a.main)], check=True)
    out, repo = a.output.resolve(), ROOT.parents[2]
    receipt = out / 'source-boot.json'
    report = json.loads(receipt.read_text())
    spec = importlib.util.spec_from_file_location('guard', repo / 'sdk/runtime/m68k_codegen.py')
    guard = importlib.util.module_from_spec(spec); spec.loader.exec_module(guard)
    guards_path = repo / 'sdk/runtime/logging/stock-guards.json'
    guards = json.loads(guards_path.read_text())
    stock = a.main.read_bytes()
    assert stock[tick_at-0x40000400:tick_at-0x40000400+6] == expected
    added = []
    for name in ('engine_boundary', 'test_engine_boot', 'test_ui_tick'):
        obj = out / (name + '.o')
        run('m68k-elf-gcc', *report['flags'], '-c', str(ROOT / (name + '.c')), '-o', str(obj))
        added.append(obj)
    guard.check(added)
    assembly = ['.text', '.align 2']
    save = ['lea -60(%sp),%sp', 'movem.l %d0-%d7/%a0-%a6,(%sp)']
    restore = ['movem.l (%sp),%d0-%d7/%a0-%a6', 'lea 60(%sp),%sp']
    for name, address in (('idle', 0x4008484e), ('job', 0x4008485e)):
        entry = guards[name]
        assert entry['address'] == address and entry['length'] == 6
        replay = stock[address-0x40000400:address-0x40000400+6]
        assert hashlib.sha256(replay).hexdigest() == entry['sha256']
        path = out / (name + '-replay.private.bin'); path.write_bytes(replay)
        assembly += [f'.globl bs_engine_{name}_entry', f'bs_engine_{name}_entry:',
                     *save,
                     *((['move.l %a2,-(%sp)', 'jsr bs_ui_engine_job', 'addq.l #4,%sp'])
                       if name == 'job' else ['jsr bs_engine_test_idle']), *restore,
                     f'.incbin "{path}"', f'jmp {address+6:#x}']
    # The replaced site is a call. The stock callee receives the original
    # argument/return stack after this tail jump, just as core-ot's bus does.
    assembly += ['.globl bs_ui_tick_entry', 'bs_ui_tick_entry:', *save,
                 'jsr bs_ui_tick', *restore, f'jmp {tick_next:#x}']
    asm = out / 'ui-hooks.private.S'; asm.write_text('\n'.join(assembly)+'\n')
    obj = out / 'ui-hooks.private.o'
    run('m68k-elf-gcc', '-mcpu=5475', '-c', str(asm), '-o', str(obj))
    objects = [out / name for name in report['objectSha256']] + added + [obj]
    elf, binary, symbols = out / 'source-boot.elf', out / 'source-boot.bin', out / 'source-boot.symbols'
    run('m68k-elf-ld', '--no-undefined', '-e', 'bs_engine_test_init',
        '-Ttext='+hex(report['textBase']), *map(str, objects), '-o', str(elf))
    if run('m68k-elf-nm', '-u', str(elf)): p.error('Unresolved runtime helpers.')
    run('m68k-elf-objcopy', '-O', 'binary', str(elf), str(binary))
    symbols.write_text(run('m68k-elf-nm', str(elf))+'\n')
    end, = [int(row.split()[0], 16) for row in symbols.read_text().splitlines() if row.split()[-1] == '_end']
    if end+32 > 0x46025de0: p.error('Fixture exceeds its eight-page reservation.')
    report.update({'scope': 'Compiled private automatic UI tick fixture; not a production base service',
                   'binarySha256': sha(binary), 'symbolsSha256': sha(symbols), 'fixtureEnd': end,
                   'objectSha256': {o.name: sha(o) for o in objects},
                   'hookGuardSha256': sha(guards_path), 'hookSites': {n: guards[n] for n in ('idle','job')},
                   'tickRecipeSha256': sha(a.core_recipe),
                   'tickSite': {'address': tick_at, 'length': 6, 'sha256': hashlib.sha256(expected).hexdigest(), 'stockTarget': tick_next},
                   'engineBoundarySize': run('m68k-elf-size', str(out/'engine_boundary.o')).splitlines(),
                   'tickSize': run('m68k-elf-size', str(out/'test_ui_tick.o')).splitlines(),
                   'tickStackUsage': (out/'test_ui_tick.su').read_text().splitlines()})
    report['sourceSha256'].update({n: sha(ROOT/n) for n in
                                  ('ui_tick_native.py','engine_boundary.c','engine_boundary.h','test_engine_boot.c','test_ui_tick.c')})
    receipt.write_text(json.dumps(report, indent=2)+'\n')
    print('Compiled private UI tick fixture; execution remains separate.')


if __name__ == '__main__':
    main()
