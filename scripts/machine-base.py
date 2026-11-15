#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Build a machine's Modwerk base from its source with Elekloader's SDK and check it against its binding.

    npm run machine:base -- analog-rytm-mkii --stock /private/Analog-Rytm_MKII_OS1.74.syx
    npm run machine:base -- analog-rytm-mkii --stock ... --out /private/NEW-DIR   # keep each .elemod
    npm run machine:base -- analog-rytm-mkii --stock ... --write                  # record a new identity
    npm run machine:base -- analog-rytm-mkii --stock ... --dev --out /private/DIR # development bases, never released

sdk/machines/<id>/elekloader/base.json names the core folder beside it (mod.json and its sources), the SDK
headers, the OS and the reviewed toolchain (sdk/build/Dockerfile's GCC and binutils for m68k-elf). The SDK is the
kit-pinned Elekloader checkout (npm run upstream:tools), run with Modwerk's codec (firmware_codec.use_elekloader), so
this build and the browser's kit cannot drift apart.
Modwerk's own sources, sites and tables are base.json's add, merged into the staged mod.json, so the imported files
stay exact; a site names its stock bytes by length and SHA-256, filled from the user's OS. The base is built in a
temporary tree outside Git and checked against the upstream release it started from: it must keep every item of
the fields base.json lists under reference.keeps. It is identified by the SHA-256 of its package, recorded
in sdk/machines/<id>/base-binding.json; without --write a different identity fails. The stock OS is read where it
lies and never copied into the repository.
base.json's variants name the layouts the base comes in, the first the default: a variant with "add": false leaves
add's parts out, so a build that needs none of them does not pay for them. base.json's common holds what every
variant carries (the same keys as add), merged before add; with neither, a variant is the imported recipe alone.
Each variant is built and checked the same way, and the binding records every variant's identity under variants, the default's as identity.
base.json's dev holds what only development bases carry (the same keys as add, and its own about), such as a USB
link any host may drive with no hand on the unit: --dev builds every variant with dev merged after add, writes them
as modwerk-base-<id>-dev-<sha>.elemod and checks them against no binding, so they can never be recorded or released.
A machine whose OS shares another's base names that machine in source: its elekloader folder is staged instead,
with this machine's own folders beside it. recipe then replaces the imported recipe's device, defsym and sites
(sites named by length and SHA-256, as add's) and adds sources. copies lays files of this machine's copies/ folder
over the staged ones; each names the file it was made from and that file's SHA-256, and the build refuses once the
original has changed, so a copy is redone rather than silently left behind.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile

APP = Path(__file__).resolve().parents[1]
sys.path.append(str(APP / 'sdk'))
import firmware_codec  # noqa: E402
sys.path.append(str(APP / 'sdk/runtime'))
import m68k_codegen  # noqa: E402

DEFAULT_UPSTREAM = Path.home() / '.cache/modwerk-upstream/elekloader'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def run(args, **kwargs):
    return subprocess.run(args, capture_output=True, text=True, **kwargs)


def inside_git(path):
    probe = path.resolve()
    while not probe.exists():
        probe = probe.parent
    result = run(['git', '-C', str(probe), 'rev-parse', '--is-inside-work-tree'])
    return result.returncode == 0 and result.stdout.strip() == 'true'


def stock_sha(machine, os_version):
    profile = json.loads((APP / 'sdk/machines' / machine / 'machine.json').read_text())
    for release in profile['firmware']['releases']:
        if release['version'] == os_version and release['files']:
            return release['files'][0]['sha256']
    raise ValueError('machine.json lists no stock file for OS %s.' % os_version)


def check_upstream(path):
    """The kit-pinned Elekloader checkout, at the kit's commit and with no edits of its own."""
    commit = json.loads((APP / 'vendor/elekloader/kit/kit.json').read_text())['commit']
    # In the toolchain image the mounted checkout belongs to another user, which Git otherwise refuses to read.
    git = ['git', '-c', 'safe.directory=' + str(path), '-C', str(path)]
    head = run(git + ['rev-parse', 'HEAD'])
    if head.returncode or head.stdout.strip() != commit:
        raise ValueError('%s is not the Elekloader checkout at the kit commit %s: run npm run upstream:tools.'
                         % (path, commit[:7]))
    if run(git + ['status', '--porcelain', '--untracked-files=no']).stdout.strip():
        raise ValueError('%s has local edits; keep your own work out of this checkout.' % path)
    return commit


def check_toolchain(toolchain):
    """The reviewed compiler: another GCC or binutils links a different base."""
    cross = toolchain['cross']
    gcc = run([cross + 'gcc', '-dumpfullversion'])
    if gcc.returncode or gcc.stdout.strip() != toolchain['gcc']:
        raise ValueError('%sgcc %s is needed (found %s): use sdk/build/Dockerfile\'s image or a matching toolchain.'
                         % (cross, toolchain['gcc'], gcc.stdout.strip() or 'none'))
    asm = run([cross + 'as', '--version'])
    if asm.returncode or not re.search(r'\b%s(\.|\s|$)' % re.escape(toolchain['binutils']), asm.stdout.splitlines()[0]):
        raise ValueError('%sas from binutils %s is needed (found %s).'
                         % (cross, toolchain['binutils'], (asm.stdout.splitlines() or ['none'])[0]))


LISTS = ('sources', 'cflags', 'sites', 'subscribe', 'contribute', 'storage', 'weak', 'copied', 'requires', 'conflicts')
DICTS = ('defsym', 'collections')


def merge(mod, add, sites):
    """mod.json with Modwerk's additions (base.json's add) after the imported recipe's own: lists extended,
    names added but never redefined. `sites` are add's sites with their stock bytes resolved."""
    for key, value in add.items():
        if key in LISTS:
            mod[key] = list(mod.get(key, [])) + list(sites if key == 'sites' else value)
        elif key in DICTS:
            merged = dict(mod.get(key, {}))
            for name, item in value.items():
                if name in merged and merged[name] != item:
                    raise ValueError('base.json add: %s %s is already defined by the core.' % (key, name))
                merged[name] = item
            mod[key] = merged
        else:
            raise ValueError('base.json add: %s is not something a base adds.' % key)
    return mod


def stock_sites(sites, stock):
    """Modwerk's sites name the stock bytes they replace by length and SHA-256, as Modwerk's modules do, so the
    repository holds none; the user's OS supplies them, checked against the hash."""
    from elekloader import formats
    parsed, dev, _ = formats.load(str(stock))
    image = formats.main_image(parsed, dev)
    resolved = []
    for site in sites:
        at = int(site['addr'], 16) - dev.main_load
        data = bytes(image[at:at + site['len']])
        if len(data) != site['len'] or sha(data) != site['stockSha256']:
            raise ValueError('Site %s: your OS does not hold the bytes base.json guards.' % site['addr'])
        resolved.append(dict({k: v for k, v in site.items() if k not in ('len', 'stockSha256')}, stock=data.hex()))
    return resolved


def variants(config):
    """[(name, with add)] in base.json's order, the default first; a base without variants is one layout with add."""
    return [(name, bool(variant['add'])) for name, variant in config.get('variants', {'base': {'add': True}}).items()]


def parts(config, add=True, dev=False):
    """What a variant merges into the recipe: base.json's common, then add when the variant takes it, then dev for a
    development base. Lists are joined; a name two of them define is refused."""
    out = {}
    for part in [config.get('common', {})] + ([config.get('add', {})] if add else []) + ([config['dev']] if dev else []):
        for key, value in part.items():
            if key == 'about':
                continue
            if key in DICTS:
                merged = dict(out.get(key, {}))
                for name, item in value.items():
                    if name in merged:
                        raise ValueError('base.json: %s %s is defined twice (common, add, dev).' % (key, name))
                    merged[name] = item
                out[key] = merged
            else:
                out[key] = list(out.get(key, [])) + list(value)
    return out


RECIPE = ('device', 'defsym', 'sites', 'sources')


def retarget(mod, recipe, sites):
    """mod.json for another machine's OS: recipe's device, defsym and sites (`sites`, their stock bytes resolved)
    in place of the imported ones, and its sources after them."""
    for key, value in recipe.items():
        if key not in RECIPE:
            raise ValueError('base.json recipe: %s is not something a recipe replaces.' % key)
        mod[key] = list(mod.get(key, [])) + list(value) if key == 'sources' else sites if key == 'sites' else value
    return mod


def stage(machine, config, root, sites=None, add=True, recipe_sites=None, dev=False):
    """The core folder and its sibling sources as mod.json expects them, with the SDK headers beside mod.json
    (the SDK compiles with -I on the mod's own folder first), and base.json's additions merged into the staged
    mod.json, so the imported files stay exact. Without `sites` (no stock OS at hand) the sites are left out;
    without `add` (a variant that leaves them out) only common is merged, and with no common either the imported
    recipe is staged alone. `dev` merges base.json's dev on top, for a development base."""
    own = APP / 'sdk/machines' / machine / 'elekloader'
    source = APP / 'sdk/machines' / config.get('source', machine) / 'elekloader'
    mods = root / 'mods'
    for item in source.iterdir():
        if item.is_dir():
            shutil.copytree(item, mods / item.name)
    if source != own:
        for item in own.iterdir():
            if item.is_dir() and item.name != 'copies':
                shutil.copytree(item, mods / item.name)
    for copy in config.get('copies', []):
        if sha((source / copy['from']).read_bytes()) != copy['sha256']:
            raise ValueError('%s has changed since its copy %s was made from it: redo the copy, then record the new '
                             'SHA-256 in base.json.' % (source.relative_to(APP) / copy['from'], copy['path']))
        shutil.copyfile(own / 'copies' / copy['path'], mods / copy['path'])
    core = mods / config['core']
    for item in (APP / config['include']).iterdir():
        shutil.copytree(item, core / item.name)
    add = parts(config, add, dev)
    if sites is None:
        add.pop('sites', None)
    recipe = dict(config.get('recipe', {}))
    if recipe_sites is None:
        recipe.pop('sites', None)
    if add or recipe:
        path = core / 'mod.json'
        mod = retarget(json.loads(path.read_text()), recipe, recipe_sites or [])
        path.write_text(json.dumps(merge(mod, add, sites or []), indent=1) + '\n')
    return core


def keeps(built, reference, keys):
    """The reference fields the built package does not keep: a list must still hold every item of the release it
    started from, a mapping every name with its value (the build record's sources among them), anything else must
    be equal. Modwerk's additions come on top."""
    missing = []
    for key in keys:
        have, want = built.get(key), reference.get(key)
        if isinstance(want, list):
            held = {json.dumps(item, sort_keys=True) for item in have or []}
            ok = all(json.dumps(item, sort_keys=True) in held for item in want)
        elif isinstance(want, dict):
            ok = isinstance(have, dict) and all(
                keeps(have, want, [name]) == [] if isinstance(value, (dict, list)) else have.get(name) == value
                for name, value in want.items())
        else:
            ok = have == want
        if not ok:
            missing.append(key)
    return missing


def sizes(package):
    return {name: section.get('len', section.get('size', 0)) for name, section in package['sections'].items()}


def build(machine, stock, upstream, out, dev=False):
    config = json.loads((APP / 'sdk/machines' / machine / 'elekloader/base.json').read_text())
    if dev and 'dev' not in config:
        raise ValueError('base.json of %s has no dev: this machine has no development base yet.' % machine)
    if sha(stock.read_bytes()) != stock_sha(machine, config['os']):
        raise ValueError('%s is not the original OS %s file machine.json names.' % (stock, config['os']))
    kit = check_upstream(upstream)
    check_toolchain(config['toolchain'])
    reference = config['reference']
    reference_bytes = (APP / reference['file']).read_bytes()
    if sha(reference_bytes) != reference['sha256']:
        raise ValueError('%s does not match base.json.' % reference['file'])
    firmware_codec.use_elekloader(upstream)
    from elekloader.sdk import build as sdk
    from elekloader import devices
    device = config.get('recipe', {}).get('device')
    if device and not any(d.key == device for d in devices.devices()):
        raise ValueError('The pinned Elekloader kit has no %s device yet, so this base cannot be built with it.' % device)
    os.environ['ELEKLOADER_CROSS'] = config['toolchain']['cross']
    built = []
    if out:
        out.mkdir(parents=True)
    for name, add in variants(config):
        with tempfile.TemporaryDirectory(prefix='modwerk-base-') as work:
            root = Path(work)
            core = stage(machine, config, root, stock_sites(parts(config, add, dev).get('sites', []), stock), add,
                         stock_sites(config['recipe']['sites'], stock) if 'sites' in config.get('recipe', {}) else None,
                         dev)
            try:
                sdk.build(str(core), str(stock), str(root / 'out'))
            except sdk.BuildError as error:
                raise ValueError('The SDK did not build the base (%s): %s' % (name, error))
            objects = sorted((root / 'out').rglob('*.c.o'))
            try:
                m68k_codegen.check(objects, config['toolchain']['cross'] + 'objdump')
            except ValueError as error:
                raise ValueError('The base (%s): %s' % (name, error))
            packages = sorted((root / 'out').glob('*.elemod'))
            if len(packages) != 1:
                raise ValueError('The SDK wrote %d packages, not one.' % len(packages))
            data = packages[0].read_bytes()
        package = json.loads(data)
        missing = keeps(package, json.loads(reference_bytes), reference['keeps'])
        if missing:
            raise ValueError('The base (%s) no longer keeps all of %s in %s, as base.json says it must.'
                             % (name, reference['file'], ', '.join(missing)))
        if out:
            # the name the site's catalog serves it under: one file per variant, told apart by its identity
            (out / ('modwerk-base-%s%s-%s.elemod' % (machine, '-dev' if dev else '', sha(data)[:8]))).write_bytes(data)
        built.append((name, sha(data), packages[0].name, package))
    _, identity, file, package = built[0]
    binding = {
        'schema': 1,
        'identity': identity,
        'package': file,
        'sections': sizes(package),
        'sites': len(package['sites']),
        'built': {'kit': kit, 'toolchain': config['toolchain'], 'stock': stock_sha(machine, config['os'])},
    }
    if 'variants' in config:
        binding['variants'] = {name: identity for name, identity, _, _ in built}
    return binding, sizes(json.loads(reference_bytes)), [(name, identity, sizes(package), len(package['sites']))
                                                          for name, identity, _, package in built]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('machine', help='the machine id, as in sdk/machines/')
    parser.add_argument('--stock', type=Path, required=True, help='your original stock OS file')
    parser.add_argument('--upstream', type=Path, default=DEFAULT_UPSTREAM, help='the kit-pinned Elekloader checkout')
    parser.add_argument('--out', type=Path, help='a new folder outside Git to keep each built .elemod in')
    parser.add_argument('--write', action='store_true', help='record the built identity in base-binding.json')
    parser.add_argument('--dev', action='store_true', help="build development bases (base.json's dev on top): never "
                        'recorded or released')
    args = parser.parse_args()
    if args.dev and args.write:
        parser.error('--dev builds development bases, which are never recorded: leave out --write.')
    binding_path = APP / 'sdk/machines' / args.machine / 'base-binding.json'
    if args.out and (args.out.exists() or inside_git(args.out)):
        parser.error('--out must be a new folder outside every Git work tree: %s' % args.out)
    try:
        binding, reference, layouts = build(args.machine, args.stock.expanduser().resolve(), args.upstream.expanduser().resolve(),
                                   args.out.expanduser().resolve() if args.out else None, args.dev)
    except (ValueError, OSError, KeyError) as error:
        parser.error(str(error))
    for name, identity, sections, sites in layouts:
        print('%s base %s (%s%s): %s' % (args.machine, binding['package'], name, ', dev' if args.dev else '', identity))
        print('  sections %s, %d sites (the release it started from: %s)' % (sections, sites, reference))
    if args.dev:
        print('Development bases: for test images only, never released; not checked against %s.'
              % binding_path.relative_to(APP))
        return
    if args.write:
        binding_path.write_text(json.dumps(binding, indent=2) + '\n')
        print('Recorded in ' + str(binding_path.relative_to(APP)))
        return
    recorded = json.loads(binding_path.read_text()) if binding_path.exists() else {}
    if recorded.get('identity') != binding['identity'] or recorded.get('variants') != binding.get('variants'):
        sys.exit('This build differs from %s (%s). Rebuild with the reviewed toolchain, or record a deliberate '
                 'change with --write.' % (binding_path.relative_to(APP), recorded.get('identity', 'none')))
    print('Matches ' + str(binding_path.relative_to(APP)))


if __name__ == '__main__':
    main()
