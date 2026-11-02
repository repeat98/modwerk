# SPDX-License-Identifier: MIT
"""Bind the reviewed WAV pack, unchanged module and measurement base; offline only."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import zipfile

HERE = Path(__file__).resolve().parent


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def prepare(pack, module, base, output):
    pack, module, base, output = map(lambda p: Path(p).resolve(), (pack, module, base, output))
    if output.exists():
        raise ValueError('Use a new review JSON path')
    manifest = json.loads((pack / 'manifest.json').read_text())
    verification = json.loads((pack / 'verification.json').read_text())
    candidate = json.loads((HERE.parent / 'build.json').read_text())
    proof = json.loads((base / 'proofs.json').read_text())
    symbols = json.loads((base / 'symbols.json').read_text())
    if sha(module) != candidate['packageSha256'] or module.name != 'beat-slicer.mwrm':
        raise ValueError('Use the exact unchanged 0.1.68 package and original filename')
    if verification['result'] != 'passed' or verification['manifestSha256'] != sha(pack / 'manifest.json'):
        raise ValueError('Pack verification missing or stale')
    if manifest['generatorSha256'] != sha(HERE / 'prepare_pack.py'):
        raise ValueError('Regenerate the pack from the reviewed generator')
    for f in manifest['files']:
        if sha(pack / f['file']) != f['sha256']:
            raise ValueError('Reviewed WAV changed')
    for name in ('mw_sample_scan_cost', 'mw_sample_writer_cost', 'mw_sample_test_offsets', 'mw_sample_editor'):
        if name not in symbols:
            raise ValueError('Measurement base symbol missing: ' + name)
    main = base / 'MAIN.raw'
    if main.stat().st_size > 1310720:
        raise ValueError('Image exceeds the RAM boot packing limit')
    spec = importlib.util.spec_from_file_location('review_native_binding',
        HERE.parents[4] / 'sdk/machines/octatrack/module-adapters/runtime_candidate.py')
    native_binding = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(native_binding)
    bound = native_binding.bind_base(main.read_bytes(), symbols, proof)
    matrix = []
    for f in manifest['files']:
        for source in ('Flex', 'Static'):
            for selection in ('LEFT', 'RIGHT', 'BOTH'):
                for snap in ('OFF', 'ON'):
                    matrix.append({'case': f['id'], 'source': source, 'selection': selection, 'snap': snap,
                                   'beatsPerSlice': f['beatsPerSlice'], 'bpm24': f['bpm24'],
                                   'trimStart': f['trimStart'], 'trimEnd': f['trimEnd'],
                                   'expected': f['snapOn'][selection]['outcome'] if snap == 'ON' else 'APPLIED',
                                   'status': 'not tested'})
    result = {'status': 'offline preparation; no hardware operations authorized by this file',
              'module': str(module), 'moduleSha256': sha(module),
              'measurementBase': str(base), 'measurementBaseIdentity': proof['configurationHash'],
              'measurementMainSha256': sha(main), 'measurementMainBytes': main.stat().st_size,
              'nativeBinding': bound,
              'symbolsSha256': sha(base / 'symbols.json'), 'proofsSha256': sha(base / 'proofs.json'),
              'pack': str(pack), 'manifestSha256': sha(pack / 'manifest.json'), 'wavCount': len(manifest['files']),
              'toolsSha256': {p.name: sha(p) for p in sorted(HERE.glob('*.py'))},
              'baseline': 'Fresh running identity, active set, full inventory, project/Part and backup still required on unit',
              'readiness': 'Owner confirms stopped disposable project, exclusive USB and test-file staging before access',
              'load': 'RAM trial only, without --accept; never session try, Keep, lifecycle, flash or owner project save',
              'trialTimer': 'Use short logged batches and a stated timeout; a host trial timer can undo while USB stays alive',
              'restore': 'Verified Undo, owner power cycle, compare fresh identity/active set/full inventory/Part with baseline',
              'matrix': matrix,
              'extraProcedures': ['sample/project BPM routes with different tempos', 'all beat spacings',
                                  'completed recorders and recording races', 'NO/key/encoder/source/owner cancellation',
                                  'read failure and transient BUSY', 'separate audible pass on synthesized loop',
                                  'disposable-only save/reload', 'exact uninstrumented base repeat before qualification'],
              'hardware': 'not tested'}
    output.write_text(json.dumps(result, indent=2) + '\n')
    with zipfile.ZipFile(pack.with_suffix('.zip'), 'x', compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(pack.rglob('*')):
            if path.is_file():
                archive.write(path, path.relative_to(pack))
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('pack', 'module', 'base', 'output'):
        parser.add_argument('--' + name, type=Path, required=True)
    args = parser.parse_args()
    result = prepare(args.pack, args.module, args.base, args.output)
    print(f'Review prepared: {result["wavCount"]} WAVs, {len(result["matrix"])} pending matrix rows; no device access.')
