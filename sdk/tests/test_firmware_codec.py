# SPDX-License-Identifier: GPL-3.0-or-later
"""Modwerk's own firmware codec (sdk/firmware_codec): its results on synthetic inputs, and that every Modwerk build and
check runs the pinned Elekloader checkout with it. No firmware.

firmware_codec_vectors.json holds what the modules it stands in for return on synthetic inputs (packed and store-only
sections, depacked streams and their refusals, .syx framing, ColdFire instruction sweeps)."""
import hashlib
import json
import os
from pathlib import Path
import re
import struct
import subprocess
import sys
import tempfile
import textwrap
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.append(str(ROOT / 'sdk'))
import firmware_codec  # noqa: E402
from firmware_codec import aplib, coldfire, elz, transport  # noqa: E402

VECTORS = json.loads((Path(__file__).with_name('firmware_codec_vectors.json')).read_text())
UPSTREAM = Path(os.environ.get('ELEKLOADER_UPSTREAM', Path.home() / '.cache/modwerk-upstream/elekloader'))


def sha(data):
    return hashlib.sha256(bytes(data)).hexdigest()


def rand(n, seed):
    """The vectors' byte generator: the top byte of a 32-bit LCG per byte."""
    s, out = seed & 0xFFFFFFFF, bytearray(n)
    for i in range(n):
        s = (s * 1664525 + 1013904223) & 0xFFFFFFFF
        out[i] = s >> 24
    return bytes(out)


