#!/usr/bin/env python3
"""Prepare an isolated, unpublished Air Chorus 0.1.1 test tree.

Copies tracked repository source with git archive, overlays this draft, and
uses the existing module tests/builders. Never reads or copies firmware.
The original checkout and published module/packages stay untouched.
"""
import argparse
import hashlib
import io
import json
import pathlib
import shutil
import subprocess
import tarfile

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[2]
MODULE = pathlib.Path('sdk/octabam/modules/airwindows-chorus')
VERSION = '0.1.1-experimental'
BASELINE = 'fa200e6d4d74b5b372b390a208c05195a516afc914eec9f796e8baee480c265b'
OVERLAYS = ('chorus.asm', 'verify_bounds.py', 'verify_optimization.py', 'benchmark.py')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=pathlib.Path, required=True,
                        help='A new private directory, outside the repository')
    args = parser.parse_args()
    output = args.output.resolve()
    if output.exists() or output.is_relative_to(ROOT):
        parser.error('Choose a new output directory outside the repository')
    if sha(ROOT/MODULE/'chorus.asm') != BASELINE:
        parser.error('Published DSP changed; review/rebase this draft before staging')
    revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    archive = subprocess.check_output(['git', 'archive', '--format=tar', revision], cwd=ROOT)
    output.mkdir(parents=True)
    with tarfile.open(fileobj=io.BytesIO(archive)) as files:
        # Only tracked source; firmware, local caches and credentials are absent.
        files.extractall(output, filter='data')
    module = output/MODULE
    if sha(module/'chorus.asm') != BASELINE:
        raise SystemExit('Archived baseline differs from the reviewed published source')
    baseline = output/'air-chorus-baseline'
    baseline.mkdir()
    shutil.copyfile(module/'chorus.asm', baseline/'chorus.asm')
    for name in OVERLAYS:
        shutil.copyfile(HERE/name, module/name)
    manifest = json.loads((module/'octamod.module.json').read_text())
    manifest['version'] = VERSION
    manifest['tests']['hardwareStatus'] = 'untested'
    manifest['tests']['summary'] = 'Unpublished efficiency candidate; hardware qualification and publication are pending.'
    (module/'octamod.module.json').write_text(json.dumps(manifest, indent=2)+'\n')
    # Existing measurement helpers originally named the initial release.
    # Their code/fixtures are reused; only report labels follow this candidate.
    for name in ('benchmark.py', 'build_private.py', 'verify_instances.py', 'verify_stress.py'):
        path = module/name
        path.write_text(path.read_text().replace("'version':'0.1.0-experimental'", "'version':'"+VERSION+"'"))
    catalog_path = output/'sdk/catalog.json'
    catalog = json.loads(catalog_path.read_text())
    for entry in catalog['modules']:
        if entry['id'] == 'airwindows-chorus':
            entry['version'] = VERSION
    catalog_path.write_text(json.dumps(catalog, indent=2)+'\n')
    notes_path = output/'src/community/module-changelogs.json'
    notes = json.loads(notes_path.read_text())
    notes['modules']['airwindows-chorus'].insert(0, {
        'version': VERSION, 'date': '2026-10-09',
        'changes': [
            'Reduces DSP work while preserving the full stereo delay range, control smoothing and bit-identical output in the recorded comparison fixtures.',
            'Unpublished hardware-test candidate. FX2 only; physical timing, Part/project reload and reboot verification are pending.'
        ]})
    notes_path.write_text(json.dumps(notes, indent=2)+'\n')
    record = {'candidateVersion': VERSION, 'baseCommit': revision,
              'baselineAssemblySourceSha256': BASELINE,
              'overlays': {name: sha(module/name) for name in OVERLAYS},
              'hardwareStatus': 'untested', 'publicationStatus': 'staged'}
    (output/'air-chorus-preparation.json').write_text(json.dumps(record, indent=2)+'\n')
    print(json.dumps(record, indent=2))
    print('Prepared:', output)
    print('Existing qualification/package records are historical. This tree cannot publish without fresh qualification.')


if __name__ == '__main__':
    main()
