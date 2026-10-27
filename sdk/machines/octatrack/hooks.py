#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""The Octatrack's hooks at base-owned stock sites, from hooks.json.

    python3 -B sdk/machines/octatrack/hooks.py --check   # generated files are current
    python3 -B sdk/machines/octatrack/hooks.py --write   # regenerate them

Generates the base's dispatch (elekloader/runtime_hooks.s), the loader's
table header (elekloader/runtime_hooks.h), the SDK header modules include
(include/modwerk_hooks.h), the reference table (HOOKS.md) and the hook
kinds the site checks packages against (site-hooks.json, read by
src/engine/elekloader/module-set.ts). The base patches each site with a jmp to
its dispatch; a runtime package subscribes (loader.h's hook words past
RUNTIME_ENC, build.py) and never patches the site. A hook with
no site ("site": null) is raised by a module instead: it calls the base's
modwerk_raise_<hook>(), which runs every handler and returns their answers OR'd.
Its package asks for the entry by the hook's index (runtime.json "raise"): the
loader writes the address into a zero word of its image at install, so no package is
bound to one base build.

Three kinds of hook (HOOKS.md): a `call` hook (the default) runs C handlers at
its site; a `take` hook gives its site to one subscriber, whose detour-ABI entry
runs with the site's registers (modules whose handlers replay stock themselves);
a `table` has no site: modules contribute records (Elekloader's `contribute`) and
base code reads them, in (order, module id) order. A table may own stock sites the
base patches for its reader (the machine registry's chooser seams).
"""
import argparse
import json
from pathlib import Path
import re
import sys

HERE = Path(__file__).resolve().parent
REGISTRY = HERE / 'hooks.json'
FIRST = 4  # loader.h: RUNTIME_TICK, RUNTIME_DRAW, RUNTIME_KEY, RUNTIME_ENC come first
SAVED = 20  # d0-d1/a0-a2 the dispatch keeps for the stock continuation
KINDS = ('call', 'take', 'table')
REGISTERS = {'d0': 0, 'd1': 4, 'a0': 8, 'a1': 12, 'a2': 16}  # in the dispatch's saved frame
ROOM = 16  # a take hook's or table's subscribers, unless it says (call hooks: every module)
OUTPUTS = {'elekloader/runtime_hooks.s': 'asm', 'elekloader/runtime_hooks.h': 'loader',
           'include/modwerk_hooks.h': 'sdk', 'HOOKS.md': 'markdown',
           'site-hooks.json': 'browser'}


def load(path=REGISTRY):
    """The validated registry: {'sites': {address: site}, 'events': [event, ...]} with ints for addresses."""
    doc = json.loads(Path(path).read_text())
    if doc.get('schema') != 1 or doc.get('device') != 'octatrack' or doc.get('os') != '1.40C':
        raise ValueError('hooks.json: schema 1 for the Octatrack 1.40C')
    sites = {}
    for s in doc['sites']:
        at = int(s['site'], 16)
        if at in sites or at & 1 or s['length'] < 6 or s['length'] & 1 or not re.fullmatch('[0-9a-f]{64}', s['guard']):
            raise ValueError('hooks.json: site %s needs an even length of 6 or more and a SHA-256 guard' % s['site'])
        for action in ('head', 'tail', 'done'):
            lines = s[action] or []
            if any(not isinstance(x, str) for x in lines[1:]) or (lines and not isinstance(lines[0], str) and not (
                    action != 'head' and set(lines[0]) == {'stock'} and type(lines[0]['stock']) is int
                    and 2 <= lines[0]['stock'] <= s['length'] and not lines[0]['stock'] & 1)):
                raise ValueError('hooks.json: site %s %s is instructions; a tail or done may start with {"stock": n}: '
                                 'the site\'s first n stock bytes, copied from the user\'s OS at the base build' % (s['site'], action))
        sites[at] = dict(s, site=at)
    events, owned = [], []
    for i, e in enumerate(doc['events']):
        kind = e.get('kind', 'call')
        name = e.get('event', '')
        if kind not in KINDS or e.get('index') != FIRST + i:
            raise ValueError('hooks.json: %s needs a kind (%s) and the next hook index' % (name, ', '.join(KINDS)))
        room = e.get('room', ROOM if kind != 'call' else None)
        if room is not None and (type(room) is not int or not 1 <= room <= 128):
            raise ValueError('hooks.json: %s room is 1-128 subscribers' % name)
        if kind == 'call' and e.get('site') is None:  # raised by a module through modwerk_raise_<event>: no stock bytes, no arguments yet
            if e.get('length') or e['args'] or e['results'] != 'or' or not re.fullmatch('ev_[a-z0-9_]+', name) or room is not None:
                raise ValueError('hooks.json: raised hook %s needs the next hook index, no length, room or arguments, '
                                 'and results "or"' % name)
            events.append(dict(e, kind=kind, site=None, length=0, room=None))
            continue
        if kind == 'table':
            if (e.get('site') is not None or not re.fullmatch('ot_[a-z0-9_]+', name) or type(e.get('record')) is not int
                    or e['record'] < 4 or e['record'] & 1 or (e.get('key') is not None and not (type(e['key']) is int and
                                                                                             0 <= e['key'] <= e['record'] - 4))):
                raise ValueError('hooks.json: table %s has no site, an ot_ name, a record size and an optional key offset' % name)
            for s in e.get('sites', []):
                at = int(s['site'], 16)
                if (at & 1 or not 2 <= s['length'] <= 32 or s['length'] & 1 or not re.fullmatch('[0-9a-f]{64}', s['guard'])
                        or s['op'] not in ('jmp', 'ptr', 'lea', 'own') or (s['op'] != 'own') != bool(s.get('target'))
                        or (s['op'] == 'jmp' and s['length'] < 6) or (s['op'] in ('ptr', 'lea') and s['length'] != (4 if s['op'] == 'ptr' else 6))):
                    raise ValueError('hooks.json: %s site %s: even address and length, a guard, op jmp/ptr/lea with its '
                                     'target or own' % (name, s['site']))
                owned.append(dict(s, site=at, table=name))
            events.append(dict(e, kind=kind, site=None, length=0, room=room))
            continue
        at = int(e['site'], 16)
        if (at not in sites or e['length'] != sites[at]['length'] or not re.fullmatch('ev_[a-z0-9_]+', name)):
            raise ValueError('hooks.json: %s needs the next hook index and a declared site' % name)
        if kind == 'take':
            arg = e.get('arg')
            if (e.get('entry') not in ('jmp', 'jsr') or (arg is not None and arg not in REGISTERS and
                                                          not re.fullmatch(r'd[2-7]|a[3-6]|u8:0x[0-9a-f]{8}', arg))):
                raise ValueError('hooks.json: take hook %s needs entry jmp or jsr and arg null, a register or u8:0x...' % name)
            if any(x['site'] == at for x in events):
                raise ValueError('hooks.json: take hook %s needs a site of its own' % name)
            events.append(dict(e, kind=kind, site=at, room=room))
            continue
        if e['results'] != 'notify' and (e['results'].get('0') != 'next' or e['results'].get('*') not in ('tail', 'done')
                                         or any(v not in ('tail', 'done') for k, v in e['results'].items() if k != '0')):
            raise ValueError('hooks.json: %s results map 0 to next and every other value to tail or done' % name)
        if any(v == 'done' for v in (e['results'].values() if e['results'] != 'notify' else ())) and not sites[at]['done']:
            raise ValueError('hooks.json: %s drops calls at a site with no done code' % name)
        for a in e['args']:
            if a != '&d0' and a not in REGISTERS and not re.fullmatch(r'site\+\d+|d[2-7]|a[3-6]', a):
                raise ValueError('hooks.json: %s argument %s is &d0, site+N or a register at the site' % (name, a))
        events.append(dict(e, kind=kind, site=at, room=room))
    spans = sorted([(at, s['length']) for at, s in sites.items()] + [(s['site'], s['length']) for s in owned])
    if any(a + n > b for (a, n), (b, _) in zip(spans, spans[1:])):
        raise ValueError('hooks.json: two base-owned sites overlap')
    if any(e['kind'] == 'take' for e in events for x in events if x['kind'] == 'call' and x['site'] == e['site']):
        raise ValueError('hooks.json: a take hook shares no site with call hooks')
    return dict(sites=sites, events=events, owned=owned)


def index(name, registry=None):
    """The hook index a package carries for an event."""
    for e in (registry or load())['events']:
        if e['event'] == name:
            return e['index']
    raise ValueError('No event %s in sdk/machines/octatrack/hooks.json' % name)


def raised(registry=None):
    """The events modules raise themselves: {event name: the base's entry symbol}."""
    return {e['event']: 'modwerk_raise_' + e['event'] for e in (registry or load())['events'] if e['kind'] == 'call' and e['site'] is None}


def base_sites(registry=None):
    """The patches the base build writes: (address, length, guard SHA-256, the dispatch symbol it jumps to)."""
    reg = registry or load()
    return [(at, s['length'], s['guard'], 'modwerk_site_%08x' % at) for at, s in sorted(reg['sites'].items())]


def owned_sites(registry=None):
    """The stock sites tables own, which the base's table readers patch: dicts with site, length, guard, op
    (jmp: a jmp to target; ptr: the 4-byte word becomes target's address; lea: an lea's operand, its opcode kept;
    own: the base leaves the stock bytes and its code rewrites them at run time), target, table."""
    return list((registry or load())['owned'])


def table(name, registry=None):
    """A table's entry."""
    for e in (registry or load())['events']:
        if e['event'] == name and e['kind'] == 'table':
            return e
    raise ValueError('No table %s in sdk/machines/octatrack/hooks.json' % name)


def _call(out, name, e, k):
    loop, end = '.L%s_%s' % (name, e['event']), '.L%s_%s_end' % (name, e['event'])
    out.append('| %s: %s\n        movea.l modwerk_runtime_event_row+%d,%%a2\n%s:\n'
               '        move.l  (%%a2)+,%%d0\n        beq     %s\n' % (e['event'], e['prototype'], 4 * k, loop, end))
    pushed = 0
    for a in reversed(e['args']):
        if a == '&d0':
            out.append('        pea     %d(%%sp)\n' % pushed)
        elif a in REGISTERS:  # the site's d0-d1/a0-a2, in the dispatch's saved frame
            out.append('        move.l  %d(%%sp),-(%%sp)\n' % (REGISTERS[a] + pushed))
        elif a[0] in 'da':  # d2-d7/a3-a6: the dispatch and every handler keep them
            out.append('        move.l  %%%s,-(%%sp)\n' % a)
        else:
            out.append('        move.l  %d(%%sp),-(%%sp)\n' % (SAVED + int(a[5:]) + pushed))
        pushed += 4
    out.append('        movea.l %%d0,%%a0\n        jsr     (%%a0)\n        lea     %d(%%sp),%%sp\n' % pushed)
    if e['results'] == 'notify':
        out.append('        bra     %s\n' % loop)
    else:
        out.append('        tst.l   %%d0\n        beq     %s\n' % loop)
        for value, action in sorted((k, v) for k, v in e['results'].items() if k not in ('0', '*')):
            out.append('        cmpi.l  #%d,%%d0\n        beq     .L%s_%s\n' % (int(value), name, action))
        out.append('        bra     .L%s_%s\n' % (name, e['results']['*']))
    out.append('%s:\n' % end)


def _take(out, name, e, k, at):
    """One taker: each record {claims, entry} in order; claims 0 or nonzero takes. The entry then runs with every
    register and the stack as at the site (jsr: its rts returns past the site); entry 0 or no taker: stock."""
    loop = '.L%s_take' % name
    out.append('| %s (take, %s entry): the first record that claims the call\n'
               '        movea.l modwerk_runtime_event_row+%d,%%a2\n%s:\n        move.l  (%%a2)+,%%d0\n'
               '        beq     .L%s_tail\n        movea.l %%d0,%%a0\n        move.l  (%%a0),%%d0\n        beq     .L%s_entry\n'
               % (e['event'], e['entry'], 4 * k, loop, name, name))
    arg = e.get('arg')
    if arg in REGISTERS:
        out.append('        move.l  %d(%%sp),-(%%sp)\n' % REGISTERS[arg])
    elif arg and arg.startswith('u8:'):
        out.append('        mvz.b   %s,%%d1\n        move.l  %%d1,-(%%sp)\n' % arg[3:])
    elif arg:
        out.append('        move.l  %%%s,-(%%sp)\n' % arg)
    out.append('        movea.l %%d0,%%a0\n        jsr     (%%a0)\n%s        tst.l   %%d0\n        beq     %s\n'
               '.L%s_entry:\n        movea.l -4(%%a2),%%a0\n        move.l  4(%%a0),%%d0\n        beq     .L%s_tail\n'
               % ('        addq.l  #4,%sp\n' if arg else '', loop, name, name))
    if e['entry'] == 'jmp':
        out.append('        move.l  %%d0,%d(%%sp)\n        movem.l (%%sp),%%d0-%%d1/%%a0-%%a2\n        lea     %d(%%sp),%%sp\n'
                   '        rts\n' % (SAVED + 4, SAVED + 4))
    else:
        out.append('        move.l  %%d0,%d(%%sp)\n        lea     %#010x,%%a0\n        move.l  %%a0,%d(%%sp)\n        movem.l (%%sp),%%d0-%%d1/%%a0-%%a2\n'
                   '        lea     %d(%%sp),%%sp\n        rts\n' % (SAVED, at + e['length'], SAVED + 4, SAVED))


def _line(at, line):
    """A tail's line; {"stock": n}: a zero placeholder the base build fills with the site's own first n stock bytes
    (build_core.py: every global modwerk_stock_<address>_<n> is a stock reference, so no stock byte is carried)."""
    if isinstance(line, str):
        return '        %s\n' % line
    label = 'modwerk_stock_%08x_%d' % (at, line['stock'])
    return '        .globl  %s\n%s:\n        .space  %d | the site\'s own stock bytes\n' % (label, label, line['stock'])


def asm(reg):
    out = ['| SPDX-License-Identifier: GPL-3.0-or-later\n'
           '| Generated by sdk/machines/octatrack/hooks.py from hooks.json: do not edit.\n'
           '| The base owns these stock sites: each is a jmp here. Handlers come from the\n'
           '| loader\'s ordered tables (modwerk_runtime_event_row, one per event, 0-ended):\n'
           '| a call event\'s with the C convention, a take event\'s records {claims, entry};\n'
           '| d0-d1/a0-a2 are kept for the stock continuation.\n'
           '        .text\n        .globl  modwerk_events_code, modwerk_events_code_end\n'
           'modwerk_events_code:\n']
    for at, s in sorted(reg['sites'].items()):
        name = '%08x' % at
        here = [e for e in reg['events'] if e['site'] == at]
        take = here[0]['kind'] == 'take'
        frame = SAVED + (8 if take else 0)
        out.append('\n| ---- %#010x: %s\n        .globl  modwerk_site_%s\nmodwerk_site_%s:\n' % (
            at, ', '.join(e['event'] for e in here), name, name))
        out += ['        %s\n' % line for line in s['head']]
        out.append('        lea     -%d(%%sp),%%sp\n        movem.l %%d0-%%d1/%%a0-%%a2,(%%sp)\n' % frame)
        for e in here:
            (_take(out, name, e, e['index'] - FIRST, at) if take else _call(out, name, e, e['index'] - FIRST))
        for action in ('tail', 'done'):
            if s[action]:
                out.append('.L%s_%s:\n        movem.l (%%sp),%%d0-%%d1/%%a0-%%a2\n        lea     %d(%%sp),%%sp\n' % (name, action, frame))
                out += [_line(at, line) for line in s[action]]
    for e in (e for e in reg['events'] if e['kind'] == 'call' and e['site'] is None):
        k, loop, end = e['index'] - FIRST, '.Lraise_%s' % e['event'], '.Lraise_%s_end' % e['event']
        out.append('\n| ---- raised by a module: %s: %s; every handler runs, the answers OR\'d\n'
                   '        .globl  modwerk_raise_%s\nmodwerk_raise_%s:\n'
                   '        lea     -8(%%sp),%%sp\n        movem.l %%d2/%%a2,(%%sp)\n        moveq   #0,%%d2\n'
                   '        movea.l modwerk_runtime_event_row+%d,%%a2\n%s:\n        move.l  (%%a2)+,%%d0\n        beq     %s\n'
                   '        movea.l %%d0,%%a0\n        jsr     (%%a0)\n        or.l    %%d0,%%d2\n        bra     %s\n'
                   '%s:\n        move.l  %%d2,%%d0\n        movem.l (%%sp),%%d2/%%a2\n        lea     8(%%sp),%%sp\n        rts\n'
                   % (e['event'], e['prototype'], e['event'], e['event'], 4 * k, loop, end, loop, end))
    out.append('modwerk_events_code_end:\n')
    return ''.join(out)


def loader(reg):
    spans = ', '.join('{%#010xu, %du}' % (e['site'] or 0, e['length']) for e in reg['events'])  # raised and tables: no span
    raised = [e for e in reg['events'] if e['kind'] == 'call' and e['site'] is None]
    raises = ', '.join('(uintptr_t)modwerk_raise_%s' % e['event'] if e in raised else '0' for e in reg['events'])
    names = ', '.join('%d %s' % (e['index'], e['event']) for e in reg['events'])
    rows, calls, words = [], 0, 0  # one flat row store: a call event a word per module, others their room
    for e in reg['events']:
        rows.append('(r) + %du * (RUNTIME_MODULES + 1u) + %du' % (calls, words))
        if e['room'] is None:
            calls += 1
        else:
            words += e['room'] + 1
    room = ', '.join('RUNTIME_MODULES' if e['room'] is None else '%du' % e['room'] for e in reg['events'])
    tables = ', '.join('1' if e['kind'] == 'table' else '0' for e in reg['events'])
    owned = reg['owned']
    return ('/* SPDX-License-Identifier: GPL-3.0-or-later\n'
            ' * Generated by sdk/machines/octatrack/hooks.py from hooks.json: do not edit.\n'
            ' * The Octatrack\'s hooks at base-owned stock sites and its tables, as hook\n'
            ' * indices after loader.h\'s RUNTIME_ENC: %s. */\n'
            '#ifndef MODWERK_RUNTIME_EVENTS_H\n#define MODWERK_RUNTIME_EVENTS_H\n'
            '#define RUNTIME_SITE_EVENTS %du\n'
            '#define RUNTIME_SITE_EVENT_SPANS { %s }\n'
            '#define RUNTIME_SITE_EVENT_ROOM { %s }\n'
            '#define RUNTIME_SITE_EVENT_TABLES { %s }\n'
            '#define RUNTIME_SITE_EVENT_WORDS (%du * (RUNTIME_MODULES + 1u) + %du)\n'
            '#define RUNTIME_SITE_EVENT_ROWS(r) { %s }\n'
            '#define RUNTIME_OWNED_SITES %du\n'
            '#define RUNTIME_OWNED_SPANS { %s }\n'
            '%s'
            '#endif\n') % (names, len(reg['events']), spans, room, tables, calls, words, ', '.join(rows), len(owned),
                           ', '.join('{%#010xu, %du, %du}' % (s['site'], s['length'], index(s['table'], reg) - FIRST)
                                     for s in owned) or '{0u, 0u, 0u}',
                           ''.join('extern const unsigned char modwerk_raise_%s[];\n' % e['event'] for e in raised) +
                           ('/* raised events: the base\'s entry a package\'s RUNTIME_RAISE hook word receives */\n'
                            '#define RUNTIME_SITE_EVENT_RAISES { %s }\n' % raises if raised else ''))


def sdk(reg):
    out = ['/* SPDX-License-Identifier: GPL-3.0-or-later\n'
           ' * Generated by sdk/machines/octatrack/hooks.py from hooks.json: do not edit.\n'
           ' * The Octatrack\'s hooks at stock sites the Modwerk base owns, and its tables\n'
           ' * (HOOKS.md). Subscribe or contribute with a module\'s runtime.json; never patch\n'
           ' * these sites. Call-hook handlers use the C convention: arguments on the\n'
           ' * stack, d0-d1/a0-a1 free, everything else kept, the result in d0. */\n'
           '#ifndef MODWERK_HOOKS_H\n#define MODWERK_HOOKS_H\n#include <stdint.h>\n\n'
           '#define MODWERK_EV_PASS 0  /* the next handler, then stock */\n'
           '#define MODWERK_EV_DROP 1  /* ev_voice_bind: stock does nothing */\n'
           '#define MODWERK_EV_STOCK 2 /* ev_voice_bind: stock now, no later handler */\n']
    if any(e['kind'] == 'take' for e in reg['events']):
        out.append('\n/* A take hook\'s subscription names one of these. claims (C convention) 0: it takes every call;\n'
                   ' * otherwise it takes the calls it returns nonzero for. entry: the code that gets the site, with every\n'
                   ' * register and the stack as there (it replays what the site held and returns to stock itself; a jsr\n'
                   ' * entry returns with rts); 0: stock runs at once and no later record is asked. */\n'
                   'struct modwerk_take { int (*claims)(unsigned arg); const void *entry; };\n')
    for e in reg['events']:
        if e['kind'] == 'table':
            out.append('\n/* %s (table, contribute {"to": "%s", "order", "data"}): %s. %s. %s */\n#define MODWERK_%s %d\n%s\n' % (
                e['event'], e['event'], e['when'], e['context'][0].upper() + e['context'][1:], e['contract'],
                e['event'].upper(), e['index'], e['declaration']))
            continue
        where = ('raised by a module' if e['site'] is None else
                 '%#010x' % e['site'] + (', take: subscribe a struct modwerk_take' if e['kind'] == 'take' else ''))
        out.append('\n/* %s (%s): %s. %s. %s */\n#define MODWERK_%s %d\n' % (
            e['event'], where, e['when'], e['context'][0].upper() + e['context'][1:], e['contract'], e['event'].upper(), e['index']))
        if e['kind'] == 'call':
            out.append('typedef %s;\n' % re.sub(r'^(\w+(?: \*)?)\s*f\(', r'\1 modwerk_%s(' % e['event'], e['prototype']))
        if e['kind'] == 'call' and e['site'] is None:  # runtime.json "raise": the loader points this zero word of the image at the base's entry
            out.append('/* Raise it: define `modwerk_%s *raise_%s` as a zero word in your image (initialized data, '
                       'not bss), list "%s" under "raise" in runtime.json and call through it; every handler\'s answer, OR\'d. */\n'
                       % (e['event'], e['event'], e['event']))
    out.append('\n#endif\n')
    return ''.join(out)


def markdown(reg):
    out = ['# Octatrack hooks at base-owned stock sites\n\n'
           'Generated by `sdk/machines/octatrack/hooks.py` from `hooks.json`: edit the registry, then run\n'
           '`python3 -B sdk/machines/octatrack/hooks.py --write`.\n\n'
           'The Modwerk base owns these stock sites and turns them into hooks, as Elekloader\'s core does for\n'
           '`ev_tick` and the others (rule 4: do not patch the shared sites, subscribe). A runtime package subscribes\n'
           'with `{"hook", "fn", "order"}` (a module\'s `runtime.json`, or `build.py --subscribe HOOK:FN:ORDER`);\n'
           'the loader keeps each hook\'s handlers in (order, module id) order and refuses any package that\n'
           'patches one of these sites. Handlers use the C convention: arguments on the stack, d0-d1/a0-a1 free,\n'
           'everything else kept, the result in d0. C modules include `include/modwerk_hooks.h`.\n\n'
           'A **take** hook gives its site to one subscriber: its `fn` names a `struct modwerk_take` {claims, entry}.\n'
           'The records are asked in order; the first whose `claims` is 0 or returns nonzero for the call gets the site:\n'
           'its `entry` runs with every register and the stack as at the site (code that replays what the site held and\n'
           'returns to stock itself, as a detour does; a `jsr` entry returns with rts past the site), or with `entry` 0\n'
           'stock runs at once. With no taker stock runs. A **table** has no site: modules contribute records\n'
           '(`{"to", "order", "data"}` in runtime.json, `data` a symbol of the record) and base code reads them in\n'
           '(order, module id) order. Each take hook and table has a room: the loader refuses a package past it.\n\n'
           '| hook | kind | site | when | prototype or record | result | order | context |\n|---|---|---|---|---|---|---|---|\n']
    for e in reg['events']:
        site = ('none' if e['kind'] != 'call' else 'none: a module calls the base\'s `modwerk_raise_%s` through a word the loader fills' % e['event']) if e['site'] is None else '%#010x' % e['site']
        proto = e['prototype'] if e['kind'] == 'call' else ('struct modwerk_take, %s entry, claims(%s)' % (e['entry'], e.get('arg') or 'nothing')
                                                            if e['kind'] == 'take' else '%d-byte record' % e['record'])
        out.append('| `%s` | %s | %s | %s | `%s` | %s | %s | %s |\n' % (
            e['event'], e['kind'], site, e['when'], proto, e['contract'], e['order'], e['context']))
    out.append('\n## Reviewed subscribers\n\n| hook | module | handler | order | what it does | evidence |\n|---|---|---|---|---|---|\n')
    for e in reg['events']:
        for s in e['subscribers']:
            out.append('| `%s` | %s | `%s` | %d | %s | %s |\n' % (e['event'], s['module'], s['fn'], s['order'], s['does'], s['evidence']))
    raisers = [(e, r) for e in reg['events'] for r in e.get('raisers', ())]
    if raisers:
        out.append('\n## Reviewed raisers\n\nA raised hook has no stock site: these modules call the base\'s entry and act on the answer.\n\n'
                   '| hook | module | where | what it does with the answer | evidence |\n|---|---|---|---|---|\n')
        out += ['| `%s` | %s | `%s` | %s | %s |\n' % (e['event'], r['module'], r['fn'], r['does'], r['evidence']) for e, r in raisers]
    out.append('\n## Why this order\n\n')
    out += ['- `%s`: %s\n' % (e['event'], e['orderEvidence']) for e in reg['events']]
    out.append('\n## The sites\n\n| site | bytes | stock SHA-256 | routine |\n|---|---|---|---|\n')
    out += ['| %#010x | %d | `%s` | %s |\n' % (at, s['length'], s['guard'], s['routine']) for at, s in sorted(reg['sites'].items())]
    if reg['owned']:
        out.append('\n## Sites the tables own\n\nThe base patches these for its table readers; no package may patch them: '
                   'contribute to the table instead.\n\n| site | bytes | table | base patch | stock SHA-256 | what |\n|---|---|---|---|---|---|\n')
        out += ['| %#010x | %d | `%s` | %s | `%s` | %s |\n' % (s['site'], s['length'], s['table'],
                                                              s['op'] + (' ' + s['target'] if s.get('target') else ''), s['guard'], s['what'])
                for s in sorted(reg['owned'], key=lambda s: s['site'])]
    return ''.join(out)


def browser(reg):
    """What the site checks of a package's hook words before it stages one (src/engine/elekloader/module-set.ts):
    each word's kind by hook index, a take hook's or table's room, a table's record size. No sites or guards."""
    kinds = {'call': lambda e: 'raise' if e['site'] is None else 'call', 'take': lambda e: 'take', 'table': lambda e: 'table'}
    rows = []
    for e in reg['events']:
        row = dict(index=e['index'], event=e['event'], kind=kinds[e['kind']](e))
        if e['room'] is not None:
            row['room'] = e['room']
        if e['kind'] == 'table':
            row['record'] = e['record']
        rows.append(row)
    return json.dumps(dict(about='Generated by sdk/machines/octatrack/hooks.py from hooks.json: do not edit. The hook '
                                 'words an ABI 8 package may carry after the four core handlers, by hook index.',
                           events=rows), indent=1) + '\n'


def generate(reg=None):
    reg = reg or load()
    make = dict(asm=asm, loader=loader, sdk=sdk, markdown=markdown, browser=browser)
    return {path: make[kind](reg) for path, kind in OUTPUTS.items()}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--write', action='store_true')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    stale = []
    for path, text in generate().items():
        target = HERE / path
        if args.write:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(text)
        elif not target.is_file() or target.read_text() != text:
            stale.append(path)
    if stale:
        sys.exit('Stale generated event files (run hooks.py --write): ' + ', '.join(stale))


if __name__ == '__main__':
    main()
