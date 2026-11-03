# SPDX-License-Identifier: GPL-3.0-or-later
"""Packages bound to the published base rebuild from source and its committed binding, and refuse any other base."""
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.append(str(ROOT / 'sdk/machines/octatrack/module-adapters'))
import base_bound  # noqa: E402
import stock_hook_controllers  # noqa: E402

UPSTREAM = Path.home() / '.cache/modwerk-upstream/elekloader'
TOOLS = bool(shutil.which('m68k-elf-as')) and (UPSTREAM / 'elekloader/sdk/octabam.py').is_file() and \
    bool(os.environ.get('ELEKLOADER_DSP_ASM') or shutil.which('dsp_asm') or base_bound.DSP_ASM.is_file())  # Analog BD's engine
MANIFEST = json.loads((ROOT / 'src/engine/assets/octatrack-module-packages.json').read_text())


class BaseBound(unittest.TestCase):
    def setUp(self):
        self.binding = base_bound.load()
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)

    def test_the_manifest_binds_exactly_its_base_bound_entries_to_the_published_base(self):
        bound = [entry for entry in MANIFEST['packages'] if entry.get('base')]
        self.assertEqual(sorted(entry['id'] for entry in bound), sorted(base_bound.MODULES))
        self.assertTrue(all(entry['requiredBase'] == self.binding['identity'] for entry in bound))
        self.assertTrue(all('requiredBase' not in entry for entry in MANIFEST['packages'] if not entry.get('base')))
        # The base's trust rows name exactly the published controllers, by what is not DSP in their packages.
        published = {entry['id']: stock_hook_controllers.controller_sha256((ROOT / 'public' / entry['path']).read_bytes())
                     for entry in bound}
        self.assertEqual(self.binding['controllers'], {name: published[name] for name in self.binding['controllers']})
        rows = json.loads(base_bound.POLICIES.read_text())
        self.assertEqual({row['module']: row['controllerSha256'] for row in rows}, self.binding['controllers'])

    def test_a_malformed_binding_or_an_unknown_module_is_refused(self):
        for broken in ({}, dict(self.binding, schema=2), dict(self.binding, identity='00'),
                       dict(self.binding, arena='0x0'), dict(self.binding, controllers=[])):
            with self.subTest(broken=broken), self.assertRaises(ValueError):
                base_bound.load(broken)
        with self.assertRaises(ValueError):
            base_bound.build('everb', UPSTREAM, Path(self.temp.name) / 'work', binding=self.binding)

    @unittest.skipUnless(TOOLS, 'needs m68k-elf binutils, the Elekloader checkout and dsp_asm')
    def test_each_package_rebuilds_identically_and_a_controller_needs_its_trust_row(self):
        for entry in (entry for entry in MANIFEST['packages'] if entry.get('base')):
            with self.subTest(module=entry['id']):
                data, identity = base_bound.build(entry['id'], UPSTREAM, Path(self.temp.name) / entry['id'],
                                                  binding=self.binding)
                self.assertEqual(data, (ROOT / 'public' / entry['path']).read_bytes())
                self.assertEqual(identity, entry['requiredBase'])
        other = dict(self.binding, controllers=dict(self.binding['controllers'], **{'output-matrix': '0' * 64}))
        with self.assertRaisesRegex(ValueError, 'trust row'):
            base_bound.build('output-matrix', UPSTREAM, Path(self.temp.name) / 'other', binding=other)


if __name__ == '__main__':
    unittest.main()
