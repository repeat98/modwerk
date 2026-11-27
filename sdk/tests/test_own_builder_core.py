# SPDX-License-Identifier: GPL-3.0-or-later
"""Parity of sdk/firmware_builder's core modules (devices, elemod, store, dsp, syx, elek, formats, link, patch,
mkmod) with the pinned upstream checkout they must match byte for byte.

Each test runs both on the same inputs and compares the whole outcome: values, bytes, JSON text, log lines, and for
a refusal its exception class and message. Inputs are seeded random cases and real ones: every .elemod package in the
repository and, when present on this computer, the owner's stock OS files (never in the repository). The only
differences allowed are messages that name the upstream project (normalised in `norm`) and the manifest's `patcher`.

OWN_BUILDER_SETS (default 60; 300 for a full pass) sets how many random package sets each stock file links; OWN_BUILDER_BUILDS (default 2)
how many of them also run the whole build (pack, write, verify)."""
import copy
import dataclasses
import hashlib
import io
import json
import os
from pathlib import Path
import random
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[2]
UPSTREAM = Path(os.environ.get('ELEKLOADER_UPSTREAM', Path.home() / '.cache/modwerk-upstream/elekloader')).expanduser()
HOME = Path.home()
STOCK = [HOME / p for p in (
    'Downloads/Digitakt_OS1.54_dist/Digitakt_OS1.54.syx',
    'Downloads/Modwerk-DigiMono-0.13.2-verification/Digitakt_OS1.53.syx',
    'Downloads/modwerk-digi-parity/Digitakt_II_OS1.17.syx',
    'Downloads/modwerk-digi-parity/Digitone_and_Digitone_Keys_OS1.43.syx',
    'Downloads/modwerk-digi-parity/Digitone_and_Digitone_Keys_OS1.44.syx',
    'Downloads/OCTATRACK_OS1.40C_dist/OCTATRACK_OS1.40C.bin')]
PACKAGE_DIRS = ('vendor/elekloader/catalog', 'sdk/imports/packages', 'src/engine/assets')
SETS = int(os.environ.get('OWN_BUILDER_SETS', '60'))
BUILDS = int(os.environ.get('OWN_BUILDER_BUILDS', '2'))
NAMES = ('devices', 'elemod', 'store', 'dsp', 'syx', 'elek', 'formats', 'link', 'patch', 'mkmod')
# The upstream messages that name their project, as this package words them.
RENAMED = (('firmware elekloader knows', 'firmware the builder knows'),
           ('firmware elekloader does not know', 'firmware the builder does not know'),
           ('not an elekloader storage lockfile', 'not a storage lockfile'),
           ('newer than this elekloader', 'newer than this builder'), ('update elekloader', 'update the builder'),
           ('elekloader cannot write them', 'the builder cannot write them'))

U = O = None
COUNTS = {}


def setUpModule():
    global U, O
    if not (UPSTREAM / 'elekloader' / 'link.py').exists():
        raise unittest.SkipTest('no upstream checkout at %s' % UPSTREAM)
    sys.path.insert(0, str(ROOT / 'sdk'))
    import firmware_codec
    firmware_codec.use_elekloader(UPSTREAM)
    import importlib
    U = {n: importlib.import_module('elekloader.' + n) for n in NAMES}
    O = {n: importlib.import_module('firmware_builder.' + n) for n in NAMES}
    _memo_pack(firmware_codec)


def tearDownModule():
    if COUNTS:
        print('\nown builder parity cases: ' + ', '.join('%s %d' % kv for kv in sorted(COUNTS.items())),
              file=sys.stderr)


def count(what, n=1):
    COUNTS[what] = COUNTS.get(what, 0) + n


def _memo_pack(firmware_codec):
    """Both sides pack with the one shared codec function: remember its results so a build's 7 s pack runs once."""
    from firmware_codec import aplib
    original, memo = aplib.pack_section, {}

    def pack_section(data):
        key = hashlib.sha256(bytes(data)).digest()
        if key not in memo:
            memo[key] = original(data)
        return memo[key]
    aplib.pack_section = pack_section


def norm(text):
    for old, new in RENAMED:
        text = text.replace(old, new)
    return text


def snap(v, depth=0):
    """A comparable picture of a value: objects become their attributes, devices their key."""
    if depth > 12:
        return repr(v)
    if dataclasses.is_dataclass(v) and not isinstance(v, type):
        if hasattr(v, 'key') and hasattr(v, 'releases'):
            return ('Device', v.key)
        return ('dc', type(v).__name__, snap(dataclasses.asdict(v), depth + 1))
    if isinstance(v, dict):
        return ('dict', [(snap(k, depth + 1), snap(x, depth + 1)) for k, x in v.items()])
    if isinstance(v, (list, tuple)):
        return (type(v).__name__, [snap(x, depth + 1) for x in v])
    if isinstance(v, (set, frozenset)):
        return ('set', sorted(repr(snap(x, depth + 1)) for x in v))
    if isinstance(v, (bytes, bytearray)):
        return (type(v).__name__, hashlib.sha256(bytes(v)).hexdigest(), len(v))
    if hasattr(v, '__dict__') and not isinstance(v, type):
        return ('obj', type(v).__name__, snap({k: x for k, x in vars(v).items()}, depth + 1))
    return v


