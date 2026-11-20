# SPDX-License-Identifier: GPL-3.0-or-later
"""PROJ > MODWERK > SETTINGS (elekloader/settings.c, events.json ot_settings)."""
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OT = ROOT / 'sdk/machines/octatrack'
sys.path.insert(0, str(OT))
import events  # noqa: E402
from host_flags import SANITIZE  # noqa: E402


class Settings(unittest.TestCase):
    def test_rows_kept_choices_and_their_application(self):
        cc = shutil.which('cc') or shutil.which('gcc')
        if not cc:
            self.skipTest('no host C compiler')
        with tempfile.TemporaryDirectory() as temp:
            subprocess.run([cc, '-std=c11', '-Wall', '-Wextra', '-Werror', *SANITIZE, '-I', str(OT / 'include'),
                            '-I', str(OT / 'elekloader'), str(OT / 'elekloader/test_settings.c'), '-o', temp + '/t'], check=True)
            result = subprocess.run([temp + '/t'], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn('settings: rows, kept choices and their application pass', result.stdout)

    def test_the_table_and_its_store_are_declared(self):
        table = next(e for e in events.load()['events'] if e['event'] == 'ot_settings')
        self.assertEqual((table['kind'], table['record'], table['room']), ('table', 24, 8))
        source = (OT / 'elekloader/settings.c').read_text()
        self.assertIn('#define MODWERK_SETTINGS_ROOM 8u', (OT / 'elekloader/settings.h').read_text())
        self.assertIn('0x100f9000u', source)
        ranges = json.loads((OT / 'battery-ram.json').read_text())['ranges']
        mine = [r for r in ranges if 'settings.c' in r['what']]
        self.assertEqual([(r['from'], r['to'], r['owner']) for r in mine], [('0x100f9000', '0x100f9044', 'base')])  # 4 + 8 * 8 bytes


if __name__ == '__main__':
    unittest.main()
