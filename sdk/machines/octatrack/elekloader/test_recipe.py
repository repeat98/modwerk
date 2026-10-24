#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Source recipe checks using only authored synthetic bytes; no firmware."""
import unittest
from types import SimpleNamespace

from build_core import stock_reference, strip
from build_ports import check_table_contract, register_platform


class StockReplayTests(unittest.TestCase):
    def test_span_crosses_source_parts_without_changing_neighbors(self):
        parts = [['hex', 'aa0000000000'], ['hex', '00000000bb'], ['stock', '0x1234', 8]]
        self.assertEqual(stock_reference(parts, 1, 9, 0x40000000),
                         [['hex', 'aa'], ['stock', '0x40000000', 9],
                          ['hex', 'bb'], ['stock', '0x1234', 8]])

    def test_rejects_nonzero_instruction_in_replay_placeholder(self):
        with self.assertRaisesRegex(ValueError, 'zero source placeholder'):
            stock_reference([['hex', '0000000100000000']], 0, 8, 0x40000000)

    def test_rejects_existing_stock_reference_in_replay_span(self):
        with self.assertRaisesRegex(ValueError, 'zero source placeholder'):
            stock_reference([['stock', '0x1234', 8]], 0, 8, 0x40000000)

    def test_rejects_span_outside_source(self):
        for offset, length in ((0, 9), (8, 1), (-1, 1), (0, 0)):
            with self.subTest(offset=offset, length=length), self.assertRaises(ValueError):
                stock_reference([['hex', '00' * 8]], offset, length, 0x40000000)

    def test_replaces_whole_source_part(self):
        self.assertEqual(stock_reference([['hex', '00' * 8]], 0, 8, 0x40000000),
                         [['stock', '0x40000000', 8]])


class StockDspStripTests(unittest.TestCase):
    # A section holding a packed copy (big-endian words) across a stock part, and a DSP site (little-endian words).
    image = bytes.fromhex('c0ffee')
    document = {'sections': {'.run': {'len': 10, 'parts': [['hex', 'aa123456'], ['stock', '0x40000401', 1], ['hex', 'abcdef01bb']]}},
                'sites': [{'addr': '0x400f0ee3', 'len': 7, 'new': '11' + '0c0b0a' + '223344'}]}
    words = {4: [0x123456, 0xffabcd, 0xef01bb], 0x7d1: [0x0a0b0c]}

    def strip(self, fills):
        return strip(self.document, fills, lambda f: self.words[f.get('fx', f.get('shared'))][f['first']:f['first'] + f['count']],
                     self.image, 0x40000400)

    def test_leaves_gaps_at_part_boundaries_and_keeps_the_rest(self):
        stripped = self.strip([dict(tag='A', fx=4, first=0, count=2, section='.run', offset=1),
                               dict(tag='A', shared=0x7d1, first=0, count=1, site='0x400f0ee3', offset=1)])
        self.assertEqual(stripped['sections']['.run']['parts'], [['hex', 'aa'], ['hex', 'ef01bb']])
        self.assertEqual(stripped['sites'][0]['new'], '11223344')
        self.assertEqual(self.document['sites'][0]['new'], '110c0b0a223344')  # the input stays whole

    def test_refuses_a_fill_that_does_not_name_the_bytes_it_removes(self):
        with self.assertRaisesRegex(ValueError, 'does not name'):
            self.strip([dict(tag='A', fx=4, first=1, count=1, section='.run', offset=1)])
        with self.assertRaisesRegex(ValueError, 'does not name'):
            self.strip([dict(tag='A', shared=0x7d1, first=0, count=1, site='0x400f0ee3', offset=0)])


