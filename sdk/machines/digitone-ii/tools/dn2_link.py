#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""The Digitone II development link's host, stage one: read-only (sdk/machines/digitone-ii/elekloader/base/link.c).

    dn2_link.py ident                # link version, messages received and dropped, ticks
    dn2_link.py mem 0x47f00000 64    # up to 128 bytes of DDR or SRAM, as hex
    dn2_link.py screen [--png F]     # the frame on the screen, as text (and a PNG), read through mem

Needs a development base on the unit (npm run machine:base -- digitone-ii --dev) and mido with a MIDI backend.
The wire format is the Analog Rytm MKII link's (sdk/machines/analog-rytm-mkii/LINK.md)."""
import argparse
import binascii
import struct
import sys
import time
import zlib

HEADER = bytes([0xF0, 0x7D, ord('M'), ord('W'), ord('L'), 1])
CMD = {'ident': 0x01, 'mem': 0x21}
STATUS = {0: 'ok', 2: 'bad request', 4: 'out of range'}


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


def ask(name, *values, port='Digitone II', timeout=2.0):
    import mido
    pick = lambda names: [n for n in names if port.lower() in n.lower()]
    ins, outs = pick(mido.get_input_names()), pick(mido.get_output_names())
    if len(ins) != 1 or len(outs) != 1:
        sys.exit('Need exactly one MIDI input and output named like %r.' % port)
    with mido.open_input(ins[0]) as inp, mido.open_output(outs[0]) as out:
        for _ in inp.iter_pending():
            pass
        seq = int(time.time() * 10) & 0x7f
        out.send(mido.Message('sysex', data=request(seq, name, *values)[1:-1]))
        end = time.time() + timeout
        while time.time() < end:
            m = inp.poll()
            if m is None:
                time.sleep(0.002)
                continue
            if m.type == 'sysex':
                got = parse(bytes([0xF0]) + bytes(m.data) + b'\xF7')
                if got and got[0] == seq and got[1] == CMD[name]:
                    return got
    sys.exit('No answer: is a development base with the link on the unit, and USB MIDI connected?')


def mem(addr, n, port):
    _, _, status, p = ask('mem', addr, n, port=port)
    if status:
        sys.exit('refused: ' + STATUS.get(status, str(status)))
    return unpack7(p[5:])[:n]


def screen(port):
    """The frame on the screen: its pointer, then the frame in eight reads (a draw between them can tear it)."""
    front = int.from_bytes(mem(FRAME_POINTERS + 4, 4, port), 'big')
    return b''.join(mem(front + at, 128, port) for at in range(0, FRAME_BYTES, 128))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--port', default='Digitone II')
    sub = parser.add_subparsers(dest='cmd', required=True)
    sub.add_parser('ident')
    mem = sub.add_parser('mem')
    mem.add_argument('addr', type=lambda s: int(s, 0))
    mem.add_argument('n', type=int)
    shot = sub.add_parser('screen')
    shot.add_argument('--png', help='also write the frame as a PNG here')
    a = parser.parse_args()
    if a.cmd == 'screen':
        rows = frame_rows(screen(a.port))
        print(ascii_art(rows))
        if a.png:
            open(a.png, 'wb').write(png(rows))
        return
    if a.cmd == 'ident':
        _, _, status, p = ask('ident', port=a.port)
        if status:
            sys.exit('refused: ' + STATUS.get(status, str(status)))
        print('link %d, received %d, dropped %d, ticks %d' % tuple(get32(p, 5 * i) for i in range(4)))
    else:
        _, _, status, p = ask('mem', a.addr, a.n, port=a.port)
        if status:
            sys.exit('refused: ' + STATUS.get(status, str(status)))
        print('%08x: %s' % (get32(p, 0), unpack7(p[5:])[:a.n].hex()))


if __name__ == '__main__':
    main()
