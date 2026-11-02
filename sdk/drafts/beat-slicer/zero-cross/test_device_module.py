# SPDX-License-Identifier: MIT
"""Beat Slicer client checks against the proposed shared sample-editor API."""
from pathlib import Path
import json
import hashlib
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[3]
ADAPTERS = ROOT / 'sdk/machines/octatrack/module-adapters'
sys.path.insert(0, str(ROOT / 'sdk/tests'))
from host_flags import SANITIZE


class DeviceModule(unittest.TestCase):
    @unittest.skipUnless(shutil.which('cc'), 'host C compiler unavailable')
    def test_actual_controller_with_shared_service(self):
        with tempfile.TemporaryDirectory() as folder:
            executable = Path(folder) / 'fixture'
            # Run an uncached renderer beside the cached controller through every
            # input in the fixture. Pixel equality catches missed invalidations.
            fixture = Path(folder) / 'fixture.c'
            original = (HERE / 'test_device_module.c').read_text()
            original = original.replace('module_draw', 'checked_module_draw')
            # Add a read-only uncached entry to the same controller for pixel
            # comparison; running a second controller would duplicate writes.
            oracle = Path(folder) / 'oracle.c'
            oracle_source = (HERE / 'device_module.c').read_text()
            oracle_source += r'''
void bs_uncached_draw(unsigned char *frame) {
    if(!active || !frame)return;
    unsigned char picture[1024],mask[1024];
    render_popup(picture,mask);
    const unsigned char *home=bs_device_home();
    for(unsigned i=0;i<1024u;++i)
        frame[i]=(unsigned char)((home[i]&~mask[i])|(picture[i]&mask[i]));
}
'''
            oracle_source = oracle_source.replace('#include "', '#include "' + str(HERE) + '/')
            oracle.write_text(oracle_source)
            fixture.write_text(original + r'''
#include <stdlib.h>
void module_draw(unsigned char *);
void bs_uncached_draw(unsigned char *);
void checked_module_draw(unsigned char *frame) {
    if(!frame){module_draw(frame);return;}
    unsigned char expected[1024];memcpy(expected,frame,sizeof expected);
    unsigned saved=renders;bs_uncached_draw(expected);renders=saved;
    module_draw(frame);
    if(memcmp(expected,frame,sizeof expected))abort();
}
''')
            sources = [ADAPTERS / 'sample_editor_service.c', fixture, oracle, HERE / 'grid_preview.c']
            # Count popup builds using explicit portable UI stand-ins; exact native UI
            # pixels and writes are checked separately against the stock CPU renderer.
            font = Path(folder) / 'font.o'
            subprocess.run([shutil.which('cc'), '-std=c99', *SANITIZE,
                            '-Dbs_device_popup=bs_uncounted_popup', '-c',
                            str(HERE / 'test_ui_host.c'), '-o', str(font)], check=True)
            result = subprocess.run([
                shutil.which('cc'), '-std=c99', '-Wall', '-Wextra', '-Werror', *SANITIZE,
                *[flag for directory in (ROOT / 'sdk/runtime/loader', ROOT / 'sdk/runtime/upload',
                                         ROOT / 'sdk/machines/octatrack/include',
                                         ROOT / 'sdk/machines/octatrack/elekloader', ADAPTERS)
                  for flag in ('-I', str(directory))],
                *map(str, sources), str(font), '-o', str(executable),
            ], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            result = subprocess.run([str(executable)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn('PASS:', result.stdout)

    @unittest.skipUnless(shutil.which('m68k-elf-gcc'), 'ColdFire compiler unavailable')
    def test_actual_package_descriptor_alignment(self):
        with tempfile.TemporaryDirectory() as folder:
            package = Path(folder) / 'beat-slicer.mwrm'
            subprocess.run([sys.executable, '-B', str(ROOT / 'sdk/runtime/loader/build.py'),
                            *[str(HERE / name) for name in ('device_module.c', 'device_font.c', 'grid_preview.c')],
                            '--subscribe', 'ot_sample_editor_actions:bs_sample_action:50',
                            '-o', str(package)], check=True, capture_output=True)
            data = package.read_bytes()
        receipt = json.loads((HERE / 'build.json').read_text())
        self.assertEqual(hashlib.sha256(data).hexdigest(), receipt['packageSha256'])
        self.assertEqual(len(data), receipt['packageBytes'])
        for name, digest in receipt['sourceSha256'].items():
            self.assertEqual(hashlib.sha256((HERE / name).read_bytes()).hexdigest(), digest)
        events = json.loads((ROOT / 'sdk/machines/octatrack/events.json').read_text())['events']
        index = next(event['index'] for event in events if event['event'] == 'ot_sample_editor_actions')
        image_bytes, _, _, hooks = struct.unpack_from('>4I', data, 8)
        self.assertEqual(hooks, index + 1)
        at = struct.unpack_from('>I', data, 76 + index * 4)[0] & 0xffffff
        image = data[76 + hooks * 4:76 + hooks * 4 + image_bytes]
        self.assertEqual(at % 4, 0)
        self.assertLessEqual(at + 64, len(image))
        abi, size, action, flags, entry = struct.unpack_from('>5I', image, at)
        self.assertEqual((abi, size, action, flags), (1, 64, 0x446c151d, 0))
        self.assertEqual(entry % 2, 0)
        self.assertLess(entry + 1, len(image))
        self.assertFalse(at <= entry < at + 64)


if __name__ == '__main__':
    unittest.main()
