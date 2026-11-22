#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""The Digitone II development link's host (sdk/machines/digitone-ii/elekloader/base/link.c).

    dn2_link.py ident                # link version, messages received and dropped, ticks
    dn2_link.py mem 0x47f00000 64    # up to 128 bytes of DDR or SRAM, as hex
    dn2_link.py screen [--png F]     # the frame on the screen, as text (and a PNG), read through mem
    dn2_link.py press KEY [KEY...]   # press and let go, one after the other (dn2_link.py keys lists them, or an id)
    dn2_link.py hold KEY / let KEY   # press, or let go of, one key (FUNC + TRIG: hold FUNC, press TRIG1, let FUNC)
    dn2_link.py turn ENC DELTA       # an encoder (A-H, LEVEL) by DELTA detents, up to 8 a message
    dn2_link.py release / disarm     # let go of every key the link holds / and turn the arm off
    dn2_link.py diag [--save F]      # the diagnostics log (the Octatrack's layout): where it is, and its bytes into F
    dn2_link.py freeze SECONDS       # armed: the UI stands still that long (audio goes on), to test FREEZE logging
Keys and turns need SETTINGS > REMOTE CTRL on (it is at every boot); a person at the panel stops them for 3 s.

Needs a development base on the unit (npm run machine:base -- digitone-ii --dev) and mido with a MIDI backend.
The wire format is the Analog Rytm MKII link's (sdk/machines/analog-rytm-mkii/LINK.md)."""
import argparse
import binascii
import struct
import sys
import time
import zlib

HEADER = bytes([0xF0, 0x7D, ord('M'), ord('W'), ord('L'), 1])
CMD = {'ident': 0x01, 'disarm': 0x02, 'key': 0x10, 'enc': 0x11, 'release': 0x12, 'mem': 0x21, 'diag': 0x22, 'freeze': 0x23}
STATUS = {0: 'ok', 1: 'not armed (SETTINGS > REMOTE CTRL)', 2: 'bad request', 3: 'busy', 4: 'out of range',
          5: 'a person is at the unit', 6: 'an OS upload waits at UPGRADE OS NOW?: confirm it at the unit'}
# Panel key ids and encoders as stock's messages carry them (OS 1.12, seen on a unit).
KEYS = {'TRIGPAGE': 0x01, 'SYN': 0x02, 'FLTR': 0x03, 'AMP': 0x04, 'FX': 0x05, 'MOD': 0x06, 'PERFORM': 0x07,
        'SAVEPROJ': 0x08, 'TAPTEMPO': 0x09, 'UNISON': 0x32, 'YES': 0x0a, 'UP': 0x0b, 'NO': 0x0c, 'LEFT': 0x0d, 'DOWN': 0x0e, 'RIGHT': 0x0f, 'TRK': 0x10, 'FUNC': 0x11,
        'KBSETUP': 0x12, 'REC': 0x13, 'PLAY': 0x14, 'STOP': 0x15, 'PAGE': 0x16, 'PTN': 0x17, 'SONG': 0x18,
        'ARP': 0x33, 'TRANSPOSE+': 0x34, 'NOTEEDIT': 0x35, 'TRANSPOSE-': 0x36,
        **{'TRIG%d' % (i + 1): 0x19 + i for i in range(16)}}
# Not pressed alone on a unit: an encoder's push, which stock reads as is_key_held(encoder + 40) when a turn arrives.
KEYS.update({'PUSH' + name: number + 40 for name, number in {**{chr(ord('A') + i): i + 1 for i in range(8)}, 'LEVEL': 9}.items()})
ENCODERS = {**{chr(ord('A') + i): i + 1 for i in range(8)}, 'LEVEL': 9}
DOWN, RELEASE = 0x01, 0x10


def u32(v):
    return bytes((v >> (7 * i)) & 0x7f for i in range(5))


def get32(b, at):
    return b[at] | b[at + 1] << 7 | b[at + 2] << 14 | b[at + 3] << 21 | (b[at + 4] & 0x0f) << 28


def unpack7(b):
    out = bytearray()
    for i in range(0, len(b), 8):
        top = b[i]
        for k, c in enumerate(b[i + 1:i + 8]):
            out.append(c | (0x80 if top & (0x40 >> k) else 0))
    return bytes(out)


# Stock keeps two frame pointers side by side (OS 1.12): it sends the one it drew (0x402a10c8) to the display, then
# swaps them (0x40131fd2), so the frame on the screen is the second. A frame is 128x64 pixels, 1 bit each, 1024 bytes.
FRAME_POINTERS = 0x402a10c8
FRAME_BYTES = 1024


