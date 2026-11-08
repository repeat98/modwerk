#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Prepare PRIVATE stock-free standalone/hybrid runtime ports; never publish or flash.

Use an explicitly trusted immutable ABI8 builder checkout, not a caller-provided
MCP path. Capture first; review every coincident authored span separately, then
supply its source/image/span-pinned stock recipe. The selected builder's original
StockCopy/fill implementation, stock guards, two-origin linker and both strict
stock-free scanners remain mandatory. This does not add catalogue admission or
hardware qualification. Original images, recipes and proofs stay outside Git.

Example (Node 24 and native ColdFire binutils on PATH):
  python3 -B scripts/prepare-runtime-spans.py playmodes --builder-root /trusted/checkout \
    --builder-commit EXACT_COMMIT --upstream /trusted/elekloader --stock /private/OS.bin \
    --output-dir /private/preparation --capture
  # Review capture.json; add copies with authored provenance (source, lines,
  # symbol, method), without adding literal instruction bytes. Then repeat with
  # --recipe /private/reviewed.json instead of --capture.
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
import tempfile

sys.path.append(str(Path(__file__).resolve().parents[1] / 'sdk'))  # sdk/, for firmware_codec
import firmware_codec  # noqa: E402
MODULES = ('playmodes', 'tapeecho', 'euclid')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


private_paths = load('runtime_private_paths', Path(__file__).with_name('runtime_private_paths.py'))
private_directory, save = private_paths.private_directory, private_paths.save


def source_hashes(root, upstream):
    paths = subprocess.check_output(['git', '-C', str(root), 'ls-files', 'sdk/octabam', 'sdk/runtime/loader',
                                    'sdk/machines/octatrack/module-adapters', 'sdk/machines/octatrack/elekloader',
                                    'src/engine', 'src/catalog', 'src/config/inventory.ts',
                                    'scripts/octatrack-module-page.mjs'], text=True).splitlines()
    inputs = {p: digest((root / p).read_bytes()) for p in paths
              if Path(p).suffix in ('.py', '.s', '.S', '.c', '.h', '.asm', '.inc', '.json', '.ts', '.mjs')
              and not '/media/' in p and not '/evidence/' in p}
    inputs.update(firmware_codec.inputs(upstream))  # the checkout's files it runs, and the codec it runs them with
    return inputs


def validate_review(image, relocations, recipe, sources, root, stock_at):
    """Extra provenance/guard requirements around the trusted builder's apply().

    A line range and symbol identify the authored assembly or emitter reviewed by
    a developer. They do not replace compilation or grant a scanner exemption.
    """
    if recipe.get('schema') != 1 or recipe.get('imageSha256') != digest(image) or recipe.get('sources') != sources:
        raise ValueError('The recipe no longer names the exact source/image inputs.')
    # Guarded copies cover explicitly reviewed authored coincidences. Repeated
    # constant fills need their own source review and remain outside this CLI.
    if recipe.get('fills'):
        raise ValueError('Instruction-span preparation does not admit constant fills.')
    spans = []
    for item in recipe.get('copies', []):
        at, n, address = item.get('offset'), item.get('length'), item.get('address')
        if (any(type(value) is not int for value in (at, n, address)) or at < 0 or not 0 < n <= 32 or
                at + n > len(image) or not 0 <= address <= 0xffffffff or address + n > 0x100000000):
            raise ValueError('A copy needs a bounded image and stock span.')
        if any(at < old + length and old < at + n for old, length in spans) or any(at < r + 4 and r < at + n for r in relocations):
            raise ValueError('A copy overlaps another copy or a relocation word.')
        authored = item.get('authored', {})
        source, lines = authored.get('source'), authored.get('lines')
        if (not isinstance(source, str) or source not in sources or source.startswith('upstream/') or
                not isinstance(lines, list) or len(lines) != 2 or any(type(v) is not int for v in lines) or
                not 1 <= lines[0] <= lines[1] or not authored.get('symbol') or
                authored.get('method') not in ('native-unit', 'native-formatter', 'authored-emitter') or not item.get('purpose')):
            raise ValueError('Every copy needs reviewed authored source, lines, symbol and method.')
        path = (root / source).resolve()
        if not path.is_relative_to(root.resolve()) or digest(path.read_bytes()) != sources[source] or lines[1] > len(path.read_text().splitlines()):
            raise ValueError('The authored provenance no longer matches its source.')
        span = image[at:at + n]
        if digest(span) != item.get('sha256') or stock_at(address, n) != span:
            raise ValueError('A reviewed span differs from compiled code or checked stock.')
        spans.append((at, n))


