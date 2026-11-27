# SPDX-License-Identifier: GPL-3.0-or-later
"""The .elemod package: the validation both formats share, format 1 (a whole build in one file), the
instruction-boundary check and applying format-1 packages. Format 2 (linkable packages) is link.py.

A package is JSON holding only its author's bytes and SHA-256 hashes of the stock bytes it expects. It can describe
changes to the main OS only, so every other section of the OS file stays stock (formats.verify checks the output).
Its "target" names the stock release by hash; that release's device profile gives the addresses, the free areas and
the instruction decoder.
"""
import glob
import hashlib
import json
import os
import re

from . import devices

FORMAT = 1
KEY, LEGACY_KEY = 'elemod', 'dtmod'        # the format marker, and its older spelling
EXTS = ('.elemod', '.dtmod')               # package file extensions, newest first

COMMON = {'elemod', 'dtmod', 'id', 'version', 'title', 'description', 'category', 'author', 'license',
          'target',
          'sites', 'resources', 'requires', 'conflicts', 'build', 'signature', 'notes'}
RELOC_SIZE = {'abs32': 4, 'pc32': 4, 'pc16': 2, 'dsp24': 3}
FOLLOW_ON = ('imports ', 'adds to table ', 'has .fast code')


class ModError(ValueError):
    pass


def sha(b):
    return hashlib.sha256(b).hexdigest()


def format_of(doc):
    """A package document's format number (1 or 2), read from either marker; None for a non-object."""
    if isinstance(doc, dict):
        return doc.get(KEY, doc.get(LEGACY_KEY))
    return None


def mod_files(folder):
    """The package files in `folder`, sorted."""
    found = []
    for ext in EXTS:
        found.extend(glob.glob(os.path.join(folder, '*' + ext)))
    return sorted(found)


def _int(v, what):
    if isinstance(v, int):
        return v
    try:
        return int(v, 0)
    except (TypeError, ValueError):
        raise ModError('%s: %r is not a number' % (what, v))


def _hex(v, what):
    try:
        return bytes.fromhex(v)
    except (TypeError, ValueError):
        raise ModError('%s: not hex' % what)


def resolve_target(doc, name):
    """The (Device, Release) a package's "target" names; ModError otherwise."""
    try:
        return devices.for_target(doc.get('target'))
    except devices.UnknownFirmware as e:
        raise ModError('%s: %s' % (name, e))


def _part_len(part):
    return len(part[1]) if part[0] == 'hex' else part[2]


def parse_parts(parts, what, dev, rel):
    """Byte parts as a package writes them, ["hex", "..."] or ["stock", addr, n], -> ('hex', bytes) or
    ('stock', addr, n). A stock part is copied from the musician's own stock image at build time, so bytes a
    package repeats from the firmware are never shipped."""
    first, end = dev.main_load, dev.image_end(rel)
    parsed = []
    for part in parts:
        if part and part[0] == 'hex' and len(part) == 2:
            parsed.append(('hex', _hex(part[1], what + ' part')))
            continue
        if part and part[0] == 'stock' and len(part) == 3:
            at, n = _int(part[1], what + ' part'), _int(part[2], what + ' part')
            if at < first or at + n > end or n <= 0:
                raise ModError('%s: a part copies 0x%08x +%d, outside the image' % (what, at, n))
            parsed.append(('stock', at, n))
            continue
        raise ModError('%s: bad part %r' % (what, part))
    return parsed


def parts_bytes(parts, image, dev):
    """Parsed parts -> their bytes, stock parts read from `image`."""
    out = bytearray()
    for part in parts:
        if part[0] == 'hex':
            out += part[1]
        else:
            start = part[1] - dev.main_load
            out += image[start:start + part[2]]
    return out


def _site_relocs(site_doc, n, what):
    relocs = []
    for reloc in site_doc.get('relocs', []):
        off, typ, tgt, add = reloc
        off = _int(off, what)
        size = RELOC_SIZE.get(typ) if isinstance(typ, str) else None
        if size is None or off < 0 or off + size > n:
            raise ModError('%s: bad relocation %r' % (what, reloc))
        relocs.append((off, typ, tgt, _int(add, what)))
    return relocs


