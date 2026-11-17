# SPDX-License-Identifier: MIT
"""The shared scale (sdk/machines/octatrack/modwerk_scale.s, include/modwerk_scale.h).

1. Tables, always: the 52 masks are octabam's (the vendored vendor/octabam-scales/scales.s, pinned by its import
   record), and Scale Quantizer's 24 saved indices translate to the catalogue IDs with the same masks.
2. Execution, with ColdFire binutils and Unicorn (as test_base_usb_functions.py): the shared snap equals Scale
   Quantizer's own snap (core.s qz_scale_mask + quantizer.s qz_msnap, assembled from the module's sources) for every
   note, scale and root, and octabam's sc_snap (assembled from the vendored file) for every note, ID and root.
3. Both builds: the same bytes with -mcpu=5475 (card) and -mcpu=54455 (base) at any address, only a PC-relative
   reference to its table, the MCF54455 codegen
   check, and a C runtime package that calls it through the header.
"""
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SHARED = ROOT / 'sdk/machines/octatrack/modwerk_scale.s'
HEADER = ROOT / 'sdk/machines/octatrack/include/modwerk_scale.h'
VENDORED = ROOT / 'vendor/octabam-scales/scales.s'
RECORD = ROOT / 'sdk/imports/octabam-scales-755a02ac.json'
QUANTIZER = ROOT / 'sdk/octabam/modules/quantizer/upstream/quantizer'
BINUTILS = all(shutil.which('m68k-elf-' + tool) for tool in ('as', 'ld', 'objcopy', 'nm', 'objdump'))
UNICORN = importlib.util.find_spec('unicorn') is not None
EXECUTE = unittest.skipUnless(BINUTILS and UNICORN, 'ColdFire binutils or Unicorn unavailable')


def words(block):
    return [int(x, 16) for line in block.splitlines() for x in re.findall(r'0x[0-9a-f]+', line.split('|')[0])]


def between(text, start, end):
    """The source from the line `start` up to (not including) the first `end` after it."""
    at = text.index(start)
    return text[at:text.index(end, at + len(start))]


def octabam_masks():
    return words(between(VENDORED.read_text(), '\nsc_masks:\n', '\n\n'))


def shared_masks():
    return words(between(SHARED.read_text(), '\nmodwerk_scale_masks:', '\nmodwerk_scale_masks_end:').split(':', 1)[1])


def shared_translation():
    block = between(SHARED.read_text(), '\nmodwerk_scale_from_quantizer:', '\nmodwerk_scale_from_quantizer_end:')
    return [int(x) for line in block.splitlines()[1:] for x in re.findall(r'\d+', line.split('|')[0].replace('.byte', ''))]


def quantizer_masks():
    return words(between((QUANTIZER / 'core.s').read_text(), '\nqz_masks:', '.balign 4').split(':', 1)[1])


def rule(note, mask, root):
    """The written rule: the nearest note whose degree above root is in mask, the lower first, within 0..127."""
    for distance in range(12):
        for candidate in (note - distance, note + distance):
            if 0 <= candidate <= 127 and mask >> ((candidate - root) % 12) & 1:
                return candidate
    return note


