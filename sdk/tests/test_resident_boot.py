"""Bounded authored pre-boot packing and linked scratch regressions."""
import importlib.util
from itertools import product
from pathlib import Path
import random
import shutil
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('resident_boot_fixture', ROOT / 'sdk/machines/octatrack/module-adapters/resident_boot.py')
boot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(boot)
sys.path.append(str(ROOT / 'sdk/machines/octatrack/module-adapters'))
import resident_dsp


class ResidentBoot(unittest.TestCase):
    def test_packing_minimizes_exact_codec_size_without_splitting_isolated_zeros(self):
        # Exhaustive token partitions are an independent small-input oracle.
        def lengths(data):
            if not data:
                yield 0
                return
            for count in range(1, min(128, len(data)) + 1):
                for tail in lengths(data[count:]):
                    yield 1 + count + tail
                    if not any(data[:count]): yield 1 + tail
        for size in range(7):
            for values in product((0, 65), repeat=size):
                data = bytes(values)
                packed = boot.pack_zeros(data)
                self.assertEqual(len(packed), min(lengths(data)))
                if data: self.assertEqual(boot.unpack_zeros(packed, len(data)), data)
        for data in (b'A\0B\0C', (b'A\0B') * 43, b'\0' * 127 + b'A\0B'):
            packed = boot.pack_zeros(data)
            self.assertLessEqual(len(packed), len(data) + (len(data) + 127) // 128)
            self.assertEqual(boot.unpack_zeros(packed, len(data)), data)

    def test_authored_literal_zero_stream_round_trip_and_boundaries(self):
        rng = random.Random(223)
        for data in (bytes(1), bytes(128), bytes(129), bytes(4096), bytes(range(256)),
                     b'a' * 129, b'\0' * 127 + b'x' + b'\0' * 128,
                     bytes(rng.randrange(256) for _ in range(4096))):
            packed = boot.pack_zeros(data)
            self.assertEqual(boot.unpack_zeros(packed, len(data)), data)
            with self.assertRaises(ValueError):
                boot.unpack_zeros(packed, len(data) + 1)
        for malformed, length in ((b'\x02a', 3), (b'\xff', 127), (b'\x80\x80', 1), (b'', 1), (b'\x80', 0)):
            with self.assertRaises(ValueError):
                boot.unpack_zeros(malformed, length)

    def test_complete_upload_parser_retains_original_terminal_and_trailer(self):
        # Authored synthetic record; no real firmware table or byte fixture.
        raw = b''.join(w.to_bytes(3, 'little') for w in (3, 0, 0, 0x1200, 2, 0x123456, 0x789abc, 5, 0x1234)) + b'pad'
        self.assertEqual(boot.terminal(raw), 21)
        # The real 1.40C grammar ends at a 3 directive after its data records.
        three = b''.join(w.to_bytes(3, 'little') for w in (3, 0, 4, 0, 1, 0x1200, 1, 0x123456, 3, 0))
        self.assertEqual(boot.terminal(three), 24)
        for malformed in (raw[:20], bytes(8), b''.join(w.to_bytes(3, 'little') for w in (0, 1, 4096))):
            with self.assertRaises(ValueError):
                boot.terminal(malformed)

    def test_authored_records_match_exact_resource_ledger(self):
        records = [dict(space='x', address=0x2840, words=[0x123456, 0])]
        expected = [('x', 0x2840, 2)]
        self.assertEqual(len(boot.records_bytes(records, expected)), 15)
        for changed in ([dict(space='y', address=0x2840, words=[1, 0])],
                        [dict(space='x', address=0x2841, words=[1, 0])],
                        [dict(space='x', address=0x2840, words=[0x1000000, 0])]):
            with self.assertRaises(ValueError):
                boot.records_bytes(changed, expected)

    def test_actual_linked_bss_requires_disjoint_complete_scratch(self):
        receipt = [dict(scratchSymbol='A', scratchBytes=64), dict(scratchSymbol='B', scratchBytes=96)]
        symbols = dict(A=0x40b00000, A_end=0x40b00040, B=0x40b00040, B_end=0x40b000a0)
        run, bss = (0x40a00000, 0x40afffff), (0x40b00000, 0x40b01000)
        self.assertEqual(boot.check_linked(receipt, symbols, run, bss), [(symbols['A'], symbols['A_end']), (symbols['B'], symbols['B_end'])])
        for changed in (dict(symbols, B=0x40b00020, B_end=0x40b00080),
                        dict(symbols, A=0x40b00001), dict(symbols, A_end=0x40b00041),
                        dict(symbols, B=0x40b01000, B_end=0x40b01060)):
            with self.assertRaises(ValueError):
                boot.check_linked(receipt, changed, run, bss)

    def test_synthetic_upload_pointer_and_record_preparation(self):
        # Synthetic protocol words only: the native test needs no stock image.
        raw = b''.join(w.to_bytes(3, 'little') for w in (3, 0, 4, 0, 1, 0x100, 1, 0x123456, 3, 0))
        image = bytearray(0x110000)
        device = SimpleNamespace(main_load=0x40000400, dsp_payloads={})
        layout = {}
        for tag, (pointer, address) in boot.POINTERS.items():
            image[pointer - device.main_load:pointer - device.main_load + 4] = address.to_bytes(4, 'big')
            image[address - device.main_load:address - device.main_load + len(raw)] = raw
            device.dsp_payloads[tag] = (address, len(raw))
            ranges = resident_dsp.boot_ranges(tag)
            layout[tag] = dict(residentUploadRecords=[dict(space='y', address=r['address'], words=[0] * r['words'])
                                                      for r in ranges if r['space'] == 'y'],
                               residentHooks=dict(allowed=resident_dsp.ALLOWED[tag]))
        def read_records(img, dev, tag):
            self.assertEqual(boot.terminal(img[dev.dsp_payloads[tag][0] - dev.main_load:][:dev.dsp_payloads[tag][1]]), 24)
            return [(1, 0x100, 1, 0)]
        parser = SimpleNamespace(records=read_records)
        prepared = boot.prepare(image, device, parser, layout)
        self.assertEqual(len(prepared['sites']), 2)
        self.assertEqual([r['prefixBytes'] for r in prepared['receipt']], [24, 24])
        self.assertEqual(prepared['receipt'][0]['packedFragments'][0], prepared['receipt'][1]['packedFragments'][0])
        self.assertLess(prepared['packedUniqueBytes'], sum(row['packedBytes'] for row in prepared['receipt']))
        pointer = boot.POINTERS['A'][0] - device.main_load
        with self.assertRaisesRegex(ValueError, 'overlaps'):  # an original record over a zeroed owned Y range
            boot.prepare(image, device, SimpleNamespace(records=lambda *_: [(2, 0x7f0, 1, 0)]), layout)
        image[pointer] ^= 1
        with self.assertRaisesRegex(ValueError, 'pointer changed'):
            boot.prepare(image, device, parser, layout)
        image[pointer] ^= 1
        if shutil.which('m68k-elf-as') and shutil.which('m68k-elf-ld') and shutil.which('m68k-elf-nm'):
            with tempfile.TemporaryDirectory() as tmp:
                work = Path(tmp)
                (work / 'boot.s').write_text(prepared['assembly'])
                subprocess.run(['m68k-elf-as', '-mcpu=54455', '-o', str(work / 'boot.o'), str(work / 'boot.s')], check=True, capture_output=True)
                (work / 'link.ld').write_text('SECTIONS { .boot 0x40110000 : { *(.boot) } .bss 0x40b00000 (NOLOAD) : { *(.bss) } }')
                subprocess.run(['m68k-elf-ld', '-T', str(work / 'link.ld'), '-o', str(work / 'boot.elf'), str(work / 'boot.o')], check=True, capture_output=True)
                symbols = {row.split()[2]: int(row.split()[0], 16) for row in subprocess.check_output(
                    ['m68k-elf-nm', str(work / 'boot.elf')], text=True).splitlines() if len(row.split()) == 3}
                boot.check_linked(prepared['receipt'], symbols, (0x40a00000, 0x40b00000), (0x40b00000, 0x40c00000), (0x40110000, 0x40120000))
                with self.assertRaisesRegex(ValueError, 'linked .boot'):
                    boot.check_linked(prepared['receipt'], dict(symbols, mw_resident_records_A_0_end=symbols['mw_resident_records_A_0_end'] + 1),
                                      (0x40a00000, 0x40b00000), (0x40b00000, 0x40c00000), (0x40110000, 0x40120000))


if __name__ == '__main__':
    unittest.main()