def parse_sites(doc, name, dev, rel, relocs=False):
    """A package's "sites" -> dicts with addr, len, new, kind, stock_sha256 and relocs (format 2 only)."""
    first, end = dev.main_load, dev.image_end(rel)
    sites = []
    for i, site_doc in enumerate(doc.get('sites', [])):
        what = '%s site %d' % (name, i)
        addr, n = _int(site_doc.get('addr'), what), _int(site_doc.get('len'), what)
        new = _hex(site_doc.get('new'), what)
        if len(new) != n or n <= 0:
            raise ModError('%s: "new" is not %d bytes' % (what, n))
        if addr < first or addr + n > end:
            raise ModError('%s: 0x%08x +%d is outside the stock image' % (what, addr, n))
        if site_doc.get('kind') not in ('code', 'data'):
            raise ModError('%s: kind is "code" or "data"' % what)
        digest = site_doc.get('stock_sha256')
        if not isinstance(digest, str) or len(digest) != 64:
            raise ModError('%s: no stock_sha256' % what)
        site = {'addr': addr, 'len': n, 'new': new, 'kind': site_doc['kind'], 'stock_sha256': digest.lower(),
                'relocs': []}
        if relocs:
            site['relocs'] = _site_relocs(site_doc, n, what)
        sites.append(site)
    return sites


def parse_resources(doc, name, dev):
    """A package's resources -> (regions, names). Each region must lie inside one of the device's free areas."""
    res = doc.get('resources') or {}
    regions = []
    for region in res.get('regions', []):
        lo, hi = _int(region.get('lo'), name + ' region'), _int(region.get('hi'), name + ' region')
        if not lo < hi:
            raise ModError('%s: empty region %r' % (name, region))
        inside = [area for area, (a, z) in dev.areas.items() if a <= lo and hi <= z]
        if not inside:
            raise ModError('%s: region %s 0x%08x-0x%08x is outside every free area'
                           % (name, region.get('name'), lo, hi))
        regions.append({'name': str(region.get('name', '?')), 'lo': lo, 'hi': hi, 'area': inside[0]})
    return regions, [str(x) for x in res.get('names', [])]


def parse_needs_core(doc, name):
    """The core version resources.core asks for ("3.0"), or None."""
    wanted = (doc.get('resources') or {}).get('core')
    if wanted is None:
        return None
    if not isinstance(wanted, str) or not '0' <= wanted[:1] <= '9':
        raise ModError('%s: resources.core is the version of core it needs, such as "3.0"' % name)
    return wanted


def version_key(v):
    """A sort key for versions: digit runs compare as numbers, other runs as text after any number
    (2.9 < 2.10, 2.0 < 2.0a < 2.1)."""
    return tuple((0, int(run), '') if '0' <= run[0] <= '9' else (1, 0, run)
                 for run in re.findall(r'[0-9]+|[^0-9]+', str(v)))


def pick_core(versions, need=None, fits=None):
    """Which of `versions` (one device's cores) a build takes: the newest at least `need`. With `fits` (whether
    each core's RAM holds the selection), only fitting ones count, unless none new enough fits. -> its index, the
    last of equal versions, or None when none is new enough."""
    floor = None if need is None else version_key(need)
    candidates = [i for i, v in enumerate(versions) if floor is None or version_key(v) >= floor]
    if not candidates:
        return None
    if fits is not None:
        fitting = [i for i in candidates if fits[i]]
        if fitting:
            candidates = fitting
    return max(candidates, key=lambda i: (version_key(versions[i]), i))


def read_json(path):
    with open(path, 'rb') as fh:
        raw = fh.read()
    try:
        return json.loads(raw.decode('utf-8')), raw
    except (UnicodeDecodeError, json.JSONDecodeError) as e:
        raise ModError('%s: not JSON (%s)' % (path, e))


def load_any(path):
    """A package file -> Mod (format 1) or link.Mod2 (format 2)."""
    doc, raw = read_json(path)
    if format_of(doc) == 2:
        from . import link
        return link.Mod2(doc, os.path.basename(path), raw)
    return Mod(doc, os.path.basename(path), raw)