def make(spec):
    """A synthetic input from its vector spec."""
    kind = spec['kind']
    if kind == 'rand':
        return rand(spec['n'], spec['seed'])
    if kind == 'const':
        return bytes([spec['value']]) * spec['n']
    if kind == 'period':
        p = rand(spec['p'], spec['seed'])
        return (p * (spec['n'] // len(p) + 1))[:spec['n']] if p else b''
    if kind == 'hex':
        return bytes.fromhex(spec['hex'])
    if kind == 'concat':
        return b''.join(make(part) for part in spec['parts'])
    if kind == 'copies':
        out = bytearray(make(spec['base']))
        for at, dist, n in spec['ops']:
            for k in range(n):
                if at + k < len(out) and at - dist + k >= 0:
                    out[at + k] = out[at - dist + k]
        return bytes(out)
    raise ValueError(kind)


def outcome(call):
    try:
        return call(), None
    except Exception as error:  # noqa: BLE001 - the vectors name the class
        return None, error


class Section(unittest.TestCase):
    def test_packs_as_the_vectors_say(self):
        for case in VECTORS['aplib']:
            data = make(case['spec'])
            self.assertEqual(sha(data), case['input'], case['spec'])
            packed, store = aplib.pack_section(data), aplib.pack_section(data, compress=False)
            self.assertEqual((sha(packed), sha(store)), (case['packed'], case['store']), case['spec'])
            if 'bytes' in case:
                import base64
                self.assertEqual(packed, base64.b64decode(case['bytes']))
            self.assertEqual(struct.unpack('>II', packed[:8]), (len(packed) - 8, sum(packed[8:]) & 0xFFFFFFFF))
            self.assertEqual(aplib.pack(data), packed[8:])
            self.assertEqual(elz.depack_section(packed), data)
            self.assertEqual(elz.depack_section(store), data)

    def test_the_run_pack_parity_digest(self):
        parity = VECTORS['runPackParity']
        data = bytes(((i * i >> 3) ^ (i >> 7)) & 0xFF for i in range(40000))
        data += data[1000:5000] * 3
        self.assertEqual(sha(data), parity['input_sha256'])
        self.assertEqual(sha(aplib.pack_section(data)), parity['packed_sha256'])

    def test_depacks_and_refuses_as_the_vectors_say(self):
        vectors = VECTORS['elz']
        self.assertEqual({k: getattr(elz, k) for k in vectors['constants']}, vectors['constants'])
        for case in vectors['cases']:
            data = bytes.fromhex(case['data'])
            if case['call'] == 'depackSection':
                result, error = outcome(lambda: (elz.depack_section(data), None))
            else:
                result, error = outcome(lambda: elz.depack(data, case['pos'], case['end']))
            want = case['want']
            if 'error' in want:
                self.assertIsNotNone(error, case['desc'])
                self.assertEqual((type(error).__name__, str(error)), (want['error'], want['message']), case['desc'])
                continue
            self.assertIsNone(error, case['desc'])
            out, end = result
            self.assertIsInstance(out, bytes)
            self.assertEqual((len(out), sha(out)), (want['out_len'], want['out_sha256']), case['desc'])
            if 'end' in want:
                self.assertEqual(end, want['end'], case['desc'])

    def test_reads_control_bits_as_the_vectors_say(self):
        for case in VECTORS['elz']['bits']:
            data = bytes.fromhex(case['data_hex'])
            bits, got = elz.Bits(data, 0, len(data)), []
            for op in case['script']:
                value, error = outcome(bits.bit if op == 'b' else bits.byte if op == 'y' else bits.gamma)
                if error:
                    got.append([op, {'cls': {'ValueError': 'Error'}.get(type(error).__name__, type(error).__name__),
                                     'message': str(error)}, bits.p])
                    break
                got.append([op, value, bits.p])
            self.assertEqual(got, [step[:3] for step in case['steps']], (case['data_hex'], case['script']))


class Transport(unittest.TestCase):
    def test_frames_as_the_vectors_say(self):
        vectors = VECTORS['transport']
        constants = vectors['constants']
        self.assertEqual((transport.MFR.hex(), transport.FIRST_COUNTER, transport.CHUNK_SIZE),
                         (constants['MFR_hex'], constants['FIRST_COUNTER'], constants['CHUNK_SIZE']))
        for case in vectors['encode8in7']:
            self.assertEqual(transport.encode_8in7(bytes.fromhex(case['in_hex'])).hex(), case['out_hex'])
        for case in vectors['contentChecksum']:
            self.assertEqual(transport.content_checksum(bytes.fromhex(case['in_hex'])), case['value'])
        for case in vectors['packetChecksum']:
            value, error = outcome(lambda: transport.packet_checksum(bytes.fromhex(case['body']), case['k']))
            self.assertEqual({'error': type(error).__name__} if error else {'value': value}, case['want'])
        for case in vectors['encodeSyx']:
            out, error = outcome(lambda: transport.encode_syx(make(case['stream']), case['device_id'],
                                                              bytes.fromhex(case['start']), bytes.fromhex(case['end'])))
            self.assertEqual({'error': type(error).__name__} if error else {'out_len': len(out), 'out_sha256': sha(out)},
                             case['want'], case['stream'])


class ColdFire(unittest.TestCase):
    def test_sweeps_every_opword_as_the_vectors_say(self):
        vectors = VECTORS['coldfire']
        self.assertEqual({k: getattr(coldfire, k) for k in vectors['constants']}, vectors['constants'])
        self.assertEqual([getattr(coldfire, 'F_' + flow.upper()) for flow in vectors['flows']], list(range(len(vectors['flows']))))
        ops = list(vectors['ops'])
        for sweep in vectors['sweeps']:
            tail, out = b''.join(struct.pack('>H', w) for w in sweep['ext']), bytearray()
            for w in range(65536):
                ins = coldfire.decode(coldfire.reader(struct.pack('>H', w) + tail, sweep['base'])(sweep['addr']), sweep['addr'])
                t = ins.target
                out += struct.pack('>BBBBI', ins.length, ins.flags, ins.flow | (0 if t is None else 0x80), ops.index(ins.op),
                                   0 if t is None else t)
            self.assertEqual(sha(out), sweep['sha256'], sweep['name'])

    def test_linear_sweeps_and_the_reader(self):
        vectors = VECTORS['coldfire']
        base = 0x40000400
        for case in vectors['disassemble']:
            data = make(case['spec'])
            seq = [(pc, ins.length) for pc, ins in coldfire.disassemble_lengths(data, base, base, base + len(data) - 8)]
            self.assertEqual((len(seq), sha(json.dumps(seq).encode())), (case['want']['count'], case['want']['sha256']))
        image, got = bytes(range(16)), []
        for addr, offset in [(0x1000, 0), (0x1000, 14), (0x1000, 15), (0x1000, 16), (0x1000, -1), (0x1000, -2), (0x0fff, 0), (0x1001, 0)]:
            value, error = outcome(lambda: coldfire.reader(image, 0x1000)(addr)(offset))
            got.append(['error', type(error).__name__] if error else ['ok', value])
        self.assertEqual(got, vectors['reader'])


CHECKOUT = {  # a stand-in checkout: its codec and decoder refuse to run, its formats module imports them as Elekloader's do
    'elekloader/__init__.py': '',
    'elekloader/codec/__init__.py': 'raise ImportError("the checkout\'s codec package ran")\n',
    'elekloader/codec/aplib.py': 'raise ImportError("the checkout\'s aplib ran")\n',
    'elekloader/codec/elz.py': 'raise ImportError("the checkout\'s elz ran")\n',
    'elekloader/codec/transport.py': 'raise ImportError("the checkout\'s transport ran")\n',
    'elekloader/isa/__init__.py': 'raise ImportError("the checkout\'s isa package ran")\n',
    'elekloader/isa/coldfire.py': 'raise ImportError("the checkout\'s coldfire ran")\n',
    'elekloader/formats.py': 'from .codec import aplib, elz, transport\n',
    'elekloader/devices.py': 'def decoder():\n    from .isa import coldfire\n    return coldfire\n',
}


def python(checkout, body):
    """Run body in a fresh interpreter that knows only sdk/ (as the scripts add it)."""
    code = 'import sys\nsys.path.append(%r)\nimport firmware_codec\nCHECKOUT = %r\n' % (str(ROOT / 'sdk'), str(checkout))
    return subprocess.run([sys.executable, '-B', '-I', '-c', code + textwrap.dedent(body)], capture_output=True, text=True)


class Install(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.checkout = Path(self.folder.name)
        for name, text in CHECKOUT.items():
            (self.checkout / name).parent.mkdir(parents=True, exist_ok=True)
            (self.checkout / name).write_text(text)

    def tearDown(self):
        self.folder.cleanup()

    def test_the_checkout_runs_with_this_codec_and_none_of_its_own(self):
        run = python(self.checkout, '''
            firmware_codec.use_elekloader(CHECKOUT)
            assert sys.path[0] == CHECKOUT
            from elekloader import formats, devices
            import elekloader, elekloader.codec.aplib
            from firmware_codec import aplib, elz, transport, coldfire
            assert (formats.aplib, formats.elz, formats.transport, devices.decoder()) == (aplib, elz, transport, coldfire)
            assert elekloader.codec.aplib is aplib and elekloader.isa.coldfire is coldfire
            assert aplib.__spec__.name == 'firmware_codec.aplib'
            assert not any(m.__file__.startswith(CHECKOUT) for n, m in sys.modules.items()
                           if n.startswith(('elekloader.codec', 'elekloader.isa')) and getattr(m, '__file__', None))
            firmware_codec.use_elekloader(CHECKOUT)  # again: idempotent
            print('ok')
        ''')
        self.assertEqual((run.returncode, run.stdout.strip()), (0, 'ok'), run.stderr)

    def test_refuses_a_codec_the_checkout_already_imported(self):
        (self.checkout / 'elekloader/codec/__init__.py').write_text('')
        (self.checkout / 'elekloader/codec/aplib.py').write_text('')
        run = python(self.checkout, '''
            sys.path.insert(0, CHECKOUT)
            import elekloader.codec.aplib
            firmware_codec.use_elekloader(CHECKOUT)
        ''')
        self.assertNotEqual(run.returncode, 0)
        self.assertIn('was imported before firmware_codec.install_in_elekloader()', run.stderr)

    def test_inputs_name_this_package_and_not_the_checkouts_codec(self):
        found = firmware_codec.inputs(self.checkout)
        self.assertEqual(sorted(found), sorted(['upstream/elekloader/__init__.py', 'upstream/elekloader/formats.py',
                                                'upstream/elekloader/devices.py'] +
                                               ['sdk/firmware_codec/' + p.name for p in firmware_codec.sources()]))
        self.assertEqual(found['sdk/firmware_codec/aplib.py'], sha((ROOT / 'sdk/firmware_codec/aplib.py').read_bytes()))
        self.assertEqual({p.name for p in firmware_codec.sources()},
                         {'__init__.py', 'aplib.py', 'elz.py', 'transport.py', 'coldfire.py'})

    @unittest.skipUnless((UPSTREAM / 'elekloader/syx.py').is_file(), 'needs the pinned Elekloader checkout')
    def test_the_pinned_checkout_runs_with_this_codec(self):
        run = python(UPSTREAM, '''
            firmware_codec.use_elekloader(CHECKOUT)
            from elekloader import elek, formats, syx
            from elekloader.devices import devices
            import firmware_codec.aplib, firmware_codec.elz, firmware_codec.transport, firmware_codec.coldfire
            assert syx.aplib is firmware_codec.aplib and syx.elz is firmware_codec.elz and syx.transport is firmware_codec.transport
            assert elek.aplib is firmware_codec.aplib and elek.elz is firmware_codec.elz
            assert {d.decoder() for d in devices() if d.isa == 'coldfire'} == {firmware_codec.coldfire}
            print('ok')
        ''')
        self.assertEqual((run.returncode, run.stdout.strip()), (0, 'ok'), run.stderr)


SCANNED = ('scripts', 'sdk', 'bin', 'tools', '.github')
CODE = ('.py', '.mjs', '.js', '.cjs', '.ts', '.sh', '.yml', '.yaml')
IMPORTS = re.compile(r'^\s*(?:from\s+elekloader(?:\.\w+)*\s+import\b|import\s+elekloader\b)', re.M)
# The checkout reached any way but use_elekloader(): straight onto sys.path or PYTHONPATH, as `python -m elekloader...`,
# or the files this package stands in for, by path.
AROUND = {
    'puts the checkout on sys.path itself': re.compile(r'sys\.path(?:\.insert\(|\.append\(|\[:0\]\s*=)[^\n]*(?:upstream|UPSTREAM|ELEKLOADER|modwerk-upstream)'),
    'puts the checkout on PYTHONPATH': re.compile(r'PYTHONPATH[^\n]*(?:upstream|UPSTREAM|ELEKLOADER|elekloader)'),
    'runs the checkout as python -m': re.compile(r'''-m['",\s]+elekloader'''),
    'names the checkout\'s codec or decoder files': re.compile(r'elekloader/(?:codec|isa)/'),
}


# Tools whose executed receipts bind their source hash: they move to use_elekloader() when those are next re-executed,
# which needs the owner's private inputs. Each must still be pinned so, or it leaves this list.
RECEIPT_PINNED = {
    'sdk/machines/octatrack/module-adapters/probe_fm_consumers.py':
        'sdk/machines/octatrack/module-adapters/fm-consumer-observations.json',  # private FM consumer probe receipts
}


# Files that name the checkout's codec files as text and never run them. Each says why; the other rules still apply.
NAMES_ONLY = {
    'scripts/elekloader-vendor.ts',  # the vendored TypeScript kit's NOTICE drops the credits of the files Modwerk replaced (#1016)
}


class EveryScript(unittest.TestCase):
    def test_every_script_that_imports_elekloader_runs_it_with_this_codec(self):
        """The rule the fresh-interpreter tests above prove for one: no Modwerk build or check imports Elekloader
        without firmware_codec.use_elekloader(), and none reaches the checkout another way."""
        problems, users = [], []
        for top in SCANNED:
            for path in sorted((ROOT / top).rglob('*')):
                name = path.relative_to(ROOT).as_posix()
                if (not path.is_file() or path.suffix not in CODE or '/node_modules/' in name
                        or name.startswith('sdk/firmware_codec/') or path == Path(__file__).resolve()):
                    continue
                text = path.read_text(errors='replace')
                if 'elekloader' not in text and 'ELEKLOADER' not in text:
                    continue
                if IMPORTS.search(text):
                    users.append(name)
                    if name in RECEIPT_PINNED:
                        continue
                    if 'use_elekloader(' not in text:
                        problems.append(name + ': imports elekloader without firmware_codec.use_elekloader()')
                problems += ['%s:%d: %s' % (name, text.count('\n', 0, m.start()) + 1, why)
                             for why, pattern in AROUND.items() for m in pattern.finditer(text)
                             if not (name in NAMES_ONLY and why == 'names the checkout\'s codec or decoder files')]
        self.assertEqual(problems, [])
        self.assertIn('sdk/machines/octatrack/elekloader/build_core.py', users)  # the scan sees the builders
        self.assertIn('scripts/verify-octatrack-elemods.mjs', users)  # and Python inside Node scripts
        for name, receipt in RECEIPT_PINNED.items():
            self.assertIn(sha((ROOT / name).read_bytes()), (ROOT / receipt).read_text(), name + ' is no longer pinned there')
            self.assertNotIn('use_elekloader(', (ROOT / name).read_text(), name + ' uses the codec now: drop it here')


if __name__ == '__main__':
    unittest.main()
