#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Read a Model:Cycles that runs a Modwerk base with the link (elekloader/base/link.c), and load modules on it.
Every base answers ident, load, log, mods, try, keep, undo and remove; mem, key, tap, enc, release, disarm and
ramboot need a development base.

Talks to the unit over its USB MIDI port (mido with python-rtmidi). The wire format is the Analog Rytm
MKII link's (../analog-rytm-mkii/LINK.md). Nothing here writes flash.

    mc_link.py ident
    mc_link.py mem 0x40000400 16
    mc_link.py key 2 1          # key code 2 (TRACK) down; 'key 2 0' lets it go
    mc_link.py tap 17           # down and up: TRIG 2 (TRIG n is code 15 + n)
    mc_link.py enc 2 10         # encoder 2 (PITCH) by 10 steps (-30..30)
    mc_link.py release          # let go of every key the link holds
    mc_link.py disarm           # no keys or turns from the host until the next boot
    mc_link.py ramboot IMAGE.syx  # upload with stock's OS upgrade, then boot it from RAM: nothing is flashed
    mc_link.py load               # the audio's share of the CPU: last half second, its dearest block, the dearest since boot
    mc_link.py log [--out FILE]   # the diagnostics log (base/diag.c, the Octatrack's layout): its records; FILE keeps its bytes
    mc_link.py runid IMAGE.syx    # the set identity ident reports for this image (needs IMAGE.syx.json); no unit
    mc_link.py rundiff IMAGE.syx  # read the running .run block and list each word that differs from the image
    mc_link.py mods               # the runtime loader: pool, last refusal, the live modules
    mc_link.py try PKG.mwrm --seconds 20 [--keep]  # load a module to RAM on trial, then undo it (or keep it)
    mc_link.py keep | undo        # within 10 s of a trial's end: keep the set on trial, or put the last one back
    mc_link.py remove NAME --seconds 5 [--keep]  # the module built as NAME.mwrm out, on trial (an empty package)

Loading (base/modules.c) runs the Octatrack's upload controller (sdk/runtime/upload, wire version 1) over the
link: each wire frame goes in parts (UP_PART, under 128 bytes a message), then UP_RUN runs it. Kept modules stay
until the next power cycle; nothing is written to the flash or the +Drive.

