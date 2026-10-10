#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Check the private base's USB vendor interface in the emulator.

    ot_emu --image MAIN.raw --usb-host /tmp/ot-usb.sock --ms 120000 &
    python3 -B verify_vendor_usb.py /tmp/ot-usb.sock --proofs NEW-core-output/proofs.json

Drives Octabam's USB bench (sdk/octabam/tools/harness/usb_host.py) against a
running ot_emu: enumeration at both speeds, the other-speed descriptor,
IDENTIFY's exact bytes against the built base's configuration identity, its
refusals, a HELLO through SUBMIT's data stage, the engine task and RESULT,
ENTER and LEAVE of upload mode, duplicate and short submissions, the session surviving a
bus reset, and mass storage still answering. Exit 0 only when every check
passed. This is emulator protocol evidence: no host OS driver, WebUSB,
timing or hardware.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import struct
import sys
import time

HERE = Path(__file__).resolve().parent
APP = HERE.parents[3]
_spec = importlib.util.spec_from_file_location('usb_bench', APP / 'sdk/octabam/tools/harness/usb_host.py')
bench = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bench)
_spec = importlib.util.spec_from_file_location('modwerk_usb_base', HERE / 'usb_base.py')
usb = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(usb)

VENDOR_IN, VENDOR_OUT, IDENTIFY, SUBMIT, RESULT = 0xc1, 0x41, 3, 1, 2


def expected_identity(base, capabilities=1):
    return (b'MWUI' + bytes([1, 1]) + struct.pack('>HHHI', capabilities, 4148, 152, 0) +
            bytes.fromhex(base) + usb.MODEL.encode().ljust(16, b'\0'))


def stalls(run):
    try:
        run()
    except bench.Stall:
        return True
    return False


def answers(run, expected):
    """A stall or a hang is a failed check, reported rather than raised."""
    try:
        return run() == expected
    except (bench.Stall, TimeoutError):
        return False


def frame(command, session=bytes(32), transaction=0):
    return b'MWUP' + struct.pack('>HHII', 1, command, transaction, 0) + session


class Submitter:
    """SUBMIT then RESULT polls, continuing the device's sequence."""
    def __init__(self, b):
        self.b = b
        self.sequence = struct.unpack('>H', self.result()[6:8])[0]

    def result(self):
        return self.b.ctrl_in(VENDOR_IN, RESULT, 0, usb.VENDOR_INTERFACE, 152)

    def submit(self, data, sequence=None, length=None):
        if sequence is None:
            self.sequence = sequence = (self.sequence + 1) & 0xffff
        self.b.setup(VENDOR_OUT, SUBMIT, sequence, usb.VENDOR_INTERFACE, len(data) if length is None else length)
        self.b.ep_out(0, data)
        self.b.ep_in(0, 64)  # status stage
        return sequence

    def exchange(self, data):
        sequence = self.submit(data)
        for _ in range(200):
            reply = self.result()
            if reply[:4] != b'MWUT' or struct.unpack('>H', reply[6:8])[0] != sequence:
                return None
            if reply[5] == 2 and len(reply) == 152:
                return reply[8:]
            if reply[5] != 1:
                return None
            time.sleep(0.05)
        return None


def status(response):
    fields = struct.unpack('>4sHHII8I', response[:48])
    return dict(magic=fields[0], command=fields[2], result=fields[5], phase=fields[6], known=fields[7],
                generation=fields[8], capacity=fields[12], base=response[48:80].hex(),
                session=response[80:112], active=response[112:144].hex())


def check(b, base, hs, sessions):
    results = {}
    _, cfg = bench.enumerate_device(b, hs)
    results['configuration'] = cfg == usb.configuration(hs)
    results['other speed'] = answers(lambda: b.ctrl_in(0x80, 6, 0x0700, 0, 255), usb.configuration(not hs, True))
    vendor = usb.VENDOR_INTERFACE
    results['identify'] = answers(lambda: b.ctrl_in(VENDOR_IN, IDENTIFY, 0, vendor, 64), expected_identity(base))
    results['identify length refused'] = stalls(lambda: b.ctrl_in(VENDOR_IN, IDENTIFY, 0, vendor, 63))
    results['identify value refused'] = stalls(lambda: b.ctrl_in(VENDOR_IN, IDENTIFY, 1, vendor, 64))
    results['other interface refused'] = stalls(lambda: b.ctrl_in(VENDOR_IN, IDENTIFY, 0, usb.MSC_INTERFACE, 64))

    s = Submitter(b)
    hello = s.exchange(frame(0))
    st = status(hello) if hello else {}
    results['hello through the engine'] = bool(hello) and st['magic'] == b'MWUR' and st['result'] == 0 and \
        st['phase'] == 0 and st['known'] == 1 and st['capacity'] == 16400 and st['base'] == base and \
        st['active'] == base and any(st['session'])
    sessions.append(st.get('session'))
    session = st.get('session', bytes(32))
    enter = s.exchange(frame(1, session)) if hello else None
    leave = s.exchange(frame(9, session)) if enter else None
    results['enter and leave upload mode'] = bool(leave) and status(enter)['result'] == 0 and \
        status(enter)['phase'] == 1 and status(leave)['result'] == 0 and status(leave)['phase'] == 0
    results['duplicate sequence refused'] = stalls(lambda: s.submit(frame(0), sequence=s.sequence))
    results['short frame refused'] = stalls(lambda: s.submit(frame(0)[:47]))
    results['hello after refusals'] = s.exchange(frame(0)) is not None
    diag = b.ctrl_in(VENDOR_IN, 4, 0, vendor, 32)
    words = struct.unpack('>6I', diag[8:]) if len(diag) == 32 else ()
    results['diag counters'] = diag[:5] == b'MWUD\x01' and words[3] >= 4 and words[4] >= 2 and words[5] >= 1
    results['identify after refusals'] = answers(lambda: b.ctrl_in(VENDOR_IN, IDENTIFY, 0, vendor, 64),
                                                 expected_identity(base))
    results['mass storage'] = bench.msc_test(b)
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('socket')
    parser.add_argument('--proofs', type=Path, required=True, help="build_core.py's proofs.json for this image")
    args = parser.parse_args()
    base = json.loads(args.proofs.read_text())['configurationHash']
    b = bench.Bench(args.socket, timeout=60.0)
    failed, sessions = 0, []
    for hs in (True, False):
        for name, ok in check(b, base, hs, sessions).items():
            print('%-34s %s %s' % (name, 'high' if hs else 'full', 'passed' if ok else 'FAILED'))
            failed += not ok
    same = len(sessions) == 2 and sessions[0] is not None and sessions[0] == sessions[1]
    print('%-34s both %s' % ('session kept across bus reset', 'passed' if same else 'FAILED'))
    failed += not same
    print('Vendor USB in the emulator: %s; protocol evidence only, no host driver, WebUSB or hardware.'
          % ('%d check(s) FAILED' % failed if failed else 'all checks passed'))
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
