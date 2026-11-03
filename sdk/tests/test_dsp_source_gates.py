"""The two DSP source gates vendored from octabam (tools/build/norep.py, nolabelprefix.py) and the
repository driver scripts/dsp-source-gates.py that runs them in modules:check and module:doctor."""
import importlib.util
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
TOOLS = ROOT / 'sdk/octabam/tools/build'
sys.path.insert(0, str(TOOLS))
import nolabelprefix  # noqa: E402
import norep  # noqa: E402

spec = importlib.util.spec_from_file_location('dsp_source_gates', ROOT / 'scripts/dsp-source-gates.py')
gates = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gates)


class VendoredGates(unittest.TestCase):
    def test_a_planted_rep_is_refused(self):
        for line in ('        rep     #$18', '        rep     x0', 'lab:    rep #8', '\trep\t#$7f ; a comment'):
            with self.assertRaises(SystemExit) as c:
                norep.refuse_rep(f'init:\n        clr a\n{line}\n        div x0,a\nproc:\n', 'fixture')
            self.assertIn('rep in a DSP source (fixture)', str(c.exception))
            self.assertIn('line 3', str(c.exception))

    def test_do_loops_comments_and_names_are_not(self):
        norep.refuse_rep('init:\n        do      #$18,>norep_x_01\n        div     x0,a\nnorep_x_01:\n'
                         '        ; rep #8 in a comment\n        move    x:(r1)+,x0   ; rep is gone\nrepeat: nop\n        reprieve\n')

    def test_a_planted_prefix_pair_is_refused(self):
        for a, b in (('end', 'endb'), ('warmz', 'warmz2'), ('loop1', 'loop10')):
            src = f'init:\n{a}:     nop\n        do #<2,>{b}\n{b}:    nop\nproc:\n'
            with self.assertRaises(SystemExit) as c:
                nolabelprefix.refuse_label_prefix(src, 'fixture')
            self.assertIn(f'{a} / {b}', str(c.exception))

    def test_distinct_names_comments_and_operands_are_fine(self):
        nolabelprefix.refuse_label_prefix('init:\n        move    x:(r1)+,x0      ; end: in a comment\n        do      #$18,>st_a_01\n'
                                          '        div     x0,a\nst_a_01:\nst_b_01: nop\nproc:   move    y:(r4),a\n        bra     init\n')


class Driver(unittest.TestCase):
    def test_no_source_in_the_repository_has_a_label_prefix_clash(self):
        folders = [p for p in gates.MODULES.iterdir() if p.is_dir() and not p.name.startswith('_')] + list(gates.SHARED)
        bad = []
        for folder in folders:
            for path in gates.sources(folder):
                clashes = nolabelprefix.label_prefix_clashes(path.read_text(encoding='utf-8', errors='replace'))
                if clashes:
                    bad.append(f'{path.relative_to(ROOT)}: {clashes[:3]}')
        self.assertEqual(bad, [])

    def test_platform_and_base_sources_carry_no_rep(self):
        for folder in gates.SHARED:
            errors, warnings, _ = gates.check_folder(folder, True)
            self.assertEqual(errors + warnings, [], folder)

    def test_a_rep_is_refused_only_from_the_gate_date(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = pathlib.Path(tmp)
            (folder / 'fx.asm').write_text('init:\n        rep     #$18\n        div     x0,a\nproc:\n')
            errors, warnings, files = gates.check_folder(folder, rep_refused=True)
            self.assertEqual((files, len(errors), len(warnings)), (1, 1, 0))
            self.assertIn('rep on line 2', errors[0])
            errors, warnings, files = gates.check_folder(folder, rep_refused=False)
            self.assertEqual((files, len(errors), len(warnings)), (1, 0, 1))
            self.assertIn(gates.REP_REFUSED_FROM, warnings[0])

    def test_a_label_prefix_is_refused_regardless(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = pathlib.Path(tmp)
            (folder / 'fx.asm').write_text('init:\nend:    nop\n        do #<2,>endb\nendb:   nop\nproc:\n')
            (folder / 'upstream').mkdir()
            (folder / 'upstream/ignored.asm').write_text('a:\n        rep #4\nab:\n')
            errors, warnings, files = gates.check_folder(folder, rep_refused=False)
            self.assertEqual((files, len(warnings)), (1, 0))
            self.assertEqual(len(errors), 1)
            self.assertIn('end / endb', errors[0])

    def test_the_modules_and_the_json_report_agree(self):
        added = gates.catalog_added()
        self.assertTrue(added)
        for module_id in ('euclid', 'character'):
            report = subprocess.run([sys.executable, '-B', str(ROOT / 'scripts/dsp-source-gates.py'), '--json', module_id],
                                    cwd=ROOT, capture_output=True, text=True, check=True)
            found = json.loads(report.stdout)
            self.assertEqual(found['module'], module_id)
            self.assertEqual(found['errors'], [])
            self.assertEqual(found, gates.module_findings(module_id, added))
        self.assertFalse(gates.module_findings('character', added)['repRefused'])

    def test_the_whole_repository_passes(self):
        run = subprocess.run([sys.executable, '-B', str(ROOT / 'scripts/dsp-source-gates.py')], cwd=ROOT, capture_output=True, text=True)
        self.assertEqual(run.returncode, 0, run.stderr)
        self.assertIn('0 refused', run.stdout)


if __name__ == '__main__':
    unittest.main()
