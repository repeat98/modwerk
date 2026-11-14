# SPDX-License-Identifier: GPL-3.0-or-later
"""Actual saved-set code holds still while a volatile journal owns RAM and takes
only an exactly matching Keep; absent backend is closed.

The loader's normal host suite exercises real allocation, site publication,
partial/unknown synthetic ACKs and reverse rollback under both pool sizes.
These fixtures establish native source behavior, not physical DSP readiness.
"""
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from host_flags import SANITIZE  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
LOADER = ROOT / 'sdk/runtime/loader'
ELEK = ROOT / 'sdk/machines/octatrack/elekloader'


@unittest.skipUnless(shutil.which('cc'), 'host C compiler unavailable')
class RuntimeJournal(unittest.TestCase):
    def compile_run(self, source, defines=()):
        with tempfile.TemporaryDirectory() as temp:
            fixture = Path(temp) / 'fixture.c'
            fixture.write_text(source)
            args = ['cc', '-std=c99', '-Wall', '-Wextra', '-Werror', '-pedantic',
                    *defines, '-I', LOADER, '-I', ROOT / 'sdk/runtime/upload',
                    '-I', ELEK, fixture, '-o', Path(temp) / 'fixture']
            compiled = subprocess.run(args, capture_output=True, text=True)
            self.assertEqual(compiled.returncode, 0, compiled.stderr)
            ran = subprocess.run([Path(temp) / 'fixture'], capture_output=True, text=True)
            self.assertEqual(ran.returncode, 0, ran.stderr)

    def test_actual_board_begin_gate_refuses_every_outstanding_work_factor(self):
        # Execute these exact board functions, substituting only the two
        # fixed status registers and uncached host address alias. No fixture
        # result can establish board readiness or a real DSP census.
        text = (ELEK / 'ep0.c').read_text()
        def function(signature):
            start = text.index(signature)
            at = text.index('{', start)
            depth = 1
            end = at + 1
            while depth:
                depth += (text[end] == '{') - (text[end] == '}')
                end += 1
            return text[start:end]
        source = '''#include <assert.h>
#include "vendor.h"
#define MODWERK_SAVED_SET_EXPORT
#define MODWERK_RESIDENT_STOCK_HOOKS
#define MODWERK_RUNTIME_VOLATILE_JOURNAL
#include "volatile_service.h"
#define UNCACHED(p) (p)
static struct mv_transport transport;
static struct mu_context controller;
static struct mvs_service volatile_service;
#define VOLATILE_SERVICE (&volatile_service)
static int started=1,wake_posted,receiving,held,controller_started;
static int journal_busy,service_busy;
int modwerk_runtime_volatile_busy(void) { return journal_busy; }
int modwerk_volatile_busy(const struct mvs_service *s) { assert(s==VOLATILE_SERVICE);return service_busy; }
static int exporting,modset_idle=1,dsp_idle=1,stopped=1,hooks_idle=1;
/* 0x460d1cb8: card mounted (1); 0x460e76a0: USB disk mode active. */
static uint32_t card_ready=1,usb_disk;
static uint32_t reg(uint32_t a) { assert(a==0x460d1cb8u || a==0x460e76a0u); return a==0x460d1cb8u?card_ready:usb_disk; }
#define REG(a) reg(a)
int modwerk_saved_set_busy(void) { return exporting; }
int modwerk_modset_export_idle(void) { return modset_idle; }
int modwerk_dsp_export_idle(void) { return dsp_idle; }
int modwerk_machine_stopped(void) { return stopped; }
int modwerk_stock_hook_export_idle(void) { return hooks_idle; }
''' + function('static int saved_set_structural_safe(void)') + '\n' + function('int modwerk_machine_journal_begin_safe(void)') + '''
int main(void) {
    assert(modwerk_machine_journal_begin_safe());
    int *bad_one[]={&wake_posted,&receiving,&held,&exporting,&journal_busy,&service_busy};
    for(unsigned i=0;i<sizeof bad_one/sizeof bad_one[0];i++) {
        *bad_one[i]=1;assert(!modwerk_machine_journal_begin_safe());*bad_one[i]=0;
        assert(modwerk_machine_journal_begin_safe());
    }
    int *bad_zero[]={&started,&modset_idle,&dsp_idle,&stopped,&hooks_idle};
    for(unsigned i=0;i<sizeof bad_zero/sizeof bad_zero[0];i++) {
        *bad_zero[i]=0;assert(!modwerk_machine_journal_begin_safe());*bad_zero[i]=1;
        assert(modwerk_machine_journal_begin_safe());
    }
    transport.resets=1;assert(!modwerk_machine_journal_begin_safe());transport.handled=1;
    transport.lapses=1;assert(!modwerk_machine_journal_begin_safe());transport.lapses_handled=1;
    assert(modwerk_machine_journal_begin_safe());
    controller_started=1;controller.phase=MU_TRIAL;assert(!modwerk_machine_journal_begin_safe());controller.phase=MU_NORMAL;
    card_ready=0;assert(!modwerk_machine_journal_begin_safe());card_ready=1;
    usb_disk=1;assert(!modwerk_machine_journal_begin_safe());usb_disk=0;
    assert(modwerk_machine_journal_begin_safe());return 0;
}
'''
        self.compile_run(source)

    def test_all_real_saved_set_paths_preserve_both_files_and_ram_baseline(self):
        source = (ELEK / 'test_modset.c').read_text()
        sanitizers = ('-g', *SANITIZE, '-fno-sanitize-recover=all')
        for defines in (('-DMODWERK_HOST',), ('-DMODWERK_HOST', '-DRUNTIME_MODULES=128u', '-DRUNTIME_POOL_BYTES=786432u')):
            with self.subTest(defines=defines):
                self.compile_run(source, defines + sanitizers)

    def test_a_save_torn_inside_its_header_never_wedges_the_saved_set(self):
        # A power cut inside a save's first sector leaves the new header's first bytes and the slot's old bytes after
        # them. The next start restores the other slot or nothing, and the next save restores again. The case lives
        # here, on test_modset.c's pretend card, because a file in the base's folders changes the base.
        fixture = (ELEK / 'test_modset.c').read_text()
        source = fixture[:fixture.index('int main(void)')] + r'''
/* The save just written to `which`, torn: its bytes up to `at`, what the slot held before after them. */
static void tear(unsigned which, unsigned at, const uint8_t *before)
{
    static uint8_t now[SET_BYTES];
    memcpy(now, card[which], SET_BYTES); memcpy(card[which], before, SET_BYTES); memcpy(card[which], now, at);
}
static void fresh(void)
{
    memset(card, 0, sizeof card); memset(card_bytes, 0, sizeof card_bytes);
    boot(); modwerk_modset_service(); CHECK(modwerk_modset_result == NONE_SAVED);
}
static int nothing_restored(void)
{
    return !installed && (modwerk_modset_result == FOREIGN || modwerk_modset_result == DAMAGED || modwerk_modset_result == NONE_SAVED);
}
int main(void)
{
    static uint8_t was[SET_BYTES];
    static const unsigned at[] = {2, 6, 10, 14, 18, 30, 60, 83}; /* magic, version, generation, count, length, base, SHA-256 */
    make(0, 0x873d83ccu, 0); make(1, 0x3cbedc9cu, 0); make(2, 0x873d83ccu, 1);
    for (unsigned i = 0; i < sizeof at / sizeof *at; ++i) {
        /* A fresh card's first save. */
        fresh(); memcpy(was, card[1], SET_BYTES);
        accept(0, 48); modwerk_modset_service(); CHECK(modwerk_modset_result == SAVED); tear(1, at[i], was);
        boot(); modwerk_modset_service(); CHECK(nothing_restored());
        accept(0, 48); modwerk_modset_service(); CHECK(modwerk_modset_result == SAVED);
        boot(); modwerk_modset_service(); CHECK(modwerk_modset_result == RESTORED && installed == 1);
        /* The first save after a base change: both slots hold another base's sets. */
        fresh(); accept(0, 48); accept(1, 40); modwerk_modset_service(); accept(2, 36); modwerk_modset_service();
        card[0][20] ^= 1; card[1][20] ^= 1;
        boot(); modwerk_modset_service(); CHECK(modwerk_modset_result == FOREIGN && !installed);
        memcpy(was, card[1], SET_BYTES);
        accept(0, 48); modwerk_modset_service(); CHECK(modwerk_modset_result == SAVED); tear(1, at[i], was);
        boot(); modwerk_modset_service(); CHECK(nothing_restored());
        accept(0, 48); modwerk_modset_service(); CHECK(modwerk_modset_result == SAVED);
        boot(); modwerk_modset_service(); CHECK(modwerk_modset_result == RESTORED && installed == 1);
        /* This base's whole set in the other slot: the torn one is passed over, and the next save goes over it. */
        fresh(); accept(0, 48); modwerk_modset_service(); accept(1, 40); modwerk_modset_service();
        boot(); modwerk_modset_service(); CHECK(modwerk_modset_result == RESTORED && installed == 2);
        memcpy(was, card[1], SET_BYTES);
        accept(2, 36); modwerk_modset_service(); CHECK(modwerk_modset_result == SAVED); tear(1, at[i], was);
        boot(); modwerk_modset_service(); CHECK(modwerk_modset_result == RESTORED && installed == 2 && modwerk_modset_generation == 2);
        accept(2, 36); modwerk_modset_service(); CHECK(modwerk_modset_result == SAVED);
        boot(); modwerk_modset_service(); CHECK(modwerk_modset_result == RESTORED && installed == 1 && modwerk_modset_generation == 3);
        if (failures) { fprintf(stderr, "torn %u bytes into the header\n", at[i]); return 1; }
    }
    return 0;
}
'''
        self.compile_run(source, ('-DMODWERK_HOST', '-Wno-unused-function', '-g', *SANITIZE, '-fno-sanitize-recover=all'))

    def test_the_base_restores_a_set_file_the_site_wrote_for_the_card(self):
        # The site writes the module set as the base's own file (src/engine/elekloader/card-set.ts) for the card
        # route. card-set-fixture.hex is that writer's output, held byte for byte by card-set.test.ts; here the
        # base's real code takes it: over an older set the unit saved itself, with the unit's later saves winning
        # in turn, and not on another base. On test_modset.c's pretend card, as above.
        site = bytes.fromhex((ROOT / 'sdk/tests/card-set-fixture.hex').read_text().strip())
        fixture = (ELEK / 'test_modset.c').read_text()
        source = fixture[:fixture.index('int main(void)')] + 'static const uint8_t site_file[] = {' + ','.join(map(str, site)) + '};' + r'''
/* The site's file copied to the card as MODWERK0.SET: whole sectors, its length in use in its header. */
static void copy_to_card(void) { memcpy(card[0], site_file, sizeof site_file); card_bytes[0] = (int)be32(site_file + 16); }
int main(void)
{
    CHECK(sizeof site_file % 512u == 0 && be32(site_file + 16) <= sizeof site_file);
    /* A unit that kept one module itself: its first save, generation 1, in the other file. */
    memset(card, 0, sizeof card); memset(card_bytes, 0, sizeof card_bytes);
    boot(); modwerk_modset_service(); CHECK(modwerk_modset_result == NONE_SAVED);
    make(0, 0x11111111u, 0); accept(0, 48); modwerk_modset_service();
    CHECK(modwerk_modset_result == SAVED && card_bytes[1] && !card_bytes[0]);
    /* The site's file beside it: the next start installs exactly its two packages, in its order. */
    copy_to_card(); boot(); modwerk_modset_service();
    CHECK(modwerk_modset_result == RESTORED && installed == 2 && modwerk_modset_count == 2);
    CHECK(prepared == 2 && ids[0] == 0x873d83ccu && ids[1] == 0x3cbedc9cu);
    CHECK(modwerk_modset_generation == 1700000000u);
    /* A module added on the unit afterwards is saved to the other file and is the set of the next start. */
    make(1, 0x22222222u, 0); accept(1, 48); modwerk_modset_service();
    CHECK(modwerk_modset_result == SAVED && modwerk_modset_generation == 1700000001u);
    boot(); modwerk_modset_service();
    CHECK(modwerk_modset_result == RESTORED && installed == 3 && modwerk_modset_count == 3);
    /* A changed byte in a package: not whole, so the unit's own newer file stays the set. */
    copy_to_card(); card[0][HEADER + 9] ^= 1; boot(); modwerk_modset_service();
    CHECK(modwerk_modset_result == RESTORED && installed == 3);
    /* Alone on the card of a unit that runs another base: nothing is installed. */
    memset(card, 0, sizeof card); memset(card_bytes, 0, sizeof card_bytes);
    copy_to_card(); card[0][20] ^= 1; boot(); modwerk_modset_service();
    CHECK(modwerk_modset_result == FOREIGN && !installed);
    if (failures) { fprintf(stderr, "%u card set checks failed\n", failures); return 1; }
    return 0;
}
'''
        sanitizers = ('-g', *SANITIZE, '-fno-sanitize-recover=all')
        for defines in (('-DMODWERK_HOST',), ('-DMODWERK_HOST', '-DRUNTIME_MODULES=128u', '-DRUNTIME_POOL_BYTES=786432u')):
            with self.subTest(defines=defines):
                self.compile_run(source, defines + sanitizers + ('-Wno-unused-function',))  # the fixture's other helpers

    def test_missing_production_journal_backend_does_not_open_a_service(self):
        # Keep the real legacy loader suite and remove only the synthetic
        # journal adapter and its enabled-path fixture. Its weak production
        # functions then execute rather than being asserted from source text.
        source = (LOADER / 'tests/host_test.c').read_text()
        source = source.replace('#define MODWERK_RUNTIME_JOURNAL_EXTERNAL\n', '')
        source = source.replace('#include "../loader.c"', '#include "loader.c"')
        source = source.replace('#include "../../upload/sha256.c"', '#include "sha256.c"')
        start = source.index('/* Trusted synthetic adapter:')
        end = source.index('static const struct mu_backend *b', start)
        source = source[:start] + source[end:]
        start = source.index('    /* The real pool keeps')
        end = source.index('    if (failures)', start)
        source = source[:start] + '''
    CHECK(modwerk_runtime_journal_begin()==RJ_REFUSED);
    CHECK(!modwerk_runtime_volatile_busy());
    struct runtime_journal_progress snapshot;
    modwerk_runtime_journal_snapshot(&snapshot);
    CHECK(snapshot.phase==RJ_IDLE && !snapshot.generation && !snapshot.records);
    CHECK(modwerk_runtime_journal_verify()==RJ_REFUSED);
    CHECK(modwerk_runtime_journal_activate()==RJ_REFUSED);
    CHECK(modwerk_runtime_journal_abort()==RJ_STALE);
    CHECK(modwerk_runtime_journal_accept()==RJ_REFUSED && !modwerk_runtime_volatile_busy());
    CHECK(!modwerk_machine_journal_accept(0,0));
''' + source[end:]
        self.compile_run(source)

    def test_actual_board_ledger_drives_the_real_checked_dsp_commit(self):
        # journal_board.c's stored receipts against dsp.c/fxpage.c/fxmap.c's
        # actual checked publication. Owners, progress, the association row
        # and manager receipts are synthetic; no DSP ACK is established.
        for defines in ((), ('-DMODWERK_FX_IDS=128u',)):
            with self.subTest(defines=defines), tempfile.TemporaryDirectory() as temp:
                args = ['cc', '-std=c99', '-Wall', '-Wextra', '-Werror', '-pedantic', '-g',
                        *SANITIZE, '-fno-sanitize-recover=all', '-DMODWERK_HOST',
                        '-DMODWERK_DSP_ALLOWANCE0=3120', '-DMODWERK_DSP_ALLOWANCE1=3565', '-DMODWERK_DSP_RESERVE=342',
                        *defines, '-I', ELEK, '-I', ROOT / 'sdk/octabam/platform/dsp-dynload-transport',
                        '-I', ROOT / 'sdk/runtime/upload', '-I', LOADER, ELEK / 'test_journal_board.c',
                        '-o', Path(temp) / 'board']
                compiled = subprocess.run(args, capture_output=True, text=True)
                self.assertEqual(compiled.returncode, 0, compiled.stderr)
                ran = subprocess.run([Path(temp) / 'board'], capture_output=True, text=True)
                self.assertEqual(ran.returncode, 0, ran.stderr)

    def test_public_board_adapter_is_closed_and_declares_nothing(self):
        source = (ELEK / 'journal_board.c').read_text()
        self.assertIn('#define MODWERK_JOURNAL_BOARD_ENABLED 0', source)
        self.assertIn('#define MW_REVIEWED_JOURNAL_ASSOCIATIONS /* none */', source)
        build = (ELEK / 'build_core.py').read_text()
        self.assertNotIn('MODWERK_JOURNAL_BOARD_ENABLED', build)
        self.assertNotIn('MW_REVIEWED_JOURNAL_ASSOCIATIONS', build)


if __name__ == '__main__':
    unittest.main()