def outcome(fn, *args, **kw):
    try:
        return ('ok', snap(fn(*args, **kw)))
    except Exception as e:  # noqa: BLE001 - the refusal itself is compared
        return ('err', type(e).__name__, norm(str(e)))


def sha(b):
    return hashlib.sha256(bytes(b)).hexdigest()


def packages():
    """Every package in the repository: [(path, doc, raw)]."""
    found = []
    for top in PACKAGE_DIRS:
        for path in sorted((ROOT / top).rglob('*.elemod')):
            raw = path.read_bytes()
            try:
                found.append((path, json.loads(raw), raw))
            except ValueError:
                continue
    return found


def stock_files():
    return [p for p in STOCK if p.exists()]


def mutate(doc, rnd):
    """A copy of `doc` with one value somewhere replaced by something odd."""
    doc = copy.deepcopy(doc)
    junk = [None, 0, -1, 7, 2 ** 40, '', 'zz', '0x10', [], {}, [1, 2], {'a': 1}, True, 'hex', ['hex', 'zz'],
            ['stock', '0x40000400', 4], 3.5]
    path, node = [], doc
    for _ in range(rnd.randrange(1, 6)):
        if isinstance(node, dict) and node:
            k = rnd.choice(sorted(node, key=str))
        elif isinstance(node, list) and node:
            k = rnd.randrange(len(node))
        else:
            break
        path.append((node, k))
        node = node[k]
    if not path:
        doc[rnd.choice(['x', 'id', 'sections'])] = rnd.choice(junk)
        return doc
    parent, k = rnd.choice(path)
    action = rnd.random()
    if action < 0.15 and isinstance(parent, dict):
        del parent[k]
    elif action < 0.25 and isinstance(parent, list):
        del parent[k]
    else:
        parent[k] = rnd.choice(junk)
    return doc


class Devices(unittest.TestCase):
    def test_profiles_and_lookups(self):
        u, o = U['devices'], O['devices']
        self.assertEqual(repr([dataclasses.asdict(d) for d in u.devices()]),
                         repr([dataclasses.asdict(d) for d in o.devices()]))
        self.assertEqual(norm(u.supported()), o.supported())
        rnd = random.Random(1)
        hashes = [r.syx_sha256 for d in u.devices() for r in d.releases.values()]
        hashes += [r.bin_sha256 for d in u.devices() for r in d.releases.values()]
        hashes += ['%064x' % rnd.getrandbits(256) for _ in range(200)] + ['', None]
        for h in hashes:
            self.assertEqual(outcome(u.identify, h), outcome(o.identify, h))
            count('devices')
        for sid in range(256):
            self.assertEqual(u.version_at(sid), o.version_at(sid))
        targets = [doc.get('target') for _p, doc, _r in packages()]
        for t in list(targets):
            for _ in range(3):
                targets.append(mutate({'target': t}, rnd).get('target'))
        targets += [None, 3, {}, {'device': 'octatrack'}]
        for t in targets:
            self.assertEqual(outcome(u.for_target, t), outcome(o.for_target, t))
            count('devices')
        versions = ['0.1', '2.0', '3.9', '4.0', '4.0a', '10.0', '', 'x', '4', '0.3']
        for ud, od in zip(u.devices(), o.devices()):
            for r in ud.releases.values():
                self.assertEqual(u.target_of(ud, r), o.target_of(od, r))
                self.assertEqual(ud.image_end(r), od.image_end(r))
                self.assertEqual(snap(ud.release_for(main_sha256=r.main_sha256)),
                                 snap(od.release_for(main_sha256=r.main_sha256)))
            for v in versions:
                self.assertEqual(ud.ddr_for(v), od.ddr_for(v))
            self.assertEqual(ud.linkable(), od.linkable())
            self.assertIs(ud.decoder(), od.decoder())    # the one shared ColdFire decoder
        bad = dataclasses.replace(o.devices()[0], isa='arm')
        self.assertEqual(outcome(dataclasses.replace(u.devices()[0], isa='arm').decoder), outcome(bad.decoder))


