# SPDX-License-Identifier: GPL-3.0-or-later
"""The base keeps another base's saved set but for the modules linked to one base: modset.c knows every one of them."""
import json
from pathlib import Path
import re
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.append(str(ROOT / 'sdk/machines/octatrack/module-adapters'))
sys.path.append(str(ROOT / 'sdk/runtime/loader'))
import base_bound  # noqa: E402
import build  # noqa: E402

MANIFEST = json.loads((ROOT / 'src/engine/assets/octatrack-module-packages.json').read_text())
SOURCE = (ROOT / 'sdk/machines/octatrack/elekloader/modset.c').read_text()
LISTED = {int(x, 16) for x in re.findall(r'0x([0-9a-f]{8})u, /\*', SOURCE[SOURCE.index('base_bound[] = {'):SOURCE.index('static unsigned foreign;')])}


class BaseBoundSet(unittest.TestCase):
    def test_every_package_linked_to_a_base_is_left_out_of_another_bases_set(self):
        # A package names its module at byte 28 (ABI 4 on); the published file is what a card holds.
        linked = [*MANIFEST['packages'], *MANIFEST['usbAudio'].values()]
        linked = [entry for entry in linked if entry.get('requiredBase')]
        self.assertTrue(linked)
        for entry in linked:
            with self.subTest(entry['path']):
                package = (ROOT / 'public' / entry['path']).read_bytes()
                self.assertIn(int.from_bytes(package[28:32], 'big'), LISTED,
                              'Add the module id to base_bound[] in modset.c: a base update would load this package on a base it was not linked for.')
        for name in base_bound.MODULES:
            self.assertIn(build.module_id(name), LISTED, name)


if __name__ == '__main__':
    unittest.main()