def frame_rows(fb):
    """The 1024-byte frame as 64 rows of 128 pixels, top row first (the Analog Rytm MKII's layout)."""
    return [[(fb[(7 - y // 8) + 8 * x] >> (y % 8)) & 1 for x in range(128)] for y in range(64)]


def ascii_art(rows):
    chars = {(1, 1): '\u2588', (1, 0): '\u2580', (0, 1): '\u2584', (0, 0): ' '}
    return '\n'.join(''.join(chars[(a, b)] for a, b in zip(rows[y], rows[y + 1])) for y in range(0, len(rows), 2))


def png(rows, scale=3):
    raw = b''.join((bytes([0]) + bytes(255 if px else 0 for px in row for _ in range(scale))) * scale for row in rows)
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', binascii.crc32(t + d) & 0xffffffff)
    head = struct.pack('>IIBBBBB', len(rows[0]) * scale, len(rows) * scale, 8, 0, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', head) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')


def request(seq, name, *values):
    return HEADER + bytes([seq & 0x7f, CMD[name]]) + b''.join(u32(v) for v in values) + b'\xF7'


def parse(msg):
    """A reply's (seq, cmd, status, payload) or None."""
    if len(msg) < len(HEADER) + 4 or msg[:len(HEADER)] != HEADER or msg[-1] != 0xF7 or not msg[len(HEADER) + 1] & 0x40:
        return None
    return msg[6], msg[7] & 0x3f, msg[8], msg[9:-1]


class LinkError(Exception):
    """No acceptable reply: the caller decides whether that ends the command."""


# The sequence number: advanced for every request, so a late reply to an earlier one (this run or the last) never
# matches the current one. Seeded from the clock so two runs in a row start apart.
_seq = [int(time.time() * 10)]


class MidiLine:
    """The unit's USB MIDI pair, through mido."""

    def __init__(self, port):
        import mido
        self.mido = mido
        pick = lambda names: [n for n in names if port.lower() in n.lower()]
        ins, outs = pick(mido.get_input_names()), pick(mido.get_output_names())
        if len(ins) != 1 or len(outs) != 1:
            sys.exit('Need exactly one MIDI input and output named like %r.' % port)
        self.inp, self.out = mido.open_input(ins[0]), mido.open_output(outs[0])

    def drain(self):
        for _ in self.inp.iter_pending():
            pass

    def send(self, frame):
        self.out.send(self.mido.Message('sysex', data=frame[1:-1]))

    def poll(self):
        """The next SysEx message as F0..F7 bytes, or None."""
        m = self.inp.poll()
        while m is not None and m.type != 'sysex':
            m = self.inp.poll()
        return None if m is None else bytes([0xF0]) + bytes(m.data) + b'\xF7'

    def close(self):
        self.inp.close()
        self.out.close()


def exchange(line, name, *values, timeout=2.0, accept=None):
    """Send one request on line and return the first reply with its sequence number, its command and, if given,
    accept(reply) true. Anything else (a late reply to an earlier request, a short reply) is skipped."""
    _seq[0] += 1
    seq = _seq[0] & 0x7f
    line.drain()
    line.send(request(seq, name, *values))
    end = time.time() + timeout
    while time.time() < end:
        msg = line.poll()
        if msg is None:
            time.sleep(0.002)
            continue
        got = parse(msg)
        if got and got[0] == seq and got[1] == CMD[name] and (accept is None or accept(got)):
            return got
    raise LinkError('No answer: is a development base with the link on the unit, and USB MIDI connected?')


def ask(name, *values, port='Digitone II', timeout=2.0, accept=None, line=None):
    own = line is None
    line = MidiLine(port) if own else line
    try:
        return exchange(line, name, *values, timeout=timeout, accept=accept)
    except LinkError as e:
        sys.exit(str(e))
    finally:
        if own:
            line.close()


def packed_len(n):
    """The length of n bytes packed 7 in 8, as link.c's pack() writes them."""
    return n + (n + 6) // 7


def mem_reply_fits(addr, n):
    """A mem reply is this request's only if it echoes addr and carries exactly n bytes (or is a refusal)."""
    def fits(got):
        _, _, status, p = got
        if status:
            return True
        return len(p) == 5 + packed_len(n) and get32(p, 0) == addr
    return fits


def mem(addr, n, port, line=None):
    _, _, status, p = ask('mem', addr, n, port=port, accept=mem_reply_fits(addr, n), line=line)
    if status:
        sys.exit('refused: ' + STATUS.get(status, str(status)))
    return unpack7(p[5:])[:n]


def screen(port, line=None):
    """The frame on the screen: its pointer, then the frame in eight reads (a draw between them can tear it)."""
    own = line is None
    line = MidiLine(port) if own else line
    try:
        front = int.from_bytes(mem(FRAME_POINTERS + 4, 4, port, line), 'big')
        return b''.join(mem(front + at, 128, port, line) for at in range(0, FRAME_BYTES, 128))
    finally:
        if own:
            line.close()


def ok(name, *values, port):
    _, _, status, p = ask(name, *values, port=port)
    if status:
        sys.exit('%s: %s' % (name, STATUS.get(status, str(status))))
    return p


def key_id(name):
    return KEYS[name.upper()] if name.upper() in KEYS else int(name, 0)


def save_log(at, size, path, port, line=None):
    """The log's size bytes from at into path, only when every chunk came back whole (mem checks each reply): the file
    is written beside path and renamed over it, so a failed read leaves an earlier capture as it was."""
    import os
    import tempfile
    own = line is None
    line = MidiLine(port) if own else line
    try:
        data = b''.join(mem(at + o, min(128, size - o), port, line) for o in range(0, size, 128))
    finally:
        if own:
            line.close()
    if len(data) != size:
        sys.exit('the log came back %d bytes of %d: nothing saved' % (len(data), size))
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(os.path.abspath(path)), prefix='.dn2-diag-')
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(data)
        os.replace(tmp, path)
    except BaseException:
        os.unlink(tmp)
        raise
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--port', default='Digitone II')
    sub = parser.add_subparsers(dest='cmd', required=True)
    sub.add_parser('ident')
    memory = sub.add_parser('mem')
    memory.add_argument('addr', type=lambda s: int(s, 0))
    memory.add_argument('n', type=int)
    for name in ('press', 'hold', 'let'):
        sub.add_parser(name).add_argument('keys', nargs='+')
    turn = sub.add_parser('turn')
    turn.add_argument('enc')
    turn.add_argument('delta', type=int)
    sub.add_parser('release')
    sub.add_parser('disarm')
    sub.add_parser('keys')
    sub.add_parser('freeze').add_argument('seconds', type=float)
    diag = sub.add_parser('diag')
    diag.add_argument('--save', help='write the log, read through mem, to this file')
    shot = sub.add_parser('screen')
    shot.add_argument('--png', help='also write the frame as a PNG here')
    a = parser.parse_args()
    if a.cmd == 'screen':
        rows = frame_rows(screen(a.port))
        print(ascii_art(rows))
        if a.png:
            open(a.png, 'wb').write(png(rows))
        return
    if a.cmd == 'freeze':
        ok('freeze', int(a.seconds * 1500), port=a.port)
        return
    if a.cmd == 'diag':
        p = ok('diag', port=a.port)
        at, size, frames, ticks = (get32(p, 5 * i) for i in range(4))
        print('log at 0x%08x, %d bytes; %d frames, %d ticks' % (at, size, frames, ticks))
        if a.save:
            save_log(at, size, a.save, a.port)
            print('saved %d bytes to %s' % (size, a.save))
        return
    if a.cmd == 'keys':
        print(' '.join(sorted(KEYS, key=KEYS.get)) + '; encoders ' + ' '.join(ENCODERS))
        return
    if a.cmd in ('press', 'hold', 'let'):
        for name in a.keys:
            if a.cmd != 'let':
                ok('key', key_id(name), DOWN, port=a.port)
            if a.cmd != 'hold':
                time.sleep(0.08)
                ok('key', key_id(name), RELEASE, port=a.port)
            time.sleep(0.15)
        return
    if a.cmd == 'turn':
        enc = ENCODERS[a.enc.upper()] if a.enc.upper() in ENCODERS else int(a.enc, 0)
        left = a.delta                  # in turns of up to 8, as the panel sends a fast turn (it went to 11)
        while left:
            step = max(-8, min(8, left))
            ok('enc', enc, step & 0xffffffff, port=a.port)
            left -= step
            time.sleep(0.06)
        return
    if a.cmd in ('release', 'disarm'):
        ok(a.cmd, port=a.port)
        return
    if a.cmd == 'ident':
        _, _, status, p = ask('ident', port=a.port)
        if status:
            sys.exit('refused: ' + STATUS.get(status, str(status)))
        v = [get32(p, 5 * i) for i in range(len(p) // 5)]
        line = 'link %d, received %d, dropped %d, ticks %d' % tuple(v[:4])
        if len(v) >= 9:
            line += ', armed %d, person %d, presses by a person %d, posted %d, refused %d' % tuple(v[4:9])
        print(line)
    else:
        print('%08x: %s' % (a.addr, mem(a.addr, a.n, a.port).hex()))


if __name__ == '__main__':
    main()
