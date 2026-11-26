# SPDX-License-Identifier: GPL-3.0-or-later
"""USB Audio as a runtime package (module-adapters/usb_audio_package.py): what the builder makes of the authored source."""
import importlib.util
import shutil
import struct
import sys
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OT = ROOT / 'sdk/machines/octatrack'
sys.path.insert(0, str(OT))
import events  # noqa: E402


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


builder = load('usb_audio_package', OT / 'module-adapters/usb_audio_package.py')
usb = load('modwerk_usb_base', OT / 'elekloader/usb_base.py')
functions = load('modwerk_base_usb_functions', OT / 'module-adapters/base_usb_functions.py')
LAYOUT = 'USB AUDIO OUT TRACKS MAIN CUE'


class UsbAudioPackage(unittest.TestCase):
    def test_configurable_packet_router_and_saved_settings(self):
        with tempfile.TemporaryDirectory() as temp:
            exe = Path(temp) / 'router'
            subprocess.run(['cc', '-std=c99', '-Wall', '-Wextra', '-Werror', '-I', OT / 'include',
                            OT / 'elekloader/test_usb_audio_settings.c', '-o', exe], check=True)
            subprocess.run([exe], check=True)

    @unittest.skipUnless(shutil.which('m68k-elf-gcc'), 'no ColdFire toolchain')
    def test_one_configurable_package_describes_every_output_width(self):
        data, facts = builder.build(None)
        self.assertEqual(struct.unpack_from('>H', data, 66)[0], 7)
        # The duplex package is the published one: its own kind, so the site replaces 0.3.0 and 0.4.0 with it.
        self.assertEqual(struct.unpack_from('>H', builder.build(None, usb_input=True)[0], 66)[0], 9)
        self.assertLess(facts['image'] + facts['bss'], 128 * 1024)
        hook_count = struct.unpack_from('>I', data, 20)[0]
        hook_index = next(e['index'] for e in events.load()['events'] if e['event'] == 'ot_usb_functions')
        function = struct.unpack_from('>I', data, 76 + hook_index * 4)[0] & 0xffffff
        image_at = 76 + hook_count * 4
        image = data[image_at:image_at + facts['image']]
        self.assertGreater(hook_count, hook_index)
        self.assertEqual(struct.unpack_from('>IIHHI', image, function), (2, 36, 2, facts['block'], 0x80000))
        self.assertEqual(struct.unpack_from('>HBB', image, function+32), (5,0,0))
        for speed, offset in enumerate(struct.unpack_from('>4I', image, function+16)):
            for i, width in enumerate([20,16,4,2,8]):
                at = offset + i*facts['block']
                descriptors = list(builder._records(image[at:at+facts['block']]))
                channels = width if speed % 2 else 2
                self.assertEqual(next(r[8] for r in descriptors if r[:3] == bytes([17,0x24,2])), channels)
                self.assertEqual(next(r[10] for r in descriptors if r[:3] == bytes([16,0x24,1])), channels)
                endpoint = next(r for r in descriptors if r[:3] == bytes([7,5,0x83]))
                self.assertEqual(int.from_bytes(endpoint[4:6], 'little'), channels * 4 * (12 if speed % 2 else 45))

    def test_the_function_block_is_what_a_linked_base_sends_behind_its_own_interfaces(self):
        descriptors = load('descriptors', usb.audio_paths(LAYOUT)[1])
        blocks = [builder.function_block(functions, usb, descriptors, LAYOUT, hs, other)
                  for hs, other in ((False, False), (True, False), (False, True), (True, True))]
        self.assertEqual(len({len(b) for b in blocks}), 1)
        for (hs, other), block in zip(((False, False), (True, False), (False, True), (True, True)), blocks):
            without = functions.configuration(usb, descriptors, hs, other, None)
            whole = functions.configuration(usb, descriptors, hs, other, LAYOUT)
            self.assertEqual(without[9:] + block, whole[9:])
            self.assertLessEqual(len(without) + len(block), functions.SLOT)
            records = list(builder._records(block))
            self.assertEqual(sum(len(r) for r in records), len(block))
            self.assertEqual(records[0][:4], bytes([8, 11, 4, 2]))  # the association: two interfaces from 4
            self.assertEqual(sorted({r[2] for r in records if r[1] == 4}), [4, 5])
            self.assertEqual([r[2] for r in records if r[1] == 5], [0x83])  # endpoint 3 IN alone
        self.assertIn('.short 2, %d' % len(blocks[0]), builder.record(blocks))

    def test_the_source_keeps_the_import_and_changes_only_its_guarded_seams(self):
        text = builder.source(functions, usb, LAYOUT)
        self.assertNotIn('usbmidi_rx_isr_shim', text.split('| ---- the package', 1)[0].split('audio_isr_shim:', 1)[1].split('\n\n', 1)[0])
        self.assertNotIn('jmp     0x4000d9a6', text)       # the base replays the frame site's displaced clear
        self.assertNotIn('#(aud_dtds+UNCACHED),', text)    # every use reads the run-time boundary
        self.assertEqual(text.count('moveal  mwua_dtds,'), 3)
        self.assertIn('.set UAC2_AC_IFACE,  4 ', text)
        with self.assertRaisesRegex(ValueError, 'Not built as a package yet'):
            builder.build('USB AUDIO IN')

    def test_the_setting_offers_main_and_cue_only_in_the_twenty_channel_layout(self):
        twenty, tracks = builder.source(functions, usb, LAYOUT), builder.source(functions, usb, 'USB AUDIO OUT TRACKS')
        self.assertIn('    .long 1, mwua_set_label, 3, mwua_set_choices, mwua_setting_apply, 0', twenty)
        self.assertIn('    .long 1, mwua_set_label, 2, mwua_set_choices, mwua_setting_apply, 0', tracks)
        for text in (twenty, tracks):  # OFF is the second choice everywhere: the kept choice means the same
            self.assertIn('mwua_set_0: .asciz "ALL CHANNELS"\nmwua_set_1: .asciz "OFF"\n', text)
            self.assertIn('    tstb    modwerk_usb_audio_off   | the player\'s OFF', text)
        self.assertIn('mwua_set_2: .asciz "MAIN + CUE ONLY"', twenty)
        self.assertNotIn('mwua_set_2', tracks)

    def test_tracks_post_takes_the_computed_sine_and_no_stock_table(self):
        usb_post = load('usb_post', OT / 'elekloader/usb_post.py')
        curve = builder.sine_curve(usb_post)
        self.assertEqual((len(curve), curve[0], curve[1], curve[255]), (256, 0, 51472, 8388449))
        self.assertEqual(curve, sorted(set(curve)))
        text = builder.source(functions, usb, usb.POST_LAYOUT)
        self.assertIn('.set USB_LAYOUT, 5', text)
        self.assertIn('.macro POST_XLV_TABLE\n    .long 0x000000\n    .long 0x00c910\n', text)
        self.assertNotIn('MW_AUDIO_READY', text)  # the 20-channel packet watermark is not POST's
        self.assertEqual(text.count('moveal  mwua_dtds,'), 3)

    def test_the_package_subscribes_to_the_four_hooks_and_carries_three_guarded_sites(self):
        if not shutil.which('m68k-elf-as'):
            self.skipTest('no m68k-elf-as')
        data, facts = builder.build(LAYOUT)
        self.assertEqual((data[:4], struct.unpack_from('>H', data, 4)[0]), (b'MWRM', 8))
        self.assertEqual(facts['sites'], ['0x4001dd04', '0x4001d824', '0x4001d4b2'])
        self.assertLess(facts['image'], 8192)
        self.assertLess(facts['image'] + facts['bss'], 128 * 1024)
        image, bss, relocations, hooks, sites = struct.unpack_from('>IIIII', data, 8)
        self.assertEqual((image, bss, relocations, sites), (facts['image'], facts['bss'], facts['relocations'], 3))
        words = struct.unpack_from('>%dI' % hooks, data, 76)
        by_name = {e['event']: e['index'] for e in events.load()['events']}
        subscribed = {name for name, index in by_name.items() if index < hooks and words[index] != 0xffffffff}
        self.assertEqual(subscribed, {'ot_usb_functions', 'ev_usb_isr', 'ev_usb_bus_end', 'ev_usb_control', 'ev_usb_frame', 'ot_settings'})
        self.assertTrue(all(w == 0xffffffff for w in words[:4]))  # no tick, draw, key or encoder handler
        self.assertEqual(struct.unpack_from('>H', data, 66)[0], 1)  # its layout number: the define of TRACKS MAIN CUE, plus one


if __name__ == '__main__':
    unittest.main()
