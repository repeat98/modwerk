"""Verify retained research-report source hashes against explicit Git revisions.

This checks provenance only. It neither reruns binaries nor turns software
results into native integration, playback or hardware qualification.
"""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import subprocess

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[2]
PREFIX = ROOT.relative_to(REPO).as_posix() + '/'
HEX40 = re.compile(r'[0-9a-f]{40}\Z')
HEX64 = re.compile(r'[0-9a-f]{64}\Z')


def require(ok, message):
    if not ok:
        raise ValueError(message)


def plain_path(name):
    path = PurePosixPath(name)
    require(not path.is_absolute() and path.as_posix() == name and
            all(part not in ('.', '..') for part in path.parts), 'Invalid source/report path')
    return name


def git(*args):
    return subprocess.check_output(['git', '-C', str(REPO), *args], stderr=subprocess.DEVNULL)


def audit(index_path):
    index = json.loads(index_path.read_text())
    require(index.get('schemaVersion') == 1, 'Unsupported evidence index')
    bindings, diagnostics = index['bindings'], index.get('unboundDiagnostics', {})
    reports = {}
    for path in (ROOT / 'evidence').glob('*.json'):
        data = json.loads(path.read_text())
        if 'sourceSha256' in data:
            require(isinstance(data['sourceSha256'], dict) and data['sourceSha256'], 'Empty source binding')
            reports[path.name] = data
    require(not set(bindings) & set(diagnostics), 'Report declared twice')
    require(set(reports) == set(bindings) | set(diagnostics), 'Evidence index/report inventory differs')
    count, cache = 0, {}
    for name, revision in sorted(bindings.items()):
        plain_path(name)
        require(HEX40.fullmatch(revision), 'Use an exact 40-character source commit')
        require(git('cat-file', '-t', revision).strip() == b'commit', 'Source pin is not a commit')
        data = reports[name]
        if 'sourceRevision' in data:
            require(data['sourceRevision'] == revision, name + ': report/index revision differs')
        for source, expected in data['sourceSha256'].items():
            plain_path(source)
            require(isinstance(expected, str) and HEX64.fullmatch(expected), 'Invalid expected SHA-256')
            key = (revision, PREFIX + source)
            if key not in cache:
                cache[key] = hashlib.sha256(git('show', revision + ':' + PREFIX + source)).hexdigest()
            require(cache[key] == expected, name + ': source mismatch: ' + source)
            count += 1
        if 'sdkRevision' in data or 'sdkDependencySha256' in data:
            sdk_revision, dependencies = data.get('sdkRevision'), data.get('sdkDependencySha256')
            require(isinstance(sdk_revision, str) and HEX40.fullmatch(sdk_revision),
                    name + ': use an exact SDK commit')
            require(isinstance(dependencies, dict) and dependencies,
                    name + ': SDK revision needs nonempty compilation dependencies')
            require(git('cat-file', '-t', sdk_revision).strip() == b'commit',
                    name + ': SDK pin is not a commit')
            for source, expected in dependencies.items():
                plain_path(source)
                require(source.startswith('sdk/runtime/'), name + ': unexpected SDK source path')
                require(isinstance(expected, str) and HEX64.fullmatch(expected),
                        name + ': invalid SDK SHA-256')
                key = (sdk_revision, source)
                if key not in cache:
                    cache[key] = hashlib.sha256(git('show', sdk_revision + ':' + source)).hexdigest()
                require(cache[key] == expected, name + ': SDK source mismatch: ' + source)
                count += 1
            if 'codegenGuardSha256' in data:
                actual = hashlib.sha256(git('show', sdk_revision + ':sdk/runtime/m68k_codegen.py')).hexdigest()
                require(actual == data['codegenGuardSha256'], name + ': SDK code-generation guard mismatch')
                count += 1
    for name, diagnostic in diagnostics.items():
        plain_path(name)
        require('/' not in name and diagnostic.get('reason'), 'Diagnostic needs an explicit reason')
        require(hashlib.sha256((ROOT / 'evidence' / name).read_bytes()).hexdigest() == diagnostic['reportSha256'],
                name + ': unbound diagnostic changed')
        # An unbound historical failed-link diagnostic is retained as such,
        # never counted as a passing/executed report or silently rebound.
        require(reports[name].get('undefinedSymbols') and 'exitCode' not in reports[name],
                name + ': exception is only for a compile diagnostic with unresolved helpers')
    return len(bindings), count, len(diagnostics)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--index', type=Path, default=ROOT / 'evidence-sources.json')
    args = parser.parse_args()
    try:
        reports, sources, diagnostics = audit(args.index)
    except (ValueError, KeyError, TypeError, OSError, subprocess.CalledProcessError) as error:
        parser.exit(1, 'FAIL: ' + str(error) + '\n')
    print(f'PASS provenance: {reports} reports, {sources} source bindings; {diagnostics} explicitly unbound historical diagnostic(s) excluded')
    print('No binary rerun, native integration, audio or hardware qualification is implied.')


if __name__ == '__main__':
    main()
