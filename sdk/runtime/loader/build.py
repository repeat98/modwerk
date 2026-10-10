#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Build a runtime module package (MWRM, ABI 3; README.md).

From C sources (handlers found by name, modwerk_module.h):

    python3 -B sdk/runtime/loader/build.py MODULE.c [MORE.c ...] -o MODULE.mwrm

From a catalogue module converted by Elekloader (build_ports.py), with its
patches to stock code; the package then holds stock bytes, so keep it private:

    python3 -B sdk/runtime/loader/build.py --elemod MOD.elemod --stock OS.bin \\
        --upstream ~/.cache/modwerk-upstream/elekloader --base-symbols BASE/symbols.json -o MOD.mwrm

C modules are linked twice, at 0 and at 0x10000; the 32-bit words that differ
by exactly 0x10000 are their references to themselves, any other difference
is refused. Elemods list their relocations. The base adds the module's
address to each self-reference at load. ColdFire, no C library or libgcc.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
HANDLERS = ('module_tick', 'module_draw', 'module_key', 'module_enc')  # loader.h's event order
NONE = 0xffffffff
SHIFT = 0x10000
SITE_BYTES, SITE_RELOCATIONS = 32, 8  # loader.h
CFLAGS = ['-mcpu=54455', '-Os', '-std=c99', '-ffreestanding', '-fno-builtin', '-fno-common',
          '-fno-tree-loop-distribute-patterns', '-fno-asynchronous-unwind-tables', '-fno-unwind-tables',
          '-Wall', '-Wextra', '-Werror', '-I', str(HERE)]
SCRIPT = '''ENTRY(__image_start)
SECTIONS {
  . = %#x;
  __image_start = .;
  .image : { *(.text .text.*) *(.rodata .rodata.*) *(.data .data.*) . = ALIGN(4); }
  __image_end = .;
  .bss (NOLOAD) : { *(.bss .bss.*) . = ALIGN(4); }
  __bss_end = .;
  /DISCARD/ : { *(.comment) *(.note .note.*) }
}
'''


def relocations(low, high, end):
    """Offsets of the words that move with the link address; refuse anything else."""
    offsets, moved = [], set()
    for at in range(0, len(low) - 3, 2):
        a, b = struct.unpack_from('>I', low, at)[0], struct.unpack_from('>I', high, at)[0]
        if b - a == SHIFT:
            if a >= end:
                raise ValueError('The reference at %#x points outside the module.' % at)
            offsets.append(at)
            moved.update((at, at + 1))  # adding 0x10000 changes only the upper half
    if len(low) != len(high) or any(x != y and i not in moved for i, (x, y) in enumerate(zip(low, high))):
        raise ValueError('The module has a reference the base cannot relocate.')
    return offsets


def package(image, bss, hooks, offsets, sites=()):
    """sites: (address, stock bytes, new bytes, offsets of self-references in them)."""
    records = b''
    for address, stock, code, local in sites:
        if len(stock) != len(code) or not 0 < len(code) <= SITE_BYTES or len(local) > SITE_RELOCATIONS:
            raise ValueError('Site at %#x exceeds the loader\'s bounds.' % address)
        records += struct.pack('>IHH', address, len(code), len(local)) + stock + code + struct.pack('>%dH' % len(local), *local)
    return (b'MWRM' + struct.pack('>HHIIIII', 3, 0, len(image), bss, len(offsets), len(hooks), len(sites))
            + struct.pack('>%dI' % len(hooks), *hooks) + image
            + struct.pack('>%dI' % len(offsets), *offsets) + records)


