"""Focused host checks for the FRACT SRC-page presentation contract."""
import ctypes
import json
import sys
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
DRAFT = ROOT / "sdk/drafts/fract-machine"


class FractUiContract(unittest.TestCase):
    PROFILE_FLAGS = []
    def test_variant_d_layout_bounds_size_bars_readers_and_pitch_values(self):
        if not shutil.which("cc"):
            self.skipTest("no host C compiler")
        with tempfile.TemporaryDirectory(prefix="fract-overview-") as temp:
            binary = Path(temp) / "overview"
            linker_gc = "-Wl,-dead_strip" if sys.platform == "darwin" else "-Wl,--gc-sections"
            result = subprocess.run([
                "cc", *self.PROFILE_FLAGS, "-std=c11", "-Wall", "-Wextra", "-Werror", "-O1",
                "-ffunction-sections", "-fdata-sections", linker_gc,
                "-I", str(DRAFT), "-I", str(ROOT / "sdk/drafts/fract-machine/support"),
                str(ROOT / "sdk/tests/fixtures/fract_overview.c"), str(DRAFT / "fract_ui.c"),
                str(ROOT / "sdk/tests/fixtures/fract_ui_runtime.c"),
                "-o", str(binary),
            ], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            result = subprocess.run([str(binary)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_visible_tick_requests_redraw_even_without_a_sample(self):
        cc = shutil.which("cc")
        if not cc:
            self.skipTest("no host C compiler")
        with tempfile.TemporaryDirectory(prefix="fract-ui-tick-") as temp:
            binary = Path(temp) / "ui-tick"
            linker_gc = "-Wl,-dead_strip" if sys.platform == "darwin" else "-Wl,--gc-sections"
            result = subprocess.run([
                cc, *self.PROFILE_FLAGS, "-std=c11", "-Wall", "-Wextra", "-Werror", "-O1",
                "-ffunction-sections", "-fdata-sections", linker_gc,
                "-I", str(DRAFT), "-I", str(ROOT / "sdk/drafts/fract-machine/support"),
                str(ROOT / "sdk/tests/fixtures/fract_ui_tick.c"), "-o", str(binary),
            ], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            result = subprocess.run([str(binary)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_page_labels_defaults_and_runtime_hooks(self):
        source = (DRAFT / "fract_ui.c").read_text()
        self.assertIn('"POS", "SIZE", "REVS", "SPRD", "SPCE", "SHPE"', source)
        self.assertIn('"PAN", "", "SRNG", "", "", ""', source)
        self.assertNotRegex(source, r'"(SCAN|DENS)"')
        self.assertEqual(json.loads((DRAFT / "runtime.experimental.json").read_text())["subscribe"], [
            {"event": "module_tick", "fn": "module_tick"},
            {"event": "module_draw", "fn": "module_draw"},
        ])

    def test_native_icon_bounds_and_saved_bytes_helpers(self):
        cc = shutil.which("cc")
        if not cc:
            self.skipTest("no host C compiler")
        with tempfile.TemporaryDirectory(prefix="fract-ui-contract-") as temp:
            temp = Path(temp)
            harness = temp / "ui.c"
            harness.write_text(
                '#include <assert.h>\n#include <stdint.h>\n#include <string.h>\n'
                '#include "fract_ui.h"\n'
                'int main(void) {\n'
                '  uint32_t frame[256], before[256];\n'
                '  const unsigned f[3]={15,5,1}, g[3]={15,9,13};\n'
                '  for(unsigned t=0;t<4;++t) for(unsigned selected=0;selected<8;++selected) {\n'
                '    for(unsigned i=0;i<256;++i) frame[i]=before[i]=0xa5a5a5a5u;\n'
                '    unsigned x=t==selected?3:2,y=5+15*t,w=y<32?1:0,shift=y&31;\n'
                '    unsigned inverse=t==selected?15:0; uint32_t mask=15u<<shift;\n'
                '    for(unsigned c=0;c<3;++c) { unsigned at=2*(x+c)+w;\n'
                '      frame[at]=before[at]=(frame[at]&~mask)|((f[c]^inverse)<<shift); }\n'
                '    assert(fract_ui_machine_icon(frame,t,selected));\n'
                '    for(unsigned i=0;i<256;++i) { uint32_t want=before[i];\n'
                '      for(unsigned c=0;c<3;++c) if(i==2*(x+c)+w) want=(want&~mask)|((g[c]^inverse)<<shift);\n'
                '      assert(frame[i]==want); }\n'
                '    assert(fract_ui_machine_icon(frame,t,selected));\n'
                '    frame[2*x+w]^=1u<<shift;\n'
                '    for(unsigned i=0;i<256;++i) before[i]=frame[i];\n'
                '    assert(!fract_ui_machine_icon(frame,t,selected));\n'
                '    for(unsigned i=0;i<256;++i) assert(frame[i]==before[i]);\n'
                '  }\n'
                '  assert(!fract_ui_machine_icon(frame,4,0) && !fract_ui_machine_icon(frame,0,8));\n'
                '  for(unsigned i=0;i<256;++i) frame[i]=before[i]=0xa5a5a5a5u;\n'
                '  fract_ui_pool_heading(frame);\n'
                '  for(unsigned i=0;i<256;++i) { unsigned x=i/2; uint32_t allowed=(i%2 && x>=8 && x<120)?0x7eu:0;\n'
                '    assert(((frame[i]^before[i])&~allowed)==0); before[i]=frame[i]; }\n'
                '  fract_ui_pool_heading(frame);for(unsigned i=0;i<256;++i) assert(frame[i]==before[i]);\n'
                '  uint8_t part[6322] = {0}, out[12];\n'
                '  for (unsigned i=0;i<12;++i) part[(i<6?0x2a:0x1da)+6+i%6] = (uint8_t)(i+1);\n'
                '  fract_ui_copy_saved_bytes(part, 0, out);\n'
                '  for (unsigned i=0;i<12;++i) assert(out[i] == i+1);\n' +
                ('  unsigned defaults[12] = {18,86,127,0,64,64,0,64,0,127,0,168};\n' if self.PROFILE_FLAGS else
                 '  unsigned defaults[12] = {18,86,127,0,0,64,0,64,0,127,0,0};\n') +
                '  for (unsigned i=0;i<12;++i) assert(fract_ui_default(i) == defaults[i]);\n' +
                ('  assert(!strcmp(fract_ui_main_labels[4],\"SHPE\") && !strcmp(fract_ui_main_labels[5],\"PTCH\"));\n  assert(!strcmp(fract_ui_setup_labels[0],\"PAN\") && !strcmp(fract_ui_setup_labels[2],\"SRNG\"));\n' if self.PROFILE_FLAGS else '') +
                '  return 0;\n}\n')
            binary = temp / "ui"
            linker_gc = "-Wl,-dead_strip" if sys.platform == "darwin" else "-Wl,--gc-sections"
            result = subprocess.run([
                cc, *self.PROFILE_FLAGS, "-std=c11", "-Wall", "-Wextra", "-Werror", "-O1",
                "-ffunction-sections", "-fdata-sections", linker_gc,
                "-I", str(DRAFT), "-I", str(ROOT / "sdk/drafts/fract-machine/support"),
                str(harness), str(DRAFT / "fract_ui.c"), "-o", str(binary),
                str(ROOT / "sdk/tests/fixtures/fract_ui_runtime.c"),
            ], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            result = subprocess.run([str(binary)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