class Elemod(unittest.TestCase):
    def test_versions_and_core_choice(self):
        u, o = U['elemod'], O['elemod']
        rnd = random.Random(2)
        alphabet = '0123456789.ab-'
        for _ in range(5000):
            vs = [''.join(rnd.choice(alphabet) for _ in range(rnd.randrange(0, 6))) for _ in range(rnd.randrange(0, 6))]
            need = rnd.choice([None] + vs + ['2.0'])
            fits = [rnd.random() < 0.5 for _ in vs] if rnd.random() < 0.5 else None
            for v in vs:
                self.assertEqual(u.version_key(v), o.version_key(v))
            self.assertEqual(outcome(u.pick_core, vs, need, fits), outcome(o.pick_core, vs, need, fits))
            count('elemod')
        for doc in (None, 3, {}, {'elemod': 2}, {'dtmod': 1}, {'elemod': 1, 'dtmod': 2}):
            self.assertEqual(u.format_of(doc), o.format_of(doc))

    def test_every_package_and_its_mutations_load_alike(self):
        ul, ol = U['link'], O['link']
        ue, oe = U['elemod'], O['elemod']
        rnd = random.Random(3)
        for path, doc, raw in packages():
            name = path.name
            self.assertEqual(outcome(ul.Mod2, doc, name, raw), outcome(ol.Mod2, doc, name, raw), name)
            one = dict(doc, elemod=1)
            self.assertEqual(outcome(ue.Mod, one, name, raw), outcome(oe.Mod, one, name, raw), name)
            count('elemod packages')
            for _ in range(12 if len(raw) < 200000 else 2):
                bent = mutate(doc, rnd)
                self.assertEqual(outcome(ul.Mod2, bent, name), outcome(ol.Mod2, bent, name), name)
                count('elemod mutations')
            if outcome(ol.Mod2, doc, name, raw)[0] == 'ok':
                self.assertEqual(ul.Mod2(doc, name, raw).ram_bound(), ol.Mod2(doc, name, raw).ram_bound())
        self.assertEqual(outcome(ue.load_any, str(ROOT / 'missing.elemod')),
                         outcome(oe.load_any, str(ROOT / 'missing.elemod')))
        folder = ROOT / 'vendor/elekloader/catalog'
        self.assertEqual([Path(p).name for p in ue.mod_files(str(folder))],
                         [Path(p).name for p in oe.mod_files(str(folder))])

    def test_parts_sites_and_resources(self):
        ue, oe = U['elemod'], O['elemod']
        ud, od = U['devices'], O['devices']
        rnd = random.Random(4)
        for ud_, od_ in zip(ud.devices(), od.devices()):
            rel = next(iter(ud_.releases.values()))
            lo, hi = ud_.main_load, ud_.image_end(rel)
            for _ in range(600):
                parts = []
                for _ in range(rnd.randrange(0, 4)):
                    pick = rnd.random()
                    if pick < 0.4:
                        parts.append(['hex', rnd.randbytes(rnd.randrange(0, 5)).hex()])
                    elif pick < 0.8:
                        parts.append(['stock', hex(rnd.randrange(lo - 8, hi + 8)), rnd.randrange(-1, 16)])
                    else:
                        parts.append(rnd.choice([[], ['hex'], ['stock', 1], 'hex', None, ['raw', '00']]))
                self.assertEqual(outcome(ue.parse_parts, parts, 'w', ud_, rel), outcome(oe.parse_parts, parts, 'w', od_, rel))
                site = {'addr': hex(rnd.randrange(lo - 4, hi + 4)), 'len': rnd.randrange(0, 5),
                        'new': rnd.randbytes(rnd.randrange(0, 5)).hex(), 'kind': rnd.choice(['code', 'data', 'x']),
                        'stock_sha256': rnd.choice(['a' * 64, 'A' * 64, None, 'ab']),
                        'relocs': [[rnd.randrange(-1, 5), rnd.choice(['abs32', 'pc16', 'dsp24', 'x', 3]), 'abs', 0]]}
                for relocs in (False, True):
                    self.assertEqual(outcome(ue.parse_sites, {'sites': [site]}, 'n', ud_, rel, relocs),
                                     outcome(oe.parse_sites, {'sites': [site]}, 'n', od_, rel, relocs))
                area = rnd.choice(list(ud_.areas.values()) or [(0, 1)])
                region = {'name': rnd.choice(['r', None]), 'lo': hex(area[0] + rnd.randrange(-4, 8)),
                          'hi': hex(area[1] + rnd.randrange(-8, 4))}
                res = {'resources': {'regions': [region], 'names': [1, 'x'], 'core': rnd.choice([None, '3.0', 3, 'x'])}}
                self.assertEqual(outcome(ue.parse_resources, res, 'n', ud_), outcome(oe.parse_resources, res, 'n', od_))
                self.assertEqual(outcome(ue.parse_needs_core, res, 'n'), outcome(oe.parse_needs_core, res, 'n'))
                count('elemod parts/sites')

    def test_format_one_bundles_apply_alike(self):
        """Synthetic format-1 bundles on each stock file: random sites (code and data) and an appended blob."""
        for path in stock_files():
            with self.subTest(stock=path.name):
                stock, dev, rel = O['formats'].load(str(path))
                image = O['formats'].main_image(stock, dev)
                rnd = random.Random(path.name)
                for case in range(60):
                    mods = []
                    for k in range(rnd.randrange(1, 4)):
                        sites = []
                        for _ in range(rnd.randrange(0, 4)):
                            n = rnd.choice([2, 4, 6])
                            addr = dev.main_load + rnd.randrange(0, rel.main_len - n) // 2 * 2
                            old = image[addr - dev.main_load:addr - dev.main_load + n]
                            sites.append({'addr': hex(addr), 'len': n, 'new': rnd.randbytes(n).hex(),
                                          'kind': rnd.choice(['code', 'data']),
                                          'stock_sha256': sha(old) if rnd.random() < 0.9 else 'f' * 64})
                        doc = {'elemod': 1, 'id': 'm%d' % rnd.randrange(8), 'version': '1', 'sites': sites,
                               'target': O['devices'].target_of(dev, rel)}
                        if rnd.random() < 0.5:
                            stock_at = dev.main_load + rnd.randrange(0, 4096)
                            data = rnd.randbytes(rnd.randrange(1, 64))
                            blob = data + image[stock_at - dev.main_load:stock_at - dev.main_load + 16]
                            doc['blob'] = {'load': hex(dev.image_end(rel) + rnd.choice([0, 0, 0, 4])), 'len': len(blob),
                                           'sha256': sha(blob) if rnd.random() < 0.9 else '0' * 64,
                                           'parts': [['hex', data.hex()], ['stock', hex(stock_at), 16]]}
                        if rnd.random() < 0.1:
                            doc['requires'] = ['m9']
                        if rnd.random() < 0.3:
                            doc['ele3_version'] = rnd.choice(['1.0X', '1.0X', '1.0X', 'ABCDE', '1'])
                        mods.append(doc)

                    def run(side):
                        built = [side['elemod'].Mod(d, 'f%d' % i) for i, d in enumerate(mods)]
                        return side['elemod'].apply(built, image)
                    self.assertEqual(outcome(run, U), outcome(run, O))
                    count('format-1 applies')