def link_elemod(doc, stock_at, base_symbols):
    """A converted module laid out from 0: (image, self-reference offsets, sites)."""
    unsupported = [k for k in ('contribute', 'subscribe', 'copied') if doc.get(k)]
    if unsupported or set(doc['sections']) != {'.run'}:
        raise ValueError('Runtime loading supports one .run section and stock-code sites only, not '
                         + ', '.join(unsupported or sorted(doc['sections'])) + '.')
    run, symbols = doc['sections']['.run'], doc['symbols']
    image = bytearray()
    for part in run['parts']:
        if part[0] == 'hex':
            image += bytes.fromhex(part[1])
        elif part[0] == 'stock':
            image += stock_at(int(part[1], 16), part[2])
        else:
            raise ValueError('Unsupported section part: ' + part[0])
    if len(image) != run['len']:
        raise ValueError('The .run section does not have its declared length.')

    def resolve(target, addend):
        """(value, whether it is an offset into the module)"""
        kind, _, name = target.partition(':')
        if kind == 'sec' and name == '.run':
            return addend, True
        if kind == 'sym' and name in symbols:
            where, value = symbols[name]
            if where not in ('.run', 'abs'):
                raise ValueError('Unsupported symbol section: ' + where)
            return value + addend, where == '.run'
        if kind == 'sym' and name in base_symbols:
            return base_symbols[name] + addend, False
        raise ValueError('Unresolved relocation target: ' + target)

    def apply(data, entries):
        local = []
        for at, kind, target, addend in entries:
            if kind != 'abs32':
                raise ValueError('Unsupported relocation: ' + kind)
            value, inside = resolve(target, addend)
            struct.pack_into('>I', data, at, value & 0xffffffff)
            if inside:
                local.append(at)
        return local

    offsets = apply(image, [r[1:] for r in doc.get('relocs', []) if r[0] == '.run'] + run.get('relocs', []))
    if any(r[0] != '.run' for r in doc.get('relocs', [])):
        raise ValueError('Relocations outside .run.')
    sites = []
    for site in doc.get('sites', []):
        if site.get('kind', 'code') != 'code' or 'new' not in site:
            raise ValueError('Runtime loading patches code sites with given bytes only (site %s).' % site.get('addr'))
        address, length = int(site['addr'], 16), site['len']
        stock = stock_at(address, length)
        if hashlib.sha256(stock).hexdigest() != site['stock_sha256']:
            raise ValueError('Stock bytes at %#x are not the ones the module expects.' % address)
        code = bytearray.fromhex(site['new'])
        local = apply(code, site.get('relocs', []))
        sites.append((address, stock, bytes(code), local))
    return bytes(image), offsets, sites


def build_c(sources, cross):
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        objects = [tmp / ('%d.o' % i) for i in range(len(sources))]
        for source, obj in zip(sources, objects):
            subprocess.run([cross + 'gcc', *CFLAGS, '-c', str(source), '-o', str(obj)], check=True)
        images, symbols = [], {}
        for base in (0, SHIFT):
            (tmp / 'link.ld').write_text(SCRIPT % base)
            elf = tmp / ('%x.elf' % base)
            subprocess.run([cross + 'ld', '--orphan-handling=error', '--no-warn-rwx-segments', '-T', str(tmp / 'link.ld'),
                            '-o', str(elf), *map(str, objects)], check=True)
            subprocess.run([cross + 'objcopy', '-O', 'binary', '-j', '.image', str(elf), str(tmp / 'image')], check=True)
            images.append((tmp / 'image').read_bytes())
            if base == 0:
                for line in subprocess.check_output([cross + 'nm', str(elf)], text=True).splitlines():
                    value, _, name = line.split()
                    symbols[name] = int(value, 16)
    image, length, end = images[0], symbols['__image_end'], symbols['__bss_end']
    if len(image) != length:
        raise ValueError('The module image is not contiguous.')
    hooks = [symbols.get(name, NONE) for name in HANDLERS]
    if all(h == NONE for h in hooks):
        raise ValueError('Define at least one of ' + ', '.join(HANDLERS) + '.')
    return package(image, end - length, hooks, relocations(image, images[1], end))


def build_elemod(args):
    if not (args.stock and args.upstream):
        sys.exit('--elemod needs --stock and --upstream.')
    sys.path.insert(0, str(args.upstream.expanduser().resolve()))
    from elekloader import formats
    parsed, device, _ = formats.load(str(args.stock))
    main = formats.main_image(parsed, device)
    doc = json.loads(args.elemod.read_text())
    if doc.get('target', {}).get('section3_sha256') != hashlib.sha256(main).hexdigest():
        sys.exit('The module was converted for a different stock OS.')
    base = json.loads(args.base_symbols.read_text()) if args.base_symbols else {}

    def stock_at(address, length):
        at = address - device.main_load
        if at < 0 or at + length > len(main):
            raise ValueError('Stock bytes outside the OS image: %#x' % address)
        return main[at:at + length]

    image, offsets, sites = link_elemod(doc, stock_at, base)
    return package(image, 0, [], offsets, sites)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('sources', type=Path, nargs='*')
    parser.add_argument('-o', '--output', type=Path, required=True)
    parser.add_argument('--cross', default='m68k-elf-')
    parser.add_argument('--elemod', type=Path)
    parser.add_argument('--stock', type=Path)
    parser.add_argument('--upstream', type=Path)
    parser.add_argument('--base-symbols', type=Path)
    args = parser.parse_args()
    if bool(args.sources) == bool(args.elemod):
        parser.error('Give C sources or --elemod.')
    data = build_elemod(args) if args.elemod else build_c(args.sources, args.cross)
    args.output.write_bytes(data)
    image, bss, count, hooks, sites = struct.unpack_from('>IIIII', data, 8)
    print('%s: %d bytes of code and data, %d of bss, %d relocations, %d hooks, %d stock-code sites' % (
        args.output, image, bss, count, sum(h != NONE for h in struct.unpack_from('>%dI' % hooks, data, 28)), sites))


if __name__ == '__main__':
    main()
