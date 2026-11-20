"""Default-empty mandatory board policy; no controller admission or MMIO."""
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
POLICY = ROOT / 'sdk/machines/octatrack/module-adapters/controller-policy'
RESIDENT = ROOT / 'sdk/machines/octatrack/module-adapters/resident-runtime'
RUNTIME = ROOT / 'sdk/machines/octatrack/module-adapters/resident-runtime'


class ControllerPolicy(unittest.TestCase):
    @unittest.skipUnless(shutil.which('cc'), 'Native C compiler unavailable')
    def test_exact_association_owned_job_partial_ack_and_retirement_contract(self):
        with tempfile.TemporaryDirectory() as tmp:
            executable = Path(tmp) / 'association'
            result = subprocess.run(['cc', '-std=c11', '-Wall', '-Wextra', '-Werror', '-pedantic',
                '-I' + str(RUNTIME), str(RUNTIME / 'stock_hook_resources.c'),
                str(POLICY / 'controller_association.c'), str(POLICY / 'test_controller_association.c'),
                '-o', str(executable)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            result = subprocess.run([str(executable)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)

    @unittest.skipUnless(shutil.which('cc'), 'Native C compiler unavailable')
    def test_only_reviewed_exact_packages_narrow_a_buffer_and_everything_else_is_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            executable = Path(tmp) / 'closed-policy'
            result = subprocess.run(['cc', '-std=c11', '-Wall', '-Wextra', '-Werror', '-pedantic', '-I' + str(RESIDENT),
                str(POLICY / 'controller_policy.c'), str(POLICY / 'test_controller_policy.c'),
                '-o', str(executable)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            result = subprocess.run([str(executable)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)

    @unittest.skipUnless(shutil.which('m68k-elf-gcc') and shutil.which('m68k-elf-nm'),
                         'ColdFire compiler/binutils unavailable')
    def test_mcf54455_bridge_symbols_are_strong_and_default_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            obj = Path(tmp) / 'closed-policy.o'
            result = subprocess.run(['m68k-elf-gcc', '-mcpu=54455', '-Os', '-Wall', '-Wextra', '-Werror',
                '-ffreestanding', '-fno-builtin', '-I' + str(RESIDENT), '-c', str(POLICY / 'controller_policy.c'), '-o', str(obj)],
                capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            symbols = subprocess.run(['m68k-elf-nm', str(obj)], capture_output=True, text=True, check=True).stdout
            for name in ('modwerk_controller_policy_entries', 'modwerk_stock_hook_buffer_policy',
                         'modwerk_stock_hook_fixed_ranges_idle'):
                self.assertRegex(symbols, r'(?m)^[0-9a-f]+ T ' + name + r'$')
            self.assertNotIn(' W ', symbols)
            result = subprocess.run(['m68k-elf-gcc', '-mcpu=54455', '-Os', '-Wall', '-Wextra', '-Werror',
                '-ffreestanding', '-fno-builtin', '-c', str(POLICY / 'controller_association.c'), '-o', str(obj)],
                capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == '__main__': unittest.main()
