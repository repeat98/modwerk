#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Portable host entry point for the qualified Octatrack package builder."""
import importlib.util
import json
import os
import shutil
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

APP = Path(__file__).resolve().parents[1]


def preparing_ports():
    return any(arg.partition('=')[0] == '--prepare-ports' for arg in sys.argv[1:])


def lag_guard(builder, check):
    """USB packages at an older version than the catalogue, by manifest index.

    A declared lag ("lagsBehind": the catalogue version it lags, "lagReason": why,
    with its issue) stays published as it is: its source has moved on, so it
    cannot be rebuilt. Remove both keys to rebuild it. With --check any other lag,
    or a lag note left behind, fails without a toolchain, so CI catches a release
    that left its USB package behind. Kept here, not in the builder, whose source
    the base pins."""
    manifest = json.loads(builder.MANIFEST.read_text())
    rows = {}
    for entry in manifest['packages']:
        rows.setdefault(entry['id'], []).append(entry['version'])
    twice = {name: found for name, found in rows.items() if len(found) > 1}
    if twice:  # a merge that keeps both sides' rows; the builder would stop later on a reused work folder
        sys.exit('octatrack-module-packages.json lists a module more than once (%s): keep only the current version\'s row.'
                 % '; '.join('%s %s' % (name, ', '.join(found)) for name, found in sorted(twice.items())))
    versions = {m['id']: m['version'] for m in json.loads((APP / 'sdk/catalog.json').read_text())['modules']}
    held, failed = {}, 0
    for at, entry in enumerate(manifest['packages']):
        version = versions[entry['id']]
        if entry['version'] != version and entry.get('lagsBehind') == version:
            print('%-18s kept at %s, catalogue %s: %s' % (entry['id'], entry['version'], version, entry.get('lagReason')))
        elif check and (entry['version'] != version or 'lagsBehind' in entry):
            print('%-18s DIFFERS: the USB package is %s, the catalogue %s (lagsBehind %s); rebuild it' % (
                entry['id'], entry['version'], version, entry.get('lagsBehind')))
            failed = 1
        else:
            continue
        held[at] = entry
    return manifest, held, failed


def recipe_differences(recorded, current, has_upstream):
    """Describe source pin differences, excluding unavailable external inputs."""
    for path in sorted(recorded.keys() | current.keys()):
        if path.startswith('upstream/') and not has_upstream:
            continue
        if path not in current:
            yield 'missing ' + path
        elif path not in recorded:
            yield 'added ' + path
        elif current[path] != recorded[path]:
            yield 'changed ' + path


def check_packages(builder):
    """Explain source drift and partial checks without changing the pinned builder."""
    adapters = str(APP / 'sdk/machines/octatrack/module-adapters')
    if adapters not in sys.path:
        sys.path.append(adapters)
    import standalone_runtime

    tools_available, build = builder.tools, builder.build
    skipped = []

    def tools_for_check(entry, upstream):
        available = tools_available(entry, upstream)
        name = entry['id']
        if entry.get('standalone'):
            recipe = standalone_runtime.reviewed(APP, name)
            current = standalone_runtime.sources(APP, upstream, name)
            has_upstream = (upstream / 'elekloader/sdk/octabam.py').is_file()
            for detail in recipe_differences(recipe['sources'], current, has_upstream):
                print(f'{name} standalone recipe: {detail}', file=sys.stderr)
        if not available:
            skipped.append(name)
        return available

    def build_for_check(entry, *args, **kwargs):
        try:
            return build(entry, *args, **kwargs)
        except subprocess.CalledProcessError:
            print(f"{entry['id']}: package rebuild failed", file=sys.stderr)
            raise

    builder.tools, builder.build = tools_for_check, build_for_check
    try:
        builder.main()
    finally:
        builder.tools, builder.build = tools_available, build
        if skipped:
            sys.stdout.flush()
            print(f'Package rebuilds skipped ({len(skipped)}): {", ".join(skipped)}. '
                  'Install the required tools to verify these packages.', file=sys.stderr)


