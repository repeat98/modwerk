# SPDX-License-Identifier: GPL-3.0-or-later
"""Execute MWVB/MWVS against the actual loader journal, allocator and saved set.

Board declarations/ACKs/transport and the card are synthetic; this is no DSP
census, card or hardware qualification (a physical reboot stays a hardware
gate). The real legacy loader suite runs first in each case.
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
GLUE = ROOT / 'sdk/machines/octatrack/module-adapters/saved-set-export'


def units(temp):
    """The real saved set (its sector store/load over the fixture's card) and export reader, as the board builds them."""
    modset, reader = Path(temp) / 'modset_host.c', Path(temp) / 'reader_host.c'
    modset.write_text('#define MODWERK_HOST\n#define MODWERK_HOST_CARD\n#define MODWERK_SAVED_SET_EXPORT\n'
                      '#define MODWERK_RUNTIME_VOLATILE_JOURNAL\n#include "modset.c"\n'
                      'void modwerk_diag_set(void) {}\nvoid modwerk_diag_refused(uint32_t m, uint32_t r) { (void)m; (void)r; }\n') # diag.c's log record of the set: not under test here
    reader.write_text('#define MODWERK_HOST\n#include "saved_set_reader.c"\n')
    return ['-I', GLUE, ELEK / 'volatile_service.c', modset, reader, GLUE / 'saved_set_export.c']


@unittest.skipUnless(shutil.which('cc'), 'host C compiler unavailable')
class VolatileService(unittest.TestCase):
    def test_real_wire_journal_rollback_and_independent_deadlines(self):
        source = (LOADER / 'tests/host_test.c').read_text()
        source = source.replace('#include "../loader.c"', '#include "loader.c"')
        source = source.replace('#include "../../upload/sha256.c"', '#include "sha256.c"')
        source = source.replace('int main(void)', 'static int legacy_main(void)')
        # Real board locks retain an already-raised interrupt level. Model the
        # nested save/restore discipline; keep masked site-access checks exact.
        source = source.replace(
            'CHECK(!locked && !masked); locked = 1; return 4;',
            'CHECK(!masked); return 4u+(uint32_t)locked++;')
        source = source.replace(
            'CHECK(locked && !masked && sr == 4); locked = 0;',
            'CHECK(locked && !masked && sr == 4u+(uint32_t)locked-1u); --locked;')
        source += (LOADER / 'tests/saved_set_fixture.c').read_text()
        source += (LOADER / 'tests/volatile_service_fixture.c').read_text()
        with tempfile.TemporaryDirectory() as temp:
            fixture = Path(temp) / 'fixture.c'
            fixture.write_text(source)
            for defines in ((), ('-DRUNTIME_MODULES=128u', '-DRUNTIME_POOL_BYTES=786432u')):
                executable = Path(temp) / ('fixture-large' if defines else 'fixture')
                args = ['cc', '-std=c99', '-Wall', '-Wextra', '-Werror', '-pedantic', '-g',
                        *SANITIZE, '-fno-sanitize-recover=all',
                        *defines, '-I', LOADER, '-I', ROOT / 'sdk/runtime/upload',
                        '-I', ELEK, fixture, *units(temp), '-o', executable]
                compiled = subprocess.run(args, capture_output=True, text=True)
                self.assertEqual(compiled.returncode, 0, compiled.stderr)
                for case in ('rollback', 'expiry', 'malformed', 'unknown', 'closed', 'wire',
                             'keep', 'keepreplace', 'keepquiet', 'keepabsolute', 'keepunknown', 'keeprefuse'):
                    with self.subTest(defines=defines, case=case):
                        ran = subprocess.run([executable, case], capture_output=True, text=True)
                        self.assertEqual(ran.returncode, 0, ran.stderr)
                # Keep, then every card a power loss or failed save leaves, booted afresh (RAM gone, card kept).
                for case, least in (('keeppersist', 6), ('keepforeign', 8), ('keepfail', 5)):
                    cards = Path(temp) / (case + str(len(defines)))
                    cards.mkdir()
                    with self.subTest(defines=defines, case=case):
                        ran = subprocess.run([executable, case, cards], capture_output=True, text=True)
                        self.assertEqual(ran.returncode, 0, ran.stderr)
                        saved = sorted(cards.iterdir())
                        self.assertGreaterEqual(len(saved), least)
                        for card in saved:
                            booted = subprocess.run([executable, 'boot', card], capture_output=True, text=True)
                            self.assertEqual(booted.returncode, 0, booted.stderr)

    def test_actual_board_adapter_over_the_real_journal(self):
        # The real journal_board.c replaces only the synthetic adapter; the
        # manager receipts, association rows and DSP consumer stay synthetic.
        source = (LOADER / 'tests/host_test.c').read_text()
        source = source.replace('#include "../loader.c"', '#include "loader.c"')
        source = source.replace('#include "../../upload/sha256.c"', '#include "sha256.c"')
        start = source.index('/* Trusted synthetic adapter:')
        source = source[:start] + source[source.index('static const struct mu_backend *b', start):]
        start = source.index('    /* The real pool keeps')
        source = source[:start] + source[source.index('    if (failures)', start):]
        source = source.replace('int main(void)', 'static int legacy_main(void)')
        source = source.replace('CHECK(!locked && !masked); locked = 1; return 4;', 'CHECK(!masked); return 4u+(uint32_t)locked++;')
        source = source.replace('CHECK(locked && !masked && sr == 4); locked = 0;',
                                'CHECK(locked && !masked && sr == 4u+(uint32_t)locked-1u); --locked;')
        source += (LOADER / 'tests/saved_set_fixture.c').read_text()
        source += (LOADER / 'tests/journal_board_fixture.c').read_text()
        cases = ('association', 'freeze', 'idle', 'abort', 'publish', 'unpublished', 'unknown', 'released', 'acknowledged', 'replay',
                 'keep', 'keepreplace', 'keepunknown')
        enabled = ('-DMODWERK_JOURNAL_BOARD_ENABLED=1',)
        with tempfile.TemporaryDirectory() as temp:
            fixture = Path(temp) / 'fixture.c'
            fixture.write_text(source)
            for defines, run in ((enabled, cases), ((), ('closed',)),
                                 (enabled + ('-DRUNTIME_MODULES=128u', '-DRUNTIME_POOL_BYTES=786432u'), cases)):
                executable = Path(temp) / ('board%d' % len(defines))
                args = ['cc', '-std=c99', '-Wall', '-Wextra', '-Werror', '-pedantic', '-g',
                        *SANITIZE, '-fno-sanitize-recover=all', *defines,
                        '-I', LOADER, '-I', ROOT / 'sdk/runtime/upload', '-I', ELEK,
                        fixture, *units(temp), '-o', executable]
                compiled = subprocess.run(args, capture_output=True, text=True)
                self.assertEqual(compiled.returncode, 0, compiled.stderr)
                for case in run:
                    with self.subTest(defines=defines, case=case):
                        ran = subprocess.run([executable, case], capture_output=True, text=True)
                        self.assertEqual(ran.returncode, 0, ran.stderr)


if __name__ == '__main__':
    unittest.main()
