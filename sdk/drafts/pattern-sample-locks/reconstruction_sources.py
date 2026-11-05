#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Check candidate copy sources against committed module write declarations."""
import argparse
import hashlib
import json
from pathlib import Path

from prepare_beta_candidate import load

ROOT = Path(__file__).resolve().parents[3]
HASH = lambda data: hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--candidate', type=Path, required=True)
    a = parser.parse_args()
    out = a.candidate.resolve()
    if out == ROOT or ROOT in out.parents:
        parser.error('Use the private candidate directory outside Git')
    recipe = json.loads((out / 'candidate-recipe.json').read_text())
    for name, digest in recipe['sources'].items():
        assert HASH((ROOT / name).read_bytes()) == digest, 'Recipe source drift: ' + name
    static = load('psl_source_claims_parser', ROOT / 'sdk/runtime/loader/verify_static.py')
    manifest_path = ROOT / 'src/engine/assets/octatrack-module-packages.json'
    native_path = ROOT / 'src/engine/assets/requested-packages.json'
    manifest = json.loads(manifest_path.read_text())
    native = json.loads(native_path.read_text())
    claims, package_hashes = [], {}
    for entry in manifest['packages']:
        data = (ROOT / 'public' / entry['path']).read_bytes()
        assert HASH(data) == entry['sha256']
        package_hashes[entry['id']] = entry['sha256']
        _, _, sites, _, _ = static.unpack_recipe(data)
        for row in sites:
            claims.append((row[0], max(len(row[2]), row[5] if len(row) > 5 else len(row[1])), entry['id']))
    for group in native['groups']:
        for kind in ('detours', 'refs', 'pokes'):
            for row in group.get(kind, []):
                claims.append((row['address'], row['guardLength'], group['moduleId'] + ' native ' + kind))
        for table in group.get('tables', []):
            claims.extend((row['address'], 4, group['moduleId'] + ' table reference') for row in table['refs'])
    for record in recipe['copies']:
        address, length = record['address'], record['length']
        conflicts = [owner for start, count, owner in claims if address < start + count and start < address + length]
        assert not conflicts, (hex(address), conflicts)
    report = dict(hardware=False, packageCount=len(manifest['packages']), nativeDeclaredGroups=len(native['groups']),
                  patchSpansCompared=len(claims), copySourcesCompared=len(recipe['copies']), overlaps=[],
                  scope='Committed runtime sites and native requested detours/references/pokes/table references; not simultaneous runtime qualification.',
                  inputHashes={str(p.relative_to(ROOT)): HASH(p.read_bytes()) for p in (manifest_path, native_path)},
                  packageHashes=package_hashes, helperSha256=HASH(Path(__file__).read_bytes()))
    (out / 'source-declarations.json').write_text(json.dumps(report, indent=2) + '\n')
    print('PASS: %d copy sources avoid all %d declared patch spans' % (len(recipe['copies']), len(claims)))


if __name__ == '__main__':
    main()
