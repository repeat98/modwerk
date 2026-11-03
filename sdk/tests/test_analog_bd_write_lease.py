# SPDX-License-Identifier: GPL-3.0-or-later
"""Private AB lease source: reviewed ABI, strong imports, fallback outside the lease."""
import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
ADAPTER = ROOT / 'sdk/machines/octatrack/module-adapters'
SDK = ROOT / 'sdk/octabam'
sys.path.append(str(ADAPTER))
import analog_bd_write_lease as lease


def selected():
    sys.path.insert(0, str(SDK / 'tools'))
    from remix import registry
    old = Path.cwd()
    try:
        os.chdir(SDK)
        return registry._load_one(SDK / 'modules/analog-bassdrum/manifest.py')
    finally:
        os.chdir(old)


class AnalogBdWriteLeaseTests(unittest.TestCase):
    def test_strong_imports_only_and_fallback_outside_lease(self):
        original = (SDK / 'modules/analog-bassdrum/control.c').read_text()
        text = lease.source(original)
        begin = text.index('modwerk_controller_write_begin(')
        end = text.index('return ab_lease_end(')
        self.assertLess(text.index('0x40004008u'), begin)
        self.assertLess(begin, text.index('++ab_render_calls;'))
        # The frame's first call (no control record) takes the stock silent source and no lease: one lease a frame.
        first = text.index('if(end!=16)\n        return ((int (*)(unsigned,unsigned,unsigned,unsigned))0x400047f0u)(track,ping,start,end);')
        self.assertLess(text.index('0x40004008u'), first)
        self.assertLess(first, begin)
        self.assertLess(text.index('U32(0x80001c80u)=(uint32_t)'), end)
        self.assertIn('#include "stock_hook_write_lease.h"', text)
        self.assertIn('MW_CONTROLLER_WRITE_ANALOG_BD,&lease)!=1)\n        return ((int (*)(unsigned,unsigned,unsigned,unsigned))0x400047f0u)(track,ping,start,end);', text)
        self.assertNotIn('!=1) return -1;', text)
        self.assertIn('return ab_lease_end(&lease);', text)
        self.assertEqual(text.count('modwerk_controller_write_end('), 1)
        self.assertNotIn('__attribute__((weak))', text)
        self.assertNotIn('mw_controller_control_write_allowed', text)
        self.assertEqual(hashlib.sha256(lease.HEADER.read_bytes()).hexdigest(), lease.HEADER_SHA256)
        with self.assertRaisesRegex(ValueError, 'source changed'):
            lease.source(original + '\n')

    @unittest.skipUnless(shutil.which('m68k-elf-gcc'), 'native ColdFire toolchain required')
    def test_policy_offsets_have_one_begin_and_one_end_continuation(self):
        import analog_bd_lease_policy as policy
        imports = {'modwerk_controller_write_begin': 0x40a994c0, 'modwerk_controller_write_end': 0x40a994dc}
        def link(folder, origin, text=None):
            from unittest.mock import patch
            bd = selected()
            if text is None:
                module = lease.port(bd, SDK, folder / 'w')
            else:
                with patch.object(lease, 'source', lambda original: text):
                    module = lease.port(bd, SDK, folder / 'w')
            objects = []
            for index, unit in enumerate(module.linked):
                obj, source = folder / ('%d.o' % index), Path(unit.source)
                subprocess.run(['m68k-elf-as', '-mcpu=54455', str(source if source.is_absolute() else SDK / source), '-o', str(obj)],
                               cwd=SDK, check=True, capture_output=True)
                objects.append(obj)
            script, elf = folder / 'link.ld', folder / ('%x.elf' % origin)
            script.write_text('SECTIONS { . = %#x; .text : { *(.text*) *(.rodata*) *(.data*) } /DISCARD/ : { *(.comment) *(.note*) *(.eh_frame) } }' % origin)
            subprocess.run(['m68k-elf-ld', '--no-warn-rwx-segments', *['--defsym=%s=%#x' % item for item in imports.items()],
                            '-T', str(script), '-o', str(elf), *map(str, objects)], check=True, capture_output=True)
            return elf
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            rows = [policy.policy_offsets(link(folder / str(o), o), o, imports) for o in (0, 0x21030)]
            self.assertEqual(rows[0], rows[1])
            self.assertLess(rows[0]['entry'], rows[0]['begin_return'])
            self.assertNotEqual(rows[0]['begin_return'], rows[0]['end_return'])
            with self.assertRaisesRegex(ValueError, 'two strong lease imports'):
                policy.policy_offsets(link(folder / 'x', 0), 0, {'modwerk_controller_write_begin': 1})
            # The recovered inline End tail: GCC may duplicate it into two End call sites, or keep one inside ab_render
            # rather than the reviewed ab_lease_end. Either is refused.
            original = (SDK / 'modules/analog-bassdrum/control.c').read_text()
            inline = lease.source(original).replace('return ab_lease_end(&lease);',
                                                    'return modwerk_controller_write_end(&lease)==1 ? 0 : -1;')
            inline = inline.replace('static int __attribute__((noinline)) ab_lease_end', 'static int __attribute__((noinline,unused)) ab_lease_end')
            with self.assertRaisesRegex(ValueError, 'exactly one call site|outside its reviewed function: ab_lease_end'):
                policy.policy_offsets(link(folder / 'inline', 0, inline), 0, imports)


if __name__ == '__main__':
    unittest.main()
