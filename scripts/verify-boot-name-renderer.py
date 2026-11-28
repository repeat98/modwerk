#!/usr/bin/env python3
"""Private MKII boot-name check using the original panel routine in ot_emu.

Requires a local decoded MAIN OS image and a runnable reviewed headless emulator.
No stock code, font tables, firmware or raw logs enter the repository or CI.
"""
import argparse
import ast
import hashlib
import json
import os
from pathlib import Path
import re
import struct
import subprocess
import tempfile
import zlib

ROOT = Path(__file__).resolve().parents[1]
BASE = 0x40000400
PANEL_START, PANEL_END = 0x400d81a8, 0x400db3d4
PANEL_HASH = 'c9ac2aaf571095437cf73dd1d532383841027c5197e33f6989c314cb1ad42347'
PANEL_ADDRESS_DELTA = 0x400cc1a0  # MAIN's copy = actual panel flash address + delta
FONT, FONT_BYTES = 0xed78, 128 * 8
DRAW_CHARACTER = 0x400d9a62      # unchanged copy of panel routine at 0xd8c2


def sha(data):
    return hashlib.sha256(data).hexdigest()


def empty_card(directory):
    # Reuse only the existing pure FAT16 builder. Its module-level emulator
    # imports require Unicorn; the builder itself has no emulator dependency.
    source = ROOT / 'sdk/octabam/tools/emu/emu_card.py'
    names = {'_short_name', '_lfn_checksum', '_lfn_entries', '_dir_entry', '_Fat16', 'build_image'}
    nodes = [node for node in ast.parse(source.read_text()).body
             if isinstance(node, (ast.FunctionDef, ast.ClassDef)) and node.name in names]
    assert len(nodes) == len(names)
    namespace = {'os': os, 'struct': struct, 'SECTOR': 512, '_SKIP': {'.DS_Store'}}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(source), 'exec'), namespace)
    directory.mkdir()
    return namespace['build_image'](str(directory))