def stock_free(data, main, haystacks, packages, scanner):
    views = [data, *packages.dsp_words(data)]
    blocked = [{"view": i, "offset": at, "nonzero": n} for i, view in enumerate(views)
               for at, n in packages.runs(view, main).items() if n >= packages.LIMIT]
    legacy = scanner.stock_runs({'sections': {'package': {'parts': [['hex', data.hex()]]}}}, haystacks, 16)
    if blocked or legacy:
        raise ValueError('The unchanged strict stock-free scanners refused the package (%d/%d runs).' % (len(blocked), len(legacy)))


def compile_image(builder, root, upstream, module, cross, resources, folder):
    """The unchanged standalone builder path plus private two-origin captures."""
    captured, original = {}, builder.link_units
    def capture(objects, prefix, origin, temporary, anywhere=False):
        result = original(objects, prefix, origin, temporary, anywhere)
        captured.update(symbols=result[1], origin=origin)
        elf = temporary / ('%x.elf' % (origin + builder.SHIFT))
        with tempfile.TemporaryDirectory(prefix='native-', dir=folder) as work:
            high = Path(work) / 'high.raw'
            subprocess.run([prefix + 'objcopy', '-O', 'binary', '-j', '.image', str(elf), str(high)], check=True, capture_output=True)
            captured['high'] = high.read_bytes()
        return result
    builder.link_units = capture
    try:
        documents = json.loads((root / 'src/catalog/module-documents.json').read_text())['modules']
        title = next(m['name'] for m in documents if m['id'] == module)
        dsp = None
        if module != 'playmodes':
            pkg = next(p for p in json.loads((root / 'src/engine/assets/dsp-packages.json').read_text())['packages'] if p['id'] == module)
            dsp = builder.dsp_section(pkg, resources.slots, resources.cycles, resources.cycles_kind,
                                      resources.state, resources.buffer, title, resources.layout)
        page, relocations = builder.page_section(module) if dsp else (b'', [])
        origin = (len(page) + 15) & ~15
        unit, bss, offsets, sites, copies = builder.octabam_units(module, origin, cross, upstream, dsp=bool(dsp))
        image = page + bytes(origin - len(page)) + unit
        return dict(image=image, bss=bss, offsets=relocations + [origin + r for r in offsets], sites=sites,
                    copies=copies, flags=3 if dsp else 0, dsp=dsp, title=title, **captured)
    finally:
        builder.link_units = original


def relocated(image, offsets, base):
    result = bytearray(image)
    for at in offsets:
        struct.pack_into('>I', result, at, (struct.unpack_from('>I', result, at)[0] + base) & 0xffffffff)
    return bytes(result)


