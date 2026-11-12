# SPDX-License-Identifier: MIT
"""A machine page's control gets stock's widget for its number of values (modwerk_page.h). No firmware."""
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = r'''
#include "modwerk_page.h"
#include <stdio.h>
static void words(char *out, int value) { (void)out; (void)value; }
static unsigned long get32(const uint8_t *d, unsigned at) { return (unsigned long)d[at] << 24 | d[at + 1] << 16 | d[at + 2] << 8 | d[at + 3]; }
int main(void)
{
    uint8_t d[MODWERK_PAGE_BYTES];
    for (unsigned count = 0; count <= 128; ++count) printf("w %u %lx\n", count, (unsigned long)modwerk_page_widget(count));
    for (unsigned i = 0; i < sizeof d; ++i) d[i] = 0xee;
    modwerk_page_control(d, 9, "LED", 0, 2, 0);
    modwerk_page_control(d, 10, "STR", 1, 3, words);
    modwerk_page_control(d, 11, "BITSXY", 4, 13, 0);
    modwerk_page_control(d, 12, "PAST", 0, 2, 0);
    for (unsigned slot = 9; slot < 12; ++slot)
        printf("s %u %.6s %u %lx %lx %d %lx %lx\n", slot, (const char *)d + 0x4e + 6 * slot, d[0x96 + slot], get32(d, 0xa2 + 4 * slot),
            get32(d, 0xd2 + 4 * slot), get32(d, 0x102 + 4 * slot) != 0, get32(d, 0x132 + 4 * slot), get32(d, 0x162 + 4 * slot));
    printf("o %lx %x %x\n", get32(d, 0x102 + 4 * 9), d[0x4e + 6 * 12], d[0x4e + 6 * 8]);
    return 0;
}
'''


@unittest.skipUnless(shutil.which('cc'), 'host C compiler unavailable')
class PageControls(unittest.TestCase):
    def test_a_control_gets_the_widget_for_its_number_of_values(self):
        with tempfile.TemporaryDirectory() as folder:
            source, executable = Path(folder) / 'fixture.c', Path(folder) / 'fixture'
            source.write_text(FIXTURE)
            built = subprocess.run([shutil.which('cc'), '-std=c99', '-Wall', '-Wextra', '-Werror', '-I',
                                    str(ROOT / 'sdk/machines/octatrack/include'), str(source), '-o', str(executable)],
                                   capture_output=True, text=True)
            self.assertEqual(built.returncode, 0, built.stderr)
            lines = subprocess.run([str(executable)], capture_output=True, text=True, check=True).stdout.splitlines()
        widgets = {int(count): int(widget, 16) for kind, count, widget in (line.split() for line in lines if line[0] == 'w')}
        self.assertEqual(widgets[2], 0x40046f10)  # a switch
        self.assertEqual({widgets[3], widgets[4]}, {0x40046c28})  # a switch with three or four positions
        self.assertEqual(widgets[5], 0x40046ab4)
        self.assertEqual({widgets[count] for count in (0, 1, *range(6, 129))}, {0})  # a knob
        slots = [line.split() for line in lines if line[0] == 's']
        #                       slot  name     start min  count words widget      editor
        self.assertEqual(slots[0], ['s', '9', 'LED', '0', '0', '2', '1', '40046f10', '0'])
        self.assertEqual(slots[1], ['s', '10', 'STR', '1', '0', '3', '1', '40046c28', '0'])
        self.assertEqual(slots[2], ['s', '11', 'BITSX', '4', '0', 'd', '0', '0', '0'])  # five letters, then the end
        # Two values without words of their own read OFF and ON; a slot past the twelfth writes nothing.
        self.assertEqual(lines[-1], 'o 4003c14c ee ee')


if __name__ == '__main__':
    unittest.main()
