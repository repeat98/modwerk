# SPDX-License-Identifier: GPL-3.0-or-later
"""Runtime packages bound to one exact public base (their manifest entry names it as requiredBase).

The controller packages (Sidechain Compressor, Output Matrix) and Analog BD call the base's write-lease entries by
absolute address, and the base admits them only through the trust rows built into it (controller-policies.json, which
`rows` encodes against the base's empty-row link). A row pins the controller digest (the package without its DSP
part), so Analog BD's engine, which its package carries (ABI 10, hook_engines.py), can change without a new row. The cave ports (CC Map, Recorder Loop Fix) are linked for the base's
moved arena and its runtime pool. `npm run octatrack:base` writes what they link against,
sdk/machines/octatrack/base-binding.json, from the base it actually built (runtime_candidate.bind_base: image,
symbol map and IDENTIFY digest agree). `build` rebuilds each package from source and that binding, with no firmware;
given the stock OS, the cave ports' stock guards are also checked against it.

  base_bound.py rows --base-symbols EMPTY/symbols.json --upstream ELEKLOADER --out NEW-DIR   # the trust rows
  base_bound.py bind BUILD [--policies controller-policies.json] -o BINDING                  # a build's binding
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

HERE = Path(__file__).resolve().parent
APP = HERE.parents[3]
sys.path.insert(0, str(HERE))
import candidate_packages  # noqa: E402
import cave_runtime  # noqa: E402
import hook_engines  # noqa: E402
import runtime_candidate  # noqa: E402
import stock_hook_controllers  # noqa: E402

BINDING = APP / 'sdk/machines/octatrack/base-binding.json'
POLICIES = HERE / 'controller-policies.json'
BUILD = APP / 'sdk/runtime/loader/build.py'
DSP_ASM = Path.home() / '.cache/modwerk-upstream/octabam/vendor/dsp56300/build/source/dsp_host/dsp_asm'  # octatrack-base.mjs's default
# The base symbols a package names: the lease entries, the mark that the base owns Output Matrix's boot widenings, and
# the slot that tells Sidechain the base raises ev_mute_keep.
SYMBOLS = (*stock_hook_controllers.LEASE_IMPORTS, stock_hook_controllers.BASE_OWNED_MARK,
           'modwerk_raise_' + stock_hook_controllers.MUTE_KEEP['event'])
# Machines whose renderer writes under the board's lease (machine-ports.json "controller"), and their feature.
MACHINES = {'analog-bassdrum': 4}
MODULES = (*stock_hook_controllers.UNITS, *MACHINES, *cave_runtime.PORTS)


def _builder():
    spec = importlib.util.spec_from_file_location('base_bound_builder', BUILD)
    builder = importlib.util.module_from_spec(spec); spec.loader.exec_module(builder)
    return builder


def bind(build, policies):
    """The binding of one base build_core.py made (its directory), with the trust rows it was built with."""
    build = Path(build)
    symbols = json.loads((build / 'symbols.json').read_text())
    bound = runtime_candidate.bind_base((build / 'MAIN.raw').read_bytes(), symbols,
                                        json.loads((build / 'proofs.json').read_text()))
    controllers = {row['module']: row['controllerSha256'] for row in policies}
    if any(name not in stock_hook_controllers.UNITS and name not in MACHINES for name in controllers):
        raise ValueError('A trust row names a module that is not a controller.')
    return dict(schema=1, identity=bound['identity'], arena=bound['arena'], pool=bound['pool'],
                symbols={name: symbols[name] for name in SYMBOLS if name in symbols}, controllers=controllers)


def load(binding=None):
    binding = json.loads(BINDING.read_text()) if binding is None else binding
    if (binding.get('schema') != 1 or not isinstance(binding.get('identity'), str) or len(binding['identity']) != 64
            or any(type(binding.get(key)) is not int for key in ('arena', 'pool'))
            or not isinstance(binding.get('symbols'), dict) or not isinstance(binding.get('controllers'), dict)):
        raise ValueError('sdk/machines/octatrack/base-binding.json is malformed: rebuild the base.')
    return binding


def _assemble():
    """The native DSP assembler's API (dsp_packages.assemble; ELEKLOADER_DSP_ASM names the binary, else dsp_asm on
    PATH, else the build `npm run upstream:tools` keeps, as for the base)."""
    if 'ELEKLOADER_DSP_ASM' not in os.environ and not shutil.which('dsp_asm') and DSP_ASM.is_file():
        os.environ['ELEKLOADER_DSP_ASM'] = str(DSP_ASM)
    spec = importlib.util.spec_from_file_location('base_bound_dsp', APP / 'sdk/machines/octatrack/elekloader/dsp_packages.py')
    packages = importlib.util.module_from_spec(spec); spec.loader.exec_module(packages)
    return packages.assemble


def machine(module, symbols, upstream, work, lease=False):
    """A lease-holding machine through build.py's machine route against these base symbols, with its engine for the
    base's hook site (hook_engines.py): (package, lease offsets)."""
    work = Path(work); work.mkdir(parents=True, exist_ok=True)
    (work / 'base-symbols.json').write_text(json.dumps(symbols))
    out = work / (module + '.mwrm')
    subprocess.run([sys.executable, '-B', str(BUILD), '--octabam-machine', module, '--upstream', str(upstream),
                    '--base-symbols', str(work / 'base-symbols.json'), '-o', str(out)] +
                   (['--lease-policy', str(work / 'lease.json')] if lease else []),
                   check=True, capture_output=True, text=True, cwd=APP)
    data = out.read_bytes()
    if module in hook_engines.PACKAGES:
        (work / 'engine').mkdir(exist_ok=True)
        data = hook_engines.PACKAGES[module](data, APP / 'sdk/octabam', work / 'engine', _assemble())
    return data, json.loads((work / 'lease.json').read_text()) if lease else None


