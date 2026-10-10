# SPDX-License-Identifier: GPL-3.0-or-later
"""DSP effects loaded on demand (build_core.py --dsp-loader): the DSP side.

Octabam's DSP dynamic loading (sdk/octabam/platform/dsp-dynload-transport)
in the Elekloader base: its runtime receiver on both cores, at the head of
each core's audio frame, and a code arena. Both live in the program words of
the three FX2 reverbs, which the base takes off the FX2 chooser and points
at stock's null stub, as Modwerk's loader-free builds do when module code
needs room (src/engine/static-dsp.ts). Module FX appear in the stock choosers
(Modwerk's chooser composer, scripts/octatrack-base-choosers.mjs). No stock words are written into
the receiver: dry slots use stock's own null stub.
"""
import hashlib
import json
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
APP = HERE.parents[3]
RECEIVER = HERE / 'dsp_receiver.asm'  # Octabam's receiver, answering through the host flags
METADATA = APP / 'src/engine/assets/stock-dsp-metadata.json'
CHOOSERS = APP / 'src/engine/assets/chooser-metadata.json'
CHOOSERS_SCRIPT = APP / 'scripts/octatrack-base-choosers.mjs'
HARVEST = ('PLATE REV', 'SPRING REV', 'DARK REV')
MODULES = ('everb',)  # module FX with a chooser row in this base: the pilot
FRAME = {'A': 0x8e, 'B': 0x76}  # `move r6,x:>$207` at the head of each core's frame (dsp-dynload's hooks)
FRAME_WORDS = (0x667000, 0x000207)
INIT, PROC = 0x215, 0x235  # the shared dispatch table: init[32], then proc[32]
SAVED = 64                 # the receiver keeps each id's original entries at the head of its table


def payload_words(image, device, dsp, tag):
    """(read(space, address) -> word, main OS address of a word) for payload `tag`."""
    records = dsp.records(image, device, tag)

    def at(space, address):
        for sp, lo, count, first in records:
            if sp == space and lo <= address < lo + count:
                return first + 3 * (address - lo)
        raise ValueError('Payload %s does not load %s:%#x.' % (tag, 'PXY'[space], address))
    return (lambda space, address: dsp.w24(image, at(space, address) - device.main_load)), at, records


# Hardware probes (build_core.py --dsp-probe), to find which step stops core 0: A takes packets
# but never looks at them (delivery only); B checks a packet and answers, and does nothing else.
PROBES = {
    'A': ('        move    r6,x:>$207              ; the instruction the hook displaced\n',
          '        move    r6,x:>$207              ; the instruction the hook displaced\n        rts\n'),
    'B': ('        move    r3,x:(r0+63)\n        move    x:(r0+2),a\n',
          '        move    #>0,x0\n        bra     reply\n        move    x:(r0+2),a\n'),
}


def receiver_source(text, null, table_words, probe=None):
    """The receiver with its table's size and stock's null stub (dry ids) filled in."""
    if probe:
        old, new = PROBES[probe]
        if text.count(old) != 1:
            raise ValueError('The DSP receiver changed; review probe %s.' % probe)
        text = text.replace(old, new)
    for old, new, count in (('@NULL_INIT@', '$%x' % null[0], 1), ('@NULL_PROC@', '$%x' % null[1], 1),
                            ('@DLWORDS@', str(table_words), 3)):
        if text.count(old) != count:
            raise ValueError('The DSP receiver changed (%s); review the port.' % old)
        text = text.replace(old, new)
    return text


def helper_callers(payload, routine):
    """Effects calling a shared stock routine: each caller's call moves with the routine (static-dsp.ts)."""
    shift = routine['destination'] - routine['sourceAddress']
    return {p['key'] for p in payload['packages'] if p['key'] != routine['owner'] and
            any(a['delta'] == shift for a in p['adjustments'])}