Keys and turns need the link armed (at every boot) and stop for about 3 s after a person presses or turns
something on the panel (status 'a person is at the unit').
"""
import argparse
import hashlib
import os
import struct
import sys
import time

HEADER = bytes([0xF0, 0x7D, ord('M'), ord('W'), ord('L'), 1])
CMD = {'ident': 0x01, 'disarm': 0x02, 'key': 0x10, 'enc': 0x11, 'release': 0x12, 'ramboot': 0x14, 'mem': 0x21, 'diag': 0x22, 'load': 0x23, 'log': 0x24}
STATUS = {0: 'ok', 1: 'not armed', 2: 'bad request', 3: 'busy', 4: 'out of range', 5: 'a person is at the unit'}
IDENT = ['link version', 'requests received', 'requests dropped', 'ticks', 'port', 'replies sent', 'send failures',
         'armed', 'person at unit', 'person presses', 'posted', 'refused', 'RAM boot mailbox', 'RAM boot status',
         'RAM boot image CRC', 'set CRC', 'set bytes']
BOOT = {0: 'none', 1: 'booted from RAM', 2: 'mailbox without a software reset', 3: 'check word', 4: 'lengths',
        5: 'container CRC', 6: 'no MAIN OS section', 8: 'failed after the unpack (reset)'}
MAILBOX = {0: 'empty', 0x4d574254: 'asked', 0x4d574255: 'spent', 0x4d574253: 'booted'}
IMAGE_MAX, CONTAINER_MAX = 0x400000, 0x1c0000  # as link.c: the container ends below the OS's stores at 0x1e0000
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
    sub.add_parser('load')
    s = sub.add_parser('log')
    s.add_argument('--out', help='also write the log\'s bytes to this file (keep it outside Git)')
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
    s = sub.add_parser('ramboot')
    s.add_argument('image')
    s = sub.add_parser('runid')
    s.add_argument('image')
    s = sub.add_parser('rundiff')
    s.add_argument('image')
    s.add_argument('--at', type=lambda v: int(v, 0), help='read a copy of the block at this address instead')
    sub.add_parser('mods')
    s = sub.add_parser('try')
    s.add_argument('package')
    s.add_argument('--seconds', type=float, default=20, help='how long the trial runs before the undo (or the keep)')
    s.add_argument('--keep', action='store_true', help='keep the set at the end instead of undoing it')
    s = sub.add_parser('remove')
    s.add_argument('name', help='the module\'s name: the stem its package was built with (hello for hello.mwrm)')
    s.add_argument('--seconds', type=float, default=5)
    s.add_argument('--keep', action='store_true', help='keep the removal at the end instead of undoing it')
    sub.add_parser('keep')
    sub.add_parser('undo')
    a = ap.parse_args()
    if a.cmd == 'runid':
        crc, n = runid(open(a.image, 'rb').read(), json_load(a.image + '.json'))
        print('set CRC %#010x, set bytes %d' % (crc, n))
        return
    try:
        import mido
    except ImportError:
        sys.exit('Needs mido and python-rtmidi: python3 -m pip install mido python-rtmidi')
    outs = [n for n in mido.get_output_names() if a.port.lower() in n.lower()]
    ins = [n for n in mido.get_input_names() if a.port.lower() in n.lower()]
    if not outs or not ins:
        sys.exit('No MIDI port matching %r. Outputs: %s' % (a.port, mido.get_output_names()))
    if a.cmd == 'ramboot':
        return ramboot(mido, ins[0], outs[0], a)
    if a.cmd == 'rundiff':
        return rundiff(mido, ins[0], outs[0], a)
    if a.cmd == 'log':
        return log(mido, ins[0], outs[0], a)
    if a.cmd in ('mods', 'try', 'remove', 'keep', 'undo'):
        with mido.open_input(ins[0]) as inp, mido.open_output(outs[0]) as out:
            return MODULE_COMMANDS[a.cmd](Link(mido, inp, out), a)
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
            if cmd in ('key', 'enc', 'release', 'disarm', 'ramboot'):
                print('ok')
            elif cmd == 'diag':
                return get32(p[0:5]), get32(p[5:10])
            elif cmd == 'load':
                v = [get32(p[5 * i:5 * i + 5]) for i in range(5)]
                print('last 0.5 s      %d.%d %%' % (v[0] // 10, v[0] % 10))
                print('dearest block   %d.%d %%' % (v[1] // 10, v[1] % 10))
                print('dearest since boot %d.%d %%' % (v[2] // 10, v[2] % 10))
                print('windows %d, blocks %d' % (v[3], v[4]))
                return v
            elif cmd == 'ident':
                if getattr(a, 'quiet', False):
                    return [get32(p[5 * i:5 * i + 5]) for i in range(min(len(IDENT), len(p) // 5))]
                for i, name in enumerate(IDENT[:len(p) // 5]):  # an older base sends fewer fields
                    v = get32(p[5 * i:5 * i + 5])
                    shown = {'port': PORTS, 'RAM boot status': BOOT, 'RAM boot mailbox': MAILBOX}.get(name, {}).get(v, v)
                    print('%-18s %s' % (name, '%#x' % v if name in ('RAM boot image CRC', 'set CRC') else shown))
                return [get32(p[5 * i:5 * i + 5]) for i in range(min(len(IDENT), len(p) // 5))]
            else:
                addr, n = get32(p[0:5]), get32(p[5:10])
                data = unpack(p[10:], n)
                if getattr(a, 'quiet', False):
                    return bytes(data)
                for i in range(0, n, 16):
                    print('%08x  %s' % (addr + i, data[i:i + 16].hex(' ')))
            return
        sys.exit('No reply within 2 s (is a Modwerk base with the link on the unit?)')


def rytm():
    """The Analog Rytm MKII link's upload helpers (same OS upgrade protocol and container): reused, not copied."""
    import importlib.util
    from pathlib import Path
    here = Path(__file__).resolve()
    sys.path.insert(0, str(here.parents[3]))     # sdk/, for firmware_codec
    spec = importlib.util.spec_from_file_location('rytm_link', here.parents[2] / 'analog-rytm-mkii/tools/rytm_link.py')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    mod.IMAGE_MAX, mod.CONTAINER_MAX = IMAGE_MAX, CONTAINER_MAX
    return mod


