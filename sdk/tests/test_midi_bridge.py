"""scripts/octatrack-midi-bridge.py's line answers, without MIDI: 'ping' checks the output and reopens a stale one, and a
send that fails reopens it once (a bridge left from before a power cycle refused every message, 20 November 2026)."""
import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('octatrack_midi_bridge', ROOT / 'scripts/octatrack-midi-bridge.py')
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


class Output:
    """An output whose handle goes stale after `stale_after` sends, and that reopens unless `gone`."""

    def __init__(self, alive=True, gone=False, stale_after=None):
        self.opened, self.live, self.gone, self.stale_after = 'Elektron Octatrack', alive, gone, stale_after
        self.sent, self.reopened = [], 0

    def alive(self):
        return self.live

    def reopen(self):
        if self.gone:
            raise SystemExit('No MIDI output named like \'Octatrack\': none')
        self.reopened += 1
        self.live, self.stale_after = True, None

    def send(self, data):
        if not self.live or (self.stale_after is not None and len(self.sent) >= self.stale_after):
            self.live = False
            raise OSError('midiOutShortMsg refused %s' % data.hex())
        self.sent.append(data)


class Answers(unittest.TestCase):
    def test_ping_answers_with_the_output_and_reopens_a_stale_one(self):
        out = Output()
        self.assertEqual(bridge.answer(out, 'ping\n'), 'ok 0 Elektron Octatrack\n')
        self.assertEqual(out.reopened, 0)
        stale = Output(alive=False)
        self.assertEqual(bridge.answer(stale, 'ping\n'), 'ok 0 Elektron Octatrack\n')
        self.assertEqual(stale.reopened, 1)

    def test_ping_says_so_when_the_unit_is_gone(self):
        self.assertTrue(bridge.answer(Output(alive=False, gone=True), 'ping\n').startswith('error: No MIDI output'))

    def test_a_failed_send_reopens_the_output_once_and_sends_again(self):
        out = Output(stale_after=1)
        self.assertEqual(bridge.answer(out, 'c003 fa\n'), 'ok 2\n')
        self.assertEqual(out.sent, [b'\xc0\x03', b'\xfa'])
        self.assertEqual(out.reopened, 1)
        self.assertTrue(bridge.answer(Output(alive=False, gone=True), 'fa\n').startswith('error:'))

    def test_words_that_are_not_short_midi_are_refused_as_before(self):
        self.assertTrue(bridge.answer(Output(), 'f07e\n').startswith('error: not a short MIDI message'))


if __name__ == '__main__':
    unittest.main()
