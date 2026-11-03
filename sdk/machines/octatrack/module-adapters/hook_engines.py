#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Engines a base-bound package carries for the base's stock-DSP hook sites (ABI 10, docs/OCTATRACK_PACKAGE_DSP_HOOKS.md).

A packaged feature (dsp-sites.json "packaged": Analog BD) keeps nothing of its DSP in the base but a stub at its site,
one base word and the region its claims name. Its engine and initial words are built here, from the module's own
sources, into its package (sdk/runtime/loader/abi9.py `engine`), so a DSP change ships as a package and the base's
trust row, which pins only what is not DSP, stays as it is. Nothing here is a base input.

  analog_package(data, sdk, work, assemble)   # the Analog BD controller package (build.py's) with its engine

Authored module code only, assembled with the native toolchain (dsp_packages.assemble); no stock words.
"""
from contextlib import contextmanager
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import resident_dsp  # noqa: E402  (the engine-unit tools: two-origin relocations, long-form jumps)

SITES = HERE.parent / 'dsp-sites.json'
BRA_LONG = 0x0d10c0  # DSP56300 BRA with a long displacement in the next word: an exit's branch


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


abi9 = _load('hook_engines_abi9', HERE.parents[2] / 'runtime/loader/abi9.py')


@contextmanager
def analog_sources(sdk):
    """Load exact authored generators without writing their SDK/out directory."""
    paths = {'dsp909': 'modules/analog-bassdrum/dsp909.py',
             'dsp808': 'modules/analog-bassdrum/dsp808.py',
             'ab_records': 'tools/build/ab_records.py',
             'ab_image': 'tools/build/ab_image.py'}
    old_path, previous = list(sys.path), {name: sys.modules.get(name) for name in paths}
    loaded = {}
    try:
        for name, path in paths.items():
            spec = importlib.util.spec_from_file_location(name, Path(sdk) / path)
            module = importlib.util.module_from_spec(spec)
            sys.modules[name] = module
            spec.loader.exec_module(module)
            loaded[name] = module
        yield loaded
    finally:
        sys.path[:] = old_path
        for name, module in previous.items():
            if module is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = module


def site(feature):
    """The catalogue's one site of a packaged feature, and that feature's regions (dsp-sites.json)."""
    reg = json.loads(SITES.read_text())
    if not next(f for f in reg['features'] if f['bit'] == feature).get('packaged'):
        raise ValueError('Feature %d is not packaged' % feature)
    sites = [s for s in reg['sites'] if s['feature'] == feature]
    if len(sites) != 1:
        raise ValueError('A packaged feature enters at one site')
    return sites[0], [r for r in reg['regions'] if r['feature'] == feature]


def analog_text(sdk, cont):
    """Analog BD's authored engine text, leaving the stock source through stock P `cont`, and its initial X words."""
    with analog_sources(sdk) as loaded:
        ab, nine, eight = (loaded[name] for name in ('ab_image', 'dsp909', 'dsp808'))
        layout, voices = ab.layout()
        glue = ab.GLUE.read_text().replace('@VBASE@', '$%x' % voices).replace('@V808@', '$%x' % ab.VOICES808)
        glue = glue.replace('@CONT@', '$%x' % cont)
        text = glue + '\n' + nine.source(layout, shared_desk=True, include_desk=False) + '\n' + \
            eight.source(eight.layout(ab.TABLES808), layout, shared_desk=True) + '\n' + nine.shared_desk_source(layout)
        return text, ab.TABLES, ab.x_image(layout, voices)


