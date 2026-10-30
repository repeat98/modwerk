#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Carry the emulator bench's line protocol to a real unit over libusb.

    ~/.cache/modwerk-upstream/venv/bin/python scripts/octatrack-usb-bridge.py /tmp/modwerk-ot.sock &
    npm run device -- status      # or try/remove/lifecycle: scripts/device.mjs
    node scripts/verify-octatrack-vendor-client.mjs /tmp/modwerk-ot.sock PROOFS.json --hardware

    py scripts/octatrack-usb-bridge.py 47811    # Windows: TCP on 127.0.0.1; from WSL (mirrored networking), --socket 47811

Any bench client then drives the unit as it drives ot_emu. Control transfers
only: a SETUP is held until its data stage ("in"/"out") performs the whole
transfer with libusb; the status stage the client sends next is answered
locally. Claims only the Modwerk vendor interface. Refuses SET_ADDRESS and
SET_CONFIGURATION and never resets the bus. Needs pyusb in a venv outside
the repository (`python3 -m venv ...; pip install pyusb`; on Windows also
libusb-package, which brings libusb: the unit binds WinUSB by itself).
"""
import errno
import os
import socket
import struct
import sys

import usb.core
import usb.util

try:  # Windows: libusb comes with the libusb-package wheel, not with the system
    import functools, libusb_package
    usb.core.find = functools.partial(usb.core.find, backend=libusb_package.get_libusb1_backend())
except ImportError:
    pass


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
                return held, 'in 0 ' + bytes(data).hex() if len(data) else 'in 0'
            sent = dev.ctrl_transfer(*setup[:4], bytes.fromhex(words[2]) if len(words) > 2 else b'', timeout=2000)
            return held, 'out 0 %d' % sent
        except usb.core.USBError as error:
            if error.errno == errno.EPIPE:
                return held, words[0] + ' 0 stall'
            raise
    return held, 'err unsupported on hardware: ' + line


def dispose_device(dev):
    """Drop libusb's cached handle, including when unplugged during cleanup."""
    try:
        usb.util.dispose_resources(dev)
    except usb.core.USBError:
        pass  # a disappearing device must not terminate the listening socket


def open_unit():
    """(device, vendor interface), claimed; None while no unit runs the test base."""
    # The first Elektron device on the bus may be another instrument (an Analog Rytm on Overbridge): take the one
    # that offers the Modwerk vendor interface.
    def modwerk(d):
        try:
            return any((i.bInterfaceClass, i.bInterfaceSubClass, i.bInterfaceProtocol) == (0xff, 0x4d, 1) for c in d for i in c)
        except usb.core.USBError:
            return False
    dev = usb.core.find(idVendor=0x1935, custom_match=modwerk)
    if dev is None:
        return None
    claimed = False
    try:
        vendor = [i.bInterfaceNumber for i in dev.get_active_configuration()
                  if (i.bInterfaceClass, i.bInterfaceSubClass, i.bInterfaceProtocol) == (0xff, 0x4d, 1)]
        if len(vendor) != 1:
            return None
        usb.util.claim_interface(dev, vendor[0])
        claimed = True
        return dev, vendor[0]
    finally:
        if not claimed:
            dispose_device(dev)  # enumeration/claim failures may already hold a handle


def serve_request(unit, held, line):
    """One bounded acquisition/transfer attempt; never replay a hardware write."""
    try:
        unit = unit or open_unit()
        held, answer = reply_for(unit[0], held, line) if unit else (None, 'err the unit is away')
        return unit, held, answer
    except usb.core.USBError as error:
        if unit:
            dispose_device(unit[0])
        return None, None, 'err the unit went away: %s' % error


def main():
    path = sys.argv[1]
    try:
        unit = open_unit()
    except usb.core.USBError as error:
        sys.exit('Could not open the Modwerk vendor interface: %s' % error)
    if unit is None:
        sys.exit('No unit running the test base (Modwerk vendor interface) on USB.')
    if path.isdigit():  # a TCP port on this computer
        server = socket.create_server(('127.0.0.1', int(path)))
    else:
        if os.path.exists(path):
            os.unlink(path)
        server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        server.bind(path)
        server.listen(1)
    print('bridge ready on %s (vendor interface %d)' % (path, unit[1]), flush=True)
    try:
        while True:
            conn, _ = server.accept()
            held = None
            try:
                with conn, conn.makefile('rw', newline='\n') as stream:
                    for line in stream:
                        # A RAM boot or a replug takes the unit away: answer that, and
                        # find it again on the next request.
                        unit, held, answer = serve_request(unit, held, line.strip())
                        stream.write(answer + '\n')
                        stream.flush()
            except ConnectionError:  # the client hung up (Windows resets the socket)
                pass
    finally:
        if unit:
            try:
                usb.util.release_interface(*unit)
            except usb.core.USBError:
                pass
            finally:
                dispose_device(unit[0])
        if not path.isdigit():
            os.unlink(path)


if __name__ == '__main__':
    main()
