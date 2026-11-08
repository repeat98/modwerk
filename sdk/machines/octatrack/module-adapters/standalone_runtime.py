# SPDX-License-Identifier: GPL-3.0-or-later
"""Reviewed standalone/hybrid reconstruction for Play Modes, Tape Echo and Euclid.

Every coincident span names authored source and exact compiled/source hashes.
The existing StockCopy implementation and final stock scans stay authoritative.
Only separately reviewed Play Modes, Tape Echo and Euclid declarations are
accepted here; no arbitrary code fill or caller-provided module is inferred.
Private preparation (build.py --private-port) compares each span with the
original OS. The published packages (build.py --standalone, owner decision
14 Oct 2026) apply the same reviewed spans without it; the base checks every
copy's SHA-256 against its own running stock before it installs a package.
"""
import hashlib
import json
from pathlib import Path
import sys

import stock_recipe

sys.path.append(str(Path(__file__).resolve().parents[3]))  # sdk/, for firmware_codec
import firmware_codec  # noqa: E402

PORTS = {
    'playmodes': dict(slots=None),
    'tapeecho': dict(slots='fx2', cycles=4, cyclesKind='modeled', state=1, buffer=0, pinned=True),
    'euclid': dict(slots='both', cycles=143, cyclesKind='executed', state=64, buffer=0, pinned=True),
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def sources(root, upstream, module):
    """Concrete authored/native page inputs; excludes the recipe itself.

    Compiled image identity independently pins the assembler/linker result. The
    deployment's source/approval stamp is validated by the normal page builder,
    rather than becoming a recursive input to this reconstruction declaration.
    """
    root, upstream = Path(root).resolve(), Path(upstream).resolve()
    if module not in PORTS:
        raise ValueError('No reviewed standalone runtime declaration for ' + module)
    paths = list((root / ('sdk/octabam/modules/' + module)).rglob('*'))
    paths += list((root / 'sdk/octabam/tools/remix').rglob('*.py'))
    paths += [root / path for path in (
        'sdk/runtime/loader/build.py',
        'sdk/machines/octatrack/module-adapters/standalone_runtime.py',
        'sdk/machines/octatrack/module-adapters/stock_recipe.py',
    )]
    if module != 'playmodes':
        paths += [root / path for path in (
            'scripts/octatrack-module-page.mjs', 'src/engine/menu-formatters.ts',
            'src/engine/rom-package.ts', 'src/engine/coldfire-elf.ts', 'src/engine/module-build.ts',
            'src/catalog/modules.ts', 'src/engine/assets/dsp-packages.json',
            'src/engine/assets/descriptor-recipes.json', 'src/engine/assets/menu-recipes.json',
            'src/engine/assets/rom-packages.json',
        )]
    result = {path.relative_to(root).as_posix(): digest(path.read_bytes()) for path in paths
              if path.is_file() and path.suffix in ('.py', '.s', '.S', '.c', '.h', '.asm', '.inc', '.json', '.ts', '.mjs')}
    result.update(firmware_codec.inputs(upstream))  # the checkout's files it runs, and the codec it runs them with
    return result


def apply(image, relocations, recipe, inputs, root, stock_at):
    """Validate authored provenance and, given `stock_at`, the original-stock spans before zeroing.

    Source line ranges describe a developer's reviewed native symbol/emitter;
    they do not exempt any literal from either strict package scanner. Without
    `stock_at` every span must still equal its reviewed hash, which was taken
    from the original OS at review.
    """
    if recipe.get('schema') != 1 or recipe.get('imageSha256') != digest(image) or recipe.get('sources') != inputs:
        raise ValueError('The standalone recipe does not name the exact source/image inputs.')
    if recipe.get('fills'):
        raise ValueError('Standalone instruction recipes have no reviewed constant fills.')
    root = Path(root).resolve()
    for item in recipe.get('copies', []):
        at, length, address = item.get('offset'), item.get('length'), item.get('address')
        if (any(type(value) is not int for value in (at, length, address)) or at < 0 or not 0 < length <= 32
                or at + length > len(image) or address < 0 or address + length > 0x100000000):
            raise ValueError('A standalone copy needs bounded image and stock spans.')
        authored = item.get('authored', {})
        source, lines = authored.get('source'), authored.get('lines')
        if (not isinstance(source, str) or source not in inputs or source.startswith('upstream/')
                or not isinstance(lines, list) or len(lines) != 2 or any(type(value) is not int for value in lines)
                or not 1 <= lines[0] <= lines[1] or not isinstance(authored.get('symbol'), str) or not authored['symbol']
                or not isinstance(item.get('purpose'), str) or not item['purpose']
                or authored.get('method') not in ('native-unit', 'native-formatter', 'authored-emitter')):
            raise ValueError('A standalone copy needs its reviewed authored source, lines, symbol and method.')
        path = (root / source).resolve()
        if (not path.is_relative_to(root) or digest(path.read_bytes()) != inputs[source]
                or lines[1] > len(path.read_text().splitlines())):
            raise ValueError('Standalone authored provenance changed.')
        span = image[at:at + length]
        if digest(span) != item.get('sha256') or (stock_at is not None and stock_at(address, length) != span):
            raise ValueError('Standalone compiled and original-stock spans differ.')
    # Reuse the unchanged overlap, relocation and placeholder implementation.
    output, copies, fills = stock_recipe.apply(image, relocations, recipe, inputs)
    if fills:
        raise ValueError('An instruction recipe unexpectedly produced a fill.')
    return output, copies


def reviewed(root, module):
    if module not in PORTS:
        raise ValueError('No reviewed standalone runtime declaration for ' + module)
    document = json.loads((Path(root) / 'sdk/machines/octatrack/module-adapters/standalone-recipes.json').read_text())
    if document.get('schema') != 1 or set(document.get('ports', {})) != set(PORTS):
        raise ValueError('The private standalone declaration set changed.')
    return document['ports'][module]
