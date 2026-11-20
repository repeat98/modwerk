#!/usr/bin/env python3
"""Build the reviewed USB 0.2 layouts from licensed source, without firmware.

Only the reviewed descriptor generator is executed. Native manifests are read
as AST data. Stock MSC bytes and the post-fader curve are zero placeholders;
the engine fills them from the user's verified 1.40C image locally.
"""
import argparse
import ast
import hashlib
import importlib.util
import json
import pathlib
import struct
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'sdk/octabam/modules/usb-audio-out-tracks-main-cue/layouts'
OUTPUT = ROOT / 'src/engine/assets/usb-audio-packages.json'
REVISION = '7b2984c859732ae6c797ae49c7d61d250b1b6519'
VERSION = '0.2.0-experimental'
LAYOUTS = [('tracks-main-cue', 0, 'TRACKS MAIN CUE', 20), ('tracks', 1, 'TRACKS', 16),
           ('tracks-post', 5, 'TRACKS POST', 16), ('main-cue', 3, 'MAIN CUE', 4),
           ('main', 4, 'MAIN', 2), ('master', 2, 'MASTER', 2)]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def recipes(filename):
    """Literal hook declarations; no manifest imports or source execution."""
    groups = {'detours': [], 'refs': [], 'pokes': []}
    tree = ast.parse((SOURCE / filename).read_text())
    for call in ast.walk(tree):
        if not isinstance(call, ast.Call) or not isinstance(call.func, ast.Name):
            continue
        kind = call.func.id
        if kind not in ('Detour', 'SymbolRef', 'Poke'):
            continue
        def value(node):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == 'H':
                return bytes.fromhex(ast.literal_eval(node.args[0]))
            return ast.literal_eval(node)
        args = [value(node) for node in call.args]
        if kind == 'Detour':
            address, expected, unit, symbol, note = args
            options = {key.arg: value(key.value) for key in call.keywords}
            groups['detours'].append(dict(address=address, guardLength=len(expected), guardSha256=digest(expected), unit=unit, symbol=symbol, writeLength=options.get('pad_to', 6), note=note))
        elif kind == 'SymbolRef':
            address, expected, unit, symbol, note = args
            groups['refs'].append(dict(address=address, guardLength=4, guardSha256=digest(expected.to_bytes(4, 'big')), unit=unit, symbol=symbol, note=note))
        else:
            address, expected, replacement, note = args
            groups['pokes'].append(dict(address=address, guardLength=len(expected), guardSha256=digest(expected), code=replacement.hex(), note=note))
    return groups


def elf_symbols(data):
    table = struct.unpack_from('>I', data, 32)[0]
    count = struct.unpack_from('>H', data, 48)[0]
    headers = [struct.unpack_from('>10I', data, table + i * 40) for i in range(count)]
    symbols = next(h for h in headers if h[1] == 2)
    strings = headers[symbols[6]]
    names = data[strings[4]:strings[4] + strings[5]]
    result = {}
    for at in range(symbols[4], symbols[4] + symbols[5], 16):
        name, offset, _, _, _, section = struct.unpack_from('>IIIBBH', data, at)
        result[bytes(names[name:names.index(0, name)]).decode()] = (section, offset)
    return headers, result


def build():
    spec = importlib.util.spec_from_file_location('usb_descriptors', SOURCE / 'descriptors.py')
    descriptors = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(descriptors)
    sources = {p.name: digest(p.read_bytes()) for p in sorted(SOURCE.iterdir()) if p.is_file() and p.suffix in ('.s', '.py')}
    with tempfile.TemporaryDirectory(prefix='modwerk-usb-source-') as directory:
        work = pathlib.Path(directory)
        def assemble(label, source, include='', post=False):
            unit = work / (label + ('-post' if post else ''))
            unit.mkdir(exist_ok=True)
            (unit / 'remix.inc').write_text(include)
            target = unit / 'unit.o'
            subprocess.run(['m68k-elf-as', '-mcpu=54455', '-I', str(unit), '-o', str(target), str(SOURCE / source)], check=True, capture_output=True)
            data = bytearray(target.read_bytes())
            headers, symbols = elf_symbols(data)
            copies = []
            curve = None
            if label == 'usbmidi_cfg':
                for symbol, address in [('cfg_fs', 0x400e201c), ('cfg_hs', 0x400e203c), ('cfg_os_fs', 0x400e205c), ('cfg_os_hs', 0x400e207c)]:
                    section, offset = symbols[symbol]
                    start = headers[section][4] + offset + 9
                    inherited = bytes(data[start:start + 23])
                    data[start:start + 23] = bytes(23)
                    copies.append(dict(section=section, offset=offset + 9, source=address + 9, bytes=23, sha256=digest(inherited)))
            if post:
                section, offset = symbols['post_xlv']
                assert data[headers[section][4] + offset:headers[section][4] + offset + 1024] == bytes(1024)
                curve = dict(section=section, offset=offset, words=256, address=0x6c00)
            return dict(label=label, source=source, bytes=len(data), sha256=digest(data), code=data.hex(), stockCopies=copies, curve=curve)
        common = [assemble('usbmidi', 'usbmidi.s'), assemble('usbmidi_rx', 'usbmidi_rx.s'), assemble('usbmidi_clamp', 'clamp.s')]
        layouts = []
        for name, define, key, channels in LAYOUTS:
            include = f'.set USB_LAYOUT, {define}\n.set USB_IN, 0\n'
            if define == 5:
                include += '.macro POST_XLV_TABLE\n.rept 256\n.long 0\n.endr\n.endm\n'
            audio = assemble('usbaudio', 'usbaudio.s', include, define == 5)
            cfg = assemble('usbmidi_cfg', 'cfg.s', descriptors.remix_inc({'USB MIDI', 'USB AUDIO OUT ' + key}))
            layouts.append(dict(id=name, define=define, key='USB AUDIO OUT ' + key, channels=channels, objects=[audio, cfg]))
    audio, midi = recipes('audio-manifest.py'), recipes('midi-manifest.py')
    midi['detours'] = [row for row in midi['detours'] if row['address'] != 0x4001e606]
    hooks = {key: audio[key] + midi[key] for key in audio}
    assert len(hooks['detours']) == 14 and len(hooks['refs']) == 4 and len(hooks['pokes']) == 1
    return dict(schema=1, version=VERSION, revision=json.loads((ROOT / 'sdk/catalog.json').read_text())['sourceRevision'], upstreamRevision=REVISION, sources=sources, common=common, layouts=layouts, hooks=hooks)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    content = json.dumps(build(), indent=2) + '\n'
    if args.check:
        existing = json.loads(OUTPUT.read_text()) if OUTPUT.exists() else {}
        for field in ('sourceCommit', 'moduleVersions'):
            existing.pop(field, None)
        if existing != json.loads(content):
            raise SystemExit('USB Audio packages differ from the reviewed source build.')
        print('USB Audio: six layouts reproduced; no firmware input.')
    else:
        OUTPUT.write_text(content)
        print('Wrote source-only USB Audio packages: six layouts + shared MIDI RX.')
