#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Private, exact-base FRACT machine package. Never a catalogue release."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile

DRAFT = Path(__file__).resolve().parent
# The draft doctor temporarily copies this folder under sdk/octabam/modules/.
ROOT = next(parent for parent in DRAFT.parents
            if (parent / 'sdk/runtime/loader/build.py').is_file())
MODULE = DRAFT / 'support'
# Preserve the private prototype's package identity for replacement/removal.
PACKAGE_ID = 'grnyv1'
CORE = DRAFT / 'engine'

def core_unit(name):
    candidate = CORE / name
    return candidate if candidate.is_file() else MODULE / name

# Exact paired Octatrack runtime.c's stock-copy admission bounds.
STOCK_FROM, STOCK_END = 0x40000400, 0x400de1e0
IMPORTS = frozenset(('mw_stock_pool_open', 'modwerk_machine_mask', 'modwerk_machine_unmask',
    'modwerk_machine_lock', 'modwerk_machine_unlock', 'modwerk_runtime_owner_at'))


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def checked_copies(pack, copies, stock, upstream, events, base_package):
    """A captured recipe must also avoid the exact experimental base's sites."""
    pack.unevented([], copies, registry=events)
    pack.check_stock([(address, digest, b'', [], 0, n)
                      for _, address, n, digest in copies], stock, upstream)
    for _, address, n, _ in copies:
        if not STOCK_FROM <= address < STOCK_END or n > STOCK_END - address:
            raise ValueError('A reconstruction copy is outside runtime-readable stock')
        for site in base_package['sites']:
            at = int(site['addr'], 16)
            if address < at + site['len'] and at < address + n:
                raise ValueError('A reconstruction copy overlaps the paired base')


def bounded_recipe(recipe, image, stock, stock_load, events, base_package):
    """Capture only readable, unowned stock spans; never change authored bytes.

    The general capturer can select a coincident run in the bootloader/bank
    payload. Split such a run into identical legal pieces, or fail closed.
    The resulting hash-only recipe still needs review and all normal checks.
    """
    held = [(e['site'], e['length']) for e in events['events'] if e['site'] is not None]
    held += [(e['site'], e['length']) for e in events.get('owned', [])]
    held += [(int(s['addr'], 16), s['len']) for s in base_package['sites']]
    def allowed(address, n):
        return (STOCK_FROM <= address < STOCK_END and n <= STOCK_END - address and
                not any(address < at + size and at < address + n for at, size in held))
    copies = []
    for item in recipe['copies']:
        if allowed(item['address'], item['length']):
            copies.append(item)
            continue
        offset, end = item['offset'], item['offset'] + item['length']
        while offset < end:
            for n in range(min(32, end - offset), 0, -1):
                piece = image[offset:offset + n]
                at = stock.find(piece, max(0, STOCK_FROM - stock_load),
                                min(len(stock), STOCK_END - stock_load))
                while at >= 0 and not allowed(stock_load + at, n):
                    at = stock.find(piece, at + 1, min(len(stock), STOCK_END - stock_load))
                if at >= 0:
                    break
            else:
                raise ValueError('No readable unowned stock copy for authored span')
            copies.append(dict(item, offset=offset, length=n, address=stock_load + at,
                               sha256=hashlib.sha256(piece).hexdigest()))
            offset += n
    return dict(recipe, copies=copies)


