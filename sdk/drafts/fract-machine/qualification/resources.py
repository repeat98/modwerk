#!/usr/bin/env python3
"""Reproduce candidate memory and conservative own-call stack accounting.

No firmware, device, emulator or stock disassembly is consumed. This is a
candidate-specific reviewed call graph, not a general static analyzer. A changed
authored image must be reviewed before its graph policy can be reused.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import struct
import subprocess
import sys
import tempfile

MODULE = Path(__file__).resolve().parents[1]
ROOT = MODULE.parents[2]
IMAGE_SHA = 'a80a7032c23c5e76fd1943f3bcd07ba5e3bbca215942bf1e35298f292c87e577'
PACKAGE_SHA = 'c56e79076b170e76c53f46286a3d31aa8d8c51f9d52070836b1ca75fa37f8e29'
# Compared with the local native proof for base eb667962. These files govern
# the struct layout/allocation formula but need not change the module image.
LOADER_INPUTS = {
    'sdk/runtime/loader/loader.h': 'f105ada3121166179bd8ac199883e5185916329ea427eb0e8c64338eeaa50b01',
    'sdk/runtime/loader/loader.c': '69bbdf33558eddb7cba344f550ce6ab06bfc4d0986ea950b988b681d1ed41d8a',
}

# Every register-indirect call in this exact image, resolved against its
# containing C/assembly source and the register definitions in the disassembly.
# The three assembly JMPs are local loop continuations, not recursive calls.
INDIRECT = {
    0x18cc: (),
    0x194e: (),
    0x2502: (),
    0x3528: ('ui_pixel',),
    0x36cc: ('page_text',),
    0x36dc: ('page_text',),
    0x3752: ('modwerk_page_put32.constprop.0',),
    0x375a: ('modwerk_page_put32.constprop.0',),
    0x3780: ('modwerk_page_put32.constprop.0',),
    0x3790: ('modwerk_page_put32.constprop.0',),
    0x3798: ('modwerk_page_put32.constprop.0',),
    0x37ba: ('page_word',),
    0x37c6: ('page_word',),
    0x37e2: ('page_word',),
    0x3c6a: ('og_pool_signed',),
    0x3c7a: ('og_grain_layout_upgrade',),
    0x3f9a: ('ui_unsigned',),
    0x3ff2: ('ui_unsigned',),
    0x4058: ('ui_text',),
    0x40c8: ('ui_text',),
    0x4116: ('ui_text',),
    0x426e: ('ui_pixel',),
    0x427c: ('ui_pixel',),
    0x438a: ('ui_pixel',),
    0x46fc: ('ui_peak',),
    0x475e: ('ui_peak',),
    0x47ae: ('fract_ui_pool_title_context',),
    0x47c8: ('fract_ui_pool_title_context',),
    0x4824: ('og_machine_owns',),
    0x4834: ('fract_ui_machine_icon',),
    0x48e6: ('og_pan_root',),
    0x48f2: ('og_pan_root',),
    0x54b6: ('og_mix_span', 'og_mix_span_reverse', 'og_join_span', 'og_join_span_reverse'),
}
EXTERNAL = {
    0x40004008: 'native FLEX render',
    0x4000f450: 'native FLEX START',
    0x4004d948: 'native browser redraw',
    0x40054cd8: 'native parameter publication',
    0x4007893c: 'native browser leave',
    0x40ae101c: 'base stock-pool open',
}
ASM_FRAMES = {'og_mix_span': 48, 'og_mix_span_reverse': 48,
              'og_join_span': 56, 'og_join_span_reverse': 56}


def run(argv):
    return subprocess.run(list(map(str, argv)), check=True,
                          capture_output=True).stdout.decode()


def own_stack(work, cross, text_end):
    frames = dict(ASM_FRAMES)
    for path in sorted(work.glob('*.su')):
        for row in path.read_text().splitlines():
            location, amount, qualifier = row.split('\t')
            if qualifier not in ('static', 'dynamic,bounded'):
                raise ValueError('Unbounded compiler frame: ' + row)
            name, amount = location.rsplit(':', 1)[1], int(amount)
            # GCC's .su label omits the final clone ordinal in this pinned image.
            if name == 'modwerk_page_put32.constprop':
                name = 'modwerk_page_put32.constprop.0'
            if name in frames and frames[name] != amount:
                raise ValueError('Ambiguous compiler frame: ' + name)
            frames[name] = amount
    disassembly = run([cross + 'objdump', '-d', work / '0.elf'])
    functions, calls, seen_indirect = {}, [], set()
    current = None
    for line in disassembly.splitlines():
        label = re.fullmatch(r'([0-9a-f]+) <([^>]+)>:', line)
        if label:
            address, name = int(label[1], 16), label[2]
            if address >= text_end:
                current = None
            else:
                current = 'og_mix_span' if address == 0 else name
                if current not in frames:
                    raise ValueError('No frame for retained function: ' + current)
                functions[address] = current
        call = re.search(r'^\s*([0-9a-f]+):.*\t(jsr|bsr\w*|jmp)\s+(.+)$', line)
        if call:
            if current is None:
                raise ValueError('Call outside classified function')
            calls.append((current, int(call[1], 16), call[2], call[3]))
    graph = {name: [] for name in functions.values()}
    boundaries = []
    for caller, address, opcode, operand in calls:
        # Tail calls are conservatively charged the caller's whole maximum
        # frame too, even though its epilogue has already released it.
        return_pc = 0 if opcode == 'jmp' else 4
        direct = re.match(r'([0-9a-f]+)\s+<', operand)
        if direct:
            target = int(direct[1], 16)
            if target in functions:
                targets = (functions[target],)
            elif target in EXTERNAL:
                boundaries.append({'caller': caller, 'at': hex(address),
                                   'target': EXTERNAL[target]})
                graph[caller].append((None, return_pc))
                targets = ()
            else:
                raise ValueError('Unreviewed direct target: ' + operand)
        else:
            if address not in INDIRECT:
                raise ValueError('Unreviewed indirect site: ' + hex(address))
            seen_indirect.add(address)
            targets = INDIRECT[address]
        graph[caller].extend((target, return_pc) for target in targets)
    if seen_indirect != INDIRECT.keys():
        raise ValueError('Reviewed indirect sites do not match this build')

    def depth(name, ancestors=()):
        if name in ancestors:
            raise ValueError('Recursive own call graph: ' + name)
        children = [(extra + (depth(target, (*ancestors, name))[0] if target else 0), target)
                    for target, extra in graph[name]]
        extra, target = max(children, default=(0, None), key=lambda item: item[0])
        chain = [name] + (depth(target, (*ancestors, name))[1] if target else [])
        return frames[name] + extra, chain

    bounds = {name: {'bytesIncludingEntryReturnPC': depth(name)[0] + 4,
                     'chain': depth(name)[1]}
              for name in sorted(graph)}
    return {'method': 'GCC -fstack-usage plus reviewed acyclic own-call graph; '
                      '48/56-byte assembly leaves; 4-byte JSR return PCs',
            'perEntry': bounds, 'maxOwnCallbackBytes': max(
                value['bytesIncludingEntryReturnPC'] for value in bounds.values()),
            'externalBoundaries': boundaries,
            'scope': 'Own frames of one callback activation, including outgoing '
                     'arguments and entry return PC. Excludes stock/base frames, '
                     'interrupt prologues, task stacks and interrupted callbacks. '
                     'Not a whole-system stack reserve.'}


def measure(cross, work):
    for relative, expected in LOADER_INPUTS.items():
        if hashlib.sha256((ROOT / relative).read_bytes()).hexdigest() != expected:
            raise ValueError('Base loader changed; review its layout: ' + relative)
    spec = importlib.util.spec_from_file_location(
        'fract_resource_builder', ROOT / 'scripts/source-runtime-package.py')
    builder = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = builder
    spec.loader.exec_module(builder)
    builder.FLAGS.append('-fstack-usage')
    result = builder.compile_image(ROOT, MODULE / 'runtime-build.json', cross, work)
    _, _, _, image, names, bss, relocs, _, inputs, _, _ = result
    digest = hashlib.sha256(image).hexdigest()
    if digest != IMAGE_SHA:
        raise ValueError('Authored code changed; review graph policy before reuse')
    package = work / 'fract-machine.mwrm'
    _, proof = builder.build(ROOT, MODULE / 'runtime-build.json', package, cross)
    if proof['sha256'] != PACKAGE_SHA:
        raise ValueError('Package differs from the named untested candidate')
    layout = work / 'layout.c'
    layout.write_text('#include <stddef.h>\n#include "loader.h"\n'
                      'const uint32_t measured_layout[] = {'
                      'sizeof(struct runtime_module),sizeof(struct runtime_owner),'
                      'sizeof(struct runtime_site),RUNTIME_HOOKS,sizeof(uintptr_t)};\n')
    includes = ['sdk/runtime/loader', 'sdk/runtime/upload', 'sdk/runtime/logging',
                'sdk/machines/octatrack/elekloader']
    # The loader uses Elekloader's default 2-byte aggregate alignment, unlike
    # FRACT's -malign-int compilation. Applying the module ABI here changes
    # the struct sizes being counted; measure the loader's actual ABI.
    run([cross + 'gcc', '-mcpu=54455', '-mno-align-int', '-msoft-float', '-Os',
         '-ffreestanding', '-DMODWERK_RUNTIME_EVENTS', '-DRUNTIME_MODULES=128u',
         '-DRUNTIME_POOL_BYTES=786432u', *['-I' + str(ROOT / p) for p in includes],
         '-c', layout, '-o', work / 'layout.o'])
    run([cross + 'objcopy', '-O', 'binary', '--only-section=.rodata',
         work / 'layout.o', work / 'layout.bin'])
    header, owner, site, hooks, pointer = struct.unpack('>5I', (work / 'layout.bin').read_bytes())
    if (header, owner, site, hooks, pointer) != (754, 88, 74, 63, 4):
        raise ValueError('Unexpected reviewed base-loader ABI')
    align = lambda size: (size + 15) & ~15
    return {'schema': 1, 'status': 'OWN_MEMORY_AND_CALLBACK_STACK_ACCOUNTED',
            'packageSha256': PACKAGE_SHA, 'authoredImageSha256': digest,
            'compiler': run([cross + 'gcc', '--version']).splitlines()[0],
            'loaderInputs': LOADER_INPUTS,
            'loaderAggregateAlignment': '2 bytes (base default; explicit -mno-align-int probe)',
            'imageBytes': len(image), 'bssBytes': bss,
            'packageBytes': package.stat().st_size, 'relocations': len(relocs),
            'memory': {'runtimeHeaderBytes': header, 'headerAlignmentBytes': align(header)-header,
                       'imageBssAlignmentBytes': align(len(image)+bss)-len(image)-bss,
                       'residentPoolExtentBytes': align(header)+align(len(image)+bss),
                       'sameCandidateReplacementPeakPoolBytes': 2*(align(header)+align(len(image)+bss)),
                       'dspCodeWordsAdded': 0, 'dspStateWordsAdded': 0,
                       'sampleArenaBytesAllocated': 0,
                       'baseOwnerLedgerEntryBytes': owner,
                       'baseOwnerLedgerNote': 'Consumes one entry in the base preallocated ledger; '
                                              'no additional module-pool allocation.',
                       'runtimeSiteBytes': site, 'declaredPatchedSites': 0,
                       'method': 'Target sizeof and loader.c aligned head+code+tail; '
                                 'this candidate has no sites or DSP tail.'},
            'stack': own_stack(work, cross, names['__runtime_text_end']),
            'worstCaseColdFireCycles': None,
            'cycleStatus': 'NOT_MEASURED; compiler frames and instruction counts are not hardware timing',
            'nativeInputs': inputs}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cross', default='m68k-elf-')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='fract-resources-') as directory:
        report = measure(args.cross, Path(directory))
    args.output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({key: report[key] for key in
                      ('status', 'packageSha256', 'memory', 'cycleStatus')}))