class Store(unittest.TestCase):
    def test_allocation_chains(self):
        us, os_ = U['store'], O['store']
        rnd = random.Random(5)
        pool = [('m%d' % (i % 4), 'f%d' % i) for i in range(24)]
        for chain in range(160):
            dev = rnd.choice(['analog-rytm-mk2', 'analog-four-mk2'])
            lock_u = lock_o = None
            shapes = {}
            for step in range(rnd.randrange(3, 12)):
                decls = []
                for mid, sym in rnd.sample(pool, rnd.randrange(0, 12)):
                    if sym not in shapes or rnd.random() < 0.15:
                        shapes[sym] = (rnd.choice(us.SCOPES), rnd.choice([1, 2, 4, 8, 16, 24, 32]))
                    decls.append((mid, sym) + shapes[sym])
                if rnd.random() < 0.05:
                    decls.append(decls[0] if decls else ('m1', 'x', 'big', 1))
                core = rnd.choice([None, '0.2', '0.3', '1.0'])
                a = outcome(us.allocate, lock_u, decls, dev, core)
                b = outcome(os_.allocate, lock_o, decls, dev, core)
                self.assertEqual(a, b)
                count('store allocations')
                if a[0] == 'ok':
                    new_u, _ = us.allocate(lock_u, decls, dev, core)
                    new_o, _ = os_.allocate(lock_o, decls, dev, core)
                    self.assertEqual(us.dumps(new_u), os_.dumps(new_o))
                    self.assertEqual(snap(us.symbols(new_u, dev)), snap(os_.symbols(new_o, dev)))
                    self.assertEqual(us.trailer(new_u), os_.trailer(new_o))
                    image = rnd.randbytes(64) + us.trailer(new_u) + rnd.randbytes(8)
                    self.assertEqual(outcome(us.from_image, image), outcome(os_.from_image, image))
                    lock_u, lock_o = new_u, new_o
                    for _ in range(3):
                        bent = mutate(new_u, rnd)
                        self.assertEqual(outcome(us.check_lock, bent, dev), outcome(os_.check_lock, bent, dev))
                        self.assertEqual(outcome(us.allocate, bent, decls, dev, core),
                                         outcome(os_.allocate, bent, decls, dev, core))
                        count('store lockfile mutations')
        for dev in ('analog-rytm-mk2', 'analog-four-mk2', 'digitakt-mk1'):
            self.assertEqual(us.supports(dev), os_.supports(dev))
            self.assertEqual(outcome(us.fresh, dev), outcome(os_.fresh, dev))
            for split in ({'track': 2, 'pattern': 4}, {'track': 9, 'pattern': 1}):
                for core in (None, '0.2', '0.3'):
                    self.assertEqual(outcome(us.capacity, dev, split, core), outcome(os_.capacity, dev, split, core))
        for m in ({'storage': 3}, {'storage': [{'sym': '1x', 'scope': 'kit', 'bits': 1}]},
                  {'storage': [{'sym': 'a', 'scope': 'kit', 'bits': True}]}, {'storage': [{'sym': 'a', 'x': 1}]},
                  {'storage': [{'sym': 'a', 'scope': 'k', 'bits': 1}]},
                  {'storage': [{'sym': 'a', 'scope': 'kit', 'bits': 1}, {'sym': 'a', 'scope': 'kit', 'bits': 2}]}):
            self.assertEqual(outcome(us.parse_decls, m), outcome(os_.parse_decls, m))
        for image in (b'', b'ELKSTORE\x00\x00\x00\x02{}', b'ELKSTORE\x00\x00\x00\x01\xff'):
            self.assertEqual(outcome(us.from_image, image), outcome(os_.from_image, image))