def json_load(path):
    import json
    with open(path) as f:
        return json.load(f)


def main_image(syx):
    """The image's MAIN OS, unpacked, as the boot loader places it at 0x40000400."""
    import struct
    rl = rytm()
    from firmware_codec import elz                  # rytm() put sdk/ on the path
    c = rl.syx_container(syx)
    count, = struct.unpack_from('>I', c, 0x1c)
    for k in range(min(count, 16)):
        ident, off, plen, dest = struct.unpack_from('>IIII', c, 0x20 + 16 * k)
        if ident == rl.MAIN_OS and dest == 0x40000400:
            return elz.depack_section(c[off:off + plen])
    raise ValueError('no MAIN OS section at 0x40000400')


def runid(syx, build):
    """(CRC32, length) of the image's .run block: the base and its modules as the linker placed them, which the base's
    link takes at boot and ident reports as the set identity. build is the patcher's IMAGE.syx.json."""
    import zlib
    layout = build['link']['layout']
    load, (start, end) = layout['run_load'], layout['ddr']
    image = main_image(syx)
    blob = image[load - 0x40000400:load - 0x40000400 + end - start]
    if len(blob) != end - start:
        raise ValueError('the .run block lies outside the MAIN OS')
    return zlib.crc32(blob) & 0xffffffff, len(blob)


def rundiff(mido, in_name, out_name, a):
    build = json_load(a.image + '.json')
    layout = build['link']['layout']
    load, (start, end) = layout['run_load'], layout['ddr']
    image = main_image(open(a.image, 'rb').read())
    want = image[load - 0x40000400:load - 0x40000400 + end - start]
    names = sorted((int(v, 16), k) for k, v in json_load(a.image + '.map.json').items()
                   if isinstance(v, str) and v.startswith('0x') and start <= int(v, 16) < end)
    a.quiet = True
    got = b''
    src = a.at or start
    for at in range(start, end, 128):
        got += run(mido, in_name, out_name, 'mem', u32(src + at - start) + u32(min(128, end - at)), a)
    for i in range(0, len(want), 4):
        if got[i:i + 4] != want[i:i + 4]:
            sym = max((n for n in names if n[0] <= start + i), default=(start, '?'))
            print('%08x  image %s  unit %s  %s+%#x' % (start + i, want[i:i + 4].hex(), got[i:i + 4].hex(), sym[1],
                                                        start + i - sym[0]))
    print('compared %d bytes' % len(want))


KINDS = {1: 'START', 2: 'HOT', 3: 'FREEZE', 4: 'CRASH', 5: 'STALL', 6: 'SET', 7: 'BASE', 8: 'SHED', 9: 'CPU',
         10: 'BRAKE', 11: 'USB', 12: 'LATE'}


