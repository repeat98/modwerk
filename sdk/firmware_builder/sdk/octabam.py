# SPDX-License-Identifier: GPL-3.0-or-later
"""Octatrack source ports: modules written in the octabam layout (sdk/octabam/modules/<name>/manifest.py, in the
vocabulary of its tools/remix/schema.py) as format-2 package folders.

Octabam(root) reads a checkout's manifests. convert() turns one module, with the modules it bridges, into a plan: the
mod.json, the module's sources and the glue it needs (a floating cave goes in the core's .run reserve under a glue
label, a pinned cave or unit becomes `fixed` code, detours, pokes, symbol refs and tables become sites, relocatable
data poked inside a protected range is served from a copy). write() lays the plan out as a folder for sdk.build, and
check() links the built package with the core and proves every byte against GNU ld's link of the module's own source
and the manifest's ratified bytes. With `bus`, hooks the Octatrack core's hook bus serves subscribe to its events
through generated glue; with `intercepts`, detours at the intercepts' sites become records in their tables.

A module refuses (Refused, with the reason) when it has DSP code or an FX menu entry, writes inside a protected range
other than relocatable data, pins code outside the free image areas, carries a loader-appended runtime or an arena
reserve, or needs a module that refuses.

Remixes (convert's `rx`, the DSP bus and the command line) are not part of this module.
"""
import contextlib
import json
import os
import re
import runpy
import shutil
import subprocess
import sys

from .. import elemod, formats, link

DEVICE = 'octatrack'
ARENA_STOCK_BASE = 0x40A955E0
PURGE_BANKS_END = 0x400254FA            # PURGE SAMPLES' bank-walk bound: the same literal, not the arena's base
EMIT_AT = (0x10000000, 0x20000000)      # a floating cave's emit() is run at both to see which words move
NOP = b'\x4e\x71'
OPS = {'jmp': b'\x4e\xf9', 'jsr': b'\x4e\xb9'}
ASM = ('.s', '.S', '.inc', '.i', '.h')
HERE = os.path.dirname(os.path.abspath(__file__))
# The tag generated glue starts with.
GENERATOR = 'firmware_builder.sdk.octabam'
PROTECTOR = 'the builder'               # who protects a range, in refusals and notes


class Refused(Exception):
    """The module does not convert; the message says why."""


class CheckError(Exception):
    pass


@contextlib.contextmanager
def _in(path):
    """Run the block with `path` as the working directory (manifests read their files relative to the checkout)."""
    before = os.getcwd()
    os.chdir(path)
    try:
        yield
    finally:
        os.chdir(before)


def mod_id(name):
    return 'octabam-' + name


def _slug(text):
    return re.sub(r'\W+', '_', text).strip('_').lower()


def _u32(data, at):
    return int.from_bytes(data[at:at + 4], 'big')


# ---- the checkout ---------------------------------------------------------------------------------------------------

class Octabam:
    """A checkout: `modules` by directory name, `broken` (name -> why its manifest failed), `by_key`, `commit`."""

    def __init__(self, root):
        self.root = os.path.abspath(root)
        tools = os.path.join(self.root, 'tools')
        if not os.path.isfile(os.path.join(tools, 'remix', 'schema.py')):
            raise ValueError('%s is not an octabam checkout (no tools/remix/schema.py)' % root)
        if tools not in sys.path:
            sys.path.insert(0, tools)
        self.modules, self.broken, self._ok = {}, {}, {}
        with _in(self.root):
            for name in sorted(os.listdir('modules')):
                manifest = os.path.join('modules', name, 'manifest.py')
                if name.startswith('_') or not os.path.isfile(manifest):
                    continue
                try:
                    self.modules[name] = runpy.run_path(manifest, run_name='octabam_' + _slug(name))['MODULE']
                except Exception as e:      # a manifest's own code failing: recorded, the rest still load
                    self.broken[name] = '%s: %s' % (type(e).__name__, e)
        self.by_key = {m.key: name for name, m in self.modules.items()}
        try:
            self.commit = subprocess.run(['git', '-C', self.root, 'rev-parse', '--short=7', 'HEAD'],
                                         capture_output=True, text=True, check=True).stdout.strip()
        except (OSError, subprocess.CalledProcessError):
            self.commit = 'unknown'

    def call(self, fn, *args):
        """A manifest's callable (emit, reference, include), run from the checkout's root."""
        with _in(self.root):
            return fn(*args)

    def convertible(self, name):
        if name not in self._ok:
            self._ok[name] = name in self.modules and refusal(self, name) is None
        return self._ok[name]


# ---- what converts --------------------------------------------------------------------------------------------------

# Modules that only serve DSP modules (which do not convert); their manifests cannot say so.
SERVES_DSP = {
    'mode-defaults': 're-defaults the knobs around a DSP engine\'s MODE select',
    'rig-hosts': 'gives every new part BusDelay, BusVerb and SEND as its FX2',
    'tempo-bus': 'turns the TEMPO window into a page of BusDelay\'s and BusVerb\'s knobs',
}


def hooked_dsp(m):
    """DSP code reached only through hooks into stock DSP code: no FX menu entry, no knobs."""
    return m.dsp is not None and m.menu is None and not m.params and bool(getattr(m.dsp, 'hooks', ()))


def refusal(ob, name, _seen=(), hooks=False):
    """Why module `name` does not convert, or None. `hooks` also lets hooked DSP code through (a remix's)."""
    m = ob.modules[name]
    if name in SERVES_DSP:
        return 'it serves DSP modules, which do not convert: it %s' % SERVES_DSP[name]
    dsp_ok = hooks and hooked_dsp(m)
    if not dsp_ok and (m.dsp is not None or m.menu is not None or m.params):
        return 'it has DSP code or an FX menu entry (only ColdFire-only modules convert)'
    if not dsp_ok:
        for _dir, _subdirs, files in os.walk(os.path.join(ob.root, 'modules', name)):
            if any(f.endswith('.asm') for f in files):
                return ('it carries DSP56300 code (.asm), which its build uploads (only '
                        'ColdFire-only modules convert)')
    if m.runtime is not None:
        return 'it is a loader-appended runtime (%s)' % m.runtime.recipe
    if m.arena is not None:
        return 'it reserves arena pages of its own'
    for cave in m.cf_patches:
        if not cave.source and (cave.cave_addr is None or cave.pinned or cave.hook_addr is not None):
            return 'its cave "%s" has no source' % cave.label
        if cave.registers_formatter is not None:
            return ('its cave "%s" draws a knob of %s (a formatter registration), a DSP module'
                    % (cave.label, cave.registers_formatter.module))
    for bridge in m.overrides:
        if bridge.write is not None:
            return 'it bridges %s\'s runtime write %s, and runtimes do not convert' % (bridge.module, bridge.write)
    for key in list(m.requires) + [bridge.module for bridge in m.overrides]:
        other = ob.by_key.get(key)
        if other is None:
            return 'it needs %s, which this checkout does not have' % key
        if other in _seen or other == name:
            continue
        why = refusal(ob, other, _seen + (name,), hooks)
        if why:
            return 'it needs %s, which does not convert: %s' % (key, why)
    return None


def members(ob, name):
    """`name` and, transitively, every module a bridge of it (schema.Override) stands in for, in discovery order."""
    found = [name]
    for current in found:                   # grows while it is walked
        for bridge in ob.modules[current].overrides:
            other = ob.by_key[bridge.module]
            if other not in found:
                found.append(other)
    return found