class PlatformDependencyTests(unittest.TestCase):
    def registry(self):
        return SimpleNamespace(modules={}, broken={}, by_key={}, _ok={'consumer': False})

    def module(self, **changes):
        return SimpleNamespace(**dict(dict(name='usb-midi', key='USB MIDI',
                                           linked=(SimpleNamespace(source='platform/usb-midi/unit.s'),)), **changes))

    def test_registers_internal_dependency_and_invalidates_conversion_cache(self):
        registry, module = self.registry(), self.module()
        register_platform(registry, 'usb-midi', module)
        self.assertIs(registry.modules['usb-midi'], module)
        self.assertEqual(registry.by_key, {'USB MIDI': 'usb-midi'})
        self.assertEqual(registry._ok, {})

    def test_collision_preserves_existing_registry(self):
        for field, key in (('modules', 'usb-midi'), ('broken', 'usb-midi'), ('by_key', 'USB MIDI')):
            registry = self.registry()
            getattr(registry, field)[key] = 'existing'
            with self.subTest(field=field), self.assertRaisesRegex(ValueError, 'collides'):
                register_platform(registry, 'usb-midi', self.module())
            self.assertEqual(getattr(registry, field), {key: 'existing'})
            self.assertEqual(registry._ok, {'consumer': False})

    def test_rejects_mismatched_identity_or_source_without_registering(self):
        for changes in ({'name': 'other'}, {'key': ''}, {'linked': ()},
                        {'linked': (SimpleNamespace(source='modules/other/unit.s'),)},
                        {'linked': (SimpleNamespace(source='platform/usb-midi/../other.s'),)}):
            registry = self.registry()
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                register_platform(registry, 'usb-midi', self.module(**changes))
            self.assertEqual(registry.modules, {})
            self.assertEqual(registry.by_key, {})
            self.assertEqual(registry._ok, {'consumer': False})


class TableContractTests(unittest.TestCase):
    def test_accepts_append_contract(self):
        for position in (None, 16):
            check_table_contract(SimpleNamespace(tables=(SimpleNamespace(insert_at=position, count=16),)))

    def test_refuses_insertions_the_converter_and_its_oracle_both_miss(self):
        for position in (0, 2, 15):
            with self.subTest(position=position), self.assertRaisesRegex(ValueError, 'PERSONALIZE'):
                check_table_contract(SimpleNamespace(tables=(SimpleNamespace(insert_at=position, count=16, label='PERSONALIZE'),)))