def run(builder):
    try:
        if preparing_ports():
            builder.main()
        elif '--check' in sys.argv[1:]:
            check_packages(builder)
        else:
            keep_published(builder, builder.main)
    except subprocess.CalledProcessError as error:
        print(error.stdout or '', end='', file=sys.stderr)
        print(error.stderr or '', end='', file=sys.stderr)
        raise SystemExit(error.returncode) from error


def keep_published(builder, action):
    """Run a write, then put back every published package it did not rewrite.

    The builder clears public/octatrack-modules before its first write, so a rebuild dropped every earlier
    version's .mwrm that main still publishes, and a run that stopped part way left the folder half empty.
    A file the run writes stays as written; one it removed comes back byte for byte, whether the run
    finished or not. Kept here, not in the builder, whose source the base pins."""
    folder = Path(builder.PUBLIC) / 'octatrack-modules'
    before = {path: path.read_bytes() for path in sorted(folder.rglob('*.mwrm'))} if folder.is_dir() else {}
    try:
        return action()
    finally:
        for path, data in before.items():
            if not path.exists():
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)


def only_key_bus(capabilities):
    """An ABI 9 package may require only the key bus: the one base feature the site accepts in a manifest
    (src/engine/elekloader/module-set.ts, BASE_DSP_FEATURES), so a package needing any other bit would make the whole
    published list inconsistent there and stop every USB sync. Checked here, not in the builder, whose source is a
    base input."""
    def checked(data):
        found = capabilities(data)
        if not found.get('requires'):
            return found
        registry = json.loads((APP / 'sdk/machines/octatrack/dsp-sites.json').read_text())
        keybus = next(f['bit'] for f in registry['features'] if f['name'] == 'keybus')
        if found['requires'] & ~keybus:
            raise ValueError('A published package may require only the key bus (requires %#x).' % found['requires'])
        return found
    return checked


def engines(capabilities, dsp_words):
    """ABI 10: a base-bound controller's engine for the base's hook sites (Analog BD: module-adapters/hook_engines.py).
    The pinned builder reads ABI 6 to 9; an engine package reads as its controller (the same records, its DSP part
    dropped: sdk/runtime/loader/abi9.py) plus `requires`, `claims` and `entries`, and its DSP words are the
    engine's words and its initial words. Here, not in the builder, whose source the base and the cave declarations pin."""
    spec = importlib.util.spec_from_file_location('module_packages_abi9', APP / 'sdk/runtime/loader/abi9.py')
    abi9 = importlib.util.module_from_spec(spec); spec.loader.exec_module(abi9)

    def parts(data):
        """(the controller as ABI 8, the engine's words then its initial words) of an ABI 10 package."""
        end = abi9._claims_end(data)
        words, count = struct.unpack_from('>IH', data, 32)
        claims, entries = data[78], data[79]
        init = sum(struct.unpack_from('>I', data, end + 12 * i + 8)[0] for i in range(claims) if data[end + 12 * i + 2] & 4)
        if (struct.unpack_from('>H', data, 4)[0] != 10 or data[39] or not entries or entries > 8 or words > 4096 or init > 4096
                or end + 12 * claims + 8 * entries + 4 * words + 2 * count + 4 * init != len(data)):
            raise ValueError('The published runtime package has an unsupported ABI 10 engine.')
        controller = data[:4] + struct.pack('>H', 8) + data[6:32] + bytes(18) + data[50:76] + data[80:end]
        at = end + 12 * claims + 8 * entries
        values = struct.unpack_from('>%dI' % words, data, at) + struct.unpack_from('>%dI' % init, data, at + 4 * words + 2 * count)
        return controller, values

    def engine_capabilities(data):
        if len(data) < 80 or data[:4] != b'MWRM' or struct.unpack_from('>H', data, 4)[0] != 10:
            return capabilities(data)
        found = capabilities(parts(data)[0])
        requires, claims, entries = struct.unpack_from('>HBB', data, 76)
        return dict(found, abi=10, requires=requires, claims=claims, entries=entries)

    def engine_words(data):
        if len(data) < 80 or data[:4] != b'MWRM' or struct.unpack_from('>H', data, 4)[0] != 10:
            return dsp_words(data)
        values = parts(data)[1]
        return [b''.join(v.to_bytes(3, order) for v in values) for order in ('big', 'little')]
    return engine_capabilities, engine_words


