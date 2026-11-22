import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import unittest


SENDER = Path(__file__).resolve().parents[2] / "scripts" / "device-send.py"


@unittest.skipUnless(hasattr(socket, "AF_UNIX"), "device-send uses Unix sockets")
class DeviceSendTest(unittest.TestCase):
    def test_reply_and_exit_status(self):
        for reply, status in [
            (b"CPU 34%\n", 0),
            (b"\n", 0),  # a successful step with no printed output
            (b"error: no answer from the unit within 20 s\n", 1),
            (b"stopped\nerror: unknown step\n", 1),
            (b"", 1),  # the server disconnected without a reply
        ]:
            with self.subTest(reply=reply), tempfile.TemporaryDirectory() as tmp:
                path = str(Path(tmp) / "unit.sock")
                with socket.socket(socket.AF_UNIX) as server:
                    server.bind(path)
                    server.listen(1)
                    server.settimeout(5)
                    env = {**os.environ, "MODWERK_UNIT": "emulator", "MODWERK_DEV_SOCKET": path}
                    with subprocess.Popen([sys.executable, "-B", str(SENDER), "stats"],
                                          env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) as child:
                        peer, _ = server.accept()
                        with peer, peer.makefile("rb") as request:
                            self.assertEqual(request.readline(), b"stats\n")
                            peer.sendall(reply)
                        output, error = child.communicate(timeout=5)
                        self.assertEqual(child.returncode, status)
                        self.assertEqual(output, reply.decode())
                        if not reply:
                            self.assertIn("without a reply", error)
