# SPDX-License-Identifier: MIT
"""Offline preparation checks. No unit, bridge or emulator is opened."""
import copy
import importlib.util
from pathlib import Path
import struct
import subprocess
import tempfile
import unittest
import compare_records
import capture
import prepare_pack
import prepare_timing
import verify_pack

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[4]


class Preparation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory()
        cls.directory = Path(cls.temporary.name)
        spec = importlib.util.spec_from_file_location('prepare_snap_source', HERE.parent / 'prepare_base.py')
        stage = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(stage)
        cls.source = stage.prepare(ROOT, cls.directory / 'source')
        cls.folder = cls.directory / 'pack'
        cls.manifest = prepare_pack.generate(cls.folder)

    @classmethod
    def tearDownClass(cls):
        cls.temporary.cleanup()

    def test_decoded_wav_oracle_matches_actual_c(self):
        receipt = verify_pack.verify(self.folder, self.source / 'sdk/machines/octatrack/module-adapters/sample_editor_snap.h')
        self.assertEqual(receipt['files'], 58)
        self.assertEqual(receipt['comparisons'], 174)

    def captures(self):
        entry = next(f for f in self.manifest['files'] if f['kind'] == 'split-stereo' and f['bits'] == 24)
        before = {'baseIdentity': 'fixture', 'unstable': False, 'kind': 1, 'slot': 0, 'frames': entry['frames'],
                  'format': 1, 'trimStart': entry['trimStart'], 'trimEnd': entry['trimEnd'],
                  'sampleBpm24': entry['bpm24'], 'projectBpm24': entry['bpm24'], 'selection': 2,
                  'count': 1, 'records': [{'start': 0, 'end': entry['trimEnd'], 'loop': 0xffffffff}]
                  + [{'start': 1, 'end': 2, 'loop': 3} for _ in range(63)],
                  'editorState': 0, 'completion': 8, 'pairReads': 0}
        after = copy.deepcopy(before)
        expected = entry['snapOn']['BOTH']
        after.update(count=len(expected['records']), completion=7, pairReads=expected['pairReads'])
        after['records'][:after['count']] = expected['records']
        return entry, before, after

    def test_compare_checks_complete_records_format_and_completion(self):
        entry, before, after = self.captures()
        self.assertEqual(compare_records.compare(self.folder, before, after, entry['id'], 'ON', 'BOTH')['markerComparison'], 'passed')
        for field in ('start', 'end', 'loop'):
            wrong = copy.deepcopy(after)
            wrong['records'][1][field] ^= 1
            with self.assertRaises(ValueError):
                compare_records.compare(self.folder, before, wrong, entry['id'], 'ON', 'BOTH')
        for field, value in (('editorState', 3), ('completion', 12), ('pairReads', 0), ('slot', 2), ('format', 3)):
            wrong = copy.deepcopy(after)
            wrong[field] = value
            with self.assertRaises(ValueError):
                compare_records.compare(self.folder, before, wrong, entry['id'], 'ON', 'BOTH')
        wrong = copy.deepcopy(after)
        wrong['records'][63]['loop'] ^= 1
        with self.assertRaises(ValueError):
            compare_records.compare(self.folder, before, wrong, entry['id'], 'ON', 'BOTH')

    def test_cancel_requires_whole_original_table(self):
        entry, before, after = self.captures()
        self.assertEqual(compare_records.compare(self.folder, before, before, entry['id'], 'ON', 'BOTH', True)['expectedOutcome'], 'CANCELLED')
        with self.assertRaises(ValueError):
            compare_records.compare(self.folder, before, after, entry['id'], 'ON', 'BOTH', True)

    def test_stock_comparison_rejects_wrong_channel_and_defensive_case(self):
        entry, _, after = self.captures()
        self.assertIn('match', compare_records.compare_stock(self.folder, after, after, entry['id']))
        wrong = copy.deepcopy(after)
        wrong['selection'] = 0
        with self.assertRaises(ValueError):
            compare_records.compare_stock(self.folder, after, wrong, entry['id'])
        defensive = next(f for f in self.manifest['files'] if f['kind'] == 'bounded-dc')
        with self.assertRaises(ValueError):
            compare_records.compare_stock(self.folder, after, after, defensive['id'])

    def test_read_only_capture_uses_target_offsets_and_rejects_bad_base(self):
        class Fixture(capture.Session):
            def __init__(self):
                self.ranges = {}
            def memory(self, at, length):
                for begin, raw in self.ranges.items():
                    if begin <= at and at + length <= begin + len(raw):
                        return raw[at - begin:at - begin + length]
                raise ValueError('Unexpected test read')
        session = Fixture()
        symbols = {'modwerk_base_digest': 0x40001000, 'mw_sample_test_offsets': 0x40002000,
                   'mw_sample_editor': 0x40003000, 'mw_sample_scan_cost': 0x40004000,
                   'mw_sample_writer_cost': 0x40005000}
        session.ranges[symbols['modwerk_base_digest']] = bytes(range(32))
        session.ranges[0x46c8d19c] = struct.pack('>2I', 0, 1)
        session.ranges[0x400ceb38] = struct.pack('>I', 2)
        controls = [1, 0, 0, 0, 90000, 0, 0, 0, 0, 0, 0]
        session.ranges[0x46c922c4] = struct.pack('>11I', *controls)
        settings = [0] * 274
        settings[69], settings[76], settings[273] = 2880, 88200, 1
        settings[78:81] = [0, 88200, 0xffffffff]
        session.ranges[0x100b14f0] = struct.pack('>274I', *settings)
        session.ranges[0x80001814] = struct.pack('>I', 2880)
        session.ranges[symbols['mw_sample_test_offsets']] = struct.pack('>5I', 12, 20, 24, 28, 32)
        session.ranges[symbols['mw_sample_editor']] = struct.pack('>8I', 0, 0, 0, 9, 0, 0, 7, 56)
        for name in ('mw_sample_scan_cost', 'mw_sample_writer_cost'):
            session.ranges[symbols[name]] = struct.pack('>6I', 2, 1, 132, 132, 132, 0)
        result = capture.snapshot(session, symbols, bytes(range(32)).hex())
        self.assertEqual((result['editorSerial'], result['editorState'], result['completion'], result['pairReads']), (9, 0, 7, 56))
        self.assertEqual(result['records'][0], {'start': 0, 'end': 88200, 'loop': 0xffffffff})
        with self.assertRaises(RuntimeError):
            capture.snapshot(session, symbols, 'wrong')
        session.ranges[symbols['mw_sample_scan_cost']] = struct.pack('>6I', 3, 1, 132, 132, 132, 0)
        with self.assertRaises(RuntimeError):
            capture.snapshot(session, symbols, bytes(range(32)).hex())

    def test_timing_overlay_and_counter_wrap(self):
        receipt = prepare_timing.overlay(self.source)
        self.assertNotEqual(receipt['preimages'], receipt['postimages'])
        with self.assertRaises(ValueError):
            prepare_timing.overlay(self.source)
        source, executable = self.directory / 'timing.c', self.directory / 'timing'
        source.write_text('''#include <stdint.h>
#include <assert.h>
struct mw_sample_snap {uint32_t reads;};
struct mw_sample_editor {uint32_t serial,state,completion;struct mw_sample_snap snap;};
''' + prepare_timing.TIMING + '''
int main(void) {
 struct mw_sample_measurement *m=&mw_sample_scan_cost;
 m->total_low=0xfffffffc;m->total_high=2;
 measurement_add(m,10);assert(m->total_low==6 && m->total_high==3);
 measurement_add(m,3);assert(m->spans==2 && m->maximum==10 && m->last==3 && m->sequence==4);
 writer_at=0xfffffffe;uint32_t timer=9;measurement_add(&mw_sample_writer_cost,timer-writer_at);
 assert(mw_sample_writer_cost.last==11);return 0;
}
''')
        subprocess.run(['cc', '-std=c99', '-Wall', '-Wextra', '-Werror', str(source), '-o', str(executable)], check=True)
        subprocess.run([str(executable)], check=True)
        dev = (self.source / prepare_timing.DEV).read_text()
        ram = dev[dev.index('static int ram('):dev.index('/* One 4 KiB page:')]
        source.write_text('#include <stdint.h>\n#include <assert.h>\n' + ram + '''
int main(void) {
 assert(ram(0x100b14f0u,1) && ram(0x100b14f0u+136u*1096u-1,1));
 assert(!ram(0x100b14efu,1) && !ram(0x100b14f0u+136u*1096u-1,2));
 assert(ram(0x100d5b30u,1) && ram(0x100d5b30u+128u*1096u-1,1));
 /* Flex ends exactly at Static start; the pre-existing 0x100f range also
    overlaps the upper Static rows. Check genuine outside spans instead. */
 assert(!ram(0x100d5b2fu,2) && !ram(0x10100000u,1));
 assert(!ram(0x100b14f0u,0) && !ram(0xfffffff0u,32));return 0;
}
''')
        subprocess.run(['cc', '-std=c99', '-Wall', '-Wextra', '-Werror', str(source), '-o', str(executable)], check=True)
        subprocess.run([str(executable)], check=True)
        subprocess.run(['python3', '-B', str(self.source / 'sdk/tests/test_sample_editor.py')], cwd=self.source, check=True)
        subprocess.run(['python3', '-B', str(self.source / 'sdk/tests/test_sample_editor_snap.py')], cwd=self.source, check=True)


if __name__ == '__main__':
    unittest.main()
