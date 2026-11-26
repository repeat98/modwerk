#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Drive an Analog Rytm MKII that runs a Modwerk base with the link (base/link.c, ../LINK.md).

Talks to the unit over its USB MIDI port (mido). Every base answers ident (with the set identity),
load and log; a development base also the screen and memory reads, and keys, encoders and the remote
YES, which need GLOBAL > REMOTE CTRL: ON on the unit and stop as soon as someone touches the panel
(status HUMAN).

    rytm_link.py ident
    rytm_link.py load                           # the audio load: last half second, its dearest block, since boot
    rytm_link.py log [--json FILE] [--raw FILE] # the diagnostics log, the Octatrack's layout
    rytm_link.py try PACKAGE.mwrm --seconds 20 [--keep]  # a runtime module on trial (every base), then undo or keep
    rytm_link.py mods | keep | undo             # the module pool and live modules; end a trial
    rytm_link.py remove NAME --seconds 5 [--keep]        # that module out, on trial
    rytm_link.py screen --png shot.png          # the 128x64 screen; --ascii prints it
    rytm_link.py mem 0x402728bd 8
    rytm_link.py steps 'GLOBAL w300 DOWN*3 YES png:shot.png NO'
    rytm_link.py flash IMAGE.syx --label XX01   # stock OS upgrade + remote YES, waits for the new build
    rytm_link.py ramboot IMAGE.syx --label XX01 # the same upload, booted from RAM: nothing written to flash
    rytm_link.py ramboot-args IMAGE.syx         # the four numbers RAMBOOT carries, for encode
    rytm_link.py encode ident                    # hex of a request, for rytm-emu's --usb-midi
    rytm_link.py decode MIDI_OUT_FILE            # the link's replies in a rytm-emu --midi-out capture

Steps (as the Octatrack's device-send.py): KEY taps (names as rytm-emu's panel table: YES, NO,
FUNC, T1..T16, BD..CB, PLAY, STOP, PUSH_A ...), KEY+KEY holds all but the last, KEY*N repeats,
+KEY / -KEY hold and let go, encA+3 / encH-2 turn (A..H; LEVEL), w300 waits 300 ms,
png:/path.png and ascii save or print the screen, ident prints the identity.

