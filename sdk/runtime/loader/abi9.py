#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""ABI 9 packages: base features and DSP claims (README.md, "Base features and DSP claims"); ABI 10 engines for the base's
hook sites (README.md, "Engines at hook sites": `engine`), and the controller digest a base trusts a controller by
(`controller_sha256`, as the loader computes it).

  python3 -B sdk/runtime/loader/abi9.py IN.mwrm -o OUT.mwrm --requires keybus [--claim y:0:r:0x800:0x200]

Takes a DSP package build.py made (ABI 6, 7 or 8, with DSP code) and writes the same package as ABI 9: the ABI 8 header
(76 bytes, copy and fill counts included) plus `requires` u16 (the base feature bits it needs, by name from
sdk/machines/octatrack/dsp-sites.json), the claim count u8 and the hook-entry count u8; after the fills, a 12-byte record
per claim (space, core, access, 0, address u32, words u32) and an 8-byte record per hook entry (site, cores, 0 u16, DSP
word u32), then the DSP words as before. Nothing else changes: image, relocations, sites, copies and fills are copied
byte for byte, so the stock-free checks and recipes that hold for the input hold for the output. Kept apart from build.py,
whose own hash is an input of the reviewed machine and standalone recipes.

A claim names X/Y words the DSP code reads or writes outside its own slot. A reader of a base feature (a KEYBUS reader)
needs no claim on the feature's words: the base owns them and keeps buffers off them while it holds the feature. It may
declare reads wholly inside a feature it requires (RINGMOD SC does, so its reads are on record); the base admits those
and refuses any write, or any read reaching past such a feature, on a feature's words. Hook entries (a site of the base's DSP catalogue and an entry
in the DSP code) are encoded and checked, and every base refuses them until a hook-slot lifecycle exists.
"""
import argparse
import json
from pathlib import Path
import struct

HERE = Path(__file__).resolve().parent
REGISTRY = HERE.parents[1] / 'machines/octatrack/dsp-sites.json'
CLAIMS, HOOK_ENTRIES = 16, 8  # loader.h's RUNTIME_DSP_CLAIMS, RUNTIME_DSP_HOOK_ENTRIES
HEADERS = {4: 32, 5: 50, 6: 68, 7: 72, 8: 76, 9: 80, 10: 80}
ACCESS = {'r': 1, 'w': 2, 'rw': 3}
INIT, BOTH_CORES = 4, 2  # loader.h RUNTIME_CLAIM_INIT, RUNTIME_CLAIM_BOTH_CORES
DSP_WORDS, INIT_WORDS = 4096, 4096  # loader.h RUNTIME_DSP_WORDS, RUNTIME_DSP_INIT_WORDS


def base_features(names, registry=REGISTRY):
    """Base feature names (dsp-sites.json's features, e.g. keybus) as `requires` bits."""
    features = {f['name']: f['bit'] for f in json.loads(Path(registry).read_text())['features']}
    unknown = sorted(n for n in names if n not in features)
    if unknown:
        raise ValueError('No base feature %s (dsp-sites.json has %s).' % (', '.join(unknown), ', '.join(features)))
    return sum(features[n] for n in set(names))


def _meet(a, b):
    (sa, ca, aa, na), (sb, cb, ab, nb) = a, b
    return (aa >= 0x30000 and ab >= 0x30000 or (sa, ca) == (sb, cb)) and aa < ab + nb and ab < aa + na


def records(claims, entries, words):
    """The claim and hook-entry records, checked as the loader checks them. claims: (space 'x'|'y', core 0|1,
    access 'r'|'w'|'rw', address, words); entries: (site index, cores mask 1..3, DSP word)."""
    if len(claims) > CLAIMS or len(entries) > HOOK_ENTRIES or ((claims or entries) and not words):
        raise ValueError('Claims and hook entries need DSP code; at most %d and %d.' % (CLAIMS, HOOK_ENTRIES))
    out, spans = b'', []
    for space, core, access, address, n in claims:
        if space not in ('x', 'y') or core not in (0, 1) or access not in ACCESS or not 0 < n or \
                not 0 <= address < 0x40000 or address + n > 0x40000 or address < 0x30000 < address + n:
            raise ValueError('A DSP claim is a span of one core\'s X or Y memory, or of the shared window, never both.')
        span = (space, core, address, n)
        if any(_meet(span, s) for s in spans):
            raise ValueError('Two DSP claims of the package meet.')
        spans.append(span)
        out += struct.pack('>BBBxII', 1 if space == 'x' else 2, core, ACCESS[access], address, n)
    sites = set()
    for site, cores, entry in entries:
        if not 0 <= site < 256 or site in sites or cores not in (1, 2, 3) or not 0 <= entry < words:
            raise ValueError('A hook entry names one site once, its cores and one of its DSP words.')
        sites.add(site)
        out += struct.pack('>BBHI', site, cores, 0, entry)
    return out


def upgrade(data, requires=0, claims=(), entries=()):
    """`data` (an ABI 6, 7 or 8 package with DSP code) as ABI 9."""
    if data[:4] != b'MWRM' or len(data) < 68:
        raise ValueError('Not a runtime package.')
    abi, flags = struct.unpack_from('>HH', data, 4)
    if abi not in (6, 7, 8):
        raise ValueError('ABI 9 extends an ABI 6, 7 or 8 package; this one is ABI %d.' % abi)
    if not 0 <= requires < 0x10000:
        raise ValueError('requires is a 16-bit mask of base features.')
    words, relocations = struct.unpack_from('>IH', data, 32)
    if not words:
        raise ValueError('ABI 9 describes DSP code: the package has none.')
    tail = 4 * words + 2 * relocations
    header, body = HEADERS[abi], data[HEADERS[abi]:]
    if len(body) < tail:
        raise ValueError('The package is shorter than its DSP code.')
    image, _, count, hooks, sites = struct.unpack_from('>IIIII', data, 8)
    if abi == 6:
        # ABI 6 site records carry stock bytes and its relocations may come in any order: ABI 7 on reads neither so.
        offsets = struct.unpack_from('>%dI' % count, data, header + 4 * hooks + image)
        if sites or any(b < a + 4 for a, b in zip(offsets, offsets[1:])):
            raise ValueError('An ABI 6 package with stock-code sites or unordered relocations cannot become ABI 9.')
    counts = data[68:76] if abi == 8 else data[68:72] + bytes(4) if abi == 7 else bytes(8)
    added = records(claims, entries, words)
    head = data[:4] + struct.pack('>HH', 9, flags) + data[8:68] + counts + struct.pack('>HBB', requires, len(claims), len(entries))
    return head + body[:len(body) - tail] + added + body[len(body) - tail:]


def _claims_end(data):
    """The offset where a package's DSP part begins: after its header, hooks, image, relocations, sites, copies and fills
    (the loader's `p` before the claims)."""
    abi = struct.unpack_from('>H', data, 4)[0]
    image, _, count, hooks, sites = struct.unpack_from('>IIIII', data, 8)
    at = HEADERS[abi] + 4 * hooks + image + 4 * count
    for _ in range(sites):
        n, r = (data[at + 4], data[at + 7]) if abi >= 7 else struct.unpack_from('>HH', data, at + 4)
        at += 8 + (32 if abi >= 7 else n) + n + 2 * r
    copies = struct.unpack_from('>I', data, 68)[0] if abi >= 7 else 0
    fills = struct.unpack_from('>I', data, 72)[0] if abi >= 8 else 0
    return at + copies * 44 + fills * 12


def controller_sha256(data):
    """SHA-256 of what is not DSP (loader.h controller_sha256): the header with its DSP fields zeroed (bytes 32-49 from
    ABI 5, 76-79 from ABI 9), then everything up to the claims."""
    abi = struct.unpack_from('>H', data, 4)[0]
    header = HEADERS[abi]
    head = bytes(0 if (abi >= 5 and 32 <= i < 50) or (abi >= 9 and i >= 76) else data[i] for i in range(header))
    import hashlib
    return hashlib.sha256(hashlib.sha256(head).digest() + hashlib.sha256(data[header:_claims_end(data)]).digest()).hexdigest()


def engine(data, words, relocations, site, cores, exit=0, claims=(), requires=0):
    """`data` (an ABI 4 to 8 package with no DSP code: a controller) as ABI 10 with an engine for one of the base's hook
    sites: `words` at base 0, `relocations` (an index, | 0x8000 for a word holding a fixed P address), entered at word
    0 from site `site` on `cores` (bit 0 core 0, bit 1 core 1), `exit` 0 or the word holding a long branch's
    displacement the base points at the site's exit. `claims`: (space, core 0|1|2, address, initial words), each
    written with its initial words before the base enables the hooks (core 2: the same span on both cores)."""
    if data[:4] != b'MWRM' or len(data) < 32:
        raise ValueError('Not a runtime package.')
    abi, flags = struct.unpack_from('>HH', data, 4)
    if abi not in (4, 5, 6, 7, 8) or (abi >= 5 and struct.unpack_from('>I', data, 32)[0]):
        raise ValueError('An engine joins a controller package with no DSP code (ABI 4 to 8).')
    if not 0 < len(words) <= DSP_WORDS or any(not 0 <= w <= 0xffffff for w in words) or len(relocations) > 256:
        raise ValueError('An engine is 1 to %d 24-bit words with at most 256 relocations.' % DSP_WORDS)
    at = [r & 0x7fff for r in relocations]
    if at != sorted(set(at)) or (at and at[-1] >= len(words)) or \
            any(not r & 0x8000 and words[r] >= len(words) for r in relocations):
        raise ValueError('Engine relocations rise, lie inside it, and an address one holds an offset into it.')
    if not 0 <= site < 256 or cores not in (1, 2, 3) or not 0 <= exit < len(words) or exit in at:
        raise ValueError('An engine enters at one site on its cores; its exit is one of its words and no relocation.')
    records, init = b'', []
    for space, core, address, values in claims:
        if space not in ('x', 'y') or core not in (0, 1, 2) or not values or any(not 0 <= w <= 0xffffff for w in values):
            raise ValueError('An engine claim is X or Y on core 0, 1 or both (2), with 24-bit initial words.')
        records += struct.pack('>BBBxII', 1 if space == 'x' else 2, core, ACCESS['rw'] | INIT, address, len(values))
        init += values
    if len(claims) > CLAIMS or len(init) > INIT_WORDS:
        raise ValueError('At most %d claims and %d initial words.' % (CLAIMS, INIT_WORDS))
    header = HEADERS[abi]
    head = bytearray(data[:header].ljust(80, b'\0'))
    if abi < 5:  # the DSP descriptor and name (ABI 5 and 6) were not there: an ABI 4 header gains them as zeros
        head[32:] = bytes(48)
    head[4:6] = struct.pack('>H', 10)
    head[32:50] = struct.pack('>IHBBHHHBBH', len(words), len(relocations), 0, 0, 0, 0, 0, 0, 0, 0)  # slots 0: an engine
    if abi < 7:
        head[68:76] = bytes(8)
    elif abi == 7:
        head[72:76] = bytes(4)
    head[76:80] = struct.pack('>HBB', requires, len(claims), 1)
    end = _claims_end(data)
    body = data[header:end]
    entry = struct.pack('>BBHI', site, cores, exit, 0)
    tail = b''.join(struct.pack('>I', w) for w in words) + b''.join(struct.pack('>H', r) for r in relocations) + \
        b''.join(struct.pack('>I', w) for w in init)
    if len(data) != end:
        raise ValueError('The controller package has bytes past its fills.')
    return bytes(head) + body + records + entry + tail


def parse_claim(text):
    space, core, access, address, words = text.split(':')
    return space, int(core), access, int(address, 0), int(words, 0)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('package', type=Path)
    parser.add_argument('-o', '--output', type=Path, required=True)
    parser.add_argument('--requires', action='append', default=[], metavar='FEATURE', help='a base feature, e.g. keybus')
    parser.add_argument('--claim', action='append', default=[], metavar='SPACE:CORE:ACCESS:ADDRESS:WORDS',
                        help='X/Y words read (r) or written (w, rw) outside the slot, e.g. y:0:w:0x7a0:16')
    args = parser.parse_args()
    try:
        data = upgrade(args.package.read_bytes(), base_features(args.requires), [parse_claim(c) for c in args.claim])
    except ValueError as error:
        parser.error(str(error))
    args.output.write_bytes(data)
    print('%s: ABI 9, requires %#x, %d claims, %d bytes' % (args.output, struct.unpack_from('>H', data, 76)[0], data[78], len(data)))


if __name__ == '__main__':
    main()
