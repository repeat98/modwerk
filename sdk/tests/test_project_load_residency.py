# SPDX-License-Identifier: GPL-3.0-or-later
"""The DSP residency observer during a project load (host, ASan/UBSan), #1826.

On an MKII with six modules restored from the card, loading FLEX07 from TARGET stopped the DSP frames before PLAY
(19 November 2026, docs/verification/2026-11-19-octatrack-project-load-dsp.md). Both projects run the same stock
effects, yet the observer in manager.c's dl_residency_tick planned automatic residency from the live slots while stock
rewrote them and the bank, and a Spring Reverb bind was in flight at the stall. The base now lets the observer plan only
once fxmap.c says the load is over (modwerk_fxmap_loading()).

This builds dl_residency_tick as the base build generates it (build_core.py's seams and the resident transforms, in
build_core.py's order) beside stubs for what it calls, with the live FX array and the bank's Parts as the test's, and
counts the automatic plans it begins. Without the gate, mode 1 fails at the first intermediate live set. No DSP,
transfer or timing is modelled: the board fixture (test_resident_engines_board.py) is built without the observer.
"""
import importlib.util
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
ADAPTER = ROOT / 'sdk/machines/octatrack/module-adapters'
ELEK = ROOT / 'sdk/machines/octatrack/elekloader'
sys.path.insert(0, str(ADAPTER))
sys.path.insert(0, str(ELEK))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import resident_engines  # noqa: E402
import resident_journal  # noqa: E402
import resident_placement  # noqa: E402
import zero_state  # noqa: E402
from host_flags import SANITIZE  # noqa: E402


def manager_text():
    """manager.c as build_core.py writes it for the beta base (--resident-stock-hooks --resident-on-demand)."""
    spec = importlib.util.spec_from_file_location('project_load_residency_core', ELEK / 'build_core.py')
    core = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(core)
    text = reference = (core.DYNLOAD / 'manager.c').read_text()
    for old, new in core.DSP_EDITS.get('manager.c', ()) + core.WIDTH_EDITS.get('manager.c', ()):
        assert text.count(old) == 1, old[:60]
        text = text.replace(old, new)
    text = resident_engines.manager(resident_journal.manager(resident_placement.manager(text)))
    for old, new in core.REFUSAL_EDITS['manager.c']:
        assert text.count(old) == 1, old[:60]
        text = text.replace(old, new)
    text = resident_engines.refusal(text)
    if 'manager.c' in zero_state.UNITS:
        text = zero_state.unit('manager.c', text, reference)
    return text


def observer(text):
    """dl_residency_tick's whole definition, reading the test's live FX array."""
    start = text.index('void dl_residency_tick(void) {')
    depth, at = 0, start
    while True:
        depth += {'{': 1, '}': -1}.get(text[at], 0)
        if depth == 0 and text[at] == '}':
            break
        at += 1
    body = text[start:at + 1]
    live = '(const volatile uint8_t *)0x80000ec4u'
    assert body.count(live) == 1, 'the observer no longer reads the live FX array once; review this test'
    return body.replace(live, 'test_live')


