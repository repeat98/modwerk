#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Native declaration checks for the card builder, one pair at a time, plus slot_tail_meetings below.

    npm run modules:pairs                  # check src/catalog/compatibility-pairs.json, the proof and the flags
    npm run modules:pairs -- --write       # regenerate it (a module or the ledger changed)

octabam's ledger compares modules two at a time: FX ids, hook sites, caves, pokes, DSP ranges and buffers. Its only
rule that reads the whole selection is POLY8's shared composition (remix/machine_composition.py), which rewrites the
machine modules' claims when POLY8 is selected and drops Scale Quantizer's when FM Synth supplies it. So a selection
is clean when each module alone and each pair is clean in the selection's context: which of those modules it holds.
The table grows with the square of the number of modules, not with every combination.

The proof runs on every check: in each context, the full ledger checks every largest selection whose pairs are all
clean. Every other selection the table accepts is part of one of them, and the ledger's rules only find more
collisions when modules are added, so all of them are clean too. A new rule that reads whole selections fails here.

Flags: a pair the ledger refuses must be named in one module's compatibility.conflicts (docs/module-guides/README.md,
"Flag every incompatibility"), so no collision ships without its author deciding it.

Declarations only: no firmware is read and nothing is built.
"""
import itertools
import json
import os
import re
import sys
import time
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
TABLE = APP / 'src/catalog/compatibility-pairs.json'
GUIDE = 'docs/module-guides/README.md#flag-every-incompatibility'
SLOT = 0x4000  # one allocator FX2 slot, in words


def slot_tail_meetings(selected):
    """An allocator effect's FX2 buffer meeting a range another module declares in the same shared-window slot.

    The ledger takes a slot's tail as free, which holds for stock effects (written no further than +$3DA2) but not for
    one that fills its slot: Sidechain Compressor's key window is the last 514 words of the bank-track-3 slots. Card
    builds have no run-time arbiter, so the pair is refused here. Over USB the base refuses such a buffer on that
    block itself (mw_hook_buffer_permitted, sdk/machines/octatrack/module-adapters/resident-runtime/)."""
    from remix.dsp_ranges import payloads
    from remix.schema import HALF_BASE
    out = set()
    for a in selected:
        c = getattr(a, 'claims', None)
        if c is None or not c.stock_instance_buffer or c.fx1_only:
            continue
        extent = c.buffer_words or SLOT  # undeclared: the whole slot
        slots = [base for q in sorted(payloads(a)) for base in (HALF_BASE[q], HALF_BASE[q] + SLOT)]
        for b in selected:
            if b is a or getattr(b, 'claims', None) is None:
                continue
            for r in b.claims.dsp_ranges:
                for p in sorted(payloads(b)):
                    domain, start, end = r.resolve(p)
                    if domain != 'shared':
                        continue
                    for base in slots:
                        if start < base + extent and base < end:
                            out.add(f"FX2 buffer meets a declared range: {a.name}'s FX2 buffer (+$0..+${extent - 1:x}) "
                                    f"and {b.name}'s {r.what} both claim shared 0x{max(start, base):05x}.."
                                    f"0x{min(end, base + extent) - 1:05x}")
    return sorted(out)


def ledger_check():
    """octabam's ledger as a function of module ids, run as the native builds run it."""
    os.chdir(APP / 'sdk/octabam')
    os.environ['XBUS'] = '1'  # every Modwerk native build relocates a bus client's scratch into the shared window
    sys.path[:0] = [str(APP / 'sdk/octabam/tools')]
    import toolpath  # noqa: F401
    from remix import ledger, registry, machine_composition
    from remix.schema import Remix
    known = registry.modules()
    byid = {m.name: m for m in known.values()}

    def check(ids):
        # USB Audio Out brings USB MIDI, as the build does.
        keys = tuple(byid[i].key for i in ids) + (('USB MIDI',) if 'usb-audio-out-tracks-main-cue' in ids else ())
        remix = registry.with_platform(Remix(name='pairs', doc='Declaration check only.', modules=keys, fallback='NONE'), known)
        selected = registry.selected(remix)
        return ledger.check(selected) + slot_tail_meetings(selected)
    # POLY8's composition reads which machines are selected; a module FM Synth supplies loses its claims beside it.
    supplied_by = sorted({g['suppliedBy'] for g in machine_composition.POLICY['groups'] if g.get('suppliedBy')})
    return check, set(byid), supplied_by


def contexts_for(supplied_by):
    """The selections' contexts: nothing, or POLY8 with each combination of the modules that supply another."""
    out = [()]
    for n in range(len(supplied_by) + 1):
        out += [('poly8', *combo) for combo in itertools.combinations(supplied_by, n)]
    return out


def context_of(ids, contexts):
    """The longest context whose modules the selection holds (src/catalog/compatibility-checks.ts does the same)."""
    return max((c for c in contexts if set(c) <= set(ids)), key=len)


def maximal_cliques(nodes, clean_pair):
    """Every largest set of nodes whose pairs are all clean (Bron-Kerbosch with pivoting)."""
    neighbours = {n: {m for m in nodes if m != n and clean_pair(n, m)} for n in nodes}
    found = []

    def grow(r, p, x):
        if not p and not x:
            found.append(sorted(r))
            return
        pivot = max(p | x, key=lambda n: len(neighbours[n] & p))
        for n in sorted(p - neighbours[pivot]):
            grow(r | {n}, p & neighbours[n], x & neighbours[n])
            p = p - {n}
            x = x | {n}
    grow(set(), set(nodes), set())
    return found