def titled(data, name):
    """A C package that subscribes to no event: build.py makes it ABI 4, with no name, and the site publishes only ABI 6
    and later. Repacked as the ABI 8 package build.py makes for a subscribing one (build_c: its trailing empty hook
    words dropped, its stem as its unit name), which the base's loader reads, so the unit's inventory names it too.
    Any other package comes back as it is. Here, not in the builder, whose source the base pins."""
    if struct.unpack_from('>H', data, 4)[0] != 4:
        return data
    spec = importlib.util.spec_from_file_location('octatrack_runtime_builder', APP / 'sdk/runtime/loader/build.py')
    runtime = importlib.util.module_from_spec(spec); spec.loader.exec_module(runtime)
    flags, image, bss, count, hooks, sites, ident = struct.unpack_from('>HIIIIII', data, 6)
    at = 32 + 4 * hooks
    if flags or sites or ident != runtime.module_id(name) or len(data) != at + image + 4 * count:
        raise ValueError('%s: not the ABI 4 package build.py makes from C sources.' % name)
    words = list(struct.unpack_from('>%dI' % hooks, data, 32))
    while words and words[-1] == runtime.NONE:
        words.pop()
    return runtime.package(data[at:at + image], bss, words, list(struct.unpack_from('>%dI' % count, data, at + image)),
                           name=name, abi=8, hashed=True, title=name[:15])


REST_FLAG = 0x80  # loader.h RUNTIME_SITE_RESTS: bit 7 of an ABI 7 site's length byte


def resting_references(data, addresses):
    """A row's "restingReferences": 0x addresses of 4-byte data sites (symbol references: stock pointers the module
    rewrites, such as a renderer table entry) that rest with the module as the detours its runtime.json "rests" names
    do. The loader puts back any resting site the same way, masked and a whole aligned word at a time, then calls
    modwerk_machine_site_restored, which retargets what stock copied from a renderer entry; the pinned builder flags
    detours only. So these get the flag here, in a package that already rests (a site the builder flagged).
    Here, not in the builder, whose source the base pins."""
    abi = struct.unpack_from('>H', data, 4)[0]
    if data[:4] != b'MWRM' or abi not in (7, 8):
        raise ValueError('restingReferences: an ABI 7 or 8 package only.')
    image, _, count, hooks, sites = struct.unpack_from('>IIIII', data, 8)
    at = (72 if abi == 7 else 76) + 4 * hooks + image + 4 * count  # the first site record (build.py package())
    wanted, out, rests = {int(a, 16): a for a in addresses}, bytearray(data), 0
    if len(wanted) != len(addresses):
        raise ValueError('restingReferences: each address once.')
    for _ in range(sites):
        address, length, relocations = struct.unpack_from('>I', data, at)[0], data[at + 4], data[at + 7]
        rests |= length & REST_FLAG
        if wanted.pop(address, None) is not None:
            if length & ~REST_FLAG != 4 or address & 3:
                raise ValueError('restingReferences: %#x is no aligned 4-byte data site.' % address)
            out[at + 4] |= REST_FLAG
        at += 40 + (length & ~REST_FLAG) + 2 * relocations
    if wanted or not rests:
        raise ValueError('restingReferences: ' + (', '.join(wanted.values()) + ' is no site of the package' if wanted else
                                                  'the package rests nothing of its own (no runtime.json "rests")'))
    return bytes(out)