class Mkmod(unittest.TestCase):
    def test_stock_parts(self):
        rnd = random.Random(6)
        for _ in range(3000):
            stock = bytes(rnd.choice([0, 1, 2, 3, 0x4e, 0x75]) for _ in range(rnd.randrange(0, 200)))
            blob = bytearray()
            while len(blob) < rnd.randrange(0, 200):
                if stock and rnd.random() < 0.5:
                    at = rnd.randrange(len(stock))
                    blob += stock[at:at + rnd.randrange(1, 40)]
                else:
                    blob += rnd.randbytes(rnd.randrange(1, 10))
            minimum = rnd.choice([4, 6, 8])
            load = rnd.choice([0x40000400, 0])
            self.assertEqual(outcome(U['mkmod'].stock_parts, bytes(blob), stock, minimum, load),
                             outcome(O['mkmod'].stock_parts, bytes(blob), stock, minimum, load))
            count('mkmod')


def _syx_variants(raw, rnd, n):
    """Corrupted copies of an OS file: flipped bytes, cut ends, doubled messages."""
    out = []
    for _ in range(n):
        b = bytearray(raw)
        pick = rnd.random()
        if pick < 0.6:
            for _ in range(rnd.randrange(1, 4)):
                at = rnd.randrange(len(b)) if rnd.random() < 0.7 else rnd.randrange(min(len(b), 400))
                b[at] = rnd.randrange(256)
        elif pick < 0.8:
            b = b[:rnd.randrange(len(b))]
        else:
            at = rnd.randrange(len(b) - 200)
            b = b[:at] + b[at:at + rnd.randrange(1, 200)] + b[at:]
        out.append(bytes(b))
    return out


