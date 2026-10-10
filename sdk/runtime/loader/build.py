#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Build a runtime module package (MWRM, ABI 2; README.md) from C sources.

    python3 -B sdk/runtime/loader/build.py MODULE.c [MORE.c ...] -o MODULE.mwrm

Handlers are found by name (modwerk_module.h): module_tick, module_draw,
module_key and module_enc. No C library or libgcc. ColdFire, as every machine
Elekloader supports.

The module is linked twice, at 0 and at 0x10000. The 32-bit words that differ
by exactly 0x10000 are its absolute references to itself; the base adds the
slot address to each at load. Any other difference is refused.
"""
import argparse
from pathlib import Path
import struct
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
HANDLERS = ('module_tick', 'module_draw', 'module_key', 'module_enc')  # loader.h's event order
NONE = 0xffffffff
SHIFT = 0x10000
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


def package(image, bss, hooks, offsets):
    return (b'MWRM' + struct.pack('>HHIIII', 2, 0, len(image), bss, len(offsets), len(hooks))
            + struct.pack('>%dI' % len(hooks), *hooks) + image
            + struct.pack('>%dI' % len(offsets), *offsets))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('sources', type=Path, nargs='+')
    parser.add_argument('-o', '--output', type=Path, required=True)
    parser.add_argument('--cross', default='m68k-elf-')
    args = parser.parse_args()
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        objects = [tmp / ('%d.o' % i) for i in range(len(args.sources))]
        for source, obj in zip(args.sources, objects):
            subprocess.run([args.cross + 'gcc', *CFLAGS, '-c', str(source), '-o', str(obj)], check=True)
        images, symbols = [], {}
        for base in (0, SHIFT):
            (tmp / 'link.ld').write_text(SCRIPT % base)
            elf = tmp / ('%x.elf' % base)
            subprocess.run([args.cross + 'ld', '--orphan-handling=error', '--no-warn-rwx-segments', '-T', str(tmp / 'link.ld'),
                            '-o', str(elf), *map(str, objects)], check=True)
            subprocess.run([args.cross + 'objcopy', '-O', 'binary', '-j', '.image', str(elf), str(tmp / 'image')], check=True)
            images.append((tmp / 'image').read_bytes())
            if base == 0:
                for line in subprocess.check_output([args.cross + 'nm', str(elf)], text=True).splitlines():
                    value, _, name = line.split()
                    symbols[name] = int(value, 16)
    image, length, end = images[0], symbols['__image_end'], symbols['__bss_end']
    if len(image) != length:
        raise ValueError('The module image is not contiguous.')
    hooks = [symbols.get(name, NONE) for name in HANDLERS]
    if all(h == NONE for h in hooks):
        raise ValueError('Define at least one of ' + ', '.join(HANDLERS) + '.')
    offsets = relocations(image, images[1], end)
    args.output.write_bytes(package(image, end - length, hooks, offsets))
    print('%s: %d bytes of code and data, %d of bss, %d relocations; %s' % (
        args.output, length, end - length, len(offsets), ', '.join(n for n, h in zip(HANDLERS, hooks) if h != NONE)))


if __name__ == '__main__':
    main()
