"""scripts/octatrack-qualify.py's parts that never touch a unit: the Keep guard, machine packages and their rows, and the
TESTING.md entry."""
import importlib.util
import json
import pathlib
import struct
import sys
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('octatrack_qualify', ROOT / 'scripts/octatrack-qualify.py')
qualify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qualify)


def package(module, sig, label, order, abi=8, voice=0, price=0, dsp=0):
    """A runtime package contributing one struct modwerk_machine to ot_machines, as sdk/runtime/loader/build.py lays it out."""
    record = struct.pack('>I2sBBI', 1, sig, 1, 2, 80) + bytes(64) + bytes([voice, price, 0, 0])
    image = record + label.encode() + b'\0\0\0'
    hooks = [0xffffffff] * (qualify.MACHINES + 1)
    hooks[qualify.MACHINES] = order << 24
    head = struct.pack('>IIIIII', len(image), 0, 0, len(hooks), 0, module) + struct.pack('>I', dsp)
    head = head.ljust(qualify.HEADERS[abi] - 8, b'\0')
    return b'MWRM' + struct.pack('>HH', abi, 0) + head + struct.pack('>%dI' % len(hooks), *hooks) + image


def part(rows):
    """A Part's bytes naming each track's (type, signature)."""
    data = bytearray(6322)
    for t, (kind, sig) in enumerate(rows):
        data[0x22 + t] = kind
        data[qualify.SIG + 30 * t:qualify.SIG + 30 * t + 3] = sig
    return bytes(data)


class Machines(unittest.TestCase):
    def test_it_reads_a_machine_package(self):
        m = qualify.machine(package(0x1234, b'TB', 'ACID 303', 25, abi=10, voice=1, dsp=900))
        self.assertEqual(m, dict(order=25, sig=b'TB', lo=1, hi=2, voice=True, price=0, label='ACID 303'))
        self.assertIsNone(qualify.machine(package(1, b'TB', 'X', 25)[:qualify.HEADERS[8] + 4 * qualify.MACHINES]))

    def test_published_machines_are_found(self):
        found = qualify.published_machines()
        self.assertEqual({m['label'] for m in found.values()} >= {'ANALOG BD', 'POLY8', 'FM SYNTH'}, True)
        self.assertTrue(all(m['order'] < 255 for m in found.values()))

    def rows(self, pkgs, inventory):
        with mock.patch.object(qualify, 'published_machines', return_value={0x700: dict(order=10, sig=b'PL', lo=1, hi=1, label='POLY8')}), \
             mock.patch.object(qualify, 'send', return_value=json.dumps([{'module': '%08x' % m} for m in inventory]) + '\n'):
            return qualify.Machines(pkgs)

    def test_rows_follow_order_then_module_id_and_only_installed_ones(self):
        tb = dict(module=0x20, machine=dict(order=25, sig=b'TB', lo=1, hi=2, label='ACID 303'))
        rows = self.rows([tb], [0x700, 0x99])
        self.assertEqual([m['label'] for m in rows.rows], ['POLY8', 'ACID 303'])
        self.assertEqual(rows.unknown, ['00000099'])
        self.assertEqual([m['label'] for m in self.rows([tb], []).rows], ['ACID 303'])  # POLY8 published, not installed
        p = part([(1, b'TB\x02'), (0, b'PL\x01'), (1, b'TB\x03'), (2, b'\0\0\0'), (4, b'\0\0\0'), (1, b'\0\0\0'), (0, b'\0\0\0'), (3, b'\0\0\0')])
        self.assertEqual([rows.row_of(p, t) for t in range(8)], [6, 5, 1, 2, 4, 1, 0, 3])  # TB 3 is past its versions: FLEX

    def test_a_refusal_and_a_wrong_row_are_told_apart(self):
        tb = dict(module=0x20, machine=dict(order=25, sig=b'TB', lo=1, hi=2, label='ACID 303'))
        rows = self.rows([tb], [0x700])
        sent, parts = [], [part([(1, b'\0\0\0')] * 8)] * 2
        with mock.patch.object(qualify, 'send', side_effect=lambda s: sent.append(s) or ''), \
             mock.patch.object(qualify, 'mem', return_value=b'\0'), mock.patch.object(qualify, 'part_copy', side_effect=lambda *a, **k: parts.pop(0)):
            with self.assertRaisesRegex(RuntimeError, 'ACID 303 refused on T3'): rows.place(2, tb['machine'])
        self.assertIn('T3 w200 FUNC+SRC w300 UP*8 w100 DOWN*6 w100 YES', sent[0])
        self.assertEqual(sent[-1], 'NO w300')
        parts = [part([(1, b'\0\0\0')] * 8), part([(0, b'PL\x01')] * 8)]
        with mock.patch.object(qualify, 'send', return_value=''), mock.patch.object(qualify, 'mem', return_value=b'\0'), \
             mock.patch.object(qualify, 'part_copy', side_effect=lambda *a, **k: parts.pop(0)):
            with self.assertRaisesRegex(RuntimeError, 'row 6 of the machine list was POLY8, not ACID 303'): rows.place(0, tb['machine'])

    def test_the_entry_names_a_machine_and_its_render(self):
        reading = dict(cpu=520, core1=300, core1_peak=610, core0=0, core0_peak=0, render=9.5)
        result = dict(args=['x.mwrm'], crash=False, failures=[], packages=[],
                      modules=[dict(name='ACID 303', slot='SRC', machine=True, T1=reading, T5='refused')],
                      together=dict(reading, placed=[], machines=['ACID 303', None]))
        entry = qualify.testing_entry(result, '2026-11-17')
        self.assertIn('ACID 303 (machine) alone, playing: T1 core peak 610 per mille, CPU 520 per mille, its render peak 9.5 % of a frame, T5 refused', entry)
        self.assertIn('All at once, playing (machines T1-T8: ACID 303, refused)', entry)


