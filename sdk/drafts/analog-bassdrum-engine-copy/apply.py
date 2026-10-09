"""Verify and stage the pinned engine-copy follow-up; keep the published SDK intact."""
import argparse
import hashlib
import json
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent


def digest(path):
    if path.is_symlink():
        raise ValueError('Source symlinks are prohibited: ' + str(path))
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify(sdk):
    record = json.loads((HERE / 'draft.json').read_text())
    for relative, expected in record['baseFiles'].items():
        if digest(sdk / relative) != expected:
            raise ValueError('Approved base changed: ' + relative)
    for relative, expected in record['candidateFiles'].items():
        if digest(HERE / relative) != expected:
            raise ValueError('Candidate changed: ' + relative)
    return record


def stage(sdk, output):
    record = verify(sdk)
    if output.exists() or output.resolve().is_relative_to(sdk.resolve()):
        raise ValueError('Use a new output directory outside the SDK')
    shutil.copytree(sdk, output, ignore=shutil.ignore_patterns('vendor', 'out', '__pycache__', '*.pyc', '.DS_Store'))
    shutil.copy2(HERE / 'machine.s', output / 'modules/analog-bassdrum/machine.s')
    manifest = output / 'modules/analog-bassdrum/octamod.module.json'
    document = json.loads(manifest.read_text())
    document['version'] = record['candidateVersion']
    manifest.write_text(json.dumps(document, indent=2) + '\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sdk', type=Path, default=HERE.parent.parent / 'octabam')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    if args.output:
        stage(args.sdk.resolve(), args.output.resolve())
    else:
        verify(args.sdk.resolve())
        print('PASS pinned approved base and private candidate sources')


if __name__ == '__main__':
    main()