def category(m):
    """The module's category title (schema.CATEGORY_TITLE), its value without titles, '' without a category."""
    if m.category is None:
        return ''
    value = getattr(m.category, 'value', '')
    try:
        from remix.schema import CATEGORY_TITLE
    except ImportError:
        return value
    titles = {getattr(k, 'value', k): title for k, title in CATEGORY_TITLE.items()}
    return titles.get(value, value)


def _boundary(image, addr, n, dev):
    """Bytes from addr to the first instruction boundary at or past addr + n."""
    isa = dev.decoder()
    read = isa.reader(image, dev.main_load)
    end = addr
    while end < addr + n:
        end += isa.decode(read(end), end).length
    return end - addr


def _stock(image, dev, addr, n):
    at = addr - dev.main_load
    return image[at:at + n]


def _relocatable(dev, addr, n):
    """The device's relocatable data entry (lo, n, refs, what) wholly holding addr..addr+n, or None."""
    return next((r for r in dev.relocatable if r[0] <= addr and addr + n <= r[0] + r[1]), None)


# ---- the Octatrack core's hook bus (bus=True) -----------------------------------------------------------------------
# Hooks the core's events serve, by (site, detour symbol) or (site, module key) for a dispatch poke. kind:
#   call  the entry keeps the C convention; the glue calls it `times` times
#   stub  a detour stub that ends by jumping to the stock continuation; the glue saves the C convention's registers,
#         enters it (past its replayed instruction with `skip`), and its continuation (`rewrite`: a pattern matching
#         exactly one line of its source) is rewritten to return to the glue, which drops `pops` bytes
#   cc    a MIDI dispatch entry for CC messages whose "not mine" exit is the symbol `next`
BUS = {
    (0x4000D99A, 'tu_frame'): dict(
        event='ev_frame', kind='stub', skip=True, pops=0,
        rewrite=(r'^(\s*\.set\s+ISR_GO,\s*)0x4000D9A0\b', 0x4000D9A0)),
    (0x40056C72, 'tu_tick'): dict(
        event='ev_tick', kind='stub', skip=False, pops=4,
        rewrite=(r'^(\s*\.set\s+UI_GO,\s*)0x40056C78\b', 0x40056C78)),
    (0x4005595C, 'cf_tick'): dict(
        event='ev_tick', kind='call', entry='cf_sweep', times=2),     # a 120 Hz task on the 60 Hz tick
    (0x4000D9A0, 'audio_frame_shim'): dict(
        event='ev_frame', kind='stub', skip=False, pops=0,
        rewrite=(r'^(\s*jmp\s+)0x4000d9a6\b', 0x4000D9A6)),
    (0x400D64A0, 'CC MAP'): dict(
        event='ev_midi', kind='cc', next='CC_NEXT', stock=0x4000E79C),
}
BUS_ORDER = 50

# ---- the intercepts (intercepts=True): site -> (event, detour kind, length) ------------------------------------------
INTERCEPTS = {
    0x4000E746: ('ev_midi_note_on', 'jmp', 6), 0x4000DFD4: ('ev_midi_note_off', 'jmp', 8),
    0x40045918: ('ev_octave_key', 'jmp', 8), 0x40044968: ('ev_keyboard_draw', 'jmp', 8),
    0x4004FBDE: ('ev_chromatic_release', 'jmp', 6), 0x4004FBFE: ('ev_chromatic_held', 'jmp', 8),
    0x4004FC58: ('ev_chromatic_pitch', 'jsr', 10), 0x4004FC94: ('ev_chromatic_trig', 'jmp', 8),
    0x4004FCE0: ('ev_chromatic_record', 'jmp', 8), 0x4004FD06: ('ev_chromatic_recorded', 'jmp', 6),
    0x4004FD20: ('ev_chromatic_locked', 'jmp', 6), 0x40050254: ('ev_chromatic_index', 'jmp', 8),
    0x40050E60: ('ev_plock_store', 'jsr', 10), 0x40055170: ('ev_knob_store', 'jsr', 6),
    0x40010212: ('ev_settings_sanitise', 'jsr', 6), 0x40025AC2: ('ev_project_defaults', 'jsr', 6),
    0x400866CC: ('ev_project_load', 'jmp', 8), 0x400867A2: ('ev_project_line', 'jmp', 8),
    0x400888AA: ('ev_project_write', 'jmp', 8),
}
INTERCEPT_ORDER = 50

_SAVE = '        lea     -44(%sp), %sp\n        movem.l %d2-%d7/%a2-%a6, (%sp)\n'
_RESTORE = '        movem.l (%sp), %d2-%d7/%a2-%a6\n        lea     44(%sp), %sp\n        rts\n'
_CC_GLUE = '\n'.join((
    '%(sym)s:',
    '        movea.l 4(%%sp), %%a0',
    '        moveq   #0, %%d0',
    '        move.b  (%%a0), %%d0',
    '        lsr.l   #4, %%d0',
    '        moveq   #11, %%d1',
    '        cmp.l   %%d1, %%d0',
    '        bne.s   9f                      | not a CC: not its',
    '        clr.b   %(flag)s',
    '        move.l  %%a0, -(%%sp)',
    '        jsr     %(entry)s',
    '        addq.l  #4, %%sp',
    '        tst.b   %(flag)s',
    '        bne.s   9f                      | it passed it on',
    '        moveq   #1, %%d0                 | it kept it',
    '        rts',
    '9:      moveq   #0, %%d0',
    '        rts',
    '        .globl  %(next)s',
    '%(next)s:                               | its %(name)s: passed on',
    '        moveq   #1, %%d0',
    '        move.b  %%d0, %(flag)s',
    '        rts',
    '%(flag)s:',
    '        .byte   0',
    '        .balign 2',
    ''))


def _bus_glue(ob, mkey, hooks):
    """Assembler source (bytes) of one package's bus glue: one global routine per hook."""
    parts = ['| generated by %s from octabam %s: %s on core-ot\'s hook bus\n        .text\n'
             % (GENERATOR, ob.commit, mkey)]
    for h in hooks:
        parts.append('\n| %s: octabam\'s %s (its hook at 0x%08x is left stock)\n        .globl  %s\n'
                     % (h['event'], h['entry'], h['site'], h['sym']))
        if h['kind'] == 'call':
            parts.append(h['sym'] + ':\n' + ('        jsr     %s\n' % h['entry']) * h['times'] + '        rts\n')
        elif h['kind'] == 'stub':
            into = h['entry'] + ('+%d' % h['skip'] if h['skip'] else '')
            drop = '        addq.l  #%d, %%sp\n' % h['pops'] if h['pops'] else ''
            parts.append('%s:\n%s        jmp     %s\n        .globl  %s\n%s:                  | its continuation, here\n'
                         '%s%s' % (h['sym'], _SAVE, into, h['ret'], h['ret'], drop, _RESTORE))
        else:
            parts.append(_CC_GLUE % h)
    return ''.join(parts).encode()


INCLUDE = re.compile(rb'^\s*\.include\s+"([^"]+)"', re.M)


def _collect(ob, rel, files, pool, seen):
    """`rel` and, depth first, every file it .includes (not the per-package remix.inc) -> their repo paths.
    Each file's text goes into `files` once; with `pool` its arena-base literal is named `arena_base`."""
    if rel in seen:
        return []
    seen.add(rel)
    path = os.path.join(ob.root, *rel.split('/'))
    if not os.path.isfile(path):
        raise Refused('its source %s is not in the checkout' % rel)
    with open(path, 'rb') as fh:
        text = fh.read()
    if re.search(rb'^\s*\.incbin\b', text, re.M):
        raise Refused('%s includes binary data (.incbin)' % rel)
    if pool:
        text = re.sub(rb'(?i)\b0x40a955e0\b', b'arena_base', text)
    files.setdefault(rel, text)
    order = [rel]
    for name in INCLUDE.findall(text):
        if name != b'remix.inc':
            order += _collect(ob, name.decode(), files, pool, seen)
    return order


