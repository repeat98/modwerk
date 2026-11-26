#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Build a Model:Cycles runtime module from C sources that patches stock code at declared sites.

    python3 -B sdk/machines/model-cycles/tools/build_sites.py MODULE.c [MORE.c ...] --sites SITES.json -o MODULE.mwrm

The runtime loader's build.py (sdk/runtime/loader) links the module; each site in SITES.json, in a machine base's
base.json format (addr, len, stockSha256, op jsr or jmp, target: a function of the module), becomes an ABI 7 site:
the op to the target, NOPs after it, the target word a relocation. The package carries the stock bytes' SHA-256 and
no stock byte; the base checks the running code against it before it patches, and puts the stock bytes back at an
undo or a removal. build.py itself stays as it is: it is one of the files the Octatrack base is built from.
"""
import argparse
import importlib.util
import json
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
_spec = importlib.util.spec_from_file_location('runtime_loader_build', ROOT / 'sdk/runtime/loader/build.py')
build = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(build)

OPCODES = {'jsr': b'\x4e\xb9', 'jmp': b'\x4e\xf9'}  # absolute long: the target word follows at offset 2


def c_sites(declared, symbols):
    """The package's sites: (address, stock SHA-256, new bytes, relocated offsets, flags, length)."""
    sites = []
    for site in declared:
        address, length, op, target = int(site['addr'], 16), site['len'], site.get('op'), site.get('target')
        if op not in OPCODES or target not in symbols or symbols[target] & 1 or length < 6 or length & 1:
            raise ValueError('Site %s: op jsr or jmp to a function of the module, at least 6 bytes, an even length.'
                             % site.get('addr'))
        code = OPCODES[op] + struct.pack('>I', symbols[target]) + b'\x4e\x71' * ((length - 6) // 2)
        sites.append((address, bytes.fromhex(site['stockSha256']), code, [2], 0, length))
    return sites


def build_sited(sources, cross, module, declared):
    """build.py's build_c, with the declared sites added to its package (hashed, titled by the module's name)."""
    found = {}
    link_units, package = build.link_units, build.package

    def linked(*args, **kwargs):
        result = link_units(*args, **kwargs)
        found['symbols'] = result[1]
        return result

    def packed(image, bss, hooks, offsets, sites=(), **kwargs):
        sites = list(sites) + c_sites(declared, found['symbols'])
        kwargs.update(hashed=True, title=module[:15])
        return package(image, bss, hooks, offsets, sites, **kwargs)

    build.link_units, build.package = linked, packed
    try:
        return build.build_c(sources, cross, module)
    finally:
        build.link_units, build.package = link_units, package


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('sources', type=Path, nargs='+')
    parser.add_argument('--sites', type=Path, required=True, help='a JSON list of stock-code sites (base.json format)')
    parser.add_argument('-o', '--output', type=Path, required=True)
    parser.add_argument('--cross', default='m68k-elf-')
    args = parser.parse_args()
    try:
        data = build_sited(args.sources, args.cross, args.output.stem, json.loads(args.sites.read_text()))
    except ValueError as error:
        sys.exit(str(error))
    args.output.write_bytes(data)
    print('%s: %d bytes, %d stock-code sites' % (args.output, len(data), len(json.loads(args.sites.read_text()))))


if __name__ == '__main__':
    main()