class Files(unittest.TestCase):
    def test_stock_files_read_rebuild_and_verify_alike(self):
        found = stock_files()
        if not found:
            self.skipTest('no stock OS files on this computer')
        for path in found:
            with self.subTest(stock=path.name):
                self._one(path)
            print('files: %s done' % path.name, file=sys.stderr, flush=True)

    def _one(self, path):
        uf, of = U['formats'], O['formats']
        raw = path.read_bytes()
        files = [raw]
        if path.suffix == '.bin' and path.with_suffix('.syx').exists():
            files.append(path.with_suffix('.syx').read_bytes())
        u_stock, u_dev, u_rel = uf.load(str(path))
        o_stock, o_dev, o_rel = of.load(str(path))
        self.assertEqual(snap(u_stock), snap(o_stock))
        self.assertEqual(snap((u_dev, u_rel)), snap((o_dev, o_rel)))
        image = of.main_image(o_stock, o_dev)
        self.assertEqual(uf.main_image(u_stock, u_dev), image)
        stored = o_stock.stored[o_dev.main_section]
        rebuilt_u = uf.write(u_stock, stored, u_dev)
        rebuilt_o = of.write(o_stock, stored, o_dev)
        self.assertEqual(snap(rebuilt_u), snap(rebuilt_o))
        self.assertEqual(rebuilt_o['bin' if path.suffix == '.bin' else 'syx'], raw)   # stock, byte for byte
        for f in files:
            self.assertEqual(outcome(uf.parse, f, u_dev), outcome(of.parse, f, o_dev))
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w') as z:
            z.writestr('readme.txt', 'x')
            z.writestr('OS/' + path.name, raw)
        for blob in (buf.getvalue(), b'PK\x03\x04broken', buf.getvalue()[:-30]):
            self.assertEqual(outcome(uf.load, blob), outcome(of.load, blob))
        empty = io.BytesIO()
        with zipfile.ZipFile(empty, 'w') as z:
            z.writestr('a.syx', b'\xf0\xf7')
        self.assertEqual(outcome(uf.load, empty.getvalue()), outcome(of.load, empty.getvalue()))
        rnd = random.Random(path.name)
        for f in files:
            for bent in _syx_variants(f, rnd, 60):
                self.assertEqual(outcome(uf.parse, bent, u_dev), outcome(of.parse, bent, o_dev))
                count('files corrupted parses')
        for version in (None, '1.0X', 'X', 'ABCDEFGHIJK', 'é', '', '1.40Z'):
            self.assertEqual(outcome(uf.check_version, u_dev, version), outcome(of.check_version, o_dev, version))
        # stock verifies against itself, and patched images write and verify alike
        self.assertEqual(outcome(uf.verify, rebuilt_u, u_stock, image, u_dev),
                         outcome(of.verify, rebuilt_o, o_stock, image, o_dev))
        patched = bytearray(image)
        for _ in range(20):
            at = rnd.randrange(len(patched))
            patched[at] ^= 0xFF
        if o_dev.protected:
            lo = o_dev.protected[0][0] - o_dev.main_load
            prot = bytearray(patched)
            prot[lo + 5] ^= 1
        else:
            prot = None
        patched += rnd.randbytes(3000)
        version = '1.9X' if o_dev.container == 'ele3' else '1.40M'
        stored_new = of.pack_main(bytes(patched), o_dev)
        self.assertEqual(uf.pack_main(bytes(patched), u_dev), stored_new)
        out_u = uf.write(u_stock, stored_new, u_dev, version)
        out_o = of.write(o_stock, stored_new, o_dev, version)
        self.assertEqual(snap(out_u), snap(out_o))
        count('files writes')
        cases = [(out_o, bytes(patched), version), (out_o, bytes(patched), None), (out_o, image, version)]
        if prot is not None:
            cases.append((of.write(o_stock, of.pack_main(bytes(prot), o_dev), o_dev, version), bytes(prot), version))
        for outputs, want, v in cases:
            self.assertEqual(outcome(uf.verify, outputs, u_stock, want, u_dev, v),
                             outcome(of.verify, outputs, o_stock, want, o_dev, v))
            count('files verifies')
        for bent in _syx_variants(out_o['syx'], rnd, 30):
            outputs = dict(out_o, syx=bent)
            self.assertEqual(outcome(uf.verify, outputs, u_stock, bytes(patched), u_dev, version),
                             outcome(of.verify, outputs, o_stock, bytes(patched), o_dev, version))
            count('files corrupted verifies')
        if 'bin' in out_o:
            for bent in _syx_variants(out_o['bin'], rnd, 15):
                outputs = dict(out_o, bin=bent)
                self.assertEqual(outcome(uf.verify, outputs, u_stock, bytes(patched), u_dev, version),
                                 outcome(of.verify, outputs, o_stock, bytes(patched), o_dev, version))
                count('files corrupted verifies')
        for f in [out_o['syx']] + _syx_variants(out_o['syx'], rnd, 5):
            try:
                built_u, built_o = uf.parse(f, u_dev), of.parse(f, o_dev)
            except Exception:  # noqa: BLE001 - a corrupt file, already compared above
                continue
            self.assertEqual(outcome(uf.header_problems, u_stock, built_u, u_dev),
                             outcome(of.header_problems, o_stock, built_o, o_dev))
        if o_dev.container == 'ele3':
            us_, os_ = U['syx'], O['syx']
            self.assertEqual(outcome(us_.inplace_depack, stored_new, u_dev), outcome(os_.inplace_depack, stored_new, o_dev))
            for sid in o_stock.stored:
                self.assertEqual(us_.classify(o_stock.stored[sid]), os_.classify(o_stock.stored[sid]))
            if o_dev.trailer == 'hmac':
                self.assertEqual(us_.seal_key(u_stock, u_dev), os_.seal_key(o_stock, o_dev))
            for v in ('12345', 'ab'):
                self.assertEqual(outcome(us_.write, u_stock, stored_new, u_dev, v),
                                 outcome(os_.write, o_stock, stored_new, o_dev, v))
            for dev_change in ({'trailer': 'aes'}, {'stage': o_dev.main_load + 16}):
                self.assertEqual(outcome(us_.write, u_stock, stored_new, dataclasses.replace(u_dev, **dev_change)),
                                 outcome(os_.write, o_stock, stored_new, dataclasses.replace(o_dev, **dev_change)))
                self.assertEqual(outcome(us_.verify, out_u['syx'], u_stock, bytes(patched),
                                         dataclasses.replace(u_dev, **dev_change)),
                                 outcome(os_.verify, out_o['syx'], o_stock, bytes(patched),
                                         dataclasses.replace(o_dev, **dev_change)))
        else:
            ue, oe = U['elek'], O['elek']
            for seed in (0, 0x2F1349D2, 0xFFFFFFFF, 0x12345678):
                self.assertEqual(ue.encode_bin(o_stock.container, seed), oe.encode_bin(o_stock.container, seed))
            for v in ('', 'ABCDEFGHIJK', '1.40C'):
                self.assertEqual(outcome(ue.write, u_stock, stored_new, u_dev, v),
                                 outcome(oe.write, o_stock, stored_new, o_dev, v))
            dsp_u, dsp_o = U['dsp'], O['dsp']
            for tag in ('A', 'B', 'C'):
                self.assertEqual(outcome(dsp_u.records, image, u_dev, tag), outcome(dsp_o.records, image, o_dev, tag))
                for lo, hi in ((0xaa8, 0xbad), (0, 1), (0x10, 0x5000), (0x7d1, 0x7d3)):
                    self.assertEqual(outcome(dsp_u.p_span, image, u_dev, tag, lo, hi),
                                     outcome(dsp_o.p_span, image, o_dev, tag, lo, hi))
            for _ in range(300):
                bent = bytearray(image)
                at, n = o_dev.dsp_payloads[rnd.choice('AB')]
                for _ in range(rnd.randrange(1, 4)):
                    bent[at - o_dev.main_load + rnd.randrange(min(n, 60) if rnd.random() < 0.5 else n)] = rnd.randrange(256)
                for tag in 'AB':
                    self.assertEqual(outcome(dsp_u.records, bytes(bent), u_dev, tag),
                                     outcome(dsp_o.records, bytes(bent), o_dev, tag))
                count('dsp payloads')
            short = image[:0xE3000]
            self.assertEqual(outcome(dsp_u.records, short, u_dev, 'B'), outcome(dsp_o.records, short, o_dev, 'B'))