class _Plan:
    """convert()'s working state for one package."""

    def __init__(self, ob, name, image, dev, bus, intercepts):
        self.ob, self.name, self.image, self.dev = ob, name, image, dev
        self.bus, self.intercepts = bus, intercepts
        self.notes, self.sites, self.sources, self.files = [], [], [], {}
        self.defsym, self.caves, self.tables, self.names, self.fixed = {}, [], [], [], []
        self.relocs = {}                    # relocatable data's address -> its served copy
        self.hooks, self.rewritten, self.took = [], {}, []

    def stock(self, addr, n):
        return _stock(self.image, self.dev, addr, n)

    def site(self, addr, stock, **fields):
        for lo, hi, what in self.dev.protected:
            if addr < hi and lo < addr + len(stock):
                raise Refused('it writes 0x%08x-0x%08x, inside %s (0x%08x-0x%08x), which %s protects'
                              % (addr, addr + len(stock), what, lo, hi, PROTECTOR))
        entry = {'addr': '0x%08x' % addr, 'stock': stock.hex()}
        entry.update(fields)
        self.sites.append(entry)

    def place(self, what, at):
        if not any(lo <= at < hi for lo, hi in self.dev.image_free):
            raise Refused('%s is pinned at 0x%08x, outside the free areas of the %s image' % (what, at, self.dev.name))

    def bus_hook(self, module, spec, at, length, entry, expect=None, **extra):
        h = dict(spec, module=module, site=at, len=length, entry=entry, expect=expect,
                 sym='ob_%s_bus_%d' % (_slug(self.name), len(self.hooks)))
        h['ret'], h['flag'], h['name'] = h['sym'] + '_ret', h['sym'] + '_passed', spec.get('next')
        h['next'] = h['sym'] + '_next' if spec['kind'] == 'cc' else None
        h['skip'] = len(expect) if spec.get('skip') else 0
        h.update(extra)
        self.hooks.append(h)
        self.notes.append('its hook at 0x%08x (%s) is served by core-ot\'s hook bus: %s, through the glue %s; the '
                          'site is left stock' % (at, entry, spec['event'], h['sym']))
        return h

    def rewrite(self, sources, spec, h):
        """Point the stub's one continuation in its source at the glue's return label."""
        pattern, cont = spec['rewrite']
        pattern = pattern.encode()
        hits = {f: len(re.findall(pattern, self.files[f], re.M | re.I)) for f in sources}
        hit = [f for f in sources if hits[f]]
        count = sum(hits[f] for f in hit)
        if count != 1:
            raise Refused('the continuation of %s (0x%08x) is in %d places of its source, not one: the bus glue '
                          'cannot return from it' % (h['entry'], cont, count))
        f = hit[0]
        record = self.rewritten.setdefault(f, {'before': self.files[f], 'conts': []})
        self.files[f] = re.sub(pattern, lambda mo: mo.group(1) + h['ret'].encode(), self.files[f], flags=re.M | re.I)
        record['conts'].append((cont, h['ret']))


