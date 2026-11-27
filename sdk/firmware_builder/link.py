# SPDX-License-Identifier: GPL-3.0-or-later
"""The linker: format-2 packages and a stock main OS -> one patched main OS.

A format-2 package is a relocatable object written as JSON: its sections (.boot for the core only, .run, .fast,
.bss), the symbols it defines and exports, what it imports (some weakly), relocations, sites in the stock image with
relocations of their own, the tables it declares and the entries it adds to others' tables, and its resources.

The linker checks the packages, lays them out in the device's areas, resolves symbols, builds the tables, relocates,
and enforces the budgets and the rules for copied stock blocks. A relocation target is "sym:NAME" (the package's own
symbol, else an export, else for a weak import core_zero), "sec:NAME" (one of the package's sections) or "abs"
(zero, so the addend is the value).

On a device whose main OS uploads DSP code (the profile's `dsp_payloads`), a package may carry DSP56300 code in
`.dsp.<payload>` sections of 24-bit little-endian words, and declare DSP tables (a collection with
"space": "dsp.<payload>"). They go into the P words of that payload a package frees by claiming the area's name
(`dsp_areas`); their symbols are DSP word addresses, and a `dsp24` relocation writes one as three little-endian
bytes.
"""
import struct

from . import dsp, store
from .elemod import (ModError, sha, _int, _hex, common_checks, insn_check, overlaps, summarize,
                     parse_needs_core, parse_parts, parse_resources, parse_sites, parts_bytes,
                     resolve_target, format_of, version_key,
                     COMMON)

FORMAT2 = 2
SECTIONS = ('.boot', '.run', '.fast', '.bss')
RTYPES = ('abs32', 'pc32', 'pc16', 'dsp24')
RSIZE = {'abs32': 4, 'pc32': 4, 'pc16': 2, 'dsp24': 3}
DSP = '.dsp.'                     # a DSP section's prefix, followed by its payload's tag
FAST_ENTRY = 16                   # one .fast copy entry: src, dst, len, 0
MAX_ALIGN = 4096                  # largest section alignment (a power of two)
LINKER_SYMS = {'__run_load', '__run_start', '__run_words', '__bss_start', '__bss_end',
               '__bss_words'}
FORMAT2_FIELDS = {'sections', 'symbols', 'exports', 'imports', 'weak', 'relocs', 'collections', 'contribute',
                  'copied', 'storage'}


def _dsp_tag(dev, sec):
    """The payload tag a DSP section name refers to, or None."""
    if sec.startswith(DSP):
        tag = sec[len(DSP):]
        if tag in dev.dsp_payloads:
            return tag
    return None


def _align(v, a):
    return (v + a - 1) // a * a


def _parts_len(parts):
    return sum(len(p[1]) if p[0] == 'hex' else p[2] for p in parts)


