# SPDX-License-Identifier: GPL-3.0-or-later
"""Package storage: the lockfile and the allocator that places each storage field.

A core that keeps package storage imports `__store_gen`. Packages declare fields,

    "storage": [{"sym": "my_accent", "scope": "track", "bits": 4}]

and the linker defines each field's symbol as a descriptor: scope in bits 28-31, width in bits 22-27, bit offset in
bits 0-21. Placement comes from the build's lockfile so fields keep their bits from build to build:

- a field declared again with the same scope and width keeps its place;
- a field no package declares any more is freed: its bits are given to nobody, so saved values survive, and the
  same field coming back with the same scope and width gets them again;
- any other field takes bits never used in this lockfile, so it reads zero (its default) everywhere;
- a scope out of unused bits moves to its next generation and is packed again from bit 0; data saved under older
  generations then loads that scope at defaults;
- a scope's room can grow with the core's version, the new bits after the old, and a field past the build's core's
  room repacks its scope;
- the tagged store's split (bytes per pattern track and per pattern) grows when needed, which moves the regions
  after it and so bumps their generations.

A layout's ID is a hash of the placement (layout_id), so the same packages from no lockfile always get the same
layout and ID. A changed layout gets a new ID and keeps the previous ones as ancestors (the newest 15), which the
core still reads. Nothing here is random.
"""
import copy
import hashlib
import json
import re

from .elemod import ModError, _int, version_key

FORMAT = 1
SCOPES = ('sound', 'kit', 'global', 'track', 'pattern', 'project')
SCOPE_NUM = {scope: i + 1 for i, scope in enumerate(SCOPES)}
MAX_ANCESTORS = 15
MAX_BITS = 32
GEN_SYMS = ('__store_gen', '__store_gen2')
IDS_TABLE = 'core_store_ids'
LOCK_KEY = 'elekloader_store'          # the lockfile's format marker (a field name of the file format)

# Per device: each scope's bits in its live home, and the tagged store's geometry.
DEVICES = {
    'analog-rytm-mk2': {
        'fixed': {'sound': 24, 'kit': 64, 'global': 40},
        'core_fixed': (('0.3', {'sound': 56}),),     # room from that core's version on
        'live': {'track': 512, 'pattern': 512},     # most bits the split can give one item
        'store': 4352 - 10,                          # bytes after the store's header
        'items': {'track': 129 * 13, 'pattern': 129},
        'split': {'track': 2, 'pattern': 4},         # a new lockfile's split
    },
    'analog-four-mk2': {
        'fixed': {'sound': 32, 'kit': 128, 'global': 64},
        'live': {'track': 512, 'pattern': 512},
        'store': 4352 - 10,
        'items': {'track': 129 * 6, 'pattern': 129},
        'split': {'track': 2, 'pattern': 4},
    },
}

TRAILER = b'ELKSTORE'


def supports(dev_key):
    return dev_key in DEVICES


def _spec(dev_key):
    if dev_key not in DEVICES:
        raise ModError('the %s has no mod storage' % dev_key)
    return DEVICES[dev_key]


def _whole(v):
    return isinstance(v, int) and not isinstance(v, bool)


def _fixed_room(spec, core):
    room = dict(spec['fixed'])
    for since, more in spec.get('core_fixed', ()):
        if core is None or version_key(core) >= version_key(since):
            room.update(more)
    return room


def capacity(dev_key, split, core=None):
    """{scope: bits} for a split and a core version (None: the newest core's room)."""
    spec = _spec(dev_key)
    room = _fixed_room(spec, core)
    room['track'] = 8 * split['track']
    room['pattern'] = 8 * split['pattern']
    items = spec['items']
    room['project'] = 8 * (spec['store'] - items['track'] * split['track'] - items['pattern'] * split['pattern'])
    return room


def _room_core(dev_key, split, scope, core):
    """For a message: the oldest core newer than `core` that gives `scope` the newest core's room."""
    most = capacity(dev_key, split)[scope]
    later = sorted(_spec(dev_key).get('core_fixed', ()), key=lambda c: version_key(c[0]))
    for since, _room in later:
        if version_key(since) > version_key(core) and capacity(dev_key, split, since)[scope] == most:
            return since
    return None


def _idstr(v):
    return '0x%08x' % v


def _idval(s, what):
    v = _int(s, 'lockfile: ' + what)
    if not 0 < v <= 0xFFFFFFFF:
        raise ModError('lockfile: %s %r is not a 32-bit ID other than 0' % (what, s))
    return v


