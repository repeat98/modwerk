"""The Analog Rytm MKII development link's host tool (sdk/machines/analog-rytm-mkii/tools/rytm_link.py) against the
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
                 "CONFIRM": "confirm", "RAMBOOT": "ramboot", "SCREEN": "screen", "MEM": "mem"}
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