class Mod2:
    """A loaded and validated format-2 package."""

    def __init__(self, doc, name='<mod>', raw=None):
        self.doc, self.name = doc, name
        self.sha256 = None if raw is None else sha(raw)
        if format_of(doc) != FORMAT2:
            raise ModError('%s: not a format-2 .elemod file' % name)
        unknown = set(doc) - COMMON - FORMAT2_FIELDS
        if unknown:
            raise ModError('%s: unknown fields %s' % (name, sorted(unknown)))
        for k in ('id', 'version', 'target', 'sections'):
            if k not in doc:
                raise ModError('%s: no "%s"' % (name, k))
        self.id, self.version = str(doc['id']), str(doc['version'])
        self.dev, self.rel = resolve_target(doc, name)
        self.sections = {sec: self._section(sec, d) for sec, d in doc['sections'].items()}
        self._read_symbols(doc)
        self.relocs = []
        for r in doc.get('relocs', []):
            sec, off, typ, tgt, add = r
            off = _int(off, name)
            self._reloc_ok(sec, off, typ, tgt)
            self.relocs.append((sec, off, typ, tgt, _int(add, name)))
        self.sites = parse_sites(doc, name, self.dev, self.rel, relocs=True)
        self._read_collections(doc)
        self.contribute = [self._contribution(i, c) for i, c in enumerate(doc.get('contribute', []))]
        try:
            self.storage = store.parse_decls(doc)
        except ModError as e:
            raise ModError('%s: %s' % (name, e))
        self.copied = [(_int(c['lo'], name), _int(c['hi'], name), _int(c['to'], name))
                       for c in doc.get('copied', [])]
        self.regions, self.names = parse_resources(doc, name, self.dev)
        self.needs_core = parse_needs_core(doc, name)
        self.requires = [str(x) for x in doc.get('requires', [])]
        self.conflicts = [str(x) for x in doc.get('conflicts', [])]
        self.blob = None                       # format 1 only

    def _section(self, sec, d):
        name = self.name
        tag = _dsp_tag(self.dev, sec)
        if sec not in SECTIONS and tag is None:
            raise ModError('%s: unknown section %s' % (name, sec))
        if tag is not None:                     # DSP words: no alignment, whole words only
            parts = parse_parts(d.get('parts', []), name + ' ' + sec, self.dev, self.rel)
            n = _parts_len(parts)
            if n != _int(d.get('len', n), name) or n % 3:
                raise ModError('%s %s: %d bytes, not whole 24-bit DSP words' % (name, sec, n))
            return {'align': 1, 'parts': parts, 'len': n}
        align = _int(d.get('align', 4), name)
        if align < 1 or align & (align - 1) or align > MAX_ALIGN:
            raise ModError('%s %s: alignment %d (a power of two up to %d)' % (name, sec, align, MAX_ALIGN))
        if sec == '.bss':
            return {'align': align, 'size': _int(d['size'], name)}
        parts = parse_parts(d.get('parts', []), name + ' ' + sec, self.dev, self.rel)
        n = _parts_len(parts)
        if n != _int(d.get('len', n), name):
            raise ModError('%s %s: parts make %d bytes, not %s' % (name, sec, n, d.get('len')))
        return {'align': align, 'parts': parts, 'len': n}

    def _read_symbols(self, doc):
        name = self.name
        self.symbols = {}
        for nm, v in doc.get('symbols', {}).items():
            if not isinstance(v, list) or len(v) != 2:
                raise ModError('%s: symbol %s' % (name, nm))
            if v[0] != 'abs' and v[0] not in self.sections:
                raise ModError('%s: symbol %s in a section it lacks (%s)' % (name, nm, v[0]))
            self.symbols[nm] = (v[0], _int(v[1], name))
            if _dsp_tag(self.dev, v[0]) and self.symbols[nm][1] % 3:
                raise ModError('%s: DSP symbol %s is not at a whole word' % (name, nm))
        self.exports = [str(x) for x in doc.get('exports', [])]
        for x in self.exports:
            if x not in self.symbols:
                raise ModError('%s: exports %s, which it does not define' % (name, x))
        self.imports = [str(x) for x in doc.get('imports', [])]
        self.weak = {str(x) for x in doc.get('weak', [])}
        if not self.weak <= set(self.imports):
            raise ModError('%s: a weak name it does not import' % name)

    def _read_collections(self, doc):
        name = self.name
        self.collections, self.dsp_tables = {}, {}
        for c, d in doc.get('collections', {}).items():
            entry = _int(d.get('entry'), name)
            space = d.get('space')
            if space is None:
                if entry <= 0 or entry % 4:
                    raise ModError('%s: table %s entry size %d' % (name, c, entry))
            else:
                tag = _dsp_tag(self.dev, '.' + str(space))
                if tag is None:
                    raise ModError('%s: table %s in space %r, which the %s lacks' % (name, c, space, self.dev.name))
                head, end = _hex(d.get('head', ''), name), _hex(d.get('end', ''), name)
                if entry <= 0 or entry % 3 or len(head) % 3 or len(end) % 3:
                    raise ModError('%s: DSP table %s is not whole 24-bit words' % (name, c))
                self.dsp_tables[c] = (tag, head, end)
            self.collections[c] = entry

    def _contribution(self, i, c):
        what = '%s contribution %d' % (self.name, i)
        data = _hex(c.get('data'), what)
        relocs = []
        for r in c.get('relocs', []):
            off, typ, tgt, add = r
            off = _int(off, what)
            if typ not in RTYPES or off < 0 or off + (3 if typ == 'dsp24' else 4) > len(data):
                raise ModError('%s: bad relocation %r' % (what, r))
            relocs.append((off, typ, tgt, _int(add, what)))
        claims = [(_int(a, what), _int(b, what)) for a, b in c.get('claims', [])]
        return {'to': str(c['to']), 'order': _int(c.get('order', 50), what),
                'data': data, 'relocs': relocs, 'claims': claims, 'i': i}

    def implied_names(self, image):
        """The names this package claims through its contributions (the profile's slot_claims): an entry of such a
        table points at a descriptor whose long at a fixed offset is a sound slot, and the package claims that slot,
        so two packages storing in one slot never link together. `image` is the stock main OS, for descriptors made
        of stock parts. A descriptor that cannot be read (outside the package's bytes, or under a relocation)
        claims nothing. check() adds these to the package's names."""
        found = []
        for table, at, count, prefix in self.dev.slot_claims:
            for c in self.contribute:
                if c['to'] != table:
                    continue
                for off, typ, tgt, add in c['relocs']:
                    if off != 0 or typ != 'abs32':
                        continue
                    if tgt.startswith('sym:') and tgt[4:] in self.symbols:
                        sec, base = self.symbols[tgt[4:]]
                    elif tgt.startswith('sec:'):
                        sec, base = tgt[4:], 0
                    else:
                        continue
                    slot = self._long(sec, base + add + at, image)
                    claim = '%s:%d' % (prefix, slot) if slot is not None else None
                    if slot is not None and 0 <= slot < count and claim not in found:
                        found.append(claim)
        return found

    def _long(self, sec, off, image):
        """The big-endian long at sec+off of this package's bytes, or None when the section has no bytes there, the
        long spans two parts or a relocation covers it."""
        d = self.sections.get(sec)
        if not d or 'parts' not in d or off < 0 or off + 4 > d['len']:
            return None
        if any(s == sec and o < off + 4 and off < o + RSIZE[t] for s, o, t, _g, _a in self.relocs):
            return None
        start = 0
        for p in d['parts']:
            n = len(p[1]) if p[0] == 'hex' else p[2]
            if start <= off and off + 4 <= start + n:
                if p[0] == 'hex':
                    raw = p[1][off - start:off - start + 4]
                else:
                    at = p[1] - self.dev.main_load + off - start
                    raw = image[at:at + 4]
                return struct.unpack('>I', raw)[0] if len(raw) == 4 else None
            if start < off + 4 and off < start + n:
                return None                     # spans two parts
            start += n
        return None

    def _reloc_ok(self, sec, off, typ, tgt):
        name = self.name
        if sec not in self.sections or sec == '.bss':
            raise ModError('%s: relocation in %s' % (name, sec))
        if typ not in RTYPES:
            raise ModError('%s: relocation type %s' % (name, typ))
        if (typ == 'dsp24') != bool(_dsp_tag(self.dev, sec)) or (typ == 'dsp24' and off % 3):
            raise ModError('%s: a %s relocation in %s' % (name, typ, sec))
        if off < 0 or off + RSIZE[typ] > self.sections[sec]['len']:
            raise ModError('%s: relocation at %s+%d is outside it' % (name, sec, off))
        if not (tgt == 'abs' or tgt.startswith('sym:') or tgt.startswith('sec:')):
            raise ModError('%s: relocation target %r' % (name, tgt))

    def label(self):
        return '%s %s' % (self.id, self.version)

    def size(self, sec):
        d = self.sections.get(sec)
        if not d:
            return 0
        return d['size'] if sec == '.bss' else d['len']

    def ram_bound(self):
        """The most of the linker's area this package can take, whatever it is linked with: .run and .bss with
        their alignment, its table entries and the zero entry of each table it declares, its .fast copy and that
        copy's entry, each rounded up to 4. link() never lays a set out in more than the sum of its bounds, so a
        builder can tell which core's area holds a set."""
        total = 0
        for sec in ('.run', '.bss'):
            if self.size(sec):
                total += _align(self.size(sec), 4) + max(4, self.sections[sec]['align']) - 4
        total += sum(_align(len(c['data']), 4) for c in self.contribute)
        total += sum(_align(e, 4) for e in self.collections.values())
        if self.size('.fast'):
            total += _align(self.size('.fast'), 4) + FAST_ENTRY
        return total


