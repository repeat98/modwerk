#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Declarative C/assembly USB packages through the existing runtime encoder.

The recipe belongs to its module. No firmware is needed to reproduce a reviewed
package; --stock additionally verifies reconstruction and both strict scans.
This host adapter does not change the base's pinned loader/build implementation.
Untrusted native source runs only in the existing isolated build container.
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

ROOT = Path(__file__).resolve().parents[1]
SYMBOL = re.compile(r'[A-Za-z_][A-Za-z_0-9]*\Z')
FLAGS = ['-mcpu=54455', '-malign-int', '-msoft-float', '-Os', '-std=c11',
         '-ffreestanding', '-fno-builtin', '-fno-common', '-fno-pic',
         '-fno-tree-loop-distribute-patterns', '-fno-asynchronous-unwind-tables',
         '-fno-unwind-tables', '-fomit-frame-pointer', '-ffunction-sections',
         '-fdata-sections', '-Wall', '-Wextra', '-Werror']
SHARED = ('sdk/runtime/loader/build.py', 'sdk/runtime/m68k_codegen.py',
          'sdk/machines/octatrack/events.py', 'sdk/machines/octatrack/events.json',
          'sdk/machines/octatrack/module-adapters/stock_recipe.py',
          'scripts/source-runtime-package.py')


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def path_in(root, relative, directory=False):
    """No absolute paths, traversal or source symlinks, including ancestors."""
    if (not isinstance(relative, str) or not relative or '\\' in relative
            or Path(relative).is_absolute() or any(p in ('', '..') for p in relative.split('/'))):
        raise ValueError('Expected a confined relative source path')
    path = root / relative
    if (not path.resolve().is_relative_to(root.resolve())
            or any(p.is_symlink() for p in (path, *path.parents) if p != root.parent)
            or (not path.is_dir() if directory else not path.is_file())):
        raise ValueError('Missing, escaping or symlinked source path: ' + relative)
    return path


def source_path(root, folder, name, directory=False):
    if not isinstance(name, str):
        raise ValueError('Source paths must be strings')
    if name.startswith('@/'):
        if not name.startswith(('@/sdk/runtime/', '@/sdk/machines/octatrack/')):
            raise ValueError('Shared paths must belong to the SDK, never another module')
        return path_in(root, name[2:], directory)
    return path_in(folder, name, directory)


def declaration(root, filename):
    root = Path(root).resolve()
    filename = Path(filename).resolve()
    folder = filename.parent
    if folder.parent not in (root / 'sdk/drafts', root / 'sdk/octabam/modules'):
        raise ValueError('A runtime build recipe must be in its own module folder')
    doc = json.loads(filename.read_text())
    required = {'schema', 'id', 'title', 'layout', 'sources', 'includes', 'defines',
                'runtime', 'base', 'reconstruction', 'forbiddenPrefixes'}
    if set(doc) != required or doc['schema'] != 1 or doc['id'] != folder.name:
        raise ValueError('Invalid source runtime recipe fields or module identity')
    if not re.fullmatch(r'[a-z][a-z0-9]*(?:-[a-z0-9]+)*', doc['id']):
        raise ValueError('Invalid module id')
    if not isinstance(doc['title'], str) or not 1 <= len(doc['title'].encode('ascii')) <= 15:
        raise ValueError('Invalid unit title')
    if type(doc['layout']) is not int or not 1 <= doc['layout'] <= 65535:
        raise ValueError('Invalid stored layout number')
    if not doc['sources'] or not doc['includes'] or not isinstance(doc['defines'], list):
        raise ValueError('The recipe needs sources, include folders and defines')
    if any(not isinstance(d, str) or not re.fullmatch(r'[A-Za-z_][A-Za-z_0-9]*(?:=[0-9]+)?', d)
           for d in doc['defines']):
        raise ValueError('Defines must be identifiers with optional numeric values')
    units = []
    for item in doc['sources']:
        if not isinstance(item, dict) or set(item) - {'path', 'optimize'} or 'path' not in item:
            raise ValueError('Invalid source unit')
        path = source_path(root, folder, item['path'])
        if path.suffix not in ('.c', '.s', '.S') or item.get('optimize', '-Os') not in ('-Os', '-O2'):
            raise ValueError('Only C/assembly and reviewed optimization levels are supported')
        units.append((path, item.get('optimize', '-Os')))
    includes = [source_path(root, folder, p, True) for p in doc['includes']]
    for include in includes:
        for header in include.rglob('*.h'):
            path_in(include, header.relative_to(include).as_posix())
    runtime_path = path_in(folder, doc['runtime'])
    pack = load('source_runtime_encoder', root / SHARED[0])
    runtime = pack.runtime_declaration(folder) if runtime_path.name == 'runtime.json' else json.loads(runtime_path.read_text())
    if runtime is None:
        raise ValueError('Missing runtime declaration')
    hooks = pack.entries(runtime)
    if not hooks or any(not SYMBOL.fullmatch(h['fn']) for h in hooks):
        raise ValueError('The runtime must name its own valid handler/data symbols')
    if any(not isinstance(p, str) or not SYMBOL.fullmatch(p) for p in doc['forbiddenPrefixes']):
        raise ValueError('Invalid forbidden symbol prefix')
    return doc, folder, units, includes, runtime_path, runtime, pack


