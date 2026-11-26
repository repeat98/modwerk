# SPDX-License-Identifier: MIT
"""Private exact table-owner association and fixed board trust storage.

The caller reviews the complete source/recipe/layout declaration separately.
This checks that association and the three table splices in the real package;
it never supplies hardware evidence or grants public admission.
"""
from dataclasses import dataclass
from pathlib import Path
import re
import struct
from machine_layout import _envelope, _integer, _json, _sha, SHA, participants

CAPACITY, HEADER, RECORD = 24, 16, 60
BYTES = HEADER + CAPACITY * RECORD
REST_FLAG = 0x80  # loader.h RUNTIME_SITE_RESTS: bit 7 of a site's length byte (build.py REST_FLAG)
SCHEMA = 'modwerk-table-layout-v1'
PARTICIPANT_SCHEMA = 'modwerk-table-layout-v2'
ANALOG_BD_SCHEMA = 'modwerk-table-layout-v3'
KEYS = frozenset(('schema', 'packageSha256', 'imageSha256', 'compiledImageSha256', 'recipeSha256',
                  'family', 'stateLayoutRevision', 'parameterLayoutRevision', 'arrayOffsets', 'tableSymbols', 'sources'))
ENTRY_KEYS = frozenset(('package', 'declaration', 'recipe', 'reviewed_sha256', 'source_root'))
SHAPES = {
    'quantizer': (1, 3, 3, 3, 0x7e9d5687, (0x400b27d0, 0x400b27dc, 0x400b282c),
                  ((0x40065bd8,), (0x40065bde,), (0x40065cc4, 0x40065d3e, 0x40065d58, 0x40065d72)),
                  0x40065c7c, bytes((0x48, 0x78, 0, 6))),
    'mute-modes': (2, 16, 2, 1, 0x73bab3b1, (0x400b2a34, 0x400b2a74, 0x400b2ac0),
                   ((0x40068efe,), (0x40068f0a,), (0x40069022, 0x4006903e, 0x40069056)),
                   0x40068fb2, bytes((0x72, 0x10))),
}


@dataclass(frozen=True)
class ReviewedTableLayout:
    family: int
    module_id: int
    state_revision: int
    parameter_revision: int
    package_sha256: str
    offsets: tuple


def empty():
    return b'MWTD' + bytes((1, 0, CAPACITY)) + bytes(BYTES - 7)


def _hookless(package):
    """A table owner that is no group may carry hook words since the events migration (Mute Modes subscribes and
    raises): loader.h's core handlers and site-event words, each unused or an even image offset. Checked here, the
    rest of the package goes through machine_layout's unchanged envelope as the same package without them."""
    if not isinstance(package, bytes) or len(package) < 76:
        return package
    image_size, hooks = struct.unpack_from('>I', package, 8)[0], struct.unpack_from('>I', package, 20)[0]
    if not hooks:
        return package
    if hooks > 4 + 64 or len(package) < 76 + 4 * hooks:
        raise ValueError('Invalid table owner hook words.')
    words = struct.unpack_from('>%dI' % hooks, package, 76)
    if any(w != 0xffffffff and ((w if i < 4 else w & 0xffffff) >= image_size or w & 1) for i, w in enumerate(words)):
        raise ValueError('Invalid table owner hook word.')
    return package[:20] + bytes(4) + package[24:76] + package[76 + 4 * hooks:]


def _restless(package):
    """A table owner that subscribes ev_in_use may mark its own detours as resting (runtime.json "rests"): bit 7 of
    each such site's length byte. machine_layout's unchanged envelope reads the same package with that bit clear;
    validate() itself refuses it on the table pointer and count sites, which must hold while the module rests."""
    if not isinstance(package, bytes) or len(package) < 76:
        return package
    out = bytearray(package)
    image_size = struct.unpack_from('>I', package, 8)[0]
    relocations, hooks, sites = struct.unpack_from('>III', package, 16)
    at = 76 + 4 * hooks + image_size + 4 * relocations
    for _ in range(sites):
        if at + 40 > len(package):
            raise ValueError('A table owner site exceeds its package.')
        out[at + 4] &= ~REST_FLAG & 0xff
        at += 40 + out[at + 4] + 2 * package[at + 7]
    return bytes(out)


