#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Read a Model:Cycles that runs a development base with the link (elekloader/base/link.c).

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
    mc_link.py runid IMAGE.syx    # the set identity ident reports for this image (needs IMAGE.syx.json); no unit
    mc_link.py rundiff IMAGE.syx  # read the running .run block and list each word that differs from the image

Keys and turns need the link armed (at every boot) and stop for about 3 s after a person presses or turns
something on the panel (status 'a person is at the unit').
"""
import argparse
import sys
import time

HEADER = bytes([0xF0, 0x7D, ord('M'), ord('W'), ord('L'), 1])
CMD = {'ident': 0x01, 'disarm': 0x02, 'key': 0x10, 'enc': 0x11, 'release': 0x12, 'ramboot': 0x14, 'mem': 0x21}
STATUS = {0: 'ok', 1: 'not armed', 2: 'bad request', 3: 'busy', 4: 'out of range', 5: 'a person is at the unit'}
IDENT = ['link version', 'requests received', 'requests dropped', 'ticks', 'port', 'replies sent', 'send failures',
         'armed', 'person at unit', 'person presses', 'posted', 'refused', 'RAM boot mailbox', 'RAM boot status',
         'RAM boot image CRC', 'set CRC', 'set bytes']
BOOT = {0: 'none', 1: 'booted from RAM', 2: 'mailbox without a software reset', 3: 'check word', 4: 'lengths',
        5: 'container CRC', 6: 'no MAIN OS section', 8: 'failed after the unpack (reset)'}
MAILBOX = {0: 'empty', 0x4d574254: 'asked', 0x4d574255: 'spent', 0x4d574253: 'booted'}
IMAGE_MAX, CONTAINER_MAX = 0x400000, 0x200000
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
    s = sub.add_parser('ramboot')
    s.add_argument('image')
    s = sub.add_parser('runid')
    s.add_argument('image')
    s = sub.add_parser('rundiff')
    s.add_argument('image')
    s.add_argument('--at', type=lambda v: int(v, 0), help='read a copy of the block at this address instead')
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
            elif cmd == 'ident':
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
        sys.exit('No reply within 2 s (is a development base with the link on the unit?)')


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


def ramboot(mido, in_name, out_name, a):
    rl = rytm()
    syx = open(a.image, 'rb').read()
    args = rl.ramboot_args(syx)
    print('image: MAIN OS %d bytes, CRC %#x; container %d bytes' % (args[0], args[1], args[2]))
    msgs = rl.ek_upgrade_messages(syx)
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
    run(mido, in_name, out_name, 'ramboot', [b for v in args for b in u32(v)], a)
    print('the unit resets now; after it boots: mc_link.py ident (RAM boot status)')


if __name__ == '__main__':
    main()
