# SPDX-License-Identifier: MIT
"""A DRAM unit that names a ROM unit's global symbol: the native rule (sdk/octabam/tools/build/dram_rom_refs.py, which
build_bus.py applies to its DRAM link) and the native DRAM link (remix.platform_build.link_runtime). Needs ColdFire
binutils (skipped without them); no firmware.

    python3 -B sdk/tests/test_dram_rom_symbols.py --write   # regenerate the configurator's fixture

The fixture (src/engine/test-fixtures/dram-rom-symbols.json) carries the DRAM objects as the configurator's packages
carry them, the ROM unit's globals and the GNU link; src/engine/dram-rom-symbols.test.ts resolves the same references
with the configurator's rule (coldfire-runtime.ts: resolveRomReferences) and links them, and expects the same bytes."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / 'src/engine/test-fixtures/dram-rom-symbols.json'
BASE = 0x40a955e0  # remix/arena.py BASE: where every card build's platform runtime starts
ROM_AT = 0x400d7000  # a cave address for the ROM unit
REGION = 0x40b00000  # a declared name (a DRAM region here) that keeps its own value
TOOLS = ('as', 'ld', 'nm', 'objcopy')
sys.path[:0] = [str(ROOT / 'sdk/octabam/tools'), str(ROOT / 'sdk/octabam/tools/build')]

ROM = ('        .text\n        .global KEYMASK, fx_hook, shared_name, region_buf\n'
       'KEYMASK: .byte 0x0f\n        .even\nfx_hook: rts\nshared_name: rts\nregion_buf: rts\n')
DRAM = {
    # Names a ROM byte (strong), a ROM routine and an absent one (both weak), a name another DRAM unit defines and a
    # declared one: only the first two may take the ROM's values.
    'reader': ('        .text\n        .weak   fx_hook, fx_absent\n        .global fx_read\n'
               'fx_read: move.b  KEYMASK,%d0\n        move.l  #fx_hook,%d1\n        move.l  #fx_absent,%d2\n'
               '        move.l  #shared_name,%a0\n        move.l  #region_buf,%a1\n        rts\n'),
    'owner': '        .text\n        .global shared_name\nshared_name: moveq   #1,%d0\n        rts\n',
}
EXPECTED = ('KEYMASK', 'fx_hook')  # what the rule resolves from the ROM


def toolchain():
    return all(shutil.which('m68k-elf-' + tool) for tool in TOOLS)


def rom_exports(work):
    """The ROM unit linked at ROM_AT, as build_bus links a cave unit: its global symbols."""
    from remix.platform_build import _nm
    (work / 'rom.s').write_text(ROM)
    subprocess.run(['m68k-elf-as', '-mcpu=5407', '-o', str(work / 'rom.o'), str(work / 'rom.s')], check=True, capture_output=True)
    subprocess.run(['m68k-elf-ld', f'-Ttext=0x{ROM_AT:x}', '-o', str(work / 'rom.elf'), str(work / 'rom.o')], check=True, capture_output=True)
    return {k: v for k, v in _nm(work / 'rom.elf', work).items() if k in ('KEYMASK', 'fx_hook', 'shared_name', 'region_buf')}


def objects(work):
    """Each DRAM unit assembled alone, as the configurator's packages carry it: {name: path}."""
    out = {}
    for name, text in DRAM.items():
        (work / (name + '.s')).write_text(text)
        subprocess.run(['m68k-elf-as', '-mcpu=54455', '-o', str(work / (name + '.o')), str(work / (name + '.s'))], check=True, capture_output=True)
        out[name] = work / (name + '.o')
    return out