# ---- checks ------------------------------------------------------------------------------------------------------

def reserve_names(dev, exported):
    """The symbols a core may size its RAM reserve with (the profile's `reserve`); none when a package exports one
    of them, as a core with a fixed reserve does."""
    names = set(dev.reserve[1]) if dev.reserve else set()
    return set() if names & set(exported) else names


def dsp_areas(mods, image):
    """The DSP areas the packages free, by claimed name: tag -> (lo, hi, main OS address of P:lo, owner, name).
    One area per payload, the first one claimed."""
    dev, freed = mods[0].dev, {}
    for tag, lo, hi, nm, _what in dev.dsp_areas:
        owner = next((m for m in mods if nm in m.names), None)
        if owner is not None and tag not in freed:
            freed[tag] = (lo, hi, dsp.p_span(image, dev, tag, lo, hi), owner, nm)
    return freed


def _dsp_needs(m):
    """The payload tags whose areas a package's DSP sections and DSP tables need."""
    tags = {_dsp_tag(m.dev, s) for s in m.sections if _dsp_tag(m.dev, s)}
    return tags | {t for t, _h, _e in m.dsp_tables.values()}


def _one_target(mods):
    return len({(m.dev.key, m.rel.version) for m in mods}) == 1


def check(mods, image):
    """The static checks that need no layout. -> problems."""
    spans = []
    for m in mods:
        spans += [(s['addr'], s['addr'] + s['len'], m, 'site 0x%08x' % s['addr']) for s in m.sites]
        for c in m.contribute:
            spans += [(a, b, m, '%s entry (claims 0x%08x-0x%08x)' % (c['to'], a, b)) for a, b in c['claims']]
    areas = {}
    if mods[0].dev.dsp_areas and _one_target(mods):
        areas = dsp_areas(mods, image)
        for tag, (lo, hi, at, owner, nm) in sorted(areas.items()):
            spans.append((at, at + 3 * (hi - lo), owner,
                          'DSP area %s (payload %s P:0x%04x-0x%04x)' % (nm, tag, lo, hi - 1)))
    if _one_target(mods):
        for m in mods:                          # the sound slots their parameters store in
            for nm in m.implied_names(image):
                if nm not in m.names:
                    m.names.append(nm)
    bad = common_checks(mods, image, spans)
    if bad and bad[0].startswith('the mods are for different firmware'):
        return bad
    dev = mods[0].dev
    if not dev.linkable():
        return ['the %s has no linkable (format-2) mods yet: only whole builds (format 1) '
                'can be used on it' % dev.name]
    cores = [m for m in mods if '.boot' in m.sections]
    if len(cores) != 1:
        bad.insert(0, 'exactly one mod must carry .boot (core); got %s' % ([m.label() for m in cores] or 'none'))
    else:
        for m in mods:
            if m.needs_core and version_key(cores[0].version) < version_key(m.needs_core):
                bad.append('%s needs core %s or newer, and this build has core %s'
                           % (m.label(), m.needs_core, cores[0].version))
    exporter = {}
    for m in mods:
        for x in m.exports:
            if x in exporter:
                bad.append('%s and %s both export %s' % (exporter[x].label(), m.label(), x))
            exporter[x] = m
    tables = {}
    for m in mods:
        for c, e in m.collections.items():
            if c in tables:
                bad.append('%s and %s both declare the table %s' % (tables[c][0].label(), m.label(), c))
            if c in exporter:
                bad.append('table %s has the name of a symbol %s exports' % (c, exporter[c].label()))
            tables[c] = (m, e)
    sized = reserve_names(dev, exporter)
    fields = {}                                 # storage fields: symbols the linker defines
    for m in mods:
        for sym, _scope, _bits in m.storage:
            if sym in fields:
                bad.append('%s and %s both declare the storage field %s' % (fields[sym].label(), m.label(), sym))
            elif sym in exporter or sym in tables or sym in LINKER_SYMS or sym in store.GEN_SYMS:
                bad.append('%s: the storage field %s has the name of a symbol or table' % (m.label(), sym))
            fields[sym] = m
    if store.IDS_TABLE in tables:
        fields.update(dict.fromkeys(store.GEN_SYMS))
    for m in mods:
        bad += _import_problems(m, exporter, tables, sized, fields)
        bad += _entry_problems(m, tables)
        if m.size('.fast') and (not dev.fast_table or dev.fast_table not in tables):
            bad.append('%s has .fast code, which needs the mod that declares %s'
                       % (m.label(), dev.fast_table or 'a .fast copy table'))
        for tag in sorted(_dsp_needs(m) - set(areas)):
            free = [nm for t, _lo, _hi, nm, _w in dev.dsp_areas if t == tag]
            bad.append('%s has DSP code for payload %s, which needs a mod that frees DSP memory '
                       'there (one that claims %s)' % (m.label(), tag, ' or '.join(free) or
                                                       'an area the %s does not have' % dev.name))
    regions = [(g['lo'], g['hi'], m, 'region ' + g['name']) for m in mods for g in m.regions]
    if dev.sram_code[1] > dev.sram_code[0]:
        regions.append((dev.sram_code[0], dev.sram_code[1], None, 'the .fast area'))
    for a, b in overlaps(regions):
        bad.append('%s %s and %s %s overlap' % (a[2].label() if a[2] else 'the linker', a[3],
                                                 b[2].label() if b[2] else 'the linker', b[3]))
    return bad


