# SPDX-License-Identifier: GPL-3.0-or-later
"""The USB function a module adds to the Octatrack base's configuration (events.json ot_usb_functions,
elekloader/usb_function.c): the registry's entries, the base's configuration slots and live clamp length, and the
host check of admission and the reconnect. Host C runs with ASan/UBSan; no firmware, no stock bytes."""
import importlib.util
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
OT = ROOT / 'sdk/machines/octatrack'
sys.path.insert(0, str(OT / 'module-adapters'))
sys.path.insert(0, str(OT))
import base_usb_functions as functions  # noqa: E402
import usb_audio_configurable  # noqa: E402
import events  # noqa: E402
from host_flags import SANITIZE  # noqa: E402

HOOKS = ('ev_usb_isr', 'ev_usb_bus_end', 'ev_usb_control', 'ev_usb_frame')


def load(name, relative):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


base = load('usb_function_base', 'sdk/machines/octatrack/elekloader/usb_base.py')
descriptors = load('usb_function_descriptors', 'sdk/octabam/platform/usb-midi/descriptors.py')
duplex_descriptors = load('usb_duplex_descriptors',
    'sdk/octatrack/modules/usb-audio-out-tracks-main-cue/layouts/descriptors.py')


class UsbFunction(unittest.TestCase):
    def test_admission_slots_and_reconnect_on_the_host(self):
        cc = shutil.which('cc')
        if not cc:
            self.skipTest('no host C compiler')
        # As the base builds it, and as a development twin does (build_core.py: USB Audio linked in).
        for linked, says in (((), 'admission, slots, reconnect'), (('-DMODWERK_USB_AUDIO_LINKED',), 'refuses every function')):
            with self.subTest(linked=bool(linked)), tempfile.TemporaryDirectory() as temp:
                subprocess.run([cc, '-std=c99', '-Wall', '-Wextra', '-Werror', '-g', *SANITIZE, '-fno-sanitize-recover=all',
                                '-DMODWERK_RUNTIME_EVENTS', '-DRUNTIME_MODULES=128u', *linked, '-I', OT / 'module-adapters',
                                '-I', OT / 'elekloader', '-I', OT / 'include', '-I', ROOT / 'sdk/runtime/loader',
                                '-I', ROOT / 'sdk/runtime/upload', OT / 'elekloader/test_usb_function.c', '-o', temp + '/t'],
                               check=True, capture_output=True)
                result = subprocess.run([temp + '/t'], capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                self.assertIn(says, result.stdout)

    def test_the_base_raises_the_usb_hooks_and_no_package_gets_their_entry(self):
        registry = events.load()
        by_name = {e['event']: e for e in registry['events']}
        for name in HOOKS:
            self.assertEqual((by_name[name].get('raisedByBase'), by_name[name]['site'], by_name[name]['kind']), (True, None, 'call'))
            self.assertNotIn(name, events.raised(registry))  # runtime.json "raise" cannot name it
        header = events.loader(registry)
        raises = re.search(r'#define RUNTIME_SITE_EVENT_RAISES \{ (.*) \}', header).group(1).split(', ')
        for name in HOOKS:  # the base walks their rows itself (usb_function.c): no package gets an entry
            self.assertEqual(raises[by_name[name]['index'] - events.FIRST], '0')
        source = (OT / 'elekloader/usb_function.c').read_text()
        self.assertNotIn('modwerk_raise_', source.split('*/', 1)[1])
        for name in HOOKS:
            self.assertIn('uf_raise(MODWERK_%s)' % name.upper(), source)
        self.assertEqual(raises[by_name['ev_mute_keep']['index'] - events.FIRST], '(uintptr_t)modwerk_raise_ev_mute_keep')
        kinds = {row['event']: row for row in json.loads(events.browser(registry))['events']}
        self.assertEqual([kinds[name]['kind'] for name in HOOKS], ['raise'] * 4)  # as every raised hook; the loader hands no package their entry (raises above)
        self.assertEqual(kinds['ev_mute_keep']['kind'], 'raise')
        self.assertEqual({k: kinds['ot_usb_functions'][k] for k in ('kind', 'room', 'record')},
                         dict(kind='table', room=1, record=32))

    def test_the_record_the_sdk_declares_is_the_one_admission_reads(self):
        text = events.sdk(events.load())
        struct = text.split('struct modwerk_usb_function {', 1)[1].split('};', 1)[0]
        self.assertEqual(re.findall(r'^\s*(?:const )?(\w+) ', struct, re.M), ['uint32_t', 'uint16_t', 'uint16_t', 'uint32_t', 'uint8_t'])
        self.assertEqual(4 + 4 + 2 + 2 + 4 + 4 * 4, 32)  # abi, bytes; interfaces; length; endpoints; fs, hs, os_fs, os_hs
        source = (OT / 'elekloader/usb_function.c').read_text()
        self.assertIn('#define UF_RECORD 32u', source)
        self.assertIn('#define MODWERK_USB_FUNCTION_INTERFACE 4u', text)
        self.assertIn('#define MODWERK_USB_FUNCTION_ENDPOINT 3u', text)
        # The base's own composite ends at interface 3 and uses endpoints 1 and 2: the function's numbers are free.
        blob = functions.configuration(base, descriptors, True)
        numbers = {record[2] for record in functions.records(blob) if record[1] == 4}
        endpoints = {record[2] & 15 for record in functions.records(blob) if record[1] == 5}
        self.assertEqual((numbers, endpoints), ({0, 1, 2, 3}, {1, 2}))

    def test_duplex_descriptors_preserve_the_base_and_full_speed_output(self):
        for layout in functions.AUDIO_LAYOUTS:
            for input_mode, channels in duplex_descriptors.IN_LAYOUT.items():
                for other in (False, True):
                    with self.subTest(layout=layout, input_mode=input_mode, other=other):
                        full = functions.configuration(base, duplex_descriptors, False, other, layout, audio_input=input_mode)
                        self.assertEqual(full, functions.configuration(base, duplex_descriptors, False, other, layout))
                        high = functions.configuration(base, duplex_descriptors, True, other, layout, audio_input=input_mode)
                        midi = functions.configuration(base, duplex_descriptors, True, other)
                        self.assertEqual(high[9:len(midi)], midi[9:])
                        self.assertEqual((high[1], high[4]), (7 if other else 2, 7))
                        self.assertEqual(int.from_bytes(high[2:4], 'little'), len(high))
                        rows = list(functions.records(high))
                        self.assertEqual({r[2] for r in rows if r[1] == 4}, set(range(7)))
                        endpoints = {r[2]: r for r in rows if r[1] == 5}
                        # The imported layouts declare the input stream asynchronous with EP3 IN as its
                        # implicit feedback, as upstream does.
                        self.assertEqual(endpoints[0x03], bytes((7, 5, 3, 5, 48 * channels, 0, 2)))
                        self.assertEqual(endpoints[0x83][3], 0x25)
                        # USB Audio's package (0.4.1) makes the input stream adaptive and the output
                        # stream a plain asynchronous data endpoint: Windows' usbaudio2 supports no
                        # implicit feedback and no asynchronous OUT without an explicit feedback
                        # endpoint, and none is free.
                        packaged = usb_audio_configurable.adaptive_input(high)
                        endpoints = {r[2]: r for r in functions.records(packaged) if r[1] == 5}
                        self.assertEqual(endpoints[0x03], bytes((7, 5, 3, 9, 48 * channels, 0, 2)))
                        self.assertEqual(endpoints[0x83][3], 0x05)
                        output_only = functions.configuration(base, duplex_descriptors, True, other, layout)
                        self.assertEqual(endpoints[0x83], next(r for r in functions.records(output_only)
                                                               if r[1] == 5 and r[2] == 0x83))
                        self.assertEqual(usb_audio_configurable.adaptive_input(full), full)

    def test_slots_hold_each_configuration_and_the_clamps_read_the_live_length(self):
        plain = functions.assembly(base, descriptors)
        self.assertEqual(plain, functions.assembly(base, descriptors, slots=False))
        self.assertIn('.set modwerk_cfg_len, ', plain)
        text = functions.assembly(base, descriptors, slots=True)
        length = len(functions.configuration(base, descriptors, True))
        self.assertNotIn('#modwerk_cfg_len', text)
        self.assertNotIn('.set modwerk_cfg_len', text)
        for request, first, second in ((1, 'fs', 'hs'), (2, 'hs', 'fs')):
            clamp = text.split(f'modwerk_usb_clamp{request}:', 1)[1].split('jmp', 1)[0]
            self.assertIn(f'movel   modwerk_cfg_len_{first},%d1', clamp)
            self.assertIn(f'movel   modwerk_cfg_len_{second},%d1', clamp)
            self.assertIn('cmpil   #0x08000000,%d0\n    bnes', clamp)
            self.assertIn('cmpl    %d2,%d1\n    blss', clamp)
        for speed in ('fs', 'hs'):
            self.assertIn(f'modwerk_cfg_len_{speed}:\n    .long {length}\n', text)
        for name in ('modwerk_cfg_fs', 'modwerk_cfg_hs', 'modwerk_cfg_os_fs', 'modwerk_cfg_os_hs'):
            slot = text.split('    .balign 512\n    .global %s\n%s:\n' % (name, name), 1)[1].split('    .balign', 1)[0]
            self.assertEqual(slot.count('0x'), length)
            self.assertTrue(slot.endswith('    .space %d\n' % (512 - length)))
        self.assertEqual(text.count('.balign 512\n'), 4)
        self.assertIn('    .global modwerk_device\n', text)  # the other tables stay as they were
        self.assertEqual(functions.header(base, descriptors),
                         '#define MODWERK_USB_CFG_BYTES %du\n#define MODWERK_USB_CFG_INTERFACES 4u\n' % length)
        audio = 'USB AUDIO OUT TRACKS MAIN CUE'  # a development twin links USB Audio in: its slot holds that function
        self.assertEqual(functions.header(base, descriptors, audio),
                         '#define MODWERK_USB_CFG_BYTES 259u\n#define MODWERK_USB_CFG_INTERFACES 6u\n')
        for layout, size, interfaces, linked in [(None, length, 4, 0), (audio, 259, 6, 1)]:
            shape = 'modwerk_cfg_native:\n    .short %d\n    .byte %d, %d\n' % (size, interfaces, linked)
            self.assertIn(shape, functions.assembly(base, descriptors, layout, slots=True))
        self.assertIn('    .space %d\n' % (512 - 259), functions.assembly(base, descriptors, audio, slots=True))

    def test_slots_assemble_with_the_live_clamp(self):
        if not shutil.which('m68k-elf-as'):
            self.skipTest('no m68k-elf-as')
        with tempfile.TemporaryDirectory() as temp:
            source, output = Path(temp) / 'usb_base.s', Path(temp) / 'usb_base.o'
            source.write_text(functions.assembly(base, descriptors, slots=True))
            subprocess.run(['m68k-elf-as', '-mcpu=54455', '-o', str(output), str(source)], check=True)
            symbols = {name: (int(value, 16), kind) for value, kind, name in (
                line.split() for line in subprocess.check_output(['m68k-elf-nm', str(output)], text=True).splitlines()
                if len(line.split()) == 3)}
        slots = [symbols[name][0] for name in ('modwerk_cfg_fs', 'modwerk_cfg_hs', 'modwerk_cfg_os_fs', 'modwerk_cfg_os_hs')]
        self.assertTrue(all(at % 512 == 0 for at in slots))
        self.assertEqual(sorted(b - a for a, b in zip(slots, slots[1:])), [512, 512, 512])
        self.assertIn('modwerk_cfg_len_fs', symbols)
        self.assertIn('modwerk_cfg_len_hs', symbols)

    def test_the_base_wires_the_function_in_only_with_the_composite_configuration(self):
        build = (OT / 'elekloader/build_core.py').read_text()
        self.assertIn("usb_function_slots = bool(usb_functions) and not usb_profiles and args.site_events", build)
        self.assertIn("recipe['cflags'] += ['-DMODWERK_USB_FUNCTIONS'] + (['-DMODWERK_USB_AUDIO_LINKED'] if args.usb_audio else [])", build)
        ep0 = (OT / 'elekloader/ep0.c').read_text()
        for call in ('modwerk_usb_function_isr();', 'modwerk_usb_function_bus_end();', 'modwerk_usb_function_control()',
                     'if (modwerk_usb_reconnecting()) return;', 'modwerk_usb_function_host();', 'modwerk_usb_function_tick(!receiving)'):
            self.assertEqual(ep0.count(call), 1, call)
        # The bus reset of the base's own reconnect returns before the transport's reset, which undoes an open trial.
        reset = ep0.split('void modwerk_ep0_bus_reset(void)\n{', 1)[1].split('\n}\n', 1)[0]
        self.assertLess(reset.index('modwerk_usb_function_bus_end();'), reset.index('if (modwerk_usb_reconnecting()) return;'))
        self.assertLess(reset.index('if (modwerk_usb_reconnecting()) return;'), reset.index('mv_reset(t)'))
        admission = (OT / 'module-adapters/machine_admission_runtime.c').read_text()
        self.assertEqual(admission.count('usb_function_admission('), 3)  # its definition, PREPARE/SWITCH, the image check
        self.assertIn('modwerk_usb_functions_changed();', (OT / 'elekloader/machine_registry.c').read_text())


if __name__ == '__main__':
    unittest.main()