def base_binding(root, spec):
    """Resolve reviewed export names against the currently committed base.

    Identity/hash are provenance, never module admission pins. In particular no
    generated C header embeds the current base identities in a runtime image.
    """
    if set(spec) != {'runOrigin', 'imports'}:
        raise ValueError('Invalid base binding fields')
    binding_file = root / 'sdk/machines/octatrack/base-binding.json'
    package_file = root / 'src/engine/assets/octatrack-base.elemod'
    binding = json.loads(binding_file.read_text())
    package = json.loads(package_file.read_text())
    origin = spec['runOrigin']
    length = package['sections']['.run']['len']
    if (type(origin) is not int or not 0x40000400 <= origin < 0x41000000
            or type(length) is not int or not 0 < length <= 0x41000000 - origin):
        raise ValueError('Invalid reviewed base runtime origin')
    def address(name):
        if not isinstance(name, str) or not SYMBOL.fullmatch(name) or name not in package['exports']:
            raise ValueError('A base import must be a published export')
        section, offset = package['symbols'].get(name, (None, None))
        if section != '.run' or type(offset) is not int or not 0 <= offset < length:
            raise ValueError('A base import must be inside its runtime')
        return origin + offset
    if (not isinstance(spec['imports'], list)
            or any(not isinstance(n, str) or not SYMBOL.fullmatch(n) for n in spec['imports'])
            or len(set(spec['imports'])) != len(spec['imports'])):
        raise ValueError('Invalid import list')
    imports = {name: address(name) for name in spec['imports']}
    identity = binding['identity']
    if not isinstance(identity, str) or not re.fullmatch(r'[0-9a-f]{64}', identity):
        raise ValueError('Invalid committed base identity')
    provenance = {'identity': identity, 'packageSha256': sha(package_file),
                  'runOrigin': origin, 'imports': imports}
    return imports, package, provenance, [binding_file, package_file]


def import_relocations(pack, cross, work, objects, image, imports, self_relocations):
    """Read GNU linker's retained import relocations, never guess from bytes."""
    script, elf, binary = (work / n for n in ('imports-map.ld', 'imports-map.elf', 'imports-map.bin'))
    script.write_text(pack.SCRIPT % 0)
    run = lambda argv: subprocess.run(list(map(str, argv)), check=True, capture_output=True)
    run([cross + 'ld', '--emit-relocs', '--orphan-handling=error', '--no-warn-rwx-segments',
         '-T', script, '-o', elf, *objects])
    run([cross + 'objcopy', '-O', 'binary', '-j', '.image', elf, binary])
    if binary.read_bytes() != image:
        raise ValueError('Retaining import relocation metadata changed the image')
    records, section = [], None
    for line in run([cross + 'readelf', '--relocs', '--wide', elf]).stdout.decode().splitlines():
        match = re.match(r"Relocation section '([^']+)'", line)
        if match:
            section = match[1]
        fields = line.split()
        if len(fields) < 5 or fields[4] not in imports:
            continue
        if (section != '.rela.image' or len(fields) != 7 or fields[2] != 'R_68K_32'
                or fields[5] not in ('+', '-')):
            raise ValueError('Unsupported base-import relocation: ' + line.strip())
        at = int(fields[0], 16)
        addend = int(fields[6], 16) * (-1 if fields[5] == '-' else 1)
        if (at & 1 or at < 0 or at + 4 > len(image)
                or any(at < other + 4 and other < at + 4 for other in self_relocations)
                or any(at < r['offset'] + 4 and r['offset'] < at + 4 for r in records)):
            raise ValueError('Overlapping or out-of-image base-import relocation')
        expected = (imports[fields[4]] + addend) & 0xffffffff
        if struct.unpack_from('>I', image, at)[0] != expected:
            raise ValueError('Base-import relocation differs from linked bytes')
        records.append({'offset': at, 'name': fields[4], 'addend': addend})
    if {record['name'] for record in records} != imports.keys():
        raise ValueError('Missing linked relocation metadata for a base import')
    return sorted(records, key=lambda record: record['offset'])