def native(work):
    """(extra defsyms the rule adds, image, symbols) for the reader and the owner, linked by platform_build."""
    from dram_rom_refs import rom_externals
    from remix import platform_build
    from remix.schema import Linked
    exports, objs = rom_exports(work), objects(work / 'objects')
    extra = rom_externals(list(objs.values()), exports, {'region_buf'})
    units = [('FIXTURE', Linked(name, str(work / 'objects' / (name + '.s')), cpu='5475', dram=True)) for name in DRAM]
    cache = os.environ.get('OCTABAM_NO_CACHE')
    os.environ['OCTABAM_NO_CACHE'] = '1'  # no cache writes into sdk/octabam/out
    try:
        image, symbols = platform_build.link_runtime(units, work / 'link', {'region_buf': REGION, **extra}, BASE)
    finally:
        if cache is None:
            os.environ.pop('OCTABAM_NO_CACHE')
        else:
            os.environ['OCTABAM_NO_CACHE'] = cache
    return exports, objs, extra, image, symbols


def fixture():
    with tempfile.TemporaryDirectory() as temp:
        work = Path(temp)
        (work / 'objects').mkdir()
        exports, objs, extra, image, symbols = native(work)
        return dict(description='A DRAM unit naming a ROM unit\'s global symbol: objects assembled by GNU m68k-elf-as '
                                '(CPU 54455), the ROM unit linked at its cave address, the rule in '
                                'sdk/octabam/tools/build/dram_rom_refs.py and the GNU DRAM link '
                                '(remix.platform_build.link_runtime). Written by sdk/tests/test_dram_rom_symbols.py --write.',
                    base=BASE, region=REGION, rom=exports, resolved=extra, sources=dict(DRAM, rom=ROM),
                    objects={k: v.read_bytes().hex() for k, v in objs.items()}, units=list(DRAM),
                    bytes=len(image), sha256=hashlib.sha256(image).hexdigest(),
                    symbols={k: v for k, v in symbols.items() if k in ('fx_read', 'shared_name', 'KEYMASK', 'fx_hook', 'region_buf')})


@unittest.skipUnless(toolchain(), 'ColdFire binutils (m68k-elf-as, ld, nm, objcopy) unavailable')
class DramRomSymbols(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.work = Path(self.temp.name)
        (self.work / 'objects').mkdir()

    def tearDown(self):
        self.temp.cleanup()

    def test_the_rule_takes_only_open_references_from_the_rom(self):
        exports, _objs, extra, image, symbols = native(self.work)
        self.assertEqual(tuple(extra), EXPECTED)
        self.assertEqual(extra, {name: exports[name] for name in EXPECTED})
        read = symbols['fx_read'] - BASE
        # move.b KEYMASK,%d0 (abs.l): the ROM byte's address.
        self.assertEqual(image[read:read + 2], b'\x10\x39')
        self.assertEqual(int.from_bytes(image[read + 2:read + 6], 'big'), exports['KEYMASK'])
        immediates = [int.from_bytes(image[read + at:read + at + 4], 'big') for at in (8, 14, 20, 26)]
        # fx_hook from the ROM, fx_absent weak and 0, shared_name the DRAM owner's, region_buf the declared value.
        self.assertEqual(immediates, [exports['fx_hook'], 0, symbols['shared_name'], REGION])
        self.assertNotEqual(symbols['shared_name'], exports['shared_name'])

    def test_without_the_rule_ld_refuses_the_open_reference(self):
        from remix import platform_build
        from remix.schema import Linked
        objects(self.work / 'objects')
        units = [('FIXTURE', Linked(name, str(self.work / 'objects' / (name + '.s')), cpu='5475', dram=True)) for name in DRAM]
        os.environ['OCTABAM_NO_CACHE'] = '1'
        with self.assertRaises((SystemExit, subprocess.CalledProcessError)):
            platform_build.link_runtime(units, self.work / 'link', {'region_buf': REGION}, BASE)

    def test_the_fixture_is_current(self):
        if not FIXTURE.exists():
            self.fail('Run python3 -B sdk/tests/test_dram_rom_symbols.py --write')
        self.assertEqual(json.loads(FIXTURE.read_text()), fixture())


if __name__ == '__main__':
    if sys.argv[1:] == ['--write']:
        if not toolchain():
            sys.exit('ColdFire binutils (m68k-elf-as, ld, nm, objcopy) unavailable')
        FIXTURE.write_text(json.dumps(fixture(), indent=2) + '\n')
        print('Wrote', FIXTURE.relative_to(ROOT))
    else:
        unittest.main()