def _unit(text, work, assemble):
    """`text` as a relocatable unit at base 0 (resident_dsp.engine_unit's method): words, relocations, labels."""
    a, b = resident_dsp.ENGINE_ORIGINS
    (first, labels), (other, moved) = (resident_dsp.assemble_authored(text, org, work, assemble) for org in (a, b))
    if len(first) != len(other) or {k: v - a for k, v in labels.items()} != {k: v - b for k, v in moved.items()}:
        raise ValueError('The engine assembles differently at two origins')
    words, relocations = [], []
    for i, (x, y) in enumerate(zip(first, other)):
        change = (y - x) & 0xffffff
        if change == 0:
            words.append(x)
        elif change == b - a:
            relocations.append(i); words.append((x - a) & 0xffffff)
        elif change == (a - b) & 0xffffff:
            relocations.append(i | 0x8000); words.append((x + a) & 0xffffff)
        else:
            raise ValueError('An engine word moves in a way the relocator cannot follow: %d' % i)
    return words, relocations, {k: v - a for k, v in labels.items()}


def placed(unit, base, target):
    """The unit's words at absolute P `base`, its exit pointed at stock P `target` (resident_engines.c's relocation)."""
    out = resident_dsp.relocate(unit, base)
    if unit['exit']:
        out[unit['exit']] = (target - (base + unit['exit'] - 1)) & 0xffffff
    return out


def analog_engine(sdk, work, assemble):
    """Analog BD's engine, the same words on both cores: its one jump to the stock continuation is its site's exit,
    whose displacement the base writes per core. Proven: each core's own assembly, at the proof bases, equals these
    words placed there with that core's exit."""
    entry, regions = site(resident_dsp.ANALOG_BD)
    exits = {tag: int(entry['exit'][tag], 16) for tag in ('A', 'B')}
    units = {}
    for tag, cont in exits.items():
        text, tables, init = analog_text(sdk, cont)
        words, relocations, labels = _unit(text, work, assemble)
        if labels.get(entry['label']) != 0:
            raise ValueError('Analog BD\'s engine must begin with its entry ' + entry['label'])
        # Its exit: the one relocation naming a fixed address, the continuation, after a long branch.
        fixed = [r & 0x7fff for r in relocations if r & 0x8000 and (words[r & 0x7fff] + (r & 0x7fff) - 1) & 0xffffff == cont]
        if len(fixed) != 1 or words[fixed[0] - 1] != BRA_LONG:
            raise ValueError('Analog BD\'s engine must leave its site through one long branch to ' + hex(cont))
        exit = fixed[0]
        relocations = [r for r in relocations if r & 0x7fff != exit]
        words[exit] = 0
        units[tag] = dict(words=words, relocations=relocations, exit=exit, labels=labels, text=text)
    if (units['A']['words'], units['A']['relocations'], units['A']['exit']) != \
            (units['B']['words'], units['B']['relocations'], units['B']['exit']):
        raise ValueError('Analog BD\'s engine differs between the cores beyond its exit')
    unit = {k: units['A'][k] for k in ('words', 'relocations', 'exit')}
    for tag, cont in exits.items():
        for base in resident_dsp.ENGINE_PROOFS:
            fresh, _ = resident_dsp.assemble_authored(units[tag]['text'], base, work, assemble)
            if fresh != placed(unit, base, cont):
                raise ValueError('Analog BD\'s placed engine differs from a fresh assembly at $%x on payload %s' % (base, tag))
    region = next(r for r in regions if r['space'] == 'x')
    if len(regions) != 1 or (tables, len(init)) != (int(region['start'], 16), int(region['words'], 16)):
        raise ValueError('Analog BD\'s initial words are not exactly its region (dsp-sites.json)')
    unit.update(init=init, address=tables, site=entry['index'],
                sha256=hashlib.sha256(b''.join(w.to_bytes(3, 'big') for w in unit['words'])).hexdigest())
    return unit


def analog_package(data, sdk, work, assemble):
    """The Analog BD controller package (build.py's, no DSP) as ABI 10, carrying its engine and initial words."""
    unit = analog_engine(sdk, work, assemble)
    return abi9.engine(data, unit['words'], unit['relocations'], unit['site'], 3, unit['exit'],
                       [('x', abi9.BOTH_CORES, unit['address'], unit['init'])])


PACKAGES = {'analog-bassdrum': analog_package}  # base-bound modules whose packages carry an engine