def _import_problems(m, exporter, tables, sized, fields):
    found = []
    for x in m.imports:
        if (x in exporter or x in tables or x in LINKER_SYMS or x in sized or x in m.weak
                or (x.endswith('_n') and x[:-2] in tables) or x in fields):
            continue
        found.append('%s imports %s, which no given mod exports' % (m.label(), x))
    return found


def _entry_problems(m, tables):
    found = []
    for c in m.contribute:
        if c['to'] not in tables:
            found.append('%s adds to table %s, which no given mod declares' % (m.label(), c['to']))
            continue
        owner, entry = tables[c['to']]
        if len(c['data']) % entry:
            found.append('%s: an entry for %s is not %d bytes' % (m.label(), c['to'], entry))
            continue
        in_dsp = c['to'] in owner.dsp_tables
        for off, typ, _tgt, _add in c['relocs']:
            if (typ == 'dsp24') != in_dsp or (in_dsp and off % 3):
                found.append('%s: an entry for %s has a %s relocation at +%d; %s'
                             % (m.label(), c['to'], typ, off,
                                'a DSP table\'s entries take dsp24, at whole words' if in_dsp
                                else 'dsp24 is for DSP tables'))
    return found


def _copied_rules(mods, patched, dev):
    """Other packages' sites inside a copied block: no PC-relative operand, no relative branch, and whole
    instructions in the patched image."""
    isa = dev.decoder()
    read = isa.reader(patched, dev.main_load)
    relative = (isa.F_BRA, isa.F_BCC, isa.F_BSR)
    bad = []
    for owner in mods:
        for lo, hi, _to in owner.copied:
            for m in mods:
                if m is owner:
                    continue
                for s in m.sites:
                    start, end = s['addr'], s['addr'] + s['len']
                    if not (lo <= start < hi or lo < end <= hi):
                        continue
                    if s['kind'] != 'code':
                        bad.append('%s site 0x%08x: data inside %s\'s copied block' % (m.label(), start,
                                                                                      owner.label()))
                        continue
                    pc = start
                    while pc < end:
                        ins = isa.decode(read(pc), pc)
                        if ins.flags & isa.PCREL or ins.flow in relative:
                            bad.append('%s site 0x%08x: %s at 0x%08x is PC-relative, inside %s\'s copied block'
                                       % (m.label(), start, ins.op, pc, owner.label()))
                        pc += ins.length
                    if pc != end:
                        bad.append('%s site 0x%08x: its new bytes are not whole instructions' % (m.label(), start))
    return bad