def log_text(raw):
    """The log's records as lines (diag.h: big-endian, version 2): loads every five minutes, then incidents."""
    import struct
    magic, version, nonce, boot, seq, loads, incidents = struct.unpack_from('>7I', raw)
    if magic != 0x4d574447 or version != 2:
        return 'no log (magic %#x, version %d)' % (magic, version)
    out = ['log version %d, nonce %#010x, boot %d, %d loads, %d incidents' % (version, nonce, boot, loads, incidents)]
    at = 40 + 92
    rows = []
    for i in range(96):
        r = struct.unpack_from('>3I10H', raw, at + 32 * i)
        if r[0]:
            rows.append((r[0], 'load  min %4d  cpu mean %5.1f %%  peak %5.1f %%  windows %d  block gap %d us  '
                                'blocks without a tick %d' % (r[2], r[3] / 10, r[4] / 10, r[9], r[11], r[12])))
    at += 32 * 96
    for i in range(32):
        r = struct.unpack_from('>4I4H', raw, at + 92 * i)
        if r[0]:
            machines = raw[at + 92 * i + 24:at + 92 * i + 48:3][:6]
            keys = [k for k in raw[at + 92 * i + 64:at + 92 * i + 80] if k != 0xff]
            a = '%#010x' % r[3] if r[4] == 7 else str(r[3])
            rows.append((r[0], 'event s %5d  %-6s a %s  cpu %5.1f %%  machines %s  keys %s'
                         % (r[2], KINDS.get(r[4], r[4]), a, r[5] / 10, list(machines), keys)))
    out += ['%4d  %s' % row for row in sorted(rows)]
    return '\n'.join(out)


def log(mido, in_name, out_name, a):
    addr, size = run(mido, in_name, out_name, 'diag', [], a)
    a.quiet = True
    raw = b''
    for at in range(0, size, 128):      # LOG reads the log alone, in every base (MEM: development bases only)
        raw += run(mido, in_name, out_name, 'log', u32(at) + u32(min(128, size - at)), a)
    if a.out:
        open(a.out, 'wb').write(raw)
    print('log at %#x, %d bytes' % (addr, size))
    print(log_text(raw))


def ramboot(mido, in_name, out_name, a):
    rl = rytm()
    syx = open(a.image, 'rb').read()
    args = rl.ramboot_args(syx)
    print('image: MAIN OS %d bytes, CRC %#x; container %d bytes' % (args[0], args[1], args[2]))
    msgs = rl.ek_upgrade_messages(syx)
    # Stock shows "Upgrade OS now?" once it has the image: a link that then refuses the RAM boot leaves that
    # question on the screen, and YES flashes the image. So the arm is checked before anything is uploaded.
    a.quiet = True
    fields = run(mido, in_name, out_name, 'ident', [], a)
    a.quiet = False
    if len(fields) <= IDENT.index('armed') or not fields[IDENT.index('armed')]:
        sys.exit('The link is not armed (disarm holds until the next boot); nothing was uploaded.')
    t0 = time.time()
    with mido.open_input(in_name) as inp, mido.open_output(out_name) as out:
        while inp.poll():
            pass
        for i, (seq, req) in enumerate(msgs):
            out.send(mido.Message('sysex', data=req[1:-1]))
            end, reply = time.time() + 10, None
            while time.time() < end and reply is None:
                m = inp.poll()
                if m is None:
                    time.sleep(0.001)
                    continue
                if m.type == 'sysex' and bytes(m.data[:5]) == rl.EK_HEADER[1:]:
                    d = rl.ek_decode(bytes([0xF0]) + bytes(m.data) + b'\xF7')
                    if len(d) > (9 if i else 5) and (d[2] << 8 | d[3]) == seq and d[4] == (0xD0 if i == 0 else 0xD1):
                        reply = d
            if reply is None:
                sys.exit('No answer to upgrade message %d of %d; nothing was flashed.' % (i + 1, len(msgs)))
            if i == 0 and reply[5] != 0:
                sys.exit('The unit refused the upgrade start (status %d).' % reply[5])
            if i and reply[9] > 1:
                sys.exit('The unit refused block %d (status %d).' % (i, reply[9]))
            if i and reply[9] == 1:
                if i != len(msgs) - 1:
                    sys.exit('The unit said done at block %d of %d; stopping.' % (i, len(msgs) - 1))
                break
            if i % 100 == 0:
                print('  %d / %d blocks, %.0f s' % (i, len(msgs) - 1, time.time() - t0))
        else:
            sys.exit('The unit never said the upload was complete; nothing was flashed.')
    print('uploaded in %.1f s; asking for the RAM boot (do not answer the unit\'s "Upgrade OS now?")' % (time.time() - t0))
    time.sleep(0.5)
    try:
        run(mido, in_name, out_name, 'ramboot', [b for v in args for b in u32(v)], a)
    except SystemExit as refused:
        sys.exit('%s\nThe unit keeps the image and asks "Upgrade OS now?": answer NO, or it flashes the image.' % refused)
    print('the unit resets now; after it boots: mc_link.py ident (RAM boot status)')


