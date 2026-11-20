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


class Dn2Screen(unittest.TestCase):
    def test_frame_rows_reads_the_frame_column_by_column_top_row_first(self):
        fb = bytearray(1024)
        fb[7] = 0x01                    # x 0, y 0: the top-left pixel
        fb[8 * 127] = 0x80              # x 127, y 63: the bottom-right pixel
        rows = link.frame_rows(bytes(fb))
        self.assertEqual((len(rows), len(rows[0])), (64, 128))
        self.assertEqual([(x, y) for y in range(64) for x in range(128) if rows[y][x]], [(0, 0), (127, 63)])

    def test_png_is_a_grayscale_image_of_the_frame(self):
        import struct
        import zlib
        data = link.png(link.frame_rows(bytes(1024)), scale=2)
        self.assertEqual(data[:8], b"\x89PNG\r\n\x1a\n")
        self.assertEqual(struct.unpack(">II", data[16:24]), (256, 128))
        idat = data.index(b"IDAT")
        size = struct.unpack(">I", data[idat - 4:idat])[0]
        self.assertEqual(len(zlib.decompress(data[idat + 4:idat + 4 + size])), 128 * (1 + 256))


class Dn2Keys(unittest.TestCase):
    def test_key_and_encoder_names_are_the_panels_ids(self):
        self.assertEqual([link.key_id(n) for n in ("FUNC", "play", "TRIG1", "TRIG16", "0x30")], [0x11, 0x14, 0x19, 0x28, 0x30])
        self.assertEqual([link.ENCODERS[n] for n in ("A", "H", "LEVEL")], [1, 8, 9])
        self.assertEqual(len(set(link.KEYS.values())), len(link.KEYS))

    def test_a_negative_turn_reaches_the_link_as_its_low_byte(self):
        enc = link.request(3, "enc", 1, -8 & 0xffffffff)
        self.assertEqual(link.get32(enc, 13) & 0xff, 0xF8)
        self.assertTrue(all(b < 0x80 for b in enc[1:-1]))


class Dn2Diagnostics(unittest.TestCase):
    def test_the_log_layout_is_the_octatracks_byte_for_byte(self):
        mine = (APP / "sdk/machines/digitone-ii/elekloader/base/diag.h").read_bytes()
        self.assertEqual(mine, (APP / "sdk/machines/octatrack/elekloader/diag.h").read_bytes(),
                         "diag.h is the Octatrack's: copy it again (the site reads both logs with device-log.ts)")

    def test_the_hosts_ram_boot_limits_are_the_gates(self):
        import re
        source = (APP / "sdk/machines/digitone-ii/elekloader/base/link.c").read_text()
        define = lambda name: int(re.search(r"#define %s (0x[0-9a-f]+)" % name, source).group(1), 16)
        self.assertEqual((link.IMAGE_MAX, link.CONTAINER_MAX), (define("IMAGE_MAX"), define("CONTAINER_MAX")))
        # the unpacked OS ends below the mailbox, and the copy below the mod area
        self.assertEqual(0x40000400 + define("IMAGE_MAX"), 0x4038bec0)
        self.assertLessEqual(0x47000000 + define("CONTAINER_MAX"), 0x47f00000)
