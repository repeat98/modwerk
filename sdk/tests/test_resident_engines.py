# SPDX-License-Identifier: GPL-3.0-or-later
"""Resident controller engines on demand, the DSP side, from fresh private assemblies (no stock image).

1. Relocation. Each real engine unit (resident_dsp.engine_unit) relocated at several arena bases three ways must
   agree word for word: a fresh assembly of the authored source at that base, resident_dsp.relocate, and the
   base's own C relocator (resident_engines.c's mw_engine_relocate, over the C data resident_engines.data_c makes).
   A wrong relocation would be distortion on the unit.
2. Execution (resident_engines_native.cpp under the vendored DSP interpreter). The receiver of an on-demand
   build PLACEs the engine and its CAS switches the stubs on; each stub then runs the placed engine. The same
   stub of the resident build (the engine in the permanent block) runs from the same X/Y memory and registers.
   X and Y afterwards, the data ALU registers and the instruction count must be bit-identical; an address
   register may differ only by the engine's displacement (a P address it holds). The receiver also refuses an
   enable before PLACE, a second PLACE, and an unplace while enabled.
3. Sidechain across the two cores (resident_dsp.REVIEWED). Two interpreters, their shared windows one memory, run
   the engine's hooks call by call in the dispatcher's order: the key is two blocks late whatever the cores' enable
   offset and skew, never read from the slot being written; upstream's text and a reader of the writer's counter
   show what the change fixes and why it was not that. MON ends with its COMPRESSOR. The changed instructions are
   read back by the vendored disassembler.

Needs dsp_asm (ELEKLOADER_DSP_ASM) and, for (2), the vendored dsp56300 build (ELEKLOADER_DSP56300: its source/
and build/source/ libraries, /opt/toolchain/vendor/dsp56300 in the modwerk-source-tools image). The interpreter
is not the chip: this proves the relocation and the receiver's arithmetic, never timing or audio on a unit.
"""
from contextlib import contextmanager
import hashlib
import importlib.util
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
ADAPTER = ROOT / 'sdk/machines/octatrack/module-adapters'
ELEK = ROOT / 'sdk/machines/octatrack/elekloader'
RUNTIME = ADAPTER / 'resident-runtime'
sys.path.insert(0, str(ADAPTER))
import resident_dsp  # noqa: E402
import resident_engines  # noqa: E402
import resident_source  # noqa: E402

ASM = os.environ.get('ELEKLOADER_DSP_ASM') or shutil.which('dsp_asm')
EMU = Path(os.environ.get('ELEKLOADER_DSP56300', '/opt/toolchain/vendor/dsp56300'))
LIBS = [EMU / 'build/source' / part for part in ('dsp56kEmu/libdsp56kEmu.a', 'dsp56kBase/libdsp56kBase.a', 'asmjit/libasmjit.a')]
VTUNE = EMU / 'build/source/vtuneSdk/libvtuneSdk.a'  # the JIT's profiling hooks, where the build has them
RECEIVER_ORIGIN = 0x400
STUBS = {resident_dsp.SIDECHAIN: ('hsc_tap', 'hsc_det', 'hsc_commit'), resident_dsp.MATRIX: ('hom_mix', 'hom_phn'),
         resident_dsp.ANALOG_BD: ('hab_source',)}
# Words that steer each engine down its working path rather than its early return (on the fixed registers below,
# r6 = $6280): Sidechain's track 3 with KEY 3 and its monitor on, MATRIX selected, an Analog BD source record.
ACTIVE = {resident_dsp.SIDECHAIN: ('X 1056 3', 'X %d %d' % (0x628d, 0x30000), 'Y %d %d' % (0x7f6, 0x10000)),
          resident_dsp.MATRIX: ('X %d %d' % (0x205, 0x1000), 'X %d 1' % 0x103b),
          resident_dsp.ANALOG_BD: tuple('X %d 0' % a for a in range(0x5000, 0x5040)) +  # a quiet record: the rest zero
          ('X %d %d' % (0x209, 0x5000), 'X %d %d' % (0x5000, 0xab09), 'X %d %d' % (0x5002, 0x0909))}
# Analog BD's working path on core A then points its voice block (r5) at X:$f598xx, which the interpreter has no
# memory for (it faults, in the resident build as in the placed one): compare its first 160 instructions, to the
# voice loop. The dormant path and core B's working path run to the end.
LIMIT = {('A', resident_dsp.ANALOG_BD): 160}


