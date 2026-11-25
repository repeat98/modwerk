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
        shot = link.request(9, "screen", 384)
        self.assertEqual(len(shot), 14)
        self.assertEqual((shot[7], link.get32(shot, 8)), (0x20, 384))
        self.assertTrue(all(b < 0x80 for b in shot[1:-1]))

    def test_there_is_no_request_for_an_address(self):
        self.assertEqual(set(link.CMD), {"ident", "screen", "disarm", "key", "enc", "release", "diag", "freeze", "log", "ramboot",
                                          "bootdiag"})
        self.assertEqual(link.request(4, "log", 256)[7:13], bytes([0x24]) + link.u32(256))

    def test_replies_parse_as_link_c_builds_them(self):
        data = bytes(range(0x70, 0x70 + 126)) + b"\xff\x80"
        reply = screen_reply(9, 128, 3, data)
        seq, cmd, status, payload = link.parse(reply)
        self.assertEqual((seq, cmd, status), (9, 0x20, 0))
        self.assertEqual((link.get32(payload, 0), link.get32(payload, 5)), (128, 3))
        self.assertEqual(link.unpack7(payload[10:])[:len(data)], data)
        self.assertIsNone(link.parse(link.request(9, "screen", 0)))   # a request is not a reply


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


def screen_reply(seq, off, number, data, status=0):
    if status:
        return link.HEADER + bytes([seq & 0x7f, 0x20 | 0x40, status, 0xF7])
    return link.HEADER + bytes([seq & 0x7f, 0x20 | 0x40, 0]) + link.u32(off) + link.u32(number) + pack7(data) + b"\xF7"

    def test_the_hosts_ram_boot_limits_are_the_gates(self):
        import json
        cflags = json.loads((APP / "sdk/machines/digitone-ii/elekloader/base.json").read_text())["dev"]["cflags"]
        recipe = {flag[2:].split("=")[0]: int(flag.split("=")[1], 0) for flag in cflags if "=" in flag}
        # link.c: IMAGE_MAX is UPLOAD_AT - 0x40000400, so the unpacked OS ends below the mailbox
        self.assertEqual(link.IMAGE_MAX, recipe["UPLOAD_AT"] - 0x40000400)
        self.assertEqual(link.CONTAINER_MAX, recipe["CONTAINER_MAX"])
        self.assertLessEqual(recipe["RAMBOOT_COPY_AT"] + recipe["CONTAINER_MAX"], 0x47f00000)   # below the mod area


def frame_part(off):
    return bytes((off + i) * 7 + 1 & 0xff for i in range(128))


def log_reply(seq, off, log, n, status=0):
    """link.c's log reply: OFF, the log's seq (struct diag_log word 4), then the part's bytes."""
    if status:
        return link.HEADER + bytes([seq & 0x7f, 0x24 | 0x40, status, 0xF7])
    return (link.HEADER + bytes([seq & 0x7f, 0x24 | 0x40, 0]) + link.u32(off) + link.u32(int.from_bytes(log[16:20], "big"))
            + pack7(bytes(log[off:off + n])) + b"\xF7")


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
    def unit(self, number=lambda off: 1, before=lambda f: []):
        return FakeLine(lambda f: before(f) + [screen_reply(f[6], link.get32(f, 8), number(link.get32(f, 8)),
                                                            frame_part(link.get32(f, 8)))])

    def test_the_screen_is_eight_parts_of_one_copy(self):
        line = self.unit()
        frame = link.screen("x", line)
        self.assertEqual(frame, b"".join(frame_part(off) for off in range(0, 1024, 128)))
        self.assertEqual([link.get32(f, 8) for f in line.sent], list(range(0, 1024, 128)))

    def test_each_request_takes_a_new_sequence_number(self):
        line = self.unit()
        link.screen("x", line)
        self.assertEqual(len({f[6] for f in line.sent}), 8)

    def test_a_late_reply_to_the_previous_part_is_not_taken_for_the_current_one(self):
        def before(f):
            off = link.get32(f, 8)
            return [screen_reply(f[6], off - 128, 1, bytes([0xAA] * 128))] if off else []
        self.assertEqual(link.screen("x", self.unit(before=before))[128:256], frame_part(128))

    def test_a_late_reply_with_the_previous_sequence_number_is_skipped(self):
        def before(f):
            return [screen_reply(f[6] - 1, link.get32(f, 8), 1, bytes([1] * 128))]
        self.assertEqual(link.screen("x", self.unit(before=before))[:128], frame_part(0))

    def test_a_part_of_another_copy_is_not_taken(self):
        # someone else asked for part 0 in between: the unit's copy is number 2 from then on
        line = self.unit(number=lambda off: 1 if off < 512 else 2)
        with self.assertRaises(link.LinkError):
            link.exchange(line, "screen", 512, timeout=0.05, accept=link.screen_reply_fits(512, 1))
        with self.assertRaises(SystemExit):
            link.screen("x", line)

    def test_a_short_reply_is_never_passed_on(self):
        line = FakeLine(lambda f: [screen_reply(f[6], link.get32(f, 8), 1, bytes(100))])
        with self.assertRaises(link.LinkError):
            link.exchange(line, "screen", 0, timeout=0.05, accept=link.screen_reply_fits(0))
        with self.assertRaises(SystemExit):
            link.screen("x", FakeLine(lambda f: [screen_reply(f[6], link.get32(f, 8), 1, bytes(3))]))

    def test_a_refusal_is_still_reported(self):
        line = FakeLine(lambda f: [screen_reply(f[6], 0, 0, b"", status=4)])
        with self.assertRaises(SystemExit) as e:
            link.screen("x", line)
        self.assertIn("out of range", str(e.exception.code))

    def test_packed_length_is_link_cs(self):
        for n in (1, 4, 7, 8, 127, 128):
            self.assertEqual(len(pack7(bytes(n))), link.packed_len(n))


