#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Build a runtime module package (MWRM, ABI 4, 6 with DSP code, 7 from a catalogue module's manifest; README.md).

From C sources (handlers found by name, modwerk_module.h):

    python3 -B sdk/runtime/loader/build.py MODULE.c [MORE.c ...] -o MODULE.mwrm

From a catalogue module converted by Elekloader (build_ports.py), with its
patches to stock code; the package then holds stock bytes, so keep it private:

    python3 -B sdk/runtime/loader/build.py --elemod MOD.elemod --stock OS.bin \\
        --upstream ~/.cache/modwerk-upstream/elekloader --base-symbols BASE/symbols.json -o MOD.mwrm

C modules are linked twice, at 0 and at 0x10000; the 32-bit words that differ
by exactly 0x10000 are their references to themselves, any other difference
is refused. Elemods list their relocations. The base adds the module's
address to each self-reference at load. ColdFire, no C library or libgcc.
The module's id is the first four bytes of the SHA-256 of its name (the
elemod's id, a DSP package's catalogue id, or the output file's stem): a
package with a live module's id replaces it, and an empty one removes it.

A DSP effect (the Octatrack's), from a relocatable DSP package Modwerk's
package builder made and proved (its words placed at four origins equal
fresh assembly there; checked again here), with what it needs:

    python3 -B sdk/runtime/loader/build.py --dsp src/engine/assets/dsp-packages.json:everb \\
        --slots fx2 --cycles 382 --cycles-kind executed --state 132 --buffer 16384 -o everb.mwrm

A catalogue module from its Octabam manifest (ABI 7, no firmware needed): its own GNU-as units, and its writes
to stock (jmp, jsr and lea detours, pokes, symbol references) as stock-code sites that carry the SHA-256 the
manifest names for the stock bytes instead of the bytes; the base reads them from its running code and checks
them before it patches. A hybrid effect (ColdFire and DSP, such as TAPE ECHO and EUCLID) adds --dsp, its units
linked after the page recipe; --pinned when its ColdFire code names its effect id. --stock checks each site's
hash against the stock OS too.

    python3 -B sdk/runtime/loader/build.py --octabam previewvol --upstream ~/.cache/modwerk-upstream/elekloader -o previewvol.mwrm
    python3 -B sdk/runtime/loader/build.py --octabam tapeecho --upstream ~/.cache/modwerk-upstream/elekloader \\
        --dsp src/engine/assets/dsp-packages.json:tapeecho --slots fx2 --cycles 4 --cycles-kind modeled --state 1 --pinned -o tapeecho.mwrm
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import struct
import subprocess
import sys
import tempfile
import types

sys.path.append(str(Path(__file__).resolve().parents[2]))  # sdk/, for firmware_codec
import firmware_codec  # noqa: E402
HERE = Path(__file__).resolve().parent
HANDLERS = ('module_tick', 'module_draw', 'module_key', 'module_enc')  # loader.h's event order
NONE = 0xffffffff
SHIFT = 0x10000
SITE_BYTES, SITE_RELOCATIONS = 32, 8  # loader.h
DSP_WORDS, DSP_RELOCATIONS, STATE_WORDS, BUFFER_WORDS = 4096, 256, 132, 16384
CYCLE_KINDS = {'executed': 1, 'modeled': 2, 'hardware': 3}  # loader.h's runtime_cycles
SLOTS = {'fx1': 1, 'fx2': 2, 'both': 3}
CFLAGS = ['-mcpu=54455', '-Os', '-std=c99', '-ffreestanding', '-fno-builtin', '-fno-common',
          '-fno-tree-loop-distribute-patterns', '-fno-asynchronous-unwind-tables', '-fno-unwind-tables',
          '-Wall', '-Wextra', '-Werror', '-I', str(HERE)]
SCRIPT = '''ENTRY(__image_start)
SECTIONS {
  . = %#x;
  __image_start = .;
  .image : { *(.text .text.*) *(.rodata .rodata.*) *(.data .data.*) . = ALIGN(4); }
  __image_end = .;
  .bss (NOLOAD) : { *(.bss .bss.*) . = ALIGN(4); }
  __bss_end = .;
  /DISCARD/ : { *(.comment) *(.note .note.*) }
}
'''


def relocations(low, high, end, anywhere=False):
    """Offsets of the words that move with the link address; refuse anything else. `anywhere` (ABI 7): such a word
    may hold any offset, as address arithmetic does (a label less a constant)."""
    offsets, moved = [], set()
    for at in range(0, len(low) - 3, 2):
        a, b = struct.unpack_from('>I', low, at)[0], struct.unpack_from('>I', high, at)[0]
        if (b - a) & 0xffffffff == SHIFT:
            if a >= end and not anywhere:
                raise ValueError('The reference at %#x points outside the module.' % at)
            offsets.append(at)
            moved.update((at, at + 1))  # adding 0x10000 changes only the upper half
    if len(low) != len(high) or any(x != y and i not in moved for i, (x, y) in enumerate(zip(low, high))):
        raise ValueError('The module has a reference the base cannot relocate.')
    return offsets


def module_id(name):
    return int.from_bytes(hashlib.sha256(name.encode()).digest()[:4], 'big')


def package(image, bss, hooks, offsets, sites=(), name='', dsp=None, flags=0, hashed=False, title='', layout=1, copies=(), fills=(), abi=None):
    """sites: (address, stock bytes, new bytes, offsets of self-references in them), or with `hashed` (ABI 7)
    (address, SHA-256 of the stock bytes, new bytes, offsets, how many leading new bytes are the stock bytes, how many
    leading stock bytes the hash covers);
    dsp: dsp_section()'s. An ABI 7 package without DSP code is named by `title` and `layout`; its `copies`
    ((image offset, stock address, length, SHA-256)) are stock bytes the base copies into the image."""
    abi = abi or (8 if fills or len(sites) > 64 or len(copies) > 16 else 7 if hashed else 6 if dsp else 4)
    if abi not in (4, 6, 7, 8) or (abi >= 7) != bool(hashed) or (fills and abi < 8):
        raise ValueError('Hash sites/copies and constant fills need their declared ABI.')
    if len(sites) > (128 if abi == 8 else 64) or len(copies) > (128 if abi == 8 else 16) or len(fills) > 64:
        raise ValueError('The package exceeds the loader record bounds.')
    spans = []
    for offset, address, length, digest in copies:
        if len(digest) != 32:
            raise ValueError('A stock copy needs its SHA-256.')
        spans.append((offset, length))
    for offset, length, value in fills:
        if abi != 8 or not 0 < value < 256:
            raise ValueError('A constant fill needs ABI 8 and a nonzero byte.')
        spans.append((offset, length))
    if abi == 8:
        for i, (offset, length) in enumerate(spans):
            if not (offset >= 0 and length > 0 and offset + length <= len(image)) or any(image[offset:offset + length]):
                raise ValueError('Copies and fills need zero placeholders inside the image.')
            if any(offset < old + n and old < offset + length for old, n in spans[:i]):
                raise ValueError('Copies and fills overlap.')
            if any(offset < at + 4 and at < offset + length for at in offsets):
                raise ValueError('A copy or fill overlaps a relocation word.')
    records = b''
    for address, stock, code, local, *more in sites:
        keep, checked = more if hashed else (0, len(code))
        if (len(stock) != (32 if hashed else len(code)) or not 0 < len(code) <= SITE_BYTES or len(local) > SITE_RELOCATIONS
                or not 0 <= keep <= min(checked, len(code)) or not 0 < checked <= SITE_BYTES or any(o < keep for o in local)):
            raise ValueError('Site at %#x exceeds the loader\'s bounds.' % address)
        if (address | len(code)) & 1:
            raise ValueError('Site at %#x: the loader writes whole instructions, at even addresses and lengths.' % address)
        code = b'\0' * keep + code[keep:]  # the base copies those from the stock bytes it checked
        head = (struct.pack('>IBBBB', address, len(code), keep, checked, len(local)) if hashed else
                struct.pack('>IHH', address, len(code), len(local)))
        records += head + stock + code + struct.pack('>%dH' % len(local), *local)
    for offset, address, length, digest in copies:
        if not (0 < length <= SITE_BYTES and offset + length <= len(image) and not any(image[offset:offset + length])):
            raise ValueError('The stock copy for %#x must fill zeros inside the image.' % address)
        records += struct.pack('>IIHH', offset, address, length, 0) + digest
    records += b''.join(struct.pack('>IIB3x', offset, length, value) for offset, length, value in fills)
    head = struct.pack('>IIIIII', len(image), bss, len(offsets), len(hooks), len(sites), module_id(name))
    if dsp:
        head += struct.pack('>IHBBHHHBBH', len(dsp['words']), len(dsp['relocations']), dsp['effect'], dsp['slots'],
                            dsp['init'], dsp['proc'], dsp['cycles'], dsp['kind'], dsp['state'], dsp['buffer'])
        head += dsp['name'].encode().ljust(16, b'\0') + struct.pack('>H', dsp['layout'])
        records += struct.pack('>%dI' % len(dsp['words']), *dsp['words']) + struct.pack('>%dH' % len(dsp['relocations']), *dsp['relocations'])
    elif hashed:
        if not (0 < len(title) <= 15 and title.isascii() and title.isprintable() and 0 < layout < 65536):
            raise ValueError('Give the module a display name of 1-15 printable ASCII characters and a layout number of 1-65535.')
        head += bytes(18) + title.encode().ljust(16, b'\0') + struct.pack('>H', layout)
    if hashed:
        head += struct.pack('>I', len(copies))
        if abi == 8:
            head += struct.pack('>I', len(fills))
    elif copies:
        raise ValueError('Stock copies need ABI 7.')
    return (b'MWRM' + struct.pack('>HH', abi, flags) + head + struct.pack('>%dI' % len(hooks), *hooks)
            + image + struct.pack('>%dI' % len(offsets), *offsets) + records)


PAGE_MAGIC = b'MWPG'


def page_section(module_id):
    """(image, relocations): the Octatrack effect page recipe scripts/octatrack-module-page.mjs makes, laid out
    for the base's fxpage.c (big-endian): 'MWPG', the donor descriptor's address and SHA-256, the slots whose
    enable bits it inherits, the counts, a word the base keeps (where the fixups point), the integer patches
    (offset, width, value), the text patches (offset, width, length, text), the formatters (slot, fixups,
    clear-widget, wide-dial maximum (0 none), code pointer, code length, fixup offsets), then each formatter's code. No stock bytes."""
    out = subprocess.run(['node', str(Path(__file__).resolve().parents[3] / 'scripts/octatrack-module-page.mjs'), module_id],
                         capture_output=True, text=True)
    if out.returncode:
        raise ValueError('No FX page for %s: %s' % (module_id, out.stderr.strip().splitlines()[-1] if out.stderr.strip() else '?'))
    page = json.loads(out.stdout)
    inherited = sum(1 << slot for slot in page['inheritedEnable'])
    head = PAGE_MAGIC + struct.pack('>I', page['donor']) + bytes.fromhex(page['donorSha256']) + struct.pack(
        '>HBBBBHI', inherited, len(page['integers']), len(page['strings']), len(page['formatters']), 0, 0, 0)
    body = b''.join(struct.pack('>HBBI', f['offset'], f['width'], 0, f['value']) for f in page['integers'])
    for f in page['strings']:
        text = f['value'].encode('latin-1')
        entry = struct.pack('>HBB', f['offset'], f['width'], len(text)) + text
        body += entry + b'\0' * (-len(entry) % 4)
    entries, at = [], len(head) + len(body)
    for f in page['formatters']:
        entries.append(struct.pack('>BBBBIHH', f['slot'], len(f['fixups']), int(f['clearWidget']), f.get('wideMaximum') or 0, 0, len(f['code']) // 2, 0) +
                       struct.pack('>%dH' % len(f['fixups']), *f['fixups']))
        entries[-1] += b'\0' * (-len(entries[-1]) % 4)
    image, relocations = bytearray(head + body + b''.join(entries)), []
    for f, entry_at in zip(page['formatters'], [at + sum(len(e) for e in entries[:i]) for i in range(len(entries))]):
        code = bytes.fromhex(f['code'])
        struct.pack_into('>I', image, entry_at + 4, len(image))       # the loader adds the module's address
        relocations.append(entry_at + 4)
        relocations += [len(image) + r for r in f['relocations']]
        image += code + b'\0' * (-len(code) % 4)
    return bytes(image), sorted(relocations)


def dsp_section(pkg, slots, cycles, kind, state, buffer=0, name='', layout=1):
    """A relocatable DSP package (Modwerk's package builder: 24-bit words as hex,
    relocations, init, proc, its effect id and placement proofs) and its needs."""
    code = pkg['code']
    words = [int(code[i:i + 6], 16) for i in range(0, len(code), 6)]
    relocations = sorted(pkg['relocations'])

    def digest(base):
        placed = [(w + base) & 0xffffff if i in relocations else w for i, w in enumerate(words)]
        return hashlib.sha256(b''.join(w.to_bytes(3, 'big') for w in placed)).hexdigest()
    if (len(words) != pkg['words'] or not 0 < len(words) <= DSP_WORDS or len(relocations) > DSP_RELOCATIONS or
            len(set(relocations)) != len(relocations) or any(not 0 <= r < len(words) or words[r] >= len(words) for r in relocations) or
            not (0 <= pkg['init'] < len(words) and 0 <= pkg['proc'] < len(words)) or digest(0) != pkg['sha256']):
        raise ValueError('The DSP package is malformed or does not match its checksum.')
    if len(pkg.get('proofs', [])) < 2 or any(digest(proof['base']) != proof['sha256'] for proof in pkg['proofs']):
        raise ValueError('The DSP package has no placement proofs, or its relocation does not reproduce them.')
    if not (0 < pkg['fxId'] < 32 and slots in SLOTS and kind in CYCLE_KINDS and 0 < cycles < 65536 and 0 < state <= STATE_WORDS
            and 0 <= buffer <= BUFFER_WORDS):
        raise ValueError('Give the effect its slots, a cycle figure and its kind, its state words (at most %d) and the '
                         'delay-buffer words it reads (at most %d).' % (STATE_WORDS, BUFFER_WORDS))
    if not (0 < len(name) <= 15 and name.isascii() and name.isprintable() and 0 < layout < 65536):
        raise ValueError('Give the effect a display name of 1-15 printable ASCII characters and a layout number of 1-65535.')
    return dict(words=words, relocations=relocations, effect=pkg['fxId'], slots=SLOTS[slots], init=pkg['init'], proc=pkg['proc'],
                cycles=cycles, kind=CYCLE_KINDS[kind], state=state, buffer=buffer, name=name, layout=layout)


def link_elemod(doc, stock_at, base_symbols):
    """A converted module laid out from 0: (image, self-reference offsets, sites)."""
    unsupported = [k for k in ('contribute', 'copied', 'collections') if doc.get(k)]
    if unsupported or set(doc['sections']) != {'.run'}:
        raise ValueError('Runtime loading supports one .run section, stock-code sites and subscriptions to the base\'s site '
                         'events only, not ' + ', '.join(unsupported or sorted(doc['sections'])) + '.')
    run, symbols = doc['sections']['.run'], doc['symbols']
    image = bytearray()
    for part in run['parts']:
        if part[0] == 'hex':
            image += bytes.fromhex(part[1])
        elif part[0] == 'stock':
            image += stock_at(int(part[1], 16), part[2])
        else:
            raise ValueError('Unsupported section part: ' + part[0])
    if len(image) != run['len']:
        raise ValueError('The .run section does not have its declared length.')

    def resolve(target, addend):
        """(value, whether it is an offset into the module)"""
        kind, _, name = target.partition(':')
        if kind == 'sec' and name == '.run':
            return addend, True
        if kind == 'sym' and name in symbols:
            where, value = symbols[name]
            if where not in ('.run', 'abs'):
                raise ValueError('Unsupported symbol section: ' + where)
            return value + addend, where == '.run'
        if kind == 'sym' and name in base_symbols:
            return base_symbols[name] + addend, False
        raise ValueError('Unresolved relocation target: ' + target)

    def apply(data, entries):
        local = []
        for at, kind, target, addend in entries:
            if kind != 'abs32':
                raise ValueError('Unsupported relocation: ' + kind)
            value, inside = resolve(target, addend)
            struct.pack_into('>I', data, at, value & 0xffffffff)
            if inside:
                local.append(at)
        return local

    offsets = apply(image, [r[1:] for r in doc.get('relocs', []) if r[0] == '.run'] + run.get('relocs', []))
    if any(r[0] != '.run' for r in doc.get('relocs', [])):
        raise ValueError('Relocations outside .run.')
    sites = []
    for site in doc.get('sites', []):
        if site.get('kind', 'code') != 'code' or 'new' not in site:
            raise ValueError('Runtime loading patches code sites with given bytes only (site %s).' % site.get('addr'))
        address, length = int(site['addr'], 16), site['len']
        stock = stock_at(address, length)
        if hashlib.sha256(stock).hexdigest() != site['stock_sha256']:
            raise ValueError('Stock bytes at %#x are not the ones the module expects.' % address)
        code = bytearray.fromhex(site['new'])
        local = apply(code, site.get('relocs', []))
        sites.append((address, stock, bytes(code), local))
    return bytes(image), offsets, sites


def link_units(objects, cross, origin, tmp, anywhere=False):
    """Objects linked at `origin` and origin + SHIFT: (image, its symbols, bss bytes, self-reference offsets)."""
    images, symbols = [], {}
    for base in (origin, origin + SHIFT):
        (tmp / 'link.ld').write_text(SCRIPT % base)
        elf = tmp / ('%x.elf' % base)
        subprocess.run([cross + 'ld', '--orphan-handling=error', '--no-warn-rwx-segments', '-T', str(tmp / 'link.ld'),
                        '-o', str(elf), *map(str, objects)], check=True)
        subprocess.run([cross + 'objcopy', '-O', 'binary', '-j', '.image', str(elf), str(tmp / 'image')], check=True)
        images.append((tmp / 'image').read_bytes())
        if base == origin:
            for line in subprocess.check_output([cross + 'nm', str(elf)], text=True).splitlines():
                value, _, name = line.split()
                symbols[name] = int(value, 16)
    image, length, end = images[0], symbols['__image_end'] - origin, symbols['__bss_end']
    if len(image) != length:
        raise ValueError('The module image is not contiguous.')
    return image, symbols, end - symbols['__image_end'], relocations(image, images[1], end, anywhere)


OPCODES = {'jmp': b'\x4e\xf9', 'jsr': b'\x4e\xb9', 'lea': b'\0\0'}  # lea keeps its stock opcode (its register)


def site_events():
    """The stock sites the Octatrack base owns as events (sdk/machines/octatrack/events.json): {'sites', 'events'}."""
    spec = importlib.util.spec_from_file_location('octatrack_events', HERE.parents[1] / 'machines/octatrack/events.py')
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module.load()


def runtime_declaration(folder):
    """A module's runtime.json, or None: {"schema": 1, "subscribe": [{"event", "fn", "order", "replaces"}],
    "contribute": [{"to", "order", "data", "replaces"}], "raise": [event]}. With it the package subscribes or contributes
    (needs a base with those events and tables) and its units assemble with MODWERK_EVENTS defined. `replaces` names what
    its native octabam build patches there instead, which the package leaves out: a detour's symbol, or (a list for a
    take event or a table) detour symbols and 0x addresses of pokes, symbol references and table references. A core
    event (module_tick, module_draw, module_key, module_enc) takes {"event", "fn"} alone. `raise` names events with no
    site that the module raises: its zero word raise_<event> receives the base's entry at install (RUNTIME_RAISE)."""
    path = Path(folder) / 'runtime.json'
    if not path.is_file():
        return None
    doc = json.loads(path.read_text())
    replaces = lambda e: 'replaces' not in e or isinstance(e['replaces'], str) or (
        isinstance(e['replaces'], list) and e['replaces'] and all(isinstance(r, str) for r in e['replaces']))
    entry = lambda e: isinstance(e, dict) and (set(e) == {'event', 'fn'} if e.get('event') in HANDLERS else
                                               not set(e) - {'event', 'fn', 'order', 'replaces'}
                                               and {'event', 'fn', 'order'} <= set(e) and replaces(e))
    contribution = lambda e: (isinstance(e, dict) and not set(e) - {'to', 'data', 'order', 'replaces'}
                              and {'to', 'data', 'order'} <= set(e) and replaces(e))
    if (doc.get('schema') != 1 or not {'schema'} < set(doc) <= {'schema', 'subscribe', 'contribute', 'raise'}
            or not isinstance(doc.get('subscribe', []), list) or not isinstance(doc.get('contribute', []), list)
            or not doc.get('subscribe', []) + doc.get('contribute', [])
            or not all(entry(e) for e in doc.get('subscribe', []))
            or not all(contribution(e) for e in doc.get('contribute', []))
            or not isinstance(doc.get('raise', []), list) or not all(isinstance(e, str) for e in doc.get('raise', []))
            or len(set(doc.get('raise', []))) != len(doc.get('raise', []))):
        raise ValueError('%s: {"schema": 1, "subscribe": [{"event", "fn", "order", "replaces"}], '
                         '"contribute": [{"to", "order", "data", "replaces"}], "raise": [event]}' % path)
    doc.setdefault('subscribe', [])
    return doc


def entries(declared):
    """A runtime declaration's subscriptions and contributions as hook entries {event, fn, order, replaces}."""
    return list(declared.get('subscribe', [])) + [dict(event=c['to'], fn=c['data'], order=c['order'],
                                                       **({'replaces': c['replaces']} if 'replaces' in c else {}))
                                                  for c in declared.get('contribute', [])]


RAISE = 255  # loader.h RUNTIME_RAISE: on a raised event's word, the offset of the zero slot for the base's entry


def subscribe(hooks, entries, symbols, registry=None, raises=()):
    """`hooks` (the core events' words) with each subscription's word after them, by the event's hook index: its order
    (0-254) in the top byte and the handler's (a take event's record's, a table's record's) image offset below
    (loader.h). Each event in `raises` (a raised event, no site) takes RAISE and the offset of the module's zero word
    raise_<event>, which the loader points at the base's entry. Trailing empty words are left out."""
    events = {e['event']: e for e in (registry or site_events())['events']}
    words = list(hooks) + [NONE] * (len(HANDLERS) + len(events) - len(hooks))
    for name in raises:
        e, slot = events.get(name), 'raise_' + name
        if (not e or e['kind'] != 'call' or e['site'] is not None or slot not in symbols or symbols[slot] & 1
                or words[e['index']] != NONE):
            raise ValueError('A raise names an event of sdk/machines/octatrack/events.json with no site, once, and the '
                             'module defines its zero word %s: %r' % (slot, name))
        words[e['index']] = RAISE << 24 | symbols[slot]
    for entry in entries:
        if entry['event'] in HANDLERS:  # a core event: the handler's offset, no order
            if set(entry) != {'event', 'fn'} or entry['fn'] not in symbols or words[HANDLERS.index(entry['event'])] != NONE:
                raise ValueError('A core-event handler names one of the module\'s own functions, once: %r' % (entry,))
            words[HANDLERS.index(entry['event'])] = symbols[entry['fn']]
            continue
        e = events.get(entry['event'])
        if (not e or entry['fn'] not in symbols or type(entry['order']) is not int or not 0 <= entry['order'] < RAISE
                or words[e['index']] != NONE or not 0 <= symbols[entry['fn']] < 0x1000000 or symbols[entry['fn']] & 1):
            raise ValueError('A subscription names an event or table of sdk/machines/octatrack/events.json, one of the '
                             'module\'s own even symbols and an order 0-254, one per event: %r' % (entry,))
        words[e['index']] = entry['order'] << 24 | symbols[entry['fn']]
    while words and words[-1] == NONE:
        words.pop()
    return words


def _names(entry):
    r = entry.get('replaces', [])
    return [r] if isinstance(r, str) else list(r)


def replaced(detours, entries, registry=None, pokes=None, refs=None):
    """What a subscribing package keeps of its detours (and, given, its pokes and symbol references): each name a
    subscription `replaces` goes. A call event's detour sits exactly on its site with that length and stock guard; a
    take event's starts at its site and covers at least the site; a table's detour, poke or reference is one of the
    sites the table owns. Returns the kept detours, or (detours, pokes, refs) when pokes or refs are given."""
    reg = registry or site_events()
    events = {e['event']: e for e in reg['events']}
    owned = {s['site']: s for s in reg.get('owned', [])}
    named = {}
    for entry in entries:
        e = events.get(entry['event'])
        for name in _names(entry) if e else ():
            if name in named:
                raise ValueError('%s is replaced twice.' % name)
            named[name] = e
    used = set()
    def check(name, site, length, expect, what):
        e = named[name]
        if e['kind'] == 'call':
            if what != 'detour' or site != e['site'] or length != e['length'] or (
                    stock_digest(expect) != (bytes.fromhex(reg['sites'][e['site']]['guard']), e['length'])):
                raise ValueError('%s does not replace the detour at %s\'s site %#x exactly.' % (name, e['event'], e['site']))
        elif e['kind'] == 'take':
            if what != 'detour' or site != e['site'] or length < e['length']:
                raise ValueError('%s does not start at %s\'s site %#x and cover it.' % (name, e['event'], e['site']))
        elif not any(o['table'] == e['event'] and o['site'] <= site < o['site'] + o['length'] for o in owned.values()):
            raise ValueError('%s at %#x is not a site %s owns.' % (name, site, e['event']))
        used.add(name)
    kept = []
    for d in detours:
        if d.symbol in named:
            check(d.symbol, d.site, d.pad_to or 6, d.expect, 'detour')
        else:
            kept.append(d)
    kept_pokes = []
    for p in pokes or ():
        name = '%#010x' % p.addr
        if name in named:
            check(name, p.addr, len(p.write), p.expect, 'poke')
        else:
            kept_pokes.append(p)
    kept_refs = []
    for r in refs or ():
        name = '%#010x' % r.addr
        if name in named:
            check(name, r.addr, 4, None, 'ref')
        else:
            kept_refs.append(r)
    missing = set(named) - used
    if missing:
        raise ValueError('A runtime.json replaces what the module does not have: ' + ', '.join(sorted(missing)))
    return (kept, kept_pokes, kept_refs) if pokes is not None or refs is not None else kept


def unevented(sites, copies=(), registry=None):
    """Refuse a write or stock copy on a base-owned event's or table's bytes, naming it: subscribe or contribute."""
    reg = registry or site_events()
    spans = [(s[0], max(len(s[2]), s[5] if len(s) > 5 else 0)) for s in sites] + [(c[1], c[2]) for c in copies]
    owned = [(e['site'], e['length'], e['event'], 'subscribe to') for e in reg['events'] if e['site'] is not None]
    owned += [(o['site'], o['length'], o['table'], 'contribute to') for o in reg.get('owned', [])]
    for address, n in spans:
        for at, length, name, how in owned:
            if address < at + length and at < address + n:
                raise ValueError('The write at %#x meets %s\'s site %#x, which the base owns: %s %s.'
                                 % (address, name, at, how, name))


def stock_digest(expect):
    """(SHA-256, bytes it covers) a manifest names for the stock bytes at a write: a guarded span's,
    or of bytes it spells out (never shipped). A guard may cover fewer bytes than a detour's jmp takes, or more (the
    instruction its stub returns to)."""
    covered = expect.length if hasattr(expect, 'sha256') else len(expect)
    if not 0 < covered <= SITE_BYTES:
        raise ValueError('A stock guard of %d bytes is past the loader\'s bounds.' % covered)
    return bytes.fromhex(expect.sha256) if hasattr(expect, 'sha256') else hashlib.sha256(bytes(expect)).digest(), covered


def octabam_units(name, origin, cross, upstream, dsp=False, hooks=None):
    """A catalogue module's ColdFire code from its Octabam manifest, linked at `origin`: (image, bss, self-reference
    offsets, ABI 7 sites, stock copies). Its units (each assembled as Octabam does: a DRAM unit for the chip), the stock
    instructions they replay (StockCopy), its jmp, jsr and lea detours to its own symbols, its pokes and its symbol
    references; every stock span named by the SHA-256 its manifest gives (no firmware is read). Anything else a
    runtime package cannot carry is refused. A module with a runtime.json subscribes: pass a `hooks` list to receive
    its hook words."""
    firmware_codec.use_elekloader(upstream)
    from elekloader.sdk import octabam as port
    root = Path(__file__).resolve().parents[2] / 'octabam'
    ob = port.Octabam(str(root))
    if name not in ob.modules:
        raise ValueError('No Octabam module ' + name)
    m = ob.modules[name]
    own = [c for c in m.cf_patches if c.registers_formatter and c.registers_formatter.module == m.key]  # in the page recipe
    extra = [what for what, there in (('requires', m.requires), ('tables', m.tables), ('keeps', m.keeps),
                                      ('DRAM regions', m.dram_regions), ('overrides', m.overrides),
                                      ('caves', [c for c in m.cf_patches if c not in own])) if there]
    extra += ['generated includes or defsyms of ' + u.label for u in m.linked if u.include or getattr(u, 'defsyms', ())]
    extra += ['a unit pinned at %#x' % u.cave_addr for u in m.linked if not u.dram and u.cave_addr is not None]
    extra += ['hooks in stock DSP code'] if m.dsp and m.dsp.hooks else ['its DSP code (give --dsp)'] if m.dsp and not dsp else []
    if extra or not m.linked:
        raise ValueError('%s needs what a runtime package cannot carry yet: %s' % (name, ', '.join(extra) or 'no ColdFire unit'))
    declared = runtime_declaration(root / 'modules' / name)
    if declared and hooks is None:
        raise ValueError(name + ' subscribes to site events (runtime.json): its caller must take its hook words.')
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        objects = []
        for i, unit in enumerate(m.linked):
            objects.append(tmp / ('%d.o' % i))
            subprocess.run([cross + 'as', '-mcpu=' + ('54455' if unit.dram else unit.cpu), *(['--defsym', 'MODWERK_EVENTS=1'] if declared else []),
                            unit.source, '-o', str(objects[-1])], cwd=root, check=True)
        image, symbols, bss, offsets = link_units(objects, cross, origin, tmp, anywhere=True)

    def symbol(name_, addend=0):
        if name_ not in symbols:
            raise ValueError('%s names %s, which its units do not define.' % (name, name_))
        return struct.pack('>I', symbols[name_] + addend)
    sites = []
    for d in replaced(m.detours, entries(declared)) if declared else m.detours:
        n = d.pad_to or 6
        if d.kind not in OPCODES or d.target is not None or n < 6 or n % 2:
            raise ValueError('Detour at %#x: only jmp, jsr or lea to the module\'s own symbol.' % d.site)
        code = OPCODES[d.kind] + symbol(d.symbol) + b'\x4e\x71' * ((n - 6) // 2)
        digest, checked = stock_digest(d.expect)
        sites.append((d.site, digest, code, [2], 2 if d.kind == 'lea' else 0, checked))
    for poke in m.pokes:
        digest, checked = stock_digest(poke.expect)
        sites.append((poke.addr, digest, bytes(poke.write), [], 0, checked))
    for ref in m.symbol_refs:
        digest, checked = stock_digest(ref.expect.to_bytes(4, 'big'))
        sites.append((ref.addr, digest, symbol(ref.symbol, ref.addend), [0], 0, checked))
    copies = [(symbols[c.symbol], c.span.address, c.span.length, stock_digest(c.span)[0])
              for unit in m.linked for c in getattr(unit, 'stock_copies', ())]
    if declared:
        unevented(sites, copies)
        hooks[:] = subscribe([NONE] * len(HANDLERS), entries(declared), symbols, raises=declared.get('raise', ()))
    return image, bss, offsets, sites, copies


def private_standalone(args, public=False):
    """Authored-span reconstruction of a reviewed standalone port (standalone_runtime.py). Private (--private-port):
    original stock required, output new and outside Git, never a publication path. Public (--standalone, owner
    decision 14 Oct 2026): the committed reviewed recipe alone, as module_packages.py publishes it; given --stock, each
    span is also compared with the original OS and both strict scans run."""
    root = HERE.parents[2]
    adapters = root / 'sdk/machines/octatrack/module-adapters'
    sys.path.insert(0, str(adapters))
    import standalone_runtime
    if (args.octabam not in standalone_runtime.PORTS or not (args.stock or public) or not args.upstream
            or args.no_page or args.page_from or args.name or args.layout != 1 or args.stock_recipe or args.capture_stock_recipe):
        raise ValueError('Private standalone ports need their reviewed declaration, original stock and ordinary layout/page.')
    wanted = standalone_runtime.PORTS[args.octabam]
    if wanted['slots']:
        path, separator, key = (args.dsp or '').partition(':')
        if not separator or Path(path).resolve() != root / 'src/engine/assets/dsp-packages.json' or key != args.octabam:
            raise ValueError('Private hybrids need their exact catalogue DSP package, not an alternate payload.')
    actual = dict(slots=args.slots, **dict(cycles=args.cycles, cyclesKind=args.cycles_kind,
                  state=args.state, buffer=args.buffer, pinned=args.pinned)) if args.slots else dict(slots=None)
    if (actual != wanted or bool(args.dsp) != bool(wanted['slots']) or not args.slots and
            (args.cycles is not None or args.state is not None or args.pinned or args.buffer)):
        raise ValueError('Private standalone resource figures differ from the reviewed declaration.')
    output = args.output.expanduser().resolve()
    ancestor = output.parent
    while not ancestor.exists():
        ancestor = ancestor.parent
    if not public and (output.exists() or subprocess.run(['git', '-C', str(ancestor), 'rev-parse', '--show-toplevel'],
                                                         capture_output=True).returncode == 0):
        raise ValueError('Private standalone output must be new and outside Git.')
    if not args.stock:  # public, from the committed recipe: the base checks each copy against its running stock
        return standalone_runtime, standalone_runtime.sources(root, args.upstream, args.octabam), None, None
    firmware_codec.use_elekloader(args.upstream.expanduser().resolve())
    from elekloader import formats
    parsed, device, release = formats.load(str(args.stock))
    main = formats.main_image(parsed, device)
    if (device.key != 'octatrack' or release.version != '1.40C'
            or hashlib.sha256(main).hexdigest() != release.main_sha256):
        raise ValueError('Private standalone guards require original Octatrack 1.40C.')
    def stock_at(address, length):
        at = address - device.main_load
        if at < 0 or at + length > len(main):
            raise ValueError('A private reconstruction span lies outside original stock MAIN.')
        return main[at:at + length]
    return standalone_runtime, standalone_runtime.sources(root, args.upstream, args.octabam), stock_at, main


def private_stock_free(data, stock, main, upstream):
    """Reuse both unchanged strict scans, including both packed DSP views."""
    folder = HERE.parents[2] / 'sdk/machines/octatrack/elekloader'
    loaded = []
    for name in ('module_packages', 'check_stock_free'):
        spec = importlib.util.spec_from_file_location('private_' + name, folder / (name + '.py'))
        module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module); loaded.append(module)
    packages, scanner = loaded
    if (any(n >= packages.LIMIT for view in [data, *packages.dsp_words(data)]
            for n in packages.runs(view, main).values())
            or scanner.stock_runs({'sections': {'package': {'parts': [['hex', data.hex()]]}}},
                                  scanner.haystacks(stock, upstream), 16)):
        raise ValueError('An unchanged strict stock-free scanner refused the private package.')


def octabam_group(args):
    """One private extent and site owner for an explicitly selected machine subset.

    The adapter owns shared hooks. This builder links all effective units once,
    proves the same input at two origins, and leaves inherited stock table words
    as checked-copy placeholders. Public inventory still needs retirement proof.
    """
    firmware_codec.use_elekloader(args.upstream.expanduser().resolve())
    from elekloader.sdk import octabam as port
    sdk = Path(__file__).resolve().parents[2] / 'octabam'
    adapters = Path(__file__).resolve().parents[2] / 'machines/octatrack/module-adapters'
    sys.path.insert(0, str(adapters))
    import machine_composition, fm_runtime, vector_runtime, quantizer_runtime, stock_recipe
    names = args.octabam_group.split(',')
    if (len(names) != len(set(names)) or not set(names).intersection(('poly8', 'vector', 'synth')) or
            set(names) - {'poly8', 'vector', 'synth', 'quantizer'}):
        raise ValueError('A machine group needs explicit poly8/vector/synth participants; Quantizer is optional.')
    ob = port.Octabam(str(sdk))
    selected = [ob.modules[name] for name in sorted(names)]
    inherited_manifests = [sdk / ('modules/' + m.name + '/upstream/' + m.name + '/manifest.py') for m in selected]
    inputs = {str(p.relative_to(Path(__file__).resolve().parents[3])): hashlib.sha256(p.read_bytes()).hexdigest()
              for p in [Path(__file__).resolve(), *[adapters / name for name in ('machine_composition.py','fm_runtime.py','vector_runtime.py','quantizer_runtime.py','stock_recipe.py')], *[sdk / ('modules/' + m.name + '/manifest.py') for m in selected],
                        *[p for p in inherited_manifests if p.is_file()],
                        *[sdk / u.source for m in selected for u in m.linked],
                        sdk / 'modules/poly8/shared-machine.c', sdk / 'modules/poly8/shared-machine-hooks.s',
                        sdk / 'modules/poly8/composition.json', sdk / 'modules/quantizer/composition.json']}
    recipe = json.loads(args.stock_recipe.read_text()) if args.stock_recipe else None
    table_guards = recipe.get('tables', {}) if recipe else {}
    stock_at = None
    if args.stock:
        from elekloader import formats
        stock, device, release = formats.load(str(args.stock))
        main = formats.main_image(stock, device)
        if device.key != 'octatrack' or release.version != '1.40C' or hashlib.sha256(main).hexdigest() != release.main_sha256:
            raise ValueError('Machine table guard capture requires original Octatrack 1.40C.')
        def stock_at(address, n):
            at = address - device.main_load
            if at < 0 or at + n > len(main):
                raise ValueError('A machine table lies outside stock MAIN.')
            return main[at:at + n]
    with tempfile.TemporaryDirectory() as folder:
        work = Path(folder)
        modules = machine_composition.effective_modules(selected, sdk_root=sdk, work=work / 'composition', cross=args.cross)
        composed = any(m.name in ('poly8', 'vector-fm-bridge', 'machine-bridge') for m in modules)
        if 'synth' in names and not composed:
            raise ValueError('FM alone still needs its private descriptor owner; no unsafe standalone package is emitted.')
        modules = [fm_runtime.port(m, sdk, work / 'fm', composition=True) if m.name == 'synth' else
                   vector_runtime.port(m, sdk, work / 'vector') if m.name == 'vector' and not composed else
                   quantizer_runtime.port(m, sdk, work / 'quantizer') if m.name == 'quantizer' and m.linked else m for m in modules]
        units, objects, tables, sites = [], [], [], []
        declared = {m.name: runtime_declaration(sdk / 'modules' / m.name) for m in modules if (sdk / 'modules' / m.name).is_dir()}
        for m in modules:
            if m.requires or m.keeps or m.dram_regions or m.overrides or m.cf_patches or m.dsp:
                raise ValueError(m.name + ': the group has an unported resource or DSP claim.')
            tables.extend(m.tables)
            for unit in m.linked:
                if unit.include or unit.defsyms or not unit.dram and unit.cave_addr is not None:
                    raise ValueError(unit.label + ': the group still has a generated/pinned unit.')
                obj = work / ('unit%d.o' % len(objects))
                subprocess.run([args.cross + 'as', '-mcpu=54455', *(['--defsym', 'MODWERK_EVENTS=1'] if declared.get(m.name) else []),
                                unit.source, '-o', str(obj)], cwd=sdk, check=True, capture_output=True)
                for name in unit.exports:
                    subprocess.run([args.cross + 'objcopy', '--globalize-symbol=' + name, str(obj)], check=True, capture_output=True)
                objects.append(obj); units.append(unit)
        table_copies = []
        for index, table in enumerate(tables):
            label = '__runtime_table_%d' % index
            inserted = table.count if table.insert_at is None else table.insert_at
            if table.count * 4 > 32:
                raise ValueError('Split and review larger stock table copies before adding a group.')
            guard = table_guards.get(hex(table.old))
            if stock_at:
                checked = {'count': table.count, 'sha256': hashlib.sha256(stock_at(table.old, table.count * 4)).hexdigest()}
                if guard and guard != checked:
                    raise ValueError('A reviewed stock table guard changed.')
                table_guards[hex(table.old)] = guard = checked
            if not guard or guard['count'] != table.count:
                raise ValueError('Machine tables need a reviewed hash recipe or private --stock capture.')
            # Current FM appends; insertion needs two independently hashed spans.
            if inserted != table.count:
                raise ValueError('A table insertion needs separately reviewed prefix/suffix stock guards.')
            asm = work / ('table%d.s' % index)
            asm.write_text('.text\n.balign 4\n.global ' + label + '\n' + label + ':\n.space %d\n' % (table.count * 4) +
                           ''.join('.long ' + symbol + '\n' for _, symbol in table.symbols))
            obj = work / ('table%d.o' % index)
            subprocess.run([args.cross + 'as', '-mcpu=54455', str(asm), '-o', str(obj)], check=True, capture_output=True)
            objects.append(obj); table_copies.append((label, table.old, table.count * 4, bytes.fromhex(guard['sha256'])))
        origin = 16  # 8-byte metadata and authored alignment padding
        image, symbols, bss, offsets = link_units(objects, args.cross, origin, work, anywhere=False)
        def pointer(symbol, addend=0):
            if symbol not in symbols:
                raise ValueError('A group symbol is missing: ' + symbol)
            return struct.pack('>I', symbols[symbol] + addend)
        entries = [e for m in modules if declared.get(m.name) for e in declared[m.name]['subscribe']]
        for m in modules:
            for d in replaced(m.detours, declared[m.name]['subscribe']) if declared.get(m.name) else m.detours:
                n = d.pad_to or 6
                if d.kind not in OPCODES or d.target is not None or n < 6 or n % 2:
                    raise ValueError('An effective group detour is not relocatable.')
                digest, checked = stock_digest(d.expect)
                sites.append((d.site, digest, OPCODES[d.kind] + pointer(d.symbol) + b'\x4e\x71' * ((n-6)//2), [2], 2 if d.kind == 'lea' else 0, checked))
            for p in m.pokes:
                digest, checked = stock_digest(p.expect)
                sites.append((p.addr, digest, bytes(p.write), [], 0, checked))
            for ref in m.symbol_refs:
                digest, checked = stock_digest(ref.expect.to_bytes(4, 'big'))
                sites.append((ref.addr, digest, pointer(ref.symbol, ref.addend), [0], 0, checked))
        for index, table in enumerate(tables):
            for address, expected in table.refs:
                digest, checked = stock_digest(expected.to_bytes(4, 'big'))
                sites.append((address, digest, pointer('__runtime_table_%d' % index), [0], 0, checked))
        ordered = sorted(sites)
        if any(a[0] + len(a[2]) > b[0] for a, b in zip(ordered, ordered[1:])):
            raise ValueError('The effective machine group still has overlapping sites.')
        copies = [(symbols[c.symbol], c.span.address, c.span.length, stock_digest(c.span)[0]) for u in units for c in u.stock_copies]
        copies += [(symbols[label], address, n, digest) for label, address, n, digest in table_copies]
        if entries:
            unevented(sites, copies)
        mask = sum(bit for name, bit in [('poly8', 1), ('vector', 2), ('synth', 4)] if name in names)
        image = b'MWMG' + bytes([1, mask, 0, 0]) + bytes(8) + image
        offsets = [origin + at for at in offsets]
        if args.capture_stock_recipe:
            args.capture_stock_recipe.write_text(json.dumps(dict(schema=1, imageSha256=hashlib.sha256(image).hexdigest(),
                sources=inputs, tables=table_guards, symbols={name: value for name, value in symbols.items() if 0 <= value < len(image)}, copies=[], fills=[]), indent=2) + '\n')
        fills = []
        if recipe:
            image, extra, fills = stock_recipe.apply(image, offsets, recipe, inputs)
            copies += extra
        if args.stock:
            check_stock(sites + [(address, digest, b'', [], 0, n) for _, address, n, digest in copies], args.stock, args.upstream)
        raises = [r for m in modules if declared.get(m.name) for r in declared[m.name].get('raise', ())]
        hooks = subscribe([NONE] * len(HANDLERS), entries, symbols, raises=raises) if entries or raises else []
        return package(image, bss, hooks, offsets, sites, name=args.module_id or 'octatrack-machines', hashed=True,
                       title=args.name or 'Machines', layout=args.layout, copies=copies, fills=fills, abi=8, flags=4)


def octabam_machine(args):
    """One catalogue machine module as an independent ABI 8 package: what it shares with other modules goes through
    the base's events and tables (its runtime.json, or its machine port in module-adapters/machine-ports.json), so it
    installs alone or beside any other module. No group metadata, no composition, no other member."""
    firmware_codec.use_elekloader(args.upstream.expanduser().resolve())
    from elekloader.sdk import octabam as port
    sdk = Path(__file__).resolve().parents[2] / 'octabam'
    adapters = Path(__file__).resolve().parents[2] / 'machines/octatrack/module-adapters'
    sys.path.insert(0, str(adapters))
    import machine_ports
    ob = port.Octabam(str(sdk))
    if args.octabam_machine not in ob.modules or not machine_ports.declaration(args.octabam_machine):
        raise ValueError('%s is no catalogue module with a runtime.json or machine port.' % args.octabam_machine)
    with tempfile.TemporaryDirectory() as folder:
        work = Path(folder)
        m, entries = machine_ports.effective(ob.modules[args.octabam_machine], sdk, work / 'port')
        if m.requires or m.keeps or m.dram_regions or m.overrides or m.cf_patches or m.dsp or m.tables:
            raise ValueError(m.name + ': the package still has a resource a runtime package cannot carry (requires, keeps, '
                             'DRAM regions, overrides, caves, DSP code or a grown table).')
        objects, units = [], []
        for unit in m.linked:
            if unit.include or unit.defsyms or unit.cave_addr is not None:
                raise ValueError(unit.label + ': a generated or pinned unit.')
            obj = work / ('unit%d.o' % len(objects))
            subprocess.run([args.cross + 'as', '-mcpu=54455', '--defsym', 'MODWERK_EVENTS=1', unit.source, '-o', str(obj)],
                           cwd=sdk, check=True, capture_output=True)
            for name in unit.exports:
                subprocess.run([args.cross + 'objcopy', '--globalize-symbol=' + name, str(obj)], check=True, capture_output=True)
            objects.append(obj); units.append(unit)
        wanted = machine_ports.imports(m.name)
        if wanted:  # functions of the exact base it is built for (absolute: never relocated)
            base = json.loads(args.base_symbols.read_text()) if args.base_symbols else {}
            missing = [n for n in wanted if type(base.get(n)) is not int]
            if missing:
                raise ValueError('%s imports %s from its base: give --base-symbols of a base that exports them.'
                                 % (m.name, ', '.join(missing)))
            bound = work / 'imports.s'
            bound.write_text(''.join('        .global %s\n        .set    %s, %#x\n' % (n, n, base[n]) for n in wanted))
            objects.append(work / 'imports.o')
            subprocess.run([args.cross + 'as', '-mcpu=54455', str(bound), '-o', str(objects[-1])], check=True, capture_output=True)
        image, symbols, bss, offsets = link_units(objects, args.cross, 0, work, anywhere=True)
        if args.lease_policy:  # its controller's write-lease offsets, for the base's trust row (base_bound.py)
            if (machine_ports.port(m.name) or {}).get('controller') != 'analog_bd_write_lease':
                raise ValueError('%s has no reviewed write lease.' % m.name)
            import analog_bd_lease_policy
            lease = analog_bd_lease_policy.policy_offsets(work / '0.elf', 0, {n: base[n] for n in wanted}, args.cross)
    def pointer(symbol, addend=0):
        if symbol not in symbols:
            raise ValueError('%s names %s, which its units do not define.' % (m.name, symbol))
        return struct.pack('>I', symbols[symbol] + addend)
    sites = []
    for d in m.detours:
        n = d.pad_to or 6
        if d.kind not in OPCODES or d.target is not None or n < 6 or n % 2:
            raise ValueError('Detour at %#x: only jmp, jsr or lea to the module\'s own symbol.' % d.site)
        digest, checked = stock_digest(d.expect)
        sites.append((d.site, digest, OPCODES[d.kind] + pointer(d.symbol) + b'\x4e\x71' * ((n - 6) // 2), [2], 2 if d.kind == 'lea' else 0, checked))
    for poke in m.pokes:
        digest, checked = stock_digest(poke.expect)
        sites.append((poke.addr, digest, bytes(poke.write), [], 0, checked))
    for ref in m.symbol_refs:
        digest, checked = stock_digest(ref.expect.to_bytes(4, 'big'))
        sites.append((ref.addr, digest, pointer(ref.symbol, ref.addend), [0], 0, checked))
    copies = [(symbols[c.symbol], c.span.address, c.span.length, stock_digest(c.span)[0]) for u in units for c in u.stock_copies]
    unevented(sites, copies)
    if args.stock:
        check_stock(sites + [(address, digest, b'', [], 0, n) for _, address, n, digest in copies], args.stock, args.upstream)
    hooks = subscribe([NONE] * len(HANDLERS), entries, symbols)
    # Authored runs that coincide with stock are reconstructed from the user's OS (a reviewed recipe), so the package
    # passes the unchanged strict stock-free scans: module-adapters/machine-recipes.json, or a private capture.
    import stock_recipe
    inputs = machine_inputs(m.name, adapters)
    fills = []
    if args.capture_stock_recipe:
        if not args.stock:
            raise ValueError('A machine recipe capture needs the original stock OS.')
        args.capture_stock_recipe.write_text(json.dumps(capture_machine_recipe(m.name, image, offsets, inputs, args), indent=1) + '\n')
    recipes = json.loads((adapters / 'machine-recipes.json').read_text())['ports'] if (adapters / 'machine-recipes.json').is_file() else {}
    if m.name in recipes and not args.capture_stock_recipe:
        image, extra, fills = stock_recipe.apply(image, offsets, recipes[m.name], inputs)
        copies += extra
        unevented([], extra)
    documents = json.loads((Path(__file__).resolve().parents[3] / 'src/catalog/module-documents.json').read_text())
    title = args.name or next((d.get('name') for d in documents.get('modules', []) if d.get('id') == m.name), '')
    data = package(image, bss, hooks, offsets, sites, name=m.name, hashed=True, title=title, layout=args.layout,
                   copies=copies, fills=fills, abi=8)
    if args.lease_policy:
        args.lease_policy.write_text(json.dumps(dict(entry=lease['entry'], beginReturn=lease['begin_return'],
                                                     endReturn=lease['end_return'], imageBytes=len(image))) + '\n')
    if args.stock and m.name in recipes and not args.capture_stock_recipe:
        from elekloader import formats
        parsed, device, _ = formats.load(str(args.stock))
        private_stock_free(data, args.stock, formats.main_image(parsed, device), args.upstream.expanduser().resolve())
    return data


def octabam_tables(args):
    """Mute Modes as published (owner decision 14 Oct 2026): its linked units and grown PERSONALIZE tables
    (runtime_units.compile_linked) from the reviewed table recipes in module-adapters/candidate-recipes.json, with no
    firmware. The base admits it only through its reviewed table declaration (module-adapters/table_declarations.py,
    built into the base). Given --stock, every guard and both table reconstructions are proved against the original OS
    and both strict scans run."""
    root = HERE.parents[2]
    sys.path.insert(0, str(root / 'sdk/machines/octatrack/module-adapters'))
    import candidate_packages, runtime_units
    if args.octabam_tables != 'mute-modes':
        raise ValueError('Only Mute Modes has a reviewed table port.')
    upstream = args.upstream.expanduser().resolve()
    firmware_codec.use_elekloader(upstream)
    from elekloader.sdk import octabam as port
    sdk = root / 'sdk/octabam'
    module = port.Octabam(str(sdk)).modules[args.octabam_tables]
    sources = candidate_packages.inputs(root, upstream, args.octabam_tables)
    recipe = candidate_packages.declaration(root, args.octabam_tables, sources)
    stock_at = main = None
    if args.stock:
        from elekloader import formats
        parsed, device, release = formats.load(str(args.stock))
        main = formats.main_image(parsed, device)
        if device.key != 'octatrack' or release.version != '1.40C' or hashlib.sha256(main).hexdigest() != release.main_sha256:
            raise ValueError('The table proofs need the original Octatrack 1.40C.')
        def stock_at(address, length):
            at = address - device.main_load
            if at < 0 or at + length > len(main):
                raise ValueError('A table span lies outside original stock MAIN.')
            return main[at:at + length]
    builder = types.SimpleNamespace(**globals())  # compile_linked's builder: this module's own linker and records
    with tempfile.TemporaryDirectory() as folder:
        result = runtime_units.compile_linked(module, sdk, builder, Path(folder) / 'units', args.cross, {module.key},
                                              recipe['tables'], stock_at)
    data = package(result['image'], result['bss'], result['hooks'], result['offsets'], result['sites'],
                   name=args.octabam_tables, hashed=True, title='Mute Modes', layout=1, copies=result['copies'], abi=8)
    if sources != candidate_packages.inputs(root, upstream, args.octabam_tables):
        raise ValueError('A table port input changed during compilation.')
    if args.capture_stock_recipe:  # what its table declaration binds (table_declarations.py): hashes and offsets only
        authored = sorted(p for p in (sdk / 'modules' / args.octabam_tables).iterdir()
                          if p.is_file() and (p.suffix in ('.s', '.S', '.inc') or p.name in ('manifest.py', 'runtime.json')))
        tables = sorted(name for name in result['symbols'] if re.fullmatch(r'__runtime_table_\d+', name))
        args.capture_stock_recipe.write_text(json.dumps(dict(
            schema=1, imageSha256=hashlib.sha256(result['image']).hexdigest(),
            sources={str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in authored},
            symbols={name: result['symbols'][name] for name in tables}), indent=1) + '\n')
    if args.stock:
        private_stock_free(data, args.stock, main, upstream)
    return data


def machine_inputs(name, adapters):
    """The exact inputs a machine package's image comes from: its port's reviewed sources and the builders."""
    import machine_ports
    entry = machine_ports.port(name) or {}
    root = Path(__file__).resolve().parents[3]
    ports = {'vector': ('vector_runtime.py',), 'synth': ('fm_runtime.py',), 'quantizer': ('quantizer_runtime.py',),
             'analog-bassdrum': ('analog_bd_runtime.py', 'analog_bd_write_lease.py', 'stock_hook_write_lease.h')}
    files = [Path(__file__).resolve(), adapters / 'machine_ports.py', adapters / 'machine-ports.json'] + [
        adapters / n for n in ports.get(name, ()) if (adapters / n).is_file()]
    out = {str(f.relative_to(root)): hashlib.sha256(f.read_bytes()).hexdigest() for f in files}
    out.update(entry.get('sources', {}))
    return dict(sorted(out.items()))


def capture_machine_recipe(name, image, relocations, inputs, args):
    """Every authored run of a machine package's image that the strict scans would find in stock (16 bytes, or 12
    non-zero), as copies of identical stock bytes no event or table site holds: hashes and addresses only."""
    from elekloader import formats
    parsed, device, _ = formats.load(str(args.stock))
    main = formats.main_image(parsed, device)
    folder = HERE.parents[1] / 'machines/octatrack/elekloader'
    loaded = []
    for module_name in ('module_packages', 'check_stock_free'):
        spec = importlib.util.spec_from_file_location('capture_' + module_name, folder / (module_name + '.py'))
        module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module); loaded.append(module)
    packages, scanner = loaded
    reg = site_events()
    held = [(e['site'], e['length']) for e in reg['events'] if e['site'] is not None] + [(o['site'], o['length']) for o in reg['owned']]
    base = json.loads((HERE.parents[2] / 'src/engine/assets/octatrack-base.elemod').read_text())  # the base's own sites
    held += [(int(s['addr'], 16), s['len']) for s in base['sites']]
    starts = {at for at, n in packages.runs(image, main).items() if n >= packages.LIMIT}
    starts |= {o for _, o, _, _ in scanner.stock_runs({'sections': {'i': {'parts': [['hex', image.hex()]]}}},
                                                       scanner.haystacks(args.stock, args.upstream.expanduser().resolve()), 16)}
    words = set()
    for r in relocations:
        words |= set(range(r, r + 4))
    copies, covered = [], set()
    for start in sorted(starts):
        if start in covered:
            continue
        # every stock occurrence of the run's first 12 bytes, longest match first, outside base-held sites
        at, candidates = main.find(image[start:start + 12]), []
        while at >= 0:
            n = 12
            while start + n < len(image) and at + n < len(main) and image[start + n] == main[at + n]:
                n += 1
            address = device.main_load + at
            if not any(address < a + l and a < address + n for a, l in held):
                candidates.append((n, -at, address))
            at = main.find(image[start:start + 12], at + 1)
        if not candidates:
            raise ValueError('%s: the stock run at image offset %#x exists only under base-held sites.' % (name, start))
        n, _, address = max(candidates)
        offset = start
        while offset < start + n:
            if offset in words:
                offset += 1
                continue
            end = offset
            while end < start + n and end not in words and end - offset < 32:
                end += 1
            piece = image[offset:end]
            if end - offset >= 2 and any(piece):
                copies.append(dict(offset=offset, length=end - offset, address=address + (offset - start),
                                   sha256=hashlib.sha256(piece).hexdigest(),
                                   purpose='%s: authored bytes coinciding with stock (strict scan), reconstructed from the '
                                           'identical bytes of the user\'s OS; review' % name))
                covered |= set(range(offset, end))
            offset = end
    return dict(schema=1, imageSha256=hashlib.sha256(image).hexdigest(), sources=inputs, copies=copies, fills=[])


def check_stock(sites, stock, upstream):
    """Each ABI 7 site's hash against the stock OS: a manifest that names the wrong bytes fails here, not on a unit."""
    firmware_codec.use_elekloader(upstream.expanduser().resolve())
    from elekloader import formats
    parsed, device, _ = formats.load(str(stock))
    main_image = formats.main_image(parsed, device)
    for address, digest, _, _, _, checked in sites:
        at = address - device.main_load
        if at < 0 or hashlib.sha256(main_image[at:at + checked]).digest() != digest:
            raise ValueError('The stock bytes at %#x are not the ones the module names.' % address)


def build_c(sources, cross, module, dsp=None, subscriptions=()):
    spec = importlib.util.spec_from_file_location('runtime_c_codegen', HERE.parent / 'm68k_codegen.py')
    codegen = importlib.util.module_from_spec(spec); spec.loader.exec_module(codegen)
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        objects = [tmp / ('%d.o' % i) for i in range(len(sources))]
        for source, obj in zip(sources, objects):
            subprocess.run([cross + 'gcc', *CFLAGS, *codegen.FLAGS, '-c', str(source), '-o', str(obj)], check=True)
        codegen.check_mcf54455(objects, cross + 'objdump')
        image, symbols, bss, offsets = link_units(objects, cross, 0, tmp)
    hooks = [symbols.get(name, NONE) for name in HANDLERS]
    if all(h == NONE for h in hooks) and not subscriptions:
        raise ValueError('Define at least one of ' + ', '.join(HANDLERS) + ', or subscribe to a site event.')
    if subscriptions:
        hooks = subscribe(hooks, subscriptions, symbols)
    return package(image, bss, hooks, offsets, name=module, dsp=dsp, abi=8 if subscriptions else None, hashed=bool(subscriptions),
                   title=module[:15] if subscriptions else '')


def build_elemod(args):
    if not (args.stock and args.upstream):
        sys.exit('--elemod needs --stock and --upstream.')
    firmware_codec.use_elekloader(args.upstream.expanduser().resolve())
    from elekloader import formats
    parsed, device, _ = formats.load(str(args.stock))
    main = formats.main_image(parsed, device)
    doc = json.loads(args.elemod.read_text())
    if doc.get('target', {}).get('section3_sha256') != hashlib.sha256(main).hexdigest():
        sys.exit('The module was converted for a different stock OS.')
    base = json.loads(args.base_symbols.read_text()) if args.base_symbols else {}

    def stock_at(address, length):
        at = address - device.main_load
        if at < 0 or at + length > len(main):
            raise ValueError('Stock bytes outside the OS image: %#x' % address)
        return main[at:at + length]

    image, offsets, sites = link_elemod(doc, stock_at, base)
    if not doc.get('subscribe'):
        return package(image, 0, [], offsets, sites, name=doc['id'])
    # Subscribers need ABI 8, whose sites carry their stock bytes' hash instead of the bytes.
    unevented(sites)
    symbols = {name: value for name, (where, value) in doc['symbols'].items() if where == '.run'}
    hooks = subscribe([NONE] * len(HANDLERS), doc['subscribe'], symbols, raises=doc.get('raise', ()))
    sites = [(a, hashlib.sha256(stock).digest(), code, local, 0, len(stock)) for a, stock, code, local in sites]
    return package(image, 0, hooks, offsets, sites, name=doc['id'], hashed=True, title=doc['id'][:15], abi=8)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('sources', type=Path, nargs='*')
    parser.add_argument('-o', '--output', type=Path, required=True)
    parser.add_argument('--cross', default='m68k-elf-')
    parser.add_argument('--elemod', type=Path)
    parser.add_argument('--stock', type=Path)
    parser.add_argument('--upstream', type=Path)
    parser.add_argument('--base-symbols', type=Path)
    parser.add_argument('--lease-policy', type=Path, help='with --octabam-machine: write its controller\'s write-lease '
                        'offsets (entry, Begin and End returns) for the base\'s trust row')
    parser.add_argument('--dsp', help='JSON:KEY, a relocatable DSP package; alone, or beside C sources')
    parser.add_argument('--slots', choices=sorted(SLOTS))
    parser.add_argument('--cycles', type=int, help='worst case per sample and instance')
    parser.add_argument('--cycles-kind', choices=sorted(CYCLE_KINDS))
    parser.add_argument('--state', type=int, help='r7 state words per instance')
    parser.add_argument('--buffer', type=int, default=0, help='Y words of the slot buffer the effect reads from its base')
    parser.add_argument('--name', help='the display name projects record it by (default: its catalogue name)')
    parser.add_argument('--layout', type=int, default=1, help='parameter-layout number: raise it when stored values change meaning')
    parser.add_argument('--no-page', action='store_true', help='leave out the effect page recipe (no chooser row on the unit)')
    parser.add_argument('--page-from', help='development only: another catalogue module\'s page (a copy of an effect under its own id, '
                                            'to fill more effect ids than the catalogue has)')
    parser.add_argument('--octabam-group', help='private ABI8 composed subset: poly8,vector,synth; no extra member is inferred')
    parser.add_argument('--module-id', help='stable group identity (default octatrack-machines)')
    parser.add_argument('--stock-recipe', type=Path, help='reviewed source/image hashes and explicit copies/fills')
    parser.add_argument('--capture-stock-recipe', type=Path, help='private hash-only recipe capture; no stock bytes')
    parser.add_argument('--octabam', help='a catalogue module from its Octabam manifest (ABI 7); a hybrid effect adds --dsp')
    parser.add_argument('--octabam-machine', help='a catalogue machine module as one independent package: its shared sites '
                                                  'through the base\'s events and tables (runtime.json or machine port)')
    parser.add_argument('--octabam-tables', help='a catalogue module that grows stock tables (Mute Modes) as published: its '
                                                 'reviewed table recipes, admitted by the base\'s table declaration')
    parser.add_argument('--private-port', action='store_true', help='reviewed private standalone StockCopy preparation; requires original stock; never publishes')
    parser.add_argument('--standalone', action='store_true', help='a reviewed standalone port (Play Modes, Tape Echo, Euclid) '
                        'as published: the committed standalone-recipes.json, no firmware; --stock also checks it against the OS')
    parser.add_argument('--pinned', action='store_true', help='its ColdFire code names its effect id (ABI 6 flag 2)')
    parser.add_argument('--subscribe', action='append', default=[], metavar='EVENT:FN:ORDER',
                        help='C sources: subscribe FN to a site event of sdk/machines/octatrack/events.json (repeatable)')
    args = parser.parse_args()
    if args.private_port and args.standalone:
        parser.error('--private-port prepares privately; --standalone builds the published package. Give one.')
    private = private_standalone(args, public=args.standalone) if args.private_port or args.standalone else None
    if args.subscribe and not args.sources:
        parser.error('--subscribe is for C sources; an octabam module subscribes in its runtime.json, an elemod in its "subscribe".')
    native = args.octabam or args.octabam_group or args.octabam_machine or args.octabam_tables
    if (bool(args.sources) + bool(args.elemod) + bool(args.octabam) + bool(args.octabam_group) + bool(args.octabam_machine)
            + bool(args.octabam_tables) > 1 or not (args.sources or args.elemod or args.dsp) and not native
            or (args.elemod and args.dsp) or (native and not args.upstream) or (args.octabam_tables and args.dsp)):
        parser.error('Give C sources, --elemod, --dsp, or --octabam with --upstream.')
    dsp, pkg = None, {}
    documents = json.loads((Path(__file__).resolve().parents[3] / 'src/catalog/module-documents.json').read_text())
    if args.dsp:
        path, _, key = args.dsp.partition(':')
        doc = json.loads(Path(path).read_text())
        pkg = next((p for p in doc['packages'] if p['id'] == key), None) if 'packages' in doc else doc[key] if key else doc
        if not pkg:
            parser.error('No DSP package %s in %s.' % (key, path))
        named = next((m.get('name') for m in documents.get('modules', []) if m.get('id') == pkg['id']), None) if 'id' in pkg else None
        dsp = dsp_section(pkg, args.slots, args.cycles or 0, args.cycles_kind, args.state or 0, args.buffer,
                          args.name or named or pkg.get('key', ''), args.layout)
    if args.octabam_group:
        data = octabam_group(args)
    elif args.octabam_machine:
        data = octabam_machine(args)
    elif args.octabam_tables:
        data = octabam_tables(args)
    elif args.elemod:
        data = build_elemod(args)
    elif args.sources:
        try:
            subscriptions = [dict(event=e, fn=f, order=int(o)) for e, f, o in (s.split(':') for s in args.subscribe)]
        except ValueError:
            parser.error('--subscribe takes EVENT:FN:ORDER')
        data = build_c(args.sources, args.cross, args.output.stem, dsp, subscriptions)
    else:
        image, relocations = page_section(args.page_from or pkg['id']) if 'id' in pkg and not args.no_page else (b'', [])
        bss, sites, copies, flags, hooks = 0, [], [], (1 if image else 0) | (2 if args.pinned else 0), []
        if args.octabam:  # the ColdFire half after the recipe, at a 16-byte boundary
            origin = (len(image) + 15) & ~15
            unit, bss, offsets, sites, copies = octabam_units(args.octabam, origin, args.cross, args.upstream.expanduser().resolve(),
                                                              dsp=bool(dsp), hooks=hooks)
            image, relocations = image + b'\0' * (origin - len(image)) + unit, relocations + [origin + r for r in offsets]
            if args.stock:
                check_stock(sites + [(address, digest, b'', [], 0, n) for _, address, n, digest in copies], args.stock, args.upstream)
        name = pkg.get('id', args.octabam or args.output.stem)
        title = args.name or next((m.get('name') for m in documents.get('modules', []) if m.get('id') == name), '')
        if private:
            adapter, inputs, stock_at, _ = private
            image, extra = adapter.apply(image, relocations, adapter.reviewed(HERE.parents[2], name), inputs,
                                         HERE.parents[2], stock_at)
            copies += extra
        data = package(image, bss, hooks, relocations, sites, name=name, dsp=dsp, flags=flags, hashed=bool(args.octabam),
                       title=title, layout=args.layout, copies=copies, abi=8 if private or hooks else None)
    if private:
        if private[1] != private[0].sources(HERE.parents[2], args.upstream, args.octabam):
            raise ValueError('A private standalone source changed during compilation.')
        if args.stock:
            private_stock_free(data, args.stock, private[3], args.upstream)
    if private and not args.standalone:
        fd = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'wb') as output:
            output.write(data)
    else:
        args.output.write_bytes(data)
    image, bss, count, hooks, sites, ident = struct.unpack_from('>IIIIII', data, 8)
    header = {8: 76, 7: 72, 6: 68}.get(data[5], 32)
    print('%s: module %08x, %d bytes of code and data, %d of bss, %d relocations, %d hooks, %d stock-code sites%s' % (
        args.output, ident, image, bss, count, sum(h != NONE for h in struct.unpack_from('>%dI' % hooks, data, header)), sites,
        ', DSP effect %d: %d words, %d relocations' % (dsp['effect'], len(dsp['words']), len(dsp['relocations'])) if dsp else ''))


if __name__ == '__main__':
    main()
