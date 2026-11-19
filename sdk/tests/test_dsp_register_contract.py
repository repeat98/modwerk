"""scripts/dsp-register-contract.py: the DSP56300 register contract of Octatrack DSP package entries, read from their
assembled words. The decoding rules and the package reader run everywhere; the routines need dsp_asm and the
dsp56kDisassemble built beside it."""
import importlib.util
import json
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('dsp_register_contract', ROOT / 'scripts/dsp-register-contract.py')
contract = importlib.util.module_from_spec(spec)
spec.loader.exec_module(contract)

ASM = os.environ.get('ELEKLOADER_DSP_ASM') or shutil.which('dsp_asm')
TOOL = contract.disassembler()
SITE = {'index': 9, 'name': 'dsp_test', 'clobbers': ['a', 'x0'], 'exit': {'A': '0x00400'}}


class Decoding(unittest.TestCase):
    def test_doctor_batch_has_each_modules_individual_findings(self):
        driver = [sys.executable, '-B', str(ROOT / 'scripts/dsp-register-contract.py')]
        ids = ('miniverb', 'euclid')
        batch = json.loads(subprocess.check_output([*driver, '--json-modules', *ids], cwd=ROOT))
        self.assertEqual(set(batch), set(ids))
        for module in ids:
            single = json.loads(subprocess.check_output([*driver, '--json', module], cwd=ROOT))
            single.pop('reports', None)  # The doctor consumes the summary.
            self.assertEqual(batch[module], single)

    def test_what_each_form_writes(self):
        for line, regs in (('move x:(r6)+,x0', {'r6', 'x0'}), ('tfr y1,b x:(r6)+n6,x1 y:(r0)-,b', {'b', 'r6', 'x1', 'r0'}),
                           ('lua (r0)+n0,r1', {'r1'}), ('move a,x:(r1)+', {'r1'}), ('move (r3)+n3', {'r3'}),
                           ('bclr #$10,y:-(r5)', {'r5'}), ('bset #$3,a', {'a'}), ('btst #$a,a', set()),
                           ('tge r4,r3', {'r3'}), ('teq x0,a r0,r1', {'a', 'r1'}), ('move ssh,x0', {'ssh', 'x0'}),
                           ('ori #$37,eom', {'omr'}), ('andi #$fe,ccr', set()), ('cmp x0,a x:(r0)+,x1', {'r0', 'x1'}),
                           ('move a1,y:>$c06', set()), ('move l:(r2)+,ab', {'a', 'b', 'r2'}), ('mpy x0,y0,a', {'a'}),
                           ('do #<$3c,>$4107', set()), ('movep x:<<$ffffc4,a', {'a'}), ('norm r0,a', {'r0', 'a'})):
            mnemonic, _, operands = line.partition(' ')
            self.assertEqual(contract.semantics(mnemonic, operands)[0], regs, line)

    def test_flow(self):
        self.assertEqual(contract.semantics('rts', '')[1], 'return')
        self.assertEqual(contract.semantics('jsr', '(r2)')[1:], ('call', '(r2)'))
        self.assertEqual(contract.semantics('jclr', '#$3,x:$ffff93,func_004010')[1:], ('cond', 'func_004010'))
        self.assertEqual(contract.semantics('bra', 'func_00400e')[1], 'jump')
        self.assertEqual(contract.target_of('func_00400e'), 0x400e)

    def test_what_it_does_not_model_fails_closed(self):
        for line in ('illegal', 'stop', 'pflush', 'move a,mystery', 'add x0,mystery'):
            mnemonic, _, operands = line.partition(' ')
            with self.assertRaises(contract.Unmodelled, msg=line):
                contract.semantics(mnemonic, operands)


class PublishedPackages(unittest.TestCase):
    def test_each_effect_package_has_the_words_and_entries_its_catalogue_build_has(self):
        built = {p['id']: p for p in json.loads((ROOT / 'src/engine/assets/dsp-packages.json').read_text())['packages']
                 if not p.get('hooks')}
        compared = 0
        for module, version, words, relocations, entries, _ in contract.published():
            p = built.get(module)
            if not p or p['version'] != version:
                continue
            compared += 1
            self.assertEqual(words, [int(p['code'][i:i + 6], 16) for i in range(0, len(p['code']), 6)], module)
            self.assertEqual(relocations, p['relocations'], module)
            self.assertEqual(entries, [('init', p['init'], None, None), ('proc', p['proc'], None, None)], module)
        self.assertGreaterEqual(compared, 5)

    def test_an_engine_enters_from_its_site_and_leaves_by_a_long_branch(self):
        engines = [(m, w, e) for m, _, w, _, e, label in contract.published() if e[0][0] == 'hook' and label.endswith('.mwrm')]
        self.assertTrue(engines)
        for module, words, entries in engines:
            for kind, offset, site, exit_word in entries:
                self.assertIn(site, {s['index'] for s in json.loads(contract.SITES.read_text())['sites']}, module)
                self.assertLess(offset, len(words), module)
                if exit_word:
                    self.assertEqual(words[exit_word - 1], 0x0d10c0, module)  # BRA, long displacement in the next word


