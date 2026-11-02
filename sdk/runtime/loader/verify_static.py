#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Prove a runtime package holds what Elekloader's own static link of the module would.

    python3 -B sdk/runtime/loader/verify_static.py --stock OS.bin --upstream ~/.cache/modwerk-upstream/elekloader \\
        --core BASE/package/core.elemod --elemod MOD.elemod --package MOD.mwrm

Links the base's core and the module with Elekloader, finds where the module's
code landed, and places the package there the way the base's loader would.
The relocated code and every patched site must match the static image byte
for byte, and each site's stock bytes must match stock (ABI 7: their SHA-256, and the bytes a site keeps are
stock's). ABI 7's stock copies are checked against stock by their hash; the image is compared with its copies
still zero (Elekloader's converter leaves a StockCopy placeholder as it is). Local files only.
"""
import hashlib
import argparse
import json
from pathlib import Path
import struct
import sys
import tempfile

sys.path.append(str(Path(__file__).resolve().parents[2]))  # sdk/, for firmware_codec
import firmware_codec  # noqa: E402


def unpack(data):
    """(image, self-reference offsets, sites) of an ABI 3 to 7 package (its DSP code is not linked statically). A site
    is (address, stock bytes, new bytes, offsets), or in ABI 7 (address, SHA-256, new bytes with the kept bytes zero,
    offsets, kept bytes, bytes the hash covers); ABI 7's stock copies are (image offset, address, length, SHA-256)
    and come back with `copies`."""
    return unpack_all(data)[:3]


def unpack_all(data):
    code, offsets, sites, copies, fills = unpack_recipe(data)
    image = bytearray(code)
    for offset, length, value in fills:
        image[offset:offset + length] = bytes([value]) * length
    return bytes(image), offsets, sites, copies


def unpack_recipe(data):
    abi = struct.unpack_from('>H', data, 4)[0] if data[:4] == b'MWRM' else 0
    if abi not in (3, 4, 5, 6, 7, 8, 9, 10):
        raise ValueError('Not an ABI 3 to 10 runtime package.')
    image, _, count, hooks, sites = struct.unpack_from('>IIIII', data, 8)
    dsp_words, dsp_relocations = struct.unpack_from('>IH', data, 32) if abi >= 5 else (0, 0)
    copies = struct.unpack_from('>I', data, 68)[0] if abi >= 7 else 0
    fills = struct.unpack_from('>I', data, 72)[0] if abi >= 8 else 0
    claims, entries = (data[78], data[79]) if abi >= 9 else (0, 0)  # ABI 9: 12-byte claims, 8-byte hook entries
    at = {3: 28, 4: 32, 5: 50, 6: 68, 7: 72, 8: 76, 9: 80, 10: 80}[abi] + 4 * hooks
    code, at = data[at:at + image], at + image
    offsets = struct.unpack_from('>%dI' % count, data, at)
    at += 4 * count
    records, copied = [], []
    for _ in range(sites):
        if abi >= 7:
            address, n, keep, checked, r = struct.unpack_from('>IBBBB', data, at)
            records.append((address, data[at + 8:at + 40], data[at + 40:at + 40 + n],
                            struct.unpack_from('>%dH' % r, data, at + 40 + n), keep, checked))
            at += 40 + n + 2 * r
            continue
        address, n, r = struct.unpack_from('>IHH', data, at)
        records.append((address, data[at + 8:at + 8 + n], data[at + 8 + n:at + 8 + 2 * n],
                        struct.unpack_from('>%dH' % r, data, at + 8 + 2 * n)))
        at += 8 + 2 * n + 2 * r
    for _ in range(copies):
        offset, address, n = struct.unpack_from('>IIH', data, at)
        copied.append((offset, address, n, data[at + 12:at + 44]))
        at += 44
    filled = []
    for _ in range(fills):
        offset, n, value = struct.unpack_from('>IIB', data, at)
        if not n or offset + n > len(code) or not value or any(data[at + 9:at + 12]) or any(code[offset:offset + n]):
            raise ValueError('Malformed constant fill.')
        filled.append((offset, n, value))
        at += 12
    # ABI 10: an engine's init claims (access 4) carry their words after the DSP relocations.
    init = sum(struct.unpack_from('>I', data, at + 12 * i + 8)[0] for i in range(claims) if data[at + 12 * i + 2] & 4)
    at += 12 * claims + 8 * entries
    if at + 4 * dsp_words + 2 * dsp_relocations + 4 * init != len(data):
        raise ValueError('Trailing bytes in the package.')
    return code, offsets, records, copied, filled


def placed(data, offsets, base):
    data = bytearray(data)
    for at in offsets:
        struct.pack_into('>I', data, at, struct.unpack_from('>I', data, at)[0] + base)
    return bytes(data)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    for name in ('stock', 'upstream', 'core', 'elemod', 'package'):
        parser.add_argument('--' + name, type=Path, required=True)
    args = parser.parse_args()
    firmware_codec.use_elekloader(args.upstream.expanduser().resolve())
    from elekloader import formats, patch
    parsed, device, _ = formats.load(str(args.stock))
    stock = formats.main_image(parsed, device)
    outputs, manifest = patch.build(str(args.stock), [str(args.core), str(args.elemod)], version='ELEKLOADER',
                                    log=lambda *a, **k: None)
    with tempfile.TemporaryDirectory() as tmp:
        (Path(tmp) / 'linked.bin').write_bytes(outputs['bin'])
        linked = formats.main_image(formats.parse(str(Path(tmp) / 'linked.bin'), device), device)
    symbols, doc = manifest['_map'], json.loads(args.elemod.read_text())
    bases = {symbols[key] - offset for name, (where, offset) in doc['symbols'].items() if where == '.run'
             for key in (name, doc['id'] + ':' + name) if key in symbols}
    if len(bases) != 1:
        raise ValueError('Cannot tell where Elekloader placed the module: %s' % sorted(map(hex, bases)))
    base = bases.pop()
    image, offsets, sites, copies = unpack_all(args.package.read_bytes())
    at = symbols['__run_load'] + (base - symbols['__run_start']) - device.main_load
    checks = {'module code at %#x' % base: placed(image, offsets, base) == linked[at:at + len(image)]}
    for address, old, new, local, *hashed in sites:
        here = address - device.main_load
        if hashed:  # ABI 7: the hash names the stock bytes; the kept bytes are stock's
            keep, checked = hashed
            ok, new = hashlib.sha256(stock[here:here + checked]).digest() == old, stock[here:here + keep] + new[keep:]
        else:
            ok = old == stock[here:here + len(old)]
        checks['site %#x' % address] = ok and placed(new, local, base) == linked[here:here + len(new)]
    for offset, address, n, digest in copies:
        here = address - device.main_load
        checks['stock copy %#x' % address] = hashlib.sha256(stock[here:here + n]).digest() == digest
    for name, ok in checks.items():
        print('%-28s %s' % (name, 'matches the static link' if ok else 'DIFFERS'))
    if not all(checks.values()):
        sys.exit(1)
    print('The package places the same bytes as Elekloader\'s static link of this module.')


if __name__ == '__main__':
    main()
