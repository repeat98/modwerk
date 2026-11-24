#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Verify the shared-bank candidate's real package, hooks, stock guards and scan.

All firmware/package inputs remain private. This does not execute ColdFire.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import struct

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
BASE = 0x40000400

def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def verify(data, stock, receipt):
    assert hashlib.sha256(stock).hexdigest() == '164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e'
    digest = hashlib.sha256(data).hexdigest()
    assert digest == receipt['packageSha256'] and receipt['sharedBankEvents']
    assert data[:8] == b'MWRM\x00\x08\x00\x00'
    size, bss, relocations, hooks, sites, identity = struct.unpack_from('>6I', data, 8)
    copies, fills = struct.unpack_from('>2I', data, 68)
    assert identity == int(hashlib.sha256(b'midi-cc-slots').hexdigest()[:8], 16)
    assert size == receipt['imageBytes'] and bss == fills == 0 and sites == 23 and copies == 24
    words = list(struct.unpack_from('>%dI' % hooks, data, 76))
    assert words == receipt['hooks']
    registry = json.loads((ROOT/'sdk/machines/octatrack/events.json').read_text())
    events = {e['event']: e for e in registry['events']}
    expected = {e: events[e]['index'] for e in ['ev_bank_load', 'ev_bank_loaded']}
    assert hooks == max(expected.values()) + 1
    wanted = {0, 2, 3, *expected.values()}
    assert {i for i, word in enumerate(words) if word != 0xffffffff} == wanted
    for event, fn in [('ev_bank_load', 'mt_bank_load'), ('ev_bank_loaded', 'mt_bank_loaded')]:
        word = words[expected[event]]
        assert word >> 24 == 60 and word & 0xffffff == receipt['symbols'][fn]
    cursor = 76 + hooks*4
    literal = data[cursor:cursor+size]
    assert len(literal) == size
    cursor += size + relocations*4
    records, stock_copies = [], []
    for _ in range(sites):
        address, n, keep, checked, count = struct.unpack_from('>IBBBB', data, cursor)
        cursor += 8
        digest_bytes = data[cursor:cursor+32]
        cursor += 32
        code = data[cursor:cursor+n]
        cursor += n + count*2
        assert not keep and n == checked and 0 < n <= 32 and len(code) == n
        assert hashlib.sha256(stock[address-BASE:address-BASE+checked]).digest() == digest_bytes
        records.append((address, digest_bytes, code, (), 0, n))
    for _ in range(copies):
        at, address, n, reserved = struct.unpack_from('>IIHH', data, cursor)
        digest_bytes = data[cursor+12:cursor+44]
        cursor += 44
        assert not reserved and 0 < n <= 32 and at+n <= size and not any(literal[at:at+n])
        assert hashlib.sha256(stock[address-BASE:address-BASE+n]).digest() == digest_bytes
        stock_copies.append((at, address, n, digest_bytes))
    assert cursor == len(data)
    assert all(address != 0x400905d4 for address, *_ in records)
    assert all(address != 0x400905d4 for _, address, *_ in stock_copies)
    builder = load_module('bank_package_builder', ROOT/'sdk/runtime/loader/build.py')
    builder.unevented(records, stock_copies)
    base = json.loads((ROOT/'src/engine/assets/octatrack-base.elemod').read_text())
    for address, _, code, *_ in records:
        for site in base['sites']:
            at = int(site['addr'], 16)
            assert not (address < at+len(site['new'])//2 and at < address+len(code))
    scanner = load_module('bank_package_stock_scan', ROOT/'sdk/machines/octatrack/elekloader/check_stock_free.py')
    document = {'sections': {'image': {'parts': [['hex', literal.hex()]]}},
                'sites': [{'addr': hex(a), 'new': code.hex()} for a, _, code, *_ in records]}
    assert not scanner.stock_runs(document, [('MAIN', stock)], 16)
    return {'packageSha256': digest, 'bytes': len(data), 'imageBytes': size, 'sites': sites,
            'copies': copies, 'relocations': relocations, 'hookWords': hooks, 'subscriptions': expected,
            'bankLoadPrivatePatchOrCopy': False, 'stockGuards': 'passed',
            'baseOwnershipAndPatchOverlap': 'passed', 'stockFree16Bytes': 'passed',
            'hardware': 'not tested', 'coldfireExecution': 'not tested'}

def main():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ['package', 'stock', 'receipt']:
        p.add_argument('--'+name, type=Path, required=True)
    args = p.parse_args()
    print(json.dumps(verify(args.package.read_bytes(), args.stock.read_bytes(), json.loads(args.receipt.read_text())), indent=2))

if __name__ == '__main__': main()
