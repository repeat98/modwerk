"""Linked.defsyms reach the assembler and the linker; Linked.reference may
depend on the remix."""
import pathlib
import shutil
import sys
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "tools"))
from remix import platform_build  # noqa: E402
from remix.schema import Linked  # noqa: E402

TOOLS = all(shutil.which(t) for t in ("m68k-elf-as", "m68k-elf-ld", "m68k-elf-objcopy", "m68k-elf-nm"))
SRC = """        .text
entry:
.ifdef GATE
        move.l  #0x11111111,%d0
.else
        move.l  #0x22222222,%d0
.endif
        move.l  #VAL,%d1
        rts
"""


@unittest.skipUnless(TOOLS, "needs the m68k-elf toolchain (make setup)")
class DefsymLinkTests(unittest.TestCase):
    def setUp(self):
        (ROOT / "out").mkdir(exist_ok=True)
        self.dir = pathlib.Path(tempfile.mkdtemp(prefix="octabam_defsym_", dir=ROOT / "out"))
        self.src = self.dir / "unit.s"
        self.src.write_text(SRC)
        self.unit = Linked("unit", str(self.src.relative_to(ROOT)), dram=True,
                           defsyms=(("GATE", 1), ("VAL", 0x1234)))

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def _link(self, defs):
        raw, _syms = platform_build.link_runtime(
            [("K", self.unit)], self.dir / "w", dict(defs), 0x40a00000, unit_defs={"unit": defs})
        return raw

    def test_ifdef_selects_code(self):
        self.assertTrue(self._link((("GATE", 1), ("VAL", 0x1234))).startswith(bytes.fromhex("203c11111111")))
        self.assertTrue(self._link((("VAL", 0x1234),)).startswith(bytes.fromhex("203c22222222")))

    def test_value_lands_in_the_bytes(self):
        self.assertIn(bytes.fromhex("223c00001234"), self._link((("GATE", 1), ("VAL", 0x1234))))

    def test_a_label_of_the_unit_is_refused(self):
        self.src.write_text(SRC + "VAL:    rts\n")
        with self.assertRaises(SystemExit) as e:
            self._link((("VAL", 0x1234),))
        self.assertIn("defines ['VAL']", str(e.exception))


class ReferenceTests(unittest.TestCase):
    A = (0x400d7000, "a" * 64)
    B = (0x400d7000, "b" * 64)

    def test_callable_picks_a_variant(self):
        u = Linked("u", "u.s", include=lambda mods: "",
                   reference=lambda mods: self.B if "SIDECHAIN" in mods else self.A)
        self.assertEqual(u.reference_for({"SIDECHAIN": object()}), self.B)
        self.assertEqual(u.reference_for({}), self.A)

    def test_shape_is_validated(self):
        with self.assertRaises(ValueError):
            Linked("u", "u.s", reference=(0x400d7000, "not a hash"))
        with self.assertRaises(ValueError):
            Linked("u", "u.s", reference=lambda mods: 0x400d7000).reference_for({})

    def test_a_name_declared_twice_is_refused(self):
        with self.assertRaises(ValueError):
            Linked("u", "u.s", defsyms=(("A", 1), ("A", 2)))


if __name__ == "__main__":
    unittest.main()