encA+3 sends one raw count message. Stock's parameter pages ignore small counts on a resting
knob (the first 16 or so only wake it and show the value), then take about one step per 4
counts (3 on the AMP and FILTER pages) and speed up with more. nudgeA+3 / nudgeA-3 (up to 31)
sends one turn of 16 counts the other way, which a rested knob swallows, and 50 ms later one
turn of 4 counts per step: exactly three steps when the knob rested 3 s since its last turn
(w3000 first). nudgeB+3/3 sends 3 counts a step (/1 to /8, up to 127 counts in all). With FUNC held
(+FUNC w300 nudgeA+1 -FUNC) stock steps coarsely, and drops the first FUNC turn after a plain
one (LINK.md, Turns).
"""
import argparse
import re
import os
import binascii
import struct
import sys
import time
import zlib
from pathlib import Path

HEADER = bytes([0xF0, 0x7D, ord('M'), ord('W'), ord('L'), 1])
CMD = {'ident': 0x01, 'disarm': 0x02, 'key': 0x10, 'enc': 0x11, 'release': 0x12, 'confirm': 0x13, 'ramboot': 0x14,
       'pad': 0x15,
       'screen': 0x20, 'mem': 0x21, 'diaglog': 0x22, 'load': 0x23, 'log': 0x24,
       'up_part': 0x31, 'up_run': 0x32, 'mods': 0x33}
STATUS = {0: 'ok', 1: 'not armed (GLOBAL > REMOTE CTRL)', 2: 'bad request', 3: 'busy', 4: 'out of range',
          5: 'a person is at the unit'}
KEY_DOWN, KEY_UP, KEY_FUNC = 1, 0x10, 2


class KeyFlags:
    """A key message's flags as stock's panel scan sets them (OS 1.74, 0x40081dac). Down: 1. Up: 0x10 when the
    key is the one that went down last, else 0 (stock tells an up by bit 0 clear; a key let go after another
    went down has no 0x10). Both: 2 on a key that went down while FUNC was held. Stock's FUNC + key handlers
    read that bit in the message (FUNC + MUTE opened nothing without it), not the held-key bitmap. Not sent:
    4 on a second press of one key inside the scan's double-press time, and the up without 0x10 the scan
    gives a key its table at 0x418d1310 marks. The tracker lives as long as its process: keep a hold and the
    keys under it in one `steps` text."""

    def __init__(self):
        self.clear()

    def clear(self):
        self.func, self.under, self.last, self.down = False, set(), None, []

    def flags(self, name, down):
        if down:
            if name in self.down:
                self.down.remove(name)
            self.down.append(name)
            self.last = name
            if name == 'FUNC':
                self.func = True
                return KEY_DOWN
            (self.under.add if self.func else self.under.discard)(name)
            return KEY_DOWN | (KEY_FUNC if self.func else 0)
        if name in self.down:
            self.down.remove(name)
        up = KEY_UP if name == self.last else 0
        if name == 'FUNC':
            self.func = False
            return up
        under = name in self.under
        self.under.discard(name)
        return up | (KEY_FUNC if under else 0)

    def held(self):
        """The keys down, in the order to let them go: the newest first, FUNC last. The link's own `release`
        posts every up as a plain 0x10, so the tools let go key by key first and keep `release` as the net."""
        return [k for k in reversed(self.down) if k != 'FUNC'] + [k for k in self.down if k == 'FUNC']


# What the last boot did (link.c's BOOT_*).
BOOT = {0: 'the flashed OS, no RAM boot asked', 1: 'booted from RAM', 2: 'RAM boot refused: not a software reset',
        3: 'RAM boot refused: mailbox check word', 4: 'RAM boot refused: lengths out of bounds',
        5: 'RAM boot refused: the upload did not survive the reset (CRC)', 6: 'RAM boot refused: no MAIN OS section',
        7: 'RAM boot refused: SRAM does not hold the 1.74 bootstrap depacker (early gates only; no longer given)',
        8: 'RAM boot failed after the unpack; this is the flashed OS'}
OS_BASE, IMAGE_MAX, CONTAINER_MAX, MAIN_OS = 0x40000400, 0x3c8700, 0x400000, 3

# OS key ids, from rytm-emu's panel::RYTM_KEYS (the OS's own slot and button-name tables).
KEYS = {
    'BANK_A': 0xc0, 'BANK_B': 0xc1, 'BANK_C': 0xc2, 'BANK_D': 0xc3, 'CHAIN': 0x82, 'SONG': 0x81, 'FX': 0x10,
    'FILL': 0xb2, 'BANK_E': 0xc4, 'BANK_F': 0xc5, 'BANK_G': 0xc6, 'BANK_H': 0xc7, 'RECORD': 0x50, 'PLAY': 0x51,
    'STOP': 0x52, 'PAGE': 0x84, 'NO': 0x45, 'LEFT': 0x40, 'DOWN': 0x43, 'RIGHT': 0x41, 'TEMPO': 0x83, 'FIX': 0xb3,
    'PERF': 0x14, 'SCNE': 0x13, 'YES': 0x44, 'UP': 0x42, 'TRIG': 0x30, 'SRC': 0x31, 'SMPL': 0x32, 'FLTR': 0x33,
    'AMP': 0x34, 'LFO': 0x35, 'MUTE': 0x11, 'PLAYMODE': 0xb5, 'QPER': 0xb1, 'SAMPLER': 0xb4, 'GLOBAL': 0xb0,
    'FUNC': 0x80, 'TRK': 0x86, 'RTRG': 0x85, 'PUSH_LEVEL': 0x78, 'CHRO': 0x12,
    'BD': 0x90, 'SD': 0x91, 'RS': 0x92, 'CP': 0x93, 'BT': 0x94, 'LT': 0x95, 'MT': 0x96, 'HT': 0x97, 'CH': 0x98,
    'OH': 0x99, 'CY': 0x9a, 'CB': 0x9b,
}
KEYS.update({'T%d' % (i + 1): i for i in range(16)})
# The pads, as the panel's pad and pressure messages name them (0..11), and what a `pad` request does.
PADS = {name: KEYS[name] - 0x90 for name in ('BD', 'SD', 'RS', 'CP', 'BT', 'LT', 'MT', 'HT', 'CH', 'OH', 'CY', 'CB')}
PAD_UP, PAD_DOWN, PAD_PRESSURE = 0, 1, 2
KEYS.update({'PUSH_' + c: 0x70 + i for i, c in enumerate('ABCDEFGH')})
ENCODERS = {c: i for i, c in enumerate('ABCDEFGH')}
ENCODERS['LEVEL'] = 8


def u32(v):
    v &= 0xffffffff
    return bytes((v >> (7 * i)) & 0x7f for i in range(5))


def get32(b, i):
    return b[i] | b[i + 1] << 7 | b[i + 2] << 14 | b[i + 3] << 21 | (b[i + 4] & 0x0f) << 28


def unpack7(b):
    out = bytearray()
    for i in range(0, len(b), 8):
        top = b[i]
        for k, c in enumerate(b[i + 1:i + 8]):
            out.append(c | (0x80 if top & (0x40 >> k) else 0))
    return bytes(out)


def request(seq, name, *values):
    if name == 'up_part_raw':           # an offset, then bytes already packed 7-bit (loader_frame)
        return HEADER + bytes([seq & 0x7f, CMD['up_part']]) + u32(values[0]) + values[1] + b'\xF7'
    return HEADER + bytes([seq & 0x7f, CMD[name]]) + b''.join(u32(v) for v in values) + b'\xF7'


def parse(msg):
    """A reply's (seq, cmd, status, payload) or None."""
    msg = bytes(msg)
    if not msg.startswith(HEADER) or len(msg) < 10 or msg[-1] != 0xF7:
        return None
    return msg[6], msg[7] & 0x3f, msg[8], msg[9:-1]


def ident_text(p):
    names = ['link', 'armed', 'human', 'human_count', 'posted', 'refused', 'drops', 'received', 'ticks', 'boot_rsr',
             'playing']
    d = {n: get32(p, 5 * i) for i, n in enumerate(names)}
    d['label'] = p[55:59].decode('ascii', 'replace')
    d['os_build'] = p[59:63].decode('ascii', 'replace')
    if len(p) >= 73:                                # a base with the RAM boot
        d['boot'] = get32(p, 63)
        d['boot_text'] = BOOT.get(d['boot'], '?')
        d['depack_crc'] = '%08x' % get32(p, 68)
    if len(p) >= 78:                                # the unpacked CRC32 of a RAM-booted image, else 0
        d['image_crc'] = '%08x' % get32(p, 73)
    if len(p) >= 83:                                # where the gate keeps its diagnostics (DIAG_OLD before that)
        d['diag'] = '%08x' % get32(p, 78)       # 0 in a release base: no RAM boot
    if len(p) >= 93:                                # the set identity: link-image.mjs prints the same as `run`
        d['set_crc'] = '%08x' % get32(p, 83)
        d['set_bytes'] = get32(p, 88)
    return d


def load_text(p):
    """LOAD's reply: tenths of a percent of the audio block's period (load.c)."""
    names = ['window', 'window_peak', 'peak', 'windows', 'blocks']
    d = {n: get32(p, 5 * i) for i, n in enumerate(names)}
    for n in ('window', 'window_peak', 'peak'):
        d[n + '_percent'] = d.pop(n) / 10
    return d