def validate(package, declaration, recipe, *, reviewed_sha256, source_root):
    if (not isinstance(reviewed_sha256, str) or not SHA.fullmatch(reviewed_sha256) or
            not isinstance(declaration, bytes) or _sha(declaration) != reviewed_sha256):
        raise ValueError('The independently reviewed table declaration changed.')
    doc, captured = _json(declaration, 65536), _json(recipe, 1048576)
    explicit = isinstance(doc, dict) and doc.get('schema') in (PARTICIPANT_SCHEMA, ANALOG_BD_SCHEMA)
    if (not isinstance(doc, dict) or set(doc) != KEYS | ({'participants'} if explicit else set()) or
            doc.get('schema') not in (SCHEMA, PARTICIPANT_SCHEMA, ANALOG_BD_SCHEMA) or
            not isinstance(doc['family'], str) or doc['family'] not in SHAPES):
        raise ValueError('Unsupported private table declaration.')
    for key in ('packageSha256', 'imageSha256', 'compiledImageSha256', 'recipeSha256'):
        if not isinstance(doc[key], str) or not SHA.fullmatch(doc[key]): raise ValueError('Invalid declared file SHA256.')
    if not all(_integer(doc[key], 1, 65535) for key in ('stateLayoutRevision', 'parameterLayoutRevision')):
        raise ValueError('Explicit positive state/parameter revisions are required.')
    group = isinstance(package, bytes) and len(package) >= 8 and package[7] == 4
    image, mask, parameters, module = _envelope(_restless(_hookless(package)) if not group else package, group=group)
    family, count, insert, added, identity, roots, refs, count_at, count_code = SHAPES[doc['family']]
    analog_bd = doc.get('schema') == ANALOG_BD_SCHEMA and isinstance(doc.get('participants'), list) and 'analog-bassdrum' in doc['participants']
    optional = participants(mask, doc['participants'], analog_bd=analog_bd) if explicit and group else False
    if explicit and not group:
        raise ValueError('Explicit group participants require an actual canonical group.')
    if module != identity and not (family == 1 and group and (mask & 4 or optional) and module == 0xdb769930):
        raise ValueError('The exact package is not this canonical table owner.')
    if (_sha(package) != doc['packageSha256'] or _sha(image) != doc['imageSha256'] or parameters != doc['parameterLayoutRevision']):
        raise ValueError('Package identity/parameter layout changed.')
    sources = doc['sources']
    if (not isinstance(captured, dict) or not _integer(captured.get('schema'), 1, 1) or _sha(recipe) != doc['recipeSha256'] or
            captured.get('imageSha256') != doc['compiledImageSha256'] or not isinstance(sources, dict) or not sources or
            captured.get('sources') != sources):
        raise ValueError('Compiled/encoded image, recipe or source association changed.')
    root = Path(source_root).resolve()
    for name, digest in sources.items():
        path = Path(name)
        if (not name or path.is_absolute() or '..' in path.parts or path.as_posix() != name or
                not isinstance(digest, str) or not SHA.fullmatch(digest)):
            raise ValueError('Invalid reviewed source path/hash.')
        target = (root / path).resolve()
        if not target.is_relative_to(root) or not target.is_file() or _sha(target.read_bytes()) != digest:
            raise ValueError('Reviewed table source changed or escaped its snapshot.')
    offsets, names = doc['arrayOffsets'], doc['tableSymbols']
    if (not isinstance(offsets, list) or len(offsets) != 3 or not isinstance(names, list) or len(names) != 3 or
            any(not isinstance(n, str) or not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', n) for n in names) or len(set(names)) != 3 or
            not isinstance(captured.get('symbols'), dict)):
        raise ValueError('All three exact linked table symbols are required.')
    length = 4 * (count + added)
    for i, offset in enumerate(offsets):
        if (not _integer(offset, 0, len(image) - length) or offset & 3 or captured['symbols'].get(names[i]) != offset or
                any(offset < old + length and old < offset + length for old in offsets[:i])):
            raise ValueError('A table moved, overlapped or escaped its exact image.')
    relocation_count, site_count = struct.unpack_from('>I', package, 16)[0], struct.unpack_from('>I', package, 24)[0]
    copies, fills = struct.unpack_from('>II', package, 68)
    at = 76 + 4 * struct.unpack_from('>I', package, 20)[0] + len(image)  # past any hook words (_hookless checked them)
    relocations = struct.unpack_from('>%dI' % relocation_count, package, at)
    at += 4 * relocation_count
    sites, resting = {}, set()
    for _ in range(site_count):
        address, n, keep, checked, r = struct.unpack_from('>IBBBB', package, at)
        if n & REST_FLAG and not group:
            resting.add(address)
            n &= ~REST_FLAG & 0xff
        code = package[at + 40:at + 40 + n]
        local = struct.unpack_from('>%dH' % r, package, at + 40 + n)
        sites[address] = (code, keep, checked, local, package[at + 8:at + 40])
        at += 40 + n + 2 * r
    copied = []
    for _ in range(copies):
        offset, address, n = struct.unpack_from('>IIH', package, at)
        copied.append((offset, address, n))
        at += 44
    # No fill may reconstruct a pointer table. _envelope already rejects
    # overlaps between these copy spans, fills and authored relocations.
    for _ in range(fills):
        offset, n = struct.unpack_from('>II', package, at)
        if any(offset < base + length and base < offset + n for base in offsets): raise ValueError('A table cannot use a constant fill.')
        at += 12
    for table, base in enumerate(offsets):
        for row in range(count + added):
            word_at = base + 4 * row
            if insert <= row < insert + added:
                if word_at not in relocations or struct.unpack_from('>I', image, word_at)[0] >= len(image):
                    raise ValueError('An inserted table pointer is not an exact authored relocation.')
            else:
                original = roots[table] + 4 * (row if row < insert else row - added)
                cover = [(offset, address, n) for offset, address, n in copied if offset <= word_at and word_at + 4 <= offset + n]
                if len(cover) != 1 or cover[0][1] + word_at - cover[0][0] != original:
                    raise ValueError('Every original table word needs its exact stock-copy mapping.')
        for reference in refs[table]:
            expected = (struct.pack('>I', base), 0, 4, (0,), bytes.fromhex(_sha(struct.pack('>I', roots[table]))))
            if sites.get(reference) != expected: raise ValueError('A table pointer site or original-stock guard changed.')
    if count_at not in sites or sites[count_at][:4] != (count_code, 0, len(count_code), ()):
        raise ValueError('The reviewed table count patch changed.')
    if resting & ({count_at} | {reference for table in refs for reference in table}):
        raise ValueError('A table pointer or count site cannot rest with its module.')
    return ReviewedTableLayout(family, module, doc['stateLayoutRevision'], parameters, doc['packageSha256'], tuple(offsets))


def generate(entries):
    if not isinstance(entries, (list, tuple)) or len(entries) > CAPACITY:
        raise ValueError('Private table records exceed their fixed capacity.')
    if any(not isinstance(item, dict) or set(item) != ENTRY_KEYS for item in entries):
        raise ValueError('Exact independently reviewed table inputs are required.')
    records = sorted((validate(**item) for item in entries), key=lambda item: item.package_sha256)
    if len({item.package_sha256 for item in records}) != len(records): raise ValueError('Duplicate trusted table package.')
    output = bytearray(empty());output[5] = len(records)
    for i, item in enumerate(records):
        count, insert, added = (3, 3, 3) if item.family == 1 else (16, 2, 1)
        record = struct.pack('>32sIHHBBBB3I4x', bytes.fromhex(item.package_sha256), item.module_id,
                             item.state_revision, item.parameter_revision, item.family, count, insert, added, *item.offsets)
        output[HEADER + i * RECORD:HEADER + (i + 1) * RECORD] = record
    return bytes(output)


def fill_reserved(image, offset, table):
    if (not isinstance(image, bytes) or type(offset) is not int or offset < 0 or offset > len(image) - BYTES or
            not isinstance(table, bytes) or len(table) != BYTES or image[offset:offset + BYTES] != empty()):
        raise ValueError('Missing, moved or already filled fixed table-owner storage.')
    return image[:offset] + table + image[offset + BYTES:]


def assert_stable_reserved(before, after, before_symbols, after_symbols, machine_offset, table_offset, identity_ranges=()):
    """No relink/address/guard cycles: both fixed tables plus exact identity only.

    Caller retains exact package hashes independently and fills independently
    reviewed records only. This check supplies no declaration review/evidence.
    """
    from machine_declarations import BYTES as MACHINE_BYTES, empty as machine_empty
    if (not isinstance(before, bytes) or not isinstance(after, bytes) or len(before) != len(after) or
            not isinstance(before_symbols, dict) or before_symbols != after_symbols):
        raise ValueError('Trusted storage filling moved image bounds or linked symbols.')
    spans = []
    for offset, original in ((machine_offset, machine_empty()), (table_offset, empty())):
        if (type(offset) is not int or offset < 0 or offset > len(before) - len(original) or
                before[offset:offset + len(original)] != original or
                any(offset < hi and lo < offset + len(original) for lo, hi in spans)):
            raise ValueError('Fixed machine/table reservations moved or overlap.')
        spans.append((offset, offset + len(original)))
    for span in identity_ranges:
        if (not isinstance(span, (tuple, list)) or len(span) != 2 or any(type(v) is not int for v in span) or
                not 0 <= span[0] < span[1] <= len(before) or any(span[0] < hi and lo < span[1] for lo, hi in spans)):
            raise ValueError('Invalid or overlapping exact identity span.')
        spans.append(tuple(span))
    if any(a != b and not any(lo <= i < hi for lo, hi in spans) for i, (a, b) in enumerate(zip(before, after))):
        raise ValueError('Filling trusted storage changed other bytes/package guards.')
    return dict(machineTableSha256=_sha(after[machine_offset:machine_offset + MACHINE_BYTES]),
                tableOwnerSha256=_sha(after[table_offset:table_offset + BYTES]), imageBytes=len(after),
                linkedSymbols=len(before_symbols), stable=True)