def not_composed():
    """Modules that build only on their own (scripts/module-coverage.mjs NOT_COMPOSED): the standalone rule refuses
    every companion, so they have no pairs."""
    found = re.search(r'export const NOT_COMPOSED = \[([^\]]*)\]', (APP / 'scripts/module-coverage.mjs').read_text(encoding='utf-8'))
    if not found:
        raise SystemExit('scripts/module-coverage.mjs: cannot read NOT_COMPOSED; update scripts/module-pairs.py')
    return set(re.findall(r"'([^']+)'", found.group(1)))


def build(check, known, supplied_by):
    catalog = json.loads((APP / 'sdk/catalog.json').read_text(encoding='utf-8'))
    standalone = not_composed()
    modules = sorted(row['id'] for row in catalog['modules'] if row['id'] not in standalone)
    missing = [i for i in modules if i not in known]
    if missing:
        raise SystemExit('No sdk/octabam/modules/<id>/manifest.py for ' + ', '.join(missing))
    contexts = contexts_for(supplied_by)
    clashes, cache = {}, {}

    def problems(ids):
        key = '+'.join(sorted(set(ids)))
        if key not in cache:
            cache[key] = check(sorted(set(ids)))
        return cache[key]
    for context in contexts:
        found = {}
        for size in (1, 2):
            for ids in itertools.combinations(modules, size):
                notes = problems((*ids, *context))
                if notes:
                    found['+'.join(ids)] = notes
        clashes['+'.join(context)] = found
    table = dict(schemaVersion=2, revision=catalog['sourceRevision'], modules=modules,
                 contexts=['+'.join(c) for c in contexts], clashes=clashes)
    return table, problems, contexts


def prove(table, problems, contexts):
    """The full ledger on every largest selection the pairs accept, per context. Returns the failures."""
    failures, runs = [], 0
    for context in contexts:
        clash = table['clashes']['+'.join(context)]
        # The modules a selection in this context can hold: adding one never changes the context.
        nodes = [m for m in table['modules'] if context_of((*context, m), contexts) == context]
        nodes = [m for m in nodes if m not in clash]  # a module refused alone is never in a clean selection
        ok = lambda a, b: '+'.join(sorted((a, b))) not in clash
        for clique in maximal_cliques(nodes, ok):
            if not set(context) <= set(clique) or context_of(clique, contexts) != context:
                continue
            runs += 1
            notes = problems(clique)
            if notes:
                failures.append(f'{"+".join(clique)} (context: {"+".join(context) or "none"}): {notes[0]}')
    return failures, runs


def flags(table):
    """Pairs the ledger refuses in some context that neither module names in compatibility.conflicts."""
    declared = set()
    for i in table['modules']:
        document = json.loads((APP / 'sdk/octabam/modules' / i / 'octamod.module.json').read_text(encoding='utf-8'))
        declared |= {frozenset((i, other)) for other in document['compatibility'].get('conflicts', [])}
    out = []
    for context, found in table['clashes'].items():
        for key, notes in found.items():
            ids = key.split('+')
            if len(ids) == 1:
                out.append(f'{ids[0]} is refused on its own{" beside " + context if context else ""}: {notes[0]}')
            elif frozenset(ids) not in declared and not any(o.startswith(f'{ids[0]} and {ids[1]} ') for o in out):
                out.append(f'{ids[0]} and {ids[1]} collide{" (with " + context + ")" if context else ""}, but neither '
                           f'names the other in compatibility.conflicts: {notes[0]}')
    return out


def main(argv):
    started = time.perf_counter()
    check, known, supplied_by = ledger_check()
    table, problems, contexts = build(check, known, supplied_by)
    failures, runs = prove(table, problems, contexts)
    unflagged = flags(table)
    text = json.dumps(table, indent=1, sort_keys=False) + '\n'
    stale = TABLE.read_text(encoding='utf-8') != text if TABLE.exists() else True
    for line in failures:
        print('✗ pairs do not decide this selection: ' + line)
        print('    fix: the ledger gained a rule that reads whole selections; extend contexts_for() in scripts/module-pairs.py')
    for line in unflagged:
        print('✗ ' + line)
        print('    fix: move one module to a base event or table, or other free bytes; if the clash is deliberate, add the '
              'other module to compatibility.conflicts (' + GUIDE + ')')
    if '--write' in argv and not failures:
        TABLE.write_text(text, encoding='utf-8', newline='\n')
    elif stale:
        print('✗ src/catalog/compatibility-pairs.json is stale: run npm run modules:pairs -- --write')
    pairs = len(table['modules']) * (len(table['modules']) - 1) // 2
    refused = sum(len(v) for v in table['clashes'].values())
    print(f'Native pairs: {len(table["modules"])} modules, {pairs} pairs in {len(contexts)} contexts, {refused} refused; '
          f'{runs} largest clean selections proved with the full ledger in {time.perf_counter() - started:.1f}s')
    return 1 if failures or unflagged or (stale and '--write' not in argv) else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