LOG_KINDS = {1: 'START', 2: 'HOT', 3: 'FREEZE', 4: 'CRASH', 5: 'STALL', 6: 'SET', 7: 'BASE', 8: 'SHED', 9: 'CPU'}


def log_text(raw):
    """The diagnostics log (base/diag.h, the Octatrack's layout version 2, big-endian), as a dict."""
    magic, version, nonce, boot, seq, loads, incidents = struct.unpack_from('>7I', raw, 0)
    if magic != 0x4d574447:
        raise ValueError('no diagnostics log (magic %08x)' % magic)
    def incident(at):
        s_, b, second, a, kind, cpu = struct.unpack_from('>4I2H', raw, at)
        keys = [k for k in raw[at + 64:at + 80] if k != 0xff]
        playing, = struct.unpack_from('>I', raw, at + 88)
        return {'seq': s_, 'second': second, 'kind': LOG_KINDS.get(kind, kind), 'a': a, 'cpu_percent': cpu / 10,
                'keys': keys, 'playing': playing}
    out = {'version': version, 'nonce': '%08x' % nonce, 'boot': boot, 'seq': seq, 'loads': [], 'incidents': []}
    at = 40 + 92
    for i in range(96):
        s_, b, minute, cm, cp, _, _, _, _, samples, playing, fgap, tgap = struct.unpack_from('>3I10H', raw, at + 32 * i)
        if s_:
            out['loads'].append({'seq': s_, 'minute': minute, 'cpu_mean_percent': cm / 10, 'cpu_peak_percent': cp / 10,
                                 'windows': samples, 'playing': playing, 'frame_gap_us': fgap, 'tick_gap': tgap})
    at += 32 * 96
    for i in range(32):
        if struct.unpack_from('>I', raw, at + 92 * i)[0]:
            out['incidents'].append(incident(at + 92 * i))
    out['loads'].sort(key=lambda r: r['seq'])
    out['incidents'].sort(key=lambda r: r['seq'])
    return out


