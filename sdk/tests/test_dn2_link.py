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


def mem_reply(seq, addr, data, status=0):
    return link.HEADER + bytes([seq & 0x7f, 0x21 | 0x40, status]) + link.u32(addr) + pack7(data) + b"\xF7"


class FakeLine:
    """A MIDI pair whose replies come from answer(request) after the request is sent; queued ones arrive first."""

    def __init__(self, answer, queued=()):
        self.answer, self.queue, self.sent = answer, list(queued), []

    def drain(self):
        pass

    def send(self, frame):
        self.sent.append(frame)
        self.queue += self.answer(frame)

    def poll(self):
        return self.queue.pop(0) if self.queue else None


class Dn2LinkReplies(unittest.TestCase):
    def test_each_request_takes_a_new_sequence_number(self):
        line = FakeLine(lambda f: [mem_reply(f[6], link.get32(f, 8), bytes(4))])
        link.mem(0x40000000, 4, "x", line)
        link.mem(0x40000004, 4, "x", line)
        self.assertNotEqual(line.sent[0][6], line.sent[1][6])

    def test_a_late_reply_to_the_previous_chunk_is_not_taken_for_the_current_one(self):
        old, new = bytes([0xAA] * 128), bytes([0x55] * 128)

        def answer(f):
            seq, addr = f[6], link.get32(f, 8)
            # the previous chunk's reply, late, with this request's sequence number, then the real one
            return [mem_reply(seq, addr - 128, old), mem_reply(seq, addr, new)]
        self.assertEqual(link.mem(0x40001080, 128, "x", FakeLine(answer)), new)

    def test_a_late_reply_with_the_previous_sequence_number_is_skipped(self):
        def answer(f):
            seq, addr = f[6], link.get32(f, 8)
            return [mem_reply(seq - 1, addr, bytes([1] * 8)), mem_reply(seq, addr, bytes([2] * 8))]
        self.assertEqual(link.mem(0x40000000, 8, "x", FakeLine(answer)), bytes([2] * 8))

    def test_a_short_reply_is_never_passed_on(self):
        line = FakeLine(lambda f: [mem_reply(f[6], link.get32(f, 8), bytes(100))])
        with self.assertRaises(link.LinkError):
            link.exchange(line, "mem", 0x40000000, 128, timeout=0.05,
                          accept=link.mem_reply_fits(0x40000000, 128))
        with self.assertRaises(SystemExit):
            link.screen("x", FakeLine(lambda f: [mem_reply(f[6], link.get32(f, 8), bytes(3))]))

    def test_a_refusal_is_still_reported(self):
        line = FakeLine(lambda f: [link.HEADER + bytes([f[6], 0x21 | 0x40, 4, 0xF7])])
        with self.assertRaises(SystemExit) as e:
            link.mem(0x50000000, 4, "x", line)
        self.assertIn("out of range", str(e.exception.code))

    def test_packed_length_is_link_cs(self):
        for n in (1, 4, 7, 8, 127, 128):
            self.assertEqual(len(pack7(bytes(n))), link.packed_len(n))


if __name__ == "__main__":
    unittest.main()
