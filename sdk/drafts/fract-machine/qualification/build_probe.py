#!/usr/bin/env python3
"""Build a private measurement package for a verified named base; never opens USB.

The defaults retain the historical base72/package6ff reproduction. For a new
base, name BOTH its identity and the independently reproduced normal package
SHA-256. Run in the pinned isolated toolchain; stock stays local/read-only.
"""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import shutil
import subprocess

NORMAL_SHA = '6ff37fdcdbfead903a4857482d0f7bd50905175b55c877e62ad7c51422ef5874'
BASE = '72defb09b9d463fe62ab876f350f442d10e32ec23e55918a22b9b756c5cb3da6'
HERE = Path(__file__).resolve().parent


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def checked_baseline(args):
    expected_base = getattr(args, 'base_identity', None)
    expected_normal = getattr(args, 'normal_sha256', None)
    if (expected_base is None) != (expected_normal is None):
        raise ValueError('Name both --base-identity and --normal-sha256, or neither')
    if expected_base is None:
        expected_base, expected_normal = BASE, NORMAL_SHA
    if any(not re.fullmatch(r'[0-9a-f]{64}', value)
           for value in (expected_base, expected_normal)):
        raise ValueError('Base identity and normal package hash must be lowercase SHA-256 values')
    binding = json.loads((args.base_tree / 'sdk/machines/octatrack/base-binding.json').read_text())
    if binding['identity'] != expected_base:
        raise ValueError('Source tree does not match the explicitly named measurement base')
    return expected_base, expected_normal


def counter_addresses(package, origin, linked):
    """Use the stock linker's real layout, including collections and BSS padding."""
    layout, mapping = linked['link']['layout'], linked['_map']
    run_align = package['sections']['.run'].get('align', 4)
    if (type(run_align) is not int or not 1 <= run_align <= 4096
            or run_align & (run_align - 1)):
        raise ValueError('Invalid measurement section alignment: .run')
    run_align = max(4, run_align)
    if (layout['ddr'][0] + run_align - 1) & -run_align != origin:
        raise ValueError('Linked base runtime origin differs from the normal package')
    names = {'FRAMES': 'mw_frame_count', 'IDLE': 'modwerk_idle_counts',
             'FRAME_MAX': 'mw_frame_max', 'SHARE': 'mw_frame_share', 'SHEDS': 'mw_frame_sheds'}
    addresses = {}
    for key, name in names.items():
        section, offset = package['symbols'][name]
        if section not in ('.run', '.bss'):
            raise ValueError('Unsupported measurement section: ' + name)
        definition = package['sections'][section]
        size = definition['len' if section == '.run' else 'size']
        alignment = definition.get('align', 4)
        if (type(alignment) is not int or not 1 <= alignment <= 4096
                or alignment & (alignment - 1)):
            raise ValueError('Invalid measurement section alignment: ' + name)
        if type(offset) is not int or offset < 0 or offset + 4 > size or offset % 2:
            raise ValueError('Unaligned/out-of-section measurement symbol: ' + name)
        start, end = layout['ddr' if section == '.run' else 'bss']
        base = origin if section == '.run' else (start + max(4, alignment) - 1) & -max(4, alignment)
        address = mapping[name]
        if (type(address) is not int or address != base + offset or address % 2
                or not start <= base < base + size <= end):
            raise ValueError('Measurement symbol differs from the linked layout: ' + name)
        addresses[key] = address
    return addresses