def _emit_floating(plan, n, m, c, sym, glue):
    """A floating cave's emit() pokes, run at two addresses: each poke's word that moves with the cave is a site
    against its label; a poke the bus serves becomes a hook instead."""
    ob = plan.ob
    (b1, p1), (b2, p2) = [ob.call(c.emit, at) for at in EMIT_AT]
    if b1 or b2:
        raise Refused('the cave "%s" emits hand-assembled bytes (octabam\'s legacy path)' % c.label)
    differs = Refused('the cave "%s" emits different pokes at different addresses' % c.label)
    if len(p1) != len(p2):
        raise differs
    for (pa, exp, w1), (pa2, exp2, w2) in zip(p1, p2):
        if (pa, exp) != (pa2, exp2) or len(w1) != len(w2):
            raise differs
        if plan.stock(pa, len(exp)) != exp:
            raise Refused('the poke at 0x%08x is not stock' % pa)
        spec = BUS.get((pa, m.key)) if plan.bus else None
        if spec is not None and spec['kind'] == 'cc':
            if dict(c.defsyms).get(spec['next']) != spec['stock'] or _u32(exp, 0) != spec['stock']:
                raise Refused('the dispatch poke at 0x%08x is not the one the bus glue was written for' % pa)
            if not c.source:
                raise Refused('the cave "%s" has no source for the bus glue to call' % c.label)
            h = plan.bus_hook(n, spec, pa, len(w1), sym)
            plan.defsym.pop(spec['next'], None)      # the glue's label takes the manifest's value's place
            plan.notes[:] = [x for x in plan.notes if not x.startswith(spec['next'] + ' = ')]
            plan.files[glue] = plan.files[glue].replace(
                b'        .include', ('        .set    %s, %s\n        .include' % (spec['next'], h['next'])).encode(), 1)
            continue
        stock = plan.stock(pa, len(w1))
        if w1 == w2:
            plan.site(pa, stock, op='bytes', new=w1.hex())
            continue
        moving = [i for i in range(0, len(w1) - 3, 2)
                  if w1[:i] == w2[:i] and w1[i + 4:] == w2[i + 4:]
                  and _u32(w1, i) - EMIT_AT[0] == _u32(w2, i) - EMIT_AT[1]]
        if moving:
            i = moving[0]
            addend = _u32(w1, i) - EMIT_AT[0]
            if i == 0 and len(w1) == 4:
                plan.site(pa, stock, op='ptr', target=sym, addend=addend)
                continue
            if i == 2 and w1[:2] in OPS.values() and w1[6:] == NOP * ((len(w1) - 6) // 2):
                plan.site(pa, stock, op='jsr' if w1[:2] == OPS['jsr'] else 'jmp', target=sym, addend=addend)
                continue
            if i == 2 and len(w1) == 6 and w1[:2] == stock[:2]:
                plan.site(pa, stock, op='keep2', target=sym, addend=addend)
                continue
        raise Refused('the cave "%s" emits a poke at 0x%08x that %s cannot express (%s)'
                      % (c.label, pa, PROTECTOR, w1.hex()))


def _caves(plan, n, m, ms):
    ob = plan.ob
    for c in m.cf_patches:
        sym = 'ob_%s_%s' % (ms, _slug(c.label))
        glue = None
        if not c.source:                    # no code of its own: its pokes only
            sym = None
        elif c.cave_addr is not None:
            plan.place('its cave "%s"' % c.label, c.cave_addr)
            plan.fixed.append({'source': c.source, 'addr': '0x%08x' % c.cave_addr, 'symbol': sym})
        else:
            glue = 'glue/%s.s' % sym
            plan.files[glue] = ('| generated by %s from octabam %s: %s, "%s"\n        .text\n        .globl  %s\n'
                                '%s:\n        .include "%s"\n'
                                % (GENERATOR, ob.commit, m.key, c.label, sym, sym, c.source)).encode()
            plan.sources.append(glue)
        for dn, value in c.defsyms:
            if plan.defsym.get(dn, value) != value:
                raise Refused('two caves give %s different values' % dn)
            plan.defsym[dn] = value
            plan.notes.append('%s = 0x%08x, the manifest\'s value (octabam may link another module\'s symbol there)'
                              % (dn, value))
        if c.hook_addr is not None:
            if plan.stock(c.hook_addr, len(c.hook_stock)) != c.hook_stock:
                raise Refused('the hook site 0x%08x of "%s" is not stock' % (c.hook_addr, c.label))
            plan.site(c.hook_addr, c.hook_stock, op='jsr', target=sym)
        if c.emit is not None and c.cave_addr is not None:
            code, pokes = ob.call(c.emit, c.cave_addr)
            if code:
                raise Refused('the cave "%s" emits hand-assembled bytes (octabam\'s legacy path)' % c.label)
            for pa, exp, w in pokes:
                if plan.stock(pa, len(exp)) != exp:
                    raise Refused('the poke at 0x%08x is not stock' % pa)
                plan.site(pa, plan.stock(pa, len(w)), op='bytes', new=w.hex())
        elif c.emit is not None:
            _emit_floating(plan, n, m, c, sym, glue)
        plan.caves.append({'module': n, 'label': c.label, 'sym': sym})


def _units(plan, names_, n, m, ms, remix, closure, conflicts, included):
    ob = plan.ob
    for u in m.linked:
        if not u.dram and u.cave_addr is not None:
            plan.place('its unit "%s"' % u.label, u.cave_addr)
            plan.fixed.append({'source': u.source, 'addr': '0x%08x' % u.cave_addr})
        else:
            plan.sources.append(u.source)
        if u.include is None:
            continue
        try:
            text = ob.call(u.include, remix)
        except Exception as e:              # the manifest's own code: any failure refuses
            raise Refused('the generated include of "%s" needs more than this mod carries (%s)' % (u.label, e))
        inc = 'glue/%s_%s.inc' % (ms, _slug(u.label))
        plan.files[inc] = text.encode()
        for f in closure[u.source]:
            if b'"remix.inc"' in plan.files[f]:
                if included.get(f, inc) != inc:
                    raise Refused('%s is shared by two units with different generated includes' % f)
                included[f] = inc
                plan.files[f] = plan.files[f].replace(b'"remix.inc"', ('"%s"' % inc).encode())
        refusing, converting = [], []
        for n2, m2 in ob.modules.items():
            if n2 in names_ or m2.key in remix:
                continue
            try:
                changed = ob.call(u.include, dict(remix, **{m2.key: m2})) != text
            except Exception:
                changed = True
            if changed:
                (converting if ob.convertible(n2) else refusing).append(n2)
        if refusing:
            plan.notes.append('"%s": its generated include would change with %s, which do not convert; it is built '
                              'as for a remix without them' % (u.label, ', '.join(refusing)))
        for n2 in converting:
            if mod_id(n2) not in conflicts:
                conflicts.append(mod_id(n2))
        if converting:
            plan.notes.append('"%s": its generated include changes with %s, so it conflicts with them'
                              % (u.label, ', '.join(converting)))


def _detours(plan, n, m, skip, labels, closure):
    for d in m.detours:
        if (d.site, m.key) in skip:
            continue                        # a bridge in this package stands in for it
        if d.target is None and d.unit not in labels:
            raise Refused('a detour at 0x%08x names unit %s of another module' % (d.site, d.unit))
        if plan.stock(d.site, len(d.expect)) != d.expect:
            raise Refused('the detour site 0x%08x is not stock' % d.site)
        taken = INTERCEPTS.get(d.site) if plan.intercepts else None
        if taken is not None:
            event, kind, length = taken
            if d.target is not None or d.kind != kind or (d.pad_to or 6) != length:
                raise Refused('the detour at 0x%08x is not the %s %d-byte one %s intercepts'
                              % (d.site, kind, length, event))
            plan.took.append({'module': n, 'site': d.site, 'len': length, 'event': event, 'kind': kind,
                              'entry': d.symbol})
            plan.notes.append('its detour at 0x%08x (%s) is left stock: its record in %s, an intercept, gets the '
                              'call' % (d.site, d.symbol, event))
            continue
        spec = BUS.get((d.site, d.symbol)) if plan.bus else None
        if spec is not None:
            if d.target is not None or d.kind not in ('jmp', 'jsr') or d.pad_to:
                raise Refused('the detour at 0x%08x is not the one the bus glue was written for' % d.site)
            h = plan.bus_hook(n, spec, d.site, 6, spec.get('entry', d.symbol), d.expect)
            if spec['kind'] == 'stub':
                own = [x for x in m.linked if x.label == d.unit]
                if len(own) != 1:
                    raise Refused('the detour at 0x%08x names no unit of its own' % d.site)
                plan.rewrite(closure[own[0].source], spec, h)
            continue
        length = d.pad_to or 6
        if d.kind == 'lea':
            if length != 6 or d.target is not None:
                raise Refused('a lea detour at 0x%08x that is not six bytes' % d.site)
            plan.site(d.site, plan.stock(d.site, 6), op='keep2', target=d.symbol)
            continue
        whole = _boundary(plan.image, d.site, length, plan.dev)
        if whole != length:
            if d.kind != 'jmp':
                raise Refused('the jsr detour at 0x%08x ends inside an instruction' % d.site)
            plan.notes.append('the jmp at 0x%08x is nop-padded to the next instruction (%d bytes, not %d)'
                              % (d.site, whole, length))
            length = whole
        stock = plan.stock(d.site, length)
        if d.target is not None:
            new = OPS[d.kind] + d.target.to_bytes(4, 'big') + NOP * ((length - 6) // 2)
            plan.site(d.site, stock, op='bytes', new=new.hex(), kind='code')
        else:
            plan.site(d.site, stock, op=d.kind, target=d.symbol)


def _refs_tables_pokes(plan, n, m, ms, labels):
    ob = plan.ob
    for r in m.symbol_refs:
        if r.unit not in labels:
            raise Refused('a symbol ref at 0x%08x names unit %s of another module' % (r.addr, r.unit))
        stock = r.expect.to_bytes(4, 'big')
        if plan.stock(r.addr, 4) != stock:
            raise Refused('the symbol ref at 0x%08x is not stock' % r.addr)
        plan.site(r.addr, stock, op='ptr', target=r.symbol, addend=r.addend)

    for t in m.tables:
        for unit, _sym in t.symbols:
            if unit not in labels:
                raise Refused('table %s names unit %s of another module' % (t.label, unit))
        sym = 'ob_%s_%s' % (ms, _slug(t.label))
        old = plan.stock(t.old, 4 * t.count)
        body = ''.join('        .long   0x%08x\n' % _u32(old, 4 * i) for i in range(t.count))
        body += ''.join('        .long   %s\n' % s for _unit, s in t.symbols)
        glue = 'glue/%s.s' % sym
        plan.files[glue] = ('| generated by %s from octabam %s: %s, table "%s"\n        .text\n        .balign 4\n'
                            '        .globl  %s\n%s:\n%s' % (GENERATOR, ob.commit, m.key, t.label, sym, sym, body)).encode()
        plan.sources.append(glue)
        for at, value in t.refs:
            stock = value.to_bytes(4, 'big')
            if plan.stock(at, 4) != stock:
                raise Refused('the table ref at 0x%08x is not stock' % at)
            plan.site(at, stock, op='ptr', target=sym)
        plan.tables.append({'module': n, 'label': t.label, 'sym': sym})

    for p in m.pokes:
        if plan.stock(p.addr, len(p.expect)) != p.expect:
            raise Refused('the poke at 0x%08x is not stock' % p.addr)
        data = _relocatable(plan.dev, p.addr, len(p.write))
        if data is None:
            plan.site(p.addr, plan.stock(p.addr, len(p.write)), op='bytes', new=p.write.hex())
            continue
        # protected data: a copy with the poke applied is served instead, the image keeps its bytes
        copy = plan.relocs.setdefault(data[0], {'data': data, 'pokes': [],
                                                'bytes': bytearray(plan.stock(data[0], data[1]))})
        for q, qw in copy['pokes']:
            if q < p.addr + len(p.write) and p.addr < q + len(qw):
                raise Refused('two pokes write %s at 0x%08x and 0x%08x' % (data[3], q, p.addr))
        at = p.addr - data[0]
        copy['bytes'][at:at + len(p.write)] = p.write
        copy['pokes'].append((p.addr, p.write))

    if m.claims is not None:
        # one name per 16-byte block, so overlapping claims share a name
        for kind, spans in (('part-window', m.claims.part_window), ('sram', m.claims.sram)):
            for a, n_, _what in spans:
                plan.names += ['octabam:%s@0x%x' % (kind, b) for b in range(a & ~15, a + n_, 16)]


def _copies(plan):
    """The served copies of poked relocatable data: a glue source each, and a ptr site at each reference."""
    for lo, r in sorted(plan.relocs.items()):
        _lo, n, refs, what = r['data']
        sym = 'ob_%s_copy_%08x' % (_slug(plan.name), lo)
        at = ', '.join('0x%08x' % a for a, _w in r['pokes'])
        plan.files['glue/%s.s' % sym] = (
            '| generated by %s from octabam %s: %s (0x%08x, %d bytes, in a\n'
            '| range the base protects), served from here with the poke(s) at %s applied\n'
            '        .text\n'
            '        .balign 32                      | inside one 4 KB page, for the USB DMA\n'
            '        .globl  %s\n%s:\n        .byte   %s\n'
            % (GENERATOR, plan.ob.commit, what, lo, n, at, sym, sym, ', '.join('0x%02x' % b for b in r['bytes']))
        ).encode()
        plan.sources.append('glue/%s.s' % sym)
        for ref in refs:
            stock = lo.to_bytes(4, 'big')
            if plan.stock(ref, 4) != stock:
                raise Refused('the reference to %s at 0x%08x is not stock' % (what, ref))
            plan.site(ref, stock, op='ptr', target=sym)
        plan.notes.append('the poke(s) at %s change %s, which lies inside a range %s protects: the mod serves its '
                          'own copy of it (%s), with them applied, through %s, and leaves the protected bytes stock'
                          % (at, what, PROTECTOR, sym, ', '.join('0x%08x' % a for a in refs)))


def convert(ob, name, image, dev, rx=None, bus=False, intercepts=False):
    """Module `name` (with the modules its bridges stand in for) -> a plan: {'id', 'name', 'members', 'json' (the
    mod.json), 'files' ({relpath: bytes}), 'caves', 'tables', 'skip', 'notes', 'doc', 'relocs', 'remix',
    'remix_sites', 'bus', 'bus_sources', 'dsp_bus', 'intercepts'}. Raises Refused.

    `bus`: hooks in BUS subscribe to the core's events through generated glue. `intercepts`: detours at INTERCEPTS
    sites become records in those events' tables."""
    if rx is not None:
        raise NotImplementedError('remixes do not convert here')
    why = refusal(ob, name)
    if why:
        raise Refused(why)
    mid, names_ = mod_id(name), members(ob, name)
    mods = [ob.modules[n] for n in names_]
    remix = {mm.key: mm for mm in mods}
    skip = {(o.site, o.module) for mm in mods for o in mm.overrides}     # detours a bridge stands in for
    labels = {u.label for mm in mods for u in mm.linked}
    plan = _Plan(ob, name, image, dev, bus, intercepts)
    conflicts = [mod_id(n) for n in names_[1:]]
    requires = ['core']
    if names_[1:]:
        plan.notes.append('it carries %s, whose hooks it stands in for (octabam\'s bridge), so it takes their place'
                          % ', '.join(names_[1:]))

    included = {}                           # a source file -> the generated include it now names
    for n, m in zip(names_, mods):
        ms = _slug(n)
        pool = any(c.pool_base_literals for c in m.cf_patches)
        closure = {src: _collect(ob, src, plan.files, pool, set())
                   for src in [c.source for c in m.cf_patches if c.source] + [u.source for u in m.linked]}
        for key in m.requires:
            if ob.by_key[key] not in names_ and mod_id(ob.by_key[key]) not in requires:
                requires.append(mod_id(ob.by_key[key]))
        _caves(plan, n, m, ms)
        _units(plan, names_, n, m, ms, remix, closure, conflicts, included)
        _detours(plan, n, m, skip, labels, closure)
        _refs_tables_pokes(plan, n, m, ms, labels)
    _copies(plan)

    hooks = plan.hooks
    if plan.names:
        plan.notes.append('its claims are named resources, one per 16-byte block: a mod that claims any of the same '
                          'blocks is refused beside it')
    if hooks:
        glue = 'glue/ob_%s_bus.s' % _slug(name)
        plan.files[glue] = _bus_glue(ob, ', '.join(mm.key for mm in mods), hooks)
        plan.sources.append(glue)
        plan.notes.append('it subscribes to core-ot\'s hook bus, so it needs the Octatrack core 0.2 or newer')
        for f, r in sorted(plan.rewritten.items()):
            plan.notes.append('%s: the stub\'s jump back to %s goes to the bus glue instead (%s); nothing else in '
                              'the source changes' % (f, ', '.join('0x%08x' % c for c, _r in r['conts']),
                                                      ', '.join(ret for _c, ret in r['conts'])))

    m = mods[0]
    carried = [mm.key for mm in mods[1:]]
    title = m.key + (' (with %s)' % ', '.join(carried) if carried else '')
    desc = '%s (octabam module %s%s, converted from %s)' % (
        m.doc, name, ''.join(', with ' + n for n in names_[1:]), ob.commit)
    if hooks:
        desc += ' It runs on the Octatrack core\'s hook bus: it needs core 0.2 or newer.'
    if plan.took:
        desc += (' Its places in the firmware come to it through the intercepts companion, so it combines with '
                 'other mods that use them.')
        requires.append('intercepts')
    doc = {
        'id': mid,
        'version': ob.commit + ('-bus' if hooks else '') + ('-intercepts' if plan.took else ''),
        'title': title,
        'description': desc,
        'category': category(m),
        'author': ', '.join(dict.fromkeys(mm.author for mm in mods if mm.author)),
        'license': 'MIT', 'device': DEVICE, 'os': '1.40C',
        'sources': plan.sources,
        'sites': plan.sites,
        'requires': requires,
    }
    if plan.fixed:
        doc['fixed'] = plan.fixed
    if plan.defsym:
        doc['defsym'] = {k: '0x%08x' % v for k, v in plan.defsym.items()}
    if hooks:
        doc['subscribe'] = [{'event': h['event'], 'fn': h['sym'], 'order': BUS_ORDER} for h in hooks]
    if plan.took:                           # {claims 0, entry}: it intercepts every call
        doc['contribute'] = [{'to': t['event'], 'order': INTERCEPT_ORDER, 'data': '00' * 8,
                              'relocs': [[4, 'abs32', 'sym:' + t['entry'], 0]]} for t in plan.took]
    if plan.names:
        doc['resources'] = {'names': plan.names}
    if conflicts:
        doc['conflicts'] = conflicts
    return {'id': mid, 'name': name, 'members': names_, 'json': doc, 'files': plan.files,
            'caves': plan.caves, 'tables': plan.tables, 'skip': skip, 'notes': plan.notes, 'doc': m.doc,
            'relocs': [{'sym': 'ob_%s_copy_%08x' % (_slug(name), lo), 'data': r['data'],
                        'bytes': bytes(r['bytes']), 'pokes': r['pokes']} for lo, r in sorted(plan.relocs.items())],
            'remix': None, 'remix_sites': [],
            'bus': hooks, 'bus_sources': plan.rewritten, 'dsp_bus': [], 'intercepts': plan.took}


def write(ob, plan, out):
    """Lay the plan out as a package folder under `out` (replacing one already there) -> its path."""
    folder = os.path.join(out, plan['id'])
    if os.path.isdir(folder):
        shutil.rmtree(folder)
    os.makedirs(folder)
    for rel, data in plan['files'].items():
        path = os.path.join(folder, *rel.split('/'))
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'wb') as fh:
            fh.write(data)
    with open(os.path.join(folder, 'mod.json'), 'w', newline='\n') as fh:
        json.dump(plan['json'], fh, indent=1)
        fh.write('\n')
    licence = os.path.join(ob.root, 'LICENSE')
    if os.path.isfile(licence):
        shutil.copyfile(licence, os.path.join(folder, 'LICENSE.octabam'))
    mods = [ob.modules[n] for n in plan['members']]
    pooled = any(c.pool_base_literals for m in mods for c in m.cf_patches)
    with open(os.path.join(folder, 'README.md'), 'w', newline='\n') as fh:
        fh.write('# %s\n\n%s\n\nConverted by %s from sambanks/octabam %s, %s (MIT, LICENSE.octabam). The sources are '
                 'octabam\'s%s; glue/ is generated.\n'
                 % (plan['json']['title'], plan.get('doc', mods[0].doc), PROTECTOR, ob.commit,
                    ', '.join('modules/' + n for n in plan['members']),
                    ', with the arena-base literal named `arena_base`' if pooled else ''))
        if plan['notes']:
            fh.write('\nNotes:\n' + ''.join('- %s\n' % n for n in plan['notes']))
    return folder


# ---- the check ------------------------------------------------------------------------------------------------------

def _tool(dev, name):
    return os.environ.get('ELEKLOADER_CROSS', dev.toolchain['prefix']) + name


def _gnu(dev, work, cmd, cwd=None):
    """Run a cross binutils tool -> its stdout; CheckError with its output when it fails."""
    r = subprocess.run([_tool(dev, cmd[0])] + [str(x) for x in cmd[1:]], cwd=cwd, capture_output=True, text=True)
    if r.returncode:
        raise CheckError('%s failed\n%s%s' % (' '.join(str(x) for x in cmd), r.stdout, r.stderr))
    return r.stdout


def _gnu_link(dev, root, src, at, cpu, defsyms, work, sections=('.text',), lookup=None):
    """`src` (relative to `root`) assembled and linked at `at` -> the bytes of `sections` (all when empty). A symbol
    left undefined takes `lookup(name)` when that knows it."""
    os.makedirs(work, exist_ok=True)
    obj, elf, raw = [os.path.join(work, x) for x in ('u.o', 'u.elf', 'u.bin')]
    _gnu(dev, work, ['as', '-mcpu=%s' % cpu, '-o', obj, src], cwd=root)
    defs = dict(defsyms)
    if lookup is not None:
        for line in _gnu(dev, work, ['nm', '-u', obj]).splitlines():
            sym = line.split()[-1] if line.split() else ''
            if sym and sym not in defs and lookup(sym) is not None:
                defs[sym] = lookup(sym)
    _gnu(dev, work, ['ld', '-Ttext=0x%x' % at] + ['--defsym=%s=0x%x' % kv for kv in defs.items()] + ['-o', elf, obj])
    _gnu(dev, work, ['objcopy', '-O', 'binary'] + [x for s in sections for x in ('-j', s)] + [elf, raw])
    with open(raw, 'rb') as fh:
        return fh.read()


class _Linked:
    """Readers over a linked image: the RAM reserve, the OS image, and the package's symbols."""

    def __init__(self, ln, dev, mid):
        self.ln, self.dev, self.mid = ln, dev, mid
        self.run_off = ln.layout['run_load'] - dev.main_load
        self.ddr0 = ln.layout['ddr'][0]

    def ram(self, a, n):
        at = self.run_off + a - self.ddr0
        return self.ln.image[at:at + n]

    def img(self, a, n):
        at = a - self.dev.main_load
        return self.ln.image[at:at + n]

    def mem(self, a, n):                    # the reserve, or the image for fixed code
        return self.ram(a, n) if self.dev.ddr[0] <= a < self.dev.ddr[1] else self.img(a, n)

    def sym(self, name):
        key = '%s:%s' % (self.mid, name)
        if key not in self.ln.map:
            raise CheckError('%s is not in the link map' % name)
        return self.ln.map[key]

    def known(self, name):                  # the package's own symbol, else an export of another
        return self.ln.map.get('%s:%s' % (self.mid, name), self.ln.map.get(name))


def _check_caves(ob, plan, L, image, dev, work, mn, m, busy, lines):
    base = L.ln.map['arena_base']
    own = [c for c in plan['caves'] if c['module'] == mn]
    for i, c in enumerate(m.cf_patches):
        if not c.source:
            pokes = ob.call(c.emit, c.cave_addr)[1] if c.emit else ()
            for pa, _exp, w in pokes:
                if L.img(pa, len(w)) != w:
                    raise CheckError('"%s": the poke at 0x%08x' % (c.label, pa))
            lines.append('"%s": %d pokes, as octabam writes them' % (c.label, len(pokes)))
            continue
        a = L.sym(own[i]['sym'])
        if c.cave_addr is not None and a != c.cave_addr:
            raise CheckError('"%s" is at 0x%08x, not at 0x%08x' % (c.label, a, c.cave_addr))
        built = _gnu_link(dev, ob.root, c.source, a, c.cpu, c.defsyms,
                          os.path.join(work, 'cave_%s_%d' % (_slug(mn), i)), lookup=L.known)
        if c.reference is not None:
            ref = ob.call(c.reference, a)
        elif c.emit is None:
            ref = c.pinned
        else:
            ref = ob.call(c.emit, a)[0]
        if ref and built != ref:
            raise CheckError('"%s": its source at 0x%08x no longer matches the bytes the manifest ratifies'
                             % (c.label, a))
        want = bytearray(built)
        for h in plan.get('bus', ()):       # its "not mine" exit, moved to the bus glue
            if h['kind'] == 'cc' and h['entry'] == own[i]['sym']:
                jumps = [o for o in range(0, len(built) - 5, 2)
                         if built[o:o + 2] in OPS.values() and _u32(built, o + 2) == h['stock']]
                if not jumps:
                    raise CheckError('"%s": no jump to %s (0x%08x) for the bus glue to take'
                                     % (c.label, h['name'], h['stock']))
                for o in jumps:
                    want[o + 2:o + 6] = L.sym(h['next']).to_bytes(4, 'big')
        hits = [o for o in range(0, len(built) - 3, 2) if _u32(built, o) == ARENA_STOCK_BASE]
        if len(hits) != c.pool_base_literals:
            raise CheckError('"%s": %d arena-base literals, the manifest declares %d'
                             % (c.label, len(hits), c.pool_base_literals))
        for o in hits:
            want[o:o + 4] = base.to_bytes(4, 'big')
        if L.mem(a, len(want)) != bytes(want):
            raise CheckError('"%s" at 0x%08x differs from octabam\'s link at that address' % (c.label, a))
        if c.hook_addr is not None:
            n = len(c.hook_stock)
            if L.img(c.hook_addr, n) != OPS['jsr'] + a.to_bytes(4, 'big') + NOP * ((n - 6) // 2):
                raise CheckError('"%s": the hook at 0x%08x' % (c.label, c.hook_addr))
        if c.emit is not None:
            for pa, _exp, w in ob.call(c.emit, a)[1]:
                if pa not in busy and L.img(pa, len(w)) != w:
                    raise CheckError('"%s": the poke at 0x%08x' % (c.label, pa))
        lines.append('cave "%s": %d bytes at 0x%08x, as octabam links it%s%s'
                     % (c.label, len(built), a, ' and as ratified' if ref else '',
                        ', %d arena-base literal(s) moved' % len(hits) if hits else ''))


def _check_writes(plan, L, image, dev, mn, m, busy, lines):
    dets = [d for d in m.detours if (d.site, m.key) not in plan['skip'] and d.site not in busy]
    for d in dets:
        target = d.target if d.target is not None else L.sym(d.symbol)
        n = d.pad_to or 6
        op = OPS.get(d.kind) or d.expect[:2]
        if L.img(d.site, n) != op + target.to_bytes(4, 'big') + NOP * ((n - 6) // 2):
            raise CheckError('the detour at 0x%08x' % d.site)
        extra = _boundary(image, d.site, n, dev) - n if d.kind == 'jmp' else 0
        if L.img(d.site + n, extra) != NOP * (extra // 2):
            raise CheckError('the padding after the detour at 0x%08x' % d.site)
    for r in m.symbol_refs:
        if _u32(L.img(r.addr, 4), 0) != L.sym(r.symbol) + r.addend:
            raise CheckError('the symbol ref at 0x%08x' % r.addr)
    own = [t for t in plan['tables'] if t['module'] == mn]
    for i, t in enumerate(m.tables):
        at = L.sym(own[i]['sym'])
        want = b''.join(_u32(image, t.old - dev.main_load + 4 * k).to_bytes(4, 'big') for k in range(t.count))
        want += b''.join(L.sym(s).to_bytes(4, 'big') for _unit, s in t.symbols)
        if L.ram(at, len(want)) != want:
            raise CheckError('table %s' % t.label)
        for ra, _v in t.refs:
            if _u32(L.img(ra, 4), 0) != at:
                raise CheckError('table %s: the ref at 0x%08x' % (t.label, ra))
    moved = {a for r in plan['relocs'] for a, _w in r['pokes']}
    for p in m.pokes:
        if p.addr not in moved and L.img(p.addr, len(p.write)) != p.write:
            raise CheckError('the poke at 0x%08x' % p.addr)
    if m.detours or m.symbol_refs or m.tables or m.pokes:
        into_copy = sum(p.addr in moved for p in m.pokes)
        stood = sum((d.site, m.key) in plan['skip'] for d in m.detours)
        onbus = sum(d.site in busy for d in m.detours)
        lines.append('%s: %d detours, %d symbol refs, %d tables, %d pokes: as octabam writes them%s%s%s'
                     % (mn, len(dets), len(m.symbol_refs), len(m.tables), len(m.pokes) - into_copy,
                        ' (%d stood in for)' % stood if stood else '',
                        ' (%d on the bus or intercepted, below)' % onbus if onbus else '',
                        '; %d poke(s) into a served copy (below)' % into_copy if into_copy else ''))


def _check_units(ob, dev, work, mdir, m, lines):
    for u in m.linked:
        if not u.dram and u.cpu != '54455':
            # a unit placed in the image is assembled for u.cpu by octabam and for the chip by sdk.build
            ws = os.path.join(work, 'isa_' + _slug(u.label))
            os.makedirs(ws, exist_ok=True)
            got = {}
            for cpu in (u.cpu, '54455'):
                obj = os.path.join(ws, cpu + '.o')
                _gnu(dev, ws, ['as', '-mcpu=%s' % cpu, '-o', obj, u.source], cwd=mdir)
                for sec in ('.text', '.data'):
                    raw = os.path.join(ws, cpu + sec + '.bin')
                    _gnu(dev, ws, ['objcopy', '-O', 'binary', '-j', sec, obj, raw])
                    with open(raw, 'rb') as fh:
                        got[(cpu, sec)] = fh.read()
            if any(got[(u.cpu, s)] != got[('54455', s)] for s in ('.text', '.data')):
                raise CheckError('unit "%s" assembles differently for %s and for the chip (54455)' % (u.label, u.cpu))
            lines.append('unit "%s": the same bytes for %s as for the chip' % (u.label, u.cpu))
        if u.reference is None:
            continue
        at, digest = u.reference
        built = _gnu_link(dev, mdir, u.source, at, '54455' if u.dram else u.cpu, (),
                          os.path.join(work, 'ref_' + _slug(u.label)), sections=())
        if elemod.sha(built) != digest:
            raise CheckError('unit "%s" linked alone at 0x%08x is sha256 %s..., not its author\'s %s...: the source '
                             'drifted, or these binutils encode it differently (octabam\'s own build refuses it the '
                             'same way)' % (u.label, at, elemod.sha(built)[:16], digest[:16]))
        lines.append('unit "%s": its source links to the author\'s reference' % u.label)


def _check_intercepts(plan, L, lines):
    ln = L.ln
    for t in plan.get('intercepts', ()):
        stub = ln.map.get('intercepts:intercept_' + t['event'], ln.map.get('intercept_' + t['event']))
        if stub is None:
            raise CheckError('intercept_%s is not linked: the intercepts are not given' % t['event'])
        want = OPS[t['kind']] + stub.to_bytes(4, 'big') + NOP * ((t['len'] - 6) // 2)
        if L.img(t['site'], t['len']) != want:
            raise CheckError('the site 0x%08x is not %s\'s %s to its stub' % (t['site'], t['event'], t['kind']))
        if t['event'] not in ln.tables:
            raise CheckError('%s is not linked' % t['event'])
        at, n, _w = ln.tables[t['event']]
        table = L.ram(at, 8 * n)
        records = [(_u32(table, 8 * k), _u32(table, 8 * k + 4)) for k in range(n)]
        if (0, L.sym(t['entry'])) not in records:
            raise CheckError('%s does not hold the record {0, %s}' % (t['event'], t['entry']))
        lines.append('0x%08x (%s): the site is %s\'s %s; its record {0, %s} intercepts every call'
                     % (t['site'], t['entry'], t['event'], t['kind'], t['entry']))


def _check_bus(plan, L, image, dev, work, mdir, lines):
    ln = L.ln
    for h in plan.get('bus', ()):
        if L.img(h['site'], h['len']) != _stock(image, dev, h['site'], h['len']):
            raise CheckError('the hook at 0x%08x is not stock, though the bus serves it' % h['site'])
        if h['event'] not in ln.tables:
            raise CheckError('%s is not linked: the core is older than 0.2' % h['event'])
        at, n, _w = ln.tables[h['event']]
        table = L.ram(at, 4 * n)
        if L.sym(h['sym']) not in [_u32(table, 4 * k) for k in range(n)]:
            raise CheckError('the glue %s is not in %s' % (h['sym'], h['event']))
        if h['skip'] and L.mem(L.sym(h['entry']), h['skip']) != h['expect']:
            raise CheckError('%s does not start with its replay of the instruction its hook displaced' % h['entry'])
        lines.append('0x%08x (%s): left stock; %s calls it through %s%s'
                     % (h['site'], h['entry'], h['event'], h['sym'],
                        ', past its replay (%d bytes)' % h['skip'] if h['skip'] else ''))
    # a rewritten source must assemble to the original's bytes but for its jumps back to the firmware
    for f, r in sorted(plan.get('bus_sources', {}).items()):
        ws = os.path.join(work, 'bus_' + _slug(f))
        if os.path.isdir(ws):
            shutil.rmtree(ws)
        shutil.copytree(mdir, os.path.join(ws, 'before'))
        with open(os.path.join(ws, 'before', *f.split('/')), 'wb') as fh:
            fh.write(r['before'])
        conts = {c for c, _ret in r['conts']}
        rets = {ret for _c, ret in r['conts']}
        got = {}
        for side, root in (('before', os.path.join(ws, 'before')), ('after', mdir)):
            obj = os.path.join(ws, side + '.o')
            _gnu(dev, ws, ['as', '-mcpu=54455', '-o', obj, f], cwd=root)
            for sec in ('.text', '.data'):
                raw = os.path.join(ws, side + sec + '.bin')
                _gnu(dev, ws, ['objcopy', '-O', 'binary', '-j', sec, obj, raw])
                with open(raw, 'rb') as fh:
                    got[(side, sec)] = fh.read()
            got[(side, 'relocs')] = {int(x.split()[0], 16): x.split()[-1]
                                     for x in _gnu(dev, ws, ['objdump', '-r', '-j', '.text', obj]).splitlines()
                                     if re.match(r'^[0-9a-f]{8} ', x)}
        jumps = set()
        for sec in ('.text', '.data'):
            before, after = got[('before', sec)], got[('after', sec)]
            if len(before) != len(after):
                raise CheckError('%s: the bus rewrite changes its %s\'s size' % (f, sec))
            for o in [o for o in range(len(before)) if before[o] != after[o]]:
                starts = [s for s in range(max(0, o - 3), o + 1)
                          if sec == '.text' and s % 2 == 0 and s + 4 <= len(before)
                          and _u32(before, s) in conts and _u32(after, s) == 0
                          and got[('after', 'relocs')].get(s) in rets]
                if not starts:
                    raise CheckError('%s: the bus rewrite changes byte %d of its %s, which is not a jump back to the '
                                     'firmware' % (f, o, sec))
                jumps.add(starts[0])
        found = {_u32(got[('before', '.text')], s) for s in jumps}
        if found != conts:
            raise CheckError('%s: its jumps back to %s are not all rewritten'
                             % (f, ', '.join('0x%08x' % c for c in sorted(conts - found))))
        lines.append('%s: assembles to its own bytes but for %d jump(s) back to %s, which reach the bus glue (%s)'
                     % (f, len(jumps), ', '.join('0x%08x' % c for c in sorted(conts)), ', '.join(sorted(rets))))


def _check_copies(plan, L, image, dev, lines):
    for r in plan['relocs']:
        lo, n, refs, what = r['data']
        want = bytearray(_stock(image, dev, lo, n))
        for a, w in r['pokes']:
            want[a - lo:a - lo + len(w)] = w
        a = L.sym(r['sym'])
        if bytes(want) != r['bytes'] or L.mem(a, n) != bytes(want):
            raise CheckError('the copy of %s at 0x%08x is not the stock bytes with octabam\'s pokes' % (what, a))
        if a // 4096 != (a + n - 1) // 4096:
            raise CheckError('the copy of %s at 0x%08x crosses a 4 KB page' % (what, a))
        for ref in refs:
            if _u32(L.img(ref, 4), 0) != a:
                raise CheckError('the reference to %s at 0x%08x' % (what, ref))
        if L.img(lo, n) != _stock(image, dev, lo, n):
            raise CheckError('%s at 0x%08x is not stock in the image' % (what, lo))
        lines.append('%s: served from 0x%08x with the poke(s) at %s applied, through %s; the protected original is '
                     'stock' % (what, a, ', '.join('0x%08x' % p for p, _w in r['pokes']),
                                ', '.join('0x%08x' % x for x in refs)))


def _check_whole(plan, L, mod, mod_path, dev, work, lines):
    """The package's .run and fixed code against GNU ld's link of the same object at the same addresses."""
    ln = L.ln
    obj = os.path.join(os.path.dirname(mod_path), plan['id'] + '.work', plan['id'] + '.o')
    lay = ln.layout['sections']
    run_at, bss_at = lay.get('%s .run' % plan['id']), lay.get('%s .bss' % plan['id'], 0)
    blocks = [('.fixed.%d' % k, int(f['addr'], 16)) for k, f in enumerate(plan['json'].get('fixed', []))]
    if run_at is not None:
        blocks.insert(0, ('.run', run_at))
    if not blocks or not os.path.exists(obj):
        return
    os.makedirs(work, exist_ok=True)
    script = os.path.join(work, 'check.ld')
    with open(script, 'w') as fh:
        fh.write('SECTIONS\n{\n' + ''.join('    %s 0x%x : { *(%s) }\n' % (n, a, n) for n, a in blocks)
                 + '    .bss 0x%x (NOLOAD) : { *(.bss) }\n}\n' % bss_at)
    undefined = {n: ln.map.get(n, ln.map.get('core_zero')) for n in mod.imports}
    elf = os.path.join(work, 'check.elf')
    _gnu(dev, work, ['ld', '-T', script] + ['--defsym=%s=0x%x' % kv for kv in sorted(undefined.items())]
         + ['-o', elf, obj])
    for n, a in blocks:
        raw = os.path.join(work, 'check%s.bin' % n)
        _gnu(dev, work, ['objcopy', '-O', 'binary', '-j', n, elf, raw])
        with open(raw, 'rb') as fh:
            linked = fh.read()
        if L.mem(a, len(linked)) != linked or (n == '.run' and len(linked) != mod.size('.run')):
            raise CheckError('%s differs from GNU ld\'s link of the same object' % n)
        lines.append('%s: %d bytes at 0x%08x, as GNU ld links them' % ('.run' if n == '.run' else 'fixed code',
                                                                     len(linked), a))


def check(ob, plan, mod_path, core_path, stock_path, work, dspbus_path=None, intercepts_path=None):
    """The built package linked with the core (and the intercepts, when its detours use them), proved against the
    module's own sources and manifest -> [lines]. Raises CheckError."""
    if plan.get('dsp_bus') or plan.get('remix'):
        raise NotImplementedError('remixes and the DSP bus are not checked here')
    st, dev, _rel = formats.load(stock_path)
    image = formats.main_image(st, dev)
    mod, core = elemod.load_any(mod_path), elemod.load_any(core_path)
    given = [core, mod]
    if plan.get('intercepts'):
        if not intercepts_path:
            raise CheckError('its places come to it through the intercepts, so the check needs them '
                             '(mods/intercepts-ot)')
        given.insert(1, elemod.load_any(intercepts_path))
    L = _Linked(link.link(given, image), dev, plan['id'])
    mdir = os.path.join(os.path.dirname(mod_path), plan['id'])
    lines = []
    busy = {h['site'] for h in plan.get('bus', ())} | {t['site'] for t in plan.get('intercepts', ())}
    for mn in plan['members']:
        m = ob.modules[mn]
        _check_caves(ob, plan, L, image, dev, work, mn, m, busy, lines)
        _check_writes(plan, L, image, dev, mn, m, busy, lines)
        _check_units(ob, dev, work, mdir, m, lines)
    _check_intercepts(plan, L, lines)
    _check_bus(plan, L, image, dev, work, mdir, lines)
    _check_copies(plan, L, image, dev, lines)
    _check_whole(plan, L, mod, mod_path, dev, work, lines)
    return lines