def compile_source(args, base, work):
    """Compile and prune the exact grain-only runtime; work supplies base_identity.h."""
    sys.path.insert(0, str(base / 'sdk/runtime'))
    import m68k_codegen
    resident = base / 'sdk/machines/octatrack/module-adapters/resident-runtime'
    includes = (CORE, MODULE, DRAFT, resident, base / 'sdk/machines/octatrack/include',
                base / 'sdk/runtime/loader', base / 'sdk/runtime/upload')
    flags = ['-mcpu=54455', '-malign-int', '-msoft-float', '-Os', '-std=c11',
        *m68k_codegen.FLAGS, '-ffreestanding', '-fno-builtin', '-fno-common', '-fno-pic',
        *(['-DOG_MACHINE_CPU_PROFILE'] if args.cpu_profile else []),
        *(['-DOG_MACHINE_CPU_PROFILE_DETAIL'] if args.cpu_profile_detail else []),
        '-fno-tree-loop-distribute-patterns', '-fno-asynchronous-unwind-tables',
        '-fno-unwind-tables', '-fomit-frame-pointer', '-ffunction-sections', '-fdata-sections',
        '-Wall', '-Wextra', '-Werror', '-DOG_MACHINE_PROTOTYPE',
        '-DOG_MACHINE_START_EXTENSION', '-DOG_NATIVE_STAGE_ONE', '-DOG_MACHINE_BASE_BOUND',
        '-DOG_MACHINE_GRAIN_ONLY',
        *['-I' + str(p) for p in includes]]
    run = lambda argv: subprocess.run(list(map(str, argv)), check=True, capture_output=True)
    sources = [DRAFT / (n + '.c') for n in
        ('machine', 'render', 'start', 'registration', 'base_binding')]
    if args.cpu_profile:
        sources.append(DRAFT / 'cpu_profile.c')
    sources += [core_unit(n + '.c') for n in ('grain', 'pitch', 'control', 'source')]
    sources += [base / 'sdk/runtime/logging/freestanding.c']
    objects = []
    for source in sources:
        obj = work / (source.stem + '.o')
        # The bounded packet renderer is a frame hot path. Other units use Os.
        optimize = ['-O2'] if source.stem == 'render' else []
        run([args.cross + 'gcc', *flags, *optimize, '-I' + str(work), '-c', source, '-o', obj])
        objects.append(obj)
    m68k_codegen.check_mcf54455(objects, args.cross + 'objdump')
    kernel = work / 'kernel.o'
    run([args.cross + 'as', '-mcpu=54455', core_unit('kernel.s'), '-o', kernel])
    objects.append(kernel)
    kept = work / 'machine.o.all'
    runtime = json.loads((DRAFT / 'runtime.experimental.json').read_text())
    roots = ['og_machine_descriptor', 'og_machine_start_descriptor']
    roots += [hook['fn'] for hook in runtime.get('subscribe', [])]
    run([args.cross + 'ld', '-r', '--gc-sections',
         *['--undefined=' + name for name in roots], '-o', kept, *objects])
    unresolved = {line.split()[-1] for line in
        run([args.cross + 'nm', '-u', kept]).stdout.decode().splitlines()}
    if any(n.startswith('mw_source_') for n in unresolved):
        raise ValueError('Grain-only package retains a SPACE source-stage import')
    if unresolved - IMPORTS:
        raise ValueError('Unapproved unresolved imports: ' + ', '.join(sorted(unresolved - IMPORTS)))
    return kept, sources, includes, runtime, unresolved


