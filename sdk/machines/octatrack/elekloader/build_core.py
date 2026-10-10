#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Private Modwerk core source recipe; all linking/packing belongs to Elekloader.

No stock bytes or generated packages are committed. No USB or hardware access.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

HERE = Path(__file__).resolve().parent
APP = HERE.parents[3]
VERSION = '0.3.1-modwerk-dev.1'
FIELDS = {'build': 17, 'os': 17, 'modules': 4096, 'configuration': 65,
          'source': 65, 'fx1': 1024, 'fx2': 1024, 'hidden': 1024}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args], text=True, stderr=subprocess.PIPE).strip()


def private_output(path):
    path = path.resolve()
    if path.exists():
        raise ValueError('Choose a new private output directory.')
    try:
        git(path.parent, 'rev-parse', '--show-toplevel')
    except subprocess.CalledProcessError:
        pass
    else:
        raise ValueError('All generated source, stock and packages must stay outside Git.')
    path.mkdir()
    return path


def ctext(value):
    if not isinstance(value, str) or any(ord(c) < 32 or ord(c) > 126 for c in value):
        raise ValueError('Logger identity must contain bounded printable ASCII.')
    return json.dumps(value, ensure_ascii=True)


def stock_reference(parts, offset, length, address):
    """Replace a zero source placeholder with an Elekloader stock-copy recipe.

    This changes data parts only, never layout, relocations or instructions.
    The linker recovers the guarded bytes from the owner's verified stock.
    """
    if not isinstance(offset, int) or not isinstance(length, int) or offset < 0 or length <= 0:
        raise ValueError('Stock replay requires a positive bounded source span.')
    before, after, at, found = [], [], 0, 0
    end = offset + length
    for part in parts:
        size = len(part[1]) // 2 if part[0] == 'hex' else part[2]
        lo, hi = max(at, offset), min(at + size, end)
        if lo >= hi:
            (before if at < offset else after).append(part)
        else:
            if part[0] != 'hex' or any(bytes.fromhex(part[1])[lo-at:hi-at]):
                raise ValueError('Stock replay is not a zero source placeholder.')
            if lo > at:
                before.append(['hex', part[1][:(lo-at)*2]])
            if hi < at + size:
                after.append(['hex', part[1][(hi-at)*2:]])
            found += hi-lo
        at += size
    if offset < 0 or found != length:
        raise ValueError('Stock replay is outside the source section.')
    return before + [['stock', hex(address), length]] + after


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stock', type=Path, required=True)
    parser.add_argument('--upstream', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--cross', default='m68k-elf-', help='Use Modwerk\'s reviewed GNU toolchain.')
    args = parser.parse_args()
    os.environ['ELEKLOADER_CROSS'] = args.cross
    upstream = args.upstream.resolve()
    pin = json.loads((APP / 'vendor/elekloader/kit/kit.json').read_text())['commit']
    if git(upstream, 'rev-parse', 'HEAD') != pin or git(upstream, 'status', '--porcelain', '--untracked-files=no'):
        parser.error('Use the exact clean tracked Elekloader checkout pinned by Modwerk.')
    sys.path.insert(0, str(upstream))
    from elekloader import formats, elemod, patch
    from elekloader.sdk import build as sdk
    stock, device, release = formats.load(str(args.stock))
    if device.key != 'octatrack' or release.version != '1.40C':
        parser.error('Original Octatrack 1.40C required.')
    image = formats.main_image(stock, device)
    if sha(image) != release.main_sha256:
        parser.error('Original, unmodified MAIN image required.')
    stock_sha = sha(args.stock.read_bytes())
    out = private_output(args.output)
    source = out / 'source'; source.mkdir()
    logger = APP / 'sdk/runtime/logging'
    guards = json.loads((logger / 'stock-guards.json').read_text())
    for key, guard in guards.items():
        at = guard['address'] - device.main_load
        if at < 0 or sha(image[at:at+guard['length']]) != guard['sha256']:
            raise ValueError('Logger stock ABI guard failed: ' + key)
    original_core = upstream / 'mods/core-ot'
    recipe = json.loads((original_core / 'mod.json').read_text())
    for name in ('core-ot.s', 'bus.s', 'gate.s'):
        shutil.copyfile(original_core / name, source / name)
    bootstrap = (source / 'core-ot.s').read_text()
    marker = '3:      clr.l   (%a1)+'
    if bootstrap.count(marker) != 1:
        raise ValueError('Pinned boot clear seam changed; review before porting.')
    bootstrap = bootstrap.replace(marker, '''3:      cmpa.l  #modwerk_retained_start + UNCACHED, %a1
        bne.s   5f
        lea     8192(%a1), %a1
        sub.l   #2048, %d0
        beq.s   4f
5:      clr.l   (%a1)+''')
    (source / 'core-ot.s').write_text(bootstrap)
    for p in logger.iterdir():
        if p.suffix in ('.c', '.h') and p.name != 'identity.c':
            shutil.copyfile(p, source / p.name)
    adapter = (source/'stock_140c.c').read_text()
    io_macro = '#define io octamod_log_io'
    if adapter.count(io_macro) != 1:
        raise ValueError('Logger I/O alias seam changed; review the port.')
    # Keep io an array lvalue: stock calls use sizeof io for its capacity.
    adapter = adapter.replace(io_macro,
        '#define io (*(uint8_t (*)[512])((uintptr_t)&octamod_log_retained + 6144u + 0x08000000u))\n'
        'typedef char modwerk_io_capacity[(sizeof io == 512)?1:-1];')
    (source/'stock_140c.c').write_text(adapter)
    upload = APP / 'sdk/runtime/upload'
    for name in ('upload.c', 'upload.h', 'sha256.c', 'wire.c', 'wire.h', 'vendor.c', 'vendor.h'):
        shutil.copyfile(upload / name, source / name)
    loader = APP / 'sdk/runtime/loader'
    for name in ('loader.c', 'loader.h', 'modwerk_module.h'):
        shutil.copyfile(loader / name, source / name)
    # The base owns the USB configuration and the EP0 unknown-request tail.
    spec = importlib.util.spec_from_file_location('modwerk_usb_base', HERE/'usb_base.py')
    usb = importlib.util.module_from_spec(spec); spec.loader.exec_module(usb)
    for name in ('ep0.c', 'runtime.c', 'runtime.h'):
        shutil.copyfile(HERE / name, source / name)
    (source/'usb_base.h').write_text(usb.header())
    (source/'usb_base.s').write_text(usb.assembly())
    # Identity describes this core-only private base. Later selections need
    # their complete module/version/chooser identities regenerated explicitly.
    inputs = {str(p.relative_to(APP)): sha(p.read_bytes()) for folder in (logger, upload, loader, HERE)
              for p in sorted(folder.iterdir()) if p.is_file() and p.suffix in ('.c', '.h', '.py', '.json')}
    inputs.update({'elekloader/' + p.name: sha(p.read_bytes()) for p in original_core.iterdir() if p.is_file()})
    artwork = APP / 'sdk/runtime/startup/artwork.json'
    inputs['sdk/runtime/startup/artwork.json'] = sha(artwork.read_bytes())
    inputs['sdk/runtime/startup/build.py'] = sha((artwork.parent/'build.py').read_bytes())
    source_hash = sha(json.dumps(inputs, sort_keys=True, separators=(',', ':')).encode())
    chooser = json.loads((APP/'src/engine/assets/chooser-metadata.json').read_text())
    configuration = dict(fx1=['NONE', *chooser['stockFx1']], fx2=['NONE', *chooser['stockFx2']],
                         hidden=[], logger='0.2.0', modules=[], os='1.40C', source=source_hash, stockfx2=True,
                         usb=dict(interfaces=['msc', 'modwerk-vendor'], vendor=1, submit=True, backend='runtime-loader-2'))
    identity = sha(json.dumps(configuration, separators=(',', ':')).encode())
    values = dict(build=identity[:16], os='1.40C', modules='', configuration=identity,
                  source=source_hash, fx1=';'.join(configuration['fx1']),
                  fx2=';'.join(configuration['fx2']), hidden='')
    definitions = '#include <stdint.h>\n#include "octamod_log_port.h"\n'
    # IDENTIFY reports this configuration identity as the installed base.
    definitions += 'const uint8_t modwerk_base_digest[32] = {%s};\n' % ','.join(
        '0x' + identity[i:i+2] for i in range(0, 64, 2))
    for key, size in FIELDS.items():
        if len(values[key]) >= size:
            raise ValueError('Logger identity field exceeds capacity: ' + key)
        definitions += f'char olog_{key}[{size}] = {ctext(values[key])};\n'
    definitions += 'const struct octamod_log_identity octamod_log_identity = {\n' + ','.join(
        'olog_' + key for key in FIELDS) + ',1};\n'
    definitions += 'typedef char retained_fits[(sizeof(struct octamod_log_retained_state)<=6144)?1:-1];\n'
    (source/'identity.c').write_text(definitions)
    # Only authored zero placeholders: stock is recovered by format-2 parts.
    spec = importlib.util.spec_from_file_location('modwerk_logger_package', logger/'package.py')
    package = importlib.util.module_from_spec(spec); spec.loader.exec_module(package)
    (source/'hooks.s').write_text(package.hooks(guards))
    (source/'retained.s').write_text('''.section .bss
.balign 512
.globl modwerk_retained_start, modwerk_retained_end, octamod_log_retained
modwerk_retained_start:
octamod_log_retained:
.skip 8192
modwerk_retained_end:
''')
    recipe.update(version=VERSION, title='Modwerk base prototype', author='irpina; Modwerk contributors',
                  license='GPL-3.0-or-later',
                  description='Private core-only Elekloader base with logger/startup, a USB vendor interface and a runtime module loader (hooks and stock-code sites); NOT a flash candidate.')
    recipe['sources'] += [p.name for p in sorted(source.glob('*.c'))] + ['hooks.s', 'retained.s', 'usb_base.s']
    recipe['cflags'] = ['-std=c99', '-ffreestanding', '-fno-builtin', '-fno-common',
                        '-fno-zero-initialized-in-bss', '-fno-tree-loop-distribute-patterns',
                        '-fno-merge-constants', '-fno-asynchronous-unwind-tables', '-fno-unwind-tables',
                        '-Wall', '-Wextra', '-Werror']
    for key in ('idle', 'job', 'transport', 'open', 'read', 'write', 'close'):
        guard = guards[key]; n = guard.get('patchLength', guard['length'])
        at = guard['address'] - device.main_load
        # The USB transport is serviced on the engine before the logger's idle hook.
        target = usb.IDLE_HOOK if key == 'idle' else 'olog_' + key + '_hook'
        recipe['sites'].append(dict(addr=hex(guard['address']), stock=image[at:at+n].hex(),
                                    op='jmp', target=target))
    recipe['sites'] += usb.sites(lambda addr, n: image[addr-device.main_load:addr-device.main_load+n])
    # The machine-neutral loader's events (sdk/runtime/loader/loader.h), from core-ot's bus.
    recipe.setdefault('subscribe', []).extend(dict(event='ev_' + e, fn='modwerk_runtime_' + e, order=90)
                                              for e in ('tick', 'draw', 'key', 'enc'))
    spec = importlib.util.spec_from_file_location('modwerk_startup', artwork.parent/'build.py')
    startup = importlib.util.module_from_spec(spec); spec.loader.exec_module(startup)
    for guard, authored in startup.writes():
        at = guard['address'] - device.main_load
        if sha(image[at:at+len(authored)]) != guard['sha256']:
            raise ValueError('Startup stock table guard failed.')
        recipe['sites'].append(dict(addr=hex(guard['address']), stock=image[at:at+len(authored)].hex(),
                                    op='bytes', new=authored.hex(), kind='data'))
    (source/'mod.json').write_text(json.dumps(recipe, indent=2)+'\n')
    path, _ = sdk.build(str(source), str(args.stock), str(out/'package'))
    document = json.loads(Path(path).read_text())
    for key in ('idle', 'job', 'transport', 'open', 'read', 'write', 'close'):
        section, offset = document['symbols']['olog_replay_' + key]
        guard = guards[key]; n = guard.get('patchLength', guard['length'])
        document['sections'][section]['parts'] = stock_reference(
            document['sections'][section]['parts'], offset, n, guard['address'])
    Path(path).write_text(json.dumps(document, indent=1)+'\n')
    mod = elemod.load_any(path)
    if set(mod.imports) - {'__run_load','__run_start','__run_words','__bss_start','__bss_words',
                      'arena_base','__arena_pages','__arena_fill','__arena_clear',
                      'ev_tick','ev_draw','ev_key','ev_enc','ev_midi','ev_frame'}:
        raise ValueError('Core has unexpected unresolved imports: ' + str(mod.imports))
    outputs, manifest = patch.build(str(args.stock), [path], version='ELEKLOADER')
    mapping = manifest.pop('_map')
    for ext, data in outputs.items():
        target = out / ('NOT_FLASH_CANDIDATE.' + ext); target.write_bytes(data)
        if sha(target.read_bytes()) != sha(data):
            raise ValueError('Saved file hash differs.')
    (out/'symbols.json').write_text(json.dumps(mapping, indent=2)+'\n')
    report = dict(schema=1, kind='modwerk-elekloader-base-prototype', coreVersion=VERSION,
                  upstream=pin, sources=inputs, configuration=configuration, configurationHash=identity,
                  packageSha256=sha(Path(path).read_bytes()), manifest=manifest,
                  savedHashes={ext:sha(data) for ext,data in outputs.items()},
                  productionReady=False, hardware='not tested', emulator='not tested',
                  limitations=['One ColdFire runtime module at a time (hooks on ev_tick, ev_draw, ev_key and ev_enc, stock-code sites) from a pool only a reboot reclaims; no data-table sites, MIDI or frame hooks, DSP resource manager or ledger allocation yet.',
                               'The base owns the USB configuration: USB MIDI/Audio cannot be combined with it yet.',
                               'Logger retention/ABI and modified bootstrap require emulator/hardware qualification.',
                               'Core-only identity; catalogue selections need exact configuration integration.'])
    (out/'proofs.json').write_text(json.dumps(report, indent=2)+'\n')
    if sha(args.stock.read_bytes()) != stock_sha:
        raise ValueError('Input stock file changed.')
    print('Private source-linked core prototype saved. Do not flash; qualification is pending.')


if __name__ == '__main__':
    main()