class UsbBaseTests(unittest.TestCase):
    """The base's own configuration and sites, with synthetic stock bytes only."""
    def setUp(self):
        import hashlib, importlib.util, pathlib
        import usb_base
        self.usb, self.sha = usb_base, lambda data: hashlib.sha256(data).hexdigest()
        path = pathlib.Path(__file__).resolve().parents[3] / 'octabam/platform/usb-midi/descriptors.py'
        spec = importlib.util.spec_from_file_location('usbmidi_descriptors', path)
        self.midi = importlib.util.module_from_spec(spec); spec.loader.exec_module(self.midi)

    def test_mass_storage_is_usb_midis_and_the_vendor_interface_follows(self):
        for hs in (True, False):
            for other in (True, False):
                cfg = self.usb.configuration(hs, other)
                self.assertEqual(len(cfg), 41)
                self.assertEqual(cfg[:9], bytes([9, 7 if other else 2, 41, 0, 2, 1, 0, 0xc0, 3]))
                self.assertEqual(cfg[9:32], self.midi.midi_config(hs, other)[9:32])
                self.assertEqual(cfg[32:], bytes([9, 4, 1, 0, 0, 0xff, 0x4d, 1, 0]))

    def test_assembly_aligns_each_table_and_keeps_the_stock_rejoins(self):
        text = self.usb.assembly()
        self.assertIn('.set modwerk_cfg_len, 41', text)
        self.assertEqual(text.count('    .balign 64\n'), 6)  # four configurations, device, BOS
        self.assertEqual(text.count('    .balign 256\n'), 1)  # the MS OS 2.0 set, longer than 64 bytes
        for name in self.usb.tables():
            self.assertIn('\n%s:\n' % name, text)
        for rejoin in ('0x4001d864', '0x4001d8a2', '0x4001de5c', '0x4001de6a', '0x4001de74',
                       '0x4001e60c', '0x4001e922', '0x4001e958', 'olog_idle_hook'):
            self.assertIn('jmp     ' + rejoin, text)
        self.assertIn('orl     #0x00010001,%d0', text)

    def image(self, changes=()):
        stock = {addr: expected.to_bytes(4, 'big') for addr, expected, _ in self.usb.POINTERS}
        for addr, length, _, _ in self.usb.DETOURS:
            stock[addr] = bytes(range(addr & 0xff, (addr & 0xff) + length))
        stock[self.usb.CACR_GUARD[0]] = bytes(self.usb.CACR_GUARD[1])
        stock[0x400e2000] = self.usb.STOCK_DEVICE
        stock.update(changes)
        return stock, lambda addr, n: stock[addr][:n]

    def guarded(self, stock):
        return tuple((addr, length, self.sha(stock[addr]), symbol) for addr, length, _, symbol in self.usb.DETOURS)

    def setUpGuards(self, stock):
        original = self.usb.DETOURS, self.usb.CACR_GUARD
        addr, length, _ = original[1]
        self.usb.DETOURS, self.usb.CACR_GUARD = self.guarded(stock), (addr, length, self.sha(stock[addr]))
        self.addCleanup(lambda: setattr(self.usb, 'DETOURS', original[0]) or setattr(self.usb, 'CACR_GUARD', original[1]))

    def test_sites_replace_six_bytes_and_point_at_the_tables(self):
        stock, image_at = self.image()
        self.setUpGuards(stock)
        sites = self.usb.sites(image_at)
        self.assertEqual([s['target'] for s in sites if s['op'] == 'ptr'],
                         ['modwerk_cfg_fs', 'modwerk_cfg_hs', 'modwerk_cfg_os_hs', 'modwerk_cfg_os_fs', 'modwerk_device'])
        jumps = [s for s in sites if s['op'] == 'jmp']
        self.assertEqual([s['target'] for s in jumps], ['modwerk_usb_clamp1', 'modwerk_usb_clamp2', 'modwerk_ep0_shim',
                                                        'modwerk_ep0_poll_shim', 'modwerk_bus_reset_shim',
                                                        'modwerk_session_end_shim'])
        self.assertTrue(all(len(bytes.fromhex(s['stock'])) == 6 for s in jumps))

    def test_any_changed_stock_byte_is_refused_including_skipped_ones(self):
        stock, _ = self.image()
        self.setUpGuards(stock)
        clamp, cacr = self.usb.DETOURS[0][0], self.usb.CACR_GUARD[0]
        for changes in ({self.usb.POINTERS[0][0]: b'\x40\x0e\x20\x00'},
                        {clamp: stock[clamp][:11] + b'\xff'}, {cacr: b'\x02' * 10}):
            _, image_at = self.image(changes)
            with self.subTest(changes=list(changes)), self.assertRaisesRegex(ValueError, 'not stock'):
                self.usb.sites(image_at)
        _, image_at = self.image({0x400e2000: self.usb.STOCK_DEVICE[:-1] + b'\x02'})
        with self.assertRaisesRegex(ValueError, 'device descriptor'):
            self.usb.sites(image_at)

    def test_dev_audio_follows_the_vendor_interface_and_chains_the_tails(self):
        hs = self.usb.configuration(True, False, True)
        self.assertEqual(hs[4], 4)  # MSC, vendor, AudioControl, AudioStreaming
        self.assertEqual(hs[9:41], self.usb.configuration(True)[9:])  # MSC and vendor unchanged
        self.assertEqual(hs[41:49], bytes([8, 0x0b, 2, 2, 1, 0, 0x20, 0]))  # the audio function's association
        self.assertEqual({len(t) for t in self.usb.tables(True).values()}, {len(hs)})  # one clamp
        self.assertEqual(self.usb.device(True)[4:7], bytes([0xef, 2, 1]))
        text = self.usb.assembly(True)
        for tail in ('jmp     audio_ctrl_shim', 'jmp     audio_reset_shim', 'jmp     audio_sessend_shim',
                     '.set usbmidi_rx_isr_shim, modwerk_ep0_poll_shim'):
            self.assertIn(tail, text)
        self.assertIn('.set UAC2_AC_IFACE,  2 ', self.usb.audio_assembly())
        stock, image_at = self.image({addr: bytes.fromhex(b) for addr, b, _ in self.usb.AUDIO_DETOURS})
        self.setUpGuards(stock)
        targets = {s['target'] for s in self.usb.sites(image_at, True)}
        self.assertTrue({'audio_isr_shim', 'audio_frame_shim', 'audio_setiface_shim'} <= targets)
        self.assertNotIn('modwerk_ep0_poll_shim', targets)

    def test_windows_descriptors_bind_winusb_to_the_vendor_interface(self):
        import struct, uuid
        dev, bos, ms = self.usb.device(), self.usb.bos(), self.usb.msos20()
        self.assertEqual(dev[2:4], b'\x10\x02')  # USB 2.10: Windows reads BOS
        self.assertEqual(dev[:2] + dev[4:], self.usb.STOCK_DEVICE[:2] + self.usb.STOCK_DEVICE[4:])
        self.assertEqual(bos[:5], bytes([5, 0x0f, len(bos), 0, 1]))
        self.assertEqual(bos[9:25], uuid.UUID('D8DD60DF-4589-4CC7-9CD2-659D9E648A9F').bytes_le)
        self.assertEqual(struct.unpack('<IHBB', bos[25:33]), (0x06030000, len(ms), self.usb.MS_VENDOR_CODE, 0))
        # Every MS OS 2.0 length field covers exactly what follows it.
        self.assertEqual(struct.unpack('<HHIH', ms[:10]), (10, 0, 0x06030000, len(ms)))
        self.assertEqual(struct.unpack('<HHBBH', ms[10:18]), (8, 1, 0, 0, len(ms) - 10))
        self.assertEqual(struct.unpack('<HHBBH', ms[18:26]), (8, 2, self.usb.VENDOR_INTERFACE, 0, len(ms) - 18))
        self.assertEqual(ms[26:46], struct.pack('<HH', 20, 3) + b'WINUSB' + bytes(10))
        prop = ms[46:]
        self.assertEqual(struct.unpack('<HHHH', prop[:8]), (len(prop), 4, 7, 42))
        self.assertEqual(prop[8:50].decode('utf-16-le'), 'DeviceInterfaceGUIDs\0')
        self.assertEqual(prop[52:].decode('utf-16-le'), str(uuid.UUID(self.usb.INTERFACE_GUID)).upper().join('{}') + '\0\0')
        self.assertTrue(len(bos) % 64 and len(ms) % 64)  # never a whole number of EP0 packets



