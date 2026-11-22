# SPDX-License-Identifier: GPL-3.0-or-later
import hashlib
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "tests/render_fixture.c"
WARNINGS = ["-Wall", "-Wextra", "-Werror", "-std=c99"]


class RendererTests(unittest.TestCase):
    def test_native_frame_digests(self):
        with tempfile.TemporaryDirectory() as tmp:
            exe = Path(tmp) / "fixture"
            subprocess.run(["cc", *WARNINGS, SOURCE, "-o", exe], check=True)
            frames = subprocess.check_output([exe])
        self.assertEqual(len(frames), 3 * 1024)
        # The first two cover the complete Meta display. SRC owns six bands,
        # leaving the original top and bottom bands to the stock composer.
        for label, data, digest in [
            ("empty Panorama", frames[:1024], "4c69c264e6a1c86b85071c8067ba7d722331d1a0253166e8a8f84a6a4f221c50"),
            ("T2 override", frames[1024:2048], "8b5a0fb0e3e3bde1d62118be83b8d976b98773ec125cfe47c677f87a8cdd3c3e"),
            ("T2 queued A03", frames[2176:2944], "6193d63c112552e4fe07a2de3340f7c64b2d499d5f67093384981bc95521bd31"),
        ]:
            with self.subTest(view=label):
                self.assertEqual(hashlib.sha256(data).hexdigest(), digest)

    def test_input_edges_and_requests(self):
        with tempfile.TemporaryDirectory() as tmp:
            exe = Path(tmp) / "input"
            subprocess.run(["cc", *WARNINGS, ROOT / "tests/input_fixture.c", "-o", exe], check=True)
            subprocess.run([exe], check=True)

    @unittest.skipUnless(shutil.which("m68k-elf-gcc"), "requires the ColdFire cross-compiler")
    def test_coldfire_compile(self):
        with tempfile.TemporaryDirectory() as tmp:
            for src in (SOURCE, ROOT / "tests/input_fixture.c"):
                subprocess.run(["m68k-elf-gcc", *WARNINGS, "-mcpu=54455", "-ffreestanding",
                            "-DCLYPS_COMPILE_ONLY", "-Os", "-c", src,
                            "-o", Path(tmp) / "renderer.o"], check=True)


if __name__ == "__main__":
    unittest.main()