# ---- the link ----------------------------------------------------------------------------------------------------

class Linked:
    pass


def _put(buf, off, typ, value, pc, where):
    """Write a resolved relocation value into buf at off."""
    if typ == 'dsp24':                         # a DSP word, little-endian as the payloads hold it
        if not 0 <= value <= 0xFFFFFF:
            raise ModError('%s: a DSP address out of range (0x%x)' % (where, value))
        buf[off:off + 3] = value.to_bytes(3, 'little')
    elif typ == 'abs32':
        struct.pack_into('>I', buf, off, value & 0xFFFFFFFF)
    elif typ == 'pc32':
        struct.pack_into('>i', buf, off, value - pc)
    else:
        delta = value - pc
        if not -0x8000 <= delta < 0x8000:
            raise ModError('%s: a 16-bit PC-relative reference spans %d bytes' % (where, delta))
        struct.pack_into('>h', buf, off, delta)


class _Link:
    """One link run: the layout, the symbol values and the bytes, built in that order."""

    def __init__(self, mods, image, lock):
        self.image = image
        self.dev, self.rel = mods[0].dev, mods[0].rel
        self.image_end = self.dev.image_end(self.rel)
        self.core = [m for m in mods if '.boot' in m.sections][0]
        self.ddr_base, self.ddr_end = self.dev.ddr_for(self.core.version)
        self.fast_base, self.fast_end = self.dev.sram_code
        self.order = [self.core] + sorted((m for m in mods if m is not self.core), key=lambda m: m.id)
        self.tables = {c: (m, e) for m in self.order for c, e in m.collections.items()}
        self.entries = {c: [] for c in self.tables}
        for m in self.order:
            for c in m.contribute:
                self.entries[c['to']].append((c['order'], m.id, c['i'], m, c))
        self._storage(lock)
        self.fast_mods = [m for m in self.order if m.size('.fast')]
        for c in self.entries:
            self.entries[c].sort(key=lambda e: e[:3])
        self.dsp_tables = {c: t for m in self.order for c, t in m.dsp_tables.items()}

    def _storage(self, lock):
        """Place the storage fields from the lockfile, as symbols and entries of the IDs' table."""
        core, order = self.core, self.order
        keeps = store.GEN_SYMS[0] in core.imports
        decls = [(m.id, sym, scope, bits) for m in order for sym, scope, bits in m.storage]
        self.new_lock, self.store_notes, self.store_syms = None, [], {}
        if decls and not keeps:
            users = sorted({d[0] for d in decls})
            raise ModError('%s declare%s mod storage, which %s does not keep'
                           % (', '.join(users), 's' if len(users) == 1 else '', core.label()))
        if not keeps:
            return
        if store.IDS_TABLE not in self.tables:
            raise ModError('%s imports %s but declares no table %s'
                           % (core.label(), store.GEN_SYMS[0], store.IDS_TABLE))
        self.new_lock, self.store_notes = store.allocate(lock, decls, self.dev.key, core.version)
        self.store_syms, ids = store.symbols(self.new_lock, self.dev.key)
        exported = {nm for m in order for nm in m.exports}
        for nm in self.store_syms:
            if nm in exported or nm in LINKER_SYMS:
                raise ModError('the storage field %s has the name of a symbol a mod exports' % nm)
        for i, data in enumerate(ids):
            self.entries[store.IDS_TABLE].append((-1, '', i, core, {'data': data, 'relocs': []}))

    def table_len(self, c):
        n = sum(len(e[4]['data']) for e in self.entries[c])
        if c in self.dsp_tables:               # a DSP table: its head, its entries, its end
            return len(self.dsp_tables[c][1]) + n + len(self.dsp_tables[c][2])
        if c == self.dev.fast_table:
            n += FAST_ENTRY * len(self.fast_mods)
        return n + self.tables[c][1]           # and the zero entry

    def table_count(self, c):
        if c in self.dsp_tables:
            return sum(len(e[4]['data']) for e in self.entries[c]) // self.tables[c][1]
        return self.table_len(c) // self.tables[c][1] - 1

    def lay_out(self):
        """Addresses of every section and table; raises when the RAM, the .fast area or a DSP area overflows."""
        dev, order = self.dev, self.order
        base = self.base = {}                  # (package id, section) -> address
        base[(self.core.id, '.boot')] = self.image_end
        at = self.ddr_base
        for m in order:
            if m.size('.run'):
                at = _align(at, max(4, m.sections['.run']['align']))
                base[(m.id, '.run')] = at
                at += m.size('.run')
        self.tab_at = {}
        for c in sorted(self.tables):
            if c in self.dsp_tables:
                continue
            at = _align(at, 4)
            self.tab_at[c] = at
            at += self.table_len(c)
        fast_at, self.fload = self.fast_base, {}
        for m in self.fast_mods:
            fast_at = _align(fast_at, max(4, m.sections['.fast']['align']))
            base[(m.id, '.fast')] = fast_at
            at = _align(at, 4)
            self.fload[m.id] = at
            n = _align(m.size('.fast'), 4)
            fast_at += n
            at += n
        self.run_end = at = _align(at, 4)
        for m in order:
            if m.size('.bss'):
                at = _align(at, max(4, m.sections['.bss']['align']))
                base[(m.id, '.bss')] = at
                at += m.size('.bss')
        self.bss_end = _align(at, 4)
        self.fast_at = fast_at
        if self.bss_end > self.ddr_end:
            need = self.bss_end - self.ddr_base
            bigger = [(v, a) for v, a in dev.core_ddr if a[1] - a[0] >= need]
            hint = '; core %s or newer gives them %d bytes' % (bigger[0][0], bigger[0][1][1] - bigger[0][1][0]) \
                if bigger else ''
            raise ModError('the mods need RAM to 0x%08x, past 0x%08x (%d bytes over)%s'
                           % (self.bss_end, self.ddr_end, self.bss_end - self.ddr_end, hint))
        if fast_at > self.fast_end:
            raise ModError('.fast code needs SRAM to 0x%08x, past 0x%08x' % (fast_at, self.fast_end))
        self.run_load = _align(self.image_end + self.core.size('.boot'), 16)
        self._lay_out_dsp()

    def _lay_out_dsp(self):
        """Each payload's DSP sections, then its DSP tables, in the P words a package frees (word addresses)."""
        dev = self.dev
        self.areas = dsp_areas(self.order, self.image) if dev.dsp_areas else {}
        self.dsp_at = {tag: a[0] for tag, a in self.areas.items()}
        self.dsp_secs = {}
        for m in self.order:
            for sec in m.sections:
                tag = _dsp_tag(dev, sec)
                if tag:
                    self.base[(m.id, sec)] = self.dsp_at[tag]
                    self.dsp_secs[(m.id, sec)] = tag
                    self.dsp_at[tag] += m.size(sec) // 3
        for c in sorted(self.dsp_tables):
            tag = self.dsp_tables[c][0]
            self.tab_at[c] = self.dsp_at[tag]
            self.dsp_at[tag] += self.table_len(c) // 3
        for tag, (lo, hi, _a, _o, nm) in self.areas.items():
            if self.dsp_at[tag] > hi:
                raise ModError('the DSP code for payload %s needs P words to 0x%05x, past the %d '
                               'words %s frees (%d over)' % (tag, self.dsp_at[tag], hi - lo, nm, self.dsp_at[tag] - hi))

    def define(self):
        """Every symbol's value. A DSP symbol is a word address: its section's base + its byte offset / 3."""
        dev, base = self.dev, self.base
        addr, glob, dspsym = self.addr, self.glob, self.dspsym = {}, {}, set()
        for m in self.order:
            for nm, (sec, off) in m.symbols.items():
                if sec in m.sections and _dsp_tag(dev, sec):
                    v = base[(m.id, sec)] + off // 3
                    dspsym.add((m.id, nm))
                elif sec == 'abs':
                    v = off
                else:
                    v = base[(m.id, sec)] + off
                addr[(m.id, nm)] = v
                if nm in m.exports:
                    glob[nm] = v
                    if (m.id, nm) in dspsym:
                        dspsym.add((None, nm))
        for c in self.tables:
            glob[c] = self.tab_at[c]
            glob[c + '_n'] = self.table_count(c)
            if c in self.dsp_tables:
                dspsym.add((None, c))
        glob.update(self.store_syms)
        glob.update({'__run_load': self.run_load, '__run_start': self.ddr_base,
                     '__run_words': (self.run_end - self.ddr_base) // 4, '__bss_start': self.run_end,
                     '__bss_end': self.bss_end, '__bss_words': (self.bss_end - self.run_end) // 4})
        sized, self.units = reserve_names(dev, glob), None
        if any(x in sized for m in self.order for x in m.imports):   # a reserve sized to the packages
            unit, names = dev.reserve
            self.units = max(1, -(-(self.bss_end - self.ddr_base) // unit))
            for nm in sorted(names):
                a, b = names[nm]
                glob[nm] = (a + b * self.units) & 0xFFFFFFFF
        self.zero = glob.get('core_zero')

    def resolve(self, m, tgt, where):
        if tgt == 'abs':
            return 0
        kind, nm = tgt.split(':', 1)
        if kind == 'sec':
            if (m.id, nm) not in self.base:
                raise ModError('%s: %s refers to its empty section %s' % (m.label(), where, nm))
            return self.base[(m.id, nm)]
        if (m.id, nm) in self.addr and nm in m.symbols:
            return self.addr[(m.id, nm)]
        if nm in self.glob:
            return self.glob[nm]
        if nm in m.weak and self.zero is not None:
            return self.zero
        raise ModError('%s: %s refers to %s, which nothing defines' % (m.label(), where, nm))

    def is_dsp(self, m, tgt):
        """Whether a relocation target is a DSP word address; None for "abs"."""
        if tgt == 'abs':
            return None
        kind, nm = tgt.split(':', 1)
        if kind == 'sec':
            return bool(_dsp_tag(self.dev, nm))
        if (m.id, nm) in self.addr and nm in m.symbols:
            return (m.id, nm) in self.dspsym
        return (None, nm) in self.dspsym

    def place(self, m, buf, off, typ, tgt, add, pc, where):
        target_dsp = self.is_dsp(m, tgt)
        if target_dsp is not None and target_dsp != (typ == 'dsp24'):
            raise ModError('%s: %s is a %s reference to a %s address' % (
                m.label(), where, 'DSP' if typ == 'dsp24' else 'ColdFire', 'DSP' if target_dsp else 'ColdFire'))
        _put(buf, off, typ, self.resolve(m, tgt, where) + add, pc, where)

    def emit(self):
        """The patched image: relocated sections and tables, the blob after the stock image, the DSP areas and
        the sites; then the copied-block and instruction checks."""
        dev, order, base, image = self.dev, self.order, self.base, self.image
        content = {}
        for m in order:
            for sec in m.sections:
                if sec != '.bss' and m.size(sec):
                    content[(m.id, sec)] = parts_bytes(m.sections[sec]['parts'], image, dev)
            for sec, off, typ, tgt, add in m.relocs:
                self.place(m, content[(m.id, sec)], off, typ, tgt, add, base[(m.id, sec)] + off,
                           '%s+0x%x' % (sec, off))
        tab = {c: self._table_bytes(c) for c in self.tables}
        ddr = bytearray(self.run_end - self.ddr_base)
        for m in order:
            if m.size('.run'):
                at = base[(m.id, '.run')] - self.ddr_base
                ddr[at:at + m.size('.run')] = content[(m.id, '.run')]
            if m.id in self.fload:
                at = self.fload[m.id] - self.ddr_base
                ddr[at:at + m.size('.fast')] = content[(m.id, '.fast')]
        for c in self.tables:
            if c not in self.dsp_tables:
                at = self.tab_at[c] - self.ddr_base
                ddr[at:at + len(tab[c])] = tab[c]
        blob = bytearray(content[(self.core.id, '.boot')])
        blob += bytes(self.run_load - self.image_end - len(blob))
        blob += ddr
        img = bytearray(image)

        def dsp_put(tag, word, data):          # P words of a payload's area are main OS bytes
            lo, _hi, at, _o, _n = self.areas[tag]
            start = at + 3 * (word - lo) - dev.main_load
            img[start:start + len(data)] = data
        for key, tag in self.dsp_secs.items():
            dsp_put(tag, base[key], content.get(key, b''))
        for c in self.dsp_tables:
            dsp_put(self.dsp_tables[c][0], self.tab_at[c], tab[c])
        for m in order:
            for s in m.sites:
                new = bytearray(s['new'])
                for off, typ, tgt, add in s['relocs']:
                    self.place(m, new, off, typ, tgt, add, s['addr'] + off, 'site 0x%08x' % s['addr'])
                start = s['addr'] - dev.main_load
                img[start:start + s['len']] = new
        img += blob
        if self.new_lock is not None:
            img += store.trailer(self.new_lock)
        patched = bytes(img)
        bad = _copied_rules(order, patched, dev)
        for m in order:
            for s in m.sites:
                if s['kind'] == 'code':
                    ok, note = insn_check(patched, s['addr'], s['len'], dev, sweeps=0)
                    if not ok:
                        bad.append('%s site 0x%08x after relocation: %s' % (m.label(), s['addr'], note))
        if bad:
            raise ModError('the linked mods break a rule:\n  ' + '\n  '.join(bad))
        self.blob_len = len(blob)
        return patched

    def _table_bytes(self, c):
        dsp_table = self.dsp_tables.get(c)
        buf = bytearray(dsp_table[1] if dsp_table else b'')
        for _o, _id, _i, m, e in self.entries[c]:
            data = bytearray(e['data'])
            for off, typ, tgt, add in e['relocs']:
                self.place(m, data, off, typ, tgt, add, self.tab_at[c] + len(buf) + off, 'an entry of %s' % c)
            buf += data
        if dsp_table:
            return buf + dsp_table[2]
        if c == self.dev.fast_table:
            for m in self.fast_mods:
                buf += struct.pack('>IIII', self.fload[m.id], self.base[(m.id, '.fast')],
                                   _align(m.size('.fast'), 4), 0)
        return buf + bytes(self.tables[c][1])

    def result(self, patched):
        out = Linked()
        out.image = patched
        out.order = [m.label() for m in self.order]
        out.map = {'%s:%s' % key: v for key, v in self.addr.items()}
        out.map.update(self.glob)
        values = {}
        for (_mid, nm), v in self.addr.items():
            values.setdefault(nm, set()).add(v)
        for nm, vs in values.items():
            if len(vs) == 1 and nm not in out.map:
                out.map[nm] = vs.pop()
        out.tables = {c: (self.tab_at[c], self.table_count(c), self.tables[c][1]) for c in self.tables}
        boot_len = self.core.size('.boot')
        out.layout = {
            'boot': [self.image_end, self.image_end + boot_len], 'run_load': self.run_load,
            'ddr': [self.ddr_base, self.run_end], 'bss': [self.run_end, self.bss_end],
            'fast': [self.fast_base, self.fast_at], 'blob_len': self.blob_len,
            'sections': {'%s %s' % key: v for key, v in sorted(self.base.items(), key=lambda kv: kv[1])
                         if key not in self.dsp_secs},
            'ddr_spare': self.ddr_end - self.bss_end, 'fast_spare': self.fast_end - self.fast_at,
            'ddr_size': self.ddr_end - self.ddr_base, 'fast_size': self.fast_end - self.fast_base,
        }
        out.store, out.store_notes = self.new_lock, self.store_notes
        if self.units is not None:             # the reserve the core takes, in units of dev.reserve
            out.layout['reserve'] = {'units': self.units, 'end': self.ddr_base + self.units * self.dev.reserve[0]}
        if self.areas:                         # word addresses of each payload's area
            out.layout['dsp'] = {
                tag: {'area': [lo, hi], 'used': [lo, self.dsp_at[tag]], 'name': nm,
                      'sections': {'%s %s' % key: self.base[key] for key, t in sorted(self.dsp_secs.items())
                                   if t == tag},
                      'tables': {c: self.tab_at[c] for c in sorted(self.dsp_tables) if self.dsp_tables[c][0] == tag}}
                for tag, (lo, hi, _a, _o, nm) in sorted(self.areas.items())}
        return out


def link(mods, image, lock=None):
    """Link format-2 packages into the stock main OS. -> Linked with .image (the patched main OS), .map
    ({name: address}), .layout, .tables ({name: (address, count, entry size)}), .order, and for a core with
    package storage .store (the new lockfile) and .store_notes. lock: the build's lockfile, or None for a new one
    (store.py). Raises ModError."""
    if not mods:
        raise ModError('no mods')
    dev, rel = mods[0].dev, mods[0].rel
    if sha(image) != rel.main_sha256:
        raise ModError('the stock main OS is not %s %s' % (dev.name, rel.version))
    bad = summarize(check(mods, image), mods)
    if bad:
        raise ModError('the mods do not combine:\n  ' + '\n  '.join(bad))
    run = _Link(mods, image, lock)
    run.lay_out()
    run.define()
    return run.result(run.emit())
