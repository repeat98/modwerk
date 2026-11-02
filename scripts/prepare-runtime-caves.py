#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Prepare private CC Map/Recorder Loop Fix ABI 7 ports; never enables publication or USB writes.

Capture hash-only inputs first; review a reconstruction recipe, then replay it.
Requires the immutable #486 builder snapshot and an exact private base image/map.
No firmware, stock spans or unqualified package enters a repository.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import struct
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(ROOT / 'sdk'))  # firmware_codec
import firmware_codec  # noqa: E402
TRUSTED_BUILDER = 'e86283a61338a85634089ad68b01117355dda65a'
STOCK_MAIN_SHA = '164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e'


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


def sha(data):
    return hashlib.sha256(data).hexdigest()


def trusted_root(root):
    root = root.expanduser().resolve()
    head = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
    if head != TRUSTED_BUILDER or subprocess.check_output(['git', '-C', str(root), 'status', '--porcelain', '--untracked-files=no'], text=True).strip():
        raise ValueError('--builder-root must be the clean, immutable reviewed #486 snapshot ' + TRUSTED_BUILDER)
    return root


def private_output(path):
    path = path.expanduser().resolve()
    trees = subprocess.check_output(['git', '-C', str(ROOT), 'worktree', 'list', '--porcelain'], text=True)
    for line in trees.splitlines():
        if line.startswith('worktree ') and path.is_relative_to(Path(line[9:]).resolve()):
            raise ValueError('Private output must be outside every repository worktree.')
    if path.exists():
        raise ValueError('Use a new private output directory; existing files are never overwritten.')
    path.mkdir(mode=0o700, parents=True)
    return path


def base_binding(symbols, main):
    arena, pool = symbols.get('arena_base'), symbols.get('pool')
    start, end = symbols.get('__bss_start'), symbols.get('__bss_end')
    if any(type(value) is not int for value in (arena, pool, start, end)) or not (0x40a955e0 < arena < 0x47f00000 and start <= pool and pool + 786432 <= end):
        raise ValueError('Private base map must contain the moved arena and the bounded 768 KiB runtime pool.')
    for address in (0x4000045e, 0x4000046c, 0x400004c8):
        at = address - 0x40000400
        if at + 4 > len(main) or struct.unpack_from('>I', main, at)[0] != arena:
            raise ValueError('Private base image/map disagree on the moved audio arena.')
    return arena, (pool + 0x08001000, pool + 0x08004000)