class UnitSteps(unittest.TestCase):
    """What the first run on an MKII (20 November 2026) showed the steps must do."""

    def test_a_machine_alone_plays_again_once_its_track_has_its_machine_back(self):
        order = []

        class Rows:
            def row_of(self, part, track): return 1
            def place(self, track, m): order.append('place T%d' % (track + 1))
            def pick(self, track, row): order.append('back T%d' % (track + 1)); return row

        reading = dict(cpu=500, core1=300, core1_peak=400, core0=200, core0_peak=300)
        with mock.patch.object(qualify, 'send', side_effect=lambda s: order.append(s) if s.startswith('PLAY w5000') else ''), \
             mock.patch.object(qualify, 'meters', side_effect=lambda n: dict(reading)), mock.patch.object(qualify, 'renders', return_value=[35.9] * 8), \
             mock.patch.object(qualify, 'EMULATOR', False), \
             mock.patch.object(qualify, 'audition_price', side_effect=[dict(quiet=20, triggered=31, added=11, price=12),
                                                                       dict(quiet=20, triggered=33, added=13, price=12)]), \
             mock.patch.object(qualify, 'part_copy', return_value=bytes(6322)), mock.patch.object(qualify, 'mem', return_value=b'\0'):
            failures = []
            qualify.machine_alone(Rows(), dict(label='POLY8', price=0, voice=False), failures)
        self.assertEqual(order, ['place T1', 'back T1', 'PLAY w5000 STOP w500', 'place T5', 'back T5', 'PLAY w5000 STOP w500'])
        self.assertEqual(failures, ['POLY8 on T5 added 13.0 points of mean frame time, over its 12 % CPU price'])

    def test_matched_auditions_use_the_guard_mean_and_stop_the_voice_on_failure(self):
        quiet = 'frame max 39 %, in the frame interrupt 22.1 % over 16000 frames, skipped 0'
        active = 'frame max 71 %, in the frame interrupt 31.4 % over 16600 frames, skipped 0'
        def send(command):
            return {'w6000 guard': quiet, 'guard': active, 'state': 'stopped'}.get(command, '')
        with mock.patch.object(qualify, 'send', side_effect=send) as panel, \
             mock.patch.object(qualify.time, 'sleep'), mock.patch.object(qualify, 'renders', return_value=[35.9] * 8):
            self.assertEqual(qualify.audition_price(1, 15), dict(quiet=22.1, triggered=31.4, added=9.3, price=15))
            self.assertEqual(panel.call_args, mock.call('T1+STOP w300'))
            with mock.patch.object(qualify, 'renders', return_value=[0] * 8):
                with self.assertRaisesRegex(ValueError, 'no guarded render'):
                    qualify.audition_price(5, 15)
            self.assertEqual(panel.call_args, mock.call('T5+STOP w300'))
        for reply in ('', 'in the frame interrupt 3.3 % over 0 frames'):
            with self.assertRaisesRegex(ValueError, 'no frame mean'):
                qualify.frame_mean(reply)

    def test_the_part_is_saved_before_the_run_and_must_stay_as_it_was(self):
        saved, sent = bytes(range(256)) * 24 + bytes(178), []
        with mock.patch.object(qualify, 'send', side_effect=lambda s: sent.append(s) or ''), \
             mock.patch.object(qualify, 'part_copy', return_value=saved):
            self.assertTrue(qualify.save_part(1, saved))
        # device.mjs's savepart step: SAVE from the Part menu, opened the MKII's or the MKI's way (#2099)
        self.assertEqual(sent[0].split()[-1], 'savepart')
        with mock.patch.object(qualify, 'send', return_value=''), mock.patch.object(qualify, 'part_copy', return_value=bytes(6322)):
            self.assertFalse(qualify.save_part(1, saved))


