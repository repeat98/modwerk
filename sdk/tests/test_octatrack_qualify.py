"""scripts/octatrack-qualify.py's parts that never touch a unit: the Keep guard and the TESTING.md entry."""
import importlib.util
import pathlib
import sys
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('octatrack_qualify', ROOT / 'scripts/octatrack-qualify.py')
qualify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qualify)


class Qualify(unittest.TestCase):
    def test_it_starts_only_once_the_keeps_are_acknowledged(self):
        with mock.patch.object(sys, 'argv', ['octatrack-qualify.py', 'x.mwrm']), mock.patch.object(qualify, 'send', side_effect=AssertionError('reached the unit')):
            with self.assertRaises(SystemExit) as c: qualify.main()
        self.assertIn('--keeps-ok', str(c.exception))

    def test_it_finds_the_chooser_name_of_a_package(self):
        names = ['FILTER', 'SPECTRUM79', 'RINGMOD_SC', 'BBD_DELAY']
        self.assertEqual(qualify.chooser_name(names, 'BBD Delay'), 'BBD_DELAY')
        self.assertEqual(qualify.chooser_name(names, 'Spectrum'), 'SPECTRUM79')
        self.assertEqual(qualify.chooser_name(names, 'SC Ringmod'), 'RINGMOD_SC')  # the words in another order
        self.assertEqual(qualify.chooser_name(names, 'Mini Verb'), 'MINI_VERB')  # not listed: as the package says

    def test_the_entry_says_what_ran_and_what_it_leaves_out(self):
        reading = dict(cpu=40, core1=300, core1_peak=420, core0=0, core0_peak=0, admit_ms=180)
        result = dict(args=['--keeps-ok', 'everb.mwrm'], crash=False, failures=[], parts=[2, 3, 4, 1, -2],
                      packages=[dict(file='0.1.2-experimental.mwrm', name='E-Verb', sha256='5f' * 32)],
                      modules=[dict(name='E-VERB', slot='FX2', T1=reading, T5='refused')],
                      together=dict(reading, placed=['E-VERB', None]), soak=[reading, dict(reading, core0_peak=510)])
        entry = qualify.testing_entry(result, '2026-11-08')
        self.assertIn('### Qualification run, 2026-11-08', entry)
        self.assertIn('Package `0.1.2-experimental.mwrm`, E-Verb, SHA-256 `' + '5f' * 32 + '`', entry)
        self.assertIn('E-VERB on FX2 alone: T1 peak 420 per mille of a frame, admitted in 180 ms, T5 refused', entry)
        self.assertIn('All at once, playing (E-VERB, refused)', entry)
        self.assertIn('Part switches: 4 of 5', entry)
        self.assertIn('Soak: 20 s, highest core peak 510', entry)
        self.assertIn('Crash test: not run', entry)
        self.assertIn('Result: passed', entry)
        self.assertIn('Not covered by this run: listening to the sound', entry)
        self.assertIn('Result: failed: frames stopped', qualify.testing_entry(dict(result, failures=['frames stopped (soak)']), '2026-11-08'))


if __name__ == '__main__':
    unittest.main()
