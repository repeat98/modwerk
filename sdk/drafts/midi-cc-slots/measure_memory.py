#!/usr/bin/env python3
"""Reproduce the current package and report its layout; no device access.

All build artifacts stay in a new private --output directory. Only report.json
is sanitized text suitable for review. This is not complete qualification:
stock callees, assembly stack frames and device lifetime peaks need auditing.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]


def run(*args):
    return subprocess.check_output(args, text=True)


def direct_c_stack(build):
    """Conservative known-C chain only: stock/assembly reentry is not modeled."""
    nodes, edges, targets = {}, {}, set()
    for path in build.rglob('*.ci'):
        for line in path.read_text().splitlines():
            node = re.match(r'node: \{ title: "([^"]+)" label: "(.*)"', line)
            if node:
                name, label = node.groups()
                frame = re.search(r'\\n(\d+) bytes \(([^)]+)\)', label)
                if frame:
                    nodes[name] = int(frame[1])
            edge = re.match(r'edge: \{ sourcename: "([^"]+)" targetname: "([^"]+)"', line)
            if edge:
                caller, callee = edge.groups()
                edges.setdefault(caller, set()).add(callee)
                targets.add(callee)
    if not nodes:
        raise ValueError('Missing compiler call graph')
    memo = {}

    def chain(name, seen=()):
        if name in seen:
            raise ValueError('Recursive direct C graph: no finite bound established')
        if name not in memo:
            options = [(0, [])]
            for callee in sorted(edges.get(name, ())):
                if callee in nodes:
                    size, path = chain(callee, seen + (name,))
                    options.append((size + 4, path))
            size, path = max(options, key=lambda item: item[0])
            memo[name] = (nodes[name] + size, [name] + path)
        return memo[name]

    size, path = max((chain(name) for name in sorted(nodes)), key=lambda item: item[0])
    return {'scope': 'Known direct C calls only; excludes assembly, stock callees, reentry and task/interrupt context.',
            'frames': len(nodes), 'conservativeBytes': size + 4,
            'path': [name.rsplit('/', 1)[-1] for name in path],
            'unknownTargets': sorted(name.rsplit('/', 1)[-1] for name in targets - nodes.keys()),
            'method': 'Compiler frame sizes plus four bytes per direct call and entry for return addresses; may double-count outgoing reserves. No direct C graph cycle observed.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    output = args.output.resolve()
    if any((path / '.git').exists() for path in (output, *output.parents)):
        parser.error('--output must stay outside Git')
    output.mkdir(parents=True, exist_ok=False)
    build = output / 'build'
    package = output / 'module.mwrm'
    subprocess.run([sys.executable, '-B', str(HERE / 'build_runtime.py'),
                    '--profile', '--project-template', '--current-base',
                    '--output', str(package), '--audit-dir', str(build)], check=True)
    pin = json.loads((HERE / 'local-build.json').read_text())
    digest = hashlib.sha256(package.read_bytes()).hexdigest()
    if digest != pin['sha256'] or package.stat().st_size != pin['bytes']:
        raise ValueError('Audit flags changed the pinned package; evidence refused')

    # Use target sizeof, never the host compiler's pointer sizes. Event count
    # changes runtime_module's layout even for a package using only four hooks.
    probe = output / 'sizes.c'
    probe.write_text('#define MODWERK_RUNTIME_EVENTS\n#include "loader.h"\n'
                     'char module_bytes[sizeof(struct runtime_module)];\n'
                     'char site_bytes[sizeof(struct runtime_site)];\n'
                     'char hook_count[RUNTIME_HOOKS];\n')
    subprocess.run(['m68k-elf-gcc', '-mcpu=54455', '-ffreestanding', '-c', str(probe), '-o', str(output / 'sizes.o'),
                    '-I', str(ROOT / 'sdk/runtime/loader'), '-I', str(ROOT / 'sdk/runtime/upload'),
                    '-I', str(ROOT / 'sdk/machines/octatrack/elekloader')], check=True)
    sizes = {name: int(size, 16) for _, size, _, name in
             (line.split() for line in run('m68k-elf-nm', '-S', '--defined-only', str(output / 'sizes.o')).splitlines())}

    link_map = (build / '0.map').read_text().split('OUTPUT(')[0]
    regions = []
    for match in re.finditer(r'^ (\.[\w.]+)\s+(0x[\da-f]+)\s+(0x[\da-f]+)\s+(\S+\.o)\s*$', link_map, re.M):
        section, start, size, obj = match.groups()
        if int(size, 16):
            regions.append({'object': obj, 'section': section, 'offset': int(start, 16), 'bytes': int(size, 16)})
    fills = [{'offset': int(a, 16), 'bytes': int(b, 16)} for a, b in
             re.findall(r'^ \*fill\*\s+(0x[\da-f]+)\s+(0x[\da-f]+)', link_map, re.M)]
    sentinel = re.findall(r'^\s+(0x[\da-f]+)\s+0x1 BYTE 0x0$', link_map, re.M)
    if len(sentinel) != 1:
        raise ValueError('Unexpected linker sentinel')
    spans = [(r['offset'], r['bytes']) for r in regions + fills] + [(int(sentinel[0], 16), 1)]
    end = 0
    for start, size in sorted(spans):
        if start != end:
            raise ValueError('Unaccounted or overlapping image bytes')
        end += size
    if end != pin['imageBytes']:
        raise ValueError('Image layout does not reconcile')

    frames = []
    for file in sorted(build.rglob('*.su')):
        for line in file.read_text().splitlines():
            location, size, kind = line.split('\t')
            frames.append({'object': file.relative_to(build).as_posix(),
                           'function': location.rsplit(':', 1)[1], 'bytes': int(size), 'kind': kind})
    if not frames or any(f['kind'] not in ('static', 'dynamic,bounded') for f in frames):
        raise ValueError('Missing or unbounded compiler stack report')
    align16 = lambda n: (n + 15) & ~15
    header = sizes['module_bytes'] + pin['sites'] * sizes['site_bytes']
    extent = align16(header) + align16(end)  # no DSP tail in this package
    report = {
        'schemaVersion': 1, 'moduleVersion': pin['version'], 'qualification': False,
        'requiredBase': pin['requiredBase'], 'packageSha256': digest,
        'compiler': run('m68k-elf-gcc', '--version').splitlines()[0],
        'packageBytes': pin['bytes'], 'imageBytes': end, 'inputSections': regions,
        'linkerPadding': fills, 'linkerSentinelBytes': 1,
        'targetAbi': sizes,
        'pool': {'headerAndSitesBytes': header, 'headerPaddingBytes': align16(header) - header,
                 'imagePaddingBytes': align16(end) - end, 'residentExtentBytes': extent,
                 'twoSameSizeRevisionsBytes': 2 * extent,
                 'scope': 'Incremental loader pool extent only; two revisions coexist during replacement/Undo. Base upload buffers, fixed ownership ledgers and stacks excluded.'},
        'compilerStackFrames': frames,
        'largestSingleCFrameBytes': max(f['bytes'] for f in frames),
        'partialDirectCStack': direct_c_stack(build),
        'completeStackPeakBytes': None, 'hardwarePoolDeltaBytes': None,
        'limitations': ['Compiler frames and the partial direct C graph do not establish the complete task-stack bound.',
                        'Assembly wrappers, stock callees, interrupts and engine/UI task stack headroom remain unbounded here.',
                        'Pool formula follows loader.c with current Octatrack event header; a different base requires a new ABI probe.',
                        'Shared base staging buffers and fixed ledgers already exist; their whole-system lifetime peak remains unaudited.',
                        'No hardware canaries, timing or memory readings were taken by this command.']}
    (output / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'report': str(output / 'report.json'), 'residentExtentBytes': extent,
                      'largestSingleCFrameBytes': report['largestSingleCFrameBytes'], 'qualification': False}))


if __name__ == '__main__':
    main()
