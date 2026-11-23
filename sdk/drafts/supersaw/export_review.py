#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Export tracked source and bounded test reports only. Never build firmware or use USB."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile

HERE = Path(__file__).resolve().parent
ARCHIVE = 'SuperSAW-OT-V0.32-source-review.zip'
TEXT_SUFFIXES = {'', '.c', '.command', '.cpp', '.h', '.json', '.md', '.mjs', '.patch', '.py', '.s', '.svg', '.swift', '.txt'}

def public_report(value, removed, path=''):
    if isinstance(value, dict):
        result = {}
        for key, item in value.items():
            at = path + '/' + key
            if key.lower() in {'session', 'token', 'password', 'authorization', 'secret', 'access_token'}:
                removed.append(at)
                continue
            if key == 'signatures' and isinstance(item, str) and len(item) > 128:
                removed.append(at)
                result[key] = 'Raw signature memory buffer omitted from public export.'
                continue
            result[key] = public_report(item, removed, at)
        return result
    if isinstance(value, list):
        return [public_report(item, removed, path + '/' + str(i)) for i, item in enumerate(value)]
    return value

def export(out):
    repo = Path(subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], cwd=HERE, text=True).strip())
    relative = HERE.relative_to(repo)
    names = subprocess.check_output(['git', 'ls-files', '-z', '--', str(relative)], cwd=repo).decode().split('\0')
    if subprocess.check_output(['git', 'status', '--porcelain', '--', str(relative)], cwd=repo):
        raise RuntimeError('Commit the source snapshot before exporting it.')
    revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip()
    files, removed = {}, {}
    for name in filter(None, names):
        source = repo / name
        if source.is_symlink() or source.suffix not in TEXT_SUFFIXES:
            raise RuntimeError('Unsupported public source file: ' + name)
        key = str(source.relative_to(HERE))
        content = source.read_bytes()
        content.decode('utf8')
        if key.startswith('evidence/') and source.suffix == '.json':
            omissions = []
            value = public_report(json.loads(content), omissions)
            if omissions:
                content = (json.dumps(value, indent=2, ensure_ascii=False) + '\n').encode()
                removed[key] = omissions
        files[key] = content
    provenance = json.loads(files['provenance.json'])
    for name, digest in provenance['engine'].items():
        if hashlib.sha256(files['engine/' + name]).hexdigest() != digest:
            raise RuntimeError('Frozen engine changed: ' + name)
    manifest = {'sourceRevision': revision, 'scope': 'Source review only; no firmware or installable module.',
                'rawReportFieldsOmitted': removed,
                'sha256': {name: hashlib.sha256(data).hexdigest() for name, data in sorted(files.items())}}
    files['EXPORT_MANIFEST.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
    out.mkdir(parents=True, exist_ok=False)
    target = out / ARCHIVE
    with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for name, content in sorted(files.items()):
            info = zipfile.ZipInfo('SuperSAW-OT-V0.32/' + name, date_time=(2026, 11, 22, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, content)
    with zipfile.ZipFile(target) as archive:
        if archive.testzip() is not None:
            raise RuntimeError('Archive integrity check failed')
        for name, content in files.items():
            if archive.read('SuperSAW-OT-V0.32/' + name) != content:
                raise RuntimeError('Export roundtrip failed: ' + name)
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    review = f'''# SuperSAW-OT — current technical review snapshot

Updated 22 November 2026. Experimental source review; not an installable release.

[Download the source review archive]({ARCHIVE}) · [Development journal](JOURNAL.md)

Archive SHA-256: `{digest}`

Source revision of the local Modwerk contribution branch: `{revision}`.
This revision is not a commit in this standalone showcase repository.

## What is included

The V0.32 source draft, unchanged reference engine, source notices and licences,
SDK-facing bridge and declarations, host test clients, presentation material,
and historical/current test reports. A file-hash manifest is inside the archive.
The full Modwerk SDK and private test fixtures are separate prerequisites;
this archive is not a standalone build or installation tool.

No firmware, installable package, card image, compiled emulator or audio dump
is included. Five historical raw signature-memory fields are omitted from the
exported reports; all such omissions are listed in EXPORT_MANIFEST.json.
The local original reports remain unchanged.

## Current hardware evidence

On José Aleixo's Octatrack MKII, public Modwerk base 0.7.13:

- Unassigned RAM Trial/Undo passed with the exact previous identity restored.
- José reported sound on T1, sequencing, parameter locks, filter and delay,
  alongside short FLEX samples on T2–T4, without clicks or saturation.
- The timed listening exit failed with needs-recovery; a later check found
  normal mode and zero modules already at entry.
- After revising the host script to wait for operator confirmation, two
  consecutive short-mode checks confirmed Undo, previous identity and zero modules.

Exact tested private package SHA-256:
`52df3143854f203044dde02d82a634bf2e5d5e1723c1adcd8c0e11a7afe2f476`.
The reference engine is unchanged. Rebuilding this exact package through the
current public source recipe remains pending. Hardware tests of the private
package do not qualify an untested newly built public package.

Global CPU peaked at 57.1% over the full recorded listening session. This is
not an isolated renderer cost or a guarantee for other projects.

## Where to look in the archive

- REVIEW_REQUEST.md: detailed experimental review request.
- TESTING.md: chronological tests, failures and limits.
- SESSION_END_REVIEW.md: old timeout path and revised host confirmation flow.
- evidence/manual-confirm-v1-hardware-end-check-1.json and -2.json: two exits.
- SUBMISSION_STATUS.md: outstanding public packaging and qualification work.
- provenance.json and LICENSE files: frozen engine hashes and source attribution.

Public packaging, source/build parity, isolated renderer/rest cost, SW/1
absent-machine protection, saved projects, Keep and physical reboot remain
open. The underlying cause of the earlier firmware refusal is not established.
This snapshot has not been approved or listed by Modwerk.
'''
    (out / 'REVIEW.md').write_text(review)
    print(json.dumps({'archive': str(target), 'archiveBytes': target.stat().st_size,
                      'files': len(files), 'omittedFields': sum(map(len, removed.values())),
                      'archiveSha256': digest, 'sourceRevision': revision}, indent=2))

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    export(args.out.resolve())