def read(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def fresh(ob, tag, feature, base, work, assemble, analog):
    """The authored engine assembled at `base` itself (engine_unit's own build, at any base)."""
    table, texts = resident_dsp._engines(ob, tag, base, feature, analog)
    words, _ = resident_dsp.assemble_authored('\n'.join(texts), base + len(table), work, assemble)
    return table + words


def c_relocated(units, bases, work):
    """mw_engine_relocate's words for every (tag, feature) unit at every base, from resident_engines.data_c's data."""
    bundles = {tag: dict(onDemand=sum(f for (t, f) in units if t == tag),
                         engines={f: u for (t, f), u in units.items() if t == tag}) for tag in 'AB'}
    (work / 'data.c').write_text(resident_engines.data_c(bundles))
    order = sorted(units)
    main = ['#include <stdio.h>', '#include "resident_engines.h"', 'int main(void) {',
            '    static uint32_t out[8192];', '    static const unsigned bases[] = {%s};' % ','.join('%du' % b for b in bases)]
    for tag, feature in order:
        core, k = 'AB'.index(tag), (1, 2, 4).index(feature)
        main += ['    for (unsigned b = 0; b < %d; ++b) {' % len(bases),
                 '        mw_engine_relocate(&mw_engine_units[%d][%d], bases[b], out);' % (core, k),
                 '        for (unsigned i = 0; i < mw_engine_units[%d][%d].count; ++i) printf("%%u ", (unsigned)out[i]);' % (core, k),
                 '        printf("\\n");', '    }']
    main += ['    return 0;', '}']
    (work / 'main.c').write_text('\n'.join(main) + '\n')
    (work / 'stubs.c').write_text(r'''
#include <stdint.h>
#include "transfer.h"
volatile uint32_t dl_pool_base[2], dl_pool_words[2];
int dl_owned_command_reserve(unsigned a,uint32_t b,unsigned c,unsigned d,unsigned e,unsigned f,struct dl_owned_job *g) { (void)a;(void)b;(void)c;(void)d;(void)e;(void)f;(void)g;return 0; }
int dl_owned_upload_reserve(unsigned a,uint32_t b,const struct dl_upload *c,struct dl_owned_job *d) { (void)a;(void)b;(void)c;(void)d;return 0; }
int dl_owned_submit(const struct dl_owned_job *v) { (void)v;return 0; }
int dl_owned_cancel(const struct dl_owned_job *v) { (void)v;return 0; }
int dl_owned_job_poll(const struct dl_owned_job *v,struct dl_owned_progress *p) { (void)v;(void)p;return 0; }
int dl_owned_job_release(const struct dl_owned_job *v) { (void)v;return 0; }
void dl_owned_fail_closed(unsigned c) { (void)c; }
int dl_engine_claim(unsigned c,unsigned r,int k) { (void)c;(void)r;(void)k;return 0; }
void dl_engine_release(unsigned c,unsigned r) { (void)c;(void)r; }
unsigned dl_engine_reserved(unsigned c) { (void)c;return 0; }
int mw_engines_test_quiet(void) { return 1; }
int mw_engines_test_settled(void) { return 1; }
volatile uint8_t dl_engine_why[2];
''')
    import resident_driver
    core = read('resident_engines_dsp_core', ELEK / 'build_core.py')
    (work / 'transfer.h').write_text(resident_driver.transport_header((core.DYNLOAD / 'transfer.h').read_text()))
    shutil.copyfile(ELEK / 'fxids.h', work / 'fxids.h')
    out = work / 'relocate'
    subprocess.run(['cc', '-std=c11', '-O1', '-Wall', '-Wextra', '-Werror', '-DMW_ENGINES_TEST', '-DMODWERK_FX_IDS=128',
                    '-I' + str(work), '-I' + str(RUNTIME), str(work / 'main.c'), str(work / 'stubs.c'), str(work / 'data.c'),
                    str(RUNTIME / 'resident_engines.c'), '-o', str(out)], check=True, capture_output=True)
    rows = subprocess.run([str(out)], check=True, capture_output=True, text=True).stdout.splitlines()
    result, k = {}, 0
    for key in order:
        for base in bases:
            result[key, base] = list(map(int, rows[k].split()))
            k += 1
    return result


@unittest.skipUnless(ASM and shutil.which('cc'), 'dsp_asm (ELEKLOADER_DSP_ASM) or a host C compiler unavailable')
class ResidentEngines(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.packages = read('resident_engines_packages', ELEK / 'dsp_packages.py')
        cls.ob = cls.packages.Octabam(str(ROOT / 'sdk/octabam'))
        cls.work = tempfile.TemporaryDirectory(prefix='modwerk-resident-engines.')
        cls.units, cls.analog = {}, {}
        for tag in 'AB':
            cls.analog[tag] = resident_dsp._analog(cls.ob.root, tag)[0]
            for feature in resident_dsp.FEATURES:
                if feature & resident_dsp.ALLOWED[tag]:
                    cls.units[tag, feature] = resident_dsp.engine_unit(cls.ob, tag, feature, cls.work.name,
                                                                      cls.packages.assemble, cls.analog[tag])

    @classmethod
    def tearDownClass(cls):
        cls.work.cleanup()

    def test_real_units_relocate_alike_in_c_in_python_and_freshly_assembled(self):
        # Arena-like bases: the lowest legal one, the top of a 4,418/4,546-word arena under a block ending at $2000,
        # stacked placements, a 4K boundary, and the build's own proof bases.
        bases = sorted({0x0460, 0x0a41, 0x0fff, 0x1000, 0x1333, 0x17ff, 0x1c01, 0x1d5e, 0x1e00 - 998, 0x2000 - 37 - 423})
        with tempfile.TemporaryDirectory() as temp:
            relocated = c_relocated(self.units, bases, Path(temp))
        for (tag, feature), unit in self.units.items():
            self.assertEqual(len(unit['words']), {1: 423, 2: 675, 4: 998}[feature])
            for base in bases:
                with self.subTest(tag=tag, feature=feature, base=hex(base)):
                    python = resident_dsp.relocate(unit, base)
                    self.assertEqual(relocated[(tag, feature), base], python)
                    self.assertEqual(fresh(self.ob, tag, feature, base, self.work.name, self.packages.assemble,
                                           self.analog[tag]), python)

    @classmethod
    def harness(cls):
        """resident_engines_native.cpp against the vendored interpreter, built once per run."""
        harness = Path(cls.work.name) / 'resident-engines-native'
        if not harness.is_file():
            subprocess.run(['c++', '-std=c++17', '-O2', '-DDSP56300_DEBUGGER=0', '-DASMJIT_STATIC',
                            '-I' + str(EMU / 'source'), '-I' + str(EMU / 'source/asmjit/src'),
                            str(ROOT / 'sdk/tests/resident_engines_native.cpp'), *map(str, LIBS),
                            *([str(VTUNE)] if VTUNE.is_file() else []), '-lpthread', '-ldl', '-o', str(harness)],
                           check=True, capture_output=True)
        return harness

    @unittest.skipUnless(all(p.is_file() for p in LIBS) and shutil.which('c++'), 'vendored dsp56300 build unavailable')
    def test_placed_engine_runs_bit_exactly_as_the_resident_one(self):
        loader = resident_source.load_loader()
        work = Path(self.work.name)
        harness = self.harness()

        def receiver(bundle, tag):
            """The receiver at RECEIVER_ORIGIN, its table reaching exactly to the block, as the build lays them."""
            def text(table):
                return loader.receiver_source(loader.RECEIVER.read_text(), (0x7c8, 0x7c9), table, tag=tag, ids=128,
                                              hook_control=resident_dsp.receiver_control(bundle),
                                              hook_reset=resident_dsp.receiver_reset(bundle))
            _, labels = self.packages.assemble(text(1200), RECEIVER_ORIGIN, str(work))
            table = bundle['origin'] - labels['dltable']
            words, final = self.packages.assemble(text(table), RECEIVER_ORIGIN, str(work))
            self.assertEqual(final['dltable'], labels['dltable'])
            self.assertEqual(final['dltable'] - RECEIVER_ORIGIN, len(words))
            return words, final, table

        def run(steps):
            path = work / 'script.txt'
            path.write_text('\n'.join(steps) + '\n')
            result = subprocess.run([str(harness), str(path)], capture_output=True, text=True, timeout=600)
            self.assertEqual(result.returncode, 0, result.stderr)
            # The emulator logs to stdout too; keep only the harness's own answers.
            return [line for line in result.stdout.split('\n') if line.split(' ')[0] in ('A', 'P', 'S', 'H', 'G', 'AR')]

        def image(words, origin):
            return ['P %d %d' % (origin + i, w) for i, w in enumerate(words)]

        def memory():
            # The engines' owned X/Y and everything low they may read, then fixed registers: the same in both runs.
            steps = ['FILL x 0 32768 11', 'FILL y 0 32768 23', 'FILL y %d %d 37' % (0x33dfe, 0x34000),
                     'FILL y %d %d 41' % (0x3bdfe, 0x3c000)]
            steps += ['R r %d %d' % (i, 0x6100 + 0x40 * i) for i in range(8)]
            steps += ['R n %d %d' % (i, i + 1) for i in range(8)] + ['R m %d %d' % (i, 0xffffff) for i in range(8)]
            return steps + ['ZERO']  # the receiver's packets leave different data registers in the two runs

        def observe():
            return ['HASH x 0 32768', 'HASH y 0 32768', 'HASH y %d %d' % (0x33dfe, 0x34000),
                    'HASH y %d %d' % (0x3bdfe, 0x3c000), 'REGS']

        for tag in 'AB':
            allowed = resident_dsp.ALLOWED[tag]
            resident = resident_dsp.place_resident(self.ob, tag, 0x2000, str(work), self.packages.assemble, 0)
            demand = resident_dsp.place_resident(self.ob, tag, 0x2000, str(work), self.packages.assemble, allowed)
            r_words, r_labels, _ = receiver(resident, tag)
            d_words, d_labels, d_table = receiver(demand, tag)
            for feature in resident_dsp.FEATURES:
                if not feature & allowed:
                    continue
                unit = demand['engines'][feature]
                n = len(unit['words'])
                for offset in (d_table - n, 64 + 333):  # the arena's top (directly under the block), and lower down
                    base = d_labels['dltable'] + offset
                    with self.subTest(tag=tag, feature=feature, base=hex(base)):
                        hwbase = demand['labels']['hwbase%d' % feature]
                        control = d_labels['hookcontrol']
                        steps = image(d_words, RECEIVER_ORIGIN) + image(demand['words'], demand['origin'])
                        steps += image(resident_dsp.relocate(unit, base), base)
                        steps += ['P %d %d' % (d_labels['hookready'], allowed),   # every reset complete
                                  'PKT %d 0 %d 0' % (control, feature),           # enable before PLACE: refused
                                  'PKT %d %d %d 1' % (control, feature, offset),  # PLACE
                                  'RP %d' % hwbase,
                                  'PKT %d %d %d 1' % (control, feature, offset),  # placed already: refused
                                  'PKT %d 0 %d 0' % (control, feature),           # enable
                                  'PKT %d %d 0 1' % (control, feature)]           # unplace while enabled: refused
                        # The feature's state as its RESET leaves it (Analog BD's authored tables, zeroed Y ranges).
                        reset = []
                        for record in resident_dsp.initialization_records(resident):
                            if any(r['owner'] == feature and r['space'] == record['space'] and r['address'] == record['address']
                                   for r in resident['resources']):
                                reset += ['%s %d %d' % (record['space'].upper(), record['address'] + i, w)
                                          for i, w in enumerate(record['words'])]

                        def go(labels):
                            # Each stub from the same memory twice: as filled (mostly the early return), then from
                            # the feature's reset state, steered down its working path.
                            out = []
                            for limit, pokes in ((400000, ()), (LIMIT.get((tag, feature), 400000), reset + list(ACTIVE[feature]))):
                                out += memory() + list(pokes)
                                out += sum((['GO %d %d %d' % (labels[s], limit, RECEIVER_ORIGIN)] + observe() for s in STUBS[feature]), [])
                            return out
                        placed = run(steps + go(demand['labels']))
                        self.assertEqual(placed[:5], ['A 0', 'A 1', 'P %d %d' % (hwbase, base), 'A 0', 'A 1'])
                        self.assertEqual(placed[5], 'A 0')
                        steps = image(r_words, RECEIVER_ORIGIN) + image(resident['words'], resident['origin'])
                        steps += ['P %d %d' % (r_labels['hookready'], allowed), 'PKT %d 0 %d 0' % (r_labels['hookcontrol'], feature)]
                        reference = run(steps + go(resident['labels']))
                        self.assertEqual(reference[0], 'A 1')
                        mine, theirs = placed[6:], reference[1:]
                        self.assertEqual(len(mine), len(theirs))
                        block = range(resident['origin'], resident['origin'] + len(resident['words']))
                        for line, (a, b) in enumerate(zip(mine, theirs)):
                            stub = (STUBS[feature] * 2)[line // 7] if line // 7 < 2 * len(STUBS[feature]) else '-'
                            if a.startswith('AR'):
                                # Only a P address may differ: into the placed engine here, into the block there.
                                for x, y in zip(map(int, a.split()[1:]), map(int, b.split()[1:])):
                                    self.assertTrue(x == y or (base <= x < base + n and y in block), (stub, a, b))
                            elif a.startswith('S ') and a.split()[2] == b.split()[2] == '0':
                                # Stopped inside the engine: the same instruction of the unit, at its two addresses.
                                first = resident_dsp.ENTRIES[feature][0]
                                start = resident['labels'][first] - unit['entries'][first]
                                self.assertEqual((a.split()[1], int(a.split()[3]) - base), (b.split()[1], int(b.split()[3]) - start), stub)
                            else:
                                self.assertEqual(a, b, stub)
                        ran = [line.split() for line in mine if line.startswith('S ')]
                        if os.environ.get('RESIDENT_ENGINES_VERBOSE'):
                            print(tag, feature, hex(base), [(s, n, how) for s, (_, n, how, _) in zip(STUBS[feature] * 2, ran)])
                        # Returned, or left for stock code (or stopped at the limit above).
                        self.assertTrue(all(how in ('1', '2') or ((tag, feature) in LIMIT and n == str(LIMIT[tag, feature]))
                                            for _, n, how, _ in ran), ran)
                        self.assertGreater(max(int(n) for _, n, _, _ in ran), 10, ran)        # more than a replay ran
                        # Disable, then unplace: the base word goes back to 0.
                        tail = run(image(d_words, RECEIVER_ORIGIN) + image(demand['words'], demand['origin']) +
                                   ['P %d %d' % (d_labels['hookready'], allowed), 'PKT %d %d %d 1' % (control, feature, offset),
                                    'PKT %d 0 %d 0' % (control, feature), 'PKT %d %d 0 0' % (control, feature),
                                    'PKT %d %d 0 1' % (control, feature), 'RP %d' % hwbase])
                        self.assertEqual(tail[:5], ['A 1', 'A 1', 'A 1', 'A 1', 'P %d 0' % hwbase])


    @unittest.skipUnless(all(p.is_file() for p in LIBS) and shutil.which('c++'), 'vendored dsp56300 build unavailable')
    def test_disabling_one_engine_leaves_another_engines_base_word_alone(self):
        """Two on-demand engines placed and enabled on core A, then one disabled: the other's base word (where its
        stubs jump) must stay exactly as PLACE wrote it, and the disabled one must need a new RESET before it can be
        enabled again. The receiver used r3 for both the base-word check and `hookready`, so the CAS that disabled
        Sidechain cleared bit 0 of Analog BD's base word (its stub then jumped one word short) and left Sidechain's
        ready bit set."""
        loader = resident_source.load_loader()
        work = Path(self.work.name)
        harness = self.harness()
        tag, allowed = 'A', resident_dsp.ALLOWED['A']
        demand = resident_dsp.place_resident(self.ob, tag, 0x2000, str(work), self.packages.assemble, allowed)

        def text(table):
            return loader.receiver_source(loader.RECEIVER.read_text(), (0x7c8, 0x7c9), table, tag=tag, ids=128,
                                          hook_control=resident_dsp.receiver_control(demand),
                                          hook_reset=resident_dsp.receiver_reset(demand))
        _, labels = self.packages.assemble(text(1200), RECEIVER_ORIGIN, str(work))
        words, labels = self.packages.assemble(text(demand['origin'] - labels['dltable']), RECEIVER_ORIGIN, str(work))
        control, ready = labels['hookcontrol'], labels['hookready']
        sc, ab = resident_dsp.SIDECHAIN, resident_dsp.ANALOG_BD
        offsets = {sc: 64}
        offsets[ab] = 64 + len(demand['engines'][sc]['words']) + 8
        offsets[ab] += (labels['dltable'] + offsets[ab] + 1) % 2  # an odd base: bit 0 set, the bit a Sidechain disable clears
        steps = ['P %d %d' % (RECEIVER_ORIGIN + i, w) for i, w in enumerate(words)]
        steps += ['P %d %d' % (demand['origin'] + i, w) for i, w in enumerate(demand['words'])]
        for feature, offset in offsets.items():
            base = labels['dltable'] + offset
            steps += ['P %d %d' % (base + i, w) for i, w in enumerate(resident_dsp.relocate(demand['engines'][feature], base))]
        steps += ['P %d %d' % (ready, allowed)]                                   # every reset complete
        steps += ['PKT %d %d %d 1' % (control, f, o) for f, o in offsets.items()]  # PLACE both
        steps += ['PKT %d 0 %d 0' % (control, sc | ab),                            # enable both
                  'PKT %d %d %d 0' % (control, sc | ab, ab),                       # disable Sidechain, keep Analog BD
                  'RP %d' % demand['labels']['hwbase%d' % ab], 'RP %d' % ready,
                  'PKT %d %d %d 0' % (control, ab, sc | ab)]                       # Sidechain again, with no RESET
        (work / 'two.txt').write_text('\n'.join(steps) + '\n')
        result = subprocess.run([str(harness), str(work / 'two.txt')], capture_output=True, text=True, timeout=600)
        self.assertEqual(result.returncode, 0, result.stderr)
        out = [line for line in result.stdout.split('\n') if line.split(' ')[0] in ('A', 'P')]
        self.assertEqual(out, ['A 1', 'A 1', 'A 1', 'A 1',
                               'P %d %d' % (demand['labels']['hwbase%d' % ab], labels['dltable'] + offsets[ab]),
                               'P %d %d' % (ready, allowed & ~sc), 'A 0'])

    def sc_run(self, variant, enable, skew, frames, removed=None):
        """One two-core run of `variant`: {(hook, track, n): (frame, source track) or None}."""
        engines = self.sc_engines(variant)
        steps, dumps, calls = sc_script(engines, enable, skew, frames, removed)
        path = Path(self.work.name) / 'sc-script.txt'
        path.write_text('\n'.join(steps) + '\n')
        result = subprocess.run([str(self.harness()), str(path)], capture_output=True, text=True, timeout=600)
        self.assertEqual(result.returncode, 0, result.stderr)
        lines = [line.split() for line in result.stdout.split('\n') if line.split(' ')[0] in ('S', 'D')]
        ran = [line for line in lines if line[0] == 'S']
        self.assertEqual(len(ran), calls)
        self.assertTrue(all(line[2] == '1' for line in ran), [line for line in ran if line[2] != '1'][:3])  # every hook returned
        words = [list(map(int, line[3:])) for line in lines if line[0] == 'D']
        self.assertEqual(len(words), len(dumps))
        return {key: sc_block(block) for key, block in zip(dumps, words)}

    def sc_engines(self, variant):
        if variant not in self.sc_cache:
            engines = {}
            with sc_reviewed(sc_variants()[variant]):
                for tag in 'AB':
                    table, texts = resident_dsp._engines(self.ob, tag, SC_ORIGIN, resident_dsp.SIDECHAIN, None)
                    words, labels = resident_dsp.assemble_authored('\n'.join(texts), SC_ORIGIN + len(table), self.work.name,
                                                                   self.packages.assemble)
                    engines[tag] = (table + words, labels)
            self.sc_cache[variant] = engines
        return self.sc_cache[variant]

    def sc_delays(self, blocks, settled):
        """Each reader's key delay in frames, every frame and from `settled` on, after checking every read is the
        KEY's own block and MON committed exactly what scdet read. A delay of 0 (already filled this frame) or 4 (still
        to be filled this frame) is a read of the slot the writer fills in that frame."""
        every, delays = ({track: [] for track in SC_KEYS} for _ in range(2))
        for (hook, track, n), block in sorted(blocks.items(), key=lambda kv: kv[0][2]):
            if hook != 'scdet':
                continue
            self.assertEqual(blocks['moncommit', track, n], block)
            if block is None:
                continue
            self.assertEqual(block[1], SC_KEYS[track])
            every[track].append(n - block[0])
            if n >= settled:
                delays[track].append(n - block[0])
        return every, delays

    @unittest.skipUnless(all(p.is_file() for p in LIBS) and shutil.which('c++'), 'vendored dsp56300 build unavailable')
    def test_sidechain_key_phase_is_two_blocks_whatever_the_enable_order(self):
        self.__class__.sc_cache = getattr(self.__class__, 'sc_cache', {})
        # The resident change: the same two-block delay for every enable offset (both orders, 0..5 frames) and core
        # skew, and with a skew that moves every frame; never the slot the writer fills that frame.
        skews = [(str(skew), lambda n, skew=skew: skew) for skew in SC_SKEWS] + [('walk', lambda n: SC_WALK[n % 6])]
        for name, skew in skews:
            for offset in SC_OFFSETS:
                enable = (3 + max(0, -offset), 3 + max(0, offset))
                with self.subTest(variant='resident', skew=name, offset=offset):
                    every, delays = self.sc_delays(self.sc_run('resident', enable, skew, max(enable) + 10), max(enable) + 3)
                    for track in SC_KEYS:
                        self.assertEqual(set(delays[track]), {2}, (track, every[track]))
                        self.assertLessEqual(set(every[track]), {1, 2, 3}, (track, every[track]))
        # Upstream as pinned: each core seeds its own counter at its own first frame, so the delay is set by the
        # enable offset, and two offsets in four read the slot being written (the assertion inside sc_delays).
        seen = {}
        for offset in SC_OFFSETS:
            enable = (3 + max(0, -offset), 3 + max(0, offset))
            _, delays = self.sc_delays(self.sc_run('upstream', enable, lambda n: 0.5, max(enable) + 10), max(enable) + 3)
            seen[offset] = tuple(sorted(set(delays[4]))), tuple(sorted(set(delays[0])))
        if os.environ.get('RESIDENT_ENGINES_VERBOSE'):
            print('upstream key delays (T5 <- T3, T1 <- T6) by enable offset', seen)
        self.assertTrue(all(len(a) == 1 for pair in seen.values() for a in pair))  # constant within an enable
        self.assertEqual({a[0] for a, _ in seen.values()}, {1, 2, 3, 4})            # set by the offset
        self.assertTrue(any(a[0] in (0, 4) or b[0] in (0, 4) for a, b in seen.values()))
        # Reading the writer's counter at each read instead: no slot being written, but a reader on its core's first
        # track races the writer's advance at the writer's first track every frame, so the delay jumps between two
        # and three blocks as the skew moves (XBUS's "rotation read" defect).
        every, delays = self.sc_delays(self.sc_run('reader', (3, 4), lambda n: SC_WALK[n % 6], 20), 7)
        if os.environ.get('RESIDENT_ENGINES_VERBOSE'):
            print('reader of the writer\'s counter, moving skew, T5 <- T3 by frame', every[4])
        self.assertEqual(set(delays[4]), {2, 3}, delays[4])

    @unittest.skipUnless(all(p.is_file() for p in LIBS) and shutil.which('c++'), 'vendored dsp56300 build unavailable')
    def test_sidechain_mon_ends_with_its_compressor(self):
        """A COMPRESSOR taken off a track with MON on: upstream keeps committing the last key stash there."""
        self.__class__.sc_cache = getattr(self.__class__, 'sc_cache', {})
        for variant in ('resident', 'upstream'):
            with self.subTest(variant=variant):
                blocks = self.sc_run(variant, (3, 4), lambda n: 0.5, 24, removed=16)
                for n in range(8, 24):
                    committed = blocks['moncommit', 4, n]
                    if n < 16:
                        self.assertEqual(committed, blocks['scdet', 4, n])          # MON: the key, as read
                    elif variant == 'resident':
                        self.assertEqual(committed, (n, 4))                         # the track's own block again
                    else:
                        self.assertEqual(committed, blocks['moncommit', 4, 15])      # the stale stash, every frame

    @unittest.skipUnless(all(p.is_file() for p in LIBS) and shutil.which('c++'), 'vendored dsp56300 build unavailable')
    def test_sidechain_key_phase_disassembles_as_written(self):
        """The changed instructions, read back by the vendored disassembler: no silent re-encoding (octabam's
        assembler traps), each core's own and other window words, and every form one the upstream file already uses."""
        self.__class__.sc_cache = getattr(self.__class__, 'sc_cache', {})
        for tag, (own, other, base, middle) in (('A', (0x33dfe, 0x3bdfe, 4, 6)), ('B', (0x3bdfe, 0x33dfe, 0, 2))):
            words, labels = self.sc_engines('resident')[tag]
            at = {name: 'func_%06x' % labels[name] for name in ('kph1', 'kph2', 'kph3', 'zz29', 'zz30', 'mc09')}
            expected = {
                'zz01': ['move x:>$420,a', 'cmp #>$%x,a' % base, 'beq ' + at['kph1'], 'cmp #>$%x,a' % middle,
                         'bne ' + at['zz30'], 'move #>$%x,r1' % own, 'move y:(r1),b', 'cmp #>$10000,b',
                         'beq ' + at['zz30'], 'bsr ' + at['kph2'], 'move #$1,b', 'move #>$%x,r1' % own,
                         'move b,y:(r1)', 'bra ' + at['zz30'], 'move #>$%x,r1' % own, 'move y:(r1),b',
                         'cmp #>$10000,b', 'beq ' + at['zz29'], 'bsr ' + at['kph2'], 'bra ' + at['zz30']],
                'kph2': ['move #$0,a', 'move #>$%x,r1' % other, 'move y:(r1),b', 'cmp #>$10000,b', 'bne ' + at['kph3'],
                         'move #>$%x,r1' % (other + 1), 'move y:(r1),b', 'and #>$3,b', 'move b1,a',
                         'move #>$%x,r1' % (own + 1), 'move a,y:(r1)', 'rts'],
                'moncommit': ['move x:>$206,r0', 'move x:>$420,a', 'asl #$1,a,a', 'move a1,n1', 'move #>$7f0,r1',
                              'lua (r1)+n1,r1', 'move y:(r1),b', 'cmp #>$10000,b', 'beq ' + at['mc09'], 'rts',
                              'move #$0,b', 'move b,y:(r1)+', 'move y:(r1),b']}
            steps = ['P %d %d' % (SC_ORIGIN + i, w) for i, w in enumerate(words)]
            steps += ['DIS %d %d' % (labels[name], labels[name] + 2 * len(lines)) for name, lines in expected.items()]
            path = Path(self.work.name) / 'sc-dis.txt'
            path.write_text('\n'.join(steps) + '\n')
            out = subprocess.run([str(self.harness()), str(path)], capture_output=True, text=True, timeout=600, check=True)
            seen = [line.split(' ', 3) for line in out.stdout.split('\n') if line.startswith('I ')]
            for name, lines in expected.items():
                with self.subTest(tag=tag, at=name):
                    start = next(i for i, row in enumerate(seen) if int(row[1]) == labels[name])
                    self.assertEqual([' '.join(row[3].split()) for row in seen[start:start + len(lines)]], lines)
            # Every instruction form (operands' numbers and branch targets aside) is one upstream's own code uses.
            forms = {}
            for variant in ('resident', 'upstream'):
                words, labels = self.sc_engines(variant)[tag]
                path.write_text('\n'.join(['P %d %d' % (SC_ORIGIN + i, w) for i, w in enumerate(words)] +
                                          ['DIS %d %d' % (labels['sctap'], SC_ORIGIN + len(words))]) + '\n')
                out = subprocess.run([str(self.harness()), str(path)], capture_output=True, text=True, timeout=600, check=True)
                forms[variant] = {re.sub(r'func_[0-9a-f]+|\$[0-9a-f]+', 'N', ' '.join(line.split(' ', 3)[3].split()))
                                  for line in out.stdout.split('\n') if line.startswith('I ')}
            self.assertLessEqual(forms['resident'], forms['upstream'], forms['resident'] - forms['upstream'])

# Sidechain's key phase across the two cores (resident_dsp.REVIEWED). Each core runs its own P/X/Y; the two cores'
# windows of the shared Y are one memory. A run interleaves whole hook calls in the order the dispatcher makes them
# (per track: sctap at FX1 entry, scdet in COMPRESSOR's proc, moncommit at the commit), core B's track slots sitting
# `skew` slots after core A's. Two readers sit on their core's first track: T5 keyed from T3 (core B's local track
# 2, the case measured on the unit) and T1 keyed from T6 (core A's local track 1). KEY GAIN 64 is an exact 1.0 and
# KEY FLT 64 bypasses, so the key block scdet leaves at X:$40 is the source block as published, and its words name
# the frame and the track it came from. MON is on: moncommit then commits that block in place of the track's own.
SC_TRACKS = {'A': (4, 5, 6, 7), 'B': (0, 1, 2, 3)}
SC_KEYS = {4: 2, 0: 5}
SC_PARAMS, SC_BLOCK, SC_ORIGIN = 0x6280, 0x6400, 0x1000
SC_WINDOWS = ((0x33dfe, 0x34000), (0x3bdfe, 0x3c000))
SC_OFFSETS = range(-5, 6)                       # core 1 enabled this many frames after core 0 (negative: before)
SC_SKEWS = (-1.5, -0.5, 0, 0.5, 1.5)
SC_WALK = (-1.5, -0.5, 0.5, 1.5, 0.5, -0.5)     # a skew that moves by a slot per frame
SC_READ = ("""        move    #>@GCNT@,r1
        move    y:(r1),b
        add     #>2,b                   ; b = GCNT + 2 (== GCNT - 2 mod 4)
""", """        move    #>@FGCNT@,r1
        move    y:(r1),b
        add     #>2,b                   ; b = GCNT + 2 (== GCNT - 2 mod 4)
""")


def sc_stamp(frame, track):
    return 0x200000 | frame << 8 | track << 5


def sc_block(words):
    """(frame, track) a published block names; None for a never-written (zero) one."""
    if not any(words):
        return None
    head = words[0]
    if head >> 21 != 1 or head & 31 or words != list(range(head, head + 32)):
        raise AssertionError('a torn or foreign key block: %r' % words[:4])
    return head >> 8 & 0xfff, head >> 5 & 7


@contextmanager
def sc_reviewed(entries):
    saved = resident_dsp.REVIEWED
    resident_dsp.REVIEWED = entries
    try:
        yield
    finally:
        resident_dsp.REVIEWED = saved


def sc_variants():
    """The engine texts compared: the resident change, upstream as pinned, and a reader of the writer's counter."""
    pinned, _, _, _ = resident_dsp.REVIEWED['sidechain-compressor']
    text = (ROOT / 'sdk/octabam' / next(p for p in resident_dsp.SOURCES if p.endswith('patch_sc_dsp3.asm'))).read_text()
    reader = text.replace(*SC_READ)
    return {'resident': resident_dsp.REVIEWED, 'upstream': {},
            'reader': {'sidechain-compressor': (pinned, (SC_READ,), hashlib.sha256(reader.encode()).hexdigest(),
                                                {'A': {'@FGCNT@': '$3bdff'}, 'B': {'@FGCNT@': '$33dff'}})}}


def sc_script(engines, enable, skew, frames, removed=None):
    """Steps for one run, and what each DUMP is: core c's hooks run from frame enable[c]."""
    steps, lanes = [], []
    for core, tag in enumerate('AB'):
        words, _ = engines[tag]
        steps += ['CORE %d' % core] + ['P %d %d' % (SC_ORIGIN + i, w) for i, w in enumerate(words)]
        for track in SC_TRACKS[tag]:
            if track in SC_KEYS:
                steps += ['X %d %d' % (SC_PARAMS + 0xd, (SC_KEYS[track] + 1) << 16 | 64 << 8),
                          'X %d %d' % (SC_PARAMS + 0xe, 64 << 16 | 1 << 8)]
        lane = []
        for n in range(enable[core], frames):
            at = 4 * n + (skew(n) if core else 0)
            for local, track in enumerate(SC_TRACKS[tag]):
                lane.append((at + local, core, 'sctap', track, n))
                if track in SC_KEYS and (removed is None or n < removed):
                    lane.append((at + local + 0.1, core, 'scdet', track, n))
                lane.append((at + local + 0.2, core, 'moncommit', track, n))
        lanes.append(lane)
    steps += ['SHARE y %d %d' % window for window in SC_WINDOWS]
    # Merge the two cores by time; each keeps its own order, and a tie goes to core A.
    events, (a, b) = [], lanes
    while a or b:
        events.append((a if a and (not b or a[0][0] <= b[0][0]) else b).pop(0))
    current, dumps = None, []
    for _, core, hook, track, n in events:
        if core != current:
            steps.append('CORE %d' % core)
            current = core
        steps.append('X %d %d' % (0x420, track))
        if hook == 'scdet':
            steps += ['R r 6 %d' % SC_PARAMS, 'R r 7 %d' % SC_BLOCK, 'R r 0 0']
        else:
            steps += ['RAMP x 0 32 %d' % sc_stamp(n, track), 'X %d %d' % (0x208, SC_PARAMS), 'X %d 0' % 0x206]
        steps.append('GO %d 4000 %d' % (engines['AB'[core]][1][hook], SC_ORIGIN))
        if hook == 'scdet':
            steps.append('DUMP x %d %d' % (0x40, 0x60))
            dumps.append((hook, track, n))
        elif hook == 'moncommit' and track in SC_KEYS:
            steps.append('DUMP x 0 32')
            dumps.append((hook, track, n))
    return steps, dumps, len(events)

if __name__ == '__main__':
    unittest.main()