def build(args):
    if args.cpu_profile_detail and not args.cpu_profile:
        raise ValueError('CPU profile detail requires --cpu-profile')
    base = args.base_root.resolve()
    paired = args.base_build.resolve()
    sys.path.insert(0, str(base / 'sdk'))
    import firmware_codec
    firmware_codec.use_elekloader(args.upstream.resolve())
    proofs = json.loads((paired / 'proofs.json').read_text())
    symbols = json.loads((paired / 'symbols.json').read_text())
    # The current grain-only machine uses the public START ABI, without the
    # archived source-stage transport. Its signature must survive boot before
    # the card restores the saved modules.
    registry = (base / 'sdk/machines/octatrack/elekloader/machine_registry.c').read_text()
    header = (base / 'sdk/machines/octatrack/include/modwerk_events.h').read_text()
    if "{{'F', 'R'}, 1, 1}" not in registry or '#define MODWERK_MACHINE_START_ABI 1u' not in header:
        raise ValueError('Requires FR:1 boot preservation and START ABI 1')
    digest = bytes.fromhex(proofs['configurationHash'])
    address = symbols['modwerk_base_digest']
    if len(digest) != 32 or not 0x40000400 <= address <= 0x41000000 - 32:
        raise ValueError('Invalid private base identity binding')
    main = (paired / 'MAIN.raw').read_bytes()
    if hashlib.sha256(main).hexdigest() != proofs['manifest']['main_sha256']:
        raise ValueError('Paired MAIN hash differs from its build proof')
    layout = proofs['manifest']['link']['layout']
    run = load('fract_base_run_pack', base / 'sdk/machines/octatrack/elekloader/run_pack.py')
    plain = run.unpack(main, layout, symbols, 0x40000400)
    at = layout['run_load'] - 0x40000400 + address - layout['ddr'][0]
    if plain[at:at + 32] != digest:
        raise ValueError('Paired MAIN does not carry its recorded base identity')
    # Headers/API and the linked base must describe the same source inputs.
    for path, expected in proofs['sources'].items():
        if (base / path).is_file() and sha(base / path) != expected:
            raise ValueError('Base source drift: ' + path)
    if args.output.exists():
        raise ValueError('Use a new private output directory')
    sys.path.insert(0, str(base / 'sdk/runtime'))
    from elekloader import formats
    parsed, device, release = formats.load(str(args.stock))
    stock_main = formats.main_image(parsed, device)
    if (device.key != 'octatrack' or release.version != '1.40C' or
            hashlib.sha256(stock_main).hexdigest() != release.main_sha256):
        raise ValueError('Original Octatrack 1.40C is required')
    pack = load('fract_runtime_build', base / 'sdk/runtime/loader/build.py')
    packages = load('fract_scan_runs', base / 'sdk/machines/octatrack/elekloader/module_packages.py')
    scanner = load('fract_scan_diagnostic', base / 'sdk/machines/octatrack/elekloader/check_stock_free.py')
    recipe_api = load('fract_stock_recipe', base / 'sdk/machines/octatrack/module-adapters/stock_recipe.py')
    events = load('fract_base_events', base / 'sdk/machines/octatrack/events.py').load()
    base_packages = [args.base_package.resolve()] if args.base_package else list((paired / 'package').glob('*.elemod'))
    if len(base_packages) != 1 or sha(base_packages[0]) != proofs['packageSha256']:
        raise ValueError('Paired base package differs from its build proof')
    base_package = json.loads(base_packages[0].read_text())
    # The zero-span proof uses this original 1.40C routine. Its sole paired-
    # base detour is the increment hook, not reached by a zero span below16.
    for site in base_package['sites']:
        at, count = int(site['addr'], 16), site['len']
        if at < 0x40004268 and 0x40004008 < at + count and (at, count) != (0x40004100, 8):
            raise ValueError('Unqualified native zero-span routine patch')
    run = lambda argv: subprocess.run(list(map(str, argv)), check=True, capture_output=True)
    with tempfile.TemporaryDirectory(prefix='fract-machine-package-') as temp:
        work = Path(temp)
        (work / 'base_identity.h').write_text(
            '#define OG_BASE_DIGEST_ADDRESS 0x%xu\n' % address +
            'static const uint8_t og_expected_base_digest[32] = {%s};\n' %
            ','.join(hex(b) for b in digest))
        kept, sources, includes, runtime, unresolved = compile_source(args, base, work)
        imports = work / 'imports.s'
        for name in unresolved:
            if not 0x40000400 <= symbols[name] < 0x41000000:
                raise ValueError('Import outside paired base: ' + name)
        imports.write_text('\n'.join('.global %s\n.set %s,0x%x' % (n, n, symbols[n])
                                     for n in sorted(unresolved)) + '\n')
        imports_obj = work / 'imports.o'
        run([args.cross + 'as', '-mcpu=54455', imports, '-o', imports_obj])
        image, names, bss, relocs = pack.link_units([kept, imports_obj], args.cross, 0, work, anywhere=True)
        if any(n.startswith(('og_space_', 'og_source_')) for n in names):
            raise ValueError('Grain-only image retains SPACE code or state')
        if any(n in names for n in ('og_render', 'og_release_check', 'og_fetch')):
            raise ValueError('Obsolete FX entrypoints survived pruning')
        hooks = pack.subscribe([], pack.entries(runtime), names, registry=events)
        input_paths = set(sources + list(DRAFT.glob('*.h')) + list(CORE.glob('*.h')) + list(MODULE.glob('*.h')) +
            [DRAFT / 'fract_ui.c', MODULE / 'selection.c', MODULE / 'source.c', MODULE / 'metadata.c',
             core_unit('kernel.s'), Path(__file__),
             DRAFT / 'runtime.experimental.json',
             base / 'sdk/runtime/loader/build.py',
             base / 'sdk/machines/octatrack/elekloader/run_pack.py',
             base / 'sdk/machines/octatrack/elekloader/module_packages.py',
             base / 'sdk/machines/octatrack/elekloader/check_stock_free.py',
             base / 'sdk/machines/octatrack/module-adapters/stock_recipe.py',
             base / 'sdk/machines/octatrack/events.py',
             base / 'sdk/machines/octatrack/events.json',
             base / 'sdk/runtime/m68k_codegen.py'])
        for folder in includes:
            input_paths.update(folder.rglob('*.h'))
        input_paths.update(firmware_codec.sources())
        inputs = {(str(p.relative_to(ROOT)) if p.is_relative_to(ROOT) else
                   'base/' + str(p.relative_to(base))): sha(p) for p in sorted(input_paths)}
        inputs.update({'paired/' + p.name: sha(p)
                       for p in [paired / 'proofs.json', paired / 'symbols.json', base_packages[0]]})
        if args.capture_stock_recipe:
            if args.capture_stock_recipe.exists():
                raise ValueError('Use a new recipe capture path')
            recipe = pack.capture_machine_recipe(PACKAGE_ID, image, relocs, inputs, args)
            recipe = bounded_recipe(recipe, image, stock_main, device.main_load, events, base_package)
            _, copies, _ = recipe_api.apply(image, relocs, recipe, inputs)
            checked_copies(pack, copies, args.stock, args.upstream, events, base_package)
            args.capture_stock_recipe.write_text(json.dumps(recipe, indent=2) + '\n')
            print('Captured hash-only recipe; review separately before --stock-recipe:',
                  args.capture_stock_recipe)
            return
        if not args.stock_recipe:
            raise ValueError('Capture/review a hash-only recipe, then pass --stock-recipe')
        recipe = json.loads(args.stock_recipe.read_text())
        authored_image = image
        image, copies, fills = recipe_api.apply(image, relocs, recipe, inputs)
        checked_copies(pack, copies, args.stock, args.upstream, events, base_package)
        rebuilt = bytearray(image)
        for offset, address, n, _ in copies:
            at = address - device.main_load
            rebuilt[offset:offset + n] = stock_main[at:at + n]
        for offset, n, value in fills:
            rebuilt[offset:offset + n] = bytes([value]) * n
        if bytes(rebuilt) != authored_image:
            raise ValueError('Runtime reconstruction differs from the authored image')
        data = pack.package(image, bss, hooks, relocs, name=PACKAGE_ID,
                            abi=8, hashed=True, title='FRACT', layout=1, copies=copies, fills=fills)
        try:
            pack.private_stock_free(data, args.stock, stock_main, args.upstream)
        except ValueError:
            for offset, length in sorted(packages.runs(data, stock_main).items()):
                if length < packages.LIMIT:
                    continue
                image_offset = offset - 76 - 4 * len(hooks)
                preceding = sorted((v, k) for k, v in names.items() if 0 <= v <= image_offset)
                print('Stock nonfiller scan:', offset, length,
                      'image', image_offset, 'after', preceding[-1:], file=sys.stderr)
            hits = scanner.stock_runs({'sections': {'package': {'parts': [['hex', data.hex()]]}}},
                                     scanner.haystacks(args.stock, args.upstream), 16)
            local = sorted((v, k) for k, v in names.items() if 0 <= v < len(image))
            for where, offset, length, stock_label in hits[:20]:
                image_offset = offset - 76 - 4 * len(hooks)
                preceding = [(v, k) for v, k in local if v <= image_offset]
                print('Stock scan:', offset, length, stock_label,
                      'image', image_offset, 'after', preceding[-1:] , file=sys.stderr)
            raise
        report = dict(schema=1, kind='PRIVATE_EXPERIMENTAL_NOT_DEVICE_QUALIFIED', author='ex1010',
            baseConfigurationHash=digest.hex(), baseMainSha256=hashlib.sha256(main).hexdigest(),
            packageSha256=hashlib.sha256(data).hexdigest(), bytes=len(data), imageBytes=len(image),
            bssBytes=bss, relocations=len(relocs), imports={n:symbols[n] for n in sorted(unresolved)},
            tracks=[1,2,3,4], grains=3, hardware='NOT_RUN', emulator='NOT_RUN',
            stockFree='PASS: both unchanged strict scans',
            authoredImageSha256=hashlib.sha256(authored_image).hexdigest(),
            reconstruction='PASS: byte-exact authored image',
            stockRecipeSha256=sha(args.stock_recipe), stockCopies=len(copies),
            spaceEnabled=False, cpuProfile=args.cpu_profile,
            cpuProfileDetail=args.cpu_profile_detail,
            mainControls=['POS','SIZE','REVS','SPRD','SHPE','PTCH'],
            sources=inputs)
        args.output.mkdir(parents=True)
        (args.output / 'FRACT.mwrm').write_bytes(data)
        (args.output / 'proofs.json').write_text(json.dumps(report, indent=2) + '\n')
        (args.output / 'symbols.json').write_text(json.dumps(names, indent=2) + '\n')
        print(json.dumps({k:report[k] for k in ('bytes','imageBytes','bssBytes','relocations',
                         'packageSha256','baseConfigurationHash','stockFree')}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('base-root', 'base-build', 'upstream', 'stock', 'output'):
        parser.add_argument('--' + name, type=Path, required=True)
    parser.add_argument('--base-package', type=Path, help='Exact supported generator package, checked against the base proof')
    recipes = parser.add_mutually_exclusive_group()
    recipes.add_argument('--capture-stock-recipe', type=Path)
    recipes.add_argument('--stock-recipe', type=Path)
    parser.add_argument('--cross', default='m68k-elf-')
    parser.add_argument('--cpu-profile', action='store_true', help='Private timing telemetry through the existing DIAG value; no sound/control change')
    parser.add_argument('--cpu-profile-detail', action='store_true', help='Private grain phase timing fields; requires --cpu-profile')
    try:
        build(parser.parse_args())
    except subprocess.CalledProcessError as error:
        sys.exit(error.stderr.decode() if error.stderr else str(error))