HARNESS = r'''
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "fxids.h"
volatile uint32_t dl_residency_enabled = 1;
static uint32_t journal_generation, auto_serial = 0x80000000u, parked;
static unsigned phase, queued_token, observed_valid;
static uint8_t owed_id[16], observed[16];
static fx_set observed_held[2], observed_played[2];
static volatile uint8_t test_live[16];
static int loading, project_wait;
int mw_project_fx_wait(const uint8_t ids[16]) { (void)ids; return project_wait; }
int modwerk_fxmap_loading(void) { return loading; }   /* fxmap.c: a project load runs */
static int modwerk_stock_hook_export_idle(void) { return 1; }
static int modwerk_saved_set_busy(void) { return 0; }
static void advance(void) {}
static void dl_publication_tick(void) {}
static void tripwire(void) {}
static void reinit(void) {}
static unsigned begins, begun_auto;
static uint8_t begun[16];
static void begin(const uint8_t ids[16], uint32_t token, unsigned automatic)
{
    (void)token;
    ++begins, begun_auto = automatic;
    memcpy(begun, ids, 16);
}
/* The bank's four Parts name what the live set runs, each core's stock effects loaded on demand (soft). */
static void parts(const uint8_t ids[16], fx_set held[2], fx_set named[2], fx_set soft[2], fx_set played[2])
{
    for (unsigned c = 0; c < 2; ++c) held[c] = named[c] = soft[c] = played[c] = (fx_set){{0}};
    for (unsigned i = 0; i < 16; ++i) {
        unsigned c = (i & 7) < 4 ? 1u : 0u;
        if (ids[i]) soft[c] = fx_with(soft[c], ids[i]), played[c] = fx_with(played[c], ids[i]);
    }
}
OBSERVER
enum { FILTER = 1, DELAY = 2, SPRING = 20, SPATIAL = 21, CHORUS = 22 };
/* TARGET and FLEX07: Spring Reverb on T1 FX2, Spatializer on T5 FX1, FILTER and DELAY elsewhere. */
static const uint8_t target[16] = {FILTER, FILTER, FILTER, FILTER, SPATIAL, FILTER, FILTER, FILTER,
                                   SPRING, DELAY, DELAY, DELAY, DELAY, DELAY, DELAY, DELAY};
static void show(const uint8_t ids[16]) { for (unsigned i = 0; i < 16; ++i) test_live[i] = ids[i]; }
static void ticks(unsigned n) { while (n--) dl_residency_tick(); } /* eight: the Parts are read every fourth tick */
#define CHECK(x) do { if (!(x)) { fprintf(stderr, "mode %d line %d: %s (begins %u)\n", mode, __LINE__, #x, begins); return 1; } } while (0)
int main(int argc, char **argv)
{
    int mode = argc > 1 ? atoi(argv[1]) : 0;
    show(target);
    ticks(8);
    CHECK(begins == 1 && begun_auto == 1 && !memcmp(begun, target, 16)); /* the first look plans the set it sees */
    /* Stock loads the next project: the live slots go through the default effects and Parts the project does not end on. */
    loading = 1;
    uint8_t step[16];
    memset(step, 0, 16);
    show(step), ticks(8);
    CHECK(begins == 1);
    memcpy(step, target, 16), step[8] = 0, step[4] = CHORUS;
    show(step), ticks(8);
    CHECK(begins == 1);
    uint8_t final[16];
    memcpy(final, target, 16);
    if (mode == 2) final[4] = CHORUS; /* FLEX07 with Chorus where TARGET has Spatializer */
    show(final), ticks(8);
    CHECK(begins == 1);
    loading = 0;
    if (mode == 1) {
        /* The same effects as before the load: nothing to plan, so no residency change and no DSP packet. */
        ticks(8);
        CHECK(begins == 1);
    } else if (mode == 2) {
        /* One automatic plan, for the completed project. */
        ticks(8);
        CHECK(begins == 2 && begun_auto == 1 && !memcmp(begun, final, 16));
    } else if (mode == 3) {
        /* A transaction still open when the load ends keeps the observer waiting, then it plans what the project names. */
        phase = 1;
        final[4] = CHORUS, show(final), ticks(8);
        CHECK(begins == 1);
        phase = 0, ticks(8);
        CHECK(begins == 2 && !memcmp(begun, final, 16));
    } else if (mode == 4) {
        project_wait = -1;
        final[4] = CHORUS; show(final); ticks(8);
        CHECK(begins == 1);
        project_wait = 1; ticks(1); project_wait = 0; ticks(8);
        CHECK(begins == 2 && !memcmp(begun, final, 16));
    } else return 2;
    return 0;
}
'''


@unittest.skipUnless(shutil.which('cc'), 'host C compiler unavailable')
class ProjectLoadResidency(unittest.TestCase):
    def test_the_observer_plans_only_the_completed_project(self):
        with tempfile.TemporaryDirectory() as temp:
            work = Path(temp)
            (work / 'observer.c').write_text(HARNESS.replace('OBSERVER', observer(manager_text())))
            out = work / 'observer'
            built = subprocess.run(['cc', '-std=c11', '-Wall', '-Wextra', '-Werror', *SANITIZE, '-DMODWERK_FX_IDS=64',
                                    '-I' + str(ELEK), str(work / 'observer.c'), '-o', str(out)], capture_output=True, text=True)
            self.assertEqual(built.returncode, 0, built.stderr)
            for mode in (1, 2, 3, 4):
                with self.subTest(mode=mode):
                    run = subprocess.run([str(out), str(mode)], capture_output=True, text=True, timeout=60)
                    self.assertEqual(run.returncode, 0, run.stderr)


if __name__ == '__main__':
    unittest.main()