def frame_rows(fb):
    """The 1024-byte frame as 64 rows of 128 pixels, top row first (as rytm-emu's frame_pixels)."""
    return [[(fb[(7 - y // 8) + 8 * x] >> (y % 8)) & 1 for x in range(128)] for y in range(64)]


def ascii_art(rows):
    chars = {(1, 1): '█', (1, 0): '▀', (0, 1): '▄', (0, 0): ' '}
    return '\n'.join(''.join(chars[(a, b)] for a, b in zip(rows[y], rows[y + 1])) for y in range(0, len(rows), 2))


def write_png(rows, path, scale=3):
    h, w = len(rows) * scale, len(rows[0]) * scale
    raw = bytearray()
    for row in rows:
        line = bytes([0]) + bytes(255 if px else 0 for px in row for _ in range(scale))
        raw += line * scale
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', binascii.crc32(t + d) & 0xffffffff)
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 0, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(bytes(raw), 9)) + chunk(b'IEND', b'')
    open(path, 'wb').write(png)


class Link:
    def __init__(self, port=None):
        import mido
        self.mido = mido
        self.port = port
        self.keys = KeyFlags()
        self.open()

    def open(self):
        mido, want = self.mido, self.port or 'Analog Rytm'
        outs = [n for n in mido.get_output_names() if want.lower() in n.lower()]
        ins = [n for n in mido.get_input_names() if want.lower() in n.lower()]
        if not outs or not ins:
            sys.exit('No MIDI port matching %r. Outputs: %s' % (want, mido.get_output_names()))
        self.out = mido.open_output(outs[0])
        self.inp = mido.open_input(ins[0])
        self.seq = 0
        self.heard = getattr(self, 'heard', [])     # every other MIDI message the unit sent, in order

    def reopen(self):
        # Keep the old ports, unclosed: closing an input while messages arrive can hang
        # (see the end of this file), and the process ends with os._exit anyway.
        self.old = getattr(self, 'old', []) + [getattr(self, 'out', None), getattr(self, 'inp', None)]
        self.open()

    def call(self, name, *values, timeout=2.0):
        self.seq = (self.seq + 1) & 0x7f
        if name in ('release', 'disarm'):
            self.keys.clear()
        req = request(self.seq, name, *values)
        for m in self.inp.iter_pending():
            self.hear(m)                            # stale replies and telemetry are dropped
        self.out.send(self.mido.Message('sysex', data=req[1:-1]))
        end = time.time() + timeout
        while time.time() < end:
            m = self.inp.poll()
            if m is None:
                time.sleep(0.002)
                continue
            if m.type != 'sysex':
                self.hear(m)
                continue
            r = parse(bytes([0xF0]) + bytes(m.data) + b'\xF7')
            if r and r[0] == self.seq and r[1] == CMD['up_part' if name == 'up_part_raw' else name]:
                return r[2], r[3]
        raise TimeoutError('no reply to %s (is the unit on a link base, in USB MIDI or Overbridge mode?)' % name)

    def hear(self, m):
        if m.type != 'sysex' and not m.is_realtime:
            self.heard.append(bytes(m.bytes()))     # a test runner's `midi` window reads these (by index)

    def ok(self, name, *values, **kw):
        status, payload = self.call(name, *values, **kw)
        if status:
            raise RuntimeError('%s: %s' % (name, STATUS.get(status, status)))
        return payload

    def ident(self):
        return ident_text(self.ok('ident'))

    def screen(self):
        out = b''
        for off in (0, 512):                        # the unit sends the frame in two halves
            p = self.ok('screen', off)
            out += unpack7(p[5:])[:512]
        return out

    def mem(self, addr, n):
        p = self.ok('mem', addr, n)
        return unpack7(p[5:])[:n]

    def load(self):
        return load_text(self.ok('load'))

    def log(self, tries=5):
        """The diagnostics log's bytes, read with LOG (every base), 128 at a time. The unit can write a record between
        two reads, and records cross the 128-byte reads, so the read is taken again until the log's seq (its count of
        records written) is the same before and after."""
        p = self.ok('diaglog')
        size = get32(p, 5)
        for _ in range(tries):
            out = b''
            while len(out) < size:
                n = min(128, size - len(out))
                p = self.ok('log', len(out), n)
                out += unpack7(p[10:])[:n]
            p = self.ok('log', 16, 4)                   # the header's seq, after the whole read
            if len(out) >= 20 and unpack7(p[10:])[:4] == out[16:20]:
                return out
        raise RuntimeError('the log kept changing while it was read (%d tries)' % tries)

    def key(self, name, down):
        flags = self.keys.flags(name, down)
        for _ in range(50):                         # busy: the UI loop is behind
            status, _ = self.call('key', KEYS[name], flags)
            if status != 3:
                break
            time.sleep(0.05)
        if status:
            raise RuntimeError('key %s: %s' % (name, STATUS.get(status, status)))

    def release_keys(self):
        """Every key this process holds let go as the panel would, then the link's own release."""
        try:
            for name in self.keys.held():
                self.key(name, False)
        finally:
            self.call('release')

    def pad(self, name, what, value=0):
        """A pad as the panel plays it: PAD_DOWN with a velocity 1..127, PAD_PRESSURE with the panel's pressure byte
        0..255 (MIDI poly pressure sends half of it), PAD_UP with 0."""
        status, _ = self.call('pad', PADS[name], what, value)
        if status:
            raise RuntimeError('pad %s: %s' % (name, STATUS.get(status, status)))

    def enc(self, name, delta):
        for _ in range(50):                         # busy: the UI loop is behind
            status, _ = self.call('enc', ENCODERS[name], delta & 0xffffffff)
            if status != 3:
                break
            time.sleep(0.05)
        if status:
            raise RuntimeError('enc %s: %s' % (name, STATUS.get(status, status)))


def run_steps(link, text, tap_ms=60):
    for step in text.split():
        if step.startswith('w') and step[1:].isdigit():
            time.sleep(int(step[1:]) / 1000)
        elif step.startswith('png:'):
            write_png(frame_rows(link.screen()), step[4:])
        elif step == 'ascii':
            print(ascii_art(frame_rows(link.screen())))
        elif step == 'ident':
            print(link.ident())
        elif step.startswith('nudge'):
            m = re.fullmatch(r'nudge([A-Z]+)([+-])(\d+)(?:/([1-8]))?', step)
            per = int(m.group(4) or 4) if m else 0
            if not m or m.group(1) not in ENCODERS or not 1 <= int(m.group(3)) <= 127 // per:
                raise ValueError(step)
            sign = 1 if m.group(2) == '+' else -1
            link.enc(m.group(1), -sign * 16)                # the turn a rested knob swallows
            time.sleep(0.05)
            link.enc(m.group(1), sign * per * int(m.group(3)))
            time.sleep(0.05)
        elif step.startswith('enc'):
            body = step[3:]
            for i, c in enumerate(body):
                if c in '+-':
                    link.enc(body[:i], int(body[i:]))
                    break
            else:
                raise ValueError(step)
        elif step[0] in '+-' and step[1:] in KEYS:
            link.key(step[1:], step[0] == '+')
        else:
            count = 1
            if '*' in step:
                step, count = step.split('*')
                count = int(count)
            keys = step.split('+')
            for k in keys:
                if k not in KEYS:
                    raise ValueError('unknown key %s' % k)
            for _ in range(count):
                for k in keys[:-1]:
                    link.key(k, True)
                link.key(keys[-1], True)
                time.sleep(tap_ms / 1000)
                link.key(keys[-1], False)
                for k in reversed(keys[:-1]):
                    link.key(k, False)
                time.sleep(tap_ms / 1000)


# ---- the stock OS upgrade (Elektron's USB protocol, as elektroid's elektron.c sends it) ----
EK_HEADER = bytes([0xF0, 0x00, 0x20, 0x3C, 0x10, 0x00])


def ek_encode(msg):
    out = bytearray()
    for j in range(0, len(msg), 7):
        chunk = msg[j:j + 7]
        top = 0
        for k in range(7):
            top <<= 1
            if k < len(chunk) and chunk[k] & 0x80:
                top |= 1
        out.append(top)
        out += bytes(b & 0x7f for b in chunk)
    return EK_HEADER + bytes(out) + b'\xF7'


def ek_decode(sysex):
    return unpack7(sysex[len(EK_HEADER):-1])


def ek_upgrade_messages(syx):
    """[(seq, request bytes)]: start (0x50), then the .syx file in 2 KiB writes (0x51), as elektroid sends them.
    The block CRC is crc32 seeded with 0xffffffff (elektroid's crc32(0xffffffff, ...)); a standard crc32 gets status 2."""
    msgs, seq = [], 1
    start = bytes([0x50]) + struct.pack('<I', len(syx)) + b'sysex\0' + bytes([1])
    msgs.append((seq, ek_encode(bytes([seq >> 8, seq & 0xff, 0, 0]) + start)))
    for off in range(0, len(syx), 0x800):
        seq += 1
        block = syx[off:off + 0x800]
        body = bytes([0x51]) + struct.pack('>III', zlib.crc32(block, 0xffffffff) & 0xffffffff, len(block), off) + block
        msgs.append((seq, ek_encode(bytes([(seq >> 8) & 0xff, seq & 0xff, 0, 0]) + body)))
    return msgs


def syx_container(syx):
    """The ELE3 container an OS update .syx carries (sdk/firmware_codec/transport.py: 128-byte data messages,
    each 101 stream bytes 8-in-7; the stream is the container's length, its checksum, then the container).
    Stock's upload leaves exactly these bytes in RAM."""
    stream, i = bytearray(), 0
    while (s := syx.find(b'\xF0', i)) != -1:
        e = syx.find(b'\xF7', s)
        if e < 0:
            break
        msg, i = syx[s:e + 1], e + 1
        if len(msg) == 128 and msg[1:4] == b'\x00\x20\x3c' and msg[6] == 0x7E:
            stream += unpack7(msg[10:126])[:101]
    if len(stream) < 12:
        raise ValueError('no OS update data messages in the file')
    length, = struct.unpack_from('>I', stream, 0)
    container = bytes(stream[8:8 + length])
    if len(container) != length or container[:4] != b'ELE3':
        raise ValueError('not an ELE3 OS update')
    return container


def ramboot_args(syx):
    """(unpacked length, unpacked CRC32, container length, container CRC32) of the image's MAIN OS, as RAMBOOT
    carries them; refuses an image the base's boot gate would refuse."""
    sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
    from firmware_codec import elz
    c = syx_container(syx)
    if len(c) > CONTAINER_MAX:
        raise ValueError('the container is %d bytes (limit %d)' % (len(c), CONTAINER_MAX))
    count, = struct.unpack_from('>I', c, 0x1c)
    for k in range(min(count, 16)):
        ident, off, plen, dest = struct.unpack_from('>IIII', c, 0x20 + 16 * k)
        if ident == MAIN_OS:
            break
    else:
        raise ValueError('no MAIN OS section in the first 16 of the container')
    if dest != OS_BASE or off + plen > len(c):
        raise ValueError('MAIN OS section: dest %#x, %#x + %#x of %#x bytes' % (dest, off, plen, len(c)))
    image = elz.depack_section(c[off:off + plen])
    if not image or len(image) > IMAGE_MAX:
        raise ValueError('the unpacked OS is %d bytes; it would reach the upload buffer (limit %d)'
                         % (len(image), IMAGE_MAX))
    return len(image), zlib.crc32(image) & 0xffffffff, len(c), zlib.crc32(c) & 0xffffffff


DIAG_OLD = 0x47bfffbc                               # a base whose ident names no place: the old mod area's top
DIAG_STAGES = {1: 'the command was taken', 2: "stock's job reached the flash call", 3: "stock's wait returned",
               4: 'the drain returned', 5: 'the data cache was off'}


def diag_text(raw, syx=None):
    """What a development base's boot gate found at the last boot (link.c, DIAG): the mailbox, stock's staged
    struct, the two marks written on the way to a RAM boot's reset, and RSR; the staged length is
    compared with IMAGE's when one is given. Read from an image without these diagnostics the bytes
    are whatever the mod area's spare top holds."""
    w = struct.unpack('>15I', raw)
    out = ['mailbox: ' + ' '.join('%08x' % v for v in w[0:8]),
           'staged:  ' + ' '.join('%08x' % v for v in w[8:12]) + '  (length, checksum, container...)']
    mark, stage = w[12], w[13]
    if stage >> 8 == 0x4d5754:
        out.append('stage: %d (%s)' % (stage & 0xff, DIAG_STAGES.get(stage & 0xff, 'unknown')))
    else:
        out.append('stage: none (%08x): no RAM boot was asked for before this boot, or DDR did not get it' % stage)
    if mark >> 16 == 0x4d57:
        out.append('mark: due %d, armed %d, struct is the staged one %d, length matches %d; panel events %d (mod 256)'
                   % (mark & 3, mark >> 2 & 1, mark >> 3 & 1, mark >> 4 & 1, mark >> 8 & 0xff))
    else:
        out.append('mark: none (%08x)' % mark)
    out.append('rsr: %#04x (%s)' % (w[14], 'software reset' if w[14] & 0x20 else 'not a software reset'))
    if syx is not None:
        c = syx_container(syx)
        out.append('image: container %#x bytes; staged length %s' % (len(c), 'matches' if w[8] == len(c) else 'differs'))
    return '\n'.join(out)


def flash(link, path, label, reboot_s=90, ram=False):
    syx = open(path, 'rb').read()
    args = ramboot_args(syx) if ram else ()
    who = link.ident()
    # The gate that boots from RAM is the flashed image's, and so is this answer unless the
    # unit already runs from RAM (then the flash's base may be an older one: status 0 after).
    if ram and 'image_crc' not in who:
        sys.exit('The unit runs %s, a base without the RAM boot.' % who['label'])
    was = who['label']
    print('unit: %s (OS build %s), armed %d' % (who['label'], who['os_build'], who['armed']))
    if not who['armed']:
        sys.exit('The unit is not armed: GLOBAL > REMOTE CTRL: ON first.')
    if who['playing']:
        sys.exit('The sequencer is playing: stop it first.')
    # Stock takes the upgrade only from a plain screen: started with the GLOBAL menu open it
    # shows OS UPGRADE / WAITING FOR SYSEX and answers every block with status 2 (rytm-emu).
    run_steps(link, 'NO NO NO w300')
    msgs = ek_upgrade_messages(syx)
    t0 = time.time()
    done = False
    for i, (seq, req) in enumerate(msgs):
        link.out.send(link.mido.Message('sysex', data=req[1:-1]))
        end = time.time() + 10
        reply = None
        while time.time() < end and reply is None:
            m = link.inp.poll()
            if m is None:
                time.sleep(0.001)
                continue
            if m.type == 'sysex' and bytes(m.data[:5]) == EK_HEADER[1:]:
                d = ek_decode(bytes([0xF0]) + bytes(m.data) + b'\xF7')
                # elektroid (elektron.c) reads the echo of the request's sequence at reply bytes 2-3
                # the start's reply is 7 bytes (status at 5), a block's 11 (status at 9)
                if len(d) > (9 if i else 5) and (d[2] << 8 | d[3]) == seq and d[4] == (0xD0 if i == 0 else 0xD1):
                    reply = d
        if reply is None:
            sys.exit('No answer to upgrade message %d of %d; the unit stays on its OS (nothing erased before YES).'
                     % (i + 1, len(msgs)))
        if i == 0 and reply[5] != 0:
            sys.exit('The unit refused the upgrade start (status %d).' % reply[5])
        if i and reply[9] > 1:
            sys.exit('The unit refused block %d (status %d).' % (i, reply[9]))
        if i and reply[9] == 1:
            # Stock says done only after the last block; then, and only then, it shows
            # UPGRADE OS NOW?. Any other block answered "done" leaves YES on an unknown screen.
            if i != len(msgs) - 1:
                sys.exit('The unit said done at block %d of %d; not confirming (nothing erased).'
                         % (i, len(msgs) - 1))
            done = True
            break
        if i % 100 == 0:
            print('  %d / %d blocks, %.0f s' % (i, len(msgs) - 1, time.time() - t0))
    if not done:
        sys.exit('The unit never said the upload was complete; not confirming (nothing erased).')
    print('sent in %.1f s; confirming with YES%s' % (time.time() - t0, ' for a RAM boot' if ram else ''))
    time.sleep(0.5)
    before = link.ident()['ticks']
    if ram:                                         # YES as below; the base resets where stock would flash
        link.ok('ramboot', *args)
    else:
        link.ok('confirm')                          # YES down and up, and the carry for the reset
    t1 = time.time()
    who = None
    quiet = 0
    # A MIDI call can block for good while the unit's USB device goes and comes back (seen once
    # on macOS after a RAM boot: the unit was up, this loop never returned). The loop's own limit
    # cannot end that, so past it the interpreter prints where it stands and leaves with status 1.
    import faulthandler
    faulthandler.dump_traceback_later(reboot_s + 20, exit=True)
    while time.time() - t1 < reboot_s:
        time.sleep(1)
        try:
            w = link.ident()
            if w['ticks'] < before:                 # a new boot: the old OS answers while it writes
                who = w
                break
            quiet = 0
        except Exception:                           # no answer, or the port went away with the reboot
            quiet += 1
            if quiet % 3 == 0:                      # the ports of before the reboot may be dead ones
                try:
                    link.reopen()
                except (SystemExit, Exception):
                    pass
    faulthandler.cancel_dump_traceback_later()
    if who is None:
        sys.exit('The unit did not come back within %d s of YES. Check the screen; %s' % (reboot_s,
                 'a RAM boot writes no flash, so once the screen shows no upgrade in progress a power cycle brings its OS back.'
                 if ram else 'recovery is MIDI DIN only.'))
    print('back after %.1f s: build %s, armed %d' % (time.time() - t1, who['label'], who['armed']))
    if 'boot' in who:
        print('boot: %d (%s), SRAM probe crc %s' % (who['boot'], who['boot_text'], who['depack_crc']))
    if ram and who.get('diag') == '00000000' and 'set_crc' in who:
        # A release base has no RAM boot and sends its fields as 0: only its set identity tells what runs.
        print('the unit runs a release base, which does not report a RAM boot: set identity %s, %d bytes '
              '(link-image.mjs printed the image\'s as run); a power cycle brings the flash, %s, back'
              % (who['set_crc'], who['set_bytes'], who['label']))
    elif ram:
        # Stock shows the label of the image in the flash, whatever runs: the base reports
        # the unpacked CRC32 of the image it entered from RAM.
        if who.get('boot') != 1:
            if who['label'] != was:
                sys.exit('NOT booted from RAM, and the flash WAS WRITTEN: the unit runs %s from its flash (it held %s).'
                         % (who['label'], was))
            sys.exit('Not booted from RAM: the unit runs %s from its flash, whose label is unchanged '
                     '(a write of an image with that same label would not show here).' % who['label'])
        if who.get('image_crc') != '%08x' % args[1]:
            sys.exit('Booted from RAM, but image %s, not %08x.' % (who.get('image_crc'), args[1]))
        print('runs %s from RAM (image crc %s); the flash still holds %s, and the unit shows that label'
              % (label, who['image_crc'], who['label']))
    elif who['label'] != label:
        sys.exit('The unit runs %s, not %s.' % (who['label'], label))


# ---- the runtime loader over the link (every base; base/modules.c, the Model:Cycles' transport and its mc_link.py) ----
WIRE = dict(hello=0, enter=1, begin=2, chunk=3, verify=4, commit=5, accept=6, rollback=7, abort=8, leave=9)
RESULTS = ['ok', 'state', 'unsafe (playing?)', 'identity', 'limit (too large)', 'stale', 'length', 'conflict', 'hash',
           'rejected', 'backend', 'needs recovery', 'progress']
PHASES = ['normal', 'ready', 'receiving', 'verified', 'pending', 'trial', 'recovery', 'publishing']
REFUSALS = ['none', 'malformed', 'memory', 'conflict', 'full', 'busy', 'cycles', 'in use', 'stock bytes differ',
            'event site', 'feature', 'UI open', 'buffer']
PART_BYTES, CHUNK = 96, 2048


def pack7(data):
    out = bytearray()
    for i in range(0, len(data), 7):
        group = data[i:i + 7]
        out.append(sum(0x40 >> k for k, b in enumerate(group) if b & 0x80))
        out += bytes(b & 0x7f for b in group)
    return bytes(out)


def loader_frame(link, command, transaction, session, body=b''):
    """One upload-controller request in parts (up_part), then up_run; its 144-byte response, decoded."""
    req = b'MWUP' + struct.pack('>HHII', 1, WIRE[command], transaction, len(body)) + session + body
    for at in range(0, len(req), PART_BYTES):
        status, _ = link.call('up_part_raw', at, pack7(req[at:at + PART_BYTES]))
        if status:
            raise RuntimeError('unit: %s (a base without the loader?)' % STATUS.get(status, status))
    status, p = link.call('up_run', len(req), timeout=10)
    if status:
        raise RuntimeError('unit: %s, no response to %s' % (STATUS.get(status, status), command))
    r = unpack7(p)[:144]
    if r[:4] != b'MWUR':
        raise RuntimeError('unit: not a controller response')
    f = struct.unpack('>8I', r[16:48])
    return dict(result=f[0], phase=f[1], known=f[2], generation=f[3], last=f[4], current=f[5], received=f[6],
                capacity=f[7], base=r[48:80], session=r[80:112], active=r[112:144])


def loader_must(link, command, transaction, session, body=b''):
    r = loader_frame(link, command, transaction, session, body)
    if r['result'] not in (0, 12):
        raise RuntimeError('%s: %s (phase %s)' % (command, RESULTS[r['result']] if r['result'] < len(RESULTS) else r['result'],
                                                   PHASES[r['phase']] if r['phase'] < len(PHASES) else r['phase']))
    return r


def loader_mods(link):
    """The pool and the live modules: (free, largest, refusal, [(id, name)])."""
    first, live = 0, []
    while True:
        status, p = link.call('mods', first)
        if status:
            raise RuntimeError('unit: %s (a base without the loader?)' % STATUS.get(status, status))
        head = unpack7(p)
        free, largest, refusal, active = struct.unpack('>4I', head[:16])
        n = head[19]
        for i in range(n):
            e = head[20 + 24 * i:44 + 24 * i]
            live.append(('%08x' % struct.unpack('>I', e[4:8])[0], e[8:24].split(b'\0')[0].decode('ascii', 'replace')))
        if n < 3 or len(live) >= active:
            return free, largest, REFUSALS[refusal] if refusal < len(REFUSALS) else refusal, live
        first += n


def loader_finish(link, keep):
    r = loader_frame(link, 'hello', 0, bytes(32))
    session, t = r['session'], r['current'] or r['last']
    if PHASES[r['phase']] != 'trial':
        raise RuntimeError('nothing on trial (phase %s)' % PHASES[r['phase']])
    loader_must(link, 'enter', 0, session)
    loader_must(link, 'accept' if keep else 'rollback', t, session)
    r = loader_must(link, 'leave', t, session)
    return '%s: phase %s, generation %d' % ('kept' if keep else 'undone', PHASES[r['phase']], r['generation'])


def empty_package(name):
    """No image, hooks or sites under the module's id (the first four bytes of the SHA-256 of its name): removal."""
    import hashlib
    return b'MWRM' + struct.pack('>HH6I', 4, 0, 0, 0, 0, 0, 0, int.from_bytes(hashlib.sha256(name.encode()).digest()[:4], 'big'))


def loader_try(link, pkg, seconds, keep):
    """pkg on trial: begin, chunks, verify, commit; a request a second (ten quiet seconds undo it); then keep or undo."""
    import hashlib
    r = loader_frame(link, 'hello', 0, bytes(32))
    session = r['session']
    if PHASES[r['phase']] != 'normal':
        raise RuntimeError('the loader is busy (phase %s): wait 10 s, or rytm_link.py undo' % PHASES[r['phase']])
    crc = int(link.ident()['set_crc'], 16)
    if r['base'] != hashlib.sha256(crc.to_bytes(4, 'big')).digest():
        raise RuntimeError("the unit's base identity does not match its set CRC %#x" % crc)
    t = r['last'] + 1
    loader_must(link, 'enter', 0, session)
    loader_must(link, 'begin', t, session, r['base'] + hashlib.sha256(pkg).digest() + struct.pack('>II', r['generation'], len(pkg)))
    for at in range(0, len(pkg), CHUNK):
        loader_must(link, 'chunk', t, session, struct.pack('>I', at) + pkg[at:at + CHUNK])
    loader_must(link, 'verify', t, session)
    while loader_must(link, 'commit', t, session)['result'] == 12:
        pass
    loader_must(link, 'leave', t, session)
    print('on trial for %g s (%d bytes)' % (seconds, len(pkg)), flush=True)
    end = time.time() + seconds
    while time.time() < end:
        time.sleep(1)
        loader_frame(link, 'hello', 0, bytes(32))
    return loader_finish(link, keep)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--port', help='MIDI port name part (default: Analog Rytm)')
    sub = ap.add_subparsers(dest='cmd', required=True)
    sub.add_parser('ident')
    s = sub.add_parser('screen')
    s.add_argument('--png')
    s.add_argument('--ascii', action='store_true')
    s = sub.add_parser('mem')
    s.add_argument('addr', type=lambda v: int(v, 0))
    s.add_argument('count', type=lambda v: int(v, 0))
    s = sub.add_parser('steps')
    s.add_argument('text')
    sub.add_parser('disarm')
    s = sub.add_parser('diag', help="what a development base's RAM boot gate found at the last boot")
    s.add_argument('image', nargs='?', help='the image last uploaded, to compare the upload CRCs with')
    sub.add_parser('load', help='the audio load (every base)')
    s = sub.add_parser('try', help='a runtime package on trial (every base)')
    s.add_argument('package')
    s.add_argument('--seconds', type=float, default=20)
    s.add_argument('--keep', action='store_true')
    s = sub.add_parser('remove', help='take a module out, on trial')
    s.add_argument('name')
    s.add_argument('--seconds', type=float, default=5)
    s.add_argument('--keep', action='store_true')
    sub.add_parser('mods', help='the module pool and the live modules')
    sub.add_parser('keep', help='keep the module set on trial until the next power cycle')
    sub.add_parser('undo', help='put the previous module set back')
    s = sub.add_parser('log', help='the diagnostics log (every base)')
    s.add_argument('--json', help='write it as JSON here')
    s.add_argument('--raw', help='write its bytes here')
    sub.add_parser('release')
    s = sub.add_parser('flash')
    s.add_argument('image')
    s.add_argument('--label', required=True, help='the 4-character build the unit must run after')
    s = sub.add_parser('ramboot')
    s.add_argument('image')
    s.add_argument('--label', required=True, help="the build's name, for the report (the image is checked by its CRC)")
    s = sub.add_parser('ramboot-args')
    s.add_argument('image')
    s = sub.add_parser('encode')
    s.add_argument('name', choices=sorted(CMD))
    s.add_argument('values', nargs='*', type=lambda v: int(v, 0))
    s.add_argument('--seq', type=int, default=1)
    s = sub.add_parser('decode')
    s.add_argument('file')
    s.add_argument('--png-dir')
    s = sub.add_parser('upgrade-stream')
    s.add_argument('image')
    s.add_argument('out')
    a = ap.parse_args()

    if a.cmd == 'encode':
        print(request(a.seq, a.name, *a.values).hex())
        return
    if a.cmd == 'ramboot-args':
        print(' '.join('%#x' % v for v in ramboot_args(open(a.image, 'rb').read())))
        return
    if a.cmd == 'upgrade-stream':
        with open(a.out, 'wb') as f:
            for _, req in ek_upgrade_messages(open(a.image, 'rb').read()):
                f.write(req)
        return
    if a.cmd == 'decode':
        data = open(a.file, 'rb').read()
        i = n = 0
        first = bytes(512)
        log_bytes = bytearray()
        while (s := data.find(b'\xF0', i)) != -1:
            e = data.find(b'\xF7', s)
            if e < 0:
                break
            msg, i = data[s:e + 1], e + 1
            r = parse(msg)
            if r:
                seq, cmd, status, p = r
                name = {v: k for k, v in CMD.items()}.get(cmd, hex(cmd))
                extra = ''
                if name == 'ident' and not status:
                    extra = ident_text(p)
                elif name == 'screen' and not status:
                    off = get32(p, 0)
                    half = unpack7(p[5:])[:512]
                    if off == 0:
                        first = half
                        extra = '(first half)'
                    else:
                        rows = frame_rows(first + half)
                        extra = '\n' + ascii_art(rows)
                        if a.png_dir:
                            write_png(rows, '%s/screen-%02d.png' % (a.png_dir, n))
                            n += 1
                elif name == 'mem' and not status:
                    extra = '%#x: %s' % (get32(p, 0), unpack7(p[5:]).hex(' '))
                elif name == 'load' and not status:
                    extra = load_text(p)
                elif name == 'diaglog' and not status:
                    extra = 'the log at %#x, %d bytes' % (get32(p, 0), get32(p, 5))
                elif name == 'log' and not status:
                    at, count = get32(p, 0), get32(p, 5)
                    log_bytes[at:at + count] = unpack7(p[10:])[:count]
                    extra = '%d bytes at %d' % (count, at)
                print('seq %d %s: %s %s' % (seq, name, STATUS.get(status, status), extra))
            elif msg.startswith(EK_HEADER):
                d = ek_decode(msg)
                print('elektron seq %d cmd %#x: %s' % (d[0] << 8 | d[1], d[4], d[5:17].hex(' ')))
        if len(log_bytes) >= 40 + 92 + 32 * 96 + 92 * 32:  # the whole log was read: print it
            import json
            print(json.dumps(log_text(bytes(log_bytes)), indent=1))
        return

    link = Link(a.port)
    if a.cmd == 'ident':
        for k, v in link.ident().items():
            print('%s: %s' % (k, v))
    elif a.cmd == 'screen':
        rows = frame_rows(link.screen())
        if a.png:
            write_png(rows, a.png)
        if a.ascii or not a.png:
            print(ascii_art(rows))
    elif a.cmd == 'mem':
        print(link.mem(a.addr, a.count).hex(' '))
    elif a.cmd in ('try', 'remove'):
        pkg = open(a.package, 'rb').read() if a.cmd == 'try' else empty_package(a.name)
        print(loader_try(link, pkg, a.seconds, a.keep))
        a.cmd = 'mods'
    if a.cmd == 'mods':
        free, largest, refusal, live = loader_mods(link)
        print('pool: %d bytes free, largest run %d; live modules: %d; last refusal: %s' % (free, largest, len(live), refusal))
        for ident, name in live:
            print('  module %s  %s' % (ident, name or '(no name)'))
    elif a.cmd in ('keep', 'undo'):
        print(loader_finish(link, a.cmd == 'keep'))
    elif a.cmd == 'load':
        for k, v in link.load().items():
            print('%s: %s' % (k, v))
    elif a.cmd == 'log':
        import json
        raw = link.log()
        if a.raw:
            Path(a.raw).write_bytes(raw)
        text = json.dumps(log_text(raw), indent=1)
        if a.json:
            Path(a.json).write_text(text + '\n')
        else:
            print(text)
    elif a.cmd == 'diag':
        at = int(link.ident().get('diag', '%x' % DIAG_OLD), 16)
        if not at:
            sys.exit('diag: this base has no RAM boot (a release base); the diagnostics log is `log`')
        print(diag_text(link.mem(at, 60), open(a.image, 'rb').read() if a.image else None))
    elif a.cmd == 'steps':
        try:
            run_steps(link, a.text)
        except BaseException:
            try:                                    # a step failed: leave no key held on the unit
                link.release_keys()
            except Exception:
                pass
            raise
    elif a.cmd == 'disarm':
        link.ok('disarm')
    elif a.cmd == 'release':
        link.ok('release')
    elif a.cmd == 'flash':
        flash(link, a.image, a.label)
    elif a.cmd == 'ramboot':
        flash(link, a.image, a.label, ram=True)


if __name__ == '__main__':
    # Leave without closing the MIDI ports: with messages still arriving (the unit's clock),
    # rtmidi's close at interpreter exit waits on its input thread, which waits on Python.
    code = 0
    try:
        main()
    except SystemExit as e:
        code = e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
        if isinstance(e.code, str):
            print(e.code, file=sys.stderr)
    except BaseException:
        import traceback
        traceback.print_exc()
        code = 1
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(code)
