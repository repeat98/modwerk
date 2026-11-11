# SPDX-License-Identifier: MIT
"""Units a module lists in placement.json join the DRAM runtime only when another selected module carries one."""
import json
import os
from pathlib import Path
import sys
import unittest

OCTABAM = Path(__file__).resolve().parents[1] / 'octabam'


class RuntimeJoinTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._cwd = os.getcwd()
        os.chdir(OCTABAM)  # manifests name their sources relative to the octabam root
        sys.path[:0] = [str(OCTABAM / 'tools'), str(OCTABAM / 'tools/build')]
        from remix import machine_composition, registry
        import runtime_join
        cls.mc, cls.join, cls.known = machine_composition, runtime_join, registry.modules()
        cls.keys = {m.name: k for k, m in cls.known.items()}

    @classmethod
    def tearDownClass(cls):
        os.chdir(cls._cwd)

    def placement(self, ids):
        keys = [self.keys[i] for i in ids]
        composed = self.join.join_map(self.mc.compose_map(self.known, keys), keys)
        return {u.label: u.dram for u in composed[self.keys['sidechain-compressor']].linked}

    def test_rules_name_linked_units(self):
        for path in sorted((OCTABAM / 'modules').glob('*/placement.json')):
            rule = json.loads(path.read_text())
            self.assertEqual(self.join.JOIN[path.parent.name], tuple(rule['joinRuntime']))
            linked = {u.label for u in self.known[self.keys[path.parent.name]].linked}
            self.assertLessEqual(set(rule['joinRuntime']), linked)

    def test_cave_without_another_runtime(self):
        for ids in (['sidechain-compressor'], ['sidechain-compressor', 'mute-modes'], ['sidechain-compressor', 'repitch']):
            self.assertEqual(self.placement(ids), {'sc_cf': False, 'sc_ui': False}, ids)

    def test_dram_beside_a_runtime(self):
        for ids in (['tapeecho', 'sidechain-compressor'], ['synth', 'sidechain-compressor', 'mute-modes'], ['sidechain-compressor', 'playmodes']):
            self.assertEqual(self.placement(ids), {'sc_cf': True, 'sc_ui': True}, ids)

    def test_registry_declaration_unchanged(self):
        self.placement(['tapeecho', 'sidechain-compressor'])
        self.assertTrue(all(not u.dram for u in self.known[self.keys['sidechain-compressor']].linked))


if __name__ == '__main__':
    unittest.main()