class Dn2LinkOnTheHost(unittest.TestCase):
    """base/link.c compiled for the host with stock's sysex_send, queue, key tables, upload buffer and frame pointers
    stubbed (dn2_link_host.c): ident and screen answer, the old mem and every unknown request are refused with nothing
    but their status; disarm keeps releases, and a flash needs a person."""

    def test_the_device_answers_only_its_own_diagnostics(self):
        import shutil
        import subprocess
        import tempfile
        cc = shutil.which("cc")
        if not cc:
            self.skipTest("no host C compiler")
        with tempfile.TemporaryDirectory() as tmp:
            binary = pathlib.Path(tmp) / "dn2_link_host"
            import json
            # the recipe's values (base.json's dev cflags); its addresses (*_AT) are the host's own, in the driver
            cflags = json.loads((APP / "sdk/machines/digitone-ii/elekloader/base.json").read_text())["dev"]["cflags"]
            values = [flag for flag in cflags if flag.startswith("-D") and not flag.split("=")[0].endswith("_AT")]
            build = subprocess.run([cc, "-std=c11", "-O1", "-Wall", "-Wno-pointer-to-int-cast", "-Wno-int-to-pointer-cast",
                                    "-Wno-unused-function", *values, "-o", str(binary), str(APP / "sdk/tests/dn2_link_host.c")],
                                   capture_output=True, text=True)
            self.assertEqual(build.returncode, 0, build.stderr)
            run = subprocess.run([str(binary)], capture_output=True, text=True)
            self.assertEqual((run.returncode, run.stdout.strip()), (0, "ok"), run.stdout + run.stderr)


