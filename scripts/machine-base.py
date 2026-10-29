#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Build a machine's Modwerk base from its source with Elekloader's SDK and check it against its binding.

    npm run machine:base -- analog-rytm-mkii --stock /private/Analog-Rytm_MKII_OS1.74.syx
    npm run machine:base -- analog-rytm-mkii --stock ... --out /private/NEW-DIR   # keep the .elemod
    npm run machine:base -- analog-rytm-mkii --stock ... --write                  # record a new identity

sdk/machines/<id>/elekloader/base.json names the core folder beside it (mod.json and its sources), the SDK
headers, the OS and the reviewed toolchain (sdk/build/Dockerfile's GCC and binutils for m68k-elf). The SDK is the
kit-pinned Elekloader checkout (npm run upstream:tools), run with Modwerk's codec (firmware_codec.use_elekloader), so
this build and the browser's kit cannot drift apart.
The base is built in a temporary tree outside Git and compared with the upstream release it started from: the
fields base.json lists under reference.same must match. It is identified by the SHA-256 of its package, recorded
in sdk/machines/<id>/base-binding.json; without --write a different identity fails. The stock OS is read where it
lies and never copied into the repository.
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


def stage(machine, config, root):
    """The core folder and its sibling sources as mod.json expects them, with the SDK headers beside mod.json
    (the SDK compiles with -I on the mod's own folder first)."""
    source = APP / 'sdk/machines' / machine / 'elekloader'
    mods = root / 'mods'
    for item in source.iterdir():
        if item.is_dir():
            shutil.copytree(item, mods / item.name)
    core = mods / config['core']
    for item in (APP / config['include']).iterdir():
        shutil.copytree(item, core / item.name)
    return core


def compare(built, reference, same):
    """The reference fields that differ between the built package and the release it started from."""
    return [key for key in same if json.dumps(built.get(key), sort_keys=True) != json.dumps(reference.get(key), sort_keys=True)]


def sizes(package):
    return {name: section.get('len', section.get('size', 0)) for name, section in package['sections'].items()}


def build(machine, stock, upstream, out):
    config = json.loads((APP / 'sdk/machines' / machine / 'elekloader/base.json').read_text())
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
    os.environ['ELEKLOADER_CROSS'] = config['toolchain']['cross']
    with tempfile.TemporaryDirectory(prefix='modwerk-base-') as work:
        root = Path(work)
        core = stage(machine, config, root)
        try:
            sdk.build(str(core), str(stock), str(root / 'out'))
        except sdk.BuildError as error:
            raise ValueError('The SDK did not build the base: %s' % error)
        packages = sorted((root / 'out').glob('*.elemod'))
        if len(packages) != 1:
            raise ValueError('The SDK wrote %d packages, not one.' % len(packages))
        data = packages[0].read_bytes()
        if out:
            out.mkdir(parents=True)
            shutil.copyfile(packages[0], out / packages[0].name)
    package = json.loads(data)
    differ = compare(package, json.loads(reference_bytes), reference['same'])
    if differ:
        raise ValueError('The base differs from %s in %s, which base.json says must match.'
                         % (reference['file'], ', '.join(differ)))
    return {
        'schema': 1,
        'identity': sha(data),
        'package': packages[0].name,
        'sections': sizes(package),
        'sites': len(package['sites']),
        'built': {'kit': kit, 'toolchain': config['toolchain'], 'stock': stock_sha(machine, config['os'])},
    }, sizes(json.loads(reference_bytes))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('machine', help='the machine id, as in sdk/machines/')
    parser.add_argument('--stock', type=Path, required=True, help='your original stock OS file')
    parser.add_argument('--upstream', type=Path, default=DEFAULT_UPSTREAM, help='the kit-pinned Elekloader checkout')
    parser.add_argument('--out', type=Path, help='a new folder outside Git to keep the built .elemod in')
    parser.add_argument('--write', action='store_true', help='record the built identity in base-binding.json')
    args = parser.parse_args()
    binding_path = APP / 'sdk/machines' / args.machine / 'base-binding.json'
    if args.out and (args.out.exists() or inside_git(args.out)):
        parser.error('--out must be a new folder outside every Git work tree: %s' % args.out)
    try:
        binding, reference = build(args.machine, args.stock.expanduser().resolve(), args.upstream.expanduser().resolve(),
                                   args.out.expanduser().resolve() if args.out else None)
    except (ValueError, OSError, KeyError) as error:
        parser.error(str(error))
    print('%s base %s: %s' % (args.machine, binding['package'], binding['identity']))
    print('  sections %s, %d sites (the release it started from: %s)'
          % (binding['sections'], binding['sites'], reference))
    if args.write:
        binding_path.write_text(json.dumps(binding, indent=2) + '\n')
        print('Recorded in ' + str(binding_path.relative_to(APP)))
        return
    recorded = json.loads(binding_path.read_text()) if binding_path.exists() else {}
    if recorded.get('identity') != binding['identity']:
        sys.exit('This build differs from %s (%s). Rebuild with the reviewed toolchain, or record a deliberate '
                 'change with --write.' % (binding_path.relative_to(APP), recorded.get('identity', 'none')))
    print('Matches ' + str(binding_path.relative_to(APP)))


if __name__ == '__main__':
    main()