def reconstruct_proof(data, original, builder, verifier, stock_at):
    image, offsets, sites, copies, fills = verifier.unpack_recipe(data)
    rebuilt = bytearray(image)
    for offset, address, n, guard in copies:
        span = stock_at(address, n)
        if hashlib.sha256(span).digest() != guard:
            raise ValueError('Reconstruction copy guard failed.')
        rebuilt[offset:offset + n] = span
    for offset, n, value in fills:
        rebuilt[offset:offset + n] = bytes([value]) * n
    normalized_sites = [(addr, guard, code, list(local), keep, checked) for addr, guard, code, local, keep, checked in sites]
    if bytes(rebuilt) != original['image'] or list(offsets) != original['offsets'] or normalized_sites != original['sites']:
        raise ValueError('Reconstruction changed authored code, relocations or stock sites.')
    high = relocated(rebuilt, offsets, builder.SHIFT)
    if high[original['origin']:] != original['high']:
        raise ValueError('Reconstruction differs from fresh native assembly at the second origin.')
    dsp = original['dsp']
    payload = (struct.pack('>%dI' % len(dsp['words']), *dsp['words']) +
               struct.pack('>%dH' % len(dsp['relocations']), *dsp['relocations'])) if dsp else b''
    if payload and data[-len(payload):] != payload:
        raise ValueError('The reconstructed package changed the DSP payload.')
    return dict(origins=[0, builder.SHIFT], imageSha256=digest(rebuilt), relocatedSha256=digest(high),
                unchangedSites=len(sites), unchangedDsp=True)


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('module', choices=MODULES)
    parser.add_argument('--builder-root', required=True, type=Path)
    parser.add_argument('--builder-commit', required=True)
    parser.add_argument('--upstream', required=True, type=Path)
    parser.add_argument('--stock', required=True, type=Path)
    parser.add_argument('--output-dir', required=True, type=Path)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--capture', action='store_true'); mode.add_argument('--recipe', type=Path)
    parser.add_argument('--cross', default='m68k-elf-')
    parser.add_argument('--slots', choices=('fx1', 'fx2', 'both'))
    parser.add_argument('--cycles', type=int); parser.add_argument('--cycles-kind', choices=('executed', 'modeled', 'hardware'))
    parser.add_argument('--state', type=int); parser.add_argument('--buffer', type=int, default=0)
    parser.add_argument('--layout', type=int, default=1)
    args = parser.parse_args()
    if args.module != 'playmodes' and any(getattr(args, k) is None for k in ('slots', 'cycles', 'cycles_kind', 'state')):
        parser.error('Hybrid ports need explicit source-backed DSP resource figures and their measurement kind.')
    root, upstream = args.builder_root.expanduser().resolve(), args.upstream.expanduser().resolve()
    commit = subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip()
    if commit != args.builder_commit or len(commit) != 40:
        parser.error('The explicitly trusted builder checkout changed commit.')
    protected = ('sdk/octabam', 'sdk/runtime/loader', 'sdk/machines/octatrack/module-adapters',
                 'sdk/machines/octatrack/elekloader', 'src/engine', 'src/catalog', 'src/config/inventory.ts',
                 'scripts/octatrack-module-page.mjs')
    if subprocess.run(['git', '-C', str(root), 'diff', '--quiet', 'HEAD', '--', *protected]).returncode:
        parser.error('The trusted builder inputs have uncommitted changes.')
    folder = private_directory(args.output_dir)
    before = source_hashes(root, upstream)
    builder = load('runtime_span_builder', root / 'sdk/runtime/loader/build.py')
    recipe_impl = load('runtime_span_recipe', root / 'sdk/machines/octatrack/module-adapters/stock_recipe.py')
    verifier = load('runtime_span_verify', root / 'sdk/runtime/loader/verify_static.py')
    packages = load('runtime_span_packages', root / 'sdk/machines/octatrack/elekloader/module_packages.py')
    scanner = load('runtime_span_scanner', root / 'sdk/machines/octatrack/elekloader/check_stock_free.py')
    firmware_codec.use_elekloader(upstream); from elekloader import formats
    stock, device, release = formats.load(str(args.stock))
    stock_image = formats.main_image(stock, device)
    if device.key != 'octatrack' or release.version != '1.40C' or digest(stock_image) != release.main_sha256:
        raise ValueError('Preparation needs the fingerprint-verified original Octatrack 1.40C.')
    def stock_at(address, length):
        at = address - device.main_load
        if at < 0 or at + length > len(stock_image):
            raise ValueError('Stock span lies outside the original MAIN image.')
        return stock_image[at:at + length]
    compiled = compile_image(builder, root, upstream, args.module, args.cross, args, folder)
    image, copies, fills = compiled['image'], compiled['copies'], []
    if args.capture:
        if before != source_hashes(root, upstream):
            raise ValueError('Build inputs changed during capture.')
        save(folder / 'capture.json', dict(schema=1, imageSha256=digest(image), sources=before,
                                          symbols=compiled['symbols'], copies=[], fills=[]))
        save(folder / 'authored-image.raw', image)
        save(folder / 'fresh-high.raw', compiled['high'])
        print('Private capture saved; review spans before preparing a package. No qualification granted.')
        return
    recipe = json.loads(args.recipe.read_text())
    validate_review(image, compiled['offsets'], recipe, before, root, stock_at)
    image, extra, fills = recipe_impl.apply(image, compiled['offsets'], recipe, before)
    copies += extra
    builder.check_stock(compiled['sites'] + [(addr, guard, b'', [], 0, n) for _, addr, n, guard in copies], args.stock, upstream)
    data = builder.package(image, compiled['bss'], [], compiled['offsets'], compiled['sites'], name=args.module,
                           dsp=compiled['dsp'], flags=compiled['flags'], hashed=True, title=compiled['title'],
                           layout=args.layout, copies=copies, fills=fills, abi=8)
    proof = reconstruct_proof(data, compiled, builder, verifier, stock_at)
    stock_free(data, stock_image, scanner.haystacks(args.stock, upstream), packages, scanner)
    if before != source_hashes(root, upstream):
        raise ValueError('Build inputs changed during preparation.')
    save(folder / (args.module + '.mwrm'), data)
    save(folder / 'proof.json', dict(module=args.module, builderCommit=commit, bytes=len(data), sha256=digest(data),
                                   preparationToolSha256=digest(Path(__file__).read_bytes()),
                                   reviewedRecipeSha256=digest(args.recipe.read_bytes()),
                                   sourceFingerprint=digest(json.dumps(before, sort_keys=True).encode()),
                                   resources={k: getattr(args, k) for k in ('slots', 'cycles', 'cycles_kind', 'state', 'buffer', 'layout')},
                                   requirements=packages.capabilities(data), reconstruction=proof,
                                   stockFree={'strictNonzero': packages.LIMIT, 'legacyBytes': 16, 'passed': True},
                                   qualification='private preparation only; hardware, persistence and composition unqualified'))
    print('%s: private ABI8 preparation passed both strict scans and two-origin reconstruction; %d sites, %d copies.' %
          (args.module, len(compiled['sites']), len(copies)))


if __name__ == '__main__':
    main()
