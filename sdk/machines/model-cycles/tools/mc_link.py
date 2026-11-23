#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Read a Model:Cycles that runs a development base with the link (elekloader/base/link.c).

Talks to the unit over its USB MIDI port (mido with python-rtmidi). The wire format is the Analog Rytm
MKII link's (../analog-rytm-mkii/LINK.md); this link is read-only so far.

    mc_link.py ident
    mc_link.py mem 0x40000400 16
"""
import argparse
import sys
import time

HEADER = bytes([0xF0, 0x7D, ord('M'), ord('W'), ord('L'), 1])
CMD = {'ident': 0x01, 'mem': 0x21}
STATUS = {0: 'ok', 2: 'bad request', 4: 'out of range'}
IDENT = ['link version', 'requests received', 'requests dropped', 'ticks', 'port', 'replies sent', 'send failures']
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
    a = ap.parse_args()
    try:
        import mido
    except ImportError:
        sys.exit('Needs mido and python-rtmidi: python3 -m pip install mido python-rtmidi')
    outs = [n for n in mido.get_output_names() if a.port.lower() in n.lower()]
    ins = [n for n in mido.get_input_names() if a.port.lower() in n.lower()]
    if not outs or not ins:
        sys.exit('No MIDI port matching %r. Outputs: %s' % (a.port, mido.get_output_names()))
    seq = int(time.time()) & 0x7f
    body = list(u32(a.addr) + u32(a.count)) if a.cmd == 'mem' else []
    msg = list(HEADER[1:]) + [seq, CMD[a.cmd]] + body
    with mido.open_input(ins[0]) as inp, mido.open_output(outs[0]) as out:
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
            if a.cmd == 'ident':
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