def parse_decls(m):
    """A package document's "storage" -> [(sym, scope, bits)]."""
    fields = m.get('storage', [])
    if not isinstance(fields, list):
        raise ModError('"storage" is a list of fields')
    decls, seen = [], set()
    for f in fields:
        if not isinstance(f, dict) or set(f) - {'sym', 'scope', 'bits'}:
            raise ModError('a storage field is {"sym", "scope", "bits"}')
        sym, scope, bits = f.get('sym'), f.get('scope'), f.get('bits')
        if not isinstance(sym, str) or not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', sym):
            raise ModError('storage field %r: "sym" is a C name' % (sym,))
        if scope not in SCOPES:
            raise ModError('storage field %s: scope %r (%s)' % (sym, scope, ', '.join(SCOPES)))
        if not _whole(bits) or not 1 <= bits <= MAX_BITS:
            raise ModError('storage field %s: bits %r (1 to %d)' % (sym, bits, MAX_BITS))
        if sym in seen:
            raise ModError('storage field %s is declared twice' % sym)
        seen.add(sym)
        decls.append((sym, scope, bits))
    return decls


def _field_key(f):
    return (SCOPE_NUM[f['scope']], f['offset'], f['bits'], f['mod'], f['sym'])


def layout_id(lock):
    """The first 4 bytes of a SHA-256 over everything that says where data sits (not the ID or ancestors), never 0.
    Freed fields count, since their bits still hold values a returning field reads."""
    described = [lock[LOCK_KEY], lock['device'], [lock['split']['track'], lock['split']['pattern']],
                 [lock['generation'][s] for s in SCOPES], [lock['next'][s] for s in SCOPES]]
    for group in ('fields', 'freed'):
        described.append([[f['scope'], f['offset'], f['bits'], f['mod'], f['sym']]
                          for f in sorted(lock[group], key=_field_key)])
    return int(hashlib.sha256(json.dumps(described).encode('ascii')).hexdigest()[:8], 16) or 1


def fresh(dev_key):
    spec = _spec(dev_key)
    lock = {LOCK_KEY: FORMAT, 'device': dev_key, 'id': None,
            'ancestors': [], 'split': dict(spec['split']),
            'generation': dict.fromkeys(SCOPES, 1), 'next': dict.fromkeys(SCOPES, 0),
            'fields': [], 'freed': []}
    lock['id'] = _idstr(layout_id(lock))
    return lock


def _check_entries(lock, group):
    entries = lock.get(group)
    if not isinstance(entries, list):
        raise ModError('lockfile: "%s" is a list' % group)
    for f in entries:
        if (not isinstance(f, dict) or set(f) != {'mod', 'sym', 'scope', 'offset', 'bits'}
                or not isinstance(f['mod'], str) or not isinstance(f['sym'], str)
                or f['scope'] not in SCOPES or not _whole(f['offset']) or f['offset'] < 0
                or not _whole(f['bits']) or not 1 <= f['bits'] <= MAX_BITS):
            raise ModError('lockfile: a bad entry in "%s"' % group)
        if group == 'fields' and not 0 <= f['offset'] <= lock['next'][f['scope']] - f['bits']:
            raise ModError('lockfile: field %s of %s lies past its scope\'s used bits' % (f['sym'], f['mod']))


def check_lock(lock, dev_key):
    """Refuse (ModError) a lockfile of the wrong shape or for another device."""
    if not isinstance(lock, dict):
        raise ModError('lockfile: not a JSON object')
    fmt = lock.get(LOCK_KEY)
    if not _whole(fmt):
        raise ModError('lockfile: not a storage lockfile')
    if fmt > FORMAT:
        raise ModError('lockfile: format %d is newer than this builder (%d): update the builder' % (fmt, FORMAT))
    if fmt < 1:
        raise ModError('lockfile: format %r' % fmt)
    if lock.get('device') != dev_key:
        raise ModError('lockfile: made for the %s, not the %s' % (lock.get('device'), dev_key))
    _idval(lock.get('id'), 'id')
    ancestors = lock.get('ancestors', [])
    if not isinstance(ancestors, list):
        raise ModError('lockfile: "ancestors" is a list')
    for a in ancestors:
        _idval(a, 'ancestor')
    split = lock.get('split')
    if (not isinstance(split, dict) or set(split) != {'track', 'pattern'}
            or not all(_whole(split[k]) and split[k] >= 0 for k in split)):
        raise ModError('lockfile: "split" gives bytes per track and per pattern')
    room = capacity(dev_key, split)
    live = _spec(dev_key)['live']
    if room['project'] < 0 or 8 * split['track'] > live['track'] or 8 * split['pattern'] > live['pattern']:
        raise ModError('lockfile: the split %d/%d does not fit the store' % (split['track'], split['pattern']))
    for group in ('generation', 'next'):
        per = lock.get(group)
        if not isinstance(per, dict) or set(per) != set(SCOPES) or not all(_whole(per[s]) for s in SCOPES):
            raise ModError('lockfile: "%s" gives a number per scope' % group)
    for s in SCOPES:
        if not 1 <= lock['generation'][s] <= 255:
            raise ModError('lockfile: generation %r of %s' % (lock['generation'][s], s))
        if not 0 <= lock['next'][s] <= room[s]:
            raise ModError('lockfile: next bit %r of %s' % (lock['next'][s], s))
    for group in ('fields', 'freed'):
        _check_entries(lock, group)


