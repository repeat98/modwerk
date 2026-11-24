#!/usr/bin/env python3
"""Verify and reconstruct the private USB draft at two emulator addresses; no device writes."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import struct

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
BASE = 0x40000400
STOCK = '164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package', type=Path, required=True)
    parser.add_argument('--stock', type=Path, required=True)
    parser.add_argument('--installed-main', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--profile', action='store_true')
    parser.add_argument('--project-template', action='store_true')
    parser.add_argument('--external', action='store_true', help='Private after-boot RAM fixture for larger profiles')
    args = parser.parse_args()
    output = args.output.resolve()
    if any((p / '.git').exists() for p in [output, *output.parents]):
        parser.error('private outputs must be outside every checkout')
    stock, data = args.stock.read_bytes(), args.package.read_bytes()
    assert hashlib.sha256(stock).hexdigest() == STOCK, 'wrong stock MAIN'
    abi=struct.unpack_from('>H',data,4)[0]
    assert data[:4] == b'MWRM' and abi in (7,8) and data[6:8] == bytes(2)
    length, bss, count, hooks, sites, module = struct.unpack_from('>6I', data, 8)
    copies = struct.unpack_from('>I', data, 68)[0]
    assert bss == 0 and hooks == 4
    assert sites == (24 if args.project_template else 21 if args.profile else 20) and (12 <= copies <= 128 if args.profile else copies == 16)
    if abi==8: assert struct.unpack_from('>I',data,72)[0] == 0
    assert module == int(hashlib.sha256(b'midi-cc-slots').hexdigest()[:8], 16)
    header=76 if abi==8 else 72
    if args.profile:
        assert struct.unpack_from('>I',data,header)[0]<length
        if args.project_template:
            assert struct.unpack_from('>I',data,header+8)[0]<length and struct.unpack_from('>I',data,header+12)[0]<length and data[header+4:header+8]==b'\xff'*4
        else:assert data[header+4:header+16]==b'\xff'*12
    else: assert data[header:header+16] == b'\xff'*16
    cursor = header+16
    literal = data[cursor:cursor+length]; image = bytearray(literal); cursor += length
    offsets = struct.unpack_from('>%dI' % count, data, cursor); cursor += count*4
    records = []
    installed = args.installed_main.read_bytes() if args.installed_main else None
    for _ in range(sites):
        address, n, keep, checked, rc = struct.unpack_from('>IBBBB', data, cursor); cursor += 8
        digest = data[cursor:cursor+32]; cursor += 32
        assert keep == 0 and 0 < n == checked <= 32
        for original in [stock, *([installed] if installed else [])]:
            assert hashlib.sha256(original[address-BASE:address-BASE+checked]).digest() == digest, hex(address)
        code = data[cursor:cursor+n]; cursor += n
        reloc = struct.unpack_from('>%dH' % rc, data, cursor); cursor += rc*2
        records.append((address, code, reloc))
    for _ in range(copies):
        at, address, n, reserved = struct.unpack_from('>IIHH', data, cursor)
        digest = data[cursor+12:cursor+44]; cursor += 44
        assert reserved == 0 and 0 <= at < at+n <= length and not any(image[at:at+n])
        for original in [stock, *([installed] if installed else [])]:
            assert hashlib.sha256(original[address-BASE:address-BASE+n]).digest() == digest, hex(address)
        image[at:at+n] = stock[address-BASE:address-BASE+n]
    assert cursor == len(data)
    spec = importlib.util.spec_from_file_location('scanner', ROOT / 'sdk/machines/octatrack/elekloader/check_stock_free.py')
    scanner = importlib.util.module_from_spec(spec); spec.loader.exec_module(scanner)
    doc = {'sections': {'image': {'parts': [['hex', literal.hex()]]}}, 'sites': [{'addr':hex(a),'new':c.hex()} for a,c,_ in records]}
    assert not scanner.stock_runs(doc, [('MAIN', stock)], 16), 'package contains a stock overlap'
    # Also refuse direct overlap with the app's current authored base sites.
    base = json.loads((ROOT / 'src/engine/assets/octatrack-base.elemod').read_text())
    for address, code, _ in records:
        for site in base['sites']:
            at = int(site['addr'], 16); n = len(site['new'])//2
            assert not (address < at+n and at < address+len(code)), f'base overlap at {hex(address)}'
    output.mkdir(parents=True, exist_ok=False)
    images = []
    for origin in ((0x47e00000,0x47e10000) if args.external else (0x400d64e0,0x400d65e0) if args.profile else (0x400d6b20, 0x400d7000)):
        patched = bytearray(stock); instance = bytearray(image)
        if not args.external: assert origin-BASE+length<=len(stock) and not any(stock[origin-BASE:origin-BASE+length])
        for offset in offsets:
            struct.pack_into('>I', instance, offset, struct.unpack_from('>I', instance, offset)[0]+origin)
        if not args.external: patched[origin-BASE:origin-BASE+length] = instance
        patches=[]
        for address, code, reloc in records:
            code = bytearray(code)
            for offset in reloc:
                struct.pack_into('>I', code, offset, struct.unpack_from('>I', code, offset)[0]+origin)
            if args.external: patches.append({'address':address,'data':code.hex(),'stock':stock[address-BASE:address-BASE+len(code)].hex()})
            else: patched[address-BASE:address-BASE+len(code)] = code
        if args.external:
            module_file=f'module-{origin:x}.private.bin'
            (output/module_file).write_bytes(instance)
            fixture={'origin':origin,'moduleFile':module_file,'moduleSha256':hashlib.sha256(instance).hexdigest(),
                     'stockSha256':STOCK,'packageSha256':hashlib.sha256(data).hexdigest(),'sites':patches}
            (output/f'fixture-{origin:x}.private.json').write_text(json.dumps(fixture,indent=2)+'\n')
        (output/f'reconstructed-{origin:x}.private.bin').write_bytes(patched)
        images.append({'origin':hex(origin),'sha256':hashlib.sha256(patched).hexdigest()})
    report = {'packageSha256':hashlib.sha256(data).hexdigest(), 'sites':sites, 'copies':copies,
              'imageBytes':length, 'relocations':count, 'stockFreeScan':'passed at 16 bytes',
              'currentBaseDirectOverlap':'none', 'installedFileGuards':bool(installed), 'images':images,
              'hardware':'not tested', 'loaderLifecycle':'not tested on device'}
    (output/'report.json').write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps(report))

if __name__ == '__main__':
    main()
