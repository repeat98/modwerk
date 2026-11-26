# SPDX-License-Identifier: GPL-3.0-or-later
"""A base update must admit every side of the Mute Modes 0.2.2 → 0.2.3 → 0.2.4 upgrades."""
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
MACHINE = ROOT / 'sdk/machines/octatrack'
spec = importlib.util.spec_from_file_location('mute_upgrade_core', MACHINE / 'elekloader/build_core.py')
core = importlib.util.module_from_spec(spec)
spec.loader.exec_module(core)


class MuteModesTableUpgrade(unittest.TestCase):
    def test_every_reviewed_package_keeps_their_own_table_offsets(self):
        owners = MACHINE / 'module-adapters/table-owners.json'
        _, table, inputs = core.reviewed_table_owners(owners)
        import table_declarations as declarations
        records = {}
        for index in range(table[5]):
            offset = declarations.HEADER + index * declarations.RECORD
            record = table[offset:offset + declarations.RECORD]
            records[record[:32].hex()] = [int.from_bytes(record[i:i + 4], 'big') for i in (44, 48, 52)]
        self.assertEqual(records['d8b871e39733ca38101c5fc42b37f3984c38a577eab393d85e3f3a6fa1f1dd00'], [1332, 1400, 1468])
        self.assertEqual(records['d460c7e2e4b44bffd61d5a76eae1bfbfcef8f8b497c9c37cbdfb48612f537cdc'], [1388, 1456, 1524])
        self.assertEqual(records['7542f10c56b431761bdd9b4f44a7a3ccb6d4851f31e2c4bb519281dd5d0b6b8c'], [1412, 1480, 1548])
        for entry in json.loads(owners.read_text())['owners']:
            if entry['module'] == 'mute-modes':
                declaration = json.loads((ROOT / entry['declaration']).read_text())
                for source, digest in declaration['sources'].items():
                    self.assertEqual(inputs[entry['sourceRoot'] + '/' + source], digest)


if __name__ == '__main__':
    unittest.main()
