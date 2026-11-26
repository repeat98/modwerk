# SPDX-License-Identifier: GPL-3.0-or-later
"""scripts/octatrack-preflight.py against a fake session and a fake MIDI bridge: what it finds, and that it only reads."""
import importlib.util
import pathlib
import socket
import sys
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('octatrack_preflight', ROOT / 'scripts/octatrack-preflight.py')
preflight = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preflight)
qualify = preflight.qualify

BANK_BASE = 0x46d00000


class Unit:
    """A session's answers: `state`, and `mem:` reads of the bank and pattern, the Part number, the bank pointer and trig masks."""

    def __init__(self, state='stopped', bank=2, pattern=0, part=0, busy=8, equal=True):
        self.state, self.bank, self.pattern, self.part, self.busy, self.equal, self.sent = state, bank, pattern, part, busy, equal, []

    def send(self, sequence):
        self.sent.append(sequence)
        if sequence == 'state': return self.state + '\n'
        raise AssertionError('not a read the preflight makes: ' + sequence)

    def mem(self, addr, n):
        self.sent.append('mem:%#x:%d' % (addr, n))
        if addr == preflight.CURRENT: return bytes([self.bank, self.pattern])
        if addr == qualify.PART: return bytes([self.part])
        if addr == qualify.BANK: return BANK_BASE.to_bytes(4, 'big')
        track = (addr - BANK_BASE - self.pattern * preflight.PATTERN) // preflight.TRACK
        return bytes([0x11] * 8) if track < self.busy else bytes(8)

    def __enter__(self):
        self.patches = [mock.patch.object(qualify, 'send', self.send), mock.patch.object(qualify, 'mem', self.mem),
                        mock.patch.object(qualify, 'part_saved_equal', lambda: self.equal)]
        for p in self.patches: p.start()
        return self

    def __exit__(self, *a):
        for p in self.patches: p.stop()


class Preflight(unittest.TestCase):
    def test_a_ready_unit_passes_with_reads_only(self):
        with Unit(pattern=1, busy=0) as unit:
            self.assertEqual(preflight.unit_problems(pick=2), [])
        self.assertTrue(all(s == 'state' or s.startswith('mem:') for s in unit.sent))

    def test_a_flashed_release_base_is_told_apart_from_no_session(self):
        refused = RuntimeError('state: error: This base does not answer development requests: build it with --dev.')
        with mock.patch.object(qualify, 'send', side_effect=refused):
            [problem] = preflight.unit_problems(pick=2)
        self.assertIn('does not answer development requests', problem)
        self.assertIn('npm run device -- boot DIR', problem)
        with mock.patch.object(qualify, 'send', side_effect=FileNotFoundError(2, 'No such file')):
            [problem] = preflight.unit_problems()
        self.assertIn('no session answers on', problem)

    def test_a_playing_transport_and_a_changed_part_are_both_named(self):
        with Unit(state='playing', part=2, equal=False, busy=0):
            problems = preflight.unit_problems(pick=2)
        self.assertEqual(len(problems), 2)
        self.assertIn('the transport plays', problems[0])
        self.assertIn('Part 3 of bank C differs from its saved copy', problems[1])

    def test_a_busy_pattern_fails_unless_it_is_the_pick_pattern(self):
        # 25 November 2026: C01 with all eight tracks playing refused the pick (CPU FULL); the empty pattern 2 took it.
        with Unit(bank=2, pattern=0, busy=8):
            [problem] = preflight.unit_problems(pick=2)
        self.assertIn('pattern C01 has trigs on 8 tracks', problem)
        self.assertIn('PATTERN+TRIG2', problem)
        with Unit(bank=2, pattern=1, busy=8):
            self.assertEqual(preflight.unit_problems(pick=2), [])  # on the pick pattern: the caller chose it
        with Unit(bank=2, pattern=0, busy=6):
            self.assertEqual(preflight.unit_problems(pick=2), [])  # the medium pattern's six tracks have room
        with Unit(bank=2, pattern=0, busy=8):
            self.assertEqual(preflight.unit_problems(), [])  # a base: no picks on the current pattern

    def test_the_midi_bridge_must_answer_and_send(self):
        class Link:
            def __init__(self, reply): self.reply, self.sent = reply, b''
            def settimeout(self, s): pass
            def sendall(self, data): self.sent += data
            def makefile(self):
                import io
                return io.StringIO(self.reply)
            def close(self): pass

        ok = Link('ok 1\n')
        self.assertIsNone(preflight.midi_problem('127.0.0.1:50124', connect=lambda *a: ok))
        self.assertEqual(ok.sent, b'f6\n')  # a tune request: nothing the unit acts on
        refused = preflight.midi_problem('127.0.0.1:50124', connect=lambda *a: Link('error: midiOutShortMsg refused f6\n'))
        self.assertIn('cannot send: error: midiOutShortMsg refused f6', refused)
        self.assertIn('octatrack-midi-bridge.py 50124', refused)

        def absent(*a): raise ConnectionRefusedError(111, 'Connection refused')
        self.assertIn('no MIDI bridge on 127.0.0.1:50124', preflight.midi_problem('127.0.0.1:50124', connect=absent))

    def test_it_prints_one_line_a_problem_and_exits_1(self):
        with Unit(state='playing', busy=0), mock.patch.object(sys, 'argv', ['octatrack-preflight.py', '--midi', '127.0.0.1:1']), \
                mock.patch.object(preflight, 'midi_problem', return_value='no MIDI bridge on 127.0.0.1:1'), \
                mock.patch('builtins.print') as printed:
            with self.assertRaises(SystemExit) as c: preflight.main()
        self.assertEqual(c.exception.code, 1)
        self.assertEqual([call.args[0] for call in printed.call_args_list],
                         ['preflight: the transport plays: stop it (`npm run device -- do STOP`)', 'preflight: no MIDI bridge on 127.0.0.1:1'])


if __name__ == '__main__':
    unittest.main()