def compile_image(root, filename, cross, work):
    doc, folder, units, includes, runtime_path, runtime, pack = declaration(root, filename)
    imports, base, binding, base_files = base_binding(root, doc['base'])
    codegen = load('source_runtime_codegen', root / 'sdk/runtime/m68k_codegen.py')
    run = lambda argv: subprocess.run(list(map(str, argv)), check=True, capture_output=True)
    objects = []
    for i, (source, optimize) in enumerate(units):
        obj = work / ('unit-%d.o' % i)
        if source.suffix == '.c':
            argv = [cross + 'gcc', *FLAGS, *codegen.FLAGS, optimize,
                    *['-D' + d for d in doc['defines']], *['-I' + str(p) for p in includes],
                    '-I' + str(work), '-c', source, '-o', obj]
        else:
            argv = [cross + 'as', '-mcpu=54455', source, '-o', obj]
        run(argv); objects.append(obj)
    codegen.check_mcf54455(objects, cross + 'objdump')
    roots = sorted(set(h['fn'] for h in pack.entries(runtime)))
    kept = work / 'pruned.o'
    run([cross + 'ld', '-r', '--gc-sections', *['--undefined=' + n for n in roots], '-o', kept, *objects])
    unresolved = {line.split()[-1] for line in run([cross + 'nm', '-u', kept]).stdout.decode().splitlines()}
    if not unresolved <= imports.keys():
        raise ValueError('Unapproved imports: ' + ', '.join(sorted(unresolved - imports.keys())))
    stub = work / 'imports.s'
    stub.write_text('\n'.join('.global %s\n.set %s,0x%x' % (n, n, imports[n]) for n in sorted(unresolved)) + '\n')
    run([cross + 'as', '-mcpu=54455', stub, '-o', work / 'imports.o'])
    image, names, bss, relocs = pack.link_units([kept, work / 'imports.o'], cross, 0, work, anywhere=True)
    binding['relocations'] = import_relocations(
        pack, cross, work, [kept, work / 'imports.o'], image,
        {name: imports[name] for name in unresolved}, relocs)
    if any(name.startswith(tuple(doc['forbiddenPrefixes'])) for name in names):
        raise ValueError('A forbidden legacy entry or state survived pruning')
    hooks = pack.subscribe([], pack.entries(runtime), names, raises=runtime.get('raise', ()))
    paths = {Path(filename).resolve(), runtime_path, *[p for p, _ in units], *base_files,
             *[root / p for p in SHARED]}
    for include in includes:
        paths.update(include.rglob('*.h'))
    inputs = {(('module/' + str(p.relative_to(folder))) if p.is_relative_to(folder)
               else str(p.relative_to(root))): sha(p) for p in sorted(paths)}
    return doc, folder, pack, image, names, bss, relocs, hooks, inputs, base, binding


def reviewed_image(image, binding):
    """Only explicit linked abs32 import words vary with a base rebuild."""
    reviewed = bytearray(image)
    for record in binding['relocations']:
        reviewed[record['offset']:record['offset'] + 4] = bytes(4)
    return bytes(reviewed)


def reviewed_inputs(root, folder, doc, inputs):
    # Module source/recipe and explicitly compiled shared units stay pinned.
    # Generated base artifacts and transitive SDK headers are build provenance;
    # their code effects still have to match the reviewed normalized image.
    units = {str(source_path(root, folder, unit['path']).relative_to(root))
             for unit in doc['sources'] if unit['path'].startswith('@/')}
    return {name: digest for name, digest in inputs.items()
            if name.startswith('module/') or name in units}


