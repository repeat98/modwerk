#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Compile only authored loader sources; no stock, image builder or USB access."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
SOURCES = ('upload.c', 'sha256.c', 'wire.c')
INPUTS = (*SOURCES, 'upload.h', 'wire.h', 'compile.py')
FLAGS = ('-mcpu=54455', '-Os', '-std=c99', '-ffreestanding', '-fno-builtin',
         '-fno-tree-loop-distribute-patterns', '-fno-common',
         '-fno-asynchronous-unwind-tables', '-fno-unwind-tables',
         '-fstack-usage', '-Wall', '-Wextra', '-Werror', '-pedantic')


def run(args):
    return subprocess.run([str(x) for x in args], check=True, capture_output=True,
                          text=True).stdout


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--cross', default='m68k-elf-')
    args = parser.parse_args()
    output = args.output.resolve()
    if output.exists():
        parser.error('Choose a new output directory.')
    # Source-only objects are allowed in CI, but keep every local build outside Git.
    try:
        run(['git', '-C', output.parent, 'rev-parse', '--show-toplevel'])
    except subprocess.CalledProcessError:
        pass
    else:
        parser.error('Build output must be outside Git checkouts.')
    output.mkdir()
    objects = []
    for name in SOURCES:
        obj = output / (Path(name).stem + '.o')
        run([args.cross + 'gcc', *FLAGS, '-I', HERE, '-c', HERE / name, '-o', obj])
        objects.append(obj)
    linked = output / 'controller.o'
    run([args.cross + 'ld', '-r', '-o', linked, *objects])
    unresolved = run([args.cross + 'nm', '-u', linked]).strip()
    if unresolved:
        raise RuntimeError('Freestanding loader has undeclared imports: ' + unresolved)
    inventory = {name: hashlib.sha256((HERE / name).read_bytes()).hexdigest() for name in INPUTS}
    report = dict(schema=1, kind='modwerk-upload-source', stockRead=False, deviceAccess=False,
                  cpu='54455', sources=inventory, compiler=run([args.cross+'gcc', '--version']).splitlines()[0],
                  flags=FLAGS, undefinedSymbols=[], size=run([args.cross+'size', linked]).strip(),
                  objectSha256=hashlib.sha256(linked.read_bytes()).hexdigest(),
                  stackUsage={p.name: p.read_text() for p in sorted(output.glob('*.su'))},
                  hardware='not tested', transport='not connected', productionReady=False)
    (output / 'source-build.json').write_text(json.dumps(report, indent=2) + '\n')
    print(report['size'])
    print('Authored ColdFire objects linked with no undefined imports. Not a firmware image.')


if __name__ == '__main__':
    main()