def _bump(g):
    return 1 if g >= 255 else g + 1


class _Allocation:
    """One allocate() run over a working copy of the lockfile."""

    def __init__(self, lock, dev_key, core):
        self.lock, self.dev_key, self.core = lock, dev_key, core
        self.notes, self.repacked = [], set()
        self.fields, self.added = [], []

    def need(self, scope):
        return sum(f['bits'] for f in self.fields if f['scope'] == scope)

    def pending(self, scope):
        return [f for f in self.added if f['scope'] == scope and f['offset'] is None]

    def repack(self, scope):
        lock = self.lock
        self.repacked.add(scope)
        lock['generation'][scope] = _bump(lock['generation'][scope])
        lock['freed'] = [f for f in lock['freed'] if f['scope'] != scope]
        bit = 0
        for f in sorted((f for f in self.fields if f['scope'] == scope), key=lambda f: (f['mod'], f['sym'])):
            f['offset'] = bit
            bit += f['bits']
        lock['next'][scope] = bit
        self.notes.append('%s storage repacked (generation %d): older projects and sounds load it '
                          'at defaults' % (scope, lock['generation'][scope]))

    def grow_split(self):
        """Grow the split where the pattern tracks or patterns cannot fit; -> the room per scope."""
        lock, spec = self.lock, _spec(self.dev_key)
        split = dict(lock['split'])
        for k in ('track', 'pattern'):
            n = self.need(k)
            if n > spec['live'][k]:
                raise ModError('the mods need %d bits per %s; the %s keeps at most %d'
                               % (n, k, self.dev_key, spec['live'][k]))
            fits = lock['next'][k] + sum(f['bits'] for f in self.pending(k)) <= 8 * split[k]
            if not fits and n > 8 * split[k]:
                split[k] = -(-n // 8)
        room = capacity(self.dev_key, lock['split'], self.core)
        if split == lock['split']:
            return room
        # the pattern tracks come first in the store: they move only when their own size changes
        if split['track'] != lock['split']['track']:
            moved = ('track', 'pattern', 'project')
        else:
            moved = ('pattern', 'project')
        lock['split'] = split
        room = capacity(self.dev_key, split, self.core)
        if room['project'] < self.need('project'):
            used = (spec['items']['track'] * split['track'] + spec['items']['pattern'] * split['pattern']
                    + -(-self.need('project') // 8))
            raise ModError('the mods need %d bytes of pattern-track, pattern and project storage; '
                           'the %s has %d' % (used, self.dev_key, spec['store']))
        self.notes.append('the tagged store now keeps %d B per pattern track and %d B per pattern'
                          % (split['track'], split['pattern']))
        for k in moved:
            self.repack(k)
        return room

    def place(self, room):
        lock = self.lock
        for s in SCOPES:
            if self.need(s) > room[s]:
                most = capacity(self.dev_key, lock['split'])[s]
                hint = ''
                if most > room[s]:
                    hint = ' with core %s (%d with core %s)' % (
                        self.core, most, _room_core(self.dev_key, lock['split'], s, self.core))
                raise ModError('the mods need %d bits of %s storage; the %s has %d%s'
                               % (self.need(s), s, self.dev_key, room[s], hint))
            if any(f['offset'] is not None and f['offset'] + f['bits'] > room[s]
                   for f in self.fields if f['scope'] == s):
                self.repack(s)              # placed by a newer core, past this core's room
                continue
            waiting = self.pending(s)
            if not waiting:
                continue
            if lock['next'][s] + sum(f['bits'] for f in waiting) > room[s]:
                self.repack(s)
                continue
            for f in waiting:
                f['offset'] = lock['next'][s]
                lock['next'][s] += f['bits']


def allocate(lock, decls, dev_key, core=None):
    """Place the declared fields. lock: a lockfile, or None for a new one; decls: [(package id, sym, scope, bits)];
    core: the build's core version (None: the newest core's room). -> (the new lockfile, notes). `lock` itself is
    left unchanged."""
    new = lock is None
    if new:
        lock = fresh(dev_key)
    else:
        check_lock(lock, dev_key)
        lock = copy.deepcopy(lock)
    run = _Allocation(lock, dev_key, core)
    want = {}
    for mid, sym, scope, bits in decls:
        if any(key[1] == sym for key in want):
            raise ModError('the storage field %s is declared by two mods' % sym)
        want[(mid, sym)] = (scope, bits)
    kept = [f for f in lock['fields'] if want.get((f['mod'], f['sym'])) == (f['scope'], f['bits'])]
    gone = [f for f in lock['fields'] if want.get((f['mod'], f['sym'])) != (f['scope'], f['bits'])]
    have = {(f['mod'], f['sym']) for f in kept}
    added = [{'mod': mid, 'sym': sym, 'scope': want[(mid, sym)][0], 'offset': None, 'bits': want[(mid, sym)][1]}
             for mid, sym in sorted(want) if (mid, sym) not in have]
    # a freed field returning with the same scope and width gets its old bits: nobody was given them since
    returned = set()
    for f in added:
        same = [g for g in lock['freed']
                if (g['mod'], g['sym'], g['scope'], g['bits']) == (f['mod'], f['sym'], f['scope'], f['bits'])]
        if same:
            f['offset'] = same[-1]['offset']
            lock['freed'].remove(same[-1])
            returned.add((f['mod'], f['sym']))
    lock['freed'].extend(dict(f) for f in gone)
    run.fields, run.added = kept + added, added
    run.place(run.grow_split())
    notes, repacked = run.notes, run.repacked
    for f in gone:
        key = (f['mod'], f['sym'])
        if key in want or f['scope'] in repacked:
            notes.append('%s %s (%s): %s, its data is dropped'
                         % (f['mod'], f['sym'], f['scope'],
                            'changed size' if key in want else 'no longer in the build'))
        else:
            notes.append('%s %s (%s): no longer in the build; its bits are kept, so it gets its '
                         'values back if it returns' % (f['mod'], f['sym'], f['scope']))
    for f in added:
        if (f['mod'], f['sym']) in returned and f['scope'] not in repacked:
            notes.append('%s %s: back at bit %d of %s storage, with the values it had'
                         % (f['mod'], f['sym'], f['offset'], f['scope']))
        else:
            notes.append('%s %s: %d bits of %s storage at bit %d'
                         % (f['mod'], f['sym'], f['bits'], f['scope'], f['offset']))
    lock['fields'] = sorted(run.fields, key=lambda f: (SCOPE_NUM[f['scope']], f['offset']))
    if new:
        lock['id'] = _idstr(layout_id(lock))
        notes.insert(0, 'a new lockfile, layout ID %s: projects and sounds saved by builds with '
                        'other layouts load their mod data at defaults' % lock['id'])
    elif gone or added or repacked:     # a repack alone (past an older core's room) moves fields too
        previous = lock['id']
        lock['id'] = _idstr(layout_id(lock))
        seen, ancestors = {_idval(lock['id'], 'id')}, []
        for a in [previous] + lock['ancestors']:      # a layout can come back: no ID twice
            v = _idval(a, 'ancestor')
            if v not in seen:
                seen.add(v)
                ancestors.append(_idstr(v))
        lock['ancestors'] = ancestors[:MAX_ANCESTORS]
        notes.append('layout ID %s (from %s, whose projects it still reads)' % (lock['id'], previous))
    return lock, notes


def symbols(lock, dev_key):
    """-> ({name: value}, [ID table entries as bytes]) for the linker."""
    gen, split = lock['generation'], lock['split']
    values = {
        '__store_gen': gen['sound'] << 24 | gen['kit'] << 16 | gen['global'] << 8 | gen['track'],
        '__store_gen2': gen['pattern'] << 24 | gen['project'] << 16 | split['track'] << 8 | split['pattern'],
    }
    for f in lock['fields']:
        values[f['sym']] = SCOPE_NUM[f['scope']] << 28 | f['bits'] << 22 | f['offset']
    ids = [_idval(lock['id'], 'id')] + [_idval(a, 'ancestor') for a in lock['ancestors']]
    return values, [i.to_bytes(4, 'big') for i in ids]


def dumps(lock):
    return json.dumps(lock, indent=1) + '\n'


def trailer(lock):
    """The lockfile as a build carries it after the packages' image: TRAILER, the text's length (4 bytes,
    big-endian), dumps(lock). Nothing on the unit reads it; from_image takes it back out of a build."""
    text = dumps(lock).encode('ascii')
    return TRAILER + len(text).to_bytes(4, 'big') + text


def from_image(image):
    """A built main OS -> the lockfile it carries, or None."""
    at = bytes(image).rfind(TRAILER)
    if at < 0:
        return None
    n = int.from_bytes(image[at + 8:at + 12], 'big')
    try:
        lock = json.loads(bytes(image[at + 12:at + 12 + n]).decode('ascii'))
    except (ValueError, UnicodeDecodeError):
        raise ModError('the build\'s lockfile cannot be read')
    check_lock(lock, lock.get('device') if isinstance(lock, dict) else None)
    return lock