def recipe(image, device, dsp, assemble, work, probe=None):
    """-> (sites, layout) for both payloads. `assemble(path)` is Elekloader's
    sdk.build.dsp_assemble (octabam's dsp_asm at two origins)."""
    metadata = json.loads(METADATA.read_text())
    if metadata['sourceSha256'] != hashlib.sha256(image).hexdigest():
        raise ValueError('The stock DSP metadata is for another OS image.')
    sites, layout, custom = [], {}, set(json.loads(CHOOSERS.read_text())['customIds'])
    for payload in metadata['payloads']:
        tag = payload['tag']
        read, at, records = payload_words(image, device, dsp, tag)
        taken = sorted((p for p in payload['packages'] if p['key'] in HARVEST), key=lambda p: p['sourceAddress'])
        lo, hi = taken[0]['sourceAddress'], taken[-1]['sourceAddress'] + taken[-1]['words']
        if len(taken) != len(HARVEST) or sum(p['words'] for p in taken) != hi - lo:
            raise ValueError('Payload %s: the harvested effects are not one run.' % tag)
        for routine in payload['shared']:
            if lo <= routine['sourceAddress'] < hi and not helper_callers(payload, routine) <= set(HARVEST):
                raise ValueError('Payload %s: an effect that stays calls %s.' % (tag, routine['owner']))
        null = (read(1, INIT), read(1, PROC))  # effect 0, NONE, runs stock's null stub
        free = 0
        for fx in range(32):
            entry = (read(1, INIT + fx), read(1, PROC + fx))
            harvested = any(p['fxId'] == fx for p in taken)
            if harvested != all(lo <= e < hi for e in entry) or (not harvested and any(lo <= e < hi for e in entry)):
                raise ValueError('Payload %s: effect %d dispatches across the harvested run.' % (tag, fx))
            if fx in custom and entry == null:  # the ids Modwerk's modules take (chooser metadata)
                free |= 1 << fx
        hook = [read(0, FRAME[tag] + k) for k in range(2)]
        if hook != list(FRAME_WORDS):
            raise ValueError('Payload %s: the frame head is not the stock instruction the receiver replays.' % tag)
        # The receiver's size does not depend on its table's: every operand it moves is a long one.
        path = Path(work) / ('receiver-%s.asm' % tag)
        path.write_text(receiver_source(RECEIVER.read_text(), null, 0, probe))
        size = len(assemble(str(path))[0])
        table = hi - lo - size
        path.write_text(receiver_source(RECEIVER.read_text(), null, table, probe))
        code, labels, relocations = assemble(str(path))
        if len(code) != size or labels['dltable'] != size or table < SAVED + 1:
            raise ValueError('Payload %s: the receiver does not fit the harvested run.' % tag)
        # dsp.c reads the first wrong word back from three consecutive receiver words, after
        # tablebase's operand (the table address, a known word) and its rts.
        if [labels[k] - labels['missoffset'] for k in ('tablebase', 'missexpected', 'missactual')] != [-3, 1, 2]:
            raise ValueError('Payload %s: the receiver\'s mismatch record is not three consecutive words.' % tag)
        for index, offset in relocations:
            code[index] = lo + offset
        words, covered = code + [0] * table, 0  # the saved entries must start empty
        for space, start, count, first in records:  # one site per payload record
            a, b = max(lo, start), min(hi, start + count)
            if space or a >= b:
                continue
            offset, covered = first + 3 * (a - start) - device.main_load, covered + b - a
            sites.append(dict(addr=hex(offset + device.main_load), stock=image[offset:offset + 3 * (b - a)].hex(), op='bytes',
                              kind='data', new=b''.join(w.to_bytes(3, 'little') for w in words[a - lo:b - lo]).hex()))
        if covered != hi - lo:
            raise ValueError('Payload %s does not load the harvested run exactly once.' % tag)
        frame = lo + labels['frame']
        first = at(0, FRAME[tag]) - device.main_load
        sites.append(dict(addr=hex(at(0, FRAME[tag])), stock=image[first:first + 6].hex(), op='bytes', kind='data',
                          new=b''.join(w.to_bytes(3, 'little') for w in (0x0bf080, frame)).hex()))
        for fx in sorted(p['fxId'] for p in taken):
            for table_at, value in ((INIT, null[0]), (PROC, null[1])):
                first = at(1, table_at + fx) - device.main_load
                sites.append(dict(addr=hex(at(1, table_at + fx)), stock=image[first:first + 3].hex(), op='bytes',
                                  kind='data', new=value.to_bytes(3, 'little').hex()))
        layout[tag] = dict(core=payload['core'], receiver=lo, frame=frame, table=lo + size, tableWords=table,
                           miss=lo + labels['missoffset'],
                           null=null, free=free, harvested=sum(1 << p['fxId'] for p in taken))
    if layout['A']['free'] != layout['B']['free']:
        raise ValueError('The two payloads leave different effect ids free.')
    return sites, layout


def choosers(image, node='node'):
    """Modwerk's chooser composer (CHOOSERS_SCRIPT): the module rows join the stock
    rows, and FX2 loses the harvested reverbs. -> (sites, chooser)."""
    out = subprocess.run([node, str(CHOOSERS_SCRIPT), json.dumps(dict(modules=MODULES, harvest=HARVEST))],
                         input=image, capture_output=True, check=True)
    result = json.loads(out.stdout)
    sites = []
    for write in result['writes']:
        offset, new = write['address'] - 0x40000400, bytes.fromhex(write['bytes'])
        guarded = image[offset:offset + write['guardLength']]
        if hashlib.sha256(guarded).hexdigest() != write['guardSha256'] or len(new) > len(guarded):
            raise ValueError('A chooser write does not match the stock image at %#x.' % write['address'])
        sites.append(dict(addr=hex(write['address']), stock=image[offset:offset + len(new)].hex(), op='bytes',
                          kind='data', new=new.hex()))
    # A track with a harvested reverb opens the FX2 chooser on NONE, not on its old row (now another effect's, or past the end).
    meta = json.loads(CHOOSERS.read_text())
    written = {int(w['address']) for w in result['writes']}
    for key in HARVEST:
        fx = next(e['fxId'] for e in meta['stockEffects'] if e['key'] == key)
        at = meta['layout']['ID2POS'] + 4 * fx
        if at in written:
            raise ValueError('The chooser composer now writes %s\'s cursor row; review.' % key)
        offset = at - 0x40000400
        sites.append(dict(addr=hex(at), stock=image[offset:offset + 4].hex(), op='bytes', kind='data', new='00000000'))
    return sites, result['chooser']
