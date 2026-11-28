"""Exact compiled-input service metadata; no DSP or controller execution."""
import hashlib
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest

ADAPTERS = Path(__file__).resolve().parents[1] / 'machines/octatrack/module-adapters'
sys.path.insert(0, str(ADAPTERS))
spec = importlib.util.spec_from_file_location('service_binding', ADAPTERS / 'base_bound.py')
binding = importlib.util.module_from_spec(spec)
spec.loader.exec_module(binding)


class BaseServiceBinding(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.build = Path(self.temp.name)
        (self.build / 'source').mkdir()

    def source(self, expression):
        root = self.build / 'source'
        (root / 'resident_engines.c').write_text(
            'unsigned modwerk_machine_dsp_features(void) { return ' + expression + '; }\n')
        (root / 'dsp_ledger.h').write_text('#define MW_DSP_KEYBUS 8u\n#define MW_DSP_TRACK_PROCESSOR 16u\n#define MW_DSP_FEATURES 31u\n')
        sources = {'sdk/machines/octatrack/module-adapters/resident-runtime/' + name:
                   hashlib.sha256((root / name).read_bytes()).hexdigest()
                   for name in ('resident_engines.c', 'dsp_ledger.h')}
        (self.build / 'proofs.json').write_text(json.dumps(dict(sources=sources)))

    def test_absent_legacy_and_returning_services(self):
        self.assertEqual(binding.provided_dsp_features(self.build), 0)
        self.source('MW_DSP_KEYBUS')
        self.assertEqual(binding.provided_dsp_features(self.build), 8)
        self.source('MW_DSP_KEYBUS | MW_DSP_TRACK_PROCESSOR')
        self.assertEqual(binding.provided_dsp_features(self.build), 24)

    def test_unknown_or_changed_implementation_is_not_guessed(self):
        for expression in ('unknown_service', 'read_hardware()', 'MW_DSP_KEYBUS + MW_DSP_TRACK_PROCESSOR'):
            self.source(expression)
            with self.assertRaises(ValueError):
                binding.provided_dsp_features(self.build)

    def test_c_and_ledger_tampering_fail_closed(self):
        for name in ('resident_engines.c', 'dsp_ledger.h'):
            self.source('MW_DSP_KEYBUS')
            path = self.build / 'source' / name
            path.write_text(path.read_text() + '\n/* changed after compilation */\n')
            with self.assertRaisesRegex(ValueError, 'build proof'):
                binding.provided_dsp_features(self.build)

    def test_legacy_binding_and_invalid_new_masks(self):
        legacy = dict(schema=1, identity='a' * 64, arena=0, pool=0, symbols={}, controllers={})
        self.assertEqual(binding.load(legacy), legacy)
        for value in (-1, 65536, True, '24'):
            with self.assertRaises(ValueError):
                binding.load(dict(legacy, dspFeatures=value))

    def test_conditional_program_areas_do_not_change_ledger_services(self):
        self.source('MW_DSP_KEYBUS | MW_DSP_TRACK_PROCESSOR')
        root = self.build / 'source'
        header = root / 'resident_engines.h'
        header.write_text('#define MW_DSP_PROGRAMS 0x100u\n')
        source = root / 'resident_engines.c'
        source.write_text('#ifdef MODWERK_RUNTIME_EVENTS\n'
            'unsigned modwerk_machine_dsp_features(void) { return MW_DSP_KEYBUS | MW_DSP_TRACK_PROCESSOR | MW_DSP_PROGRAMS; }\n'
            '#else\nunsigned modwerk_machine_dsp_features(void) { return MW_DSP_KEYBUS | MW_DSP_TRACK_PROCESSOR; }\n#endif\n')
        def pin():
            path = self.build / 'proofs.json'
            proof = json.loads(path.read_text())
            for name in ('resident_engines.c', 'resident_engines.h'):
                proof['sources']['sdk/machines/octatrack/module-adapters/resident-runtime/' + name] = hashlib.sha256((root / name).read_bytes()).hexdigest()
            path.write_text(json.dumps(proof))
        pin()
        self.assertEqual(binding.provided_dsp_features(self.build), 24)
        header.write_text(header.read_text() + '/* unrecorded change */\n')
        with self.assertRaisesRegex(ValueError, 'build proof'):
            binding.provided_dsp_features(self.build)
        pin()
        source.write_text(source.read_text().replace('MW_DSP_KEYBUS | MW_DSP_TRACK_PROCESSOR; }', 'MW_DSP_KEYBUS; }'))
        pin()
        with self.assertRaisesRegex(ValueError, 'conditional ledger'):
            binding.provided_dsp_features(self.build)


if __name__ == '__main__':
    unittest.main()