@unittest.skipUnless(ASM and TOOL, 'dsp_asm (ELEKLOADER_DSP_ASM) or dsp56kDisassemble beside it unavailable')
class Routines(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.work = tempfile.TemporaryDirectory(prefix='modwerk-dsp-contract-test.')

    @classmethod
    def tearDownClass(cls):
        cls.work.cleanup()

    def entry(self, text, kind, label, data=(), site=None):
        """The report row of one entry of `text`, assembled where the check places packages, `data` words after it."""
        src, out, sym = (pathlib.Path(self.work.name) / ('t.' + e) for e in ('asm', 'bin', 'sym'))
        src.write_text(text)
        subprocess.run([ASM, '-in', str(src), '-org', '%x' % contract.BASE, '-out', str(out), '-sym', str(sym)],
                       check=True, capture_output=True)
        b = out.read_bytes()
        words = [b[i] | b[i + 1] << 8 | b[i + 2] << 16 for i in range(0, len(b), 3)] + list(data)
        labels = {line.split()[0]: int(line.split()[1], 16) for line in sym.read_text().splitlines() if line.strip()}
        exit_word = next((i + 1 for i, w in enumerate(words) if w == 0x0d10c0), None) if site else None
        entries = [(kind, labels[label] - contract.BASE, site and site['index'], exit_word)]
        report = contract.check('fixture', '0', words, [], entries, {SITE['index']: SITE} if site else {}, TOOL, self.work.name)
        return report['entries'][0]

    def test_an_init_that_moves_r1_is_reported(self):
        row = self.entry('init:\n        clr     a\n        move    a,x:(r1)+\n        rts\n', 'init', 'init')
        self.assertEqual(row['writes'], ['a', 'r1'])
        self.assertEqual(len(row['findings']), 1)
        self.assertIn('writes r1 on a path back', row['findings'][0])
        self.assertIn('trap-init-r1', row['findings'][0])

    def test_a_callee_counts_and_proc_may_move_r1(self):
        text = 'init:\n        move    #>$5,a\n        bsr     helper\n        rts\nhelper:\n        move    #$0,n1\n' \
               '        bsr     inner\n        rts\ninner:\n        clr     b\n        rts\nproc:\n        move    a,x:(r1)+\n        rts\n'
        row = self.entry(text, 'init', 'init')
        self.assertEqual(row['writes'], ['a', 'b', 'n1'])
        self.assertIn('writes n1 on a path back', row['findings'][0])
        self.assertEqual(self.entry(text, 'proc', 'proc')['findings'], [])

    def test_data_beside_the_code_is_never_decoded_and_reached_data_fails_closed(self):
        clean = self.entry('init:\n        clr     a\n        rts\n', 'init', 'init', data=[0x000040, 0x000700])
        self.assertEqual((clean['writes'], clean['findings']), (['a'], []))
        row = self.entry('init:\n        tst     a\n        beq     tailx\n        rts\ntailx:\n', 'init', 'init', data=[0x000040])
        self.assertEqual(row['findings'], ['incomplete: undecodable at P:$%04x' % (contract.BASE + 4)])

    def test_calls_and_jumps_out_of_the_package_are_findings(self):
        row = self.entry('init:\n        jsr     $292\n        rts\n', 'init', 'init')
        self.assertTrue(row['findings'][0].startswith('incomplete: unmodelled at P:$4000: jsr'), row['findings'])
        row = self.entry('proc:\n        jmp     $292\n', 'proc', 'proc')
        self.assertEqual(row['findings'], ['leaves to P:$0292, outside the package: no contract names that continuation'])

    def test_a_hook_entry_is_judged_on_each_path_against_its_site(self):
        text = 'hook:\n        move    x:>$420,a\n        tst     a\n        beq     leave\n        rts\nleave:\n' \
               '        move    ssh,x0\n        clr     b\n        bra     tailx\ntailx:\n'
        row = self.entry(text, 'hook', 'hook', site=SITE)
        self.assertEqual((row['returning'], row['leaving'], row['leaves']), (['a'], ['a', 'b', 'ssh', 'x0'], ['exit']))
        self.assertEqual(len(row['findings']), 1)
        self.assertIn('writes b on a path out through the site\'s exit', row['findings'][0])
        row = self.entry('hook:\n        move    #>$208,r6\n        rts\n', 'hook', 'hook', site=SITE)
        self.assertIn('writes r6 on a path back to its caller (site 9 dsp_test clobbers [a, x0])', row['findings'][0])


if __name__ == '__main__':
    unittest.main()
