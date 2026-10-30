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


def lag_guard(builder, check):
    """USB packages at an older version than the catalogue, by manifest index.

    A declared lag ("lagsBehind": the catalogue version it lags, "lagReason": why,
    with its issue) stays published as it is: its source has moved on, so it
    cannot be rebuilt. Remove both keys to rebuild it. With --check any other lag,
    or a lag note left behind, fails without a toolchain, so CI catches a release
    that left its USB package behind. Kept here, not in the builder, whose source
    the base pins."""
    manifest = json.loads(builder.MANIFEST.read_text())
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


def run(builder):
    try:
        builder.main()
    except subprocess.CalledProcessError as error:
        print(error.stdout or '', end='', file=sys.stderr)
        print(error.stderr or '', end='', file=sys.stderr)
        raise SystemExit(error.returncode) from error


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
    dropped: sdk/runtime/loader/abi9.py) plus `requires`, `claims` and `entries`, and its stock-free scan covers the
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
    # A C runtime module: its row's "sources" and "subscribe" go to build.py as they are. It has no card form
    # (src/catalog/usb-only.ts). build.py takes its id and unit name from the output's stem, so build at <id>.mwrm.
    # Here, not in the builder, whose source the base pins.
    sourced, tools = getattr(builder, 'build', None), getattr(builder, 'tools', None)
    def c_build(entry, out, *args, **kwargs):
        if not entry.get('sources'):
            return sourced(entry, out, *args, **kwargs)
        named = out.parent / (entry['id'] + '.mwrm')
        subprocess.run([sys.executable, '-B', str(builder.BUILD), *entry['sources'],
                        *[arg for hook in entry.get('subscribe', []) for arg in ('--subscribe', hook)], '-o', str(named)],
                       check=True, capture_output=True, text=True, cwd=APP)
        out.write_bytes(named.read_bytes())
        return out.read_bytes()
    if sourced and tools:
        builder.build = c_build
        builder.tools = lambda entry, upstream: bool(shutil.which('m68k-elf-gcc')) if entry.get('sources') else tools(entry, upstream)
    # The qualified builder's JSON:KEY syntax predates Windows drive letters.
    # Use its documented relative-path form, without altering any base input.
    builder.DSP = builder.DSP.relative_to(APP)
    if hasattr(builder, 'capabilities'):
        builder.capabilities, builder.dsp_words = engines(only_key_bus(builder.capabilities), builder.dsp_words)
    os.chdir(APP)
    # Python's -X utf8 does not propagate to the builder's Python children.
    os.environ['PYTHONUTF8'] = '1'
    if '--prepare-ports' in sys.argv[1:]:
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
    main()