# ---- the runtime loader (base/modules.c) ------------------------------------------------------------------------
UP_PART, UP_RUN, MODS = 0x31, 0x32, 0x33   # 0x30 is the Digitone II's whole-frame upload
PART_BYTES = 96                         # a part's bytes: 8 + 5 + 110 packed + 1 = 124, under stock's 128
CHUNK = 2048                            # bytes of the package in one CHUNK frame
WIRE = dict(hello=0, enter=1, begin=2, chunk=3, verify=4, commit=5, accept=6, rollback=7, abort=8, leave=9)
RESULTS = ['ok', 'state', 'unsafe (playing?)', 'identity', 'limit (too large)', 'stale', 'length', 'conflict', 'hash',
           'rejected', 'backend', 'needs recovery', 'progress']
PHASES = ['normal', 'ready', 'receiving', 'verified', 'pending', 'trial', 'recovery', 'publishing']
REFUSALS = ['none', 'malformed', 'memory', 'conflict', 'full', 'busy', 'cycles', 'in use', 'stock bytes differ',
            'event site', 'feature', 'UI open', 'buffer']


def pack(data):
    out = []
    for i in range(0, len(data), 7):
        group = data[i:i + 7]
        out.append(sum(0x40 >> k for k, b in enumerate(group) if b & 0x80))
        out += [b & 0x7f for b in group]
    return out


class Link:
    """One open port pair: each request waits for its reply (the link answers on the UI tick)."""

    def __init__(self, mido, inp, out):
        self.mido, self.inp, self.out, self.seq = mido, inp, out, int(time.time() * 10) & 0x7f
        while inp.poll():
            pass

    def call(self, cmd, body, timeout=5):
        self.seq = (self.seq + 1) & 0x7f
        self.out.send(self.mido.Message('sysex', data=list(HEADER[1:]) + [self.seq, cmd] + list(body)))
        end = time.time() + timeout
        while time.time() < end:
            m = self.inp.poll()
            if m is None:
                time.sleep(0.001)
                continue
            if m.type == 'sysex' and bytes(m.data[:5]) == HEADER[1:6] and m.data[5] == self.seq and m.data[6] == cmd | 0x40:
                return m.data[7], list(m.data[8:])
        sys.exit('No reply within %d s (is a Modwerk base on the unit?)' % timeout)

    def frame(self, command, transaction, session, body=b''):
        """One wire request: its parts, then UP_RUN; the controller's response, decoded."""
        req = b'MWUP' + struct.pack('>HHII', 1, WIRE[command], transaction, len(body)) + session + body
        for at in range(0, len(req), PART_BYTES):
            status, _ = self.call(UP_PART, u32(at) + pack(req[at:at + PART_BYTES]))
            if status:
                sys.exit('unit: %s (an older base has no loader)' % STATUS.get(status, 'status %d' % status))
        status, p = self.call(UP_RUN, u32(len(req)), timeout=10)
        if status:
            sys.exit('unit: %s, no response to %s' % (STATUS.get(status, 'status %d' % status), command))
        r = unpack(p, 144)
        if r[:4] != b'MWUR':
            sys.exit('unit: not a controller response')
        f = struct.unpack('>8I', r[16:48])
        return dict(result=f[0], phase=f[1], known=f[2], generation=f[3], last=f[4], current=f[5], received=f[6],
                    capacity=f[7], base=r[48:80], session=r[80:112], active=r[112:144])

    def must(self, command, transaction, session, body=b''):
        r = self.frame(command, transaction, session, body)
        if r['result'] not in (0, 12):
            sys.exit('%s: %s (phase %s)' % (command, RESULTS[r['result']] if r['result'] < len(RESULTS) else r['result'],
                                             PHASES[r['phase']] if r['phase'] < len(PHASES) else r['phase']))
        return r


