# SPDX-License-Identifier: MIT
"""Compile the actual default-closed private table consumer/admission helper."""
from pathlib import Path
import os
import hashlib
import json
import shutil
import subprocess
import tempfile
import unittest
from host_flags import SANITIZE  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
ADAPTER = ROOT / 'sdk/machines/octatrack/module-adapters'


class TableAdmissionTests(unittest.TestCase):
    def test_production_boundary_links_strong_helper_and_fixed_empty_reservations(self):
        gcc, ld, nm, objcopy = [shutil.which('m68k-elf-' + name) for name in ('gcc', 'ld', 'nm', 'objcopy')]
        if not all((gcc, ld, nm, objcopy)): self.skipTest('ColdFire compiler required')
        with tempfile.TemporaryDirectory() as temp:
            work = Path(temp)
            entry = work / 'entry.c'
            entry.write_text('#define MODWERK_RUNTIME_METADATA_EXTERNAL\n#include "loader.c"\n#include "sha256.c"\n'
                             'void *memcpy(void *d,const void *s,unsigned long n) {'
                             'volatile uint8_t *out=d;const volatile uint8_t *in=s;'
                             'for(unsigned long i=0;i<n;i++)out[i]=in[i];return d;}\n'
                             'void *memset(void *d,int v,unsigned long n) {'
                             'volatile uint8_t *out=d;for(unsigned long i=0;i<n;i++)out[i]=(uint8_t)v;return d;}\n')
            glue = ROOT / 'sdk/machines/octatrack/elekloader'
            flags = [gcc, '-mcpu=5475', '-msoft-float', '-O2', '-ffreestanding', '-fno-builtin',
                     '-fno-jump-tables', '-fno-asynchronous-unwind-tables', '-fomit-frame-pointer',
                     '-ffunction-sections', '-fdata-sections', '-Wall', '-Wextra', '-Werror',
                     '-I' + str(glue), '-I' + str(ADAPTER), '-I' + str(ROOT / 'sdk/runtime/loader'),
                     '-I' + str(ROOT / 'sdk/runtime/upload'), '-I' + str(ROOT / 'sdk/machines/octatrack/include')]
            sources = [entry, glue / 'runtime.c', *[ADAPTER / (name + '.c') for name in
                       ('machine_admission_runtime', 'machine_admission', 'machine_contributors', 'machine_declarations',
                        'machine_lifetime', 'machine_parts', 'sample_editor_actions', 'table_admission', 'table_declarations')]]
            objects = []
            for source in sources:
                obj = work / (source.stem + '.o')
                subprocess.run([*flags, '-c', source, '-o', obj], check=True, capture_output=True)
                objects.append(obj)
            (work / 'link.ld').write_text('SECTIONS { . = 0x47400000; .text : { *(.text) *(.text.*) } '
                                         '.rodata : { *(.rodata*) } .data : { *(.data*) } .bss : { *(.bss*) } '
                                         '/DISCARD/ : { *(.comment) *(.eh_frame*) } }')
            subprocess.run([ld, '--gc-sections', '-e', 'modwerk_backend_prepare', '--undefined=modwerk_runtime_backend',
                            '-T', work / 'link.ld', *objects, '-o', work / 'test.elf'], check=True, capture_output=True)
            symbols = subprocess.check_output([nm, work / 'test.elf'], text=True)
            self.assertNotIn(' U ', symbols)
            parsed = {line.split()[-1]: (int(line.split()[0], 16), line.split()[1]) for line in symbols.splitlines()}
            self.assertEqual(parsed['modwerk_machine_metadata_admit'][1], 'T')
            subprocess.run([objcopy, '-O', 'binary', work / 'test.elf', work / 'test.bin'], check=True)
            image = (work / 'test.bin').read_bytes()
            for name, magic, revision, length in (('modwerk_machine_declarations', b'MWMD', 2, 1072),
                                                  ('modwerk_table_declarations', b'MWTD', 1, 1456)):
                offset = parsed[name][0] - 0x47400000
                self.assertEqual(image[offset:offset + length], magic + bytes((revision, 0, 24)) + bytes(length - 7))

    def test_exact_arrays_menu_and_paused_consumer_negatives(self):
        cc = shutil.which('cc')
        if not cc: self.skipTest('no C compiler')
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / 'test'
            sources = [ADAPTER / (name + '.c') for name in
                       ('table_admission', 'table_declarations', 'machine_admission', 'machine_declarations', 'machine_lifetime', 'machine_parts', 'test_table_admission')]
            subprocess.run([cc, '-std=c99', '-Wall', '-Wextra', '-Werror', '-pedantic', '-g',
                            *SANITIZE, '-fno-sanitize-recover=all',
                            '-I', str(ADAPTER), '-I', str(ROOT / 'sdk/runtime/loader'),
                            '-I', str(ROOT / 'sdk/runtime/upload'), *map(str, sources), '-o', str(output)],
                           check=True, capture_output=True)
            result = subprocess.run([str(output)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_private_actual_loader_undo_and_original_list_reset(self):
        stock = os.environ.get('MODWERK_PRIVATE_STOCK_MAIN')
        if not stock: self.skipTest('explicit local stock MAIN path required; never firmware in CI')
        native = Path(os.environ.get('OCTABAM_NATIVE', Path.home() / '.cache/modwerk-upstream/octabam'))
        gcc, ld, nm, objcopy = [shutil.which('m68k-elf-' + name) for name in ('gcc', 'ld', 'nm', 'objcopy')]
        cxx = shutil.which('c++')
        archives = [native / 'out/emu' / name for name in (
            'libot_machine.a', 'mc68k/lib68kEmu.a', 'dsp56300/dsp56kEmu/libdsp56kEmu.a',
            'dsp56300/dsp56kBase/libdsp56kBase.a', 'dsp56300/asmjit/libasmjit.a')]
        if not all((gcc, ld, nm, objcopy, cxx)) or not all(p.is_file() for p in archives):
            self.skipTest('ColdFire compiler and built native emulator required')
        with tempfile.TemporaryDirectory() as temp:
            work = Path(temp)
            glue = ROOT / 'sdk/machines/octatrack/elekloader'
            flags = [gcc, '-mcpu=5475', '-msoft-float', '-O2', '-ffreestanding', '-fno-builtin',
                     '-fno-jump-tables', '-fno-asynchronous-unwind-tables', '-fomit-frame-pointer',
                     '-ffunction-sections', '-fdata-sections', '-Wall', '-Wextra', '-Werror',
                     '-I' + str(glue), '-I' + str(ADAPTER), '-I' + str(ROOT / 'sdk/runtime/loader'),
                     '-I' + str(ROOT / 'sdk/runtime/upload'), '-I' + str(ROOT / 'sdk/machines/octatrack/include')]
            objects = []
            for source in [glue / 'runtime.c', *[ADAPTER / (name + '.c') for name in
                           ('loader_table_driver', 'table_admission', 'table_declarations', 'machine_lifetime',
                            'machine_admission', 'machine_declarations', 'machine_parts')]]:
                obj = work / (source.stem + '.o')
                subprocess.run([*flags, '-c', str(source), '-o', str(obj)], check=True, capture_output=True)
                objects.append(obj)
            (work / 'link.ld').write_text('SECTIONS { . = 0x47400000; .text : { *(.text) *(.text.*) } '
                                         '.rodata : { *(.rodata*) } .data : { *(.data*) } .bss : { *(.bss*) } '
                                         '/DISCARD/ : { *(.comment) *(.eh_frame*) } }')
            exports = ('fixture_hash', 'fixture_clear_table', 'fixture_review_table', 'fixture_review_table_offsets',
                       'fixture_review_machine', 'fixture_review_optional_quantizer', 'fixture_table_image', 'modwerk_runtime_free',
                       'modwerk_runtime_active', 'modwerk_runtime_backend', 'modwerk_runtime_refusal')
            subprocess.run([ld, '--gc-sections', '-e', 'modwerk_backend_prepare',
                            *['--undefined=' + name for name in exports], '-T', work / 'link.ld',
                            *objects, '-o', work / 'test.elf'], check=True, capture_output=True)
            (work / 'symbols').write_text(subprocess.check_output([nm, work / 'test.elf'], text=True))
            subprocess.run([objcopy, '-O', 'binary', work / 'test.elf', work / 'test.bin'], check=True)
            subprocess.run([cxx, '-O2', '-std=c++17', '-I' + str(native / 'tools/emu/ot_emu'),
                            '-I' + str(native / 'vendor'), '-I' + str(native / 'vendor/dsp56300/source'),
                            str(ADAPTER / 'loader_table_fixture.cpp'), *map(str, archives), '-lpthread',
                            '-o', str(work / 'probe')], check=True, capture_output=True)
            result = subprocess.run([work / 'probe', stock, work / 'test.bin', work / 'symbols'], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn('"exactPreinstallRestore":true', result.stdout)
            self.assertIn('"stockListReset":true', result.stdout)
            tables = os.environ.get('MODWERK_PRIVATE_TABLE_PACKAGES')
            if tables:
                table_root = Path(tables)
                capture = json.loads((table_root / 'capture.json').read_text())
                offsets = [capture['symbols']['__runtime_table_' + str(i)] for i in range(3)]
                manifest = work / 'actual-tables.txt'
                manifest.write_text(' '.join(map(str, [1, table_root / 'reviewed-stockfree.mwrm', *offsets])) + '\n')
                actual = subprocess.run([work / 'probe', stock, work / 'test.bin', work / 'symbols',
                                         '--table-packages', manifest], capture_output=True, text=True)
                self.assertEqual(actual.returncode, 0, actual.stdout + actual.stderr)
                self.assertIn('"actualPackages":1', actual.stdout)
                actual_receipt = json.loads(actual.stdout.splitlines()[-1])
                actual_receipt.update(packageSha256=hashlib.sha256((table_root / 'reviewed-stockfree.mwrm').read_bytes()).hexdigest(),
                                      compiledSources=capture['sources'], trustDeclarations='synthetic-native-only',
                                      moduleBehaviorQualified=False, browser=False, hardware=False, admission=False)
            else:
                actual_receipt = None
            groups = os.environ.get('MODWERK_PRIVATE_MACHINE_GROUPS')
            if groups:
                group_root = Path(groups)
                rows = []
                for mask in range(1, 8):
                    directory = group_root / str(mask)
                    capture = json.loads((directory / 'capture.json').read_text())
                    offsets = [capture['symbols']['__runtime_table_' + str(i)] for i in range(3)] if mask & 4 else [0, 0, 0]
                    rows.append(' '.join(map(str, [mask, directory / 'reviewed-stockfree.mwrm', *offsets, 0])))
                qz_groups = os.environ.get('MODWERK_PRIVATE_QZ_GROUPS')
                if qz_groups:
                    for mask in range(1, 4):
                        directory = Path(qz_groups) / str(mask)
                        capture = json.loads((directory / 'capture.json').read_text())
                        offsets = [capture['symbols']['__runtime_table_' + str(i)] for i in range(3)]
                        rows.append(' '.join(map(str, [mask, directory / 'reviewed-stockfree.mwrm', *offsets, 1])))
                manifest = work / 'groups.txt'
                manifest.write_text('\n'.join(rows) + '\n')
                # Lines "<conflicting participant bits P1 V2 FM4 QZ8> <actual raw companion package>".
                companions = os.environ.get('MODWERK_PRIVATE_COMPANIONS')
                matrix = subprocess.run([work / 'probe', stock, work / 'test.bin', work / 'symbols', manifest,
                                         *(['--companions', companions] if companions else [])],
                                        capture_output=True, text=True)
                self.assertEqual(matrix.returncode, 0, matrix.stdout + matrix.stderr)
                self.assertIn('"machineMasks":7', matrix.stdout)
                matrix_receipt = json.loads(matrix.stdout.splitlines()[-1])
                if companions:
                    lines = Path(companions).read_text().splitlines()
                    self.assertEqual(matrix_receipt['companionOrders'], 2 * len(rows) * len(lines))
                    matrix_receipt['companionSha256'] = [hashlib.sha256(Path(line.split()[1]).read_bytes()).hexdigest() for line in lines]
                matrix_receipt.update(packageSha256={str(mask): hashlib.sha256((group_root / str(mask) / 'reviewed-stockfree.mwrm').read_bytes()).hexdigest() for mask in range(1, 8)},
                                      trustDeclarations='synthetic-native-only', moduleBehaviorQualified=False,
                                      browser=False, hardware=False, admission=False)
                if qz_groups:
                    matrix_receipt['optionalQzPackageSha256'] = {str(mask): hashlib.sha256((Path(qz_groups) / str(mask) / 'reviewed-stockfree.mwrm').read_bytes()).hexdigest() for mask in range(1, 4)}
            else:
                matrix_receipt = None
            receipt_path = os.environ.get('MODWERK_TABLE_PROOF_RECEIPT')
            if receipt_path:
                receipt = json.loads(result.stdout.splitlines()[-1])
                inputs = [ROOT / 'sdk/runtime/loader' / name for name in ('loader.c', 'loader.h', 'context.h')]
                inputs += [glue / 'runtime.c', glue / 'runtime.h']
                inputs += [ADAPTER / name for name in ('loader_table_driver.c', 'loader_table_fixture.cpp',
                           'table_admission.c', 'table_admission.h', 'table_declarations.c', 'table_declarations.h',
                           'machine_lifetime.c', 'machine_lifetime.h', 'machine_admission.c', 'machine_admission.h',
                           'machine_declarations.c', 'machine_parts.c', 'machine_parts.h')]
                receipt.update(stockMainSha256=hashlib.sha256(Path(stock).read_bytes()).hexdigest(),
                               sourceSha256={p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs},
                               moduleBehaviorQualified=False, browser=False, admission=False)
                Path(receipt_path).write_text(json.dumps(receipt, indent=2) + '\n')
                if matrix_receipt:
                    matrix_receipt.update(stockMainSha256=receipt['stockMainSha256'], sourceSha256=receipt['sourceSha256'])
                    Path(receipt_path).with_name(Path(receipt_path).stem + '-groups.json').write_text(json.dumps(matrix_receipt, indent=2) + '\n')
                if actual_receipt:
                    actual_receipt.update(stockMainSha256=receipt['stockMainSha256'], sourceSha256=receipt['sourceSha256'])
                    Path(receipt_path).with_name(Path(receipt_path).stem + '-actual-tables.json').write_text(json.dumps(actual_receipt, indent=2) + '\n')


if __name__ == '__main__': unittest.main()
