#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Module-owned, source-bound reconstruction for ordinary ColdFire USB packages.

Called by the host package wrapper. Uses unchanged SDK validation/encoding;
neither the base's pinned inputs nor its reviewed standalone port set changes.
The manifest opts in with reconstruction:true. Owner review and the normal
qualification/catalogue gates still control publishing that manifest entry.
"""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import struct
import sys

RECIPE = 'runtime-reconstruction.json'
SHARED = (
    'sdk/runtime/loader/build.py', 'sdk/runtime/loader/verify_static.py',
    'sdk/runtime/loader/modwerk_module.h', 'sdk/runtime/m68k_codegen.py',
    'sdk/machines/octatrack/module-adapters/standalone_runtime.py',
    'sdk/machines/octatrack/module-adapters/stock_recipe.py',
    'sdk/machines/octatrack/elekloader/runtime.c',
)
NATIVE_SUFFIXES = {'.s', '.S', '.c', '.h', '.asm', '.inc'}
HASH = lambda data: hashlib.sha256(data).hexdigest()


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, filename)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def module_folder(root, entry):
    if (entry.get('reconstruction') is not True or entry.get('octabam') is not True
            or not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', entry.get('id', ''))
            or any(key in entry for key in ('base', 'machine', 'tables', 'sources', 'slots', 'standalone',
                                            'requiresFeatures', 'dspClaims', 'buffer', 'pinned'))):
        raise ValueError('Reconstruction needs an ordinary octabam ColdFire entry, without alternate build modes.')
    parent = root / 'sdk/octabam/modules'
    folder = parent / entry['id']
    if folder.is_symlink() or not folder.is_dir() or folder.resolve().parent != parent.resolve():
        raise ValueError('Reconstruction needs the module\'s own source folder.')
    return folder


def native_inputs(folder):
    paths = [path for path in folder.rglob('*') if path.is_file()
             and path.relative_to(folder).parts[0] not in ('media', 'evidence', 'presentation')
             and (path.suffix in NATIVE_SUFFIXES or path.name in ('manifest.py', 'runtime.json'))]
    if not any(path.suffix in ('.s', '.S') for path in paths) or not (folder / 'manifest.py').is_file():
        raise ValueError('Reconstruction needs its native assembly and manifest.')
    if any(path.is_symlink() or not path.resolve().is_relative_to(folder.resolve()) for path in paths):
        raise ValueError('Reconstruction source symlinks are not allowed.')
    return {path.relative_to(folder).as_posix(): HASH(path.read_bytes()) for path in sorted(paths)}


def reconstruct(root, entry, data, stock_at=None):
    root = Path(root).resolve()
    folder = module_folder(root, entry)
    path = folder / RECIPE
    if path.is_symlink():
        raise ValueError('A reconstruction declaration must be a regular module-owned file.')
    recipe = json.loads(path.read_text())
    if (set(recipe) != {'schema', 'imageSha256', 'packageSha256', 'moduleSources', 'sharedSources', 'copies', 'fills'}
            or recipe['schema'] != 1 or not isinstance(recipe['moduleSources'], dict)
            or not isinstance(recipe['sharedSources'], dict) or set(recipe['sharedSources']) != set(SHARED)
            or not isinstance(recipe['copies'], list) or not recipe['copies'] or recipe['fills'] != []
            or any(not isinstance(recipe[key], str) or not re.fullmatch('[0-9a-f]{64}', recipe[key])
                   for key in ('imageSha256', 'packageSha256'))):
        raise ValueError('A reconstruction declaration needs exact source/image/package hashes and copies, without fills.')
    module_inputs = native_inputs(folder)
    shared_inputs = {name: HASH((root / name).read_bytes()) for name in SHARED}
    if recipe['moduleSources'] != module_inputs or recipe['sharedSources'] != shared_inputs:
        raise ValueError('Reconstruction native or shared source inputs changed.')
    # No DSP, pre-existing reconstruction, pinned/group flags or alternate ABI
    # can silently acquire this route. The ordinary native builder made data.
    if (len(data) < 76 or data[:4] != b'MWRM' or struct.unpack_from('>HH', data, 4) != (8, 0)
            or any(data[32:50]) or any(data[68:76])):
        raise ValueError('Reconstruction expects an ordinary ABI 8 ColdFire package with no copies or fills.')
    sdk = root / 'sdk/runtime/loader'
    builder = load('host_reconstruction_builder', sdk / 'build.py')
    parser = load('host_reconstruction_parser', sdk / 'verify_static.py')
    if struct.unpack_from('>I', data, 28)[0] != builder.module_id(entry['id']):
        raise ValueError('Reconstruction package identity differs from its module.')
    image, offsets, sites, copies, fills = parser.unpack_recipe(data)
    if copies or fills:
        raise ValueError('A reconstruction input already has copies or fills.')
    normalized_sources = {str((folder / name).relative_to(root)): digest for name, digest in module_inputs.items()}
    normalized_sources.update(shared_inputs)
    records = copy.deepcopy(recipe['copies'])
    for record in records:
        own_source = record.get('authored', {}).get('source')
        if own_source not in module_inputs:
            raise ValueError('Copy provenance must name this module\'s native source.')
        record['authored']['source'] = str((folder / own_source).relative_to(root))
    normalized = dict(schema=1, imageSha256=recipe['imageSha256'], sources=normalized_sources,
                      copies=records, fills=[])
    adapters = root / 'sdk/machines/octatrack/module-adapters'
    sys.path.insert(0, str(adapters))
    adapter = load('host_reconstruction_adapter', adapters / 'standalone_runtime.py')
    masked, copies = adapter.apply(image, offsets, normalized, normalized_sources, root, stock_at)
    glue = (root / 'sdk/machines/octatrack/elekloader/runtime.c').read_text()
    first, end = [int(re.search(r'#define '+name+r' (0x[0-9a-f]+)u', glue)[1], 16)
                  for name in ('STOCK_FROM', 'BOOTLOADER_FROM')]
    if any(not first <= address < end or length > end - address for _, address, length, _ in copies):
        raise ValueError('A reconstruction source is outside the machine\'s patchable OS range.')
    builder.unevented(sites, copies)
    hooks = struct.unpack_from('>%dI' % struct.unpack_from('>I', data, 20)[0], data, 76)
    output = builder.package(masked, struct.unpack_from('>I', data, 12)[0], hooks, offsets, sites,
                             name=entry['id'], title=data[50:66].split(b'\0')[0].decode('ascii'),
                             layout=struct.unpack_from('>H', data, 66)[0], hashed=True, copies=copies, abi=8)
    if HASH(output) != recipe['packageSha256']:
        raise ValueError('Reconstructed package differs from the exact tested package hash.')
    return output
