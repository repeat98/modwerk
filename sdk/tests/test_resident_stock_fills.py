# SPDX-License-Identifier: GPL-3.0-or-later
"""Authored COMP bridge survives original-stock reinsertion; no stock fixture."""
import collections
import copy
import hashlib
import importlib.util
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

PATH = Path(__file__).resolve().parents[1] / 'machines/octatrack/elekloader/build_core.py'
spec = importlib.util.spec_from_file_location('resident_fill_core', PATH)
core = importlib.util.module_from_spec(spec)
spec.loader.exec_module(core)


def packed(words):
    return b''.join(w.to_bytes(3, 'big') for w in words)


class ResidentStockFills(unittest.TestCase):
    def setUp(self):
        self.original = [0x110011+i for i in range(9)]
        self.at = 3
        self.effect = dict(key='COMPRESSOR', proc=self.at)
        self.hooks = dict(origin=0x2000, guards=[dict(relocated=True, entry=0x2100,
            expectedSha256=hashlib.sha256(packed(self.original[self.at:self.at+2])).hexdigest())])
        self.words = list(self.original)
        self.words[self.at:self.at+2] = [0x0bf080, 0x2100]

    def fills(self, words=None, effect=None, original=None, hooks=None):
        return core.resident_effect_fills('A', 24, self.words if words is None else words,
            '.run', 6, effect or self.effect, self.original if original is None else original,
            hooks or self.hooks)

    def test_stock_reinsertion_keeps_the_complete_authored_jsr(self):
        fills = self.fills()
        self.assertEqual([(f['first'], f['count'], f['offset']) for f in fills], [(0, 3, 6), (5, 4, 21)])
        before, after = b'prefix', b'suffix'
        document = dict(sections={'.run': dict(parts=[['hex', (before+packed(self.words)+after).hex()]])}, sites=[])
        stripped = core.strip(document, fills,
            lambda f: self.original[f['first']:f['first']+f['count']], b'', 0)
        literal = b''.join(bytes.fromhex(part[1]) for part in stripped['sections']['.run']['parts'])
        self.assertEqual(literal, before+packed([0x0bf080, 0x2100])+after)
        for fill in sorted(fills, key=lambda f: f['offset']):
            at = fill['offset']
            words = packed(self.original[fill['first']:fill['first']+fill['count']])
            literal = literal[:at]+words+literal[at:]
        self.assertEqual(literal, before+packed(self.words)+after)
        self.assertNotEqual(literal, before+packed(self.original)+after)

    def test_unknown_changes_and_drifted_guard_or_entry_refuse(self):
        for where in (0, self.at, self.at+1, len(self.words)-1):
            words = list(self.words); words[where] ^= 1
            with self.subTest(word=where), self.assertRaises(ValueError):
                self.fills(words=words)
        for mutate in ('guard', 'entry', 'duplicate', 'origin'):
            hooks = copy.deepcopy(self.hooks)
            if mutate == 'guard': hooks['guards'][0]['expectedSha256'] = '0'*64
            elif mutate == 'entry': hooks['guards'][0]['entry'] += 1
            elif mutate == 'duplicate': hooks['guards'].append(copy.deepcopy(hooks['guards'][0]))
            else: hooks['origin'] = 0x2200
            with self.subTest(mutate=mutate), self.assertRaises(ValueError):
                self.fills(hooks=hooks)
        with self.assertRaises(ValueError): self.fills(effect=dict(key='COMPRESSOR', proc=True))
        with self.assertRaises(ValueError): self.fills(original=self.original[:-1])

    def test_unchanged_other_stock_effects_remain_complete_fills(self):
        effect = dict(key='OTHER_STOCK', proc=3)
        self.assertEqual(self.fills(words=self.original, effect=effect),
            [dict(tag='A', fx=24, first=0, count=9, section='.run', offset=6)])
        with self.assertRaises(ValueError): self.fills(effect=effect)

    def catalogue(self, second=None):
        spec = importlib.util.spec_from_file_location('resident_fill_loader', PATH.parent / 'dsp_loader.py')
        loader = importlib.util.module_from_spec(spec); spec.loader.exec_module(loader)
        layout = {tag: dict(words={4: list(self.original if tag == 'A' or second is None else second)},
            stock={4: dict(slots=3, init=0, proc=1, relocations=[])}, reads=[0]*32) for tag in 'AB'}
        return loader.catalog_c(layout, collections.defaultdict(lambda: 342)), layout

    def test_only_whole_readonly_equal_arrays_are_shared(self):
        original, layout = self.catalogue()
        shared, aliases = core.share_equal_stock_catalog(original, layout)
        self.assertEqual(aliases[('B', 4)], ('A', 4))
        self.assertNotIn('stock1_4_packed', shared)
        self.assertIn('static uint32_t stock1_4[9]', shared)
        self.assertIn('stock1_4_relocations', shared)
        second = list(self.original); second[1] ^= 1
        original, layout = self.catalogue(second)
        shared, aliases = core.share_equal_stock_catalog(original, layout)
        self.assertEqual(aliases[('B', 4)], ('B', 4))
        self.assertIn('stock1_4_packed', shared)
        with self.assertRaisesRegex(ValueError, 'source seam'):
            core.share_equal_stock_catalog(original.replace('stock1_4_packed[]', 'changed[]'), layout)

    @unittest.skipUnless(shutil.which('cc'), 'Host C compiler unavailable')
    def test_actual_native_unpack_retains_independent_mutable_core_words(self):
        original, layout = self.catalogue()
        shared, _ = core.share_equal_stock_catalog(original, layout)
        source = '#include <assert.h>\n#include <stdint.h>\nstruct dl_package {unsigned a,b,c,d,e,f,g;};\n'+shared
        source += '''int main(void) {
            modwerk_dsp_unpack();
            assert(dl_codes[0][4].words != dl_codes[1][4].words);
            for(unsigned i=0;i<9;++i) {
                assert(dl_codes[0][4].words[i]==0x110011+i);
                assert(dl_codes[1][4].words[i]==0x110011+i);
            }
            stock0_4[3]^=1;
            assert(stock1_4[3]==0x110014);
            assert(dl_codes[0][4].words[3]!=dl_codes[1][4].words[3]);
            return 0;
        }'''
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp); (work/'fixture.c').write_text(source)
            build = subprocess.run(['cc', '-std=c99', '-Wall', '-Wextra', '-Werror', str(work/'fixture.c'),
                '-o', str(work/'fixture')], capture_output=True, text=True)
            self.assertEqual(build.returncode, 0, build.stderr)
            subprocess.run([str(work/'fixture')], check=True, capture_output=True)

    def test_sparse_source_seam_and_bounds_refuse(self):
        second = list(self.original); second[1] ^= 0x101; second[-1] ^= 0x202
        original, layout = self.catalogue(second)
        shared, aliases, deltas = core.share_sparse_stock_catalog(original, layout)
        self.assertEqual(aliases[('B', 4)], ('A', 4))
        self.assertEqual(deltas[('B', 4)]['positions'], [1, 8])
        self.assertNotIn('stock1_4_packed', shared)
        self.assertIn('stock1_4_delta_positions[] = {1,8}', shared)
        for old in ('stock1_4_packed[]', 'void modwerk_dsp_unpack(void)', 'all[i].to[w] ='):
            with self.subTest(seam=old), self.assertRaisesRegex(ValueError, 'source seam'):
                core.share_sparse_stock_catalog(original.replace(old, 'changed'), layout)
        for mutate in ('length', 'word', 'boolean', 'missing', 'oversize'):
            broken = copy.deepcopy(layout)
            if mutate == 'length': broken['B']['words'][4].pop()
            elif mutate == 'word': broken['B']['words'][4][0] = 0x1000000
            elif mutate == 'boolean': broken['B']['words'][4][0] = True
            elif mutate == 'missing': broken['B']['words'] = {}
            else:
                for tag in 'AB': broken[tag]['words'][4] = [1]*0x10000
            with self.subTest(mutate=mutate), self.assertRaises(ValueError):
                core.share_sparse_stock_catalog(original, broken)

    def test_sparse_fills_recover_original_deltas_but_keep_authored_comp_entry(self):
        source = list(self.words); source[0] ^= 1; source[self.at+1] += 1; source[-1] ^= 1
        positions = [0, self.at+1, len(source)-1]
        fills = core.resident_sparse_fills(24, self.words, source, positions, '.run', 6,
            self.effect, self.original, self.hooks)
        self.assertEqual([(f['first'], f['count'], f['offset']) for f in fills], [(0, 1, 6), (8, 1, 12)])
        delta = [self.words[i] for i in positions]
        document = dict(sections={'.run': dict(parts=[['hex', (b'prefix'+packed(delta)+b'suffix').hex()]])}, sites=[])
        stripped = core.strip(document, fills, lambda f: self.original[f['first']:f['first']+1], b'', 0)
        literal = b''.join(bytes.fromhex(part[1]) for part in stripped['sections']['.run']['parts'])
        self.assertEqual(literal, b'prefix'+packed([self.hooks['guards'][0]['entry']])+b'suffix')
        for fill in sorted(fills, key=lambda f: f['offset']):
            at = fill['offset']; literal = literal[:at]+packed(self.original[fill['first']:fill['first']+1])+literal[at:]
        self.assertEqual(literal, b'prefix'+packed(delta)+b'suffix')
        for wrong in ([0, 8], [0, 8, 4], [False, 4, 8], [0, 4, 9], [0, 4, 8, 8]):
            with self.subTest(positions=wrong), self.assertRaises(ValueError):
                core.resident_sparse_fills(24, self.words, source, wrong, '.run', 6,
                    self.effect, self.original, self.hooks)
        changed = list(self.words); changed[self.at] ^= 1
        with self.assertRaises(ValueError):
            core.resident_sparse_fills(24, changed, source, positions, '.run', 6,
                self.effect, self.original, self.hooks)

    @unittest.skipUnless(shutil.which('cc'), 'Host C compiler unavailable')
    def test_actual_sparse_unpack_bounds_metadata_and_repeated_independent_buffers(self):
        second = list(self.original); second[0] ^= 0x101; second[-1] ^= 0x202
        original, layout = self.catalogue(second)
        shared, _, _ = core.share_sparse_stock_catalog(original, layout)
        source = '#include <assert.h>\n#include <stdint.h>\nstruct dl_package {unsigned a,b,c,d,e,f,g;};\n'+shared
        source += 'static const uint32_t expected_b[]={%s};\n' % ','.join(map(str, second))
        source += '''int main(void) {
            for(unsigned pass=0;pass<2;++pass) {
                modwerk_dsp_unpack();
                for(unsigned i=0;i<9;++i) {
                    assert(dl_codes[0][4].words[i]==0x110011+i);
                    assert(dl_codes[1][4].words[i]==expected_b[i]);
                }
                assert(dl_codes[0][4].words != dl_codes[1][4].words);
                assert(dl_codes[0][4].count==9 && dl_codes[1][4].count==9);
                assert(dl_codes[0][4].init==0 && dl_codes[1][4].proc==1);
                assert(dl_codes[0][4].relocations != dl_codes[1][4].relocations);
                assert(dl_codes[0][4].relocation_count==0 && dl_codes[1][4].relocation_count==0);
                stock0_4[8]^=1; assert(stock1_4[8]==expected_b[8]);
                stock1_4[0]^=1; assert(stock0_4[0]==0x110011);
            }
            return 0;
        }'''
        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp); (work/'fixture.c').write_text(source)
            build = subprocess.run(['cc', '-std=c99', '-Wall', '-Wextra', '-Werror', str(work/'fixture.c'),
                '-o', str(work/'fixture')], capture_output=True, text=True)
            self.assertEqual(build.returncode, 0, build.stderr)
            subprocess.run([str(work/'fixture')], check=True, capture_output=True)


if __name__ == '__main__':
    unittest.main()
