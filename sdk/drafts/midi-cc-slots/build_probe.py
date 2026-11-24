#!/usr/bin/env python3
"""Build a private emulator experiment from the user's own verified MAIN.

Not a card composer or USB package builder. Never upload this output folder.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import struct
import subprocess

BASE = 0x40000400
PLACEMENT = 0x400d6b20
STOCK = '164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e'
HERE = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stock', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    output = args.output.resolve()
    if any((p / '.git').exists() for p in [output, *output.parents]):
        parser.error('private outputs must be outside every Git checkout')
    stock = args.stock.read_bytes()
    if hashlib.sha256(stock).hexdigest() != STOCK:
        parser.error('requires the verified original 1.40C MAIN')
    output.mkdir(parents=True, exist_ok=False)
    for name, address, length in [('dispatch', 0x4009ef60, 6), ('assignment', 0x4009f0fe, 6),
                                  ('sequence_pb', 0x4009fd84, 6), ('sequence_at', 0x4009fdf8, 6),
                                  ('setup_press', 0x4003fc44, 8), ('setup_clamp', 0x4003a88e, 6),
                                  ('header', 0x4004c40c, 8), ('names_key', 0x4004ae08, 8),
                                  ('names_draw', 0x40036548, 8), ('names_yes', 0x4007ddd0, 6)]:
        (output / f'{name}.private.bin').write_bytes(stock[address-BASE:address-BASE+length])
    prefix = 'm68k-elf-'
    for tool in ['as', 'ld', 'nm', 'objcopy', 'objdump']:
        if not shutil.which(prefix + tool):
            parser.error('m68k-elf binutils must be on PATH')

    def run(*argv):
        return subprocess.check_output(argv, cwd=output, text=True)

    run(prefix+'as', '-mcpu=54455', '-o', 'slots.o', str(HERE/'slots.s'), str(HERE/'names.s'))
    run(prefix+'ld', '-e', 'slot_dispatch', '-Ttext', hex(PLACEMENT), '-o', 'slots.elf', 'slots.o')
    run(prefix+'objcopy', '-O', 'binary', 'slots.elf', 'slots.private.bin')
    symbols = {}
    for line in run(prefix+'nm', '--defined-only', 'slots.elf').splitlines():
        address, _, name = line.split()
        symbols[name] = int(address, 16)
    (output/'disassembly.private.txt').write_text(run(prefix+'objdump', '-d', 'slots.elf'))
    image = bytearray(stock)
    code = (output/'slots.private.bin').read_bytes()
    offset = PLACEMENT-BASE
    if PLACEMENT+len(code) > 0x400d7bbc or any(stock[offset:offset+len(code)]):
        raise ValueError('private solo-image code span is not empty')
    image[offset:offset+len(code)] = code
    writes = []

    def write(address, value):
        offset = address-BASE
        writes.append({'address': hex(address), 'bytes': len(value),
                       'originalSha256': hashlib.sha256(stock[offset:offset+len(value)]).hexdigest()})
        image[offset:offset+len(value)] = value

    def word(address, value):
        write(address, struct.pack('>I', value))

    for address, symbol in [(0x4009ef60, 'slot_dispatch'), (0x4009f0fe, 'slot_assignment'),
                            (0x4009fd84, 'slot_sequence_pb'), (0x4009fdf8, 'slot_sequence_at'),
                            (0x4003a88e, 'slot_setup_clamp')]:
        write(address, struct.pack('>HI', 0x4ef9, symbols[symbol]))
    write(0x4003fc44, struct.pack('>HIH', 0x4ef9, symbols['slot_setup_press'], 0x4e71))
    descriptor = 0x400d42f4
    write(descriptor+0x3a, b'PB\0\0\0\0AT\0\0\0\0')
    write(0x4004e474, struct.pack('>HI', 0x4ef9, symbols['slot_label']))
    write(0x4003fbc4, struct.pack('>HIHH', 0x4ef9, symbols['slot_setup_label'], 0x4e71, 0x4e71))
    for index in range(2):
        word(descriptor+0xb2+4*index, 129)
        word(descriptor+0xe2+4*index, symbols['slot_format'])
        word(descriptor+0x112+4*index, 0x400467a4)
    word(descriptor+0x18e, 0x11111111)
    for address, length, symbol in [(0x4004c40c,8,'names_header'), (0x4004ae08,8,'names_open'),
                                    (0x40036548,8,'names_setup_draw'), (0x4007ddd0,6,'names_confirm')]:
        write(address, struct.pack('>HI',0x4ef9,symbols[symbol])+(b'\x4e\x71' if length == 8 else b''))
    (output/'candidate.private.bin').write_bytes(image)
    receipt = {'stockSha256': STOCK, 'candidateSha256': hashlib.sha256(image).hexdigest(),
               'sourceSha256': hashlib.sha256((HERE/'slots.s').read_bytes()).hexdigest(),
               'namesSourceSha256': hashlib.sha256((HERE/'names.s').read_bytes()).hexdigest(),
               'imageBytes': len(code), 'placement': hex(PLACEMENT), 'symbols': symbols, 'writes': writes,
               'qualification': 'unqualified emulator experiment; placement not approved'}
    (output/'receipt.json').write_text(json.dumps(receipt, indent=2)+'\n')
    print(json.dumps({'candidateSha256': receipt['candidateSha256'], 'writes': len(writes)}))


if __name__ == '__main__':
    main()
