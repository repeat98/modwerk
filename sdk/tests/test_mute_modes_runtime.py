# SPDX-License-Identifier: GPL-3.0-or-later
"""Mute Modes' runtime package beside ev_mute_keep, under the ColdFire emulator (opt-in).

Needs MODWERK_PRIVATE_STOCK_MAIN (your own 1.40C MAIN image), the Elekloader upstream (MODWERK_UPSTREAM, default
~/.cache/modwerk-upstream/elekloader) and the built native emulator (OCTABAM_NATIVE). Never firmware in CI.
The packages are built here from source: Mute Modes' raw native forms (plain and SC_KEY) for the base without site
events, its subscriber form bound to the events base (it asks for the ev_mute_keep entry by hook index; the loader fills it at install), and an
ev_mute_keep provider."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
ADAPTERS, GLUE, LOADER = (ROOT / 'sdk/machines/octatrack/module-adapters', ROOT / 'sdk/machines/octatrack/elekloader',
                          ROOT / 'sdk/runtime/loader')
sys.path.insert(0, str(ADAPTERS))
spec = importlib.util.spec_from_file_location('mute_modes_runtime_builder', LOADER / 'build.py')
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


def nm_file(path, symbols):
    path.write_text(''.join('%08x t %s\n' % (value, name) for name, value in symbols.items()))


class MuteModesRuntime(unittest.TestCase):
    def test_mute_keep_and_gate_restore_under_the_emulator(self):
        stock = os.environ.get('MODWERK_PRIVATE_STOCK_MAIN')
        upstream = Path(os.environ.get('MODWERK_UPSTREAM', Path.home() / '.cache/modwerk-upstream/elekloader'))
        native = Path(os.environ.get('OCTABAM_NATIVE', Path.home() / '.cache/modwerk-upstream/octabam'))
        if not stock:
            self.skipTest('explicit local stock MAIN required; never firmware in CI')
        archives = [native / 'out/emu' / name for name in ('libot_machine.a', 'mc68k/lib68kEmu.a', 'dsp56300/dsp56kEmu/libdsp56kEmu.a',
                                                           'dsp56300/dsp56kBase/libdsp56kBase.a', 'dsp56300/asmjit/libasmjit.a')]
        tools = [shutil.which('m68k-elf-' + name) for name in ('gcc', 'as', 'ld', 'nm', 'objcopy')] + [shutil.which('c++')]
        if not all(tools) or not all(p.is_file() for p in archives) or not (upstream / 'elekloader').is_dir():
            self.skipTest('ColdFire tools, the Elekloader upstream and the built native emulator required')
        main = Path(stock).read_bytes()
        stock_at = lambda address, n: main[address - 0x40000400:address - 0x40000400 + n]
        import runtime_units
        sys.path.insert(0, str(upstream))
        from elekloader.sdk import octabam
        port = octabam.Octabam(str(ROOT / 'sdk/octabam')).modules['mute-modes']
        tables = json.loads((ADAPTERS / 'candidate-recipes.json').read_text())['ports']['mute-modes']['tables']
        with tempfile.TemporaryDirectory() as temp:
            work, files = Path(temp), {}
            for name, defines in (('events', ['-DMODWERK_RUNTIME_EVENTS']), ('legacy', [])):
                objects = []
                for source in (GLUE / 'runtime.c', ADAPTERS / 'loader_events_driver.c'):
                    obj = work / (name + '-' + source.stem + '.o')
                    subprocess.run(['m68k-elf-gcc', '-mcpu=5475', '-msoft-float', '-O2', '-ffreestanding', '-fno-builtin', '-fno-jump-tables',
                                    '-fno-asynchronous-unwind-tables', '-fomit-frame-pointer', '-ffunction-sections', '-fdata-sections',
                                    '-Wall', '-Wextra', '-Werror', *defines, '-DRUNTIME_MODULES=128u', '-DRUNTIME_POOL_BYTES=786432u',
                                    '-I' + str(GLUE), '-I' + str(ADAPTERS), '-I' + str(LOADER), '-I' + str(ROOT / 'sdk/runtime/upload'),
                                    '-c', str(source), '-o', str(obj)], check=True, capture_output=True)
                    objects.append(obj)
                undefined = ['modwerk_runtime_backend', 'modwerk_runtime_refusal', 'modwerk_runtime_active', 'fixture_image',
                             'modwerk_runtime_tick']
                if defines:
                    subprocess.run(['m68k-elf-as', '-mcpu=5475', str(GLUE / 'runtime_hooks.s'), '-o', str(work / 'dispatch.o')], check=True)
                    objects.append(work / 'dispatch.o')
                    undefined += ['modwerk_site_40004100', 'modwerk_site_40006820', 'modwerk_raise_ev_mute_keep']
                (work / 'link.ld').write_text('SECTIONS { . = 0x47400000; .text : { *(.text) *(.text.*) } .rodata : { *(.rodata*) } '
                                              '.data : { *(.data*) } .bss : { *(.bss*) } /DISCARD/ : { *(.comment) *(.eh_frame*) } }')
                elf = work / (name + '.elf')
                subprocess.run(['m68k-elf-ld', '--gc-sections', '-e', 'modwerk_backend_prepare', *['--undefined=' + n for n in undefined],
                                '-T', str(work / 'link.ld'), *map(str, objects), '-o', str(elf)], check=True, capture_output=True)
                (work / (name + '.sym')).write_text(subprocess.check_output(['m68k-elf-nm', str(elf)], text=True))
                subprocess.run(['m68k-elf-objcopy', '-O', 'binary', str(elf), str(work / (name + '.bin'))], check=True)

            def mute_modes(name, selected, events):
                result = runtime_units.compile_linked(port, ROOT / 'sdk/octabam', build, work / name, 'm68k-elf-', selected, tables,
                                                      stock_at, events=events)
                data = build.package(result['image'], result['bss'], result['hooks'], result['offsets'], result['sites'], name='mute-modes',
                                     hashed=True, title='Mute Modes', layout=1, copies=result['copies'], abi=8)
                (work / (name + '.mwrm')).write_bytes(data); nm_file(work / (name + '.syms'), result['symbols'])
                return result
            new = mute_modes('new', {'MUTE_MODES'}, True)
            self.assertEqual(new['hooks'][0], new['symbols']['mm_restore'])
            self.assertEqual(new['hooks'][7], build.RAISE << 24 | new['symbols']['raise_ev_mute_keep'])
            mute_modes('plain', {'MUTE_MODES'}, False)
            mute_modes('key', {'MUTE_MODES', 'SIDECHAIN_COMPRESSOR'}, False)
            subprocess.run(['m68k-elf-as', '-mcpu=54455', str(ADAPTERS / 'mute_keep_provider_fixture.s'), '-o', str(work / 'keep.o')], check=True)
            image, symbols, bss, offsets = build.link_units([work / 'keep.o'], 'm68k-elf-', 0, work)
            hooks = build.subscribe([build.NONE] * len(build.HANDLERS), [dict(event='ev_mute_keep', fn='sc_mute_keep', order=50)], symbols)
            (work / 'keep.mwrm').write_bytes(build.package(image, bss, hooks, offsets, [], name='mute-keep-provider', hashed=True,
                                                           title='keep provider', abi=8))
            subprocess.run(['c++', '-O2', '-std=c++17', '-I' + str(native / 'tools/emu/ot_emu'), '-I' + str(native / 'vendor'),
                            '-I' + str(native / 'vendor/dsp56300/source'), str(ADAPTERS / 'loader_mute_keep_fixture.cpp'), *map(str, archives),
                            '-lpthread', '-o', str(work / 'probe')], check=True, capture_output=True)
            result = subprocess.run([str(work / 'probe'), stock, *(str(work / f) for f in (
                'events.bin', 'events.sym', 'legacy.bin', 'legacy.sym', 'new.mwrm', 'new.syms', 'plain.mwrm', 'key.mwrm', 'key.syms',
                'keep.mwrm'))], capture_output=True, text=True)
            packages = {f: hashlib.sha256((work / f).read_bytes()).hexdigest() for f in ('new.mwrm', 'plain.mwrm', 'key.mwrm', 'keep.mwrm')}
        self.assertEqual(result.returncode, 0, result.stderr[-4000:])
        receipt = json.loads(result.stdout.splitlines()[-1])
        self.assertEqual(receipt['failures'], 0)
        if os.environ.get('MODWERK_MUTE_KEEP_RECEIPT'):
            receipt.update(packageSha256=packages, stockMainSha256=hashlib.sha256(main).hexdigest(), moduleBehaviorQualified=False)
            Path(os.environ['MODWERK_MUTE_KEEP_RECEIPT']).write_text(json.dumps(receipt, indent=2) + '\n')


if __name__ == '__main__':
    unittest.main()
