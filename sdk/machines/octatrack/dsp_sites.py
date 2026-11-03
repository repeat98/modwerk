#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""The base's stock-DSP hook sites and DSP data ledger (dsp-sites.json).

  python3 -B sdk/machines/octatrack/dsp_sites.py --write   # regenerate resident-runtime/dsp_ledger.h
  python3 -B sdk/machines/octatrack/dsp_sites.py --check   # the registry, its manifests and the generated header agree

The registry is the single list of what the base owns in the DSPs: the stock P sites it hooks (append only: a site's
index is an ABI) and the X/Y words each base feature owns while it is held. --check proves each site against the
manifest that declares its hook (address on both payloads and the stock guard's SHA-256), every feature's regions
against resident_dsp.resource_ranges, and the header against this file. The header's reset totals and first-range
splits are what the board, the transport and the receiver reset (controller_board.c, resident_driver.py). Addresses, lengths and
hashes only: no stock bytes. docs/OCTATRACK_PACKAGE_DSP_HOOKS.md has the design.
"""
import argparse
import json
import os
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
REGISTRY = HERE / 'dsp-sites.json'
SDK = HERE.parents[1] / 'octabam'
HEADER = HERE / 'module-adapters/resident-runtime/dsp_ledger.h'
HALF_BASE = {'A': 0x30000, 'B': 0x38000}
CORE = {'A': 0, 'B': 1}  # payload A runs tracks 5-8 on core 0, payload B tracks 1-4 on core 1


def _int(value, what):
    if not isinstance(value, str) or not value.startswith('0x'):
        raise ValueError('dsp-sites.json: ' + what + ' must be a 0x hex string')
    return int(value, 16)


def load(path=REGISTRY):
    reg = json.loads(Path(path).read_text())
    if reg.get('schema') != 1:
        raise ValueError('dsp-sites.json: unknown schema')
    bits = [f['bit'] for f in reg['features']]
    if bits != [1 << i for i in range(len(bits))] or len(set(f['name'] for f in reg['features'])) != len(bits):
        raise ValueError('dsp-sites.json: features are the bits 1, 2, 4, ... in order, with distinct names')
    for f in reg['features']:
        if not f['cores'] or set(f['cores']) - {'A', 'B'} or any(i not in bits or i == f['bit'] for i in f['implies']) or \
                ('executed' in f and not (isinstance(f['executed'], int) and 0 < f['executed'] < 65536)) or \
                ('hardware' in f and not (isinstance(f['hardware'], int) and 0 < f['hardware'] < 65536 and
                                          isinstance(f.get('evidence'), str))) or \
                f.get('packaged', False) not in (True, False):
            raise ValueError('dsp-sites.json: feature ' + f['name'] + ' has bad cores or implies')
    for n, s in enumerate(reg['sites']):
        if s['index'] != n or s['feature'] not in bits or s['kind'] != 'exclusive' or s['words'] != 2:
            raise ValueError('dsp-sites.json: site %d is out of order, has an unknown feature, or is not one exclusive '
                             'two-word instruction' % n)
        if not {'A', 'B'} & set(s) or len(s['guardSha256']) != 64:
            raise ValueError('dsp-sites.json: site %s names no payload or no guard' % s['name'])
        for tag in ('A', 'B'):
            if tag in s and not 0 <= _int(s[tag], s['name']) < 0x2000:
                raise ValueError('dsp-sites.json: site %s is outside stock P' % s['name'])
        if 'exit' in s and (set(s['exit']) != {'A', 'B'} & set(s) or
                            not all(0 <= _int(v, s['name']) < 0x2000 for v in s['exit'].values())):
            raise ValueError('dsp-sites.json: site %s has an exit outside stock P or for a payload it lacks' % s['name'])
    for r in reg['regions']:
        start, words = _int(r['start'], 'start'), _int(r['words'], 'words')
        if r['feature'] not in bits or r['space'] not in ('x', 'y') or not words:
            raise ValueError('dsp-sites.json: a region has an unknown feature or space, or no words')
        if bool(r.get('shared')) == ('cores' in r) or ('cores' in r and (not r['cores'] or set(r['cores']) - {'A', 'B'})):
            raise ValueError('dsp-sites.json: a region is shared (both halves of the window) or names its cores, not both')
        if r.get('shared') and not start + words <= 0x8000:
            raise ValueError('dsp-sites.json: a shared region lies outside its half of the window')
        if not r.get('shared') and start + words > 0x30000:
            raise ValueError('dsp-sites.json: a core region reaches the shared window')
    return reg


def implied(reg, features):
    """Every feature `features` hold, with what they imply (a held Sidechain holds the key bus)."""
    out = features
    for f in reg['features']:
        if features & f['bit']:
            for bit in f['implies']:
                out |= bit
    return out


def spans(reg):
    """Each region as concrete spans: (feature, core, space, address, words). A shared region is one span per core's
    half of the window, at its absolute address; both cores see it."""
    out = []
    for r in reg['regions']:
        start, words = _int(r['start'], 'start'), _int(r['words'], 'words')
        cores = next(f['cores'] for f in reg['features'] if f['bit'] == r['feature'])
        for tag in ('A', 'B'):
            if tag not in (cores if r.get('shared') else r['cores']):
                continue
            out.append((r['feature'], CORE[tag], r['space'], HALF_BASE[tag] + start if r.get('shared') else start, words))
    return out


def reset_words(reg):
    """({feature: words its reset writes on a core}, {feature: its first region's words if it has more than one, else
    0}), from its spans in order; the same on every core it runs on."""
    totals, firsts = {}, {}
    for f in reg['features']:
        per = {}
        for feature, core, _, _, words in spans(reg):
            if feature == f['bit']:
                per.setdefault(core, []).append(words)
        if len({tuple(v) for v in per.values()}) != 1:
            raise ValueError('dsp-sites.json: feature %s owns different regions on its cores' % f['name'])
        runs = next(iter(per.values()))
        totals[f['bit']], firsts[f['bit']] = sum(runs), runs[0] if len(runs) > 1 else 0
    return totals, firsts


def header(reg):
    names = {f['bit']: f['name'].upper().replace('-', '_') for f in reg['features']}
    lines = ['/* SPDX-License-Identifier: GPL-3.0-or-later */',
             '/* Generated by sdk/machines/octatrack/dsp_sites.py from dsp-sites.json: do not edit. The base\'s DSP data',
             ' * ledger: the X/Y words each base feature owns while it is held (docs/OCTATRACK_PACKAGE_DSP_HOOKS.md). */',
             '#ifndef MODWERK_DSP_LEDGER_H', '#define MODWERK_DSP_LEDGER_H', '#include <stdint.h>', '']
    for bit, name in names.items():
        lines.append('#define MW_DSP_%s %uu' % (name, bit))
    lines.append('#define MW_DSP_FEATURES %uu  /* every feature bit */' % sum(names))
    lines.append('/* Features whose engine and initial words come from their controller\'s package (ABI 10), never from the base. */')
    lines.append('#define MW_DSP_PACKAGED %uu' % sum(f['bit'] for f in reg['features'] if f.get('packaged')))
    for f in reg['features']:
        if 'executed' in f:
            lines.append('#define MW_DSP_%s_EXECUTED %uu  /* its tap: executed instructions a sample for a core\'s four tracks, '
                         'counted statically%s */' % (names[f['bit']], f['executed'],
                                                     '' if 'hardware' in f else '; charged at 7/4 until timed on a unit'))
        if 'hardware' in f:
            lines.append('#define MW_DSP_%s_HARDWARE %uu  /* its tap: chip cycles a sample for a core\'s four tracks, timed on '
                         'a unit (%s); its charge */' % (names[f['bit']], f['hardware'], f['evidence']))
    implies = ' | '.join('((f) & %uu ? %uu : 0u)' % (f['bit'], sum(f['implies'])) for f in reg['features'] if f['implies'])
    lines.append('/* What a held feature holds too. */')
    lines.append('#define MW_DSP_IMPLIED(f) ((f) | %s)' % (implies or '0u'))
    lines.append('/* Cores a feature runs on: bit 0 core 0 (payload A, tracks 5-8), bit 1 core 1 (payload B, tracks 1-4). */')
    cores = ' : '.join('(f) == %uu ? %uu' % (f['bit'], sum(1 << CORE[t] for t in f['cores'])) for f in reg['features'])
    lines.append('#define MW_DSP_CORES(f) (%s : 0u)' % cores)
    lines.append('/* A feature\'s index (its bit\'s position); MW_DSP_COUNT for anything else. */')
    lines.append('#define MW_DSP_COUNT %uu' % len(names))
    lines.append('#define MW_DSP_INDEX(f) (%s : MW_DSP_COUNT)' % ' : '.join('(f) == %uu ? %uu' % (bit, bit.bit_length() - 1) for bit in names))
    totals, firsts = reset_words(reg)
    lines.append('/* Words a feature\'s reset writes on each core it runs on (its regions there, in order), and its first region\'s')
    lines.append(' * when it has more than one: a reset chunk never crosses it (one owned range per chunk). */')
    lines.append('#define MW_DSP_RESET_WORDS(f) (%s : 0u)' % ' : '.join('(f) == %uu ? %uu' % (bit, totals[bit]) for bit in names))
    lines.append('#define MW_DSP_RESET_SPLIT(f) (%s : 0u)' % (' : '.join('(f) == %uu ? %uu' % (bit, firsts[bit]) for bit in names if firsts[bit]) or '0u ? 0u'))
    lines += ['', 'struct mw_dsp_region { uint8_t feature, core, space; /* space: 1 x, 2 y */ uint8_t pad; uint32_t address, words; };',
              'static const struct mw_dsp_region mw_dsp_regions[] = {']
    for feature, core, space, address, words in spans(reg):
        lines.append('    {%uu, %uu, %uu, 0, 0x%xu, 0x%xu}, /* %s */' % (feature, core, 1 if space == 'x' else 2, address, words,
                                                                   names[feature].lower()))
    lines += ['};', '#define MW_DSP_REGIONS (sizeof mw_dsp_regions / sizeof mw_dsp_regions[0])', '',
              '/* The sites, by index (a package\'s hook entry names one): its feature, and per core its stock P continuation',
              ' * after the hooked code when it has an exit (0: none, or no such payload). */',
              'struct mw_dsp_site { uint8_t feature, pad; uint16_t exit[2]; };',
              'static const struct mw_dsp_site mw_dsp_sites[] = {']
    for s in reg['sites']:
        exits = [_int(s['exit'][tag], s['name']) if tag in s.get('exit', {}) else 0 for tag in ('A', 'B')]
        lines.append('    {%uu, 0, {0x%xu, 0x%xu}}, /* %d %s */' % (s['feature'], exits[0], exits[1], s['index'], s['name']))
    lines += ['};', '#define MW_DSP_SITES (sizeof mw_dsp_sites / sizeof mw_dsp_sites[0])', '', '#endif', '']
    return '\n'.join(lines)


def _manifest_hooks():
    sys.path.insert(0, str(SDK / 'tools'))
    from remix import registry
    old = Path.cwd()
    try:
        os.chdir(SDK)
        return {name: {h.label: h for h in registry._load_one(SDK / 'modules' / name / 'manifest.py').dsp.hooks}
                for name in ('sidechain-compressor', 'output-matrix')}
    finally:
        os.chdir(old)


def _analog_seams():
    """Analog BD's seam and continuation per payload, from the layout its card build and package share (ab_image.PAY)."""
    sys.path.insert(0, str(SDK / 'tools/build'))
    import ab_image
    return {tag: (c['seam'], c['cont']) for tag, c in ab_image.PAY.items()}


def check(reg):
    """The registry against its sources. Returns a list of problems."""
    problems = []
    hooks = _manifest_hooks()
    for s in reg['sites']:
        if s['module'] == 'analog-bassdrum':
            # Its manifest declares no DspHook: the seam is its glue's (ab_glue.asm), shared by the card build.
            seams = _analog_seams()
            if any((_int(s[tag], s['name']), _int(s['exit'][tag], s['name'])) != seams[tag] for tag in ('A', 'B')):
                problems.append('%s: its address or exit differs from ab_image.PAY' % s['name'])
            continue
        hook = hooks.get(s['module'], {}).get(s['label'])
        if hook is None:
            problems.append('%s: %s declares no hook %s' % (s['name'], s['module'], s['label']))
            continue
        for tag in ('A', 'B'):
            want = _int(s[tag], s['name']) if tag in s else None
            have = hook.site_on(tag) if not isinstance(hook.site, int) and tag in hook.site else \
                (hook.site if isinstance(hook.site, int) else None)
            if want != have:
                problems.append('%s: payload %s at %s, the manifest says %s' % (s['name'], tag, want, have))
        if getattr(hook.stock, 'sha256', None) != s['guardSha256'] or getattr(hook.stock, 'count', 2) != s['words']:
            problems.append('%s: the guard differs from %s\'s manifest' % (s['name'], s['module']))
    sys.path.insert(0, str(HERE / 'module-adapters'))
    import resident_dsp
    for tag in ('A', 'B'):
        expected = sorted((r['owner'], r['space'], r['address'], r['words']) for r in resident_dsp.resource_ranges(tag))
        have = sorted((f, sp, a, w) for f, c, sp, a, w in spans(reg) if c == CORE[tag] and f in resident_dsp.FEATURES)
        if have != expected:
            problems.append('payload %s: the feature regions differ from resident_dsp.resource_ranges' % tag)
        # A feature's regions in the same order: its reset (the receiver's ranges) and the board's chunks (the ledger's
        # first-range split) walk them in that order.
        for f in resident_dsp.FEATURES:
            order = [(r['space'], r['address'], r['words']) for r in resident_dsp.resource_ranges(tag) if r['owner'] == f]
            if [(sp, a, w) for g, c, sp, a, w in spans(reg) if g == f and c == CORE[tag]] != order:
                problems.append('payload %s: feature %d\'s regions are not in resident_dsp.resource_ranges\'s order' % (tag, f))
    for f in reg['features']:
        if f['name'] == 'keybus':
            text = (SDK / 'modules/sidechain-compressor/patch_sc_dsp3.asm').read_text()
            for old, new in resident_dsp.REVIEWED['sidechain-compressor'][1]:
                text = text.replace(old, new)
            if f.get('executed') != resident_dsp.keybus_executed(resident_dsp.split_sidechain(text)[1]):
                problems.append('keybus: its executed figure differs from its tap\'s static count (resident_dsp.keybus_executed)')
        if 'hardware' in f:
            # The charge is a timing on a unit: its record must exist and give the same figure.
            record = HERE / f['evidence']
            if not record.is_file() or json.loads(record.read_text()).get('cyclesPerSample') != f['hardware']:
                problems.append('%s: its hardware figure differs from %s\'s cyclesPerSample' % (f['name'], f['evidence']))
    if not HEADER.is_file() or HEADER.read_text() != header(reg):
        problems.append('resident-runtime/dsp_ledger.h is stale: run dsp_sites.py --write')
    return problems


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    reg = load()
    if args.write:
        HEADER.write_text(header(reg))
    problems = check(reg)
    if problems:
        sys.exit('\n'.join(problems))


if __name__ == '__main__':
    main()
