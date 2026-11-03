#!/usr/bin/env python3
"""BUTTER FINGERS's gate: butter_fingers.c compiled for the host, driven with the panel events of the cases below.

    python3 -B verify.py            # needs a host C compiler (cc); m68k-elf-gcc for the generated-unit check

- a pressed knob's first single detent is dropped while a trig or scene key is held; later turns pass (coarse edit)
- a coalesced fast turn (|delta| > 1) while pressed passes
- every turn of that knob is dropped for 9 ticks (150 ms) after its release, then passes
- the other knobs, LEVEL, and turns with no trig or scene held always pass
- no key is ever taken
- a state of garbage (card builds do not zero .bss) behaves as a fresh one
- butter_fingers_core.s is what butter_fingers.c generates (when m68k-elf-gcc is on PATH)
"""
import ctypes
import pathlib
import shutil
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
TRIG1, SCENE_A, PUSH_A, PUSH_B = 0x00, 0x19, 0x38, 0x39
failed = []


def check(name, ok, detail=''):
    print(('[PASS] ' if ok else '[FAIL] ') + name + (f': {detail}' if detail and not ok else ''))
    if not ok:
        failed.append(name)


class Api(ctypes.Structure):
    _fields_ = [('value', ctypes.c_uint32)]


with tempfile.TemporaryDirectory() as tmp:
    so = pathlib.Path(tmp) / 'bf.so'
    subprocess.run(['cc', '-O2', '-shared', '-fPIC', '-DBF_HOST', '-o', str(so), str(HERE / 'butter_fingers.c')], check=True)

    def fresh():
        lib = ctypes.CDLL(str(so), mode=ctypes.RTLD_LOCAL)
        for f in (lib.bf_key, lib.bf_enc):
            f.argtypes, f.restype = [ctypes.c_int, ctypes.c_int], ctypes.c_int
        lib.bf_tick.argtypes = [ctypes.POINTER(Api)]
        return lib

    lib, api = fresh(), Api()
    key = lambda code, down: lib.bf_key(code, int(down))
    turn = lambda enc, delta=1: lib.bf_enc(enc, delta)   # 1 = taken (dropped)
    ticks = lambda n: [lib.bf_tick(ctypes.byref(api)) for _ in range(n)]

    keys_taken = []
    keys_taken.append(key(TRIG1, True))
    check('a turn with a trig held and no press passes', turn(1) == 0)
    keys_taken.append(key(PUSH_B, True))
    check('the first single detent while pressed is dropped', turn(1, -1) == 1)
    check('the second detent while pressed passes (coarse edit)', turn(1) == 0)
    check('a third passes too', turn(1) == 0)
    check('another knob passes while B is pressed', turn(2) == 0)
    keys_taken.append(key(PUSH_B, False))
    ticks(1)
    check('right after the release, B is dropped', turn(1) == 1)
    ticks(7)
    check('8 ticks after the release, B is still dropped', turn(1) == 1)
    check('meanwhile another knob passes', turn(0) == 0)
    ticks(1)
    check('9 ticks after the release, B passes', turn(1) == 0)
    keys_taken.append(key(PUSH_B, True))
    check('a coalesced fast turn (+2) as the first event while pressed passes', turn(1, 2) == 0)
    keys_taken.append(key(PUSH_B, False))
    keys_taken.append(key(TRIG1, False))
    ticks(20)

    keys_taken.append(key(PUSH_A, True))
    check('no trig or scene held: a turn while pressed passes', turn(0) == 0)
    keys_taken.append(key(PUSH_A, False))
    check('no trig or scene held: a turn after the release passes', turn(0) == 0)

    keys_taken.append(key(SCENE_A, True))
    keys_taken.append(key(PUSH_A, True))
    check('SCENE A held: the first detent while pressed is dropped', turn(0) == 1)
    keys_taken.append(key(PUSH_A, False))
    check('SCENE A held: a turn right after the release is dropped', turn(0) == 1)
    keys_taken.append(key(SCENE_A, False))
    check('LEVEL (encoder 6) always passes', turn(6) == 0)
    check('no key is ever taken', not any(keys_taken))
    ticks(1)
    check("DIAG's value counts the turns taken (5)", api.value == 5, f'{api.value}')

    # card builds do not zero .bss: a state of garbage must behave as a fresh one
    lib.bf_state.restype, lib.bf_state.argtypes = ctypes.c_void_p, [ctypes.POINTER(ctypes.c_uint)]
    size = ctypes.c_uint()
    ctypes.memset(lib.bf_state(ctypes.byref(size)), 0xA5, size.value)
    check('a garbage state: a turn with nothing held passes', turn(1) == 0 and turn(3) == 0)
    key(TRIG1, True); key(PUSH_B, True)
    check('a garbage state: then behaves as fresh (first detent dropped, second passes)', turn(1) == 1 and turn(1) == 0)
    key(PUSH_B, False); key(TRIG1, False)

gen = HERE / 'generate.py'
if shutil.which('m68k-elf-gcc'):
    r = subprocess.run([sys.executable, '-B', str(gen), '--check'], capture_output=True, text=True)
    check('butter_fingers_core.s matches butter_fingers.c', r.returncode == 0, (r.stdout + r.stderr).strip()[-300:])
else:
    print('[SKIP] butter_fingers_core.s regeneration: m68k-elf-gcc not on PATH')

sys.exit(1 if failed else 0)
