#!/usr/bin/env python3
"""Read Digitakt mk1 memory over USB through digihealth's diagnostics channel.

digihealth answers SysEx device 0x7D on USB with three read-only commands:
HELLO, STATS and PEEK (DDR 0x40000000-0x48000000 and SRAM 0x80000000-0x80010000,
at most 1024 bytes per request). This is a macOS/Linux client for it, for
research: dump a range, change one thing on the unit, dump again, diff.

    dtpeek.py ports
    dtpeek.py hello
    dtpeek.py peek 0x4020bb14 64
    dtpeek.py dump 0x42000000 0x10000 before.bin
    dtpeek.py diff before.bin after.bin [--base 0x42000000]
    dtpeek.py selftest

Needs python-rtmidi. Close Elektron Transfer first. Never commit dumps.
"""
import argparse
import struct
import sys
import time

HDR = bytes([0xF0, 0x00, 0x20, 0x3C, 0x7D, 0x00])
C_HELLO, C_STATS, C_PEEK = 1, 2, 3
PEEK_MAX = 1024
RANGES = [(0x40000000, 0x48000000), (0x80000000, 0x80010000)]


def pack7(data):
    """MidiRpc packing: before each group of up to 7 bytes, a byte whose bit 6-k is byte k's bit 7."""
    out = bytearray()
    for i in range(0, len(data), 7):
        group = data[i:i + 7]
        top = 0
        for k, b in enumerate(group):
            if b & 0x80:
                top |= 0x40 >> k
        out.append(top)
        out.extend(b & 0x7F for b in group)
    return bytes(out)


def unpack7(data):
    out = bytearray()
    i = 0
    while i < len(data):
        top = data[i]
        i += 1
        for k in range(7):
            if i >= len(data):
                break
            out.append(data[i] | (0x80 if top & (0x40 >> k) else 0))
            i += 1
    return bytes(out)


class Channel:
    def __init__(self, match='Digitakt', timeout=1.0):
        import rtmidi
        self.timeout = timeout
        self.midi_in, self.midi_out = rtmidi.MidiIn(), rtmidi.MidiOut()
        self.midi_in.ignore_types(sysex=False)
        self.midi_in.open_port(self._port(self.midi_in, match))
        self.midi_out.open_port(self._port(self.midi_out, match))
        self.seq = 0

    @staticmethod
    def _port(io, match):
        for n, name in enumerate(io.get_ports()):
            if match.lower() in name.lower():
                return n
        sys.exit(f'no MIDI port matching {match!r}: {io.get_ports()}')

    def request(self, cmd, args=b''):
        self.seq = (self.seq + 1) & 0xFFFF
        self.midi_out.send_message(list(HDR + pack7(struct.pack('>HB', self.seq, cmd) + args) + b'\xF7'))
        end = time.monotonic() + self.timeout
        while time.monotonic() < end:
            msg = self.midi_in.get_message()
            if not msg:
                time.sleep(0.001)
                continue
            raw = bytes(msg[0])
            if not raw.startswith(HDR) or raw[-1] != 0xF7:
                continue
            body = unpack7(raw[len(HDR):-1])
            seq, rcmd, status = struct.unpack('>HBB', body[:4])
            if seq == self.seq and rcmd == cmd | 0x80:
                if status:
                    raise RuntimeError(f'command {cmd} refused (status {status})')
                return body[4:]
        raise TimeoutError('no answer: is a digihealth build running, over USB?')

    def hello(self):
        p = self.request(C_HELLO)
        version, seconds = struct.unpack('>HI', p[:6])
        return version, seconds, p[6:].split(b'\0')[0].decode(errors='replace')

    def peek(self, addr, length):
        if not any(lo <= addr and addr + length <= hi for lo, hi in RANGES):
            raise ValueError(f'{addr:#x}+{length:#x} is outside DDR and SRAM')
        out = bytearray()
        while length:
            n = min(length, PEEK_MAX)
            p = self.request(C_PEEK, struct.pack('>IH', addr, n))
            got = struct.unpack('>I', p[:4])[0]
            if got != addr or len(p) - 4 != n:
                raise RuntimeError(f'bad PEEK reply at {addr:#x}')
            out += p[4:]
            addr += n
            length -= n
        return bytes(out)


def hexdump(data, base):
    for i in range(0, len(data), 16):
        row = data[i:i + 16]
        text = ''.join(chr(b) if 32 <= b < 127 else '.' for b in row)
        print(f'{base + i:08x}  {row.hex(" "):<47}  {text}')


def diff(a, b, base):
    """Changed byte runs, merged when within 4 bytes of each other."""
    runs, start, last = [], None, None
    for i in range(min(len(a), len(b))):
        if a[i] != b[i]:
            if start is None or i - last > 4:
                if start is not None:
                    runs.append((start, last + 1))
                start = i
            last = i
    if start is not None:
        runs.append((start, last + 1))
    for s, e in runs:
        print(f'{base + s:08x} +{e - s:<4} {a[s:e].hex(" ")}  ->  {b[s:e].hex(" ")}')
    print(f'{len(runs)} changed run(s)')


def selftest():
    import random
    rng = random.Random(1)
    for n in (0, 1, 6, 7, 8, 13, 14, 15, 1024):
        data = bytes(rng.randrange(256) for _ in range(n))
        packed = pack7(data)
        assert all(b < 0x80 for b in packed) and unpack7(packed) == data, n
    # A HELLO request, sequence 1: the bytes digihealth's unpack7 expects.
    assert pack7(struct.pack('>HB', 1, C_HELLO)) == bytes([0, 0, 1, 1])
    assert pack7(bytes([0x80])) == bytes([0x40, 0x00])
    print('selftest ok')


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--port', default='Digitakt', help='MIDI port name to match')
    sub = ap.add_subparsers(dest='cmd', required=True)
    sub.add_parser('ports')
    sub.add_parser('hello')
    sub.add_parser('selftest')
    p = sub.add_parser('peek')
    p.add_argument('addr', type=lambda s: int(s, 0))
    p.add_argument('length', type=lambda s: int(s, 0))
    p = sub.add_parser('dump')
    p.add_argument('addr', type=lambda s: int(s, 0))
    p.add_argument('length', type=lambda s: int(s, 0))
    p.add_argument('out')
    p = sub.add_parser('diff')
    p.add_argument('a')
    p.add_argument('b')
    p.add_argument('--base', type=lambda s: int(s, 0), default=0)
    args = ap.parse_args()

    if args.cmd == 'selftest':
        return selftest()
    if args.cmd == 'diff':
        return diff(open(args.a, 'rb').read(), open(args.b, 'rb').read(), args.base)
    if args.cmd == 'ports':
        import rtmidi
        print('in: ', rtmidi.MidiIn().get_ports())
        print('out:', rtmidi.MidiOut().get_ports())
        return
    ch = Channel(args.port)
    if args.cmd == 'hello':
        version, seconds, name = ch.hello()
        print(f'{name}: channel version {version}, up {seconds} s')
    elif args.cmd == 'peek':
        hexdump(ch.peek(args.addr, args.length), args.addr)
    elif args.cmd == 'dump':
        data = ch.peek(args.addr, args.length)
        open(args.out, 'wb').write(data)
        print(f'{len(data)} bytes from {args.addr:#x} to {args.out}')


if __name__ == '__main__':
    main()
