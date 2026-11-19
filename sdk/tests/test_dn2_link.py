"""The Digitone II link's host (sdk/machines/digitone-ii/tools/dn2_link.py): its requests and the replies link.c
builds, without a unit."""
import importlib.util
import pathlib
import unittest

APP = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("dn2_link", APP / "sdk/machines/digitone-ii/tools/dn2_link.py")
link = importlib.util.module_from_spec(spec)
spec.loader.exec_module(link)


def pack7(data):
    out = bytearray()
    for i in range(0, len(data), 7):
        chunk = data[i:i + 7]
        out.append(sum(0x40 >> k for k, b in enumerate(chunk) if b & 0x80))
        out += bytes(b & 0x7f for b in chunk)
    return bytes(out)


class Dn2Link(unittest.TestCase):
    def test_requests_are_the_rytm_links_frames(self):
        self.assertEqual(link.request(5, "ident"), bytes([0xF0, 0x7D, 0x4D, 0x57, 0x4C, 1, 5, 0x01, 0xF7]))
        mem = link.request(9, "mem", 0x47F00000, 64)
        self.assertEqual(len(mem), 19)
        self.assertEqual(link.get32(mem, 8), 0x47F00000)
        self.assertEqual(link.get32(mem, 13), 64)
        self.assertTrue(all(b < 0x80 for b in mem[1:-1]))

    def test_replies_parse_as_link_c_builds_them(self):
        data = bytes(range(0x70, 0x70 + 20)) + b"\xff\x80"
        reply = link.HEADER + bytes([9, 0x21 | 0x40, 0]) + link.u32(0x80001000) + pack7(data) + b"\xF7"
        seq, cmd, status, payload = link.parse(reply)
        self.assertEqual((seq, cmd, status), (9, 0x21, 0))
        self.assertEqual(link.get32(payload, 0), 0x80001000)
        self.assertEqual(link.unpack7(payload[5:])[:len(data)], data)
        self.assertIsNone(link.parse(link.request(9, "mem", 0, 1)))   # a request is not a reply


if __name__ == "__main__":
    unittest.main()
