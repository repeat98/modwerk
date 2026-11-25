import contextlib
import importlib.util
import io
import shutil
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('coldfire_isa', ROOT / 'sdk/runtime/coldfire_isa.py')
isa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(isa)


@unittest.skipUnless(shutil.which('m68k-elf-as'), 'ColdFire assembler unavailable')
class ColdFireInstructionSetTests(unittest.TestCase):
    def source(self, text):
        folder = tempfile.TemporaryDirectory(prefix='modwerk-isa-test-')
        self.addCleanup(folder.cleanup)
        path = Path(folder.name) / 'unit.s'
        path.write_text(text)
        return path

    def test_code_the_unit_runs_passes(self):
        result, lines = isa.check_source(self.source('        move.l  (0,%a0,%d0.l*4),%d1\n        mvz.b   %d0,%d1\n        rts\n'))
        self.assertEqual((result, lines), ('ok', []))

    def test_each_planted_form_the_cpu_lacks_is_found_with_its_line(self):
        for form in ('lea     (0,%a0,%d0.l*8),%a1',     # scale eight: the address error a MKII restarted on
                     'fmove.d %fp0,%fp1',               # no FPU
                     'move.l  (0,%a0,%d0.w*4),%d1',     # word index
                     'bfextu  (%a0){0:8},%d0'):         # a 68020 form
            with self.subTest(form=form):
                result, lines = isa.check_source(self.source('        nop\n        %s\n        rts\n' % form))
                self.assertEqual(result, 'isa')
                self.assertTrue(lines[0].startswith('line 2: '), lines)

    def test_a_source_that_needs_its_build_is_not_checked_and_never_passes(self):
        result, lines = isa.check_source(self.source('        .include "generated.inc"\n        rts\n'))
        self.assertEqual(result, 'unchecked')
        self.assertTrue(lines)

    def test_every_octatrack_source_that_assembles_alone_is_inside(self):
        outside = {}
        for source in isa.sources(ROOT / tree for tree in isa.OCTATRACK):
            result, lines = isa.check_source(source)
            if result == 'isa':
                outside[source.relative_to(ROOT).as_posix()] = lines
        self.assertEqual(outside, {}, 'rewrite these instructions for the MCF54455 (docs/OCTATRACK_HARDWARE_TRAPS.md)')

    def test_a_stepped_register_reused_in_one_instruction_is_found_with_its_line(self):
        # GCC's late-combine byte copy (octabam #1134, docs/OCTATRACK_HARDWARE_TRAPS.md): the destination is formed
        # from the stepped a0. A push of an argument steps its destination after the source read: well defined.
        result, lines = isa.check_source(self.source('        nop\n        move.b  (%a0)+,(0,%a0,%d0.l)\n'
                                                     '        move.l  (8,%sp),-(%sp)\n        rts\n'))
        self.assertEqual(result, 'stepped')
        self.assertEqual(len(lines), 1)
        self.assertTrue(lines[0].startswith('line 2: '), lines)

    def test_a_table_with_the_same_bytes_is_not_code(self):
        result, lines = isa.check_source(self.source('        rts\ntable:  .word   0x1198,0x0800\n'))
        self.assertEqual((result, lines), ('ok', []))

    def test_no_octatrack_source_that_assembles_alone_reuses_a_stepped_register(self):
        found = {}
        for source in isa.sources(ROOT / tree for tree in isa.OCTATRACK):
            result, lines = isa.check_source(source)
            if result == 'stepped':
                found[source.relative_to(ROOT).as_posix()] = lines
        self.assertEqual(found, {}, 'step the register in an instruction of its own (sdk/runtime/m68k_codegen.py)')

    def test_the_report_exits_zero_unless_strict(self):
        bad = self.source('        lea     (0,%a0,%d0.l*8),%a1\n')
        for argv, code in (([str(bad)], 0), (['--strict', str(bad)], 1)):
            with contextlib.redirect_stdout(io.StringIO()) as out:
                self.assertEqual(isa.main(argv), code)
            self.assertIn('outside the MCF54455 instruction set', out.getvalue())
            self.assertIn('0 sources inside the MCF54455 instruction set, 1 outside, 0 not checked.', out.getvalue())


if __name__ == '__main__':
    unittest.main()
