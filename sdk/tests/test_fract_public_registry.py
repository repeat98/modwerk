"""FRACT START integration with explicit proposed FR:1 boot preservation.

Public main lacks FR:1 in known[]. This fixture opts in locally, without
claiming that the committed public base supports FRACT persistence.
"""
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

from host_flags import SANITIZE

ROOT = Path(__file__).resolve().parents[2]
LOADER = ROOT / 'sdk/machines/octatrack/elekloader'


@unittest.skipUnless(shutil.which('cc'), 'no host C compiler')
class FractPublicRegistry(unittest.TestCase):
    def test_public_live_start_render_and_pool(self):
        self.check_registry(proposed_boot=False)

    def test_proposed_fr_boot_preservation_and_missing_restore(self):
        self.check_registry(proposed_boot=True)

    def check_registry(self, proposed_boot):
        with tempfile.TemporaryDirectory(prefix='fract-public-registry-') as directory:
            temp = Path(directory)
            registry = (LOADER / 'machine_registry.c').read_text()
            anchor = "known[] = {"
            assert registry.count(anchor) == 1
            if proposed_boot and "{{'F', 'R'}, 1, 1}" not in registry:
                registry = registry.replace(anchor, anchor + "{{'F', 'R'}, 1, 1}, ")
            (temp / 'machine_registry.c').write_text(registry)
            (temp / 'registry_fixture.c').write_text((LOADER / 'test_machine_registry.c').read_text())
            fixture = (ROOT / 'sdk/tests/fixtures/fract_registry.c').read_text()
            if not proposed_boot:
                # Live dispatch uses the unchanged public registry. Boot is
                # tested only in the explicitly proposed-base case above.
                start = fixture.index('    /* Boot-like validation:')
                end = fixture.index('    /* Synthetic test price only:')
                fixture = fixture[:start] + fixture[end:]
                fixture = fixture.replace('    Machine paid =',
                    '    uint8_t saved[PART_STRIDE];\n    Machine paid =')
            # The active grain-only machine admits T1-T4, unlike the archived
            # pre-transport prototype whose integration fixture ran all eight.
            fixture = fixture.replace('track < 8; ++track)', 'track < 4; ++track)')
            fixture = fixture.replace('16 FRACT registry renders', '8 FRACT registry renders')
            fixture = fixture.replace('paid.flags |= MODWERK_MACHINE_CF_RENDER;',
                                      '/* Public ABI prices source_kind directly. */')
            # Current saved controls carry the grain-only layout marker; an
            # old marker would deliberately run the separately tested upgrade.
            fixture = fixture.replace('uint8_t pool_saved[PART_STRIDE];',
                'part0()[control_offset(0,11)] = sram[control_offset(0,11)] = OG_GRAIN_LAYOUT_MARKER;\n'
                '    uint8_t pool_saved[PART_STRIDE];')
            (temp / 'fract_registry.c').write_text(fixture)
            binary = temp / 'fixture'
            includes = [ROOT / p for p in (
                'sdk/drafts/fract-machine/engine', 'sdk/drafts/fract-machine/support', 'sdk/drafts/fract-machine',
                'sdk/tests/fixtures', 'sdk/machines/octatrack/include',
                'sdk/machines/octatrack/module-adapters', 'sdk/runtime/loader', 'sdk/runtime/upload')]
            result = subprocess.run([
                'cc', '-std=c11', '-Wall', '-Wextra', '-Werror', '-g', '-O1',
                *SANITIZE, '-fno-sanitize-recover=all', '-DOG_NATIVE_STAGE_ONE',
                '-DOG_MACHINE_START_EXTENSION', '-DOG_MACHINE_GRAIN_ONLY', '-DOG_FRACT_CURRENT_ENGINE',
                '-DMODWERK_RUNTIME_EVENTS', '-DRUNTIME_MODULES=128u',
                '-I', str(temp), '-I', str(LOADER),
                *['-I' + str(path) for path in includes], str(temp / 'fract_registry.c'), '-o', str(binary)
            ], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            result = subprocess.run([str(binary)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn('8 FRACT registry renders', result.stdout)
