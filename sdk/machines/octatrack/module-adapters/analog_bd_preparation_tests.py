# SPDX-License-Identifier: MIT
"""Closed private Analog BD port preparation: exact imports and native linking.

AB is prepared alone. Its shared chooser/page/render seams belong to the base
machine registry (machine-events lane); nothing here composes it with others.
"""
from dataclasses import replace
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

import analog_bd_runtime as ab
import analog_bd_write_lease as lease

SDK = Path(__file__).resolve().parents[3] / 'octabam'
sys.path.insert(0, str(SDK / 'tools'))
from remix import registry


def selected():
    old = Path.cwd()
    try:
        os.chdir(SDK)
        return registry._load_one(SDK / 'modules/analog-bassdrum/manifest.py')
    finally:
        os.chdir(old)


class SourceTests(unittest.TestCase):
    def test_original_files_are_exact_and_descriptor_writes_removed(self):
        original = (SDK / 'modules/analog-bassdrum/control.c').read_text()
        source = ab.control_source(original)
        self.assertNotIn('U32(0x400d5f38u+5*4)=', source)
        self.assertIn('(void)ab_track_page', source)
        self.assertIn('int ab_render(', source)
        self.assertIn('static uint32_t ab_runtime_bound=0;', source)
        for name, digest in ab.PINS.items():
            self.assertEqual(hashlib.sha256((SDK / 'modules/analog-bassdrum' / name).read_bytes()).hexdigest(), digest)
        with self.assertRaisesRegex(ValueError, 'source changed'):
            ab.control_source(original + '\n')


@unittest.skipUnless(shutil.which('m68k-elf-gcc'), 'native ColdFire toolchain required')
class NativeTests(unittest.TestCase):
    def test_changed_ab_unit_is_not_silently_replaced(self):
        bd = selected()
        unit = bd.linked[1]
        for changed in [replace(bd, linked=(bd.linked[0], replace(unit, source='unknown.s'), bd.linked[2])),
                        replace(bd, linked=(*bd.linked, unit)),
                        replace(bd, linked=(bd.linked[0], replace(unit, include='unknown'), bd.linked[2]))]:
            for port in (ab.port, lease.port):
                with tempfile.TemporaryDirectory() as temp, self.assertRaisesRegex(ValueError, 'declaration drift|once'):
                    port(changed, SDK, temp)

    def test_alone_both_variants_relocate_with_no_bss_and_only_lease_imports(self):
        imports = {'modwerk_controller_write_begin': 0x40a994c0, 'modwerk_controller_write_end': 0x40a994dc}
        for port in (ab.port, lease.port):
            with self.subTest(port=port.__module__), tempfile.TemporaryDirectory() as temp:
                folder = Path(temp)
                module = port(selected(), SDK, folder / 'source')
                self.assertEqual(module.detours, selected().detours)  # its sites stay declared for the registry port
                objects = []
                for index, unit in enumerate(module.linked):
                    obj, source = folder / (str(index) + '.o'), Path(unit.source)
                    subprocess.run(['m68k-elf-as', '-mcpu=54455', str(source if source.is_absolute() else SDK / source), '-o', str(obj)],
                                   cwd=SDK, check=True, capture_output=True)
                    objects.append(obj)
                relocatable = folder / 'all.o'
                subprocess.run(['m68k-elf-ld', '-r', '-o', str(relocatable), *map(str, objects)], check=True, capture_output=True)
                undefined = [line.split() for line in subprocess.check_output(['m68k-elf-nm', '-u', str(relocatable)], text=True).splitlines()]
                self.assertEqual(sorted(n for kind, n in undefined if kind == 'U'), sorted(lease.IMPORTS) if port is lease.port else [])
                images, maps = [], []
                for origin in (0, 0x21030):
                    script, elf, binary = folder / 'link.ld', folder / 'linked.elf', folder / 'linked.private.raw'
                    script.write_text('SECTIONS { . = ' + hex(origin) + '; .text : { *(.text*) *(.rodata*) *(.data*) } .bss : { *(.bss*) *(COMMON) } /DISCARD/ : { *(.comment) *(.note*) *(.eh_frame) } }')
                    subprocess.run(['m68k-elf-ld', '--no-warn-rwx-segments', *['--defsym=%s=%#x' % i for i in imports.items()],
                                    '-T', str(script), '-o', str(elf), *map(str, objects)], check=True, capture_output=True)
                    symbols = subprocess.check_output(['m68k-elf-nm', str(elf)], text=True)
                    self.assertNotIn(' U ', symbols)
                    self.assertNotIn(' B ', symbols)
                    maps.append({line.split()[2]: int(line.split()[0], 16) for line in symbols.splitlines() if len(line.split()) == 3})
                    subprocess.run(['m68k-elf-objcopy', '-O', 'binary', str(elf), str(binary)], check=True, capture_output=True)
                    images.append(binary.read_bytes())
                low, high = images
                expected, at = bytearray(low), 0
                while at + 4 <= len(low):
                    a, b = int.from_bytes(low[at:at+4], 'big'), int.from_bytes(high[at:at+4], 'big')
                    if b - a == 0x21030 and a < len(low):
                        expected[at:at+4] = b.to_bytes(4, 'big'); at += 4
                    else:
                        at += 2
                self.assertEqual(bytes(expected), high)
                self.assertEqual(maps[0]['desc'] + 916, maps[0]['ab_runtime_bound'])
                self.assertLess(maps[0]['ab_runtime_bound'], len(low))