def mods(link, a):
    first, shown = 0, 0
    while True:
        status, p = link.call(MODS, u32(first))
        if status:
            sys.exit('unit: %s (an older base has no loader)' % STATUS.get(status, 'status %d' % status))
        head = unpack(p, 20)
        free, largest, refusal, active = struct.unpack('>4I', head[:16])
        n = head[19]
        if first == 0:
            print('pool: %d bytes free, largest run %d; live modules: %d; last refusal: %s'
                  % (free, largest, active, REFUSALS[refusal] if refusal < len(REFUSALS) else refusal))
        body = unpack(p, 20 + 24 * n)[20:]
        for i in range(n):
            e = body[24 * i:24 * i + 24]
            name = e[8:24].split(b'\0')[0].decode('ascii', 'replace')
            print('  module %08x  %s' % (struct.unpack('>I', e[4:8])[0], name or '(no name)'))
        shown += n
        if n < 3 or shown >= active:
            return
        first += n


def hello(link):
    return link.frame('hello', 0, bytes(32))


def finish(link, keep):
    r = hello(link)
    session, t = r['session'], r['current'] or r['last']
    if PHASES[r['phase']] != 'trial':
        sys.exit('nothing on trial (phase %s)' % PHASES[r['phase']])
    link.must('enter', 0, session)
    link.must('accept' if keep else 'rollback', t, session)
    r = link.must('leave', t, session)
    print('%s: phase %s, generation %d' % ('kept' if keep else 'undone', PHASES[r['phase']], r['generation']))


def empty_package(name):
    """No image, hooks or sites under the module's id (build.py: the first four bytes of the SHA-256 of its name):
    the loader removes that module."""
    return b'MWRM' + struct.pack('>HH6I', 4, 0, 0, 0, 0, 0, 0, int.from_bytes(hashlib.sha256(name.encode()).digest()[:4], 'big'))


def try_package(link, a):
    pkg = empty_package(a.name) if a.cmd == 'remove' else open(a.package, 'rb').read()
    r = hello(link)
    session = r['session']
    if PHASES[r['phase']] != 'normal':
        sys.exit('the loader is busy (phase %s): wait 10 s, or mc_link.py undo' % PHASES[r['phase']])
    status, p = link.call(CMD['ident'], [])
    crc = get32(p[5 * IDENT.index('set CRC'):][:5])
    if r['base'] != hashlib.sha256(crc.to_bytes(4, 'big')).digest():
        sys.exit('the unit\'s base identity does not match its set CRC %#x' % crc)
    t = r['last'] + 1
    link.must('enter', 0, session)
    link.must('begin', t, session, r['base'] + hashlib.sha256(pkg).digest() + struct.pack('>II', r['generation'], len(pkg)))
    for at in range(0, len(pkg), CHUNK):
        link.must('chunk', t, session, struct.pack('>I', at) + pkg[at:at + CHUNK])
    link.must('verify', t, session)
    while link.must('commit', t, session)['result'] == 12:
        pass
    link.must('leave', t, session)
    print('%s on trial for %g s (%d bytes)' % ('removing ' + a.name if a.cmd == 'remove' else os.path.basename(a.package),
                                              a.seconds, len(pkg)))
    end = time.time() + a.seconds
    try:
        while time.time() < end:
            time.sleep(1)
            hello(link)                     # a request a second: ten quiet seconds would undo it
    except KeyboardInterrupt:
        sys.exit('\nstopped: the unit puts the previous set back within about 10 s')
    finish(link, a.keep)
    mods(link, a)


MODULE_COMMANDS = {'mods': mods, 'try': try_package, 'remove': try_package, 'keep': lambda link, a: finish(link, True),
                   'undo': lambda link, a: finish(link, False)}


if __name__ == '__main__':
    main()