class Mod:
    """A format-1 package: one whole build, as sites and at most one appended blob."""

    def __init__(self, doc, name='<mod>', raw=None):
        self.doc, self.name = doc, name
        self.sha256 = None if raw is None else sha(raw)
        if format_of(doc) != FORMAT:
            raise ModError('%s: not a format-%d .elemod file' % (name, FORMAT))
        missing = next((k for k in ('id', 'version', 'target', 'sites') if k not in doc), None)
        if missing:
            raise ModError('%s: no "%s"' % (name, missing))
        unknown = set(doc) - COMMON - {'ele3_version', 'blob'}
        if unknown:
            raise ModError('%s: unknown fields %s' % (name, sorted(unknown)))
        self.id, self.version = str(doc['id']), str(doc['version'])
        self.dev, self.rel = resolve_target(doc, name)
        self._check_version_field(doc.get('ele3_version'))
        self.sites = parse_sites(doc, name, self.dev, self.rel)
        self.blob = None if doc.get('blob') is None else self._parse_blob(doc['blob'])
        self.regions, self.names = parse_resources(doc, name, self.dev)
        self.requires = [str(x) for x in doc.get('requires', [])]
        self.conflicts = [str(x) for x in doc.get('conflicts', [])]

    def _check_version_field(self, shown):
        if shown is None:
            return
        length = len(shown.encode('ascii', 'replace')) if isinstance(shown, str) else -1
        exact = self.dev.container == 'ele3'
        if (exact and length != self.dev.version_len) or not 0 < length <= self.dev.version_len:
            raise ModError('%s: ele3_version is %s %d ASCII characters on the %s'
                           % (self.name, 'exactly' if exact else 'up to', self.dev.version_len, self.dev.name))

    def _parse_blob(self, blob):
        name, dev = self.name, self.dev
        load, n = _int(blob.get('load'), name + ' blob'), _int(blob.get('len'), name + ' blob')
        parts = parse_parts(blob.get('parts', []), name + ' blob', dev, self.rel)
        total = sum(_part_len(p) for p in parts)
        if total != n:
            raise ModError('%s: blob parts make %d bytes, not %d' % (name, total, n))
        if dev.blob_max is not None:
            room = dev.blob_max
        else:
            room = dev.ddr[1] - dev.ddr[0] if dev.linkable() else None
        if room is not None and n > room:
            raise ModError('%s: blob of %d bytes is over the %d the %s allows' % (name, n, room, dev.name))
        return {'load': load, 'len': n, 'sha256': str(blob.get('sha256', '')).lower(), 'parts': parts}

    @classmethod
    def load(cls, path):
        doc, raw = read_json(path)
        return cls(doc, os.path.basename(path), raw)

    def label(self):
        return '%s %s' % (self.id, self.version)


# ---- instruction boundaries -----------------------------------------------------------------------------------

def insn_check(image, addr, n, dev, sweeps=32):
    """Whether image bytes [addr, addr+n) (image loaded at dev.main_load) are whole instructions. -> (ok, note).

    The end is exact: decoding from addr must reach addr+n without an illegal word. The start is checked by `sweeps`
    linear sweeps begun 32 to 94 bytes earlier (in steps of 2), which must all land on addr: a ColdFire instruction
    stream resynchronises within a few words, so a sweep stepping over addr shows addr may be mid-instruction."""
    isa = dev.decoder()
    read = isa.reader(image, dev.main_load)
    refused = isa.ILLEGAL | isa.LINEF | isa.FPU
    end = addr + n
    pc = addr
    while pc < end:
        ins = isa.decode(read(pc), pc)
        if ins.flags & refused:
            return False, '0x%08x does not decode' % pc
        pc += ins.length
    if pc != end:
        return False, 'ends mid-instruction (0x%08x)' % pc
    landed = tried = 0
    for back in range(16, 16 + sweeps):
        pc = addr - 2 * back
        if pc < dev.main_load:
            break
        while pc < addr:
            pc += isa.decode(read(pc), pc).length
        tried += 1
        if pc == addr:
            landed += 1
    if landed != tried:
        return False, 'only %d of %d sweeps land on the start' % (landed, tried)
    return True, 'whole instructions'


# ---- static checks and applying format 1 ----------------------------------------------------------------------

def overlaps(spans):
    """Every pair of spans (lo, hi, ...) that share a byte, in sorted order."""
    ordered = sorted(spans, key=lambda s: (s[0], s[1]))
    pairs = []
    for i, first in enumerate(ordered):
        for later in ordered[i + 1:]:
            if later[0] >= first[1]:
                break
            pairs.append((first, later))
    return pairs


def same_target(mods):
    """A problem when the packages were made for different firmware."""
    if len({(m.dev.key, m.rel.version) for m in mods}) <= 1:
        return []
    return ['the mods are for different firmware: %s'
            % ', '.join('%s (%s %s)' % (m.label(), m.dev.name, m.rel.version) for m in mods)]


def _relation_problems(mods):
    ids = [m.id for m in mods]
    found = ['mod %s is given %d times' % (i, ids.count(i)) for i in sorted(set(ids)) if ids.count(i) > 1]
    for m in mods:
        found += ['%s requires %s' % (m.label(), r) for r in m.requires if r not in ids]
        found += ['%s conflicts with %s' % (m.label(), c) for c in m.conflicts if c in ids]
    return found