def machine_row(module, data, lease, builder):
    """Its trust row: the package, its renderer's lease continuations and a source policy over its reviewed inputs."""
    feature = MACHINES[module]
    entries = {'ab_render': dict(entry=lease['entry'], beginReturn=lease['beginReturn'], endReturn=lease['endReturn'])}
    policy = dict(schema=1, module=module, feature=feature, revisions=list(stock_hook_controllers.REVISIONS),
                  sourceHashes=builder.machine_inputs(module, HERE), entries=entries)
    if lease['imageBytes'] != int.from_bytes(data[8:12], 'big'):
        raise ValueError('%s: the lease offsets name another image.' % module)
    return dict(module=module, moduleId=builder.module_id(module), controllerSha256=stock_hook_controllers.controller_sha256(data),
                sourcePolicySha256=hashlib.sha256(json.dumps(policy, sort_keys=True, separators=(',', ':')).encode()).hexdigest(),
                revisions=list(stock_hook_controllers.REVISIONS), feature=feature,
                requiredCores=stock_hook_controllers.REQUIRED_CORES[feature], version=1, imageBytes=lease['imageBytes'],
                entryName='ab_render', **entries['ab_render'])


def rows(symbols_path, upstream, out):
    """Every trust row for one base link (its empty-row build's symbols): the controllers' and each machine's."""
    out = Path(out)
    stock_hook_controllers.main(['--base-symbols', str(symbols_path), '--upstream', str(upstream), '--out', str(out / 'controllers')])
    found = json.loads((out / 'controllers/controller-policies.json').read_text())
    symbols = json.loads(Path(symbols_path).read_text())
    builder = _builder()
    for module in MACHINES:
        data, lease = machine(module, {name: symbols[name] for name in SYMBOLS if name in symbols}, upstream,
                              out / (module + '-work'), lease=True)
        found.append(machine_row(module, data, lease, builder))
    stock_hook_controllers.policies_c(found)  # checked as the board checks them
    (out / 'controller-policies.json').write_text(json.dumps(found, indent=1))
    return found


def build(module, upstream, work, stock_at=None, binding=None):
    """One base-bound package and the base identity it needs."""
    binding, work = load(binding), Path(work)
    builder = _builder()
    if module in stock_hook_controllers.UNITS:
        data = stock_hook_controllers.encode(module, APP / 'sdk/octabam', builder, work, binding['symbols'], upstream)['package']
    elif module in MACHINES:
        data, _ = machine(module, binding['symbols'], upstream, work)
    elif module in cave_runtime.PORTS:
        bound = dict(arena=binding['arena'], poolOrigins=runtime_candidate.pool_origins(binding['pool']))
        work.mkdir(parents=True, exist_ok=True)
        data, _ = candidate_packages.authored(APP, upstream, module, builder, bound, stock_at, work, 'm68k-elf-')
    else:
        raise ValueError('No base-bound route for ' + module)
    if (module in stock_hook_controllers.UNITS or module in MACHINES) and \
            binding['controllers'].get(module) != stock_hook_controllers.controller_sha256(data):
        raise ValueError('%s: the base\'s trust row names another controller (its CF part changed); rebuild the base '
                         '(npm run octatrack:base -- --beta --write).' % module)
    # Never a write or copy on a site the base owns: its records are its controller's (an engine adds none).
    builder.unevented(*candidate_packages.records((work / (module + '.mwrm')).read_bytes() if module in MACHINES else data))
    return data, binding['identity']


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = ap.add_subparsers(dest='command', required=True)
    r = sub.add_parser('rows', help='encode every trust row against an empty-row base link')
    r.add_argument('--base-symbols', type=Path, required=True)
    r.add_argument('--upstream', type=Path, required=True)
    r.add_argument('--out', type=Path, required=True, help='new private directory outside Git')
    b = sub.add_parser('bind', help="write one base build's binding (npm run octatrack:base runs this)")
    b.add_argument('build', type=Path, help="build_core.py's output directory")
    b.add_argument('--policies', type=Path, help='the controller trust rows it was built with')
    b.add_argument('-o', '--output', type=Path, required=True)
    a = ap.parse_args(argv)
    if a.command == 'rows':
        rows(a.base_symbols, a.upstream.expanduser().resolve(), a.out)
    else:
        policies = json.loads(a.policies.read_text()) if a.policies else []
        a.output.write_text(json.dumps(bind(a.build, policies), indent=1) + '\n')


if __name__ == '__main__':
    main()