class Dn2DiagSave(unittest.TestCase):
    def setUp(self):
        import tempfile
        self.dir = tempfile.TemporaryDirectory()
        self.path = pathlib.Path(self.dir.name) / "log.bin"
        self.path.write_bytes(b"earlier capture")

    def tearDown(self):
        self.dir.cleanup()

    def unit(self, log, writes=(), short=None):
        """A unit answering log OFF from log; before each request numbered in writes a record is written (seq and
        incidents raised, a record filled in the second part), so a read that spans it mixes before and after. short:
        the part at that offset comes back a byte short."""
        state = {"log": bytearray(log), "requests": 0, "offsets": []}

        def answer(f):
            state["requests"] += 1
            if state["requests"] in writes:
                state["log"][19] += 1                   # seq (big-endian word 4)
                state["log"][24] += 1                   # incidents
                state["log"][200:204] = bytes([0xEE] * 4)
            off = link.get32(f, 8)
            state["offsets"].append(off)
            n = min(128, len(log) - off) - (1 if off == short else 0)
            return [log_reply(f[6], off, state["log"], n)]
        return FakeLine(answer), state

    def test_a_complete_log_replaces_the_file_and_names_no_address(self):
        log = bytes(range(256)) + bytes(44)
        line, state = self.unit(log)
        link.save_log(len(log), str(self.path), "x", line)
        self.assertEqual(self.path.read_bytes(), log)
        self.assertEqual(state["offsets"], [0, 128, 256, 0])   # offsets into the log only
        self.assertTrue(all(f[7] == 0x24 for f in line.sent))

    def test_a_short_part_saves_nothing_and_keeps_the_earlier_capture(self):
        line, _ = self.unit(bytes(300), short=128)
        with self.assertRaises(SystemExit):
            link.save_log(300, str(self.path), "x", line)
        self.assertEqual(self.path.read_bytes(), b"earlier capture")
        self.assertEqual(sorted(p.name for p in pathlib.Path(self.dir.name).iterdir()), ["log.bin"])

    def test_a_refused_part_saves_nothing(self):
        line = FakeLine(lambda f: [log_reply(f[6], 0, b"", 0, status=4)])
        with self.assertRaises(SystemExit) as e:
            link.save_log(300, str(self.path), "x", line)
        self.assertIn("out of range", str(e.exception.code))
        self.assertEqual(self.path.read_bytes(), b"earlier capture")

    def test_a_record_written_mid_read_is_read_again(self):
        log = bytes(range(256)) + bytes(44)            # 300 bytes: part 0, two more parts, part 0 again
        line, state = self.unit(log, {3})              # the write lands between the second and third part
        data = link.save_log(len(log), str(self.path), "x", line)
        self.assertEqual(state["requests"], 8)         # read twice
        self.assertEqual(self.path.read_bytes(), bytes(state["log"]))
        self.assertEqual(data[19], log[19] + 1)        # the header after the write, with the record it counts
        self.assertEqual(data[200:204], bytes([0xEE] * 4))

    def test_a_log_that_keeps_changing_saves_nothing(self):
        log = bytes(range(256)) + bytes(44)
        line, _ = self.unit(log, {3, 7, 11})           # a record during each of the three reads
        with self.assertRaises(SystemExit) as e:
            link.save_log(len(log), str(self.path), "x", line)
        self.assertIn("changed during each", str(e.exception.code))
        self.assertEqual(self.path.read_bytes(), b"earlier capture")
        self.assertEqual(sorted(p.name for p in pathlib.Path(self.dir.name).iterdir()), ["log.bin"])

    def test_a_write_after_the_last_part_is_caught_by_part_0_read_again(self):
        log = bytes(range(256)) + bytes(44)
        line, state = self.unit(log, {4})              # after the third part, before part 0 is read again
        link.save_log(len(log), str(self.path), "x", line)
        self.assertEqual(state["requests"], 8)
        self.assertEqual(self.path.read_bytes(), bytes(state["log"]))


class Dn2RamBootResult(unittest.TestCase):
    """The ramboot command succeeds only for a RAM boot of the image asked for (device I/O mocked)."""
    WANT = 0x2F2C3B6E

    @staticmethod
    def ident(status, crc, n=12):
        return ([1, 0, 0, 0, 1, 0, 0, 0, 0, status, crc, 0x47FEFFBC] + [0] * 4)[:n]

    def test_a_ram_boot_of_the_image_asked_for_succeeds(self):
        self.assertTrue(link.wait_ramboot(self.WANT, lambda: self.ident(1, self.WANT), pause=0)[0])

    def test_the_flashed_os_another_crc_or_a_short_reply_fail(self):
        for v in (self.ident(0, 0), self.ident(1, self.WANT ^ 1), self.ident(8, self.WANT), self.ident(1, self.WANT, n=9)):
            good, message = link.wait_ramboot(self.WANT, lambda v=v: v, pause=0)
            self.assertFalse(good, message)

    def test_silence_fails_and_a_late_answer_is_still_judged(self):
        self.assertFalse(link.wait_ramboot(self.WANT, lambda: None, tries=3, pause=0)[0])
        answers = iter([None, None, self.ident(1, self.WANT)])
        self.assertTrue(link.wait_ramboot(self.WANT, lambda: next(answers), tries=5, pause=0)[0])

    def test_the_command_exits_nonzero_when_the_flashed_os_answers(self):
        from unittest import mock
        with mock.patch.object(link, "upload"), mock.patch.object(link, "ok"), \
                mock.patch.object(link, "ramboot_args", return_value=(1, self.WANT, 2, 3)), \
                mock.patch.object(link, "ask_ident_once", return_value=self.ident(0, 0x12345678)), \
                mock.patch.object(link.time, "sleep"), mock.patch("builtins.open", mock.mock_open(read_data=b"")), \
                mock.patch.object(link.sys, "argv", ["dn2_link.py", "ramboot", "x.syx"]):
            with self.assertRaises(SystemExit) as e:
                link.main()
        self.assertIn("boot status 0", str(e.exception.code))


if __name__ == "__main__":
    unittest.main()