def check_guard(stock, address, n, digest):
    at = address - 0x40000400
    if at < 0 or at + n > len(stock) or sha(stock[at:at + n]) != digest.hex():
        raise ValueError('A site/copy hash does not identify the original stock OS at %#x.' % address)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--module', required=True, choices=('cc-map', 'recorder-loop-fix'))
    ap.add_argument('--builder-root', type=Path, required=True)
    ap.add_argument('--upstream', type=Path, default=Path.home() / '.cache/modwerk-upstream/elekloader')
    ap.add_argument('--stock-main', type=Path, required=True, help='Private original extracted 1.40C MAIN; exact SHA-256 checked')
    ap.add_argument('--base-image', type=Path, required=True, help='Private candidate MAIN, never a flash instruction')
    ap.add_argument('--base-symbols', type=Path, required=True)
    ap.add_argument('--out', type=Path, required=True, help='New private directory outside Git')
    ap.add_argument('--cross', default='m68k-elf-')
    mode = ap.add_mutually_exclusive_group(required=True)
    mode.add_argument('--capture', action='store_true', help='Hash-only recipe/proofs, no package emitted')
    mode.add_argument('--recipe', type=Path, help='Reviewed source/image/span-hash-pinned reconstruction')
    args = ap.parse_args()
    root = trusted_root(args.builder_root)
    args.upstream = args.upstream.expanduser().resolve()
    os.umask(0o077)
    out = private_output(args.out)
    stock = args.stock_main.read_bytes()
    if sha(stock) != STOCK_MAIN_SHA:
        raise ValueError('Stock input is not the pinned original Octatrack 1.40C MAIN.')
    base = args.base_image.read_bytes(); mapping = json.loads(args.base_symbols.read_text())
    arena, origins = base_binding(mapping, base)
    firmware_codec.use_elekloader(args.upstream.expanduser().resolve())
    from elekloader.sdk import octabam
    sdk = root / 'sdk/octabam'
    builder = load('runtime_cave_builder', root / 'sdk/runtime/loader/build.py')
    recipe_builder = load('runtime_cave_stock_recipe', root / 'sdk/machines/octatrack/module-adapters/stock_recipe.py')
    scanner = load('runtime_cave_scanner', root / 'sdk/machines/octatrack/elekloader/module_packages.py')
    adapter = load('runtime_cave_adapter', ROOT / 'sdk/machines/octatrack/module-adapters/cave_runtime.py')
    module = octabam.Octabam(str(sdk)).modules[args.module]
    concrete = {str(path.relative_to(root)): path for path in (
        root / 'sdk/runtime/loader/build.py', root / 'sdk/machines/octatrack/module-adapters/stock_recipe.py',
        root / 'sdk/machines/octatrack/elekloader/module_packages.py', sdk / ('modules/' + args.module + '/manifest.py'),
        sdk / ('modules/' + args.module + '/octamod.module.json'), sdk / 'tools/remix/schema.py')}
    concrete.update({'adapter/' + str(path.relative_to(ROOT)): path for path in (
        ROOT / 'scripts/prepare-runtime-caves.py', ROOT / 'sdk/machines/octatrack/module-adapters/cave_runtime.py')})
    for path in (args.upstream / 'elekloader/sdk/octabam.py', args.upstream / 'elekloader/formats.py'):
        concrete['upstream/' + path.relative_to(args.upstream).as_posix()] = path
    for cave in module.cf_patches:
        for path in adapter.source_files(sdk, cave.source):
            concrete['sdk/octabam/' + path.relative_to(sdk).as_posix()] = path
    concrete.update({'private/base-image': args.base_image, 'private/base-symbols': args.base_symbols, 'private/stock-main': args.stock_main})
    before = {name: sha(path.read_bytes()) for name, path in concrete.items()}
    image, bss, offsets, sites, copies, sources, proof = adapter.prepare_caves(module, sdk, builder, out / 'compile', args.cross, arena, pool_origins=origins)
    if any(sources.get(name) not in (None, digest) for name, digest in before.items()):
        raise ValueError('A cave source changed before it was assembled.')
    sources.update(before)
    for address, digest, _, _, _, n in sites:
        check_guard(stock, address, n, digest)
    for _, address, n, digest in copies:
        check_guard(stock, address, n, digest)
    if args.capture:
        (out / 'recipe.json').write_text(json.dumps(dict(schema=1, imageSha256=sha(image), sources=sources, copies=[], fills=[]), indent=2) + '\n')
        emitted, recipe_copies = image, []
    else:
        records = json.loads(args.recipe.read_text())
        if records.get('fills'):
            raise ValueError('These cave ports have no reviewed constant-fill initializer.')
        emitted, recipe_copies, _ = recipe_builder.apply(image, offsets, records, sources)
        for _, address, n, digest in recipe_copies:
            check_guard(stock, address, n, digest)
        spans = [(at, n) for at, _, n, _ in copies + recipe_copies]
        if any(a < c + d and c < a + b for i, (a, b) in enumerate(spans) for c, d in spans[:i]):
            raise ValueError('Reconstruction overlaps a declared replay placeholder.')
        adapter.validate_relocations(emitted, offsets, len(emitted) + bss, spans)
    package = builder.package(emitted, bss, [], offsets, sites, name=args.module, hashed=True,
                              title=adapter.PORTS[args.module][0], layout=1, copies=copies + recipe_copies)
    overlaps = [{'offset': at, 'nonZeroBytes': n} for at, n in sorted(scanner.runs(package, stock).items()) if n >= scanner.LIMIT]
    receipt = dict(schema=1, module=args.module, version=json.loads((sdk / ('modules/' + args.module + '/octamod.module.json')).read_text())['version'],
        builderCommit=TRUSTED_BUILDER, adapterSourceCommit=subprocess.check_output(['git', '-C', str(ROOT), 'rev-parse', 'HEAD'], text=True).strip(),
        sources=sources, stockMainSha256=sha(stock), baseImageSha256=sha(base), baseSymbolsSha256=sha(args.base_symbols.read_bytes()),
        arenaBase=arena, imageBytes=len(emitted), bssBytes=bss, relocations=offsets,
        sites=[dict(address=address, bytes=len(code), stockSha256=digest.hex()) for address, digest, code, _, _, _ in sites],
        copies=[dict(offset=at, address=address, bytes=n, sha256=digest.hex()) for at, address, n, digest in copies + recipe_copies],
        proofs=proof, packageSha256=sha(package), stockOverlapLimit=scanner.LIMIT, stockOverlaps=overlaps,
        packageWritten=not args.capture and not overlaps,
        limitations=['Private adapter preparation only; public catalogue/base/admission unchanged.', 'No physical USB install, MIDI/audio/recorder runtime or timing validation.', 'No Part/project/physical reboot persistence evidence.'])
    # Re-read all concrete files to detect an input edit during compilation.
    trusted_root(root)
    if any(sha(path.read_bytes()) != before[name] for name, path in concrete.items()):
        raise ValueError('A pinned source, stock or private base input changed during preparation.')
    if not args.capture and not overlaps:
        output = out / (args.module + '.mwrm'); output.write_bytes(package)
        if sha(output.read_bytes()) != receipt['packageSha256']:
            output.unlink(); raise ValueError('Saved private package hash differs.')
    (out / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    if not args.capture:
        if overlaps:
            raise ValueError('Strict stock-overlap scan failed; review explicit authored reconstruction spans. No package written.')
    for path in out.rglob('*'):
        path.chmod(0o700 if path.is_dir() else 0o600)
    print(json.dumps({'module': args.module, 'capture': args.capture, 'packageWritten': receipt['packageWritten'], 'imageBytes': len(image),
                      'relocations': len(offsets), 'sites': len(sites), 'poolProofs': len(proof['poolLinks']), 'stockOverlaps': len(overlaps)}))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, subprocess.CalledProcessError) as error:
        print(str(error), file=sys.stderr); raise SystemExit(1) from error