def main():
    spec = importlib.util.spec_from_file_location(
        'octatrack_module_packages', APP / 'sdk/machines/octatrack/elekloader/module_packages.py')
    builder = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = builder
    spec.loader.exec_module(builder)
    # A catalogue name over the unit's 15 characters gets a shorter one on the unit: an entry's "unitName" becomes the
    # builder's --name. Here, not in the builder, whose source the base pins.
    build = getattr(builder, 'build', None)
    def named_build(entry, *args, **kwargs):
        if not entry.get('unitName'):
            return build(entry, *args, **kwargs)
        run_process = builder.subprocess.run
        builder.subprocess = type('Subprocess', (), {'run': staticmethod(
            lambda command, **options: run_process(command + ['--name', entry['unitName']], **options))})
        try:
            return build(entry, *args, **kwargs)
        finally:
            builder.subprocess = importlib.import_module('subprocess')
    if build:
        builder.build = named_build
    # A C runtime module: its row's "sources", "subscribe" and "raise" go to build.py as they are. It has no card form
    # (src/catalog/usb-only.ts). build.py takes its id and unit name from the output's stem, so build at <id>.mwrm; one
    # with no events goes out as ABI 8 too (titled()). Here, not in the builder, whose source the base pins.
    sourced, tools = getattr(builder, 'build', None), getattr(builder, 'tools', None)
    def c_build(entry, out, *args, **kwargs):
        if not entry.get('sources'):
            return sourced(entry, out, *args, **kwargs)
        if entry.get('sourceRecipe'):
            spec = importlib.util.spec_from_file_location('octatrack_source_runtime', APP / 'scripts/source-runtime-package.py')
            source_runtime = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(source_runtime)
            recipe = source_runtime.path_in(APP, entry['sourceRecipe'])
            doc, _, units, _, _, _, _ = source_runtime.declaration(APP, recipe)
            if doc['id'] != entry['id'] or entry['sources'] != [str(p.relative_to(APP)) for p, _ in units]:
                raise ValueError('Source recipe and package row must name the same module and complete source list')
            data, _ = source_runtime.build(APP, recipe, out, stock_at=kwargs.get('stock_at'))
            return data
        named = out.parent / (entry['id'] + '.mwrm')
        subprocess.run([sys.executable, '-B', str(builder.BUILD), *entry['sources'],
                        *[arg for hook in entry.get('subscribe', []) for arg in ('--subscribe', hook)],
                        *[arg for event in entry.get('raise', []) for arg in ('--raise', event)], '-o', str(named)],
                       check=True, capture_output=True, text=True, cwd=APP)
        out.write_bytes(titled(named.read_bytes(), entry['id']))
        return out.read_bytes()
    if sourced and tools:
        builder.build = c_build
        builder.tools = lambda entry, upstream: bool(shutil.which('m68k-elf-gcc')) if entry.get('sources') else tools(entry, upstream)
    # A package that carries an engine (hook_engines.PACKAGES, built through base_bound) also needs the native DSP
    # assembler, found as base_bound finds it. Without one, --check skips it as it skips the rest, and says why.
    gated = getattr(builder, 'tools', None)
    def engine_tools(entry, upstream):
        if not entry.get('base'):
            return gated(entry, upstream)
        adapters = str(APP / 'sdk/machines/octatrack/module-adapters')
        if adapters not in sys.path:
            sys.path.append(adapters)
        import base_bound
        import hook_engines
        if entry['id'] in hook_engines.PACKAGES and not (
                os.environ.get('ELEKLOADER_DSP_ASM') or shutil.which('dsp_asm') or base_bound.DSP_ASM.is_file()):
            print('%-18s needs dsp_asm: ELEKLOADER_DSP_ASM, PATH, or `npm run upstream:tools` with octabam built' % entry['id'])
            return False
        return gated(entry, upstream)
    if gated:
        builder.tools = engine_tools
    # An SDK-owned recipe preserves an ordinary CF runtime's exact tested
    # image while shipping guarded stock copies. This host layer keeps the
    # base's pinned builder and existing standalone declarations unchanged;
    # shared-input refreshes belong to the SDK change, outside module folders.
    ordinary = getattr(builder, 'build', None)
    def reconstructed_build(entry, out, *args, **kwargs):
        if 'reconstruction' not in entry:
            return ordinary(entry, out, *args, **kwargs)
        spec = importlib.util.spec_from_file_location('octatrack_host_reconstruction', APP / 'scripts/octatrack-reconstruction.py')
        reconstruction = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(reconstruction)
        reconstruction.module_folder(APP, entry)
        data = ordinary(entry, out, *args, **kwargs)
        data = reconstruction.reconstruct(APP, entry, data, stock_at=kwargs.get('stock_at'))
        out.write_bytes(data)
        return data
    if ordinary:
        builder.build = reconstructed_build
    # A row's "restingReferences" (resting_references()): last, on the package as built.
    built = getattr(builder, 'build', None)
    def resting_build(entry, out, *args, **kwargs):
        data = built(entry, out, *args, **kwargs)
        if not entry.get('restingReferences'):
            return data
        data = resting_references(data, entry['restingReferences'])
        out.write_bytes(data)
        return data
    if built:
        builder.build = resting_build
    # The qualified builder's JSON:KEY syntax predates Windows drive letters.
    # Use its documented relative-path form, without altering any base input.
    builder.DSP = builder.DSP.relative_to(APP)
    if hasattr(builder, 'capabilities'):
        builder.capabilities, builder.dsp_words = engines(only_key_bus(builder.capabilities), builder.dsp_words)
    os.chdir(APP)
    # Python's -X utf8 does not propagate to the builder's Python children.
    os.environ['PYTHONUTF8'] = '1'
    if preparing_ports():
        return run(builder)
    check = '--check' in sys.argv[1:]
    manifest, held, failed = lag_guard(builder, check)
    if not held:
        return run(builder)
    # The builder sees the manifest without the held packages; they go back in afterwards, file and row unchanged.
    real, kept = builder.MANIFEST, {entry['path']: (builder.PUBLIC / entry['path']).read_bytes() for entry in held.values()}
    with tempfile.TemporaryDirectory() as work:
        builder.MANIFEST = Path(work) / 'packages.json'
        builder.MANIFEST.write_text(json.dumps(dict(manifest, packages=[
            entry for at, entry in enumerate(manifest['packages']) if at not in held])))
        try:
            run(builder)
            code = 0
        except SystemExit as done:
            code = done.code
        if not check:
            for path, data in kept.items():  # the builder clears public/octatrack-modules before writing
                (builder.PUBLIC / path).parent.mkdir(parents=True, exist_ok=True)
                (builder.PUBLIC / path).write_bytes(data)
            if code in (0, 1):  # the builder wrote its manifest
                written = json.loads(builder.MANIFEST.read_text())
                for at in sorted(held):
                    written['packages'].insert(at, held[at])
                real.write_text(json.dumps(written, indent=2) + '\n')
    raise SystemExit(code or failed)


if __name__ == '__main__':
    try:
        main()
    except SystemExit as result:
        if result.code not in (None, 0):
            raise
    if preparing_ports() or {'--help', '-h'}.intersection(sys.argv[1:]):
        sys.exit(0)
    release_catalog = json.loads((APP / 'sdk/catalog.json').read_text())
    if any(row['id'] == 'usb-audio-out-tracks-main-cue' for row in release_catalog['modules']):
        # The configurable USB function owns one package outside the ordinary
        # effect list. Rebuild its bytes and binding with the same release.
        from argparse import ArgumentParser
        options = ArgumentParser(add_help=False)
        options.add_argument('--check', action='store_true')
        options.add_argument('--stock', type=Path)
        options.add_argument('--upstream', type=Path, default=Path.home() / '.cache/modwerk-upstream/elekloader')
        args, _ = options.parse_known_args()
        spec = importlib.util.spec_from_file_location('usb_audio_release', APP / 'scripts/octatrack-usb-audio-release.py')
        release = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(release)
        release.generate(args.check, args.stock, args.upstream)
