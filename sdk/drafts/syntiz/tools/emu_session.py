#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""One ot_emu session for SYNTIZ: boot a base, install a package over the emulated USB, pick SYNTIZ on track 1,
pick models from its list, place four trigs, play, and save track 1's stem per segment as WAV plus the LCD.
Emulator only; never a unit. The session behind TESTING.md's emulator results (28 October 2026).

    tools/emu_session.py EMU BASE_DIR CARD PKG REPO OUT_DIR

EMU: Modwerk's adapted ot_emu (scripts/octatrack-emulator/build.py). BASE_DIR: a build_core.py output (MAIN.raw).
CARD: a card image with SET MODWERK / PROJECT TEMPLATE (octabam's stage_card.py). REPO: this repository's root.
What it took to drive ot_emu --interactive (worth knowing for any module):
- `key ROW MASK` pushes the panel link's two bytes as they are: ROW is the frame header, 0x20 | row
  (key code = row * 8 + bit); `knob` likewise takes 0x30 | encoder (A-F = 0-5).
- --frame is needed for machines to render; --mkii opens SET DATE/TIME on a never-set clock (YES clears it).
- `peek` answers "peek HEX", not "ok". Without --dsp a session is about ten times faster (no audio; the
  firmware then shows DSP LOAD FAILED).
"""

import os, subprocess, sys, tempfile, time, wave, shutil

emu, base, card_src, pkg, tree, out = sys.argv[1:7]
os.makedirs(out, exist_ok=True)
card = os.path.join(out, 'card.img'); shutil.copy(card_src, card)
sock_dir = tempfile.mkdtemp(); sock = os.path.join(sock_dir, 'ot.sock')
lcd = os.path.join(out, 'lcd.bin')
log = open(os.path.join(out, 'emu.log'), 'w')
p = subprocess.Popen([emu, '--image', os.path.join(base, 'MAIN.raw'), '--card', card, '--set', 'MODWERK',
                      '--project', 'TEMPLATE', '--mount', '--load-ms', '20000', '--frame', '--dsp', '--mkii',
                      '--usb-host', sock, '--usb-hold-ms', '600000', '--lcd', lcd, '--interactive'],
                     stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=log, text=True, bufsize=1)

def line():
    s = p.stdout.readline()
    if not s: raise SystemExit('emulator exited (see emu.log)')
    return s.strip()

def cmd(c):
    p.stdin.write(c + '\n'); p.stdin.flush()
    r = line()
    while not r.startswith(('ok', 'err', 'audio', 'peek')):
        r = line()
    print('>', c[:60], '->', r[:100], flush=True)
    return r

def run(ms): return cmd('run %d' % ms)

def press(code, hold=60, gap=120, with_func=False):
    # the panel link's key frame: header 0x20 | row, then the row's held mask (PANEL.md; main.cpp's live 'key')
    row, bit = code // 8, code % 8
    if with_func: cmd('key 0x25 0x20'); run(40)             # FUNCTION 0x2d: row 5, bit 5
    cmd('key 0x%02x 0x%02x' % (0x20 | row, (1 << bit) | (0x20 if with_func and row == 5 else 0))); run(hold)
    cmd('key 0x%02x 0x00' % (0x20 | row))
    if with_func: cmd('key 0x25 0x00')
    run(gap)

r = line()
while not r.startswith('ready'): r = line()
print(r, flush=True)
run(3000)
while not os.path.exists(sock): run(200)
cmd('pace on')
inst = subprocess.run(['node', 'scripts/device.mjs', 'try', pkg, '--accept', '--emulator', '--socket', sock],
                      cwd=tree, capture_output=True, text=True, timeout=600)
open(os.path.join(out, 'install.txt'), 'w').write(inst.stdout + inst.stderr)
print('install exit', inst.returncode, (inst.stdout + inst.stderr)[-600:], flush=True)
cmd('pace off')
run(1000)
TRACK1, SRC, DOWN, YES, NO, REC, PLAY, STOP = 0x10, 0x22, 0x20, 0x31, 0x32, 0x29, 0x28, 0x27
def snap(name): run(400); shutil.copy(lcd, os.path.join(out, name + '.bin'))
snap('lcd_0_boot')
press(YES); snap('lcd_1_after_date')                         # the MKII's SET DATE/TIME on a never-set clock
press(TRACK1)
press(SRC, with_func=True); snap('lcd_2_chooser')            # FUNC + SRC: the machine chooser
for _ in range(int(os.environ.get('DOWNS', '4'))): press(DOWN)
snap('lcd_3_on_syntiz')
press(YES); run(800)
press(SRC); snap('lcd_4_src')                                # SYNTIZ's SRC page
press(SRC); snap('lcd_5_setup')                              # a second press: SRC SETUP
AMP = 0x23
segments = []
def capture(name, ms=1500):
    cmd('audio start tracks'); run(ms); a = cmd('audio read'); cmd('audio stop')
    segments.append((name, a))
def enc(n, d):
    while d:
        step = max(-128, min(127, d)); cmd('knob 0x%02x %d' % (0x30 | n, step)); run(150); d -= step
RIGHT = 0x21
press(AMP); enc(1, -87); enc(2, -107)                         # T1: HOLD 40, REL 20
press(REC)
for t in (0, 4, 8, 12): press(t)
press(REC)
press(SRC)
def played(name):
    cmd('audio start tracks'); press(PLAY); run(2000); a = cmd('audio read'); cmd('audio stop')
    press(STOP); press(STOP); run(300); segments.append((name, a))
played('1_saw')
def pick(downs, tag):
    press(TRACK1, gap=40); press(TRACK1); run(300)            # a double tap of the track key: SYNTIZ's model list
    for _ in range(3): press(0x33)
    for _ in range(downs): press(DOWN)
    snap('lcd_%s_a_list' % tag)
    press(YES); run(300); press(NO); run(300)
    press(SRC); snap('lcd_%s_d_src' % tag)
pick(1, 'pulse')
played('2_pulse')
pick(2, 'ens')
enc(1, 18); snap('lcd_ens_e_not2'); print('ens dsp words', cmd('peek 0x80000a50 12'), flush=True)  # NOT2: about 2.6 detents a semitone
played('3_ens_fifth')
for name, a in segments:
    _, frames, hexdata = (a.split(' ', 2) + ['', ''])[:3]
    data = bytes.fromhex(hexdata) if hexdata else b''
    words = [int.from_bytes(data[i:i + 2], 'little', signed=True) for i in range(0, len(data), 2)]
    n = len(words) // 24
    w = wave.open(os.path.join(out, 't1_' + name + '.wav'), 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(44100)
    w.writeframes(b''.join(int(words[f * 24 + 8]).to_bytes(2, 'little', signed=True) for f in range(n)))
    w.close()
    t1 = [words[f * 24 + 8] for f in range(n)]
    loud = max(range(0, max(1, n - 4000), 500), key=lambda i: sum(abs(v) for v in t1[i:i + 4000]), default=0)
    seg = t1[loud:loud + 4000]; best, lag = -1e30, 1
    for k in range(40, 2000):
        c = sum(seg[i] * seg[i + k] for i in range(0, len(seg) - k, 3))
        if c > best: best, lag = c, k
    print('segment', name, 'pitch T1 %.2f Hz' % (44100 / lag), 'peak', max((abs(v) for v in t1), default=0), flush=True)
shutil.copy(lcd, os.path.join(out, 'lcd_end.bin'))
cmd('quit') if p.poll() is None else None
p.wait(timeout=30)
shutil.rmtree(sock_dir, ignore_errors=True)
os.remove(card)