class Tables(unittest.TestCase):
    def test_masks_are_octabams_catalogue(self):
        masks = shared_masks()
        self.assertEqual(masks, octabam_masks())
        self.assertEqual(len(masks), 52)
        self.assertEqual(len(set(masks)), 52)
        self.assertTrue(all(m & 1 and m <= 0xfff for m in masks))  # every scale holds its tonic
        self.assertIn('#define MODWERK_SCALE_COUNT 52u', HEADER.read_text())

    def test_vendored_catalogue_is_the_recorded_upstream_file(self):
        record = json.loads(RECORD.read_text())
        self.assertEqual(record['repository'], 'https://github.com/sambanks/octabam')
        for item in record['files']:
            digest = hashlib.sha256((ROOT / item['to']).read_bytes()).hexdigest()
            self.assertEqual(digest, item['sha256'], item['to'])
        self.assertEqual({item['to'] for item in record['files']},
                         {'vendor/octabam-scales/scales.s', 'vendor/octabam-scales/LICENSE'})
        self.assertIn('Copyright (c) 2026 Sam Banks', (ROOT / 'vendor/octabam-scales/LICENSE').read_text())

    def test_quantizer_indices_translate_to_the_same_masks(self):
        catalogue, quantizer, table = shared_masks(), quantizer_masks(), shared_translation()
        self.assertEqual(len(quantizer), 24)
        self.assertEqual(len(table), 25)
        self.assertEqual(table[0], 0)  # OFF stays OFF
        for n in range(1, 25):
            self.assertEqual(catalogue[table[n] - 1], quantizer[n - 1], 'SCALE %d' % n)
        self.assertEqual(table[1:8], list(range(1, 8)))  # IDs 1..7 match ...
        self.assertTrue(all(table[n] != n for n in range(8, 25)))  # ... 8..24 differ
        self.assertEqual(len(set(table[1:])), 24)
        self.assertIn('MODWERK_SCALE_QUANTIZER_COUNT 24u', HEADER.read_text())

    def test_rule_agrees_with_the_quantizers_rotated_mask(self):
        """qz_scale_mask rotates the mask by ROOT and qz_msnap tests a note's pitch class: the same set as the
        degree above ROOT that octabam's sc_snap tests."""
        for mask in quantizer_masks():
            for root in range(12):
                rotated = ((mask << root) | (mask << root) >> 12) & 0xfff
                for pc in range(12):
                    self.assertEqual(rotated >> pc & 1, mask >> ((pc - root) % 12) & 1)


def assemble(work, name, source, cpu, text_at, symbols=()):
    (work / (name + '.s')).write_text(source)
    obj, elf = work / (name + '.o'), work / (name + '.elf')
    subprocess.run(['m68k-elf-as', '-mcpu=' + cpu, '-o', str(obj), str(work / (name + '.s'))], check=True, capture_output=True)
    subprocess.run(['m68k-elf-ld', '-Ttext=%#x' % text_at, '-e', '%#x' % text_at,
                    *('--defsym=%s=%#x' % s for s in symbols), '-o', str(elf), str(obj)], check=True, capture_output=True)
    subprocess.run(['m68k-elf-objcopy', '-O', 'binary', '-j', '.text', '-j', '.rodata', str(elf), str(work / (name + '.bin'))],
                   check=True)
    table = {line.split()[2]: int(line.split()[0], 16) for line in subprocess.check_output(
        ['m68k-elf-nm', str(elf)], text=True).splitlines() if len(line.split()) == 3}
    return (work / (name + '.bin')).read_bytes(), table, obj


