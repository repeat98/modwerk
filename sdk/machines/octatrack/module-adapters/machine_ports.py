# SPDX-License-Identifier: MIT
"""Independent runtime packages for catalogue machine modules, through the events registry.

POLY8, VECTOR, FM Synth, Scale Quantizer and Analog BD each install alone or beside any other
module: what more than one of them patched is now the base's (take events and the ot_machines and
ot_sequencer_rows tables in sdk/machines/octatrack/events.json), and each subscribes or contributes.
machine-ports.json holds each module's runtime.json-equivalent; this file applies it to the module's
octabam manifest without changing its sources:

    ported(module)            the claims a package keeps (the gate and the base's overlap check)
    declaration(name)         its subscribe/contribute entries (the module's runtime.json, then the port's)
    effective(module, ...)    the package's units: the runtime source ports, minus what the base owns,
                              plus a generated glue unit (take records, the machine descriptor, SEQUENCER rows)

No package, composition or group is formed here: one module, one package.
"""
from dataclasses import replace
import hashlib
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
APP = HERE.parents[3]
PORTS = HERE / 'machine-ports.json'
FLAGS = {'PROTECT': 1, 'POOL': 2, 'RENDER_FLEX': 4, 'BACKING': 8, 'SETUP_ALL': 16, 'LIST': 32, 'SETUP_PAGE': 64}
KINDS = {'executed': 1, 'modeled': 2, 'hardware': 3}  # loader.h runtime_cycles
FIELDS = ('assign', 'admit_track', 'chooser_type', 'track_page', 'ui_tick', 'leave', 'pool_open', 'pool_left',
          'choice_left', 'list_draw', 'render', 'validate')  # struct modwerk_machine after abi, sig, label, flags, page, defaults
SETUP_FIELDS = ('setup_page', 'setup_knob')  # struct modwerk_machine_setup after the machine: SETUP_PAGE only
# Claim predicates (C convention: the argument on the stack, d0 the answer; d1/a0-a1 free), from a module's own
# exported predicate. poly_is_track: d0 = track -> d0 nonzero for a POLY track, d1/a0 scratch (polyphony.s).
CLAIMS = {
    'pm_claim_track': ('a POLY track (the argument is the track)',
                       'move.l  4(%sp),%d0\n        jmp     poly_is_track\n'),
    'pm_claim_audio': ('the current track is a POLY track outside MIDI mode (mr_octkey/mr_octnum\'s MR_TRACK)',
                       'tst.l   0x80000012\n        bne.s   1f\n        move.l  4(%sp),%d0\n        jmp     poly_is_track\n'
                       '1:      moveq   #0,%d0\n        rts\n'),
}


def _builder():
    spec = importlib.util.spec_from_file_location('modwerk_runtime_builder_ports', APP / 'sdk/runtime/loader/build.py')
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


def ports(path=PORTS):
    doc = json.loads(Path(path).read_text())
    if doc.get('schema') != 1 or not isinstance(doc.get('ports'), dict):
        raise ValueError('machine-ports.json: schema 1 with ports')
    return doc['ports']


def port(name, path=PORTS):
    return ports(path).get(name)


def check_sources(name, entry, root=APP):
    """The reviewed sources the port names symbols from are the ones on disk."""
    for rel, digest in entry['sources'].items():
        if hashlib.sha256((Path(root) / rel).read_bytes()).hexdigest() != digest:
            raise ValueError('%s changed since its machine port was reviewed: %s' % (name, rel))


def declaration(name, folder=None, path=PORTS):
    """{subscribe, contribute}: the module's own runtime.json first, then its port's, or None for neither."""
    own = _builder().runtime_declaration(folder or APP / 'sdk/octabam/modules' / name)
    entry = port(name, path)
    if not own and not entry:
        return None
    doc = dict(subscribe=list((own or {}).get('subscribe', [])), contribute=list((own or {}).get('contribute', [])))
    if entry:
        events = {e['event'] for e in doc['subscribe']} | {c['to'] for c in doc['contribute']}
        for e in entry.get('subscribe', []) + [dict(event=c['to']) for c in entry.get('contribute', [])]:
            if e['event'] in events:
                raise ValueError('%s: its runtime.json and its machine port both subscribe to %s' % (name, e['event']))
        doc['subscribe'] += entry.get('subscribe', [])
        doc['contribute'] += entry.get('contribute', [])
    return doc


def ported(module, registry=None, path=PORTS):
    """The module as its package installs it: replaced detours, pokes and references gone, tables a table
    replaces gone, retargeted detours and narrowed guards, dropped units and stock copies, every unit in
    DRAM (the runtime ports place pinned units). Unchanged for a module without a declaration."""
    builder = _builder()
    reg = registry or builder.site_events()
    declared = declaration(module.name, path=path)
    if not declared:
        return module
    entry = port(module.name, path) or {}
    from remix.stock_guard import stock_guard
    detours = []
    for d in module.detours:
        r = entry.get('retarget', {}).get(d.symbol)
        detours.append(replace(d, unit=r['unit'], symbol=r['symbol'],
                                expect=stock_guard(d.site, r['guardLength'], r['guardSha256'])) if r else d)
    kept, pokes, refs = builder.replaced(detours, builder.entries(declared), reg, pokes=module.pokes, refs=module.symbol_refs)
    owned = {(o['table'], o['site']) for o in reg['owned']}
    tables = []
    for t in module.tables:
        if t.label in entry.get('dropTables', ()):
            if not all(('ot_sequencer_rows', at) in owned for at, _ in t.refs):
                raise ValueError('%s: table %s is not one ot_sequencer_rows owns' % (module.name, t.label))
            continue
        tables.append(t)
    drop_units, drop_copies = set(entry.get('dropUnits', ())), set(entry.get('dropCopies', ()))
    units = tuple(replace(u, cave_addr=None, dram=True, stock_copies=tuple(c for c in u.stock_copies if c.symbol not in drop_copies))
                  for u in module.linked if u.label not in drop_units)
    named = {d.unit for d in kept} | {r.unit for r in refs}
    if named - {u.label for u in units}:
        raise ValueError('%s: a kept site names a dropped unit: %s' % (module.name, ', '.join(sorted(named - {u.label for u in units}))))
    return replace(module, detours=tuple(kept), pokes=tuple(pokes), symbol_refs=tuple(refs), tables=tuple(tables), linked=units)


