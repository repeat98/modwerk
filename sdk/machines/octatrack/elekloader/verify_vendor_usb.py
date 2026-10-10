#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Check the private base's USB vendor interface in the emulator.

    ot_emu --image MAIN.raw --usb-host /tmp/ot-usb.sock --ms 120000 &
    python3 -B verify_vendor_usb.py /tmp/ot-usb.sock --proofs NEW-core-output/proofs.json

Drives Octabam's USB bench (sdk/octabam/tools/harness/usb_host.py) against a
running ot_emu: enumeration at both speeds, the other-speed descriptor,
IDENTIFY's exact bytes against the built base's configuration identity, its
refusals, SUBMIT/RESULT stalling while the data stage is unconnected, and
mass storage still answering. Exit 0 only when every check passed. This is
emulator protocol evidence: no host OS driver, WebUSB, timing or hardware.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import struct
import sys

HERE = Path(__file__).resolve().parent
APP = HERE.parents[3]
_spec = importlib.util.spec_from_file_location('usb_bench', APP / 'sdk/octabam/tools/harness/usb_host.py')
bench = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(bench)
_spec = importlib.util.spec_from_file_location('modwerk_usb_base', HERE / 'usb_base.py')
usb = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(usb)

VENDOR_IN, VENDOR_OUT, IDENTIFY, SUBMIT, RESULT = 0xc1, 0x41, 3, 1, 2


def expected_identity(base, capabilities=0):
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


def check(b, base, hs):
    results = {}
    _, cfg = bench.enumerate_device(b, hs)
    results['configuration'] = cfg == usb.configuration(hs)
    results['other speed'] = answers(lambda: b.ctrl_in(0x80, 6, 0x0700, 0, 255), usb.configuration(not hs, True))
    vendor = usb.VENDOR_INTERFACE
    results['identify'] = answers(lambda: b.ctrl_in(VENDOR_IN, IDENTIFY, 0, vendor, 64), expected_identity(base))
    results['identify length refused'] = stalls(lambda: b.ctrl_in(VENDOR_IN, IDENTIFY, 0, vendor, 63))
    results['identify value refused'] = stalls(lambda: b.ctrl_in(VENDOR_IN, IDENTIFY, 1, vendor, 64))
    results['other interface refused'] = stalls(lambda: b.ctrl_in(VENDOR_IN, IDENTIFY, 0, usb.MSC_INTERFACE, 64))

    def submit():
        b.setup(VENDOR_OUT, SUBMIT, 1, vendor, 48)
        b.ep_out(0, bytes(48))
        b.ep_in(0, 64)
    results['submit stalls without data stage'] = stalls(submit)
    results['result stalls without data stage'] = stalls(lambda: b.ctrl_in(VENDOR_IN, RESULT, 0, vendor, 152))
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
    failed = 0
    for hs in (True, False):
        for name, ok in check(b, base, hs).items():
            print('%-34s %s %s' % (name, 'high' if hs else 'full', 'passed' if ok else 'FAILED'))
            failed += not ok
    print('Vendor USB in the emulator: %s; protocol evidence only, no host driver, WebUSB or hardware.'
          % ('%d check(s) FAILED' % failed if failed else 'all checks passed'))
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