class Execution(unittest.TestCase):
    """Each routine runs on Unicorn's ColdFire V4e; a call returns to RETURN, where the run stops."""
    CODE, NV, STACK, RETURN = 0x10000, 0x100b1000, 0x7f000, 0x7eff0

    @classmethod
    def setUpClass(cls):
        if not (BINUTILS and UNICORN):
            return
        from unicorn import Uc, UC_ARCH_M68K, UC_MODE_BIG_ENDIAN
        from unicorn import m68k_const
        cls.m = m68k_const
        cls.work = Path(tempfile.mkdtemp(prefix='shared-scale-'))
        cls.uc = Uc(UC_ARCH_M68K, UC_MODE_BIG_ENDIAN)
        cls.uc.ctl_set_cpu_model(m68k_const.UC_CPU_M68K_CFV4E)
        cls.uc.mem_map(0x10000, 0x10000)
        cls.uc.mem_map(cls.NV, 0x1000)
        cls.uc.mem_map(0x7e000, 0x2000)
        cls.uc.mem_write(cls.RETURN, b'\x4e\x71')  # nop: the run ends here
        # The shared file, as the base assembles it.
        code, cls.shared, _ = assemble(cls.work, 'shared', SHARED.read_text(), '54455', cls.CODE)
        # Scale Quantizer's snap from its own sources: core.s's rotation and table, quantizer.s's qz_msnap.
        core = (QUANTIZER / 'core.s').read_text()
        quant = (QUANTIZER / 'quantizer.s').read_text()
        msnap = between(quant, '\nqz_msnap:\n', '\nqz_ms_found:\n') + '\nqz_ms_found:\n' + \
            between(quant, '\nqz_ms_found:\n', '        rts\n').split('\n', 2)[2] + '        rts\n'
        harness = ('        .text\n        .set NV_SCALE, 0x100b14ec\n        .set NV_ROOT, 0x100b14ee\n'
                   '        .set SCALE_AT, qz_scale_mask\n'
                   + between(core, '\nqz_scale_mask:\n', '\nqz_core_end:') + msnap)
        quantizer, cls.quantizer, _ = assemble(cls.work, 'quantizer', harness, '5475', 0x18000)
        # octabam's sc_snap from the vendored file: sc_index, sc_mask, sc_snap and sc_masks.
        vendored = VENDORED.read_text()
        octabam = ('        .text\n        .equ SC_COUNT, 52\n'
                   + between(vendored, '\nsc_index:\n', '\nsc_name:\n')
                   + between(vendored, '\nsc_snap:\n', '\n| ==== a MIDI track')
                   + '        .balign 2\n' + between(vendored, '\nsc_masks:\n', '\n\n') + '\n')
        octa, cls.octabam, _ = assemble(cls.work, 'octabam', octabam, '5475', 0x1c000)
        for at, image in ((0x10000, code), (0x18000, quantizer), (0x1c000, octa)):
            cls.uc.mem_write(at, image)

    @classmethod
    def tearDownClass(cls):
        if getattr(cls, 'work', None):
            shutil.rmtree(cls.work, ignore_errors=True)

    def run_at(self, entry, d0=0, d1=0, args=()):
        m, uc = self.m, self.uc
        uc.reg_write(m.UC_M68K_REG_SR, 0x2700)
        sp = self.STACK - 4 * (len(args) + 1)
        uc.mem_write(sp, struct.pack('>%dI' % (len(args) + 1), self.RETURN, *(a & 0xffffffff for a in args)))
        uc.reg_write(m.UC_M68K_REG_A7, sp)
        uc.reg_write(m.UC_M68K_REG_D0, d0 & 0xffffffff)
        uc.reg_write(m.UC_M68K_REG_D1, d1 & 0xffffffff)
        for reg, value in ((m.UC_M68K_REG_D2, 0x22222222), (m.UC_M68K_REG_D3, 0x33333333),
                           (m.UC_M68K_REG_D4, 0x44444444), (m.UC_M68K_REG_D5, 0x55555555)):
            uc.reg_write(reg, value)
        uc.emu_start(entry, self.RETURN, count=4000)
        self.assertEqual(uc.reg_read(m.UC_M68K_REG_PC), self.RETURN)
        self.assertEqual(uc.reg_read(m.UC_M68K_REG_A7), sp + 4)
        return uc.reg_read(m.UC_M68K_REG_D0)

    def snap(self, note, scale_id, root):
        result = self.run_at(self.shared['modwerk_scale_snap'], args=(note, scale_id, root))
        kept = [self.uc.reg_read(r) for r in (self.m.UC_M68K_REG_D2, self.m.UC_M68K_REG_D3, self.m.UC_M68K_REG_D4,
                                              self.m.UC_M68K_REG_D5)]
        self.assertEqual(kept, [0x22222222, 0x33333333, 0x44444444, 0x55555555])  # C: d2-d7 kept
        return result

    @EXECUTE
    def test_shared_snap_equals_scale_quantizers_snap_note_for_note(self):
        table, checked = shared_translation(), 0
        for scale in range(1, 25):
            for root in range(12):
                self.uc.mem_write(0x100b14ec, bytes((scale, 0, root)))
                for note in range(128):
                    theirs = self.run_at(self.quantizer['qz_msnap'], d0=note)
                    ours = self.snap(note, table[scale], root)
                    self.assertEqual(ours, theirs, 'SCALE %d ROOT %d note %d' % (scale, root, note))
                    checked += 1
        self.assertEqual(checked, 24 * 12 * 128)

    @EXECUTE
    def test_shared_snap_equals_octabams_sc_snap_for_every_id(self):
        masks, checked = shared_masks(), 0
        for scale_id in range(1, 53):
            for root in range(12):
                for note in range(128):
                    theirs = self.run_at(self.octabam['sc_snap'], d0=note, d1=scale_id << 4 | root)
                    ours = self.snap(note, scale_id, root)
                    self.assertEqual(ours, theirs, 'ID %d root %d note %d' % (scale_id, root, note))
                    self.assertEqual(ours, rule(note, masks[scale_id - 1], root))
                    checked += 1
        self.assertEqual(checked, 52 * 12 * 128)

    @EXECUTE
    def test_out_of_range_inputs_return_the_note(self):
        for note in range(128):
            for root in range(12):
                self.assertEqual(self.snap(note, 0, root), note)  # no scale
            self.assertEqual(self.snap(note, 53, 0), note)
            self.assertEqual(self.snap(note, 1, 12), note)
        for note in (-1, 128, 0x7fffffff):
            self.assertEqual(self.snap(note, 1, 0), note & 0xffffffff)
        # The tables are where the header says: modwerk_scale_masks[id - 1] and the translation's 25 bytes.
        image = bytes(self.uc.mem_read(self.shared['modwerk_scale_masks'], 104))
        self.assertEqual(list(struct.unpack('>52H', image)), shared_masks())
        self.assertEqual(list(self.uc.mem_read(self.shared['modwerk_scale_from_quantizer'], 25)), shared_translation())


