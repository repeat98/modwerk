# SPDX-License-Identifier: GPL-3.0-or-later
"""Explicit private catalogue preparation; never public publication or admission.

The ordinary generator keeps the published six intact. This path requires
original stock and an independently bound private base, compiles only reviewed
authored ports, and checks both unchanged strict scanners before saving. Mute
Modes stays in held evidence because table/menu pointer lifetime is unqualified.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import subprocess
import tempfile

sys.path.append(str(Path(__file__).resolve().parents[3]))  # sdk/, for firmware_codec
import firmware_codec  # noqa: E402
import cave_runtime
import runtime_candidate
import runtime_units
import standalone_runtime
import stock_recipe

PORTS = (*standalone_runtime.PORTS, *cave_runtime.PORTS, 'mute-modes')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


def inputs(root, upstream, module):
    """Concrete native inputs; the declaration itself is separately pinned."""
    paths = list((root / ('sdk/octabam/modules/' + module)).rglob('*'))
    paths += list((root / 'sdk/octabam/tools/remix').rglob('*.py'))
    paths += [root / ('sdk/machines/octatrack/module-adapters/' + name) for name in
              ('candidate_packages.py', 'runtime_candidate.py', 'cave_runtime.py',
               'runtime_units.py', 'runtime_tables.py', 'stock_recipe.py', 'standalone_runtime.py')]
    paths += [root / 'sdk/runtime/loader/build.py', root / 'sdk/machines/octatrack/elekloader/module_packages.py',
              root / 'scripts/runtime_private_paths.py']
    result = {path.relative_to(root).as_posix(): digest(path.read_bytes()) for path in paths
              if path.is_file() and path.suffix in ('.py', '.s', '.S', '.inc', '.json')}
    result.update(firmware_codec.inputs(upstream))  # the checkout's files it runs, and the codec it runs them with
    return result


def records(data):
    """Read guards from the actual package, not the proposed manifest."""
    abi = int.from_bytes(data[4:6], 'big')
    if data[:4] != b'MWRM' or abi not in (6, 7, 8, 9):
        raise ValueError('A private package has an unsupported header.')
    read = lambda at, n=4: int.from_bytes(data[at:at + n], 'big')
    header = {6: 68, 7: 72, 8: 76, 9: 80}[abi]  # ABI 9's claims and hook entries follow the fills: no stock guards
    if len(data) < header:
        raise ValueError('A private package has a truncated header.')
    at = header + read(20) * 4 + read(8) + read(16) * 4
    sites, copies = [], []
    for _ in range(read(24)):
        if abi < 7 or at + 40 > len(data):
            raise ValueError('Private packages need bounded hash-only stock sites.')
        address, size, keep, checked, count = read(at), *data[at + 4:at + 8]
        end = at + 40 + size + count * 2
        if end > len(data):
            raise ValueError('A private stock site exceeds its package.')
        sites.append((address, data[at + 8:at + 40], data[at + 40:at + 40 + size], [], keep, checked))
        at = end
    for _ in range(read(68) if abi >= 7 else 0):
        if at + 44 > len(data):
            raise ValueError('A private stock copy exceeds its package.')
        copies.append((read(at), read(at + 4), read(at + 8, 2), data[at + 12:at + 44]))
        at += 44
    return sites, copies


def declaration(root, module, sources):
    document = json.loads((root / 'sdk/machines/octatrack/module-adapters/candidate-recipes.json').read_text())
    if document.get('schema') != 1 or set(document.get('ports', {})) != {'cc-map', 'mute-modes'}:
        raise ValueError('The private cave/table declaration set changed.')
    recipe = document['ports'][module]
    if recipe.get('sources') != sources:
        raise ValueError('The private cave/table declaration does not name the exact source inputs.')
    return recipe


def recorder_source_oracle(module, sdk, builder, work, cross, image, bss, offsets, binding):
    """Freshly assemble authored source with the exact arena constant.

    Imported files stay untouched. This independent source compile performs no
    binary arena rewrite; compare it with the existing adapter at zero and both
    actual pool origins before representing its literals as guarded copies.
    """
    source = work / 'bound-source'; source.mkdir(parents=True)
    paths = {path for cave in module.cf_patches for path in cave_runtime.source_files(sdk, cave.source)}
    old, new = hex(cave_runtime.STOCK_ARENA), hex(binding['arena'])
    for path in paths:
        destination = source / path.relative_to(sdk)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(path.read_text().replace(old, new))
    objects, definitions = [], []
    for index, cave in enumerate(module.cf_patches):
        obj = work / ('bound-unit-%d.o' % index)
        cave_runtime.run([cross + 'as', '-mcpu=' + cave.cpu, source / cave.source, '-o', obj], cwd=source)
        objects.append(obj)
        definitions += list(cave.defsyms)
    proofs = []
    for origin in (0, *binding['poolOrigins']):
        fresh, _, fresh_bss = cave_runtime.link_objects(builder, objects, cross, origin,
            work / ('bound-origin-%x' % origin), definitions)
        if fresh_bss != bss or fresh != cave_runtime.placed(image, offsets, origin):
            raise ValueError('Recorder arena rewriting differs from fresh authored-source assembly.')
        proofs.append(dict(origin=origin, sha256=digest(fresh)))
    return proofs


def authored(root, upstream, module, builder, binding, stock_at, work, cross):
    firmware_codec.use_elekloader(upstream)
    from elekloader.sdk import octabam
    sdk = root / 'sdk/octabam'
    port = octabam.Octabam(str(sdk)).modules[module]
    source_hashes = inputs(root, upstream, module)
    hooks = []
    if module in cave_runtime.PORTS:
        image, bss, offsets, sites, copies, sources, proofs = cave_runtime.prepare_caves(
            port, sdk, builder, work, cross, binding['arena'], pool_origins=binding['poolOrigins'])
        if any(source_hashes.get(name) not in (None, value) for name, value in sources.items()):
            raise ValueError('A cave source changed before native compilation.')
        if module == 'cc-map':
            recipe = declaration(root, module, source_hashes)
            if recipe.get('fills'):
                raise ValueError('The reviewed cave port has no constant fills.')
            image, extra, _ = stock_recipe.apply(image, offsets, recipe, source_hashes)
            copies += extra
        cave_runtime.validate_relocations(image, offsets, len(image) + bss,
                                          [(at, n) for at, _, n, _ in copies])
        title = cave_runtime.PORTS[module][0]
    elif module == 'mute-modes':
        recipe = declaration(root, module, source_hashes)
        result = runtime_units.compile_linked(port, sdk, builder, work, cross, {port.key}, recipe['tables'], stock_at)
        image, bss, offsets, sites, copies, hooks = (result[name] for name in ('image', 'bss', 'offsets', 'sites', 'copies', 'hooks'))
        proofs, title = {name: result[name] for name in ('referenceProofs', 'tableOracle', 'origins')}, 'Mute Modes'
    else:
        raise ValueError('No reviewed private native adapter for ' + module)
    # Validate every original guard against original stock when it is given (publication without firmware leaves
    # it to the base, which checks every guard against its running code before it writes anything).
    for address, guard, _, _, _, n in sites if stock_at else ():
        if digest(stock_at(address, n)) != guard.hex():
            raise ValueError('An authored runtime site differs from original stock.')
    for _, address, n, guard in copies if stock_at else ():
        if digest(stock_at(address, n)) != guard.hex():
            raise ValueError('An authored runtime copy differs from original stock.')
    if module == 'recorder-loop-fix':
        proofs['sourceBoundOracles'] = recorder_source_oracle(port, sdk, builder, work, cross,
                                                             image, bss, offsets, binding)
        image, arena_copies = runtime_candidate.guarded_arena_literals(
            image, offsets, binding['arena'], proofs['arenaLiterals'])
        copies += arena_copies
        cave_runtime.validate_relocations(image, offsets, len(image) + bss,
                                          [(at, n) for at, _, n, _ in copies])
        proofs['arenaGuard'] = dict(address=runtime_candidate.ARENA_WORDS[0], length=4,
            sha256=arena_copies[0][3].hex(), offsets=[row[0] for row in arena_copies],
            meaning='arena resource word, not the full base identity')
    if source_hashes != inputs(root, upstream, module):
        raise ValueError('A private native input changed during compilation.')
    return builder.package(image, bss, hooks, offsets, sites, name=module, hashed=True, title=title,
                           layout=1, copies=copies, abi=8), proofs


def prepare(args, generator):
    """Trusted developer CLI only; no paths or source pins come from MCP tool args."""
    selected = tuple(args.prepare_ports.split(','))
    if (not selected or len(set(selected)) != len(selected) or any(name not in PORTS for name in selected)
            or args.check or not all((args.stock, args.output_dir, args.base_image, args.base_symbols, args.base_proof))):
        raise ValueError('Private preparation needs explicit reviewed ports, original stock, new output and exact native base inputs.')
    root, upstream = generator.APP, args.upstream.expanduser().resolve()
    builder = load('candidate_runtime_builder', root / 'sdk/runtime/loader/build.py')
    main = args.base_image.read_bytes()
    binding = runtime_candidate.bind_base(main, json.loads(args.base_symbols.read_text()), json.loads(args.base_proof.read_text()))
    firmware_codec.use_elekloader(upstream)
    from elekloader import formats
    parsed, device, release = formats.load(str(args.stock))
    original = formats.main_image(parsed, device)
    if device.key != 'octatrack' or release.version != '1.40C' or digest(original) != release.main_sha256:
        raise ValueError('Private guards require original Octatrack 1.40C.')
    def stock_at(address, size):
        at = address - device.main_load
        if at < 0 or size < 1 or at + size > len(original):
            raise ValueError('Private stock spans must stay in the original MAIN image.')
        return original[at:at + size]
    os.umask(0o077)
    out = runtime_candidate.private_output(args.output_dir)
    manifest = json.loads(generator.MANIFEST.read_text())
    versions = {m['id']: m['version'] for m in json.loads((root / 'sdk/catalog.json').read_text())['modules']}
    entries, held, evidence = [], [], []
    with tempfile.TemporaryDirectory(dir=out) as temp:
        work = Path(temp)
        # Prove the ordinary public generator still makes every existing byte.
        for entry in manifest['packages']:
            data = generator.build(entry, work / 'existing.mwrm', upstream)
            if (len(data) != entry['bytes'] or digest(data) != entry['sha256']
                    or (generator.PUBLIC / entry['path']).read_bytes() != data
                    or generator.capabilities(data) != {name: entry[name] for name in ('abi', 'features', 'sites', 'copies', 'fills')}):
                raise ValueError('An existing published runtime package changed: ' + entry['id'])
            builder.private_stock_free(data, args.stock, original, upstream)
            runtime_candidate.check_sites_and_copies(main, *records(data))
            destination = out / entry['path']; runtime_candidate.private_paths.private_directory(destination.parent)
            runtime_candidate.private_paths.save(destination, data)
            entries.append(dict(entry))
        for module in selected:
            proofs = {}
            if module in standalone_runtime.PORTS:
                figures = standalone_runtime.PORTS[module]
                entry = dict(id=module, octabam=True, **{key: value for key, value in figures.items() if value is not None})
                data = generator.build(entry, work / (module + '.mwrm'), upstream, private_stock=args.stock)
            else:
                data, proofs = authored(root, upstream, module, builder, binding, stock_at, work / module, 'm68k-elf-')
                builder.private_stock_free(data, args.stock, original, upstream)
            runtime_candidate.check_sites_and_copies(main, *records(data))
            path = 'octatrack-modules/%s/%s.mwrm' % (module, versions[module])
            destination = out / path; runtime_candidate.private_paths.private_directory(destination.parent)
            runtime_candidate.private_paths.save(destination, data)
            entry = dict(id=module, version=versions[module], name=data[50:66].split(b'\0')[0].decode('ascii'),
                         module=data[28:32].hex(), bytes=len(data), sha256=digest(data), path=path,
                         requiredBase=binding['identity'], **generator.capabilities(data))
            if module == 'mute-modes':
                held.append(dict(entry, admission=False, reason='Table/menu widget, cursor and paused-root lifetime proof is pending.'))
            else:
                entries.append(entry)
            evidence.append(dict(id=module, proofs=proofs, strictStockFree=True, nativeBaseGuards=True,
                                 hardware=False, admission=False, sources=inputs(root, upstream, module)))
    # Publication and device admission remain a separate exact-source operation.
    receipt = dict(schema=1, preparation=True, base=binding, packages=entries, held=held, evidence=evidence,
                   sourceCommit=subprocess.check_output(['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip(),
                   limitations=['Private preparation only; published packages and runtime gates are unchanged.',
                                'No new physical install, audio/MIDI/recording, persistence, timing or all-companion evidence.'])
    runtime_candidate.private_paths.save(out / 'candidate-packages.json', receipt)
    for path in out.rglob('*'):
        path.chmod(0o700 if path.is_dir() else 0o600)
    print(json.dumps(dict(prepared=len(selected), cataloguePackages=len(entries), held=len(held), admission=False)))
    return receipt
