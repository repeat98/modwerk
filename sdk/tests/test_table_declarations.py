# SPDX-License-Identifier: MIT
"""Private table SHA/source/layout association and exact complete splices."""
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
ADAPTER = ROOT / 'sdk/machines/octatrack/module-adapters'
sys.path.append(str(ADAPTER))
import table_declarations as declarations
spec = importlib.util.spec_from_file_location('table_package_builder', ROOT / 'sdk/runtime/loader/build.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


def sha(data): return hashlib.sha256(data).hexdigest()


class TableDeclarationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'table.s').write_text('authored source snapshot\n')
        self.sources = {'table.s': sha((self.root / 'table.s').read_bytes())}

    def entry(self, owner='quantizer', hooks=(), rest=None, **changes):
        _, count, insert, added, _, roots, refs, count_at, count_code = declarations.SHAPES[owner]
        image, relocations, sites, copies = bytearray(512), [], [], []
        offsets = [80, 160, 240]
        for table, base in enumerate(offsets):
            for row in range(insert, insert + added):
                struct.pack_into('>I', image, base + 4 * row, 400 + 4 * row)
                relocations.append(base + 4 * row)
            for reference in refs[table]:
                sites.append((reference, bytes.fromhex(sha(struct.pack('>I', roots[table]))),
                              struct.pack('>I', base), [0], 0, 4))
            for first, end, extra in ((0, insert, 0), (insert, count, added)):
                for row in range(first, end, 8):
                    n = min(8, end - row) * 4
                    copies.append((base + 4 * (row + extra), roots[table] + 4 * row, n, bytes((table + 1,)) * 32))
        sites.append((count_at, bytes((4,)) * 32, count_code, [], 0, len(count_code)))
        if rest == 'detour':  # one of the owner's own detours, resting with it (runtime.json "rests")
            sites.append((0x40004dc6, bytes((5,)) * 32, bytes((0x4e, 0x71, 0x4e, 0x71)), [], 0, 4, True))
        elif rest in ('pointer', 'count'):
            at = next(i for i, site in enumerate(sites) if site[0] == (refs[0][0] if rest == 'pointer' else count_at))
            sites[at] = sites[at] + (True,)
        package = builder.package(bytes(image), 0, list(hooks), relocations, sites, name=owner,
                                  hashed=True, title='TABLE', layout=1, copies=copies, abi=8)
        names = ['labels', 'getters', 'setters']
        captured = dict(schema=1, imageSha256=sha(bytes(image)), sources=self.sources,
                        symbols=dict(zip(names, offsets)))
        recipe = json.dumps(captured).encode()
        doc = dict(schema=declarations.SCHEMA, packageSha256=sha(package), imageSha256=sha(bytes(image)),
                   compiledImageSha256=sha(bytes(image)), recipeSha256=sha(recipe), family=owner,
                   stateLayoutRevision=1, parameterLayoutRevision=1, arrayOffsets=offsets,
                   tableSymbols=names, sources=self.sources)
        doc.update(changes)
        declaration = json.dumps(doc).encode()
        return dict(package=package, declaration=declaration, recipe=recipe,
                    reviewed_sha256=sha(declaration), source_root=self.root)

    def test_both_exact_complete_splices_generate_fixed_closed_storage(self):
        self.assertEqual((len(declarations.empty()), declarations.empty()[:7]), (1456, b'MWTD\1\0\30'))
        table = declarations.generate([self.entry(), self.entry('mute-modes')])
        self.assertEqual((len(table), table[5]), (1456, 2))
        self.assertEqual({table[16 + 60 * i + 40] for i in range(2)}, {1, 2})
        for bad in ([self.entry()] * 25, [self.entry(), self.entry()], [dict(self.entry(), extra=True)]):
            with self.assertRaises(ValueError): declarations.generate(bad)

    def test_absent_sha_source_and_layout_associations_refuse(self):
        for changed in (dict(family='other'), dict(stateLayoutRevision=0), dict(parameterLayoutRevision=2),
                        dict(arrayOffsets=[80, 80, 240]), dict(arrayOffsets=[80, 160, 500]),
                        dict(tableSymbols=['labels', 'getters', 'missing']), dict(tableSymbols=['labels', 'labels', 'setters']),
                        dict(packageSha256='0' * 64), dict(compiledImageSha256='0' * 64)):
            with self.assertRaises(ValueError): declarations.validate(**self.entry(**changed))
        entry = self.entry()
        with self.assertRaises(ValueError): declarations.validate(**dict(entry, reviewed_sha256='0' * 64))
        with self.assertRaises(ValueError): declarations.validate(**dict(entry, recipe=entry['recipe'] + b' '))
        (self.root / 'table.s').write_text('changed source\n')
        with self.assertRaises(ValueError): declarations.validate(**entry)

    def test_a_subscribing_owner_carries_only_checked_hook_words(self):
        """Mute Modes subscribes and raises since the events migration: its hook words are checked, and the rest of the
        package is validated exactly as a hookless one. Synthetic bytes only."""
        none = builder.NONE
        entry = self.entry('mute-modes', hooks=[none] * 4 + [50 << 24 | 8, none, none, 255 << 24 | 16])
        self.assertEqual(declarations.validate(**entry).family, 2)
        for at, value in ((76 + 16, 50 << 24 | 9), (76 + 16, 50 << 24 | 600), (76, 3)):
            package = bytearray(entry['package']); struct.pack_into('>I', package, at, value)
            doc = json.loads(entry['declaration']); doc['packageSha256'] = sha(package)
            declaration = json.dumps(doc).encode()
            with self.subTest(at=at, value=value), self.assertRaises(ValueError):
                declarations.validate(**dict(entry, package=bytes(package), declaration=declaration,
                                             reviewed_sha256=sha(declaration)))

    def test_an_owner_rests_its_own_detours_but_never_a_table_site(self):
        """Mute Modes 0.2.4 rests in MUTE MODE OT (ev_in_use, runtime.json "rests"): the rest bit on its own detours is
        admitted; on a table pointer or the count patch, which hold MUTE MODE's rows while it rests, it is refused."""
        none = builder.NONE
        hooks = [none] * 4 + [50 << 24 | 8, none, none, 255 << 24 | 16]
        resting = self.entry('mute-modes', hooks=hooks, rest='detour')
        self.assertEqual(declarations.validate(**resting).family, 2)
        self.assertNotEqual(resting['package'], self.entry('mute-modes', hooks=hooks)['package'])
        for site in ('pointer', 'count'):
            with self.subTest(site=site), self.assertRaises(ValueError):
                declarations.validate(**self.entry('mute-modes', hooks=hooks, rest=site))

    def test_pointer_sites_relocations_and_original_word_mapping_cannot_drift(self):
        entry = self.entry()
        original = entry['package']
        # Rebind hashes to each changed package so exact semantic validation,
        # rather than the earlier identity check, must refuse it.
        for offset in (76 + 80 + 12, 76 + 512 + 4, 76 + 512 + 36 + 40,
                       len(original) - 44 + 4):
            package = bytearray(original)
            package[offset] ^= 1
            doc = json.loads(entry['declaration'])
            doc['packageSha256'] = sha(package)
            doc['imageSha256'] = sha(package[76:76 + 512])
            declaration = json.dumps(doc).encode()
            with self.assertRaises(ValueError): declarations.validate(**dict(entry, package=bytes(package),
                declaration=declaration, reviewed_sha256=sha(declaration)))

    def test_two_reservations_and_identity_fill_cannot_move_guards_or_symbols(self):
        from machine_declarations import empty as machine_empty
        before = b'head' + machine_empty() + declarations.empty() + b'identity' + b'guard'
        table = declarations.generate([self.entry()])
        machine_offset, table_offset = 4, 1076
        after = declarations.fill_reserved(before, table_offset, table)
        symbols = dict(machine=machine_offset, tables=table_offset, arena=0x47080000, guard=len(before) - 5)
        self.assertTrue(declarations.assert_stable_reserved(before, after, symbols, dict(symbols), machine_offset, table_offset)['stable'])
        for changed, next_symbols in ((after + b'x', symbols), (after, dict(symbols, arena=0x47090000)),
                                      (after[:-1] + b'x', symbols)):
            with self.assertRaises(ValueError): declarations.assert_stable_reserved(before, changed, symbols, next_symbols, machine_offset, table_offset)
        with self.assertRaises(ValueError): declarations.fill_reserved(after, table_offset, table)
        changed = after[:-13] + b'Identity' + after[-5:]
        self.assertTrue(declarations.assert_stable_reserved(before, changed, symbols, symbols, machine_offset, table_offset,
                                                            [(len(before) - 13, len(before) - 5)])['stable'])
        with self.assertRaises(ValueError): declarations.assert_stable_reserved(before, after, symbols, symbols, machine_offset, table_offset,
                                                                               [(table_offset, table_offset + 1)])


if __name__ == '__main__': unittest.main()
