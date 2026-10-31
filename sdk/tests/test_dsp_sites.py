"""The base's DSP site catalogue and data ledger (sdk/machines/octatrack/dsp-sites.json, dsp_sites.py)."""
import copy
import json
import pathlib
import sys
import tempfile
import unittest

HERE = pathlib.Path(__file__).resolve().parents[1] / 'machines/octatrack'
sys.path.insert(0, str(HERE))
import dsp_sites


class DspSites(unittest.TestCase):
    def setUp(self):
        self.reg = dsp_sites.load()

    def test_registry_matches_manifests_resident_ranges_and_header(self):
        self.assertEqual(dsp_sites.check(self.reg), [])

    def test_sidechain_holds_the_key_bus_and_the_bus_runs_on_both_cores(self):
        self.assertEqual(dsp_sites.implied(self.reg, 1), 9)
        self.assertEqual(dsp_sites.implied(self.reg, 2 | 4), 6)
        bus = [s for s in dsp_sites.spans(self.reg) if s[0] == 8]
        self.assertEqual(sorted((c, a, w) for _, c, _, a, w in bus),
                         [(0, 0x7e00, 0x200), (0, 0x33dfe, 0x202), (1, 0x7e00, 0x200), (1, 0x3bdfe, 0x202)])
        header = dsp_sites.header(self.reg)
        self.assertIn('#define MW_DSP_IMPLIED(f) ((f) | ((f) & 1u ? 8u : 0u))', header)
        self.assertIn('#define MW_DSP_KEYBUS 8u', header)

    def test_the_bus_sits_inside_what_sidechain_always_claimed(self):
        # Sidechain stays byte-identical: splitting the bus out must not widen what a held Sidechain owns.
        spans = dsp_sites.spans(self.reg)
        for _, core, space, address, words in (s for s in spans if s[0] == 8):
            self.assertTrue(any(f == 1 and c == core and sp == space and a <= address and address + words <= a + w
                                for f, c, sp, a, w in spans))

    def test_a_changed_guard_or_address_is_refused(self):
        reg = copy.deepcopy(self.reg)
        reg['sites'][0]['guardSha256'] = '0' * 64
        reg['sites'][3]['A'] = '0x00258'
        problems = dsp_sites.check(reg)
        self.assertTrue(any('guard' in p for p in problems) and any('payload A' in p for p in problems))

    def test_malformed_registries_are_refused(self):
        for mutate in (lambda r: r['sites'][1].update(index=7),
                       lambda r: r['sites'][0].update(kind='chain'),
                       lambda r: r['features'][3].update(bit=16),
                       lambda r: r['regions'][0].update(shared=True),
                       lambda r: r['regions'][1].update(start='0x7f00')):
            reg = copy.deepcopy(self.reg)
            mutate(reg)
            with tempfile.TemporaryDirectory() as d, self.subTest():
                path = pathlib.Path(d) / 'dsp-sites.json'
                path.write_text(json.dumps(reg))
                with self.assertRaises(ValueError):
                    dsp_sites.load(path)


if __name__ == '__main__':
    unittest.main()