def validate_copies(pack, recipe_api, image, relocs, recipe, inputs, base, binding):
    if recipe.get('baseImports') != binding['relocations']:
        raise ValueError('Reviewed base-import names, addends or offsets changed')
    imports = [r['offset'] for r in binding['relocations']]
    replaced, copies, fills = recipe_api.apply(reviewed_image(image, binding), relocs, recipe, inputs)
    for item in [*recipe.get('copies', []), *recipe.get('fills', [])]:
        if any(item['offset'] < at + 4 and at < item['offset'] + item['length'] for at in imports):
            raise ValueError('Reconstruction overlaps a dynamic base-import word')
    pack.unevented([], copies)
    for _, address, n, _ in copies:
        if not 0x40000400 <= address < 0x400de1e0 or n > 0x400de1e0 - address:
            raise ValueError('Reconstruction copy outside runtime-readable stock')
        if any(address < int(s['addr'], 16) + s['len'] and int(s['addr'], 16) < address + n for s in base['sites']):
            raise ValueError('Reconstruction copy overlaps the base')
    output = bytearray(replaced)
    for at in imports:
        output[at:at + 4] = image[at:at + 4]
    return bytes(output), copies, fills


def bounded_capture(recipe, image, stock, main_load, base, registry):
    """Split coincidences outside the readable/unowned stock window, or refuse."""
    number = lambda value: int(value, 0) if isinstance(value, str) else value
    held = [(int(s['addr'], 16), s['len']) for s in base['sites']]
    held += [(number(s['site']), s['length']) for s in [*registry['events'], *registry.get('owned', [])]
             if s['site'] is not None]
    def allowed(address, n):
        return (0x40000400 <= address and address + n <= 0x400de1e0
                and not any(address < p + size and p < address + n for p, size in held))
    copies = []
    for item in recipe['copies']:
        if allowed(item['address'], item['length']):
            copies.append(item)
            continue
        offset, end = item['offset'], item['offset'] + item['length']
        while offset < end:
            for n in range(min(32, end - offset), 0, -1):
                piece = image[offset:offset + n]
                at = stock.find(piece, 0x40000400 - main_load, 0x400de1e0 - main_load)
                while at >= 0 and not allowed(main_load + at, n):
                    at = stock.find(piece, at + 1, 0x400de1e0 - main_load)
                if at >= 0:
                    break
            else:
                raise ValueError('No legal reconstruction source for an authored coincidence')
            copies.append(dict(item, offset=offset, length=n, address=main_load + at,
                               sha256=hashlib.sha256(piece).hexdigest()))
            offset += n
    return dict(recipe, copies=copies)