class Emulator(unittest.TestCase):
    """An ot_emu session: the same cases, the frame checks listed as not run when its frames stand still (20 November 2026)."""

    def clock(self, emulator, counts):
        result, sent = {}, []
        with mock.patch.object(qualify, 'EMULATOR', emulator), mock.patch.object(qualify, 'frames', side_effect=list(counts)), \
             mock.patch.object(qualify, 'send', side_effect=lambda s: sent.append(s) or ''):
            return qualify.frame_clock(result), result, sent

    def test_the_unit_always_runs_the_frame_checks_and_reads_nothing_for_it(self):
        self.assertEqual(self.clock(False, []), (True, {}, []))

    def test_an_emulator_whose_frames_stand_still_lists_them_as_not_run(self):
        ok, result, sent = self.clock(True, [1, 1])
        self.assertFalse(ok)
        self.assertEqual(sent, ['w300'])
        self.assertIn('DSP frames stand still', result['not_run'][0])
        entry = qualify.testing_entry(dict(args=['x.mwrm'], crash=False, failures=[], packages=[], modules=[], not_run=result['not_run']), '2026-11-20')
        self.assertIn('- Not run here: the frame checks and the queued bank change', entry)
        self.assertIn('Result: passed', entry)

    def test_an_emulator_running_its_dsps_runs_them_too(self):
        self.assertEqual(self.clock(True, [1, 40])[:2], (True, {}))

    def test_the_unit_waits_and_timeouts_are_unchanged(self):
        self.assertEqual(qualify.SOCKET, __import__('os').environ.get('MODWERK_DEV_SOCKET', '/tmp/modwerk-dev.sock'))
        source = (ROOT / 'scripts/octatrack-qualify.py').read_text()
        self.assertIn('s.settimeout(40)', source)
        self.assertIn("until(lambda: mem(0x800065bd, 2) == bytes([bank, pattern]), 20)", source)


class Session(unittest.TestCase):
    def test_a_port_number_reaches_the_session_over_tcp(self):
        # Windows Python has no AF_UNIX: there the session listens on a port (MODWERK_DEV_SOCKET=47812).
        import socket, threading
        server = socket.create_server(('127.0.0.1', 0))
        self.addCleanup(server.close)
        heard = []

        def answer():
            conn, _ = server.accept()
            with conn:
                heard.append(conn.makefile().readline())
                conn.sendall(b'part 1, stopped\n')
        threading.Thread(target=answer, daemon=True).start()
        with mock.patch.object(qualify, 'SOCKET', str(server.getsockname()[1])):
            self.assertEqual(qualify.send('ui'), 'part 1, stopped\n')
        self.assertEqual(heard, ['ui\n'])

    def test_a_path_stays_a_unix_socket(self):
        self.assertEqual(qualify.session_address('/tmp/modwerk-dev.sock'), '/tmp/modwerk-dev.sock')
        self.assertEqual(qualify.session_address('47812'), ('127.0.0.1', 47812))


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
