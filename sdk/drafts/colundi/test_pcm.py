"""Compile the original renderer and measure its emitted PCM on the host."""
import ctypes as c
import json
import subprocess
import sys
import tempfile
from pathlib import Path

here = Path(__file__).resolve().parent
rate = 44100


class Voice(c.Structure):
    _fields_ = [(name, c.c_uint32) for name in
                ("phase", "word", "gain", "target", "colour", "colour_target",
                 "overtone_phase", "overtone_word")]


def verify(engine):
    engine.colundi_word.restype = c.c_uint32
    readings = {}
    for degree, hz in ((78, 440), (79, 441)):
        word = engine.colundi_word(0, degree)
        assert word == round(hz * 2**32 / rate)
        voice = Voice()
        engine.colundi_note(c.byref(voice), 0, degree, 0)
        pcm = (c.c_int16 * rate)()
        engine.colundi_render(c.byref(voice), pcm, rate)
        crossings = [i - 1 - pcm[i-1] / (pcm[i] - pcm[i-1])
                     for i in range(129, rate) if pcm[i-1] < 0 <= pcm[i]]
        measured = rate * (len(crossings)-1) / (crossings[-1]-crossings[0])
        assert abs(measured - hz) < 0.001, measured
        readings[degree] = measured
        engine.colundi_off(c.byref(voice))
        engine.colundi_render(c.byref(voice), pcm, 256)
        assert all(value == 0 for value in pcm[128:256])
    assert all(engine.colundi_word(0, i) == 0 for i in range(256) if i not in readings)
    assert engine.colundi_word(1, 78) == 0
    return readings


if __name__ == "__main__":
    assert subprocess.check_output([sys.executable, here / "make_sine.py"]) == (here / "sine.inc").read_bytes()
    with tempfile.TemporaryDirectory() as directory:
        lib = Path(directory) / "voice.so"
        subprocess.run(["cc", "-O2", "-shared", "-fPIC", here / "mono.c",
                        here / "fixture.c", "-o", lib], check=True)
        print(json.dumps({"host_pcm_hz": verify(c.CDLL(str(lib))), "status": "PASS"}))
