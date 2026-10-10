# SPDX-License-Identifier: GPL-3.0-or-later
"""The machine-neutral runtime module loader (sdk/runtime/loader): its C host
test, the builder's relocation finder and, with a ColdFire cross compiler, a
real module build. No firmware or device."""
import importlib.util
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
LOADER = ROOT / 'sdk/runtime/loader'
spec = importlib.util.spec_from_file_location('runtime_loader_build', LOADER / 'build.py')
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class LoaderTests(unittest.TestCase):
    def test_loader_on_the_host(self):
        cc = shutil.which('cc')
        if not cc:
            self.skipTest('no host C compiler')
        with tempfile.TemporaryDirectory() as temp:
            subprocess.run([cc, '-std=c99', '-Wall', '-Wextra', '-Werror', '-pedantic', '-I', LOADER,
                            '-I', ROOT / 'sdk/runtime/upload', LOADER / 'tests/host_test.c', '-o', temp + '/t'],
                           check=True, capture_output=True)
            result = subprocess.run([temp + '/t'], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_relocations_are_the_words_that_move_with_the_link_address(self):
        low = struct.pack('>HIHI', 0x4e71, 0x10, 0x4e75, 0x40001e50)  # a self-reference, then a stock address
        high = struct.pack('>HIHI', 0x4e71, 0x10010, 0x4e75, 0x40001e50)
        self.assertEqual(build.relocations(low, high, 0x20), [2])
        with self.assertRaisesRegex(ValueError, 'outside'):
            build.relocations(low, high, 0x10)
        with self.assertRaisesRegex(ValueError, 'cannot relocate'):  # e.g. a 16-bit reference
            build.relocations(low, struct.pack('>HIHI', 0x4e71, 0x10, 0x4e75, 0x40001e51), 0x20)

    def test_package_layout(self):
        data = build.package(b'\x4e\x75\0\0', 8, [0, build.NONE, build.NONE, build.NONE], [0])
        self.assertEqual(data[:24], b'MWRM' + struct.pack('>HHIIII', 2, 0, 4, 8, 1, 4))
        self.assertEqual(len(data), 24 + 16 + 4 + 4)

    def test_builds_the_octatrack_example(self):
        if not shutil.which('m68k-elf-gcc'):
            self.skipTest('no ColdFire cross compiler')
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp) / 'hello.mwrm'
            subprocess.run(['python3', '-B', LOADER / 'build.py', ROOT / 'sdk/machines/octatrack/elekloader/examples/hello.c',
                            '-o', out], check=True, capture_output=True)
            data = out.read_bytes()
        abi, image, bss, count, hooks = struct.unpack_from('>4xH2xIIII', data)
        self.assertEqual((abi, hooks), (2, 4))
        self.assertGreater(count, 0)  # its counters are reached through absolute addresses
        self.assertNotIn(build.NONE, struct.unpack_from('>4I', data, 24))
        self.assertEqual(len(data), 24 + 16 + image + 4 * count)


if __name__ == '__main__':
    unittest.main()
