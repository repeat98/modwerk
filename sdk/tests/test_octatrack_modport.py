# SPDX-License-Identifier: GPL-3.0-or-later
"""scripts/octatrack-modport.py: a synthetic ProTracker module read, played, planned and written into a synthetic
project folder (the bank files' tags, checksums and offsets as sdk/octabam/tools/hw reads them; no unit's project)."""
import importlib.util
import io
import pathlib
import struct
import sys
import tempfile
import unittest
from contextlib import redirect_stdout

ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('modport', ROOT / 'scripts/octatrack-modport.py')
modport = importlib.util.module_from_spec(spec)
sys.modules['modport'] = modport                 # dataclasses look their module up
spec.loader.exec_module(modport)
sys.path.insert(0, str(ROOT / 'sdk/octabam/tools/hw'))
sys.path.insert(0, str(ROOT / 'sdk/octabam/tools'))
import toolpath  # noqa: E402,F401
import ot_bank as ob  # noqa: E402
import ot_project as op  # noqa: E402


def cell(period=0, sample=0, effect=0, param=0):
    return bytes([(sample & 0xf0) | (period >> 8), period & 0xff, ((sample & 15) << 4) | effect, param])


def make_mod(patterns, order, samples, channels=4, sig=b'M.K.'):
    """patterns: [{(row, channel): cell bytes}]; samples: [(name, data, finetune, volume, loop_start, loop_length)]."""
    out = bytearray(b'TEST SONG'.ljust(20, b'\0'))
    for i in range(31):
        name, data, fine, vol, ls, ll = samples[i] if i < len(samples) else ('', b'', 0, 0, 0, 2)
        out += name.encode().ljust(22, b'\0') + struct.pack('>HBBHH', len(data) // 2, fine & 15, vol, ls // 2, max(1, ll // 2))
    out += bytes([len(order), 127]) + bytes(order).ljust(128, b'\0') + sig
    for p in patterns:
        for r in range(64):
            for c in range(channels):
                out += p.get((r, c), cell())
    for i in range(31):
        out += samples[i][1] if i < len(samples) else b''
    return bytes(out)


def period(note):
    return modport.PERIODS[note]


def fake_project(folder: pathlib.Path):
    """A project folder with the bank layout the hw tools read: PTRN and TRAC tags, empty locks, 8 Parts, a checksum."""
    folder.mkdir()
    size = op.PART_BASE + op.NPARTS_ALL * op.PART_STRIDE + 4 * 7 + 2
    data = bytearray(size)
    data[0:8] = b'FORM\0\0\0\0'
    for p in range(ob.NPATTERNS):
        data[ob.PTRN_BASE + p * ob.PTRN_STRIDE:ob.PTRN_BASE + p * ob.PTRN_STRIDE + 4] = b'PTRN'
        for t in range(ob.NTRACKS):
            a = ob.trac(p, t)
            data[a:a + 4] = b'TRAC'
            data[a + ob.LOCKS:a + ob.LOCKS + ob.NSTEPS * ob.LOCK_LEN] = b'\xff' * (ob.NSTEPS * ob.LOCK_LEN)
            data[a + ob.DATA + ob.TRK_LENGTH] = 16
            data[a + ob.DATA + ob.TRK_SCALE] = 2
    data[-2:] = (sum(data[0x10:-2]) & 0xffff).to_bytes(2, 'big')
    for n in range(1, 17):
        (folder / ('bank%02d.work' % n)).write_bytes(bytes(data))
    recorders = ''.join('[SAMPLE]\r\nTYPE=FLEX\r\nSLOT=%03d\r\nPATH=\r\nBPMx24=2880\r\nTSMODE=2\r\nLOOPMODE=0\r\nGAIN=72\r\n'
                        'TRIGQUANTIZATION=-1\r\n[/SAMPLE]\r\n\r\n' % s for s in range(129, 137))
    (folder / 'project.work').write_bytes(('[SETTINGS]\r\nTEMPOx24=2880\r\n[/SETTINGS]\r\n\r\n############################\r\n'
                                           '# Samples\r\n############################\r\n\r\n' + recorders
                                           + '############################\r\n\r\n').encode('latin1'))


SINE = bytes((int(100 * __import__('math').sin(i / 4)) & 0xff) for i in range(512))


def song():
    p0 = {(0, 0): cell(period(12), 1, 0xF, 3), (0, 1): cell(period(24), 2, 0xC, 32), (4, 0): cell(period(17), 0),
          (8, 0): cell(period(0), 1, 0x9, 1), (8, 1): cell(0, 0, 0x4, 0x44), (15, 2): cell(0, 0, 0xD, 0x08)}
    p1 = {(8, 0): cell(period(35), 1), (12, 3): cell(0, 0, 0xF, 140), (31, 0): cell(0, 0, 0xB, 0x00)}
    return make_mod([p0, p1], [0, 1, 0], [('KICK', SINE, 0, 64, 0, 2), ('PAD', SINE, -3, 48, 64, 256)])


class Parse(unittest.TestCase):
    def test_header_and_cells(self):
        mod = modport.parse(song())
        self.assertEqual((mod.title, mod.channels, mod.order, len(mod.patterns)), ('TEST SONG', 4, [0, 1, 0], 2))
        self.assertEqual((mod.samples[1].name, mod.samples[1].finetune, mod.samples[1].volume, mod.samples[1].loop_start,
                          mod.samples[1].loop_length), ('PAD', -3, 48, 64, 256))
        c = mod.patterns[0][0][1]
        self.assertEqual((c.sample, c.note, c.effect, c.param), (2, 24, 0xC, 32))
        self.assertEqual(mod.patterns[0][4][0].sample, 0)

    def test_channel_signatures(self):
        for sig, n in ((b'6CHN', 6), (b'8CHN', 8), (b'FLT8', 8), (b'08CH', 8)):
            self.assertEqual(modport.parse(make_mod([{}], [0], [('A', SINE, 0, 64, 0, 2)], n, sig)).channels, n)
        with self.assertRaises(ValueError):
            modport.parse(make_mod([{}], [0], [], 4, b'XXXX'))
        with self.assertRaises(ValueError):
            modport.parse(b'short')

    def test_periods(self):
        self.assertEqual([modport.note_of(p) for p in (856, 428, 113, 0, 430)], [0, 12, 35, -1, 12])


class Play(unittest.TestCase):
    def setUp(self):
        self.mod = modport.parse(song())
        self.song = modport.play(self.mod)

    def test_order_breaks_and_jump_back(self):
        # position 0 breaks at row 15 into row 8 of position 1, which jumps back to 0: two positions
        self.assertEqual([(p.pattern, p.first_row, p.length) for p in self.song.positions], [(0, 0, 16), (1, 8, 24)])

    def test_notes_samples_volumes(self):
        t0 = self.song.positions[0].tracks[0]
        self.assertEqual([(e.step, e.sample, e.note, e.volume, e.offset) for e in t0],
                         [(0, 1, 12, 64, 0), (4, 1, 17, 64, 0), (8, 1, 0, 64, 256)])
        self.assertEqual([(e.step, e.volume) for e in self.song.positions[0].tracks[1]], [(0, 32)])
        self.assertEqual([(e.step, e.note) for e in self.song.positions[1].tracks[0]], [(0, 35)])

    def test_tempo_and_report(self):
        self.assertEqual((self.song.speed, self.song.bpm, self.song.later_tempo), (3, 140, 0))
        self.assertEqual(self.song.unconverted, {'4': 1})

    def test_loop_terminates(self):
        mod = modport.parse(make_mod([{(63, 0): cell(0, 0, 0xB, 0)}], [0, 0], [('A', SINE, 0, 64, 0, 2)]))
        self.assertEqual(len(modport.play(mod).positions), 1)


class Plan(unittest.TestCase):
    def setUp(self):
        self.mod = modport.parse(song())
        self.song = modport.play(self.mod)
        self.plan = modport.plan(self.mod, self.song, 1)

    def test_slots_centres_tempo(self):
        self.assertEqual(self.plan['slots'], {1: 1, 2: 2})
        self.assertEqual(self.plan['centres'], {1: 18, 2: 24})
        self.assertAlmostEqual(self.plan['tempo'], 280.0)

    def test_locks(self):
        t1 = self.plan['patterns'][0]['tracks']['1']
        self.assertEqual(t1['trigs'], [1, 5, 9])
        pb = t1['locks']['playback']
        self.assertEqual(pb['1'], {'S31': 0, 'PTCH': 64 - 30})
        self.assertEqual(pb['5'], {'S31': 0, 'PTCH': 64 - 5})
        self.assertEqual(pb['9']['PTCH'], 64 + 5 * modport.fold(-18))
        self.assertEqual(pb['9']['STRT'], round(128 * 256 / 512))
        t2 = self.plan['patterns'][0]['tracks']['2']
        self.assertEqual((t2['locks']['playback']['1'], t2['locks']['amp']['1']), ({'S31': 1, 'PTCH': 64}, {'VOL': 32}))
        self.assertEqual(self.plan['folded'], 2)
        self.assertEqual([(q['bank'], q['pattern'], q['length']) for q in self.plan['patterns']], [(1, 1, 16), (1, 2, 24)])

    def test_fold_and_volume(self):
        self.assertEqual([modport.fold(s) for s in (-25, -13, -12, 0, 12, 13, 25)], [-1, -1, -12, 0, 12, 1, 1])
        self.assertEqual([modport.volume_lock(v) for v in (64, 63, 0)], [None, 63, 0])

    def test_banks_run_out(self):
        many = make_mod([{(0, 0): cell(period(12), 1)}], [0] * 40, [('A', SINE, 0, 64, 0, 2)])
        mod = modport.parse(many)
        s = modport.play(mod)
        s.positions = [s.positions[0]] * 40
        p = modport.plan(mod, s, 15)
        self.assertEqual((len(p['patterns']), p['dropped'], p['patterns'][-1]['bank'], p['patterns'][-1]['pattern']), (32, 8, 16, 16))


class Render(unittest.TestCase):
    def test_rate_and_loop(self):
        mod = modport.parse(song())
        kick = modport.render(mod.samples[0], 24)                  # C-3: 8287 Hz
        self.assertAlmostEqual(len(kick) / 44100, 511 / (modport.PAL_CLOCK / 214), delta=0.002)
        pad = modport.render(mod.samples[1], 24)
        self.assertGreaterEqual(len(pad) / 44100, modport.LOOP_SECONDS - 0.01)
        self.assertLessEqual(max(map(abs, pad)), 100 * 256 + 256)
        w = modport.wav(kick)
        self.assertEqual((w[:4], w[8:12], struct.unpack('<HHI', w[20:28]), len(w)), (b'RIFF', b'WAVE', (1, 1, 44100), 44 + 2 * len(kick)))


class Samples(unittest.TestCase):
    def test_order_and_replace(self):
        text = ('# Samples\r\n####\r\n\r\n[SAMPLE]\r\nTYPE=STATIC\r\nSLOT=005\r\nPATH=x.wav\r\n[/SAMPLE]\r\n\r\n'
                '[SAMPLE]\r\nTYPE=FLEX\r\nSLOT=002\r\nPATH=old.wav\r\n[/SAMPLE]\r\n\r\n'
                '[SAMPLE]\r\nTYPE=FLEX\r\nSLOT=129\r\nPATH=\r\n[/SAMPLE]\r\n\r\n####\r\n')
        out = modport.with_samples(text, {1: 'A01.wav', 2: 'A02.wav'}, 120)
        self.assertEqual([l for l in out.split('\r\n') if l.startswith(('SLOT', 'PATH'))],
                         ['SLOT=005', 'PATH=x.wav', 'SLOT=001', 'PATH=A01.wav', 'SLOT=002', 'PATH=A02.wav', 'SLOT=129', 'PATH='])
        self.assertTrue(out.endswith('[/SAMPLE]\r\n\r\n####\r\n'))
        self.assertIn('BPMx24=2880\r\nTSMODE=0\r\nLOOPMODE=0\r\nGAIN=72\r\nTRIGQUANTIZATION=-1', out)
        self.assertNotIn('\n\n\n', out.replace('\r', ''))


class Write(unittest.TestCase):
    def test_project(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = pathlib.Path(tmp)
            fake_project(tmp / 'TEMPLATE')
            (tmp / 'song.mod').write_bytes(song())
            before = {f.name: f.read_bytes() for f in (tmp / 'TEMPLATE').iterdir()}
            with redirect_stdout(io.StringIO()):
                self.assertEqual(modport.main([str(tmp / 'song.mod'), str(tmp / 'TEMPLATE'), str(tmp / 'MY SONG')]), 0)
            out = tmp / 'MY SONG'
            self.assertEqual(sorted(p.name for p in out.glob('*.wav')), ['MYSONG01.wav', 'MYSONG02.wav'])
            text = (out / 'project.work').read_bytes().decode('latin1')
            self.assertIn('TEMPOx24=%d' % op.tempo24_of(280.0), text)
            self.assertIn('SLOT=001\r\nPATH=MYSONG01.wav', text)
            data = (out / 'bank01.work').read_bytes()
            self.assertEqual(int.from_bytes(data[-2:], 'big'), sum(data[0x10:-2]) & 0xffff)
            for part in range(op.NPARTS_ALL):
                base = op.PART_BASE + part * op.PART_STRIDE
                self.assertEqual(list(data[base + op.MTYPE_OFF:base + op.MTYPE_OFF + 5]), [1, 1, 1, 1, 0])
                self.assertEqual(data[base + op.SLOT_OFF + op.SLOT_KIND['flex']], 0)
                self.assertEqual(data[base + op.SLOT_OFF + 5 + op.SLOT_KIND['flex']], 1)
            self.assertEqual(ob.trigs(data, 0, 0), [0, 4, 8])
            self.assertEqual(ob.locks(data, 0, 0)[0][31], 0)
            self.assertEqual(ob.locks(data, 0, 1)[0][15], 32)        # AMP VOL
            self.assertEqual((data[ob.trac(1, 0) + ob.DATA + ob.TRK_LENGTH], data[ob.trac(1, 0) + ob.DATA + ob.TRK_SCALE]), (24, 2))
            tail = op.PTRN0 + 1 * op.PTRN_FSTRIDE + op.PTRN_FSTRIDE - 11
            self.assertEqual((data[tail + 2], data[tail + 3]), (24, 2))
            self.assertEqual({f.name: f.read_bytes() for f in (tmp / 'TEMPLATE').iterdir()}, before)
            with redirect_stdout(io.StringIO()), self.assertRaises(SystemExit):
                modport.main([str(tmp / 'song.mod'), str(tmp / 'TEMPLATE'), str(out)])

    def test_report_writes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            (pathlib.Path(tmp) / 'song.mod').write_bytes(song())
            buf = io.StringIO()
            with redirect_stdout(buf):
                self.assertEqual(modport.main([str(pathlib.Path(tmp) / 'song.mod'), '--report']), 0)
            self.assertIn('2 samples used, 2 song positions -> 2 patterns, tempo 280.00', buf.getvalue())
            self.assertIn('effects not converted: vibrato (4) x1', buf.getvalue())
            self.assertEqual(len(list(pathlib.Path(tmp).iterdir())), 1)


if __name__ == '__main__':
    unittest.main()
