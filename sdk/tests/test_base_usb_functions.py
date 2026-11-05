# SPDX-License-Identifier: GPL-3.0-or-later
"""Actual authored descriptor functions; no stock, hardware or public admission."""
import importlib.util
from pathlib import Path
import hashlib
import shutil
import struct
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.append(str(ROOT / 'sdk/machines/octatrack/module-adapters'))
import base_usb_functions as functions


def load(name, relative):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


base = load('composed_base_usb', 'sdk/machines/octatrack/elekloader/usb_base.py')
descriptors = load('authored_usb_functions', 'sdk/octabam/platform/usb-midi/descriptors.py')
post_descriptors = load('authored_post_usb_functions', 'sdk/octabam/modules/usb-audio-out-tracks-main-cue/layouts/descriptors.py')
post = load('base_post_recipe', 'sdk/machines/octatrack/elekloader/usb_post.py')


def selected(audio):
    return post_descriptors if audio == base.POST_LAYOUT else descriptors


def include(audio):
    text = functions.audio_include(audio)
    if audio == base.POST_LAYOUT:
        import math
        text += post.include(round(math.sin(2 * math.pi * i / 1024) * 0x7fffff) for i in range(256))
    return text


class BaseUsbFunctions(unittest.TestCase):
    def test_shared_midi_receiver_matches_its_licensed_import(self):
        import json
        record = json.loads((ROOT / 'sdk/imports/shared-usb-midi-reconnect-ab911d96.json').read_text())
        for imported in record['files']:
            with self.subTest(path=imported['path']):
                source = ROOT / imported['path']
                self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), imported['vendoredSha256'])
                self.assertEqual(imported['sourceSha256'], imported['vendoredSha256'])

    def test_all_output_layouts_preserve_speed_packets_and_class_entities(self):
        for audio in [None, *functions.AUDIO_LAYOUTS]:
            for high in (False, True):
                for other in (False, True):
                    with self.subTest(audio=audio, high=high, other=other):
                        made = functions.configuration(base, selected(audio), high, other, audio)
                        records = list(functions.records(made))
                        self.assertEqual(struct.unpack_from('<H', made, 2)[0], len(made))
                        self.assertEqual(made[4], 6 if audio else 4)
                        interfaces = {r[2] for r in records if r[1] == 4}
                        self.assertEqual(interfaces, set(range(6 if audio else 4)))
                        vendor = next(r for r in records if r[1] == 4 and r[2] == 1)
                        self.assertEqual(vendor[4:8], bytes([0, 255, 77, 1]))
                        original = selected(audio).audio_config(high, other, audio, with_in=None) if audio else descriptors.midi_config(high, other)
                        old = list(functions.records(original))
                        # No endpoint, entity, jack ID, sample-format or channel
                        # layout is reconstructed or guessed by the adapter.
                        self.assertEqual([r for r in records if r[1] == 5], [r for r in old if r[1] == 5])
                        self.assertEqual([r for r in records if r[1] == 0x25], [r for r in old if r[1] == 0x25])
                        self.assertIn(bytes([9, 0x24, 1, 0, 1, 9, 0, 1, 3]), records)
                        endpoints = [r[2] for r in records if r[1] == 5]
                        self.assertEqual(len(endpoints), len(set(endpoints)))

    def test_audio_changes_only_the_two_reviewed_interface_declarations(self):
        original = (base.AUDIO_SOURCE).read_text()
        made = functions.audio_source(original)
        self.assertEqual(made.replace('.set UAC2_AC_IFACE,  4 ', '.set UAC2_AC_IFACE,  3 ')
                             .replace('.set UAC2_AS_IFACE,  5 ', '.set UAC2_AS_IFACE,  4 '), original)
        for key, layout in functions.AUDIO_LAYOUTS.items():
            self.assertIn('.set USB_LAYOUT, %d\n' % layout, functions.audio_include(key))
            self.assertIn('.set USB_IN, 0\n', functions.audio_include(key))
        with self.assertRaises(ValueError):
            functions.audio_source(original.replace('.set UAC2_AS_IFACE,  4 ', '.set UAC2_AS_IFACE,  6 '))

    def test_midi_changes_only_the_single_isr_tail_and_refuses_drift(self):
        original = (ROOT / 'sdk/octabam/platform/usb-midi/usbmidi.s').read_text()
        made = functions.midi_source(original)
        self.assertEqual(made.replace('    jmp     modwerk_ep0_poll_shim', '    jmp     0x4001e60c'), original)
        for broken in (original.replace('    jmp     0x4001e60c', ''), original + '\n    jmp     0x4001e60c'):
            with self.assertRaises(ValueError):
                functions.midi_source(broken)

    def test_receiver_clock_guard_is_two_insertions_and_refuses_drift(self):
        original = (ROOT / 'sdk/machines/octatrack/elekloader/usbmidi_rx.s').read_text()
        made = functions.receiver_source(original)
        self.assertTrue(made.endswith(functions.CLOCK_GUARD))
        self.assertEqual(made.count('6:  bsrw    mw_usb_clock_yields\n'), 1)
        self.assertEqual(made.count('    movel   %d1,mw_usb_clk_stamp\n'), 1)
        for broken in (made, original.replace('    movel   %d1,CLK_T\n', ''), original.replace('6:  moveq   #0,%d2\n', '6:  moveq   #1,%d2\n')):
            with self.assertRaises(ValueError):
                functions.receiver_source(broken)

    @unittest.skipUnless(shutil.which('m68k-elf-as') and importlib.util.find_spec('unicorn'), 'ColdFire binutils or Unicorn unavailable')
    def test_usb_clock_and_transport_give_way_while_din_clocks(self):
        from unicorn import Uc, UC_ARCH_M68K, UC_MODE_BIG_ENDIAN, UC_HOOK_CODE
        from unicorn import m68k_const as m
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / 'rx.s').write_text(functions.receiver_source((ROOT / 'sdk/machines/octatrack/elekloader/usbmidi_rx.s').read_text()))
            subprocess.run(['m68k-elf-as', '-mcpu=54455', '-o', str(root / 'rx.o'), str(root / 'rx.s')], check=True)
            subprocess.run(['m68k-elf-ld', '-Ttext=0x10000', '-e', '0x10000', *[f'--defsym={name}=0x3000{i}' for i, name in enumerate(
                ('usbmidi_up', 'usbmidi_tx_busy', 'usbmidi_setcfg_shim', 'usbmidi_isr_shim'))], '-o', str(root / 'rx.elf'), str(root / 'rx.o')], check=True)
            subprocess.run(['m68k-elf-objcopy', '-O', 'binary', '-j', '.text', str(root / 'rx.elf'), str(root / 'rx.bin')], check=True)
            symbols = {line.split()[2]: int(line.split()[0], 16) for line in subprocess.check_output(
                ['m68k-elf-nm', str(root / 'rx.elf')], text=True).splitlines() if len(line.split()) == 3}
            code = (root / 'rx.bin').read_bytes()
        uc = Uc(UC_ARCH_M68K, UC_MODE_BIG_ENDIAN)
        uc.ctl_set_cpu_model(m.UC_CPU_M68K_CFV4E)
        for page in (0x10000, 0x30000, 0x40092000, 0x46100000, 0x46c83000, 0x4ecc9000, 0xfc070000, 0x7f000):
            uc.mem_map(page, 0x1000)
        uc.mem_write(0x10000, code)
        uc.mem_write(0x40092bbc, b'\x4e\x75')  # midi_rx_enqueue: record the byte, return
        CLK_T, CLK_DT, DTCN0, GAP = 0x46c8345a, 0x46c83466, 0xfc07000c, 1881600
        enqueued = []
        uc.hook_add(UC_HOOK_CODE, lambda u, *_: enqueued.append(u.mem_read(u.reg_read(m.UC_M68K_REG_A7) + 7, 1)[0]),
                    begin=0x40092bbc, end=0x40092bbc)
        read = lambda at: struct.unpack('>I', uc.mem_read(at, 4))[0]
        write = lambda at, value: uc.mem_write(at, struct.pack('>I', value & 0xffffffff))

        def usb(now, *statuses):  # one USB-MIDI packet; returns the bytes the framer would see
            enqueued.clear()
            write(DTCN0, now)
            uc.mem_write(0x4ecc9000, b''.join(bytes((3, s, 16, 0) if s == 0xf2 else (9, s, 64, 127) if s < 0xf0 else (15, s, 0, 0)) for s in statuses))
            uc.reg_write(m.UC_M68K_REG_SR, 0x2000)  # supervisor first: it selects the stack A7 names
            uc.reg_write(m.UC_M68K_REG_A7, 0x7ff00)
            uc.mem_write(0x7ff00, struct.pack('>I', 0x7fff0))
            uc.reg_write(m.UC_M68K_REG_D0, 4 * len(statuses))
            uc.emu_start(symbols['usbmidi_rx_decode'], 0x7fff0, count=10000)
            self.assertEqual(uc.reg_read(m.UC_M68K_REG_SR) & 0x700, 0)
            return [b for b in enqueued if b >= 0xf0 or b == 0x90]

        def din(now):  # the UART0 ISR's stamp for a DIN 0xF8
            write(CLK_DT, now - read(CLK_T))
            write(CLK_T, now)
        dropped = lambda: read(symbols['mw_usb_clock_dropped'])
        self.assertEqual(usb(1000, 0xfa, 0xf8), [0xfa, 0xf8])  # USB alone: all of it, each 0xF8 stamped
        self.assertEqual(usb(236200, 0xf8), [0xf8])
        self.assertEqual((read(CLK_T), read(CLK_DT)), (236200, 235200))
        din(300000)  # DIN clocking: USB clock, transport and song position are dropped, everything else passes
        self.assertEqual(usb(400000, 0xf8, 0xfa, 0xfb, 0xfc, 0xf2, 0x90, 0xfe, 0xf9), [0x90, 0xfe, 0xf9])
        self.assertEqual((dropped(), read(CLK_T), read(CLK_DT)), (5, 300000, 300000 - 236200))
        self.assertEqual(usb(300000 + GAP - 1, 0xf8), [])  # DIN stops: USB takes over at the gap, with a delta that resyncs
        self.assertEqual(usb(300000 + GAP, 0xf8), [0xf8])
        self.assertEqual((dropped(), read(CLK_DT)), (6, GAP))
        din(0xffffff00)  # a DIN tick just before the timer wraps still owns just after it
        self.assertEqual(usb(0x100, 0xf8), [])
        self.assertEqual(usb(0xffffff00 + GAP, 0xfa), [0xfa])  # stale: adopted, so a full wrap later it is still old
        self.assertEqual(usb(0xffffff00 + 10, 0xfc), [0xfc])
        self.assertEqual(dropped(), 7)

    def test_unknown_layout_speed_and_malformed_authored_records_are_refused(self):
        for audio in ('USB AUDIO IN AB', 'unknown', True):
            with self.assertRaises(ValueError):
                functions.configuration(base, selected(audio), True, audio=audio)
        with self.assertRaises(ValueError):
            functions.configuration(base, descriptors, 1)
        for data in (b'\x09\x04', b'\x00\x04', b'\x01', bytes(4096)):
            with self.assertRaises(ValueError):
                list(functions.records(data))

    def test_tables_fit_their_transfer_page_and_keep_the_vendor_binding(self):
        for audio in [None, *functions.AUDIO_LAYOUTS]:
            text = functions.assembly(base, selected(audio), audio)
            length = len(functions.configuration(base, selected(audio), True, audio=audio))
            self.assertIn('.set modwerk_cfg_len, %d' % length, text)
            self.assertEqual(text.count('.balign %d\n    .global modwerk_cfg_' % (512 if audio else 256)), 4)
            self.assertNotIn('.set usbmidi_rx_isr_shim,', text)
            self.assertEqual(base.msos20()[22], 1)  # WinUSB still binds vendor interface 1.

    def test_reset_and_session_end_also_retire_the_shared_midi_session(self):
        for audio in [None, *functions.AUDIO_LAYOUTS]:
            text = functions.assembly(base, selected(audio), audio)
            for label, midi, continuation in (
                    ('modwerk_bus_reset_shim', 'usbmidi_rx_reset_shim', 'audio_reset_shim'),
                    ('modwerk_session_end_shim', 'usbmidi_rx_sessend_shim', 'audio_sessend_shim')):
                body = text.split(label + ':', 1)[1].split('\n\n', 1)[0]
                self.assertIn('jsr     modwerk_ep0_bus_reset', body)
                self.assertIn('jsr     usbmidi_rx_bus_end\n    jmp     ' + continuation if audio else
                              'jmp     ' + midi, body)

    def test_one_isr_owner_and_full_guarded_midi_sender_span(self):
        old = functions.MIDI_DETOURS
        self.addCleanup(setattr, functions, 'MIDI_DETOURS', old)
        stock = {addr: bytes(range(length)) for addr, length, _, _ in old}
        functions.MIDI_DETOURS = tuple((addr, length, hashlib.sha256(stock[addr]).hexdigest(), target)
                                      for addr, length, _, target in old)
        read = lambda addr, length: stock[addr][:length]
        source = SimpleNamespace(sites=lambda image_at, audio: [dict(addr='0x4001e606', stock='00' * 6,
                                  op='jmp', target='audio_isr_shim' if audio else 'modwerk_ep0_poll_shim')])
        for audio in (None, 'USB AUDIO OUT TRACKS MAIN CUE'):
            made = functions.sites(source, read, audio)
            self.assertEqual(made[0]['target'], 'audio_isr_shim' if audio else 'usbmidi_rx_isr_shim')
            self.assertEqual(len(bytes.fromhex(next(site for site in made if site['target'] == 'usbmidi_send_shim')['stock'])), 8)
        stock[0x40010bc8] = bytes(8)
        with self.assertRaisesRegex(ValueError, 'guarded native'):
            functions.sites(source, read)
        stock[0x40010bc8] = bytes(range(8))
        source.sites = lambda image_at, audio: [dict(addr='0x4001e606', stock='00' * 6, op='jmp', target='modwerk_ep0_poll_shim'),
                                               dict(addr='0x40010bc8', stock='00' * 8, op='jmp', target='duplicate')]
        with self.assertRaisesRegex(ValueError, 'overlapping'):
            functions.sites(source, read)

    @unittest.skipUnless(shutil.which('m68k-elf-as'), 'ColdFire binutils unavailable')
    def test_actual_authored_functions_link_at_two_fresh_origins_with_complete_relocation(self):
        builder = load('usb_functions_native_builder', 'sdk/runtime/loader/build.py')
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            def assemble(name, source, cpu='54455'):
                path = root / (name + '.s'); path.write_text(source)
                output = root / (name + '.o')
                subprocess.run(['m68k-elf-as', '-mcpu=' + cpu, '-I', str(root), '-o', str(output), str(path)], check=True)
                return output
            stubs = assemble('authored_fixture_stubs', '.text\n' + ''.join('.global %s\n%s:\nrts\n' % (name, name)
                for name in ('modwerk_ep0_dispatch', 'modwerk_ep0_poll', 'modwerk_ep0_bus_reset', 'modwerk_engine_idle',
                             'olog_idle_hook', 'modwerk_ep0_reply')))
            midi = assemble('usbmidi', functions.midi_source((ROOT / 'sdk/octabam/platform/usb-midi/usbmidi.s').read_text()))
            receive = assemble('usbmidi_rx', functions.receiver_source((ROOT / 'sdk/machines/octatrack/elekloader/usbmidi_rx.s').read_text()))
            def link(objects, origin):
                script, elf, raw = root / 'usb.ld', root / 'usb.elf', root / 'usb.bin'
                script.write_text(builder.SCRIPT % origin)
                subprocess.run(['m68k-elf-ld', '--orphan-handling=error', '--no-warn-rwx-segments', '-T', str(script),
                                '-o', str(elf), *map(str, objects)], check=True)
                subprocess.run(['m68k-elf-objcopy', '-O', 'binary', '-j', '.image', str(elf), str(raw)], check=True)
                symbols = {name: int(value, 16) for value, _, name in
                           (line.split() for line in subprocess.check_output(['m68k-elf-nm', str(elf)], text=True).splitlines())}
                image = raw.read_bytes()
                self.assertEqual(len(image), symbols['__image_end'] - origin)
                return image, symbols, symbols['__bss_end'] - symbols['__image_end']
            for audio in [None, *functions.AUDIO_LAYOUTS]:
                with self.subTest(audio=audio):
                    objects = [stubs, midi, receive, assemble('base', functions.assembly(base, selected(audio), audio))]
                    if audio:
                        (root / 'remix.inc').write_text(include(audio))
                        source = functions.audio_source(base.audio_paths(audio)[0].read_text())
                        if audio != base.POST_LAYOUT:
                            source = functions.packet_readiness(source)
                        original_audio = assemble('audio_original_rings', source)
                        original_image, original_symbols, _ = link([*objects, original_audio], 0)
                        objects.append(assemble('audio', functions.audio_storage_source(source)))
                    image, symbols, bss = link(objects, 0)
                    # Upstream cleanup clears the accumulator through this
                    # guarded layout; pin the actual linked symbols too.
                    self.assertEqual(symbols['usbmidi_tx_acc_len'], symbols['usbmidi_up'] + 4)
                    if audio:
                        ring = [81920, 65536, 8192, 16384, 8192, 65536][functions.AUDIO_LAYOUTS[audio]]
                        for name, size in [('aud_ring', ring), ('aud_sum', 8192)]:
                            self.assertEqual(original_image[original_symbols[name]:original_symbols[name] + size], bytes(size))
                            self.assertGreaterEqual(symbols[name], symbols['__image_end'])
                            self.assertLessEqual(symbols[name] + size, symbols['__bss_end'])
                        state_size = symbols['aud_step'] + 4 - symbols['usbaudio_consumed']
                        self.assertEqual(image[symbols['usbaudio_consumed']:symbols['usbaudio_consumed'] + state_size],
                            original_image[original_symbols['usbaudio_consumed']:original_symbols['usbaudio_consumed'] + state_size])
                    high, _, _ = link(objects, 0x10000)
                    end = len(image) + bss
                    # Audio's DMA reads its own SDRAM through the documented
                    # uncached alias. It must still name owned image/bss.
                    offsets = builder.relocations(image, high, end + 0x08000000)
                    for offset in offsets:
                        value = struct.unpack_from('>I', image, offset)[0]
                        self.assertTrue(value < end or 0x08000000 <= value < 0x08000000 + end)
                    placed = bytearray(image)
                    for offset in offsets:
                        struct.pack_into('>I', placed, offset, struct.unpack_from('>I', placed, offset)[0] + 0x48000000)
                    fresh, fresh_symbols, fresh_bss = link(objects, 0x48000000)
                    self.assertEqual(bytes(placed), fresh)
                    self.assertEqual(bss, fresh_bss)
                    for name, high, other in [('modwerk_cfg_fs', False, False), ('modwerk_cfg_hs', True, False),
                                             ('modwerk_cfg_os_fs', False, True), ('modwerk_cfg_os_hs', True, True)]:
                        blob = functions.configuration(base, selected(audio), high, other, audio)
                        address = fresh_symbols[name]
                        self.assertLessEqual((address & 4095) + len(blob), 4096)
                        self.assertEqual(image[symbols[name]:symbols[name] + len(blob)], blob)

    def test_zero_ring_move_refuses_changed_or_nonzero_allocations(self):
        original = base.AUDIO_SOURCE.read_text()
        transformed = functions.audio_storage_source(original)
        self.assertEqual(transformed.replace('    .bss\n    .balign 4\n', '').replace('    .data\nusbaudio_alt:', 'usbaudio_alt:')
                         .replace('    .bss\n    .balign 32\naud_dtds:', '    .balign 32\naud_dtds:'), original)
        for broken in (original.replace('.space AUD_FRAMES*SLOT_BYTES', '.space AUD_FRAMES*SLOT_BYTES,1'),
                       original.replace('aud_ring:', 'other_ring:'), original + '\nusbaudio_alt:',
                       original.replace('.space NSLOT*PKT_BUF', '.space NSLOT*PKT_BUF,1'), original + '\n    .balign 32\naud_dtds:'):
            with self.assertRaises(ValueError):
                functions.audio_storage_source(broken)


if __name__ == '__main__':
    unittest.main()
