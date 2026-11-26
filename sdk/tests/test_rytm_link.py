"""The Analog Rytm MKII link's host tool (sdk/machines/analog-rytm-mkii/tools/rytm_link.py) against the
base's link.c: the same commands, statuses and framing, and stock's key flags. No unit, MIDI port or firmware."""
import importlib.util
import pathlib
import re
import unittest

APP = pathlib.Path(__file__).resolve().parents[2]
MACHINE = APP / "sdk/machines/analog-rytm-mkii"
spec = importlib.util.spec_from_file_location("rytm_link", MACHINE / "tools/rytm_link.py")
rytm_link = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rytm_link)
LINK_C = (MACHINE / "elekloader/base/link.c").read_text()


def defines(prefix):
    return {name: int(value, 0) for name, value in re.findall(r"^#define %s(\w+) (0x[0-9a-fA-F]+|\d+)" % prefix, LINK_C, re.M)}


class RytmLink(unittest.TestCase):
    def test_commands_match_the_base(self):
        base = defines("CMD_")
        names = {"IDENT": "ident", "DISARM": "disarm", "KEY": "key", "ENC": "enc", "RELEASE_ALL": "release",
                 "CONFIRM": "confirm", "RAMBOOT": "ramboot", "PAD": "pad", "SCREEN": "screen", "MEM": "mem",
                 "DIAG": "diaglog", "LOAD": "load", "LOG": "log", "UP_PART": "up_part", "UP_RUN": "up_run", "MODS": "mods"}
        self.assertEqual({names[n]: v for n, v in base.items() if n in names}, rytm_link.CMD)

    def test_statuses_match_the_base(self):
        base = defines("ST_")
        self.assertEqual(sorted(base.values()), sorted(rytm_link.STATUS))
        self.assertEqual(base["HUMAN"], 5)
        self.assertIn("person", rytm_link.STATUS[5])

    def test_request_frames_numbers_as_five_7_bit_bytes(self):
        msg = rytm_link.request(0x81, "mem", 0x402728bd, 8)
        self.assertEqual(msg[:6], bytes([0xF0, 0x7D]) + b"MWL" + bytes([1]))
        self.assertEqual(msg[6:8], bytes([0x01, 0x21]))
        self.assertEqual(msg[-1], 0xF7)
        self.assertTrue(all(b < 0x80 for b in msg[1:-1]))
        self.assertEqual(rytm_link.get32(msg, 8), 0x402728bd)
        self.assertEqual(rytm_link.get32(msg, 13), 8)
        self.assertEqual(rytm_link.get32(rytm_link.u32(0xffffffff), 0), 0xffffffff)

    def test_the_gates_diagnostics_lie_outside_every_mod_area_and_ident_names_them(self):
        """link.c's DIAG (15 words) and MARK (2) must not sit in RAM the linker gives the mods (elemod.ts's ddr and
        ddrMore for the Rytm MKII), and the tool reads them where ident says, or at the old place for an older base."""
        diag, mark = (int(re.search(r"#define %s \(\(volatile uint32_t \*\)(0x[0-9a-f]+)\)" % n, LINK_C).group(1), 0) for n in ("DIAG", "MARK"))
        profile = re.search(r"key: 'analog-rytm-mk2'.*?\n  \},", (APP / "src/engine/elektron/elemod.ts").read_text(), re.S).group(0)
        areas = [(int(a, 0), int(b, 0)) for a, b in re.findall(r"\[(0x[0-9a-f]+), (0x[0-9a-f]+)\]", profile)]
        self.assertGreaterEqual(len(areas), 3)
        top = max(hi for _, hi in areas)
        self.assertGreaterEqual(diag, top)
        self.assertEqual(mark, diag + 15 * 4)
        self.assertLessEqual(mark + 8, 0x47ff0000)          # 64 KB under the boot stack's top, as far as a unit's fill reached
        self.assertIn("p = put32(p, (uint32_t)DIAG);", LINK_C)
        old = bytes(78)
        self.assertNotIn("diag", rytm_link.ident_text(old))
        self.assertEqual(rytm_link.ident_text(old + rytm_link.u32(diag))["diag"], "%08x" % diag)
        self.assertEqual(rytm_link.DIAG_OLD, 0x47bfffbc)

    def test_ident_ends_with_the_set_identity(self):
        """Every base's IDENT ends with the .run block's CRC32 and length (link.c's boot gate), after the fields a
        release base sends as 0; an older base's shorter reply reads as before."""
        fields = re.search(r"case CMD_IDENT:(.*?)send\(p\);", LINK_C, re.S).group(1)
        self.assertLess(fields.index("put32(p, run_crc)"), fields.index("put32(p, run_bytes)"))
        self.assertGreater(fields.index("put32(p, run_crc)"), fields.index("(uint32_t)DIAG"))
        reply = bytes(83) + rytm_link.u32(0xf2fe7324) + rytm_link.u32(40649)
        got = rytm_link.ident_text(reply)
        self.assertEqual((got["set_crc"], got["set_bytes"]), ("f2fe7324", 40649))
        self.assertNotIn("set_crc", rytm_link.ident_text(bytes(83)))

    def test_load_reads_tenths_of_a_percent(self):
        reply = b"".join(rytm_link.u32(v) for v in (742, 851, 1000, 12, 9000))
        self.assertEqual(rytm_link.load_text(reply), {"window_percent": 74.2, "window_peak_percent": 85.1,
                                                      "peak_percent": 100.0, "windows": 12, "blocks": 9000})

    def test_log_reads_the_octatracks_layout(self):
        import struct
        head = struct.pack(">10I", 0x4d574447, 2, 0x1234, 1, 3, 1, 2, 0, 0, 0)
        incident = lambda seq, kind, a: struct.pack(">4I4H", seq, 1, 5, a, kind, 970, 0, 0) + bytes(40) + bytes([16, 9] + [0xff] * 14) + struct.pack(">3I", 0, 0, 1)
        loads = struct.pack(">3I10H", 3, 1, 5, 742, 851, 0, 0, 0, 0, 600, 300, 666, 74) + bytes(32 * 95)
        incidents = incident(2, 7, 0xf2fe7324) + incident(1, 1, 0) + bytes(92 * 30)
        raw = head + bytes(92) + loads + incidents
        self.assertEqual(len(raw), 40 + 92 + 32 * 96 + 92 * 32)
        log = rytm_link.log_text(raw)
        self.assertEqual([i["kind"] for i in log["incidents"]], ["START", "BASE"])
        self.assertEqual(log["incidents"][1]["a"], 0xf2fe7324)
        self.assertEqual(log["incidents"][0]["keys"], [16, 9])
        self.assertEqual(log["loads"], [{"seq": 3, "minute": 5, "cpu_mean_percent": 74.2, "cpu_peak_percent": 85.1,
                                         "windows": 600, "playing": 300, "frame_gap_us": 666, "tick_gap": 74}])
        with self.assertRaises(ValueError):
            rytm_link.log_text(bytes(len(raw)))

    def test_parse_takes_a_reply_and_refuses_anything_else(self):
        reply = rytm_link.HEADER + bytes([5, 0x21 | 0x40, 0]) + b"\x00\x7f" + b"\xF7"
        self.assertEqual(rytm_link.parse(reply), (5, 0x21, 0, b"\x00\x7f"))
        self.assertIsNone(rytm_link.parse(bytes([0xF0, 0x00, 0x20, 0x3C, 1, 2, 3, 4, 5, 0xF7])))
        self.assertIsNone(rytm_link.parse(rytm_link.HEADER + b"\xF7"))

    def test_elektron_packing_round_trips(self):
        data = bytes(range(256))
        packed = rytm_link.ek_encode(data)
        self.assertTrue(all(b < 0x80 for b in packed[len(rytm_link.EK_HEADER):-1]))
        self.assertEqual(rytm_link.ek_decode(packed), data)

    def test_key_flags_follow_stocks_scan(self):
        flags = rytm_link.KeyFlags()
        self.assertEqual(flags.flags("FUNC", True), rytm_link.KEY_DOWN)
        self.assertEqual(flags.flags("YES", True), rytm_link.KEY_DOWN | rytm_link.KEY_FUNC)
        self.assertEqual(flags.held(), ["YES", "FUNC"])
        # FUNC let go first: not the last key down, so no 0x10; YES keeps the FUNC bit and, as the last key down, 0x10.
        self.assertEqual(flags.flags("FUNC", False), 0)
        self.assertEqual(flags.flags("YES", False), rytm_link.KEY_UP | rytm_link.KEY_FUNC)
        self.assertEqual(flags.flags("NO", True), rytm_link.KEY_DOWN)
        self.assertEqual(flags.flags("NO", False), rytm_link.KEY_UP)

    def test_every_key_and_encoder_id_fits_the_base(self):
        key_ids = int(re.search(r"#define KEY_IDS (\d+)", LINK_C).group(1))
        self.assertTrue(all(0 <= v < key_ids for v in rytm_link.KEYS.values()))
        self.assertEqual(len(set(rytm_link.KEYS.values())), len(rytm_link.KEYS))
        self.assertEqual(sorted(rytm_link.ENCODERS.values()), list(range(9)))


if __name__ == "__main__":
    unittest.main()
