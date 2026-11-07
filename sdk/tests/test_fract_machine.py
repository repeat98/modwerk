"""Experimental FRACT machine adapter: host equivalence, not device evidence."""
from pathlib import Path
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

from host_flags import SANITIZE

ROOT = Path(__file__).resolve().parents[2]
MODULE = ROOT / 'sdk/tests/fixtures/fract_reference'
SUPPORT = ROOT / 'sdk/drafts/fract-machine/support'
DRAFT = ROOT / 'sdk/drafts/fract-machine'
LEGACY_EVENTS = ROOT / 'sdk/machines/octatrack/include'
# Explicit experimental integration, never silently use a neighboring checkout.
BASE_ROOT = os.environ.get('FRACT_MACHINE_BASE_ROOT')
SPACE_TRANSPORT = BASE_ROOT and (Path(BASE_ROOT) / 'sdk/drafts/source-stage-transport/source_runtime.h').is_file()
EVENTS = Path(BASE_ROOT) / 'sdk/machines/octatrack/include' if BASE_ROOT else LEGACY_EVENTS
EXTENSION_FLAGS = ['-DOG_MACHINE_START_EXTENSION'] if BASE_ROOT else []
sys.path.insert(0, str(ROOT / 'sdk/runtime'))
import m68k_codegen  # noqa: E402


