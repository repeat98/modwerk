# SPDX-License-Identifier: GPL-3.0-or-later
"""The machine-neutral runtime module loader (sdk/runtime/loader): its C host
test, the builder's relocation finder and, with a ColdFire cross compiler, a
real module build. No firmware or device."""
import hashlib
import importlib.util
import json
import os
import re
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest
from host_flags import SANITIZE  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
LOADER = ROOT / 'sdk/runtime/loader'
spec = importlib.util.spec_from_file_location('runtime_loader_build', LOADER / 'build.py')
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)
spec = importlib.util.spec_from_file_location('runtime_loader_verify', LOADER / 'verify_static.py')
verify_static = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify_static)


class LoaderTests(unittest.TestCase):
    def test_loader_on_the_host(self):
        cc = shutil.which('cc')
        if not cc:
            self.skipTest('no host C compiler')
        octatrack = ('-DRUNTIME_MODULES=128u', '-DRUNTIME_POOL_BYTES=786432u')
        # the default, the Octatrack's, and both with build_core.py --cached-modules
        for defines in ((), octatrack, ('-DMODWERK_CACHED_MODULES',), octatrack + ('-DMODWERK_CACHED_MODULES',),
                        octatrack + ('-DMODWERK_RUNTIME_SETS',),
                        octatrack + ('-DMODWERK_RUNTIME_SETS', '-DMODWERK_CACHED_MODULES')):
            with self.subTest(defines), tempfile.TemporaryDirectory() as temp:
                subprocess.run([cc, '-std=c99', '-Wall', '-Wextra', '-Werror', '-pedantic', *defines, '-I', LOADER,
                                    '-I', ROOT / 'sdk/runtime/upload', LOADER / 'tests/host_test.c',
                                    *([ROOT / 'sdk/runtime/upload/upload.c'] if '-DMODWERK_RUNTIME_SETS' in defines else []),
                                    '-o', temp + '/t'],
                               check=True, capture_output=True)
                result = subprocess.run([temp + '/t'], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_relocations_are_the_words_that_move_with_the_link_address(self):
        low = struct.pack('>HIHI', 0x4e71, 0x10, 0x4e75, 0x40001e50)  # a self-reference, then a stock address
        high = struct.pack('>HIHI', 0x4e71, 0x10010, 0x4e75, 0x40001e50)
        self.assertEqual(build.relocations(low, high, 0x20), [2])
        with self.assertRaisesRegex(ValueError, 'outside'):
            build.relocations(low, high, 0x10)
        with self.assertRaisesRegex(ValueError, 'cannot relocate'):  # e.g. a 16-bit reference
            build.relocations(low, struct.pack('>HIHI', 0x4e71, 0x10, 0x4e75, 0x40001e51), 0x20)

    def test_package_layout(self):
        site = (0x40094296, b'\x70\x20\x11\x40\x00\x0e', b'\x4e\xf9\0\0\0\0', [2])
        data = build.package(b'\x4e\x75\0\0', 8, [0, build.NONE, build.NONE, build.NONE], [0], [site], name='octabam-previewvol')
        ident = int.from_bytes(hashlib.sha256(b'octabam-previewvol').digest()[:4], 'big')
        self.assertEqual(data[:32], b'MWRM' + struct.pack('>HHIIIIII', 4, 0, 4, 8, 1, 4, 1, ident))
        self.assertEqual(data[32 + 16 + 4 + 4:], struct.pack('>IHH', 0x40094296, 6, 1) + site[1] + site[2] + b'\0\2')
        self.assertEqual(verify_static.unpack(data), (b'\x4e\x75\0\0', (0,), [(0x40094296, site[1], site[2], (2,))]))
        with self.assertRaisesRegex(ValueError, 'bounds'):
            build.package(b'', 0, [], [], [(0x40000400, b'\0' * 34, b'\0' * 34, [])])

    def test_abi8_constant_initializers_are_explicit_and_bounded(self):
        image = bytes(544)
        digest = hashlib.sha256(b'authored fixture').digest()
        data = build.package(image, 0, [], [], name='group', hashed=True, title='Machines', layout=37,
                             copies=[(8, 0x40001000, 6, digest)], fills=[(32, 512, 255)])
        self.assertEqual(data[:8], b'MWRM\0\10\0\0')
        self.assertEqual(struct.unpack_from('>II', data, 68), (1, 1))
        raw, offsets, sites, copies, fills = verify_static.unpack_recipe(data)
        self.assertEqual((raw, offsets, sites, fills), (image, (), [], [(32, 512, 255)]))
        self.assertEqual(copies, [(8, 0x40001000, 6, digest)])
        self.assertEqual(verify_static.unpack_all(data)[0], bytes(32) + bytes([255]) * 512)
        for kwargs in ({'fills': [(8, 8, 255)]}, {'fills': [(32, 512, 0)]},
                       {'fills': [(32, 513, 255)]}, {'fills': [(32, 32, 1), (40, 8, 2)]},
                       {'offsets': [32]}, {'image': bytes([1]) * 544}):
            args = dict(image=image, bss=0, hooks=[], offsets=[], name='group', hashed=True, title='Machines',
                        copies=[(8, 0x40001000, 6, digest)], fills=[(32, 512, 255)], abi=8)
            args.update(kwargs)
            with self.subTest(kwargs=kwargs), self.assertRaises(ValueError):
                build.package(**args)
        # Explicit ABI8 selection supports larger composed-site sets, while an
        # ABI7 build cannot silently claim more than its original base accepts.
        site = (0x40001000, digest, bytes(2), [], 0, 2)
        self.assertEqual(build.package(bytes(4), 0, [], [], [site] * 65, name='group', hashed=True,
                                       title='Machines')[5], 8)
        with self.assertRaises(ValueError):
            build.package(bytes(4), 0, [], [], [site] * 65, name='group', hashed=True, title='Machines', abi=7)

    def test_dsp_effect_package(self):
        import json
        pkg = next(p for p in json.loads((ROOT / 'src/engine/assets/dsp-packages.json').read_text())['packages'] if p['id'] == 'everb')
        dsp = build.dsp_section(pkg, 'fx2', 382, 'executed', 132, 15870, 'E-Verb', 2)
        self.assertEqual((len(dsp['words']), dsp['relocations'], dsp['effect'], dsp['slots'], dsp['kind']), (1602, [5, 70, 697], 27, 2, 1))
        data = build.package(b'', 0, [], [], name='everb', dsp=dsp)
        self.assertEqual(data[:8], b'MWRM\0\6\0\0')
        self.assertEqual(struct.unpack_from('>IHBBHHHBBH', data, 32), (1602, 3, 27, 2, 0, 51, 382, 1, 132, 15870))
        self.assertEqual((data[50:66], struct.unpack_from('>H', data, 66)[0]), (b'E-Verb' + b'\0' * 10, 2)) # ABI 6: name, layout
        self.assertEqual(len(data), 68 + 4 * 1602 + 2 * 3)
        self.assertEqual(struct.unpack_from('>I', data, 68)[0], dsp['words'][0])
        self.assertEqual(verify_static.unpack(data), (b'', (), []))
        for broken in ({'proofs': [{'base': 4096, 'sha256': '0' * 64}] * 2}, {'proofs': []}, {'sha256': '0' * 64}):
            with self.subTest(broken=list(broken)), self.assertRaises(ValueError):
                build.dsp_section({**pkg, **broken}, 'fx2', 382, 'executed', 132, 16384, 'E-Verb')
        with self.assertRaisesRegex(ValueError, 'state words'):
            build.dsp_section(pkg, 'fx2', 382, 'executed', 133, 16384, 'E-Verb')
        with self.assertRaisesRegex(ValueError, 'display name'):
            build.dsp_section(pkg, 'fx2', 382, 'executed', 132, 16384, 'A' * 16)

    def test_abi9_base_features_claims_and_hook_entries(self):
        pkg = next(p for p in json.loads((ROOT / 'src/engine/assets/dsp-packages.json').read_text())['packages'] if p['id'] == 'everb')
        dsp = build.dsp_section(pkg, 'fx2', 382, 'executed', 132, 16384, 'E-Verb', 2)
        spec = importlib.util.spec_from_file_location('runtime_loader_abi9', LOADER / 'abi9.py')
        abi9 = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(abi9)
        claims = [('y', 0, 'r', 0x800, 0x200), ('y', 1, 'rw', 0x3be00, 0x20)]
        for source in (build.package(b'', 0, [], [], name='everb', dsp=dsp),                       # ABI 6
                       build.package(b'', 0, [], [], name='everb', dsp=dsp, hashed=True),          # ABI 7
                       build.package(b'', 0, [], [], name='everb', dsp=dsp, hashed=True, abi=8)):  # ABI 8
            data = abi9.upgrade(source, abi9.base_features(['keybus']), claims, [(0, 3, 51)])
            self.assertEqual(data[:8], b'MWRM\0\x09\0\0')
            self.assertEqual(data[8:68], source[8:68])
            self.assertEqual(struct.unpack_from('>IIHBB', data, 68), (0, 0, 8, 2, 1))  # copies, fills, requires, claims, entries
            self.assertEqual([struct.unpack_from('>BBBxII', data, 80 + 12 * i) for i in range(2)],
                             [(2, 0, 1, 0x800, 0x200), (2, 1, 3, 0x3be00, 0x20)])
            self.assertEqual(struct.unpack_from('>BBHI', data, 104), (0, 3, 0, 51))
            self.assertEqual(data[112:], source[{6: 68, 7: 72, 8: 76}[source[5]]:])  # the DSP words, unchanged
            self.assertEqual(verify_static.unpack(data), (b'', (), []))
        self.assertEqual(abi9.upgrade(source, 8)[76:80], b'\0\x08\0\0')
        for bad in ({'claims': [('z', 0, 'r', 0, 1)]}, {'claims': [('y', 2, 'r', 0, 1)]}, {'claims': [('y', 0, 'x', 0, 1)]},
                    {'claims': [('y', 0, 'r', 0x2fff0, 0x20)]}, {'claims': [('y', 0, 'r', 0x100, 8), ('y', 0, 'w', 0x107, 1)]},
                    {'claims': [('y', 0, 'r', 0x33e00, 8), ('x', 1, 'r', 0x33e04, 1)]}, {'entries': [(0, 0, 1)]},
                    {'entries': [(0, 1, 1), (0, 2, 2)]}, {'entries': [(0, 1, len(dsp['words']))]}, {'requires': 1 << 16},
                    {'data': build.package(b'\x4e\x75\0\0', 0, [0, build.NONE, build.NONE, build.NONE], [])},  # no DSP code
                    {'data': abi9.upgrade(source, 8)}):                                                       # already 9
            args = dict(data=source, requires=8)
            args.update(bad)
            with self.subTest(bad=list(bad)), self.assertRaises(ValueError):
                abi9.upgrade(**args)
        with self.assertRaises(ValueError):
            abi9.base_features(['no-such-feature'])

    def test_published_module_packages_rebuild_byte_for_byte(self):
        if not shutil.which('node'):
            self.skipTest('no Node for the FX page recipes')
        result = subprocess.run([sys.executable, '-B', ROOT / 'scripts/octatrack-module-packages.py', '--check'],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_converted_module_becomes_image_relocations_and_sites(self):
        stock = {0x40001000: bytes.fromhex('70201140000e'), 0x40002000: bytes.fromhex('4e714e71')}
        doc = {'sections': {'.run': {'align': 4, 'len': 18, 'parts': [['hex', '114000000000'], ['stock', '0x40002000', 4],
                                                                       ['hex', '0000000040003000']]}},
               'symbols': {'entry': ['.run', 6], 'VOL': ['abs', 64]},
               'relocs': [['.run', 10, 'abs32', 'sec:.run', 4], ['.run', 2, 'abs32', 'sym:VOL', 0]],
               'sites': [{'addr': '0x40001000', 'len': 6, 'kind': 'code', 'new': '4ef900000000',
                          'stock_sha256': hashlib.sha256(stock[0x40001000]).hexdigest(),
                          'relocs': [[2, 'abs32', 'sym:entry', 0]]}]}
        image, offsets, sites = build.link_elemod(doc, lambda a, n: stock[a][:n], {})
        self.assertEqual(image, bytes.fromhex('114000000040') + stock[0x40002000] + bytes.fromhex('0000000440003000'))
        self.assertEqual(offsets, [10])  # the section reference; the constant VOL is written as it is
        self.assertEqual(sites, [(0x40001000, stock[0x40001000], bytes.fromhex('4ef900000006'), [2])])
        doc['sites'][0]['stock_sha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'Stock bytes'):
            build.link_elemod(doc, lambda a, n: stock[a][:n], {})
        for key, value in (('contribute', [{'to': 'ev_midi'}]), ('sites', [{'addr': '0x40001000', 'len': 6, 'kind': 'data'}])):
            with self.subTest(key), self.assertRaises(ValueError):
                build.link_elemod({**doc, key: value}, lambda a, n: stock[a][:n], {})
        with self.assertRaisesRegex(ValueError, 'Unresolved'):
            build.link_elemod({**doc, 'relocs': [['.run', 10, 'abs32', 'sym:arena_base', 0]]}, lambda a, n: stock[a][:n], {})

    def test_builds_the_octatrack_example(self):
        if not shutil.which('m68k-elf-gcc'):
            self.skipTest('no ColdFire cross compiler')
        with tempfile.TemporaryDirectory() as temp:
            out = Path(temp) / 'hello.mwrm'
            subprocess.run(['python3', '-B', LOADER / 'build.py', ROOT / 'sdk/machines/octatrack/elekloader/examples/hello.c',
                            '-o', out], check=True, capture_output=True)
            data = out.read_bytes()
        abi, image, bss, count, hooks, sites, ident = struct.unpack_from('>4xH2xIIIIII', data)
        self.assertEqual((abi, hooks, sites, ident), (4, 4, 0, build.module_id('hello')))
        self.assertGreater(count, 0)  # its counters are reached through absolute addresses
        self.assertNotIn(build.NONE, struct.unpack_from('>4I', data, 32))
        self.assertEqual(len(data), 32 + 16 + image + 4 * count)


EVENTS_DIR = ROOT / 'sdk/machines/octatrack'
spec = importlib.util.spec_from_file_location('octatrack_events', EVENTS_DIR / 'events.py')
events = importlib.util.module_from_spec(spec)
spec.loader.exec_module(events)


class SiteEventTests(unittest.TestCase):
    """The Octatrack's events at base-owned stock sites: registry, generated files, loader rows, builder."""

    def test_rows_refusals_and_rollback_on_the_host(self):
        cc = shutil.which('cc')
        if not cc:
            self.skipTest('no host C compiler')
        for defines in (('-DRUNTIME_MODULES=32u',), ('-DRUNTIME_MODULES=128u', '-DRUNTIME_POOL_BYTES=786432u')):
            with self.subTest(defines), tempfile.TemporaryDirectory() as temp:
                subprocess.run([cc, '-std=c99', '-Wall', '-Wextra', '-Werror', '-pedantic', '-g', *SANITIZE,
                                '-fno-sanitize-recover=all', *defines, '-I', LOADER / 'tests/events', '-I', LOADER,
                                '-I', ROOT / 'sdk/runtime/upload', LOADER / 'tests/events_test.c', '-o', temp + '/t'],
                               check=True, capture_output=True)
                result = subprocess.run([temp + '/t'], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_generated_files_are_current_and_the_loader_takes_them(self):
        for path, text in events.generate().items():
            self.assertEqual((EVENTS_DIR / path).read_text(), text, path + ' is stale: run events.py --write')
        reg = events.load()
        header = (EVENTS_DIR / 'elekloader/runtime_events.h').read_text()
        self.assertIn('#define RUNTIME_SITE_EVENTS %du' % len(reg['events']), header)
        self.assertEqual([e['index'] for e in reg['events']], list(range(4, 4 + len(reg['events']))))
        cc = shutil.which('cc')
        if cc:  # the real generated header compiles into the loader
            subprocess.run([cc, '-std=c99', '-Wall', '-Wextra', '-Werror', '-pedantic', '-fsyntax-only', '-DMODWERK_RUNTIME_EVENTS',
                            '-I', EVENTS_DIR / 'elekloader', '-I', LOADER, '-I', ROOT / 'sdk/runtime/upload', LOADER / 'loader.c'],
                           check=True, capture_output=True)

    def test_registry_guards_are_the_ones_modules_name(self):
        """Every catalogue detour on an event's site sits exactly on it with the registry's length and stock hash."""
        sys.path.insert(0, str(ROOT / 'sdk/octabam/tools'))
        from remix import registry
        sys.path.insert(0, str(EVENTS_DIR / 'module-adapters'))
        import machine_ports
        reg, met = events.load(), set()
        for manifest in sorted((ROOT / 'sdk/octabam/modules').glob('*/manifest.py')):
            module = registry._load_one(manifest)
            retarget = (machine_ports.port(module.name) or {}).get('retarget', {})
            for d in module.detours:
                # a machine port's retarget narrows the guard its package carries (machine_ports.ported)
                guard = retarget[d.symbol]['guardLength'] if d.symbol in retarget else d.expect.length
                for at, site in reg['sites'].items():
                    if d.site < at + site['length'] and at < d.site + max(d.pad_to or 6, guard):
                        kind = next(e['kind'] for e in reg['events'] if e['site'] == at)
                        if kind == 'take':  # a taker's detour starts on the site and covers it; the base keeps the guard
                            self.assertTrue(d.site == at and max(d.pad_to or 6, d.expect.length) >= site['length'],
                                            '%s %s' % (module.name, d.symbol))
                        else:
                            self.assertEqual((d.site, d.pad_to, d.expect.length, d.expect.sha256), (at, site['length'], site['length'], site['guard']),
                                             '%s %s' % (module.name, d.symbol))
                        met.add((module.name, d.symbol))
        self.assertTrue({('repitch', 'rate_hook'), ('mute-modes', 'fresh_bind'), ('poly8', 'mr_rate_hook'), ('poly8', 'mr_stop_voice'),
                         ('poly8', 'mr_note_on'), ('synth', 'po_mon'), ('quantizer', 'qz_boot'), ('synth', 'qz_boot')} <= met)

    def test_call_events_pass_registers_at_the_site(self):
        # ev_tail_kill(record, track): the site's a2 from the dispatch's saved frame, d4 as it stands
        self.assertIn('        move.l  %d4,-(%sp)\n        move.l  20(%sp),-(%sp)\n', events.asm(events.load()))
        doc = json.loads((EVENTS_DIR / 'events.json').read_text())
        for args in (['a7'], ['d8'], ['sp'], ['d2x']):
            bad = json.loads(json.dumps(doc)); next(e for e in bad['events'] if e['event'] == 'ev_tail_kill')['args'] = args
            with tempfile.TemporaryDirectory() as temp, self.subTest(args), self.assertRaises(ValueError):
                Path(temp, 'events.json').write_text(json.dumps(bad)); events.load(Path(temp, 'events.json'))

    def test_raised_events_have_a_base_entry_and_no_site(self):
        reg = events.load()
        raised = events.raised(reg)
        self.assertEqual(raised, {'ev_mute_keep': 'modwerk_raise_ev_mute_keep', 'ev_trig_muted': 'modwerk_raise_ev_trig_muted'})
        self.assertEqual(events.index('ev_trig_muted', reg), 35)  # released hook indices never move
        self.assertNotIn(None, reg['sites'])
        header = events.loader(reg)
        self.assertIn('{0x00000000u, 0u}', header)  # no span: the loader's site checks never meet it
        words = re.search(r'#define RUNTIME_SITE_EVENT_RAISES \{ (.*) \}', header).group(1).split(', ')
        self.assertEqual(len(words), len(reg['events']))  # by hook index: the base's entry on a raised event, else 0
        self.assertEqual({i + 4: w for i, w in enumerate(words) if w != '0'},
                         {7: '(uintptr_t)modwerk_raise_ev_mute_keep', 35: '(uintptr_t)modwerk_raise_ev_trig_muted'})
        for name in raised:
            self.assertIn('modwerk_%s *raise_%s' % (name, name), events.sdk(reg))
        asm = shutil.which('m68k-elf-as')
        if asm:
            with tempfile.TemporaryDirectory() as temp:
                subprocess.run([asm, '-mcpu=5475', EVENTS_DIR / 'elekloader/runtime_events.s', '-o', temp + '/e.o'], check=True, capture_output=True)
                rows = {n.split()[2]: int(n.split()[0], 16) for n in subprocess.check_output(['m68k-elf-nm', temp + '/e.o'], text=True).splitlines()
                        if len(n.split()) == 3}
            for entry in raised.values():
                self.assertTrue(rows['modwerk_events_code'] <= rows[entry] < rows['modwerk_events_code_end'])
        doc = json.loads((EVENTS_DIR / 'events.json').read_text())
        for change in (dict(results='notify'), dict(args=['site+4']), dict(length=8)):
            bad = json.loads(json.dumps(doc)); next(e for e in bad['events'] if e['event'] == 'ev_mute_keep').update(change)
            with tempfile.TemporaryDirectory() as temp, self.subTest(change), self.assertRaises(ValueError):
                Path(temp, 'events.json').write_text(json.dumps(bad)); events.load(Path(temp, 'events.json'))
        self.assertEqual(build.subscribe([build.NONE] * 4, [], {'raise_ev_mute_keep': 0x40}, raises=['ev_mute_keep']),
                         [build.NONE] * 7 + [build.RAISE << 24 | 0x40])
        for raises, symbols in ((['ev_voice_bind'], {'raise_ev_voice_bind': 0x40}), (['ev_mute_keep'], {}),
                                (['ev_mute_keep'], {'raise_ev_mute_keep': 0x41}), (['ev_mute_keep'] * 2, {'raise_ev_mute_keep': 0x40})):
            with self.subTest(raises=raises, symbols=symbols), self.assertRaises(ValueError):
                build.subscribe([build.NONE] * 4, [], symbols, raises=raises)
        with self.assertRaises(ValueError):  # 255 is the raise marker, never an order
            build.subscribe([build.NONE] * 4, [dict(event='ev_mute_keep', fn='f', order=255)], {'f': 2})
        with tempfile.TemporaryDirectory() as temp:
            for text in ('{"schema": 1, "subscribe": [{"event": "module_tick", "fn": "f", "order": 1}]}',
                         '{"schema": 1, "subscribe": [{"event": "ev_voice_bind", "fn": "f"}]}',
                         '{"schema": 1, "subscribe": [{"event": "module_tick", "fn": "f"}], "raise": "ev_mute_keep"}',
                         '{"schema": 1, "subscribe": [{"event": "module_tick", "fn": "f"}], "raise": ["a", "a"]}'):
                Path(temp, 'runtime.json').write_text(text)
                with self.subTest(text), self.assertRaises(ValueError):
                    build.runtime_declaration(temp)
            Path(temp, 'runtime.json').write_text('{"schema": 1, "subscribe": [{"event": "module_tick", "fn": "f"}], "raise": ["ev_mute_keep"]}')
            doc = build.runtime_declaration(temp)
        self.assertEqual(build.subscribe([build.NONE] * 4, doc['subscribe'], {'f': 0x12}), [0x12])
        with self.assertRaises(ValueError):  # one tick handler
            build.subscribe([build.NONE] * 4, doc['subscribe'] * 2, {'f': 0x12})
        build.unevented([(0x40000000, b'', b'\0' * 6, [], 0, 6)])  # a raised event's empty span meets nothing
        spec = importlib.util.spec_from_file_location('module_packages_caps', ROOT / 'sdk/machines/octatrack/elekloader/module_packages.py')
        packages = importlib.util.module_from_spec(spec); spec.loader.exec_module(packages)
        image = bytes(8)
        tick = build.package(image, 0, [0], [], hashed=True, title='t', abi=8)
        evented = build.package(image, 0, [0] + [build.NONE] * 6 + [build.RAISE << 24 | 4], [], hashed=True, title='t', abi=8)
        self.assertEqual(packages.capabilities(tick)['features'], 0)      # a core tick needs nothing new of the base
        self.assertEqual(packages.capabilities(evented)['features'], 128)  # a site event (or a raise) needs MWCP 128

    def test_dispatch_assembles_without_the_displaced_stock_bytes(self):
        asm = shutil.which('m68k-elf-as')
        if not asm:
            self.skipTest('no ColdFire assembler')
        with tempfile.TemporaryDirectory() as temp:
            subprocess.run([asm, '-mcpu=5475', EVENTS_DIR / 'elekloader/runtime_events.s', '-o', temp + '/e.o'], check=True, capture_output=True)
            subprocess.run(['m68k-elf-objcopy', '-O', 'binary', '-j', '.text', temp + '/e.o', temp + '/e.bin'], check=True)
            code = Path(temp + '/e.bin').read_bytes()
            names = subprocess.check_output(['m68k-elf-nm', temp + '/e.o'], text=True)
        for at, site in events.load()['sites'].items():
            self.assertIn('modwerk_site_%08x' % at, names)
            windows = {hashlib.sha256(code[i:i + site['length']]).hexdigest() for i in range(0, len(code) - site['length'] + 1, 2)}
            self.assertNotIn(site['guard'], windows)  # no displaced stock run is carried whole

    def test_builder_subscriptions(self):
        reg = events.load()
        words = build.subscribe([build.NONE] * 4, [dict(event='ev_voice_bind', fn='f', order=50)], {'f': 0x356})
        self.assertEqual(words, [build.NONE] * 5 + [50 << 24 | 0x356])
        self.assertEqual(build.subscribe([0x10, build.NONE, build.NONE, build.NONE], [], {}), [0x10])
        for bad in (dict(event='ev_nope', fn='f', order=1), dict(event='ev_voice_bind', fn='g', order=1),
                    dict(event='ev_voice_bind', fn='f', order=256)):
            with self.subTest(bad), self.assertRaises(ValueError):
                build.subscribe([build.NONE] * 4, [bad], {'f': 2})
        with self.assertRaises(ValueError):  # one handler per event
            build.subscribe([build.NONE] * 4, [dict(event='ev_voice_bind', fn='f', order=1)] * 2, {'f': 2})
        guard = type('Guard', (), dict(sha256=reg['sites'][0x40006820]['guard'], length=8))()
        detour = lambda site, symbol, pad=8, g=guard: type('Detour', (), dict(site=site, symbol=symbol, pad_to=pad, expect=g))()
        kept = build.replaced([detour(0x40006820, 'fresh_bind'), detour(0x40004dc6, 'pre', 6)],
                              [dict(event='ev_voice_bind', fn='mm_voice_bind', order=50, replaces='fresh_bind')])
        self.assertEqual([d.symbol for d in kept], ['pre'])
        for wrong in (detour(0x40006822, 'fresh_bind'), detour(0x40006820, 'fresh_bind', 6)):
            with self.assertRaises(ValueError):
                build.replaced([wrong], [dict(event='ev_voice_bind', fn='x', order=50, replaces='fresh_bind')])
        with self.assertRaises(ValueError):
            build.replaced([], [dict(event='ev_voice_bind', fn='x', order=50, replaces='fresh_bind')])
        with self.assertRaisesRegex(ValueError, 'ev_play_increment'):
            build.unevented([(0x400040fc, b'', b'\0' * 6, [], 0, 6)])
        with self.assertRaisesRegex(ValueError, 'ev_voice_bind'):
            build.unevented([], [(0, 0x40006824, 4, b'')])
        build.unevented([(0x400040fa, b'', b'\0' * 6, [], 0, 6)])
        with tempfile.TemporaryDirectory() as temp:
            self.assertIsNone(build.runtime_declaration(temp))
            for text in ('{"schema": 1, "subscribe": []}', '{"schema": 2, "subscribe": [{"event": "e", "fn": "f", "order": 1}]}',
                         '{"schema": 1, "subscribe": [{"event": "e", "fn": "f"}]}', '{"schema": 1, "subscribe": [], "x": 1}'):
                Path(temp, 'runtime.json').write_text(text)
                with self.subTest(text), self.assertRaises(ValueError):
                    build.runtime_declaration(temp)

    def test_events_execute_under_the_emulator(self):
        """Opt-in: MODWERK_PRIVATE_STOCK_MAIN and MODWERK_PRIVATE_EVENT_PACKETS (old/ and new/ repitch.mwrm,
        mute-modes.mwrm, poly8-group.mwrm and poly8-capture.json: the current packets and the migrated ones)."""
        stock, packets = os.environ.get('MODWERK_PRIVATE_STOCK_MAIN'), os.environ.get('MODWERK_PRIVATE_EVENT_PACKETS')
        if not stock or not packets:
            self.skipTest('explicit local stock MAIN and private event packets required; never firmware in CI')
        native = Path(os.environ.get('OCTABAM_NATIVE', Path.home() / '.cache/modwerk-upstream/octabam'))
        archives = [native / 'out/emu' / name for name in ('libot_machine.a', 'mc68k/lib68kEmu.a', 'dsp56300/dsp56kEmu/libdsp56kEmu.a',
                                                           'dsp56300/dsp56kBase/libdsp56kBase.a', 'dsp56300/asmjit/libasmjit.a')]
        tools = [shutil.which('m68k-elf-' + name) for name in ('gcc', 'as', 'ld', 'nm', 'objcopy')] + [shutil.which('c++')]
        if not all(tools) or not all(p.is_file() for p in archives):
            self.skipTest('ColdFire tools and the built native emulator required')
        glue, adapters = ROOT / 'sdk/machines/octatrack/elekloader', ROOT / 'sdk/machines/octatrack/module-adapters'
        with tempfile.TemporaryDirectory() as temp:
            work, images = Path(temp), {}
            for build_name, defines in (('events', ['-DMODWERK_RUNTIME_EVENTS']), ('legacy', [])):
                objects = []
                for source in (glue / 'runtime.c', adapters / 'loader_events_driver.c'):
                    obj = work / (build_name + '-' + source.stem + '.o')
                    subprocess.run(['m68k-elf-gcc', '-mcpu=5475', '-msoft-float', '-O2', '-ffreestanding', '-fno-builtin', '-fno-jump-tables',
                                    '-fno-asynchronous-unwind-tables', '-fomit-frame-pointer', '-ffunction-sections', '-fdata-sections',
                                    '-Wall', '-Wextra', '-Werror', *defines, '-DRUNTIME_MODULES=128u', '-DRUNTIME_POOL_BYTES=786432u',
                                    '-I' + str(glue), '-I' + str(adapters), '-I' + str(LOADER), '-I' + str(ROOT / 'sdk/runtime/upload'),
                                    '-c', str(source), '-o', str(obj)], check=True, capture_output=True)
                    objects.append(obj)
                undefined = ['modwerk_runtime_backend', 'modwerk_runtime_refusal', 'modwerk_runtime_refused_event',
                             'modwerk_runtime_active', 'fixture_image']
                if defines:
                    subprocess.run(['m68k-elf-as', '-mcpu=5475', str(glue / 'runtime_events.s'), '-o', str(work / 'dispatch.o')], check=True)
                    objects.append(work / 'dispatch.o'); undefined += ['modwerk_site_40004100', 'modwerk_site_40006820']
                (work / 'link.ld').write_text('SECTIONS { . = 0x47400000; .text : { *(.text) *(.text.*) } .rodata : { *(.rodata*) } '
                                              '.data : { *(.data*) } .bss : { *(.bss*) } /DISCARD/ : { *(.comment) *(.eh_frame*) } }')
                elf = work / (build_name + '.elf')
                subprocess.run(['m68k-elf-ld', '--gc-sections', '-e', 'modwerk_backend_prepare', *['--undefined=' + n for n in undefined],
                                '-T', str(work / 'link.ld'), *map(str, objects), '-o', str(elf)], check=True, capture_output=True)
                (work / (build_name + '.sym')).write_text(subprocess.check_output(['m68k-elf-nm', str(elf)], text=True))
                subprocess.run(['m68k-elf-objcopy', '-O', 'binary', str(elf), str(work / (build_name + '.bin'))], check=True)
            for side in ('old', 'new'):
                symbols = json.loads(Path(packets, side, 'poly8-capture.json').read_text())['symbols']
                (work / (side + '-group.sym')).write_text(''.join('%08x t %s\n' % (v, k) for k, v in symbols.items()))
            subprocess.run(['c++', '-O2', '-std=c++17', '-I' + str(native / 'tools/emu/ot_emu'), '-I' + str(native / 'vendor'),
                            '-I' + str(native / 'vendor/dsp56300/source'), str(adapters / 'loader_events_fixture.cpp'), *map(str, archives),
                            '-lpthread', '-o', str(work / 'probe')], check=True, capture_output=True)
            side = lambda name: [str(Path(packets, name, f)) for f in ('repitch.mwrm', 'mute-modes.mwrm', 'poly8-group.mwrm')] + [str(work / (name + '-group.sym'))]
            result = subprocess.run([str(work / 'probe'), stock, str(work / 'events.bin'), str(work / 'events.sym'), str(work / 'legacy.bin'),
                                     str(work / 'legacy.sym'), *side('old'), *side('new')], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr[-4000:])
        receipt = json.loads(result.stdout.splitlines()[-1])
        self.assertEqual(receipt['failures'], 0)
        if os.environ.get('MODWERK_EVENTS_RECEIPT'):
            receipt.update(packageSha256={f'{s}/{f}': hashlib.sha256(Path(packets, s, f).read_bytes()).hexdigest()
                                          for s in ('old', 'new') for f in ('repitch.mwrm', 'mute-modes.mwrm', 'poly8-group.mwrm')},
                           stockMainSha256=hashlib.sha256(Path(stock).read_bytes()).hexdigest(), moduleBehaviorQualified=False)
            Path(os.environ['MODWERK_EVENTS_RECEIPT']).write_text(json.dumps(receipt, indent=2) + '\n')


if __name__ == '__main__':
    unittest.main()
