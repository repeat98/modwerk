#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Carry the emulator bench's line protocol to a real unit over libusb.

    ~/.cache/modwerk-upstream/venv/bin/python usb_bridge.py /tmp/ot-usb.sock &
    node scripts/verify-octatrack-vendor-client.mjs /tmp/ot-usb.sock PROOFS.json --hardware

Any bench client then drives the unit as it drives ot_emu. Control transfers
only: a SETUP is held until its data stage ("in"/"out") performs the whole
transfer with libusb; the status stage the client sends next is answered
locally. Claims only the Modwerk vendor interface. Refuses SET_ADDRESS and
SET_CONFIGURATION and never resets the bus. Needs pyusb in a venv outside
the repository (`python3 -m venv ...; pip install pyusb`).
"""
import errno
import os
import socket
import struct
import sys

import usb.core
import usb.util


def reply_for(dev, held, line):
    words = line.split()
    if words[0] == 'setup':
        setup = struct.unpack('<BBHHH', bytes.fromhex(words[1]))
        if setup[0] == 0 and setup[1] in (5, 9):
            return None, 'err the bridge never sends SET_ADDRESS or SET_CONFIGURATION'
        return [setup, False], 'ok'
    if words[0] in ('in', 'out') and words[1] == '0' and held:
        setup, done = held
        if done or (words[0] == 'in') != bool(setup[0] & 0x80):
            return held, words[0] + ' 0' + ('' if words[0] == 'in' else ' 0')  # status stage
        held[1] = True
        try:
            if words[0] == 'in':
                data = dev.ctrl_transfer(*setup[:4], setup[4], timeout=2000)
                if setup[0] == 0xc1 and len(data) == setup[4] and setup[4] % 64 == 0:
                    # shortcut: test bases up to usbtest2 answer IDENTIFY/DIAG in exactly 64
                    # bytes; the controller then queues a zero-length packet the host never
                    # reads, which answers the next IN. Absorb it with a RESULT read; remove
                    # once no unit runs those builds.
                    dev.ctrl_transfer(0xc1, 2, 0, setup[3], 152, timeout=2000)
                return held, 'in 0 ' + bytes(data).hex() if len(data) else 'in 0'
            sent = dev.ctrl_transfer(*setup[:4], bytes.fromhex(words[2]) if len(words) > 2 else b'', timeout=2000)
            return held, 'out 0 %d' % sent
        except usb.core.USBError as error:
            if error.errno == errno.EPIPE:
                return held, words[0] + ' 0 stall'
            return held, 'err %s' % error
    return held, 'err unsupported on hardware: ' + line


def main():
    path = sys.argv[1]
    dev = usb.core.find(idVendor=0x1935)
    if dev is None:
        sys.exit('No Elektron device on USB.')
    vendor = [i.bInterfaceNumber for i in dev.get_active_configuration()
              if (i.bInterfaceClass, i.bInterfaceSubClass, i.bInterfaceProtocol) == (0xff, 0x4d, 1)]
    if len(vendor) != 1:
        sys.exit('No Modwerk vendor interface: the unit is not running the test base.')
    usb.util.claim_interface(dev, vendor[0])
    if os.path.exists(path):
        os.unlink(path)
    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    server.bind(path)
    server.listen(1)
    print('bridge ready on %s (vendor interface %d)' % (path, vendor[0]), flush=True)
    try:
        while True:
            conn, _ = server.accept()
            held = None
            with conn, conn.makefile('rw') as stream:
                for line in stream:
                    held, answer = reply_for(dev, held, line.strip())
                    stream.write(answer + '\n')
                    stream.flush()
    finally:
        usb.util.release_interface(dev, vendor[0])
        os.unlink(path)


if __name__ == '__main__':
    main()