def png(pixels):
    # Exact observed name cells, x48..127 / y0..7, nearest-neighbour scale 8.
    scale, width, height = 8, 80, 8
    raw = b''.join(b'\0' + bytes(pixels[y // scale][48 + x // scale]
                                for x in range(width * scale))
                   for y in range(height * scale))
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width * scale, height * scale, 8, 0, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


def capture(emulator, image_path, card, output, name, text, font):
    pokes = {FONT + i: byte for i, byte in enumerate(font)}
    for address, value in [(0x00800608, 7), (0x0080060c, 6)]:
        pokes.update({address + i: byte for i, byte in enumerate(value.to_bytes(4, 'big'))})
    seed = ';'.join(f'{address:#x}={value:#x}' for address, value in pokes.items())
    command = [str(emulator), '--image', str(image_path), '--mkii', '--ms', '6000',
               '--card', str(card), '--mount', '--load-ms', '90000', '--main-level', 'off', '--rtc', 'off',
               '--step', '-:poke:' + seed, '--watch-mem', '0xffff8004,27']
    for character in text:
        command += ['--step', f'-:call:{DRAW_CHARACTER:#x},{ord(character)}']
    run = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=120)
    (output / f'{name}.log').write_bytes(run.stdout)
    log = run.stdout.decode(errors='replace')
    if run.returncode or log.count('returned, d0 = 0x8') != 10 or 'DID NOT RETURN' in log:
        raise RuntimeError(f'{name}: original panel renderer did not return; inspect the private log')
    gpio, page, column = 0, 0, 0
    pixels = [[0] * 128 for _ in range(64)]
    transmitted = []
    for match in re.finditer(r'\[(0x[0-9a-f]+)\] <- (0x[0-9a-f]+|0) \(1\)', log):
        address, value = (int(word, 0) for word in match.groups())
        if address == 0xffff8004:
            gpio = value
        elif address == 0xffff801e:
            if gpio & 0x10:  # actual LCD data/command pin
                transmitted.append(value)
                assert 0 <= column < 128
                for bit in range(8):
                    pixels[63 - (page * 8 + 7 - bit)][column] = 255 if value & (1 << bit) else 0
                column += 1
            elif value & 0xf8 == 0xb0:
                page = value & 7
            elif value & 0xf0 == 0:
                column = (column & 0xf0) | (value & 15)
            elif value & 0xf0 == 0x10:
                column = (column & 15) | ((value & 15) << 4)
    expected = b''.join(font[ord(character) * 8:ord(character) * 8 + 8] for character in text)
    assert len(transmitted) == 80 and bytes(transmitted) == expected
    # Ensure this is the resident loader's ten cells, without clipping/wrapping.
    assert column == 128 and page == 7
    image = png(pixels)
    filename = f'boot-name-{name}.png'
    (output / filename).write_bytes(image)
    return {'text': text, 'originalRendererCallsReturned': 10, 'lcdDataBytes': 80,
            'lcdWritesMatchOriginalPanelFont': True,
            'pixelSha256': sha(bytes(value for row in pixels for value in row)),
            'png': filename, 'pngSha256': sha(image)}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--image', type=Path, required=True, help='private decoded MAIN OS')
    parser.add_argument('--emulator', type=Path, required=True, help='reviewed local ot_emu')
    parser.add_argument('--output', type=Path, required=True, help='new private directory outside the repository')
    args = parser.parse_args()
    output = args.output.resolve()
    if output == ROOT or ROOT in output.parents or output.exists():
        parser.error('Use a new private output directory outside the repository')
    image = args.image.read_bytes()
    assert sha(image[PANEL_START - BASE:PANEL_END - BASE]) == PANEL_HASH, 'Original panel image guard failed'
    font = image[PANEL_ADDRESS_DELTA + FONT - BASE:PANEL_ADDRESS_DELTA + FONT + FONT_BYTES - BASE]
    assert len(font) == FONT_BYTES
    name = re.search(r"FIRMWARE_VERSION = '([^']+)'", (ROOT / 'src/engine/protocol.ts').read_text()).group(1)
    assert re.fullmatch(r'[A-Z0-9. ]{1,10}', name), 'The boot name must fit the panel letter range and ten cells'
    name = name.rjust(10)  # the ELEK header right-justifies it
    output.mkdir(parents=True)
    with tempfile.TemporaryDirectory(prefix='modwerk-panel-') as scratch:
        scratch = Path(scratch)
        card = scratch / 'empty.img'
        card.write_bytes(empty_card(scratch / 'empty'))
        rows = [capture(args.emulator.resolve(), args.image.resolve(), card, output, key, text, font)
                for key, text in [('lowercase', name.strip().capitalize().rjust(10)), ('fixed', name), ('previous', 'OCTAMOD79 ')]]
    proof = {
        'kind': 'original-MKII-panel-renderer-headless-capture', 'sourceImageSha256': sha(image),
        'headlessEmulatorSha256': sha(args.emulator.read_bytes()), 'panelVersion': 8,
        'panelImageSha256': PANEL_HASH, 'captures': rows,
        'method': 'Boot the actual MAIN image as MKII with an empty disposable FAT16 card. Execute the unchanged embedded panel draw-character instructions through --step call at 0x400d9a62; PC-relative calls execute the original copied routines. Map the original panel font at its absolute address and seed the resident loader page 7 / cell 6 cursor. Capture actual GPIO/LCD command and data writes via --watch-mem and decode them to 128x64 pixels. Verify all 80 transmitted columns against the original panel font, then crop the observed ten cells at integer scale 8. No replacement glyphs, drawn labels or instruction patches.',
        'diagnosis': 'Lowercase codes select symbols, patterns or filled blocks. Uppercase ' + name.strip() + ' renders letters in the same ten cells.',
        'limits': ['Panel renderer function capture, not a full resident-loader boot or physical device.',
                   'MKI panel firmware/font is absent from MAIN and was not emulated.',
                   'No module state, audio or persistence qualification changed.'],
        'firmwareAndFontDataKeptPrivate': True,
    }
    (output / 'verification.json').write_text(json.dumps(proof, indent=2) + '\n')
    print('Three original panel-renderer captures passed; ' + name.strip() + ' fits without clipped cells.')


if __name__ == '__main__':
    main()
