"""Host checks for CX load-scenarios.json (no unit)."""

import json
import re
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCENARIOS = HERE / "load-scenarios.json"
MACHINE_S = HERE / "standalone/machine.s"


class CxOscLoadScenarios(unittest.TestCase):
    def test_scenarios_file(self):
        self.assertTrue(SCENARIOS.is_file())
        doc = json.loads(SCENARIOS.read_text())
        self.assertEqual(doc["schema"], "cx-osc-load-scenarios-v1")
        self.assertIn("init", doc["presets"])
        self.assertEqual(len(doc["presets"]["init"]["playback"]), 6)
        self.assertEqual(len(doc["presets"]["init"]["setup"]), 6)
        self.assertLessEqual(max(doc["instanceCounts"]["morph_heavy_all"]), doc["morphHeavyMaxTracks"])
        self.assertEqual(max(doc["instanceCounts"]["morph_zero_hot_playback"]), doc["mlFmMax"])

    def test_init_matches_fm_defaults(self):
        if not MACHINE_S.is_file():
            self.skipTest("standalone/machine.s missing")
        text = MACHINE_S.read_text()
        m = re.search(
            r"fm_defaults:\s*\n\s*\.byte\s+([0-9,\s]+)\s*\|\s*PLAYBACK[^\n]*\n\s*\.byte\s+([0-9,\s]+)",
            text,
        )
        self.assertIsNotNone(m, "fm_defaults bytes")
        pb = [int(x.strip()) for x in m.group(1).split(",") if x.strip()]
        sb = [int(x.strip()) for x in m.group(2).split(",") if x.strip()]
        doc = json.loads(SCENARIOS.read_text())["presets"]["init"]
        self.assertEqual(pb, doc["playback"])
        self.assertEqual(sb, doc["setup"])

    def test_morph_heavy_maxes(self):
        doc = json.loads(SCENARIOS.read_text())["presets"]["morph_heavy_all"]
        pb = doc["playback"]
        self.assertEqual(pb[0], 64)
        self.assertEqual(pb[3], 64)
        for i in (1, 2, 4, 5):
            self.assertEqual(pb[i], 127)
        self.assertTrue(all(v == 127 for v in doc["setup"]))


if __name__ == "__main__":
    unittest.main()