class ObservationTests(unittest.TestCase):
    """Hash-only private emulator observations stay bound to the exact sources."""
    def test_native_observations_bind_current_sources_and_stay_unqualified(self):
        import json
        app = SDK.parents[1]
        doc = json.loads((Path(__file__).with_name('analog_bd_native_observations.json')).read_text())
        self.assertEqual(doc['schema'], 'modwerk-private-ab-native-observations-v1')
        for name, digest in doc['sourcePins'].items():
            self.assertEqual(hashlib.sha256((app / name).read_bytes()).hexdigest(), digest, name)
        for key in ('hardware', 'admission', 'productionLease', 'encodedPackage'):
            self.assertIs(doc[key], False)
        runs = doc['runs']
        count = lambda kind: sum(run['fixture'] == kind for run in runs)
        self.assertEqual((count('ui'), count('lease'), len(runs)), (4, 2, 6))
        self.assertEqual({run['origin'] for run in runs}, {0x47080000, 0x47100000})
        for run in runs:
            observed = run['observed']
            self.assertIs(observed['hardware'], False)
            self.assertIs(observed['admission'], False)
            if run['fixture'] == 'lease':
                self.assertTrue(observed['writesOnlyInsideLease'] and observed['noFailureReplay'] and observed['deniedSilentStockSource'])
                self.assertEqual((observed['deniedBegins'], observed['failedEnds']), (12, 3))
                self.assertFalse(observed['productionLease'] or observed['physicalTimingQualified'])
            if run['fixture'] == 'ui':
                self.assertTrue(observed['exactPreinstallRootRestore'])
                self.assertFalse(observed['unknownExports'])



class PriceTests(unittest.TestCase):
    """The declared price stays bound to the measured DSP sources: those of the engine its package carries."""
    def test_declared_price_covers_every_measured_increment_and_is_source_bound(self):
        import json
        app = SDK.parents[1]
        doc = json.loads(Path(__file__).with_name('analog_bd_dsp_price.json').read_text())
        self.assertEqual((doc['schema'], doc['kind'], doc['hardware']), ('modwerk-ab-dsp-price-v1', 'executed-instructions', False))
        for name, digest in doc['sourcePins'].items():
            self.assertEqual(hashlib.sha256((app / name).read_bytes()).hexdigest(), digest, name)
        for name in ('ab_glue.asm', 'bd909.asm', 'bd808.asm', 'dsp909.py', 'dsp808.py', 'fit909.json'):
            self.assertIn('sdk/octabam/modules/analog-bassdrum/' + name, doc['sourcePins'])  # its package's engine is the priced one
        self.assertGreaterEqual(doc['perVoice'], max(max(r['meanPerVoice'], r['peakPerVoice']) for r in doc['measuredIncrements']))
        self.assertGreaterEqual(doc['perCoreWhileEnabled'], max(max(r['mean'], r['peak']) for r in doc['measuredSeam']) + 0.25)
        self.assertEqual(doc['voicesPerCore'], 4)


if __name__ == '__main__':
    unittest.main()
