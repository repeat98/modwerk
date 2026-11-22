#!/usr/bin/env python3
"""SCREEN OFF's gate: screen_off.c compiled for the host and driven with panel events.

    python3 -B verify.py

UP is 0x33 and NO is 0x32. The chord is NO pressed while UP is already down.
That press and its release are taken. A repeat of the held NO does not toggle
again. Every other key is passed through. While the blank is on, so_draw
clears a 1024-byte frame and leaves it alone once the chord turns the blank off.
A garbage state word behaves as a fresh module.
"""
import ctypes
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
UP, NO, PLAY = 0x33, 0x32, 0x28
failed = []
passed = []


def check(name, ok):
    print(('[PASS] ' if ok else '[FAIL] ') + name)
    (passed if ok else failed).append(name)


def compiler():
    for name in ('gcc', 'cc', r'C:\msys64\mingw64\bin\gcc.exe', r'C:\msys64\usr\bin\gcc.exe'):
        found = shutil.which(name) or (name if pathlib.Path(name).is_file() else None)
        if found:
            return found
    sys.exit('[FAIL] no host C compiler (gcc or cc)')


class Api(ctypes.Structure):
    _fields_ = [('value', ctypes.c_uint32)]


class State(ctypes.Structure):
    _fields_ = [
        ('magic', ctypes.c_uint32),
        ('up', ctypes.c_uint8),
        ('off', ctypes.c_uint8),
        ('no_down', ctypes.c_uint8),
        ('take', ctypes.c_uint8),
        ('toggles', ctypes.c_uint32),
    ]


with tempfile.TemporaryDirectory() as tmp:
    dll = pathlib.Path(tmp) / 'screen_off.dll'
    env = os.environ.copy()
    mingw = pathlib.Path(r'C:\msys64\mingw64\bin')
    if mingw.is_dir():
        env['PATH'] = str(mingw) + os.pathsep + env.get('PATH', '')
        os.environ['PATH'] = env['PATH']
    subprocess.run(
        [compiler(), '-O2', '-shared', '-DSO_HOST', '-o', str(dll), str(HERE / 'screen_off.c')],
        check=True, env=env,
    )
    lib = ctypes.CDLL(str(dll))
    lib.so_key.argtypes = [ctypes.c_int, ctypes.c_int]
    lib.so_key.restype = ctypes.c_int
    lib.so_draw.argtypes = [ctypes.c_void_p]
    lib.so_draw.restype = None
    lib.so_tick.argtypes = [ctypes.POINTER(Api)]
    lib.so_tick.restype = None
    lib.so_redraw_count.restype = ctypes.c_int
    lib.so_state_for_test.restype = ctypes.POINTER(State)
    lib.so_test_up_held.argtypes = [ctypes.c_int]
    lib.so_test_up_held.restype = None

    def key(code, down):
        return lib.so_key(code, int(down))

    def tick():
        api = Api()
        lib.so_tick(ctypes.byref(api))
        return api.value

    def frame(pattern):
        buf = (ctypes.c_ubyte * 1024)()
        for i in range(1024):
            buf[i] = pattern
        lib.so_draw(ctypes.cast(buf, ctypes.c_void_p))
        return bytes(buf)

    check('NO alone is not taken', key(NO, True) == 0 and key(NO, False) == 0)
    check('the screen stays on', tick() == 0 and frame(0xA5) == bytes([0xA5]) * 1024)
    check('UP alone is not taken', key(UP, True) == 0)

    check('NO while UP is held is taken', key(NO, True) == 1)
    check('the screen is blank and a redraw was asked', tick() == 0b11 and lib.so_redraw_count() == 1)
    check('the composed frame is cleared', frame(0xA5) == bytes(1024))
    check('a null frame is ignored', lib.so_draw(None) is None)
    check('a repeat of the held NO does not toggle back', key(NO, True) == 1 and (tick() & 1) == 1)
    check('the release of that NO is taken', key(NO, False) == 1)
    check('releasing UP is not taken', key(UP, False) == 0)

    check('another key still passes while the screen is black', key(PLAY, True) == 0 and key(PLAY, False) == 0)
    check('the frame stays clear after that key', frame(0x5A) == bytes(1024))

    check('the chord again is taken', key(UP, True) == 0 and key(NO, True) == 1)
    check('the screen is back and a second redraw was asked', (tick() & 1) == 0 and lib.so_redraw_count() == 2)
    check('the composed frame is left alone', frame(0x3C) == bytes([0x3C]) * 1024)
    key(NO, False)
    key(UP, False)

    check('NO pressed before UP does not blank', key(NO, True) == 0 and key(UP, True) == 0 and (tick() & 1) == 0)
    key(NO, False)
    key(UP, False)

    check('UP released before NO still keeps the blank', key(UP, True) == 0 and key(NO, True) == 1 and key(UP, False) == 0)
    check('that NO release is still taken', key(NO, False) == 1 and (tick() & 1) == 1)
    key(UP, True)
    key(NO, True)
    key(NO, False)
    key(UP, False)
    check('the following chord restores the screen', (tick() & 1) == 0)

    state = lib.so_state_for_test()
    state.contents.magic = 0xDEADBEEF
    state.contents.off = 1
    check('a garbage state is a fresh module', key(NO, True) == 0 and key(NO, False) == 0 and tick() == 0)
    check('a garbage blank does not clear the frame', frame(0x11) == bytes([0x11]) * 1024)

    lib.so_test_up_held(1)
    check('NO takes when the panel row already holds UP', key(NO, True) == 1 and (tick() & 1) == 1)
    check('that NO release is taken', key(NO, False) == 1)
    lib.so_test_up_held(0)
    check('NO alone still passes once the row lets UP go', key(NO, True) == 0 and key(NO, False) == 0)

    handle = lib._handle
    del state, lib
    if sys.platform == 'win32':
        free = ctypes.WinDLL('kernel32').FreeLibrary
        free.argtypes = [ctypes.c_void_p]
        free(handle)

if failed:
    sys.exit(f'{len(failed)} check(s) failed')
print(f'verify screen-off: {len(passed)} checks passed')