def common_checks(mods, image, spans):
    """The checks shared by both formats. spans: (lo, hi, mod, what) of image bytes each package changes or
    claims. -> problems."""
    bad = same_target(mods) + _relation_problems(mods)
    for a, b in overlaps(spans):
        if a[2] is b[2] and a[3] == b[3]:
            continue
        bad.append('%s %s and %s %s overlap (0x%08x-0x%08x)'
                   % (a[2].label(), a[3], b[2].label(), b[3], b[0], min(a[1], b[1])))
    claimed = {}
    for m in mods:
        for nm in m.names:
            if nm in claimed and claimed[nm] is not m:
                bad.append('%s and %s both claim %s' % (claimed[nm].label(), m.label(), nm))
            claimed[nm] = m
    if bad and bad[0].startswith('the mods are for different firmware'):
        return bad
    dev = mods[0].dev
    for m in mods:
        for s in m.sites:
            for lo, hi, why in dev.protected:
                if s['addr'] < hi and lo < s['addr'] + s['len']:
                    bad.append('%s site 0x%08x is inside 0x%08x-0x%08x, %s: protected on the %s'
                               % (m.label(), s['addr'], lo, hi, why, dev.name))
    for m in mods:
        for s in m.sites:
            start = s['addr'] - dev.main_load
            if sha(image[start:start + s['len']]) != s['stock_sha256']:
                bad.append('%s site 0x%08x: the stock bytes are not the ones it expects' % (m.label(), s['addr']))
                continue
            if s['kind'] == 'code':
                ok, note = insn_check(image, s['addr'], s['len'], dev)
                if not ok:
                    bad.append('%s site 0x%08x: %s' % (m.label(), s['addr'], note))
    return bad


def summarize(problems, mods):
    """The check's problems as a person reads them: a package lacking a requirement, or needing a newer core than
    the build's, shows that rather than the unresolved imports and tables it causes; repeats merge with a count; a
    build with no core says the core is not enabled."""
    ids = {m.id for m in mods}
    lacking = {m.label() for m in mods if any(r not in ids for r in m.requires)}
    cores = [m for m in mods if '.boot' in getattr(m, 'sections', {})]
    if len(cores) == 1:
        core_key = version_key(cores[0].version)
        lacking |= {m.label() for m in mods
                    if getattr(m, 'needs_core', None) and core_key < version_key(m.needs_core)}
    kept, counts = [], {}
    for line in problems:
        if any(line.startswith(lab + ' ') and any(f in line for f in FOLLOW_ON) for lab in lacking):
            continue
        if line.startswith('exactly one mod must carry .boot') and line.endswith('got none'):
            line = 'core is not enabled, and every other mod builds on it'
        if line not in counts:
            kept.append(line)
            counts[line] = 0
        counts[line] += 1
    return [line if counts[line] == 1 else '%s (%d times)' % (line, counts[line]) for line in kept]


def check(mods, image):
    """The static conflict check for format-1 packages. -> problems."""
    spans = []
    for m in mods:
        spans += [(s['addr'], s['addr'] + s['len'], m, 'site 0x%08x' % s['addr']) for s in m.sites]
        if m.blob:
            spans.append((m.blob['load'], m.blob['load'] + m.blob['len'], m, 'blob'))
    bad = common_checks(mods, image, spans)
    regions = [(g['lo'], g['hi'], m, 'region ' + g['name']) for m in mods for g in m.regions]
    bad += ['%s %s and %s %s overlap (0x%08x-0x%08x)' % (a[2].label(), a[3], b[2].label(), b[3], b[0],
                                                         min(a[1], b[1]))
            for a, b in overlaps(regions)]
    with_blob = [m for m in mods if m.blob]
    if len(with_blob) > 1:
        bad.append('more than one whole build (%s)' % ', '.join(m.label() for m in with_blob))
    for m in with_blob:
        end = m.dev.image_end(m.rel)
        if m.blob['load'] != end:
            bad.append('%s: its blob loads at 0x%08x, not the image end 0x%08x' % (m.label(), m.blob['load'], end))
    return bad


def blob_bytes(mod, image):
    """A package's blob with its stock parts read from `image`, checked against its hash."""
    data = bytes(parts_bytes(mod.blob['parts'], image, mod.dev))
    if sha(data) != mod.blob['sha256']:
        raise ModError('%s: the blob does not assemble to its sha256' % mod.label())
    return data


def apply(mods, image):
    """Format-1 packages -> the patched main OS. Every problem the check finds is raised together, and nothing is
    applied unless there are none."""
    rel = mods[0].rel
    if sha(image) != rel.main_sha256:
        raise ModError('the stock main OS is not %s %s' % (mods[0].dev.name, rel.version))
    bad = summarize(check(mods, image), mods)
    if bad:
        raise ModError('the mods do not combine:\n  ' + '\n  '.join(bad))
    load = mods[0].dev.main_load
    patched = bytearray(image)
    for m in mods:
        for s in m.sites:
            patched[s['addr'] - load:s['addr'] - load + s['len']] = s['new']
    for m in mods:
        if m.blob:
            patched += blob_bytes(m, image)
    return bytes(patched)