def build(root, filename, output, cross='m68k-elf-', stock=None, upstream=None, capture=None, stock_at=None):
    root, filename, output = Path(root).resolve(), Path(filename).resolve(), Path(output)
    if stock:
        if not upstream:
            raise ValueError('Original stock verification needs upstream tools')
        sys.path.insert(0, str(root / 'sdk'))
        import firmware_codec
        firmware_codec.use_elekloader(Path(upstream).resolve())
    with tempfile.TemporaryDirectory(prefix='source-runtime-') as tmp:
        work = Path(tmp)
        doc, folder, pack, image, names, bss, relocs, hooks, inputs, base, binding = compile_image(root, filename, cross, work)
        reviewed_sources = reviewed_inputs(root, folder, doc, inputs)
        recipe_api = load('source_runtime_stock_recipe', root / 'sdk/machines/octatrack/module-adapters/stock_recipe.py')
        recipe_path = path_in(folder, doc['reconstruction']) if capture is None else Path(capture)
        if capture is not None:
            if not stock or not upstream or recipe_path.exists():
                raise ValueError('Capture needs original stock, upstream tools and a new recipe path')
            args = argparse.Namespace(stock=Path(stock), upstream=Path(upstream))
            normalized = reviewed_image(image, binding)
            excluded = [*relocs, *[r['offset'] for r in binding['relocations']]]
            recipe = pack.capture_machine_recipe(doc['id'], normalized, excluded, reviewed_sources, args)
            recipe['baseImports'] = binding['relocations']
            from elekloader import formats
            parsed, device, release = formats.load(str(stock))
            stock_main = formats.main_image(parsed, device)
            recipe = bounded_capture(recipe, normalized, stock_main, device.main_load, base, pack.site_events())
            # Capture is evidence for review, never a publish/scan waiver.
            validate_copies(pack, recipe_api, image, relocs, recipe, reviewed_sources, base, binding)
            recipe_path.parent.mkdir(parents=True, exist_ok=True)
            recipe_path.write_text(json.dumps(recipe, indent=2) + '\n')
            return None, {'status': 'CAPTURED_REVIEW_REQUIRED', 'recipe': str(recipe_path)}
        recipe = json.loads(recipe_path.read_text())
        authored = image
        image, copies, fills = validate_copies(pack, recipe_api, image, relocs, recipe, reviewed_sources, base, binding)
        data = pack.package(image, bss, hooks, relocs, name=doc['id'], abi=8, hashed=True,
                            title=doc['title'], layout=doc['layout'], copies=copies, fills=fills)
        if stock:
            if not upstream:
                raise ValueError('Stock verification needs upstream tools')
            sys.path.insert(0, str(root / 'sdk'))
            import firmware_codec
            firmware_codec.use_elekloader(Path(upstream))
            from elekloader import formats
            parsed, device, release = formats.load(str(stock))
            stock_main = formats.main_image(parsed, device)
            if (device.key != 'octatrack' or release.version != '1.40C'
                    or hashlib.sha256(stock_main).hexdigest() != release.main_sha256):
                raise ValueError('Original Octatrack 1.40C required')
            stock_at = lambda address, n: stock_main[address - device.main_load:address - device.main_load + n]
        if stock_at is not None:
            rebuilt = bytearray(image)
            for offset, address, n, digest in copies:
                piece = stock_at(address, n)
                if len(piece) != n or hashlib.sha256(piece).digest() != digest:
                    raise ValueError('Original stock differs from the reconstruction source')
                rebuilt[offset:offset + n] = piece
            for offset, n, value in fills:
                rebuilt[offset:offset + n] = bytes([value]) * n
            if bytes(rebuilt) != authored:
                raise ValueError('Reconstruction differs from the authored image')
        if stock:
            pack.private_stock_free(data, Path(stock), stock_main, Path(upstream))
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(data)
        report = {'schema': 1, 'id': doc['id'], 'bytes': len(data), 'imageBytes': len(image),
                  'bssBytes': bss, 'relocations': len(relocs), 'eventWords': len(hooks),
                  'sha256': hashlib.sha256(data).hexdigest(), 'authoredImageSha256': hashlib.sha256(authored).hexdigest(),
                  'reviewedImageSha256': hashlib.sha256(reviewed_image(authored, binding)).hexdigest(),
                  'baseIdentity': binding['identity'], 'basePackageSha256': binding['packageSha256'],
                  'baseRunOrigin': binding['runOrigin'], 'baseImports': binding['relocations'],
                  'stockCopies': len(copies), 'stockFills': len(fills), 'sources': inputs,
                  'stockVerification': 'PASS' if stock else 'NOT_RUN', 'hardware': 'NOT_RUN'}
        return data, report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--recipe', type=Path, required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--output', type=Path)
    mode.add_argument('--check', action='store_true', help='Rebuild/validate against the committed base without writing output')
    parser.add_argument('--cross', default='m68k-elf-')
    parser.add_argument('--stock', type=Path)
    parser.add_argument('--upstream', type=Path)
    parser.add_argument('--capture-stock-recipe', type=Path)
    args = parser.parse_args()
    if args.check and args.capture_stock_recipe:
        parser.error('--check cannot capture or write a reconstruction recipe')
    try:
        if args.check:
            sys.dont_write_bytecode = True
            with tempfile.TemporaryDirectory(prefix='source-runtime-check-') as directory:
                _, report = build(ROOT, args.recipe, Path(directory) / 'check.mwrm', args.cross,
                                  args.stock, args.upstream)
        else:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            _, report = build(ROOT, args.recipe, args.output, args.cross, args.stock, args.upstream, args.capture_stock_recipe)
            args.output.with_suffix('.proofs.json').write_text(json.dumps(report, indent=2) + '\n')
        print(json.dumps({k: v for k, v in report.items() if k != 'sources'}))
    except subprocess.CalledProcessError as error:
        sys.exit(error.stderr.decode() if isinstance(error.stderr, bytes) else error.stderr or str(error))
    except (ValueError, KeyError) as error:
        sys.exit(str(error))