class FractMachineTests(unittest.TestCase):
    PROFILE_FLAGS = []
    @classmethod
    def setUpClass(cls):
        cc = shutil.which('cc')
        if not cc:
            raise unittest.SkipTest('no host C compiler')
        cls.temp = tempfile.TemporaryDirectory(prefix='fract-machine-host-')
        cls.addClassCleanup(cls.temp.cleanup)
        cls.binary = Path(cls.temp.name) / 'fixture'
        result = subprocess.run([
            cc, '-std=c11', '-Wall', '-Wextra', '-Werror', '-g', '-O1',
            *SANITIZE, '-fno-sanitize-recover=all', '-DOG_NATIVE_STAGE_ONE',
            *EXTENSION_FLAGS, *cls.PROFILE_FLAGS,
            '-I', str(MODULE), '-I', str(SUPPORT), '-I', str(DRAFT), '-I', str(EVENTS),
            str(ROOT / 'sdk/tests/fixtures/fract_machine.c'),
            '-o', str(cls.binary),
        ], capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError(result.stdout + result.stderr)

    def run_fixture(self, name):
        result = subprocess.run([str(self.binary), name], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return result.stdout

    def test_pcm_state_and_owner_match_fx_reference(self):
        self.assertIn('32768 chunks: bit-identical', self.run_fixture('differential'))

    def test_owner_lifecycle_and_invalid_calls(self):
        self.assertIn('source replacement: OK', self.run_fixture('lifecycle'))

    def test_native_render_packet_bounds_controls_and_tstr_override(self):
        self.assertIn('2176 native-render fixtures', self.run_fixture('native'))

    def test_pitched_and_split_source_packets_preserve_fetch_boundaries(self):
        self.assertIn('2880 synthetic packets', self.run_fixture('packets'))

    def test_prototype_machine_descriptor_and_src_page(self):
        self.assertIn('native SRC page clone: OK', self.run_fixture('registration'))

    def test_proposed_start_translates_and_restores_src_controls(self):
        self.assertIn('64 proposed START fixtures', self.run_fixture('start'))

    def test_incomplete_machine_refuses_release_compilation(self):
        result = subprocess.run([
            shutil.which('cc'), '-E', '-I', str(MODULE), '-I', str(SUPPORT), '-I', str(EVENTS),
            str(DRAFT / 'registration.c'),
        ], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('FRACT machine requires the explicit experimental build profile', result.stderr)

    def test_experimental_start_requires_supporting_base(self):
        # START is now public. Model an older unsupported header explicitly,
        # rather than assuming the checkout still lacks the START interface.
        with tempfile.TemporaryDirectory(prefix='fract-no-start-header-') as temp:
            header = (LEGACY_EVENTS / 'modwerk_events.h').read_text()
            header = header.replace('#define MODWERK_MACHINE_START 256u', '#define FRACT_TEST_NO_START 256u')
            Path(temp, 'modwerk_events.h').write_text(header)
            result = subprocess.run([
                shutil.which('cc'), '-E', '-DOG_MACHINE_PROTOTYPE', '-DOG_MACHINE_START_EXTENSION',
                '-I', str(MODULE), '-I', str(SUPPORT), '-I', temp, '-I', str(LEGACY_EVENTS), str(DRAFT / 'registration.c'),
            ], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("supporting base's generated event header", result.stderr)
        declarations = json.loads((DRAFT / 'runtime.experimental.json').read_text())['contribute']
        self.assertEqual([(d['to'], d['data']) for d in declarations], [
            ('ot_machines', 'og_machine_descriptor'), ('ot_machine_starts', 'og_machine_start_descriptor')])

    def test_adapter_compiles_for_mcf54455_and_passes_codegen_guard(self):
        gcc = shutil.which('m68k-elf-gcc')
        if not gcc:
            self.skipTest('no ColdFire compiler')
        with tempfile.TemporaryDirectory(prefix='fract-machine-coldfire-') as temp:
            objects = []
            for unit in ('machine', 'render', 'start', 'registration', 'grain', 'pitch', 'control', 'source'):
                obj = Path(temp) / (unit + '.o')
                source = (DRAFT if unit in ('machine', 'render', 'start', 'registration') else SUPPORT if unit == 'control' else MODULE) / (unit + '.c')
                result = subprocess.run([
                    gcc, '-mcpu=54455', '-msoft-float', '-malign-int', '-Os',
                    *m68k_codegen.FLAGS, '-fomit-frame-pointer', '-ffreestanding',
                    '-fno-builtin', '-fno-common', '-fno-pic', '-DOG_NATIVE_STAGE_ONE',
                    '-Wall', '-Wextra', '-Werror', '-fstack-usage', '-DOG_MACHINE_PROTOTYPE', '-c',
                    *EXTENSION_FLAGS, *self.PROFILE_FLAGS,
                    '-I', str(MODULE), '-I', str(SUPPORT), '-I', str(EVENTS), str(source), '-o', str(obj),
                ], capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                objects.append(obj)
            self.assertEqual(m68k_codegen.check(objects), 8)

    @unittest.skipUnless(SPACE_TRANSPORT, 'Archived SPACE transport is not part of the grain-only base')
    def test_actual_render_publishes_complete_source_frames_only(self):
        transport = Path(BASE_ROOT) / 'sdk/drafts/source-stage-transport'
        with tempfile.TemporaryDirectory(prefix='fract-render-transport-') as temp:
            binary = Path(temp) / 'fixture'
            result = subprocess.run([
                shutil.which('cc'), '-std=c11', '-Wall', '-Wextra', '-Werror', '-g', '-O1',
                *SANITIZE, '-fno-sanitize-recover=all', '-DOG_NATIVE_STAGE_ONE',
                '-DOG_MACHINE_PROTOTYPE', '-DOG_MACHINE_SOURCE_TRANSPORT',
                '-DMW_SOURCE_PROTOTYPE', '-DDL_NATIVE_TEST', *EXTENSION_FLAGS,
                '-I', str(MODULE), '-I', str(SUPPORT), '-I', str(DRAFT), '-I', str(EVENTS), '-I', str(transport),
                str(ROOT / 'sdk/tests/fixtures/fract_machine.c'),
                str(transport / 'source_runtime.c'), str(transport / 'source_channel.c'),
                '-o', str(binary),
            ], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            result = subprocess.run([str(binary), 'source-capture'], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn('34816 render-to-source frames', result.stdout)

    @unittest.skipUnless(SPACE_TRANSPORT, 'Archived SPACE transport is not part of the grain-only base')
    def test_transport_render_and_shared_runtime_coldfire_codegen(self):
        gcc = shutil.which('m68k-elf-gcc')
        self.assertIsNotNone(gcc)
        transport = Path(BASE_ROOT) / 'sdk/drafts/source-stage-transport'
        with tempfile.TemporaryDirectory(prefix='fract-transport-coldfire-') as temp:
            objects = []
            for source in (DRAFT / 'render.c', transport / 'source_runtime.c', transport / 'source_channel.c'):
                obj = Path(temp) / (source.stem + '.o')
                result = subprocess.run([
                    gcc, '-mcpu=54455', '-msoft-float', '-malign-int', '-Os', *m68k_codegen.FLAGS,
                    '-fomit-frame-pointer', '-ffreestanding', '-fno-builtin', '-fno-common', '-fno-pic',
                    '-Wall', '-Wextra', '-Werror', '-DOG_NATIVE_STAGE_ONE', '-DOG_MACHINE_PROTOTYPE',
                    '-DOG_MACHINE_SOURCE_TRANSPORT', '-DMW_SOURCE_PROTOTYPE',
                    '-I', str(MODULE), '-I', str(SUPPORT), '-I', str(EVENTS), '-I', str(transport),
                    '-c', str(source), '-o', str(obj),
                ], capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                objects.append(obj)
            self.assertEqual(m68k_codegen.check(objects), 3)


if __name__ == '__main__':
    unittest.main()