OCTATRACK_BASES = (('src/engine/assets/octatrack-base.elemod', 'src/engine/assets/octatrack-base-fills.json'),
                   ('src/engine/assets/octatrack-base-step.elemod', 'src/engine/assets/octatrack-base-step-fills.json'),
                   ('src/engine/assets/linked-audio-0.7.11/octatrack-base.elemod',
                    'src/engine/assets/linked-audio-0.7.11/octatrack-base-fills.json'))


def _octatrack_bases(tmp):
    """The committed Octatrack base packages with their stock DSP fills put back from the owner's OS file, as the
    browser does it (fillBase in src/engine/elekloader/octatrack-base.ts, run in Node: the fills' DSP words are
    recovered there from the stock image). -> [paths], empty when Node or the stock file is missing."""
    stock = STOCK[-1]
    node = shutil.which('node')
    if not stock.exists() or not node:
        return []
    pairs = [(pkg, fills, str(Path(tmp) / ('filled-%d.elemod' % i))) for i, (pkg, fills) in enumerate(OCTATRACK_BASES)
             if (ROOT / pkg).exists() and (ROOT / fills).exists()]
    script = (
        "import { readFileSync, writeFileSync } from 'node:fs';"
        "import { join } from 'node:path'; import { pathToFileURL } from 'node:url';"
        "const [root, stockPath, jobs] = process.argv.slice(1);"
        "const imp = p => import(pathToFileURL(join(root, p)).href);"
        "const formats = await imp('vendor/elekloader/kit/src/formats.ts');"
        "const { recoverStockDsp } = await imp('src/engine/stock-dsp.ts');"
        "const { fillBase } = await imp('src/engine/elekloader/octatrack-base.ts');"
        "const [parsed, device] = await formats.load(new Uint8Array(readFileSync(stockPath)));"
        "const cores = await recoverStockDsp(formats.mainImage(parsed, device));"
        "for (const [pkg, fills, out] of JSON.parse(jobs))"
        "  writeFileSync(out, fillBase(readFileSync(join(root, pkg), 'utf8'),"
        "    JSON.parse(readFileSync(join(root, fills), 'utf8')), cores));")
    try:
        subprocess.run([node, '--input-type=module', '-e', script, str(ROOT), str(stock), json.dumps(pairs)],
                       check=True, capture_output=True, timeout=300)
    except (subprocess.SubprocessError, OSError):
        return []
    return [out for _p, _f, out in pairs]