class Builds(unittest.TestCase):
    @unittest.skipUnless(BINUTILS, 'no ColdFire binutils')
    def test_card_and_base_assemble_to_the_same_position_independent_bytes(self):
        spec = importlib.util.spec_from_file_location('shared_scale_codegen', ROOT / 'sdk/runtime/m68k_codegen.py')
        codegen = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(codegen)
        with tempfile.TemporaryDirectory() as folder:
            work = Path(folder)
            images = {}
            for cpu, at in (('5475', 0x400d2000), ('54455', 0x10000), ('54455', 0x46000000)):
                images[(cpu, at)], symbols, obj = assemble(work, 'scale-%s-%x' % (cpu, at), SHARED.read_text(), cpu, at)
                self.assertEqual(symbols['modwerk_scale_snap'], at)
                relocations = re.findall(r'R_68K_\w+', subprocess.run(['m68k-elf-objdump', '-r', str(obj)], check=True,
                                                                        capture_output=True, text=True).stdout)
                self.assertEqual(relocations, ['R_68K_PC16'])  # the table, PC-relative: it links anywhere unchanged
                self.assertEqual(codegen.check_mcf54455([obj]), 1)
            self.assertEqual(len(set(images.values())), 1)

    @unittest.skipUnless(shutil.which('m68k-elf-gcc') and BINUTILS, 'no ColdFire compiler')
    def test_a_c_runtime_package_calls_it_through_the_header(self):
        with tempfile.TemporaryDirectory() as folder:
            work = Path(folder)
            caller = work / 'scale_caller.c'
            caller.write_text('#include "%s"\nvolatile int snapped;\nvoid module_tick(void *p)\n{\n    (void)p;\n'
                              '    unsigned id = modwerk_scale_from_quantizer[8];\n'
                              '    snapped = modwerk_scale_snap(61, id, 2) + modwerk_scale_masks[id - 1];\n}\n'
                              % HEADER)
            output = work / 'scale_caller.mwrm'
            run = subprocess.run([sys.executable, '-B', str(ROOT / 'sdk/runtime/loader/build.py'), str(caller),
                                  str(SHARED), '-o', str(output)], capture_output=True, text=True)
            self.assertEqual(run.returncode, 0, run.stderr)
            self.assertEqual(output.read_bytes()[:4], b'MWRM')


if __name__ == '__main__':
    unittest.main()
