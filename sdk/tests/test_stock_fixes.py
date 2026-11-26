# SPDX-License-Identifier: GPL-3.0-or-later
"""The stock OS fixes every Octatrack base carries (sdk/machines/octatrack/elekloader/stock-fixes). No firmware.

1. The sites: six whole stock instructions, each guarded by a SHA-256, none meeting another, a base event's or owned
   table's site, or Direct Jump Kyoti's Plays-Free splice (0x4009b6f2..0x4009b703), so that module installs beside them.
2. The sources: Zac-Kyoti's three files are the vendored originals (vendor/kyoti-stock-fixes, pinned by
   sdk/imports/kyoti-stock-fixes-2cd3109.json) but for the marked MODWERK changes; with ColdFire binutils they assemble
   to the bytes his manifests pin (the Part fix's code with its two snapshot bytes moved to .bss).
3. The build: build_core.py links the sources and patches the sites in every base, and refuses a changed stock byte.
"""
import hashlib
import importlib.util
import json
import re
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FIXES = ROOT / 'sdk/machines/octatrack/elekloader/stock-fixes'
VENDOR = ROOT / 'vendor/kyoti-stock-fixes'
RECORD = ROOT / 'sdk/imports/kyoti-stock-fixes-2cd3109.json'
BUILD_CORE = ROOT / 'sdk/machines/octatrack/elekloader/build_core.py'
EVENTS = ROOT / 'sdk/machines/octatrack/events.json'
DJ = ROOT / 'sdk/octatrack/modules/direct-jump-kyoti/manifest.py'
BINUTILS = all(shutil.which('m68k-elf-' + tool) for tool in ('as', 'ld', 'objcopy', 'nm'))
# (base copy, vendored original, {original label: base label}); part_reapply.s also moves its two bytes to .bss.
COPIES = (('pattern_led.s', 'patch_pattern_led.s', {'cave': 'mw_fix_pattern_led'}),
          ('part_reapply.s', 'patch_partreapply.s', {'cave': 'mw_fix_part_tail', 'cave2': 'mw_fix_part_head'}),
          ('trigless_locks.s', 'patch_triglock.s', {'cave': 'mw_fix_trigless_audio', 'cave_midi': 'mw_fix_trigless_midi'}))
# The bytes Zac-Kyoti's manifests pin at 2cd3109 (batch-bugfixes PL_PINNED, PR_PINNED's first 400 bytes linked at
# 0x400d7000, erase-empty-trigless-locks REFERENCE linked at 0x400d7200), as SHA-256.
PINNED = {'pattern_led.s': (0x400d7000, None, 318, 'bba9a36a315002a9c3a48e2790323ec1b7c9765114010609be2563fd8b654c27'),
          'part_reapply.s': (0x400d7000, 0x400d7190, 400, '0d5aa9fca21c4c3175bf39c677e6039e96d2173c2e2c428ba5cb37b2ac3a9053'),
          'trigless_locks.s': (0x400d7200, None, 240, '0fa04f4dad79809cdf7d6c9ef174e76424f49c3f5128697380fd86a2356c6571')}


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


FIX = load('modwerk_stock_fixes_test', FIXES / 'stock_fixes.py')


def modwerk_form(text, names):
    """The vendored original with the base's marked changes applied: the result must equal the base's copy."""
    for old, new in names.items():
        text = re.sub(r'^(\s*)\.global(\s+)%s[ \t]*$' % re.escape(old),
                      lambda m: '%s.global%s%s%s| MODWERK: was `%s`; it links beside the base'
                      % (m.group(1), m.group(2), new, ' ' * max(1, 26 - len(new)), old), text, flags=re.M)
        text = re.sub(r'^%s:' % re.escape(old), new + ':', text, flags=re.M)
    return text.replace('    .align 2\ndirty_save_ram:', '| MODWERK: the two snapshot bytes live in the base\'s .bss, not '
                        'inside the code.\n    .section .bss\ndirty_save_ram:')


class SiteTests(unittest.TestCase):
    def test_six_guarded_whole_instruction_sites(self):
        self.assertEqual(len(FIX.SITES), 6)
        for address, n, guard, op, target in FIX.SITES:
            self.assertEqual((n, address % 2, op in ('jmp', 'jsr')), (6, 0, True), hex(address))
            self.assertRegex(guard, r'^[0-9a-f]{64}$')
            self.assertTrue(target.startswith('mw_fix_'), target)
        spans = sorted((a, a + n) for a, n, *_ in FIX.SITES)
        for (_, end), (start, _) in zip(spans, spans[1:]):
            self.assertLessEqual(end, start)

    def test_no_site_meets_a_base_event_or_table(self):
        registry = json.loads(EVENTS.read_text(encoding='utf-8'))
        owned = [(int(e['site'], 16), e['length'], e['event']) for e in registry['events'] if e.get('site')]
        owned += [(int(o['site'], 16), o['length'], o['table']) for o in registry.get('owned', [])]
        for address, n, *_ in FIX.SITES:
            for at, length, name in owned:
                self.assertFalse(address < at + length and at < address + n, '%#x meets %s' % (address, name))

    def test_direct_jump_kyoti_keeps_its_splice(self):
        """Its Plays-Free fix splices 0x4009b6f2..0x4009b703; the base's entry is the next instruction after the store
        that splice feeds, so the module's package still finds stock bytes there."""
        text = DJ.read_text(encoding='utf-8')
        hook = int(re.search(r'^TS_HOOK = (0x[0-9a-f]+)', text, re.M).group(1), 16)
        length = int(re.search(r'stock_guard\(TS_HOOK, (\d+),', text).group(1))
        self.assertEqual((hook, length), (0x4009b6f2, 18))
        for address, n, _, _, target in FIX.SITES:
            self.assertFalse(address < hook + length + 4 and hook < address + n, '%s meets the splice' % target)
        self.assertIn((0x4009b708, 'mw_fix_plays_free'), [(a, t) for a, _, _, _, t in FIX.SITES])

    def test_a_changed_stock_byte_is_refused(self):
        with self.assertRaisesRegex(ValueError, 'Stock bytes at 0x4009a464'):
            FIX.recipe_sites(lambda address, n: bytes(n), lambda data: hashlib.sha256(data).hexdigest())
        # With the guards holding, each site becomes the jmp or jsr the kit writes over exactly those bytes.
        guards = {a: g for a, _, g, _, _ in FIX.SITES}
        sites = FIX.recipe_sites(lambda address, n: address.to_bytes(4, 'big') + bytes(n - 4),
                                 lambda data: guards[int.from_bytes(data[:4], 'big')])
        self.assertEqual([(s['addr'], len(bytes.fromhex(s['stock'])), s['op'], s['target']) for s in sites],
                         [(hex(a), n, op, t) for a, n, _, op, t in FIX.SITES])


