# SPDX-License-Identifier: MIT
"""Compare a hardware capture to expected complete records; never operates USB."""
import argparse
import json
from pathlib import Path
import prepare_pack as pack


def compare(folder, before, after, case_id, snap, selection, cancelled=False):
    manifest = json.loads((Path(folder) / 'manifest.json').read_text())
    entry = next(f for f in manifest['files'] if f['id'] == case_id)
    if pack.sha(Path(folder) / entry['file']) != entry['sha256']:
        raise ValueError('Source WAV differs from reviewed manifest')
    for capture in (before, after):
        if capture['unstable'] or capture['baseIdentity'] != before['baseIdentity']:
            raise ValueError('Unstable snapshot or base changed')
        for field in ('kind', 'slot', 'frames', 'format', 'trimStart', 'trimEnd', 'sampleBpm24', 'projectBpm24', 'selection'):
            if capture[field] != before[field]:
                raise ValueError('Source/settings changed: ' + field)
    expected_fields = {'frames': entry['frames'], 'trimStart': entry['trimStart'],
                       'trimEnd': entry['trimEnd'], 'sampleBpm24': entry['bpm24'],
                       'projectBpm24': entry['bpm24'], 'selection': {'LEFT': 0, 'RIGHT': 1, 'BOTH': 2}[selection]}
    for field, expected in expected_fields.items():
        if before[field] != expected:
            raise ValueError('Fixture settings mismatch: ' + field)
    expected_format = (entry['bits'] == 16) * 2 + (entry['channels'] == 2)
    if before['format'] != expected_format:
        raise ValueError('Loaded PCM channel/bit-depth format differs')
    expected = entry['snapOn'][selection] if snap == 'ON' else {'outcome': 'APPLIED', 'records': entry['recordsOff']}
    if cancelled:
        expected = {'outcome': 'CANCELLED', 'records': None}
    if after['editorState'] != 0:
        raise ValueError('Editor is still open, prompting or analyzing; this is not a completed result')
    if not cancelled:
        replies = {'APPLIED': (7, 8), 'ANALYSIS_LIMIT': (12,), 'ANALYSIS_FAILED': (11,)}
        if after['completion'] not in replies[expected['outcome']]:
            raise ValueError('Base completion status differs from expected outcome')
        if snap == 'ON' and after['pairReads'] != expected['pairReads']:
            raise ValueError('Observed pair-read count differs from expected decoded-PCM search')
    count = len(expected['records']) if expected['records'] is not None else before['count']
    desired = expected['records'] if expected['records'] is not None else before['records'][:count]
    if after['count'] != count or after['records'][:count] != desired:
        raise ValueError('Actual count/start/end/loop records differ from expected result')
    if after['records'][count:] != before['records'][count:]:
        raise ValueError('Inactive records changed')
    if expected['records'] is None and after['records'] != before['records']:
        raise ValueError('Failed/cancelled analysis changed the old table')
    pcm_verified = isinstance(before.get('fileIdentity'), dict) and before['fileIdentity'].get('fullDecodedPcmMatches')
    if pcm_verified and before['fileIdentity'] != after.get('fileIdentity'):
        raise ValueError('Full loaded PCM identity changed or was not verified afterward')
    result = {'case': case_id, 'snap': snap, 'selection': selection, 'expectedOutcome': expected['outcome'],
            'markerComparison': 'passed', 'baseIdentity': after['baseIdentity'],
            'fullFlexPcmVerifiedBeforeAndAfter': bool(pcm_verified),
            'scope': 'Observed supplied captures only; does not establish source file identity or audible behavior'}
    if 'costs' in before and 'costs' in after:
        result['timing'] = {}
        for name, later in after['costs'].items():
            earlier = before['costs'][name]
            spans = (later['spans'] - earlier['spans']) & 0xffffffff
            ticks = later['totalTicks'] - earlier['totalTicks']
            if ticks < 0:
                raise ValueError('Timing counters reset; comparison crosses a boot')
            result['timing'][name] = {'spans': spans, 'elapsedMicroseconds': ticks / 132,
                'meanMicroseconds': ticks / 132 / spans if spans else None,
                'maximumSinceBootMicroseconds': later['maximumTicks'] / 132,
                'scope': 'Instrumented wall time including preemption; maximum is since boot, not necessarily this case'}
    return result


def compare_stock(folder, candidate, stock, case_id):
    manifest = json.loads((Path(folder) / 'manifest.json').read_text())
    entry = next(f for f in manifest['files'] if f['id'] == case_id)
    if entry['stockComparison'] != 'equal-grid-valid-cases-only':
        raise ValueError('This fixture is not admitted as a stock parity comparison')
    if candidate['unstable'] or stock['unstable']:
        raise ValueError('Unstable stock/candidate snapshot')
    for field in ('baseIdentity', 'frames', 'format', 'trimStart', 'trimEnd', 'selection'):
        if candidate[field] != stock[field]:
            raise ValueError('Stock/candidate source settings differ: ' + field)
    if candidate['count'] != stock['count'] or candidate['records'][:candidate['count']] != stock['records'][:stock['count']]:
        raise ValueError('Stock and candidate complete active marker records differ')
    return 'complete active count/start/end/loop records match supplied stock capture'


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pack', type=Path, required=True)
    parser.add_argument('--before', type=Path, required=True)
    parser.add_argument('--after', type=Path, required=True)
    parser.add_argument('--case', required=True)
    parser.add_argument('--snap', choices=('OFF', 'ON'), required=True)
    parser.add_argument('--selection', choices=('LEFT', 'RIGHT', 'BOTH'), required=True)
    parser.add_argument('--cancelled', action='store_true', help='Require the complete original table unchanged')
    parser.add_argument('--stock', type=Path, help='Optional actual stock-grid capture with identical initial anchors')
    args = parser.parse_args()
    after = json.loads(args.after.read_text())
    result = compare(args.pack, json.loads(args.before.read_text()), after,
                     args.case, args.snap, args.selection, args.cancelled)
    if args.stock:
        result['stockComparison'] = compare_stock(args.pack, after, json.loads(args.stock.read_text()), args.case)
    print(json.dumps(result, indent=2))
