#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Read a Model:Cycles that runs a development base with the link (elekloader/base/link.c).

Talks to the unit over its USB MIDI port (mido with python-rtmidi). The wire format is the Analog Rytm
MKII link's (../analog-rytm-mkii/LINK.md); this link is read-only so far.

    mc_link.py ident
    mc_link.py mem 0x40000400 16
    mc_link.py key 2 1          # key code 2 (TRACK) down; 'key 2 0' lets it go
    mc_link.py tap 17           # down and up: TRIG 2 (TRIG n is code 15 + n)
    mc_link.py enc 0 10         # encoder 0 by 10 steps (-30..30)
    mc_link.py release          # let go of every key the link holds
    mc_link.py disarm           # no keys or turns from the host until the next boot

Keys and turns need the link armed (at every boot) and stop for about 3 s after a person presses or turns
something on the panel (status 'a person is at the unit').
"""
import argparse
import sys
import time

HEADER = bytes([0xF0, 0x7D, ord('M'), ord('W'), ord('L'), 1])
CMD = {'ident': 0x01, 'disarm': 0x02, 'key': 0x10, 'enc': 0x11, 'release': 0x12, 'mem': 0x21}
STATUS = {0: 'ok', 1: 'not armed', 2: 'bad request', 3: 'busy', 4: 'out of range', 5: 'a person is at the unit'}
IDENT = ['link version', 'requests received', 'requests dropped', 'ticks', 'port', 'replies sent', 'send failures',
         'armed', 'person at unit', 'person presses', 'posted', 'refused']
PORTS = {1: 'MIDI setting', 2: 'USB', 3: 'DIN', 4: 'USB and DIN'}


def u32(v):
    return [(v >> (7 * i)) & 0x7f for i in range(5)]


def get32(p):
    return p[0] | p[1] << 7 | p[2] << 14 | p[3] << 21 | (p[4] & 0x0f) << 28


def unpack(p, n):
    out = bytearray()
    i = 0
    while len(out) < n:
        top, i = p[i], i + 1
        for k in range(7):
            if len(out) == n:
                break
            out.append(p[i] | (0x80 if top & (0x40 >> k) else 0))
            i += 1
    return bytes(out)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--port', default='Model:Cycles', help='MIDI port name part (default: Model:Cycles)')
    sub = ap.add_subparsers(dest='cmd', required=True)
    sub.add_parser('ident')
    s = sub.add_parser('mem')
    s.add_argument('addr', type=lambda v: int(v, 0))
    s.add_argument('count', type=int)
    s = sub.add_parser('key')
    s.add_argument('id', type=int)
    s.add_argument('flags', type=lambda v: int(v, 0))
    s = sub.add_parser('tap')
    s.add_argument('id', type=int)
    s = sub.add_parser('enc')
    s.add_argument('id', type=int)
    s.add_argument('delta', type=int)
    sub.add_parser('release')
    sub.add_parser('disarm')
    a = ap.parse_args()
    try:
        import mido
    except ImportError:
        sys.exit('Needs mido and python-rtmidi: python3 -m pip install mido python-rtmidi')
    outs = [n for n in mido.get_output_names() if a.port.lower() in n.lower()]
    ins = [n for n in mido.get_input_names() if a.port.lower() in n.lower()]
    if not outs or not ins:
        sys.exit('No MIDI port matching %r. Outputs: %s' % (a.port, mido.get_output_names()))
    if a.cmd == 'tap':
        run(mido, ins[0], outs[0], 'key', u32(a.id) + u32(1), a)
        time.sleep(0.1)
        run(mido, ins[0], outs[0], 'key', u32(a.id) + u32(0), a)
        return
    body = {'mem': lambda: u32(a.addr) + u32(a.count), 'key': lambda: u32(a.id) + u32(a.flags),
            'enc': lambda: u32(a.id) + u32(a.delta & 0xff)}.get(a.cmd, lambda: [])()
    run(mido, ins[0], outs[0], a.cmd, body, a)


def run(mido, in_name, out_name, cmd, body, a):
    seq = int(time.time() * 10) & 0x7f
    msg = list(HEADER[1:]) + [seq, CMD[cmd]] + list(body)
    with mido.open_input(in_name) as inp, mido.open_output(out_name) as out:
        while inp.poll():
            pass
        out.send(mido.Message('sysex', data=msg))
        end = time.time() + 2
        while time.time() < end:
            m = inp.poll()
            if m is None:
                time.sleep(0.005)
                continue
            if m.type != 'sysex' or bytes(m.data[:5]) != HEADER[1:6] or m.data[5] != seq:
                continue
            status, p = m.data[7], list(m.data[8:])
            if status:
                sys.exit('unit: ' + STATUS.get(status, 'status %d' % status))
            if cmd in ('key', 'enc', 'release', 'disarm'):
                print('ok')
            elif cmd == 'ident':
                for i, name in enumerate(IDENT):
                    v = get32(p[5 * i:5 * i + 5])
                    print('%-18s %s' % (name, PORTS.get(v, v) if name == 'port' else v))
            else:
                addr, n = get32(p[0:5]), get32(p[5:10])
                data = unpack(p[10:], n)
                for i in range(0, n, 16):
                    print('%08x  %s' % (addr + i, data[i:i + 16].hex(' ')))
            return
        sys.exit('No reply within 2 s (is a development base with the link on the unit?)')


if __name__ == '__main__':
    main()