class SourceTests(unittest.TestCase):
    def test_record_pins_the_vendored_originals(self):
        record = json.loads(RECORD.read_text(encoding='utf-8'))
        self.assertEqual((record['repository'], record['revision'], record['license']),
                         ('https://github.com/Zac-Kyoti/octatrack-kyoti-fw', '2cd3109811c1d2b354f80366ffc154b1854c0a3a', 'MIT'))
        pinned = {item['to']: item['sha256'] for item in record['files']}
        for _, original, _ in COPIES:
            path = 'vendor/kyoti-stock-fixes/' + original
            self.assertEqual(hashlib.sha256((ROOT / path).read_bytes()).hexdigest(), pinned[path])
        self.assertEqual((FIXES / 'LICENSE.kyoti').read_bytes(), (VENDOR / 'LICENSE').read_bytes())

    def test_base_copies_differ_only_where_marked(self):
        for copy, original, names in COPIES:
            self.assertEqual((FIXES / copy).read_text(encoding='utf-8'),
                             modwerk_form((VENDOR / original).read_text(encoding='utf-8'), names), copy)

    def test_every_site_target_is_defined(self):
        defined = set()
        for name in FIX.SOURCES:
            defined |= set(re.findall(r'^\s*\.glob(?:a)?l\s+(\w+)', (FIXES / name).read_text(encoding='utf-8'), re.M))
        self.assertEqual({t for *_, t in FIX.SITES} - defined, set())

    @unittest.skipUnless(BINUTILS, 'no ColdFire binutils')
    def test_upstream_bytes(self):
        """Zac-Kyoti's hardware-tested bytes: the label renames change nothing, the .bss move only the snapshot."""
        with tempfile.TemporaryDirectory() as tmp:
            for copy, (text_at, bss_at, n, digest) in PINNED.items():
                obj, elf, out = (Path(tmp) / (copy + ext) for ext in ('.o', '.elf', '.bin'))
                subprocess.run(['m68k-elf-as', '-mcpu=5407', str(FIXES / copy), '-o', str(obj)], check=True)
                subprocess.run(['m68k-elf-ld', '-e', '0', '-Ttext=%#x' % text_at, *(['-Tbss=%#x' % bss_at] if bss_at else []),
                                '-o', str(elf), str(obj)], check=True)
                subprocess.run(['m68k-elf-objcopy', '-O', 'binary', '-j', '.text', str(elf), str(out)], check=True)
                data = out.read_bytes()
                self.assertEqual((len(data), hashlib.sha256(data).hexdigest()), (n, digest), copy)

    @unittest.skipUnless(BINUTILS, 'no ColdFire binutils')
    def test_plays_free_assembles_for_the_base(self):
        with tempfile.TemporaryDirectory() as tmp:
            obj = Path(tmp) / 'plays_free.o'
            subprocess.run(['m68k-elf-as', '-mcpu=54455', str(FIXES / 'plays_free.s'), '-o', str(obj)], check=True)
            symbols = subprocess.check_output(['m68k-elf-nm', str(obj)], text=True)
            self.assertRegex(symbols, r'T mw_fix_plays_free')


class BuildTests(unittest.TestCase):
    def test_every_base_links_the_fixes(self):
        """build_core.py patches the sites and links the sources outside every flag's branch."""
        text = BUILD_CORE.read_text(encoding='utf-8')
        self.assertIn("HERE / 'stock-fixes/stock_fixes.py'", text)
        block = text[text.index('for name in STOCK_FIXES.SOURCES:'):]
        block = block[:block.index('\n    recipe[\'sites\'] += (usb_profiles')]
        self.assertIn("recipe['sources'] += list(STOCK_FIXES.SOURCES)", block)
        self.assertIn("recipe['sites'] += STOCK_FIXES.recipe_sites(stock_at, sha)", block)
        line = next(l for l in text.splitlines() if 'for name in STOCK_FIXES.SOURCES:' in l)
        self.assertEqual(len(line) - len(line.lstrip()), 4, 'not inside a flag\'s branch')

    def test_the_sources_are_in_the_base_identity(self):
        """The base's source hash scans folders without descending: stock-fixes/ is named, so a changed fix changes the
        base (and octatrack-base.test.ts asks for the rebuild)."""
        text = BUILD_CORE.read_text(encoding='utf-8')
        line = next(l for l in text.splitlines() if l.strip().startswith('folders = (logger, upload, loader, HERE'))
        self.assertIn("HERE / 'stock-fixes'", line)


if __name__ == '__main__':
    unittest.main()
