#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Compile/link the grain-only FRACT draft without firmware or a paired base.

The temporary identity and imports are placeholders for linking only. No
installable package is produced; this does not validate boot, USB or audio.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile

import build_private as private


def check(args):
    if args.cpu_profile_detail and not args.cpu_profile:
        raise ValueError('CPU profile detail requires --cpu-profile')
    base = private.ROOT
    pack = private.load('fract_source_link', base / 'sdk/runtime/loader/build.py')
    run = lambda argv: subprocess.run(list(map(str, argv)), check=True, capture_output=True)
    with tempfile.TemporaryDirectory(prefix='fract-source-check-') as temp:
        work = Path(temp)
        # Compile the same binding unit, without claiming a real base identity.
        (work / 'base_identity.h').write_text(
            '#define OG_BASE_DIGEST_ADDRESS 0x40000400u\n'
            'static const uint8_t og_expected_base_digest[32] = {0};\n')
        kept, sources, _, runtime, imports = private.compile_source(args, base, work)
        # Resolve only the approved base imports at synthetic addresses. Linking
        # twice then checks relocatability independently of a stock OS image.
        stubs = work / 'imports.s'
        stubs.write_text('\n'.join('.global %s\n.set %s,0x%x' % (name, name, 0x40001000 + 4 * i)
                                  for i, name in enumerate(sorted(imports))) + '\n')
        obj = work / 'imports.o'
        run([args.cross + 'as', '-mcpu=54455', stubs, '-o', obj])
        image, names, bss, relocs = pack.link_units([kept, obj], args.cross, 0, work, anywhere=True)
        forbidden = {name for name in names if name.startswith(('og_space_', 'og_source_'))}
        forbidden.update(set(names) & {'og_render', 'og_release_check', 'og_fetch'})
        if forbidden:
            raise ValueError('Obsolete runtime retained: ' + ', '.join(sorted(forbidden)))
        hooks = pack.subscribe([], pack.entries(runtime), names)
        print(json.dumps(dict(
            result='PASS_SOURCE_ONLY_NOT_DEVICE_QUALIFICATION', cUnits=len(sources),
            assemblyUnits=1, imageBytes=len(image), bssBytes=bss,
            relocations=len(relocs), eventWords=len(hooks), syntheticImageSha256=hashlib.sha256(image).hexdigest(),
            mockedBaseImports=sorted(imports), cpuProfile=args.cpu_profile,
            cpuProfileDetail=args.cpu_profile_detail), indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cross', default='m68k-elf-')
    parser.add_argument('--cpu-profile', action='store_true')
    parser.add_argument('--cpu-profile-detail', action='store_true')
    try:
        check(parser.parse_args())
    except subprocess.CalledProcessError as error:
        sys.exit(error.stderr.decode() if error.stderr else str(error))
    except ValueError as error:
        sys.exit(str(error))