class RuntimeSlotTests(unittest.TestCase):
    def host_test(self, *sources, defines=()):
        import pathlib, shutil, subprocess, tempfile
        cc = shutil.which('cc')
        if not cc:
            self.skipTest('no host C compiler')
        here = pathlib.Path(__file__).resolve().parent
        loader = here.parents[2] / 'runtime/loader'
        with tempfile.TemporaryDirectory() as temp:
            subprocess.run([cc, '-std=c99', '-Wall', '-Wextra', '-Werror', '-pedantic', '-DMODWERK_HOST', '-I', here,
                            '-DMODWERK_DSP_ALLOWANCE0=3120', '-DMODWERK_DSP_ALLOWANCE1=3565', '-DMODWERK_DSP_RESERVE=342', *defines,
                            '-I', here.parents[3] / 'sdk/octabam/platform/dsp-dynload-transport',
                            '-I', here.parents[2] / 'runtime/upload', '-I', loader,
                            *[loader / s if s == 'loader.c' else here / s for s in sources], '-o', temp + '/t'],
                           check=True, capture_output=True)
            result = subprocess.run([temp + '/t'], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_runtime_bookkeeping_on_the_host(self):
        self.host_test('test_runtime.c')

    def test_ram_boot_backend_on_the_host(self):
        self.host_test('test_boot.c', 'loader.c', 'runtime.c')

    def test_usb_base_update_on_the_host(self):
        """flash.c (the base writing its own container to NOR) against an image the kit's own codec packed
        (vendor/elekloader/kit codec/aplib.ts, run through Node): test_flash.c reads the fixture."""
        import pathlib, random, shutil, struct, subprocess, tempfile
        node = shutil.which('node')
        if not node:
            self.skipTest('no node')
        here = pathlib.Path(__file__).resolve().parent
        kit = here.parents[3] / 'vendor/elekloader/kit/src/codec/aplib.ts'
        rng = random.Random(7)
        os_first, os_veroff, run_off = 0x4fefffe4, 0xde648, 0xe2000
        bootloader = (0x400de1e0 - 0x40000400, 0x400e21e0 - 0x40000400)
        run = bytes(rng.getrandbits(8) for _ in range(4096))
        image = bytearray((i * 7) & 0xff for i in range(run_off + 8 + len(run) + 20))
        for off in range(0, run_off, 65536):  # something for the packer to match and to leave literal
            image[off + 256:off + 4352] = bytes(rng.getrandbits(8) for _ in range(4096))
        image[0:4] = struct.pack('>I', os_first)
        image[bootloader[0]:bootloader[1]] = bytes((i * 13 + 5) & 0xff for i in range(bootloader[1] - bootloader[0]))
        image[os_veroff:os_veroff + 2] = b'\x04\x08'  # inside the bootloader copy, as on the unit
        image[run_off:run_off + 8 + len(run)] = struct.pack('>II', len(run), sum(run) & 0xffffffff) + run
        with tempfile.TemporaryDirectory() as temp:
            raw, section = pathlib.Path(temp, 'image.raw'), pathlib.Path(temp, 'section.bin')
            raw.write_bytes(image)
            pack = ("import { readFileSync, writeFileSync } from 'node:fs'; import { pathToFileURL } from 'node:url';"
                    "const [kit, src, dst] = process.argv.slice(1); const { packSection } = await import(pathToFileURL(kit).href);"
                    "writeFileSync(dst, packSection(new Uint8Array(readFileSync(src))))")
            packed = subprocess.run([node, '--input-type=module', '-e', pack, '--', str(kit), str(raw), str(section)], capture_output=True, text=True)
            if packed.returncode:
                self.skipTest('node cannot run the kit codec: ' + packed.stderr.strip()[-200:])
            container = b'ELEK0178' + b'1.40C'.rjust(10, b' ') + section.read_bytes()
            container += bytes(-len(container) % 4)
            fixture = pathlib.Path(temp, 'fixture.bin')
            fixture.write_bytes(struct.pack('>II', len(image), run_off) + bytes(image) + struct.pack('>I', len(container)) + container)
            self.host_test('test_flash.c', 'loader.c', 'runtime.c', defines=('-DMODWERK_FLASH_FIXTURE="%s"' % fixture,))

    def test_dsp_effect_glue_on_the_host(self):
        self.host_test('test_dsp.c')

    def test_selftest_placement_on_the_host(self):
        self.host_test('test_selftest.c')

    def test_checked_journal_dsp_on_the_host(self):
        self.host_test('test_journal_dsp.c')

    def test_fx_pages_on_the_host(self):
        self.host_test('test_fxpage.c')

    def test_cached_modules_on_the_host(self):
        # build_core.py --cached-modules: the trampolines and the FX pages' formatter pushes.
        for test in ('test_runtime.c', 'test_fxpage.c'):
            with self.subTest(test):
                self.host_test(test, defines=('-DMODWERK_CACHED_MODULES',))

    def test_module_set_on_the_host(self):
        self.host_test('test_modset.c')

    def test_status_keys_on_the_host(self):
        self.host_test('test_status.c')

    def test_diagnostics_log_on_the_host(self):
        self.host_test('test_diag.c')

    def test_the_base_at_128_effect_ids_on_the_host(self):
        # docs/OCTATRACK_MORE_EFFECT_IDS.md: the base behind MODWERK_FX_IDS works past 32 before the tables move.
        for test in ('test_dsp.c', 'test_fxpage.c', 'test_status.c', 'test_selftest.c'):
            with self.subTest(test):
                self.host_test(test, defines=('-DMODWERK_FX_IDS=128u',))

    def test_handle_map_past_99_on_the_host(self):
        # fxmap.c: a saved project keeps handles 100-127 (three digits in its '#MODWERK_FX=' lines).
        self.host_test('test_fxmap.c', defines=('-DMODWERK_FX_IDS=128u',))

    def test_allocator_move_on_the_host(self):
        """build_core.py's edits to Octabam's allocator, applied to copies, with test_move.c."""
        import importlib.util, pathlib, shutil, subprocess, tempfile
        cc = shutil.which('cc')
        if not cc:
            self.skipTest('no host C compiler')
        here = pathlib.Path(__file__).resolve().parent
        transport = here.parents[2] / 'octabam/platform/dsp-dynload-transport'
        spec = importlib.util.spec_from_file_location('build_core_for_test', here / 'build_core.py')
        build_core = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(build_core)
        with tempfile.TemporaryDirectory() as temp:
            for name in ('allocator.c', 'allocator.h'):
                text = (transport / name).read_text()
                for old, new in build_core.DSP_EDITS[name] + build_core.WIDTH_EDITS.get(name, ()):
                    self.assertEqual(text.count(old), 1, name)
                    text = text.replace(old, new)
                (pathlib.Path(temp) / name).write_text(text)
            subprocess.run([cc, '-std=c99', '-Wall', '-Wextra', '-Werror', '-I', temp, '-I', here, temp + '/allocator.c', here / 'test_move.c',
                            '-o', temp + '/t'], check=True, capture_output=True)
            result = subprocess.run([temp + '/t'], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_dsp_packages_rebuild_from_source(self):
        """dsp_packages.py rebuilds the catalogue's DSP effects byte for byte on the Elekloader path."""
        import os, pathlib, subprocess, sys
        if not os.environ.get('ELEKLOADER_DSP_ASM'):
            self.skipTest('ELEKLOADER_DSP_ASM is not set')
        here = pathlib.Path(__file__).resolve().parent
        run = subprocess.run([sys.executable, '-B', str(here / 'dsp_packages.py'), '--check',
                              str(here.parents[3] / 'src/engine/assets/dsp-packages.json')], capture_output=True, text=True)
        self.assertEqual(run.returncode, 0, run.stdout + run.stderr)

    def test_startup_on_the_host(self):
        import importlib.util, pathlib, shutil, subprocess, tempfile
        cc = shutil.which('cc')
        if not cc:
            self.skipTest('no host C compiler')
        here = pathlib.Path(__file__).resolve().parent
        spec = importlib.util.spec_from_file_location('base_art', here.parents[2] / 'runtime/startup/base_art.py')
        art = importlib.util.module_from_spec(spec); spec.loader.exec_module(art)
        with tempfile.TemporaryDirectory() as temp:
            (pathlib.Path(temp) / 'boot_art.h').write_text(art.header('0.3.1'))
            pixels = sorted(art.final_pixels('0.3.1'))
            (pathlib.Path(temp) / 'boot_expect.h').write_text('#define BOOT_EXPECT %d\nstatic const uint8_t boot_expect[%d][2] = {%s};\n' % (
                len(pixels), len(pixels), ', '.join('{%d, %d}' % p for p in pixels)))
            subprocess.run([cc, '-std=c99', '-Wall', '-Wextra', '-Werror', '-pedantic', '-DMODWERK_HOST', '-I', temp, '-I', here,
                            here / 'test_boot_anim.c', '-o', temp + '/t'], check=True, capture_output=True)
            result = subprocess.run([temp + '/t'], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)



class DspLoaderTests(unittest.TestCase):
    def test_receiver_keeps_its_table_after_its_code_and_dry_ids_on_the_null_stub(self):
        import dsp_loader
        text = dsp_loader.receiver_source(dsp_loader.RECEIVER.read_text(), (0x7c8, 0x7c9), 2384)
        self.assertTrue(text.endswith('dltable:\n'))
        self.assertIn('#>dltable', text); self.assertIn('#>$7c8', text); self.assertIn('#>$7c9', text)
        self.assertNotIn('@', text)
        self.assertNotIn(':>$2360', text)  # nothing for the host to read back
        self.assertEqual(text.count('#>2384'), 4)  # WRITE, its read-back, SUM, the table
        with self.assertRaisesRegex(ValueError, 'receiver changed'):
            dsp_loader.receiver_source(dsp_loader.RECEIVER.read_text().replace('@NULL_PROC@', '$0'), (0x7c8, 0x7c9), 1)

    def test_a_stock_package_relocates_as_the_loader_places_it(self):
        from dsp_loader import relocated
        # Absolute words gain the base; PC-relative ones (bit 15) lose it, mod 2^24 (transfer.c).
        self.assertEqual(relocated([0x10, 0x20, 5], [0, 1 | 0x8000], 0x100), [0x110, 0xffff20, 5])


class FlashSafetyTests(unittest.TestCase):
    def test_changes_outside_declared_sites_are_reported(self):
        from check_flash_safety import unexplained
        stock = bytes(32)
        built = bytearray(stock); built[4:6] = b'\x01\x02'; built[20] = 9
        self.assertEqual(unexplained(stock, bytes(built), 0x1000, [(0x1004, 2)]), [(0x1014, 1)])
        self.assertEqual(unexplained(stock, bytes(built), 0x1000, [(0x1004, 2), (0x1010, 8)]), [])
        self.assertEqual(unexplained(stock, bytes(built), 0x1000, [(0x1005, 2), (0x1010, 8)]), [(0x1004, 1)])
        self.assertEqual(unexplained(stock, bytes(built), 0x1000, [(0x1004, 1), (0x1005, 1), (0x1014, 1)]), [])  # adjacent sites


if __name__ == '__main__':
    unittest.main()
