#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""One ot_emu session for COMBO: boot a development twin on an empty scratch card, install COMBO's USB
package over the emulated USB, pick it on track 1's FX1 (and FX2), and save the LCD of each page as PNG.
Emulator only; never a unit, never hardware evidence.

    tools/emu_session.py EMU TWIN_DIR PKG REPO OUT_DIR [DOWNS]

EMU: Modwerk's adapted ot_emu (scripts/octatrack-emulator/build.py). TWIN_DIR: a build_core.py --dev output
(MAIN.raw). PKG: COMBO's package (npm run module:dev -- combo --build-only). REPO: this repository's root.
DOWNS: LEVEL steps from the top of the FX list to COMBO (default: every row is captured to find it).
Built from SYNTIZ's session (sdk/octatrack/modules/syntiz/tools/emu_session.py) and capture-module-ui.py.
"""
import importlib.util
import os
import shutil
import subprocess
import sys
import tempfile

emu, twin, pkg, repo, out = sys.argv[1:6]
downs = int(sys.argv[6]) if len(sys.argv) > 6 else None
os.makedirs(out, exist_ok=True)


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


lcd = load('lcd_view', os.path.join(repo, 'sdk/octabam/tools/emu/lcd_view.py'))
codec = load('emu_card', os.path.join(repo, 'sdk/octabam/tools/emu/emu_card.py'))
lcd.ON, lcd.OFF = (240, 240, 240), (24, 24, 24)
work = tempfile.mkdtemp(prefix='combo-emu.', dir='/tmp')
os.mkdir(os.path.join(work, 'tree'))
card = os.path.join(work, 'card.img')
with open(card, 'wb') as f:
    f.write(codec.build_image(os.path.join(work, 'tree'), 32))
sock, plane = os.path.join(work, 'ot.sock'), os.path.join(work, 'lcd.bin')
log = open(os.path.join(out, 'emu.log'), 'w')
# The arguments of scripts/octatrack-emulator/session.mjs (a USB trial needs --dsp --dsp-rt, and --max
# keeps route A's 50M-instruction default from ending the boot), plus the scratch card and the LCD plane.
p = subprocess.Popen([emu, '--interactive', '--image', os.path.join(twin, 'MAIN.raw'), '--usb-host', sock,
                      '--max', '400000000000', '--mkii', '--dsp', '--dsp-rt', '--frame', '--card', card,
                      '--rtc', 'host', '--usb-hold-ms', '900000', '--lcd', plane],
                     stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=log, text=True, bufsize=1, cwd=work)


def line():
    s = p.stdout.readline()
    if not s:
        raise SystemExit('emulator exited (see emu.log)')
    return s.strip()


def cmd(c):
    p.stdin.write(c + '\n')
    p.stdin.flush()
    r = line()
    while not r.startswith(('ok', 'err', 'audio', 'peek')):
        r = line()
    return r


def run(ms):
    return cmd('run %d' % ms)


rows = [0] * 8


def key(code, down):
    r, b = code >> 3, code & 7
    rows[r] = rows[r] | (1 << b) if down else rows[r] & ~(1 << b)
    cmd('key %d %d' % (0x20 | r, rows[r]))
    run(150)


def press(*codes):
    for c in codes:
        key(c, True)
    for c in reversed(codes):
        key(c, False)
    run(200)


def enc(name, delta):
    cmd('knob %d %d' % (0x30 | lcd.ENCODERS.index(name), delta & 255))
    run(250)


def snap(name):
    run(300)
    lcd.png(lcd.screen(lcd.read_plane(plane)), os.path.join(out, name + '.png'), 6)
    print('captured', name, flush=True)


K = {v: k for k, v in lcd.KEYS.items()} if hasattr(lcd, 'KEYS') else None
TRACK1, FUNC, FX1, FX2, YES, NO = 0x10, 0x2D, 0x25, 0x26, 0x31, 0x32
try:
    r = line()
    while not r.startswith('ready'):
        r = line()
    run(3000)
    while not os.path.exists(sock):
        run(200)
    cmd('pace on')
    inst = subprocess.run(['node', 'scripts/device.mjs', 'try', pkg, '--accept', '--emulator', '--socket', sock],
                          cwd=repo, capture_output=True, text=True, timeout=900)
    open(os.path.join(out, 'install.txt'), 'w').write(inst.stdout + inst.stderr)
    print('install exit', inst.returncode, (inst.stdout + inst.stderr)[-400:], flush=True)
    cmd('pace off')
    run(1500)
    snap('0_boot')
    press(TRACK1)
    press(FUNC, FX1)
    snap('1_fx1_setup')
    enc('LEVEL', -40)
    snap('2_list_top')
    if downs is None:
        for i in range(1, 26):
            enc('LEVEL', 1)
            snap('3_list_%02d' % i)
    else:
        enc('LEVEL', downs)
        snap('3_on_combo')
        press(YES)
        run(800)
        snap('4_after_yes')
        press(FX1)
        snap('5_fx1_page')
        press(FUNC, FX1)
        snap('6_fx1_setup_after')
        press(NO)
        enc('A', 50)
        snap('7_gain_turned')
    cmd('quit')
    p.wait(timeout=30)
finally:
    if p.poll() is None:
        p.terminate()
    shutil.rmtree(work, ignore_errors=True)