def glue(name, entry):
    """The package's generated glue unit (GNU as, ColdFire): take records, the machine descriptor, SEQUENCER rows
    and claim predicates, every symbol the module's own. Module sources stay as they are."""
    out = ['| Generated by sdk/machines/octatrack/module-adapters/machine_ports.py for %s: do not edit.\n' % name,
           '        .text\n        .balign 4\n']
    for claim in entry.get('claims', ()):
        what, code = CLAIMS[claim]
        out.append('| %s\n        .global %s\n%s:\n        %s' % (what, claim, claim, code))
        out.append('        .balign 4\n')
    for label, (claims, entry_symbol) in sorted(entry.get('records', {}).items()):
        out.append('        .global %s\n%s:\n        .long   %s, %s\n' % (label, label, claims or 0, entry_symbol or 0))
    m = entry.get('machine')
    if m:
        out.append('        .global mw_machine\nmw_machine:\n        .long   1\n        .byte   \'%s\', \'%s\', %d, %d\n'
                   '        .long   mw_machine_label, %d, 0, %s\n' % (
                       m['sig'][0], m['sig'][1], m['lo'], m['hi'], sum(FLAGS[f] for f in m['flags']), m['fields'].get('defaults', 0)))
        out += ['        .long   %s\n' % (m['fields'].get(f) or 0) for f in FIELDS]
        price = entry.get('price')
        out.append('        .word   %d, %d\n        .byte   %d, 0, 0, 0\n' % (
            (price['voice'], price['engine'], KINDS[price['kind']]) if price else (0, 0, 0)))
        if 'SETUP_PAGE' in m['flags']:  # the record goes on: struct modwerk_machine_setup (EVENTS.md ot_machines)
            out += ['        .long   %s\n' % (m['fields'].get(f) or 0) for f in SETUP_FIELDS]
        unknown = set(m['fields']) - set(FIELDS) - {'defaults'} - (set(SETUP_FIELDS) if 'SETUP_PAGE' in m['flags'] else set())
        if unknown:
            raise ValueError('%s: unknown machine fields %s' % (name, ', '.join(sorted(unknown))))
        out.append('mw_machine_label:\n        .asciz  "%s"\n        .balign 4\n' % m['label'])
    s = entry.get('sequencer')
    if s:
        out.append('        .global mw_sequencer_rows\nmw_sequencer_rows:\n        .long   %d\n' % len(s['rows']))
        out += ['        .long   %s, %s, %s\n' % tuple(row) for row in s['rows']]
    return ''.join(out)


def effective(module, sdk_root, work, registry=None, path=PORTS):
    """(module, entries): the package's effective manifest, with its runtime source ports applied into `work`
    (vector_runtime, fm_runtime, quantizer_runtime) and its glue unit added, and its hook entries."""
    entry = port(module.name, path)
    declared = declaration(module.name, path=path)
    if entry:
        check_sources(module.name, entry)
    effective_module = ported(module, registry, path)
    work = Path(work); work.mkdir(parents=True, exist_ok=True)
    sdk_root = Path(sdk_root)
    import sys
    sys.path.insert(0, str(HERE))
    if module.name == 'vector':
        import vector_runtime
        effective_module = vector_runtime.port(effective_module, sdk_root, work / 'vector')
    elif module.name == 'synth':
        import fm_runtime
        effective_module = fm_runtime.port(effective_module, sdk_root, work / 'fm', composition=True)
    elif module.name == 'quantizer':
        import quantizer_runtime
        effective_module = quantizer_runtime.port(effective_module, sdk_root, work / 'quantizer')
    if entry and entry.get('controller'):  # a module's own reviewed controller port (the analog-bd lane's)
        try:
            controller = importlib.import_module(entry['controller'])
        except ImportError as error:
            raise ValueError('%s needs its controller port %s (module-adapters).' % (module.name, entry['controller'])) from error
        effective_module = controller.port(effective_module, sdk_root, work / 'controller')
    price = (entry or {}).get('price')
    if price and (APP / price['source']).is_file():
        measured = json.loads((APP / price['source']).read_text())
        if (measured.get('perVoice'), measured.get('perCoreWhileEnabled'), measured.get('kind')) != (
                price['voice'], price['engine'], price['kind'] + '-instructions'):
            raise ValueError('%s: its machine port\'s price differs from %s' % (module.name, price['source']))
    if entry:
        from remix.schema import Linked
        source = work / 'machine-port-glue.s'
        source.write_text(glue(module.name, entry))
        effective_module = replace(effective_module, linked=effective_module.linked + (
            Linked('mw_port', str(source), cpu='5475', dram=True),))
    return effective_module, (_builder().entries(declared) if declared else [])


def imports(name, path=PORTS):
    """Symbols a package takes from the exact base it is built for (its port's `imports`)."""
    return tuple((port(name, path) or {}).get('imports', ()))
