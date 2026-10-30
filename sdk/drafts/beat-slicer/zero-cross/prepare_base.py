# SPDX-License-Identifier: MIT
"""Apply the private source proposal to a new, stock-free source directory.

Uses the existing SDK builders unchanged. The published base stays untouched;
this is preparation for owner review and private qualification, not a release.
"""
from pathlib import Path
import argparse
import hashlib
import json
import shutil
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
RELATIVE = Path('sdk/drafts/beat-slicer/zero-cross')


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None


def prepare(source, output, full=False):
    source, output = Path(source).resolve(), Path(output).resolve()
    if any(parent == output or parent in output.parents for parent in (source, HERE.parents[3])):
        raise ValueError('Keep private preparation output outside the checkout.')
    if output.exists():
        raise ValueError('The private output directory must be new.')
    manifest = json.loads((HERE / 'base-preimages.json').read_text())
    for name, expected in manifest['preimages'].items():
        if digest(source / name) != expected:
            raise ValueError('Base source changed; review and refresh the proposal: ' + name)
    output.mkdir(parents=True)
    if full:
        with tempfile.TemporaryFile() as archive:
            subprocess.run(['git', '-C', str(source), 'archive', 'HEAD'], stdout=archive, check=True)
            archive.seek(0)
            subprocess.run(['tar', '-xf', '-', '-C', str(output)], stdin=archive, check=True)
    else:
        # The normal C package builder reads the generated title catalogue,
        # even for a source-only descriptor fixture. Copy its exact tracked
        # bytes too, so minimal preparation works with ColdFire tools present.
        names = subprocess.check_output(['git', '-C', str(source), 'ls-files', '-z', '--',
                                         'sdk/', 'src/catalog/module-documents.json'])
        for raw in names.split(b'\0'):
            if not raw:
                continue
            name = raw.decode()
            path = source / name
            if path.is_file() or path.is_symlink():
                destination = output / name
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(path, destination, follow_symlinks=False)
    # Also works before the draft's first commit; copy only this original
    # source proposal, never ignored firmware, outputs or the developer cache.
    shutil.copytree(HERE, output / RELATIVE, dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
    for name, expected in manifest['preimages'].items():
        if digest(output / name) != expected:
            raise ValueError('Prepared base differs from its strict preimage: ' + name)
    patch = output / RELATIVE / 'base.patch'
    # Minimal staging has no root attributes file. Do not let a developer's
    # Windows autocrlf setting change the reviewed patch's source bytes.
    apply = ['git', '-c', 'core.autocrlf=false', 'apply', '--unidiff-zero']
    subprocess.run(apply + ['--check', str(patch)], cwd=output, check=True, capture_output=True)
    subprocess.run(apply + [str(patch)], cwd=output, check=True)
    (output / 'private-snap-staging.json').write_text(json.dumps({
        'status': 'private proposal; no publication or hardware qualification',
        'upstreamCommit': manifest['upstreamCommit'],
        'patchSha256': digest(patch),
    }, indent=2) + '\n')
    return output


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    print(prepare(args.source, args.output, full=True))
