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
    dn2_link.py ramboot IMAGE.syx    # armed: upload, then boot it from RAM without writing the flash (LINK.md)
    dn2_link.py bootdiag             # what the boot gate found at the last start, and how far a RAM boot came
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
CMD = {'ident': 0x01, 'disarm': 0x02, 'key': 0x10, 'enc': 0x11, 'release': 0x12, 'mem': 0x21, 'diag': 0x22, 'freeze': 0x23, 'ramboot': 0x14}
STATUS = {0: 'ok', 1: 'not armed (SETTINGS > REMOTE CTRL)', 2: 'bad request', 3: 'busy', 4: 'out of range',
          5: 'a person is at the unit', 6: 'an OS upload waits at UPGRADE OS NOW?: confirm it at the unit',
          7: 'no UPGRADE OS NOW? waits for this upload: nothing pressed'}
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


# The boot gate's limits (link.c): the unpacked OS ends below the mailbox at 0x4038bec0, and the container fits the
# copy at 0x47000000 below the mod area.
IMAGE_MAX, CONTAINER_MAX = 0x38bac0, 0x300000
BOOT_STATUS = {0: 'the flashed OS, no RAM boot asked', 1: 'booted from RAM', 2: 'a mailbox, but not after a software reset',
               3: "the mailbox's check word", 4: 'lengths out of bounds', 5: "the copied container's CRC",
               6: 'no MAIN OS section', 8: 'the unpacked image was wrong (reset, flashed OS)'}
STAGES = {1: 'the command was taken', 2: "stock's job reached the flash call", 3: "stock's wait returned",
          4: 'the drain returned', 5: 'the data cache was off', 6: 'the container was copied'}


def rytm_link():
    import importlib.util
    from pathlib import Path
    spec = importlib.util.spec_from_file_location(
        'rytm_link', Path(__file__).resolve().parents[2] / 'analog-rytm-mkii/tools/rytm_link.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def ramboot_args(syx):
    """(unpacked length, CRC32, container length, CRC32) of the image's MAIN OS, as the Rytm link computes them,
    refused where the Digitone II's gate would refuse it."""
    ulen, ucrc, clen, ccrc = rytm_link().ramboot_args(syx)
    if ulen > IMAGE_MAX or clen > CONTAINER_MAX:
        raise ValueError('the image unpacks to %d bytes (limit %d) from a %d-byte container (limit %d)'
                         % (ulen, IMAGE_MAX, clen, CONTAINER_MAX))
    return ulen, ucrc, clen, ccrc


BOOT_RAM = 1


def ramboot_result(v, want_crc):
    """(success, message) from an ident reply's values after a RAM boot: success only for status 1 (booted from RAM)
    with the image CRC asked for. A fallback to the flashed OS, a short reply or another CRC is a failure."""
    if len(v) < 11:
        return False, 'the unit answered without a boot status (%d values): not a RAM boot' % len(v)
    message = 'boot status %d: %s; image crc %08x (wanted %08x)' % (v[9], BOOT_STATUS.get(v[9], '?'), v[10], want_crc)
    return v[9] == BOOT_RAM and v[10] == want_crc, message


def ask_ident_once(port):
    """ident's values, or None when nothing (or a refusal) came back within a second."""
    line = MidiLine(port)
    try:
        _, _, status, p = exchange(line, 'ident', timeout=1.0)
    except LinkError:
        return None
    finally:
        line.close()
    return None if status else [get32(p, 5 * i) for i in range(len(p) // 5)]


def wait_ramboot(want_crc, ident, tries=60, pause=1.0):
    """Wait for the unit after a RAM boot's reset: (success, message), success only as ramboot_result says."""
    for _ in range(tries):
        try:
            v = ident()
        except SystemExit:
            v = None
        if v is None:
            time.sleep(pause)
            continue
        return ramboot_result(v, want_crc)
    return False, 'The unit did not answer within a minute after the reset; power cycle it to get the flashed OS back.'


def upload(syx, port):
    """Stock's OS upgrade over USB (os-upgrade.ts's messages): returns once the unit asks UPGRADE OS NOW?."""
    import mido
    rl = rytm_link()
    pick = lambda names: [n for n in names if port.lower() in n.lower()]
    msgs = rl.ek_upgrade_messages(syx)
    with mido.open_input(pick(mido.get_input_names())[0]) as inp, mido.open_output(pick(mido.get_output_names())[0]) as out:
        for _ in inp.iter_pending():
            pass
        for i, (seq, req) in enumerate(msgs):
            out.send(mido.Message('sysex', data=req[1:-1]))
            reply, end = None, time.time() + 10
            while reply is None and time.time() < end:
                m = inp.poll()
                if m is None:
                    time.sleep(0.001)
                    continue
                if m.type == 'sysex' and bytes(m.data[:5]) == rl.EK_HEADER[1:]:
                    d = rl.ek_decode(bytes([0xF0]) + bytes(m.data) + b'\xF7')
                    if len(d) > (9 if i else 5) and (d[2] << 8 | d[3]) == seq and d[4] == (0xD0 if i == 0 else 0xD1):
                        reply = d
            if reply is None:
                sys.exit('No answer to upgrade message %d of %d: the unit stays on its OS.' % (i + 1, len(msgs)))
            status = reply[5] if i == 0 else reply[9]
            if (i == 0 and status) or status > 1:
                sys.exit('The unit refused message %d (status %d): it stays on its OS.' % (i + 1, status))
            if i and status == 1:
                if i != len(msgs) - 1:
                    sys.exit('The unit said done early; nothing confirmed.')
                return
    sys.exit('The unit never said the upload was complete; nothing confirmed.')


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
    sub.add_parser('ramboot').add_argument('image')
    sub.add_parser('bootdiag')
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
    if a.cmd == 'ramboot':
        syx = open(a.image, 'rb').read()
        args = ramboot_args(syx)
        print('image: unpacked %d bytes, crc %08x; container %d bytes, crc %08x' % args)
        upload(syx, a.port)
        print('uploaded; asking for a RAM boot (the base presses YES; nothing is written to the flash)')
        time.sleep(0.5)
        ok('ramboot', *args, port=a.port)
        time.sleep(8)
        good, message = wait_ramboot(args[1], lambda: ask_ident_once(a.port))
        print(message) if good else sys.exit(message)
        return
    if a.cmd == 'bootdiag':
        _, _, status, p = ask('ident', port=a.port)
        v = [get32(p, 5 * i) for i in range(len(p) // 5)]
        at = v[11]
        d = [int.from_bytes(mem(at + 4 * i, 4, a.port), 'big') for i in range(15)]
        print('boot status %d: %s' % (v[9], BOOT_STATUS.get(v[9], '?')))
        print('mailbox as found: ' + ' '.join('%08x' % w for w in d[:8]))
        print('staged struct: ' + ' '.join('%08x' % w for w in d[8:12]))
        print('marks: %08x %08x (%s); RSR %02x' % (d[12], d[13], STAGES.get(d[13] & 0xff, 'none') if d[13] >> 8 == 0x4d5754 else 'none', d[14] & 0xff))
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
        if len(v) >= 11:
            line += '; boot %d (%s), image crc %08x' % (v[9], BOOT_STATUS.get(v[9], '?'), v[10])
        print(line)
    else:
        print('%08x: %s' % (a.addr, mem(a.addr, a.n, a.port).hex()))


if __name__ == '__main__':
    main()
