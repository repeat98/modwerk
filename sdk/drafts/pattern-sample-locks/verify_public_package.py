#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Exercise the normal package CLI in a private catalogue fixture, never publish."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
HASH = lambda data: hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('out', 'stock', 'upstream', 'tested-package'):
        parser.add_argument('--' + name, type=Path, required=True)
    a = parser.parse_args()
    out = a.out.resolve()
    if out == ROOT or ROOT in out.parents:
        parser.error('Use a new private output outside Git')
    out.mkdir(parents=True, exist_ok=False)
    stage = out / 'private-app'; stage.mkdir()
    print('Staging independent SDK/catalogue fixture outside Git', flush=True)
    shutil.copytree(ROOT / 'sdk', stage / 'sdk', ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
    folder = stage / 'sdk/octabam/modules/pattern-sample-locks'
    shutil.copytree(HERE, folder, ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
    (stage / 'scripts').mkdir()
    for name in ('octatrack-module-packages.py', 'octatrack-reconstruction.py'):
        shutil.copy2(ROOT / 'scripts' / name, stage / 'scripts' / name)
    for name in ('src/catalog/module-documents.json', 'src/engine/assets/dsp-packages.json'):
        target = stage / name; target.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(ROOT / name, target)
    catalog_path = stage / 'sdk/catalog.json'
    catalog = json.loads(catalog_path.read_text())
    catalog['modules'].append(dict(id='pattern-sample-locks', version='0.1.8-experimental', addedAt='2026-10-30T00:00:00Z'))
    catalog_path.write_text(json.dumps(catalog))
    manifest = stage / 'src/engine/assets/octatrack-module-packages.json'
    manifest.write_text(json.dumps(dict(schema=1, packages=[dict(id='pattern-sample-locks', version='0.1.8-experimental',
        name='Pattern Sample Locks', octabam=True, unitName='SAMPLE LOCKS', reconstruction=True, usbOnly=True)])))
    command = [sys.executable, '-B', str(stage / 'scripts/octatrack-module-packages.py'), '--upstream', str(a.upstream), '--stock', str(a.stock)]
    logs = []
    def run(extra=()):
        result = subprocess.run([*command, *extra], cwd=stage, capture_output=True, text=True)
        logs.append(dict(arguments=list(extra), exitCode=result.returncode, output=result.stdout + result.stderr))
        (out / 'public-cli.private.log').write_text('\n'.join(row['output'] for row in logs))
        return result
    print('Normal public wrapper build with unchanged stock scans', flush=True)
    built = run()
    assert built.returncode == 0, built.stdout + built.stderr
    written = manifest.read_bytes()
    entry = json.loads(written)['packages'][0]
    package = (stage / 'public' / entry['path']).read_bytes()
    assert package == a.tested_package.read_bytes(), 'Normal public path differs from fully tested reconstruction package'
    print('Normal public wrapper --check, including both stock scans', flush=True)
    checked = run(['--check'])
    assert checked.returncode == 0 and 'identical' in checked.stdout, checked.stdout + checked.stderr
    assert manifest.read_bytes() == written
    shutil.copy2(stage / 'public' / entry['path'], out / 'pattern-sample-locks-0.1.8-public-path.mwrm')
    # Diagnostics and test sources are not reconstruction inputs. Exercise a
    # real public build after editing them, not just a source-list assertion.
    diagnostic_sources = [folder / name for name in ('scanner_probe.c', 'test_engine.c', 'test_ui.c')]
    diagnostic_before = {path: path.read_bytes() for path in diagnostic_sources}
    try:
        for path, before in diagnostic_before.items():
            path.write_bytes(before + b'\n/* Reconstruction regression: test-only edit. */\n')
        checked_tests = run(['--check'])
        assert checked_tests.returncode == 0 and 'identical' in checked_tests.stdout, checked_tests.stdout + checked_tests.stderr
    finally:
        for path, before in diagnostic_before.items():
            path.write_bytes(before)
    source = folder / 'unit.s'
    source_before = source.read_bytes()
    recipe_path = stage / 'sdk/machines/octatrack/module-adapters/reconstruction-recipes.json'
    recipe_before = recipe_path.read_bytes()
    negatives = []
    def expect_refusal(name, marker):
        result = run(['--check'])
        assert result.returncode != 0 and marker in result.stdout + result.stderr, (name, result.stdout, result.stderr)
        negatives.append(dict(case=name, refused=True, exitCode=result.returncode))
    try:
        source.write_bytes(source_before + b'\n\n')
        expect_refusal('changed native source, unchanged assembled instructions', 'source inputs changed')
    finally:
        source.write_bytes(source_before)
    for name, mutate, marker in (
        ('protected bootloader source', lambda r: r['copies'][1].update(address=0x400dfec2), 'patchable OS range'),
        ('changed final package pin', lambda r: r.update(packageSha256='0' * 64), 'exact tested package hash'),
        ('foreign source provenance', lambda r: r['copies'][0]['authored'].update(source='../foreign.s'), 'this module'),
    ):
        try:
            document = json.loads(recipe_before)
            mutate(document['modules']['pattern-sample-locks'])
            recipe_path.write_text(json.dumps(document))
            expect_refusal(name, marker)
        finally:
            recipe_path.write_bytes(recipe_before)
    try:
        document = json.loads(written); del document['packages'][0]['reconstruction']; manifest.write_text(json.dumps(document))
        expect_refusal('missing reconstruction opt-in exposes original strict-scan rejection', 'fails at 12')
    finally:
        manifest.write_bytes(written)
    assert source.read_bytes() == source_before and recipe_path.read_bytes() == recipe_before
    assert (stage / 'public' / entry['path']).read_bytes() == package
    report = dict(hardware=False, published=False, privateCatalogueFixtureOnly=True,
                  normalPublicBuildPassed=True, normalPublicCheckPassed=True, bothStockScansPassed=True, usbOnly=entry['usbOnly'],
                  packageSha256=HASH(package), bytes=len(package), byteIdenticalToEmulatorTestedPackage=True,
                  negativeCliChecks=negatives, testAndDiagnosticEditsRemainIdentical=True,
                  nativeInputsRestoredAfterNegativeProbes=True,
                  helperSha256=HASH(Path(__file__).read_bytes()),
                  inputs={str(path.relative_to(ROOT)): HASH(path.read_bytes()) for path in
                          (ROOT / 'scripts/octatrack-module-packages.py', ROOT / 'scripts/octatrack-reconstruction.py', ROOT / 'sdk/machines/octatrack/module-adapters/reconstruction-recipes.json')},
                  limitations='Private catalogue fixture only; real catalogue and qualification remain unchanged. No device or new runtime claim.')
    (out / 'public-path.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({key: report[key] for key in ('packageSha256', 'bytes', 'normalPublicBuildPassed', 'normalPublicCheckPassed', 'byteIdenticalToEmulatorTestedPackage')}, indent=2))


if __name__ == '__main__':
    main()