def build(args):
    out = args.output.resolve()
    if out.exists():
        raise ValueError('Use a new private output directory; existing evidence is preserved')
    expected_base, expected_normal = checked_baseline(args)
    out.mkdir(parents=True)
    root = out / 'source'
    for relative in ('sdk/runtime', 'sdk/firmware_codec', 'sdk/machines/octatrack', 'sdk/drafts/fract-machine'):
        shutil.copytree(args.base_tree / relative, root / relative,
                        ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
    for relative in ('scripts/source-runtime-package.py', 'src/engine/assets/octatrack-base.elemod'):
        destination = root / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(args.base_tree / relative, destination)
    spec = importlib.util.spec_from_file_location('private_probe_builder', root / 'scripts/source-runtime-package.py')
    builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(builder)
    folder = root / 'sdk/drafts/fract-machine'
    recipe = folder / 'runtime-build.json'
    _, normal = builder.build(root, recipe, out / 'normal.mwrm', args.cross, args.stock, args.upstream)
    if normal['sha256'] != expected_normal or normal['stockVerification'] != 'PASS':
        raise ValueError('The exact tested normal package did not reproduce')
    normal_work = out / 'normal-compile'; normal_work.mkdir()
    builder.compile_image(root, recipe, args.cross, normal_work)

    package = json.loads((root / 'src/engine/assets/octatrack-base.elemod').read_text())
    origin = normal['baseRunOrigin']
    # Stock linking includes collection tables after .run, then each section's
    # declared alignment. Never infer BSS from a historical 512-byte boundary.
    # The committed package omits DSP words; the standard site path restores
    # its guarded fills from original stock before calling the pinned linker.
    layout_receipt = out / 'base-link.json'
    layout_tool = HERE / 'link_base_layout.mjs'
    subprocess.run(['node', str(layout_tool), '--base-tree', str(args.base_tree.resolve()), '--stock', str(args.stock),
                    '--output', str(layout_receipt)], check=True)
    linked = json.loads(layout_receipt.read_text())
    if linked['baseIdentity'] != expected_base:
        raise ValueError('Original-stock linked base identity differs from the named base')
    addresses = counter_addresses(package, origin, linked)
    header = folder / 'qualification/probe_addresses.h'
    header.write_text('/* Private named-base read-only addresses; not a release header. */\n' +
                      ''.join(f'#define FRACT_PROBE_{key} 0x{value:08x}u\n' for key, value in addresses.items()))
    shutil.copyfile(HERE / 'render_probe.c', folder / 'qualification/render_probe.c')
    registration = folder / 'registration.c'
    registration.write_text('#define og_machine_render fract_probe_render\n' + registration.read_text())
    runtime_file = folder / 'runtime.json'
    runtime = json.loads(runtime_file.read_text())
    for hook in runtime['subscribe']:
        if hook['event'] == 'module_tick':
            hook['fn'] = 'fract_probe_tick'
    runtime_file.write_text(json.dumps(runtime, indent=2) + '\n')
    declaration = json.loads(recipe.read_text())
    declaration['sources'].append({'path': 'qualification/render_probe.c'})
    declaration['title'] = 'FRACT PROBE'
    declaration['includes'].append('qualification')
    declaration['reconstruction'] = 'qualification/probe-reconstruction.json'
    recipe.write_text(json.dumps(declaration, indent=2) + '\n')
    probe_work = out / 'probe-compile'; probe_work.mkdir()
    compiled = builder.compile_image(root, recipe, args.cross, probe_work)
    (out / 'probe-symbols.json').write_text(json.dumps(compiled[4], indent=2) + '\n')
    # The original units' code sections must stay identical. Registration's
    # descriptor relocation changes its target; no renderer/UI instruction does.
    sections = []
    for index in range(len(declaration['sources']) - 1):
        files = [work / f'unit-{index}.o' for work in (normal_work, probe_work)]
        result = []
        for side, obj in enumerate(files):
            listing = subprocess.check_output([args.cross + 'objdump', '-h', obj], text=True)
            names = re.findall(r'^\s*\d+\s+(\.text\S*)\s+[0-9a-fA-F]+\s', listing, re.MULTILINE)
            entries = {}
            for section in names:
                target = out / f'text-{index}-{side}.bin'
                subprocess.run([args.cross + 'objcopy', '--dump-section', section + '=' + str(target), obj],
                               check=True, capture_output=True)
                entries[section] = {'sha256': sha(target), 'bytes': target.stat().st_size}
                target.unlink()
            result.append(entries)
        if result[0] != result[1]:
            raise ValueError('An original unit changed executable bytes: ' + str(index))
        sections.append({'unit': index, 'sections': result[0]})
    capture = folder / declaration['reconstruction']
    builder.build(root, recipe, out / 'probe.mwrm', args.cross, args.stock, args.upstream, capture)
    _, probe = builder.build(root, recipe, out / 'probe.mwrm', args.cross, args.stock, args.upstream)
    receipt = {'schema': 1, 'kind': 'PRIVATE_MEASUREMENT_ONLY', 'normalPackageSha256': expected_normal,
               'baseIdentity': expected_base, 'normal': normal, 'probe': probe, 'probeSourceSha256': sha(HERE / 'render_probe.c'),
               'originalExecutableSections': sections, 'readOnlyBaseAddresses': addresses,
               'linkedBaseLayout': linked['link']['layout'],
               'layoutToolSha256': sha(layout_tool),
               'hardware': 'NOT_RUN', 'deviceOpened': False, 'guardDisabled': False,
               'limits': 'Probe is a different package. Original units retain their instruction bytes, but the wrapper adds timer/call overhead. Base frame peak is since boot, not a reset window; guard share is whole-ISR, not free FRACT headroom.'}
    (out / 'probe-receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps({'normalSha256': expected_normal, 'probeSha256': probe['sha256'], 'stockVerification': probe['stockVerification'],
                      'originalUnitsUnchanged': len(sections), 'deviceOpened': False}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-tree', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--stock', type=Path, required=True)
    parser.add_argument('--upstream', type=Path, required=True)
    parser.add_argument('--cross', default='m68k-elf-')
    parser.add_argument('--base-identity', help='Expected new base identity; requires --normal-sha256')
    parser.add_argument('--normal-sha256', help='Independently reproduced normal package hash; requires --base-identity')
    build(parser.parse_args())