class Linking(unittest.TestCase):
    """Random sets of the repository's real packages, linked and built by both."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix='own-builder-')
        cls.by_release = {}
        for path, doc, raw in packages():
            t = doc.get('target') or {}
            cls.by_release.setdefault(t.get('syx_sha256'), []).append((path, doc, raw))
        cls.bases = _octatrack_bases(cls.tmp)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def test_random_sets_link_and_build_alike(self):
        found = stock_files()
        if not found:
            self.skipTest('no stock OS files on this computer')
        for path in found:
            with self.subTest(stock=path.name):
                self._stock(path)
            print('linking: %s done' % path.name, file=sys.stderr, flush=True)

    def _stock(self, path):
        stock, dev, rel = O['formats'].load(str(path))
        image = O['formats'].main_image(stock, dev)
        pkgs = self.by_release.get(rel.syx_sha256, []) + self.by_release.get(rel.bin_sha256, [])
        pkgs = [p for p in pkgs if (p[1].get('target') or {}).get('device') == dev.key]
        files = {}
        for p, doc, raw in pkgs:
            f = Path(self.tmp) / ('%s-%s' % (sha(raw)[:12], p.name))
            f.write_bytes(raw)
            files[str(f)] = (doc, raw)
        cores = [f for f, (doc, _r) in files.items() if '.boot' in (doc.get('sections') or {})]
        others = [f for f in files if f not in cores]
        if not cores:
            self.skipTest('no core for %s' % path.name)
        rnd = random.Random('sets ' + path.name)
        sets = []
        by_id = {}
        for f in others:
            by_id.setdefault(files[f][0].get('id'), []).append(f)
        for _ in range(SETS):
            chosen = [rnd.choice(cores)] if rnd.random() < 0.95 else rnd.sample(cores, min(len(cores), rnd.choice([0, 2])))
            chosen += rnd.sample(others, min(len(others), rnd.randrange(0, 6)))
            if rnd.random() < 0.8:          # mostly sets whose requirements are met, so most of them link
                for _ in range(3):
                    have = {files[f][0].get('id') for f in chosen}
                    for f in list(chosen):
                        for need in files[f][0].get('requires', []):
                            if need not in have and by_id.get(need):
                                chosen.append(rnd.choice(by_id[need]))
                                have.add(need)
            rnd.shuffle(chosen)
            sets.append(chosen)
        linked = []
        for chosen in sets:
            if self._compare_link(chosen, files, image):
                linked.append(chosen)
            self._compare_build(str(path), chosen, True)
        built = sorted(linked, key=len, reverse=True)[:BUILDS]     # the largest sets that link
        for i, chosen in enumerate(built):    # the first with the packages' own version (or a refusal), then a given one
            self._compare_build(str(path), chosen, False, None if i == 0 else ('MW01' if dev.container == 'ele3' else 'MODWERK'))
        if dev.key == 'octatrack':
            if not self.bases:
                print('\nown builder: the Octatrack bases were not filled (Node or the stock file missing)', file=sys.stderr)
            for base in self.bases:
                self._compare_link([base], {base: (json.loads(Path(base).read_bytes()), Path(base).read_bytes())}, image)
                self._compare_build(str(path), [base], False, 'MODWERK')     # as the browser builds it
                count('octatrack filled base builds')

    def _compare_link(self, chosen, files, image):
        def run(side):
            mods = [side['link'].Mod2(files[f][0], Path(f).name, files[f][1]) for f in chosen]
            linked = side['link'].link(mods, image, None)
            return {'image': sha(linked.image), 'len': len(linked.image), 'map': json.dumps(linked.map),
                    'layout': json.dumps(linked.layout), 'tables': linked.tables, 'order': linked.order,
                    'store': linked.store, 'notes': linked.store_notes,
                    'names': [m.names for m in mods]}
        result = outcome(run, U)
        self.assertEqual(result, outcome(run, O), chosen)
        count('link sets' if result[0] == 'ok' else 'link refusals')
        return result[0] == 'ok'

    def _compare_build(self, stock_path, chosen, check_only, version=None):
        def run(side):
            logs = []
            outputs, man = side['patch'].build(stock_path, chosen, version, check_only,
                                               log=lambda line: logs.append(re.sub(r'\(\d+\.\d s\)', '(t s)', line)))
            man = dict(man, patcher='-')
            smap = man.pop('_map', None)
            return {'outputs': {k: sha(v) for k, v in (outputs or {}).items()},
                    'manifest': json.dumps(man, indent=1),
                    'map': json.dumps({k: '0x%08x' % v for k, v in sorted(smap.items())}, indent=0) if smap else None,
                    'logs': logs}
        a, b = outcome(run, U), outcome(run, O)
        self.assertEqual(a, b, chosen)
        count(('patch checks' if check_only else 'patch builds') + ('' if a[0] == 'ok' else ' (refused)'))
        if not check_only and a[0] == 'ok':
            _o, man = O['patch'].build(stock_path, chosen, None, True, log=lambda line: None)
            self.assertEqual(man['patcher'], 'modwerk')


if __name__ == '__main__':
    unittest.main()
