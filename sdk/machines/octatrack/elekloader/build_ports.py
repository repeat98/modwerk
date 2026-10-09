#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Prepare private source ports with the pinned Elekloader SDK and its checks.

Developer tooling only. No Octabam composer, firmware transport or device access.
"""
import argparse
import json
import os
from pathlib import Path
import runpy
import sys

from build_core import APP, git, private_output, sha


def register_platform(ob, name, module):
    """Expose an explicit internal dependency without moving or rewriting source.

    The pinned converter discovers modules/ only; Modwerk keeps USB MIDI in
    platform/. Never replace a discovered module or alias another module's key.
    """
    if name in ob.modules or name in ob.broken or module.key in ob.by_key:
        raise ValueError('Platform dependency collides with a discovered module: ' + name)
    if module.name != name or not module.key or not module.linked:
        raise ValueError('Platform dependency has an invalid module identity: ' + name)
    prefix = 'platform/' + name + '/'
    if any(not unit.source.startswith(prefix) or '..' in Path(unit.source).parts
           for unit in module.linked):
        raise ValueError('Platform dependency has source outside its folder: ' + name)
    ob.modules[name] = module
    ob.by_key[module.key] = name
    ob._ok.clear()


def source_inputs(root):
    """Hash original SDK implementation inputs, including generated-include helpers.

    Ignore private output, media and evidence. These hashes describe inspected
    source rather than interpreting the branch commit as hardware qualification.
    """
    extensions = {'.py', '.s', '.asm', '.c', '.h', '.inc'}
    return {str(p.relative_to(root)): sha(p.read_bytes())
            for folder in ('modules', 'platform', 'tools/remix', 'tools/build')
            for p in sorted((root / folder).rglob('*'))
            if p.is_file() and p.suffix in extensions}


def check_table_contract(module):
    # This pinned converter and its native check both append table entries.
    # Accepting an insertion would make them agree on the same wrong layout.
    for table in module.tables:
        if table.insert_at is not None and table.insert_at != table.count:
            raise ValueError('Pinned converter cannot prove table insertion: ' + table.label)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stock', type=Path, required=True)
    parser.add_argument('--upstream', type=Path, required=True)
    parser.add_argument('--core', type=Path, required=True, help='Explicit private format-2 core package to compare against.')
    parser.add_argument('--module', action='append', required=True, help='Source directory name; repeat for independent ports.')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--cross', default='m68k-elf-')
    args = parser.parse_args()
    if len(args.module) != len(set(args.module)):
        parser.error('Choose each source module once.')
    os.environ['ELEKLOADER_CROSS'] = args.cross
    upstream = args.upstream.resolve()
    pin = json.loads((APP / 'vendor/elekloader/kit/kit.json').read_text())['commit']
    if git(upstream, 'rev-parse', 'HEAD') != pin or git(upstream, 'status', '--porcelain', '--untracked-files=no'):
        parser.error('Use the exact clean tracked Elekloader checkout pinned by Modwerk.')
    sys.path.insert(0, str(upstream))
    from elekloader import elemod, formats
    from elekloader.sdk import build, octabam as port
    stock, device, release = formats.load(str(args.stock))
    image = formats.main_image(stock, device)
    if device.key != 'octatrack' or release.version != '1.40C' or sha(image) != release.main_sha256:
        parser.error('Original, unmodified Octatrack OS 1.40C required.')
    stock_pin, core_pin = sha(args.stock.read_bytes()), sha(args.core.read_bytes())
    core = elemod.load_any(str(args.core))
    if core.doc['elemod'] != 2 or core.id != 'core' or core.dev.key != device.key or core.rel.version != release.version:
        parser.error('Supply a linkable format-2 Octatrack 1.40C core.')
    root = APP / 'sdk/octabam'
    before = source_inputs(root)
    ob = port.Octabam(str(root))
    with port._in(ob.root):
        midi = runpy.run_path(str(root / 'platform/usb-midi/manifest.py'))['MODULE']
    register_platform(ob, 'usb-midi', midi)
    for name in args.module:
        if name not in ob.modules:
            parser.error('No source module found: ' + name)
    out = private_output(args.output)
    results = []
    for name in args.module:
        result = dict(module=name, status='failed')
        try:
            for member in port.members(ob, name):
                check_table_contract(ob.modules[member])
            # The converter prepares source/relocations only. Its check assembles
            # the author's units at the resulting addresses and verifies guards,
            # bus continuations and protected clones. No whole-image composer.
            plan = port.convert(ob, name, image, device, bus=True)
            source = port.write(ob, plan, str(out))
            path, mod = build.build(source, str(args.stock), str(out))
            checks = port.check(ob, plan, path, str(args.core), str(args.stock), str(out / (plan['id'] + '.check')))
            result.update(status='source-checked', package=Path(path).name,
                          packageSha256=sha(Path(path).read_bytes()), id=mod.id, version=mod.version,
                          members=plan['members'], checks=checks, notes=plan['notes'],
                          generatedSourceHashes={p: sha(data) for p, data in sorted(plan['files'].items())},
                          protectedClones=[dict(symbol=r['sym'], sourceAddress=hex(r['data'][0]),
                                                length=r['data'][1], references=[hex(a) for a in r['data'][2]])
                                           for r in plan['relocs']])
        except (port.Refused, port.CheckError, build.BuildError, elemod.ModError, OSError, ValueError) as error:
            # A partially emitted package is not a successful source port.
            result['error'] = str(error)
        results.append(result)
        print(name + ': ' + result['status'])
    if before != source_inputs(root) or sha(args.stock.read_bytes()) != stock_pin or sha(args.core.read_bytes()) != core_pin:
        raise ValueError('Source SDK, stock or core changed during the comparison.')
    report = dict(schema=1, kind='modwerk-elekloader-source-ports', upstream=pin,
                  sourceCommit=git(APP, 'rev-parse', 'HEAD'), sourceInputs=before,
                  recipeSha256=sha(Path(__file__).read_bytes()), stockSha256=stock_pin,
                  core=dict(id=core.id, version=core.version, sha256=core_pin), results=results,
                  productionReady=False, hardware='not tested', emulator='not tested',
                  limitations=['Static source ports, not runtime module packages or a USB updater.',
                               'Core plus module comparisons require the shared TypeScript verifier.',
                               'Exact selected-module logger identity and full catalogue qualification remain pending.',
                               'No boot, storage, audio, live sampling, host or hardware qualification.'])
    (out / 'source-proofs.json').write_text(json.dumps(report, indent=2) + '\n')
    return 0 if all(r['status'] == 'source-checked' for r in results) else 1


if __name__ == '__main__':
    sys.exit(main())
