# SPDX-License-Identifier: GPL-3.0-or-later
"""scripts/octatrack-midi-bridge.py's reopen after a RAM boot, with a fake MIDI system only."""
import importlib.util
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('octatrack_midi_bridge', ROOT / 'scripts/octatrack-midi-bridge.py')
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


class System:
    """MIDI outputs that come and go: `listed` answers names() call by call, each open() makes a port that sends until told."""

    def __init__(self, listed, dead=()):
        self.listed, self.dead, self.ports, self.sent = list(listed), set(dead), [], []

    def names(self): return self.listed.pop(0) if len(self.listed) > 1 else self.listed[0]

    def open(self, name):
        system, number = self, len(self.ports)

        class Port:
            closed = False
            def send(self, data):
                if number in system.dead: raise OSError('midiOutShortMsg refused %s' % data.hex())
                system.sent.append((number, data))
            def close(self): self.closed = True
        self.ports.append(Port())
        return self.ports[-1]


class Bridge(unittest.TestCase):
    def output(self, system):
        self.waits, self.logged = [], []
        return bridge.Output(system, 'Octatrack', wait=self.waits.append, log=lambda *a, **k: self.logged.append(a[0]))

    def test_it_sends_on_the_port_it_opened(self):
        system = System([['Microsoft GS Wavetable Synth', 'Elektron Octatrack']])
        out = self.output(system)
        self.assertEqual(out.opened, 'Elektron Octatrack')
        self.assertEqual(bridge.answer(out, 'c001 fa\n'), 'ok 2\n')
        self.assertEqual(system.sent, [(0, b'\xc0\x01'), (0, b'\xfa')])
        self.assertEqual(out.reopened, 0)

    def test_a_dead_port_is_opened_again_and_the_message_sent_once_more(self):
        # 25 November 2026: after a RAM boot every send answered `midiOutShortMsg refused c001` until the bridge restarted.
        system = System([['Elektron Octatrack']], dead={0})
        out = self.output(system)
        self.assertEqual(bridge.answer(out, 'c001\n'), 'ok 1\n')
        self.assertTrue(system.ports[0].closed)
        self.assertEqual(system.sent, [(1, b'\xc0\x01')])
        self.assertEqual(out.reopened, 1)
        self.assertEqual(self.logged, ['reopened Elektron Octatrack after: midiOutShortMsg refused c001'])
        self.assertEqual(bridge.answer(out, 'fa\n'), 'ok 1\n')  # and it stays on the new port
        self.assertEqual(out.reopened, 1)

    def test_it_waits_for_the_unit_to_come_back_on_usb(self):
        system = System([['Elektron Octatrack'], [], [], ['Elektron Octatrack']], dead={0})
        out = self.output(system)
        self.assertEqual(bridge.answer(out, 'fc\n'), 'ok 1\n')
        self.assertEqual(self.waits, [0.5, 0.5])

    def test_it_answers_an_error_when_the_unit_stays_away_and_tries_again_on_the_next_line(self):
        system = System([['Elektron Octatrack']] + [[]] * 10 + [['Elektron Octatrack']], dead={0})
        out = self.output(system)
        reply = bridge.answer(out, 'c001\n')
        self.assertTrue(reply.startswith('error: midiOutShortMsg refused c001; opening \'Octatrack\' again failed: No MIDI output named like'), reply)
        self.assertEqual(len(self.waits), 10)  # 5 s at most
        self.assertIsNone(out.port)
        self.assertEqual(bridge.answer(out, 'c001\n'), 'ok 1\n')  # back now: the next line reopens it

    def test_a_port_that_fails_again_after_reopening_is_the_answer(self):
        system = System([['Elektron Octatrack']], dead={0, 1})
        out = self.output(system)
        self.assertEqual(bridge.answer(out, 'c001\n'), 'error: midiOutShortMsg refused c001\n')
        self.assertEqual(len(system.ports), 2)  # one retry, not a loop

    def test_a_malformed_line_never_reaches_the_port(self):
        system = System([['Elektron Octatrack']])
        out = self.output(system)
        self.assertEqual(bridge.answer(out, 'f0 7e\n'), 'error: not a short MIDI message: f0\n')
        self.assertEqual(system.sent, [])

    def test_no_output_of_that_name_stops_it_at_the_start(self):
        with self.assertRaises(LookupError):
            self.output(System([['Microsoft GS Wavetable Synth']]))


if __name__ == '__main__':
    unittest.main()
