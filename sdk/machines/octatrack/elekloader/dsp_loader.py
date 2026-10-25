# SPDX-License-Identifier: GPL-3.0-or-later
"""DSP effects loaded on demand (build_core.py --dsp-loader): the DSP side.

Every DSP effect, stock or module, loads into a core when a track picks it.
The base takes each core's whole stock effect block: the three stock routines
other effects call stay resident at its start (where Modwerk's static builder
puts them, src/engine/static-dsp.ts), then the receiver (Octabam's runtime
receiver, answering through the host flags), then the code arena. Each stock
effect becomes a package recovered from the user's own firmware with
Modwerk's relocation recipes (src/engine/assets/stock-dsp-metadata.json,
checked against their hashes), and its dispatch is stock's null stub until it
is bound. Octabam's DSP DYNLOAD STOCK is the reference for the layout. Module
FX join the stock choosers when they register (fxpage.c builds their pages).
"""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

HERE = Path(__file__).resolve().parent
APP = HERE.parents[3]
RECEIVER = HERE / 'dsp_receiver.asm'  # Octabam's receiver, answering through the host flags
METADATA = APP / 'src/engine/assets/stock-dsp-metadata.json'
CHOOSERS = APP / 'src/engine/assets/chooser-metadata.json'
FRAME = {'A': 0x8e, 'B': 0x76}  # `move r6,x:>$207` at the head of each core's frame (dsp-dynload's hooks)
FRAME_WORDS = (0x667000, 0x000207)
INIT, PROC = 0x215, 0x235  # stock's dispatch table: init[32], then proc[32]
# Where the receiver keeps the dispatch tables (init[ids], then proc[ids]) and stock's six reads of them point: the
# start of X:$7a92-$7fff, which no payload record loads and nothing writes (docs/OCTATRACK_MORE_EFFECT_IDS.md step 1).
TABLE_HOME, TABLE_END = 0x7a92, 0x8000
TABLE_READ = 0x0a71d2      # the opcode word before each read's operand ($215 or $235), six per payload
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
    # X (docs/OCTATRACK_MORE_EFFECT_IDS.md step 1): is X:$7a92-$7fff, the planned home of the 128-id init and proc
    # tables, free on the unit with every effect running? The full loader, and in each frame hook: first fill the
    # region with its address xor $a5a5a5, 139 words a frame (10 frames, ending at $8000 exactly: the ESAI block is
    # not touched), then check 8 words a frame in turn. P words after the meter's window count what differs, keep
    # the first address and value that did, and the passes over the whole region (dsp.c reads them, dev.c 26).
    'X': (('tallied:\n', '''tallied:
        move    #>xwfillpos,r1          ; probe X: fill, then watch X:@XWSTART@-$7fff (past the dispatch tables)
        move    p:(r1),a
        tst     a
        bne     xwfrom
        move    #>@XWSTART@,a
xwfrom:
        cmp     #>$8000,a
        bge     xwwatch
        move    a1,r0
        do      #@XWCHUNK@,xwfillend
        move    r0,a
        eor     #>$a5a5a5,a
        move    a1,x:(r0)+
xwfillend:
        move    r0,p:(r1)
        bra     xwdone
xwwatch:
        move    #>xwcursor,r1
        move    p:(r1),a
        tst     a
        bne     xwat
        move    #>@XWSTART@,a
xwat:
        move    a1,r0
        do      #<8,xwlooped
        move    r0,a
        eor     #>$a5a5a5,a
        move    a1,x1
        move    x:(r0),a
        eor     x1,a                    ; Z from A1 only: zero when the word holds its pattern
        beq     xwok
        move    #>xwcount,r1
        move    p:(r1),a
        add     #>1,a
        move    a1,p:(r1)+
        move    p:(r1),a
        tst     a
        bne     xwok
        move    r0,p:(r1)+              ; the first address that differed
        move    x:(r0),x1
        move    x1,p:(r1)               ; and what it held
xwok:
        move    (r0)+
        move    r0,a
        cmp     #>$8000,a
        blt     xwnext
        move    #>@XWSTART@,r0
        move    #>xwpasses,r1
        move    p:(r1),a
        add     #>1,a
        move    a1,p:(r1)
xwnext:
        nop
xwlooped:
        move    #>xwcursor,r1
        move    r0,p:(r1)
xwdone:
'''), ('idlepub:                            ; then the published window: serial, least, most, sum, missed\n        nop\n        nop\n        nop\n        nop\n        nop\n',
       '''idlepub:                            ; then the published window: serial, least, most, sum, missed
        nop
        nop
        nop
        nop
        nop
xwfillpos:                                 ; probe X: the fill's next address (0 not started, $8000 done)
        nop
xwcursor:                               ; the watch's next address (0 not started)
        nop
xwcount:                                ; window words 7-10: words found changed, the first's address and value,
        nop                             ; passes over the region
xwfirst:
        nop
xwvalue:
        nop
xwpasses:
        nop
''')),
}


CORE1_WAIT = (0x57, (0x0cd341, 0x000000))  # payload B: brclr #1,y:<<$ffffd3,* (core 1 waits for core 0)
CORE1_METER = ('        move    b1,x0\n', '        move    x:>$2840,x0\n        clr     a\n        move    a1,x:>$2840\n')


def receiver_source(text, null, table_words, probe=None, burn=0, tag='A', ids=32):
    """The receiver with its table's size and stock's null stub (dry ids) filled in, its idle count
    core 1's counted wait on payload B; `burn` (calibration builds) spends that many more cycles every
    frame, so the load meter's idle count falls by a known amount."""
    if tag == 'B':
        if text.count(CORE1_METER[0]) != 1:
            raise ValueError('The DSP receiver changed; review core 1\'s idle count.')
        text = text.replace(*CORE1_METER)
    for old, new in ((PROBES[probe],) if probe and isinstance(PROBES[probe][0], str) else PROBES.get(probe) or ()):
        if text.count(old) != 1:
            raise ValueError('The DSP receiver changed; review probe %s.' % probe)
        text = text.replace(old, new)
    if burn:
        old = 'tallied:\n'
        if text.count(old) != 1 or not 0 < burn < 4096 or burn % 2:
            raise ValueError('The DSP receiver changed, or a burn not even and within 2-4094 cycles.')
        # A DO loop, not rep: rep holds off interrupts while it repeats.
        text = text.replace(old, old + '        do      #%d,burnt\n        nop\n        nop\nburnt:\n' % (burn // 2))
    if not 32 <= ids <= 128 or TABLE_HOME + 2 * ids > TABLE_END:
        raise ValueError('The dispatch tables hold 32 to 128 ids.')
    fill = lambda value, label: ('        move    #>$%x,x0\n        do      #%d,%s\n        move    x0,x:(r1)+\n%s:\n' % (
        value, ids - 32, label, label)) if ids > 32 else ''  # DO #0 would loop 65,536 times
    watched = TABLE_END - TABLE_HOME - 2 * ids
    chunk = max(k for k in range(1, 141) if watched % k == 0)  # probe X fills it in whole chunks, ending at $8000
    for old, new, count in (('@INITFILL@', fill(null[0], 'initfilled'), 1), ('@PROCFILL@', fill(null[1], 'procfilled'), 1),
                            ('@NULL_INIT@', '$%x' % null[0], 2), ('@NULL_PROC@', '$%x' % null[1], 2),
                            ('@INITTABLE@', '$%x' % TABLE_HOME, 3), ('@IDS@', str(ids), 7), ('@IDMAX@', str(ids - 1), 1),
                            ('@XWSTART@', '$%x' % (TABLE_HOME + 2 * ids), 4 if probe == 'X' else 0),
                            ('@XWCHUNK@', str(chunk), 1 if probe == 'X' else 0),
                            ('@DLWORDS@', str(table_words), 4)):
        if text.count(old) != count:
            raise ValueError('The DSP receiver changed (%s); review the port.' % old)
        text = text.replace(old, new)
    return text


def words_sha(words):
    """stock-dsp.ts dspWordsHash: big-endian 24-bit words."""
    return hashlib.sha256(b''.join(w.to_bytes(3, 'big') for w in words)).hexdigest()


def recovered(read, recipe):
    """A stock span with its recipe's address adjustments, checked before and after (stock-dsp.ts recoverStockDsp)."""
    words = [read(0, recipe['sourceAddress'] + i) for i in range(recipe['words'])]
    if words_sha(words) != recipe['sourceSha256']:
        raise ValueError('The stock DSP span at P:%#x differs from its recipe.' % recipe['sourceAddress'])
    for adjustment in recipe['adjustments']:
        words[adjustment['offset']] = (words[adjustment['offset']] + adjustment['delta']) & 0xffffff
    if words_sha(words) != recipe['sha256']:
        raise ValueError('The adjusted stock DSP span at P:%#x differs from its recipe.' % recipe['sourceAddress'])
    return words


def relocated(words, relocations, base):
    """As the loader places a package (transfer.c): absolute words gain the base, PC-relative ones (bit 15) lose it."""
    out = list(words)
    for r in relocations:
        out[r & 0x7fff] = (out[r & 0x7fff] + (-base if r & 0x8000 else base)) & 0xffffff
    return out


def disassembler():
    """dsp56kDisassemble, built beside ELEKLOADER_DSP_ASM in the same dsp56300 tree."""
    path = Path(os.environ.get('ELEKLOADER_DSP_ASM', '')).resolve().parents[1] / 'disassemble' / 'dsp56kDisassemble'
    if not path.is_file():
        raise ValueError('Build dsp56kDisassemble beside ELEKLOADER_DSP_ASM (the dsp56300 tree\'s disassemble target).')
    return path


def reads_buffer(words, base, init, work):
    """1 when the init at `init` (words placed at `base`) reads X:$213, its Y buffer base, before its
    first rts (buffers.h). Read from the code, as Octabam does, so no effect is missed by a list."""
    path = Path(work) / 'init.bin'
    path.write_bytes(b''.join(w.to_bytes(3, 'little') for w in words))
    out = subprocess.check_output([str(disassembler()), '-in', str(path), '-pc', '%x' % base, '-le'], text=True)
    for line in out.splitlines():
        m = re.match(r'([0-9a-f]{6}):\s*(.*?)\s*;', line)
        if not m or int(m[1], 16) < init:
            continue
        if 'x:>$213' in m[2]:
            return 1
        if m[2].split()[:1] == ['rts']:
            return 0
    return 1  # no rts reached: assume it reads, the side that reserves a block


def recipe(image, device, dsp, assemble, work, probe=None, burn=0, ids=32):
    """-> (sites, layout) for both payloads. `assemble(path)` is Elekloader's
    sdk.build.dsp_assemble (octabam's dsp_asm at two origins)."""
    metadata = json.loads(METADATA.read_text())
    if metadata['sourceSha256'] != hashlib.sha256(image).hexdigest():
        raise ValueError('The stock DSP metadata is for another OS image.')
    sites, layout, custom = [], {}, set(json.loads(CHOOSERS.read_text())['customIds'])
    for payload in metadata['payloads']:
        tag = payload['tag']
        read, at, records = payload_words(image, device, dsp, tag)
        taken = sorted(payload['packages'], key=lambda p: p['sourceAddress'])  # every stock DSP effect
        lo, hi, origin = payload['effectStart'], payload['effectEnd'], payload['sharedEnd']  # the receiver's
        # The block is exactly the effects and the routines outside them (FILTER's library), in one run.
        spans = sorted([(p['sourceAddress'], p['words']) for p in taken] + [(r['sourceAddress'], r['words']) for r in payload['shared']
                        if not any(p['sourceAddress'] <= r['sourceAddress'] < p['sourceAddress'] + p['words'] for p in taken)])
        if [s for s, _ in spans] != [lo] + [s + n for s, n in spans[:-1]] or spans[-1][0] + spans[-1][1] != hi:
            raise ValueError('Payload %s: the stock effect block is not one run.' % tag)
        shared, at_copy, routines = [], lo, {}
        for routine in sorted(payload['shared'], key=lambda r: r['destination']):
            if routine['destination'] != at_copy:
                raise ValueError('Payload %s: the shared stock routines do not pack from the block start.' % tag)
            routines[at_copy] = recovered(read, routine)
            shared += routines[at_copy]
            at_copy += routine['words']
        if at_copy != origin or origin > 0x1000:  # their one-word calls reach only below P:$1000
            raise ValueError('Payload %s: the shared stock routines do not end at %#x below P:$1000.' % (tag, origin))
        stock = {}
        for p in taken:
            words = recovered(read, p)
            proof = p['proofs'][0]
            if words_sha(relocated(words, p['relocations'], proof['base'])) != proof['sha256']:
                raise ValueError('Payload %s: %s does not relocate as its recipe proves.' % (tag, p['key']))
            stock[p['fxId']] = dict(key=p['key'], words=words, count=len(words), relocations=p['relocations'], init=p['init'], proc=p['proc'],
                                    slots=(1 if 'fx1' in p['slots'] else 0) | (2 if 'fx2' in p['slots'] else 0),
                                    buffer=reads_buffer(words, 0, p['init'], work))
        null = (read(1, INIT), read(1, PROC))  # effect 0, NONE, runs stock's null stub
        free, reads = 0, [0] * 32
        for fx in range(32):
            entry = (read(1, INIT + fx), read(1, PROC + fx))
            packaged = fx in stock
            if packaged != all(lo <= e < hi for e in entry) or (not packaged and any(lo <= e < hi for e in entry)):
                raise ValueError('Payload %s: effect %d dispatches across the stock effect block.' % (tag, fx))
            if fx in custom and entry == null:  # the ids Modwerk's modules take (chooser metadata)
                free |= 1 << fx
            if packaged:
                reads[fx] = stock[fx]['buffer']
            elif entry != null:  # what stays resident (DELAY's DSP side) keeps stock's Y block, as stock's own code reads it
                code = []
                for k in range(96):
                    try:
                        code.append(read(0, entry[0] + k))
                    except ValueError:
                        break
                reads[fx] = reads_buffer(code, entry[0], entry[0], work)
        free |= (1 << ids) - (1 << 32)  # every id past stock's 32 is a module's from the start (the receiver stubs them)
        hook = [read(0, FRAME[tag] + k) for k in range(2)]
        if hook != list(FRAME_WORDS):
            raise ValueError('Payload %s: the frame head is not the stock instruction the receiver replays.' % tag)
        # The receiver's size does not depend on its table's: every operand it moves is a long one.
        path = Path(work) / ('receiver-%s.asm' % tag)
        # One core at a time: with 2,000 more cycles a frame on both cores the unit hung at its logo (10 October 2026).
        burned = abs(burn) if (tag == 'B') == (burn < 0) else 0  # a negative burn is core 1's
        path.write_text(receiver_source(RECEIVER.read_text(), null, 0, probe, burned, tag, ids))
        size = len(assemble(str(path))[0])
        table = hi - origin - size
        path.write_text(receiver_source(RECEIVER.read_text(), null, table, probe, burned, tag, ids))
        code, labels, relocations = assemble(str(path))
        # The least arena that still runs every stock effect on its own: the largest, DARK REV.
        if len(code) != size or labels['dltable'] != size or table < SAVED + max(len(s['words']) for s in stock.values()):
            raise ValueError('Payload %s: the receiver and the largest stock effect do not fit the block.' % tag)
        # dsp.c reads the first wrong word back from three consecutive receiver words, after
        # tablebase's operand (the table address, a known word) and its rts.
        if [labels[k] - labels['missoffset'] for k in ('tablebase', 'missexpected', 'missactual')] != [-3, 1, 2]:
            raise ValueError('Payload %s: the receiver\'s mismatch record is not three consecutive words.' % tag)
        for index, offset in relocations:
            code[index] = origin + offset
        words, covered, fills = shared + code + [0] * table, 0, []  # the saved entries must start empty
        for space, start, count, first in records:  # one site per payload record
            a, b = max(lo, start), min(hi, start + count)
            if space or a >= b:
                continue
            offset, covered = first + 3 * (a - start) - device.main_load, covered + b - a
            sites.append(dict(addr=hex(offset + device.main_load), stock=image[offset:offset + 3 * (b - a)].hex(), op='bytes',
                              kind='data', new=b''.join(w.to_bytes(3, 'little') for w in words[a - lo:b - lo]).hex()))
            # The shared routines are stock code: the committed package names them by recipe (build_core.strip).
            for d, routine in routines.items():
                s, e = max(a, d), min(b, d + len(routine))
                if s < e:
                    fills.append(dict(tag=tag, shared=d, first=s - d, count=e - s, site='0x%08x' % (offset + device.main_load),
                                      offset=3 * (s - a)))
        if covered != hi - lo:
            raise ValueError('Payload %s does not load the stock effect block exactly once.' % tag)
        frame = origin + labels['frame']
        first = at(0, FRAME[tag]) - device.main_load
        sites.append(dict(addr=hex(at(0, FRAME[tag])), stock=image[first:first + 6].hex(), op='bytes', kind='data',
                          new=b''.join(w.to_bytes(3, 'little') for w in (0x0bf080, frame)).hex()))
        if tag == 'B':  # core 1's wait for core 0, counted (c1wait)
            if [read(0, CORE1_WAIT[0] + k) for k in range(2)] != list(CORE1_WAIT[1]):
                raise ValueError('Payload B: core 1 no longer waits for core 0 at P:$57.')
            first = at(0, CORE1_WAIT[0]) - device.main_load
            sites.append(dict(addr=hex(at(0, CORE1_WAIT[0])), stock=image[first:first + 6].hex(), op='bytes', kind='data',
                              new=b''.join(w.to_bytes(3, 'little') for w in (0x0bf080, origin + labels['c1wait'])).hex()))
        # Stock's six reads of the dispatch table (X:$215 + id, X:$235 + id) read the receiver's instead.
        reads_at = [a for sp, start, count, _ in records if sp == 0 for a in range(start + 1, start + count)
                    if read(0, a - 1) == TABLE_READ and read(0, a) in (INIT, PROC)]
        if len(reads_at) != 6 or sum(read(0, a) == INIT for a in reads_at) != 2:
            raise ValueError('Payload %s: stock does not read its dispatch table at six sites (two init, four proc).' % tag)
        for a in reads_at:
            first = at(0, a) - device.main_load
            sites.append(dict(addr=hex(at(0, a)), stock=image[first:first + 3].hex(), op='bytes', kind='data',
                              new=(TABLE_HOME + (ids if read(0, a) == PROC else 0)).to_bytes(3, 'little').hex()))
        for fx in sorted(stock):
            for table_at, value in ((INIT, null[0]), (PROC, null[1])):
                first = at(1, table_at + fx) - device.main_load
                sites.append(dict(addr=hex(at(1, table_at + fx)), stock=image[first:first + 3].hex(), op='bytes',
                                  kind='data', new=value.to_bytes(3, 'little').hex()))
        layout[tag] = dict(core=payload['core'], receiver=origin, frame=frame, table=origin + size, tableWords=table,
                           dispatch=TABLE_HOME, ids=ids,
                           miss=origin + labels['missoffset'], meter=origin + labels['idlepub'], null=null, free=free,
                           stock={fx: {k: v for k, v in s.items() if k != 'words'} for fx, s in stock.items()},
                           reads=reads, words={fx: s['words'] for fx, s in stock.items()}, shared=routines, fills=fills)
    if layout['A']['free'] != layout['B']['free']:
        raise ValueError('The two payloads leave different effect ids free.')
    return sites, layout



def catalog_c(layout, costs, ids=32):
    """dl_catalog and dl_codes (manager.c) as C: each stock DSP effect's package per core, and every
    other id what stock runs there (resident; a module's id until the module registers). Each stock effect is charged
    its own cycles, `costs[id]` (a loaded one must have one), and every other id `costs.get(id, 0)`: dsp.c charges each
    slot at least the dearest stock effect its bank's Parts name there. `ids` entries (the base's
    MODWERK_FX_IDS): past stock's 32, the null stub, resident, until step 4 of docs/OCTATRACK_MORE_EFFECT_IDS.md."""
    a, b = layout['A'], layout['B']
    if {fx: (len(w), a['stock'][fx]['slots']) for fx, w in a['words'].items()} != \
            {fx: (len(w), b['stock'][fx]['slots']) for fx, w in b['words'].items()} or a['reads'] != b['reads']:
        raise ValueError('The two payloads package the stock effects differently.')
    lines = ['struct code { const uint32_t *words; const uint16_t *relocations; uint16_t count, init, proc, relocation_count; };']
    unpack = []
    for n, tag in enumerate('AB'):
        for fx, words in sorted(layout[tag]['words'].items()):
            # Three bytes a word in the image (a RAM-booted base has 1.25 MiB), unpacked into RAM at the first tick.
            lines.append('static const uint8_t stock%d_%d_packed[] = {%s};' % (
                n, fx, ','.join('%#x' % (w >> s & 255) for w in words for s in (16, 8, 0))))
            lines.append('static uint32_t stock%d_%d[%d];' % (n, fx, len(words)))
            lines.append('static const uint16_t stock%d_%d_relocations[] = {%s};' % (
                n, fx, ','.join(str(r) for r in layout[tag]['stock'][fx]['relocations']) or '0'))
            unpack.append('{stock%d_%d_packed, stock%d_%d, %d}' % (n, fx, n, fx, len(words)))
    lines.append('void modwerk_dsp_unpack(void) {')
    lines.append('    static const struct { const uint8_t *from; uint32_t *to; uint32_t count; } all[] = {%s};' % ', '.join(unpack))
    lines.append('    for (unsigned i = 0; i < sizeof all / sizeof *all; ++i) for (uint32_t w = 0; w < all[i].count; ++w)')
    lines.append('        all[i].to[w] = (uint32_t)all[i].from[3 * w] << 16 | (uint32_t)all[i].from[3 * w + 1] << 8 | all[i].from[3 * w + 2];')
    lines.append('}')
    lines.append('struct dl_package dl_catalog[%d] = {%s};' % (ids, ', '.join(
        '{%d, 1, %d, %d, %d, 1, %d}' % ((len(a['words'][fx]), costs[fx], a['stock'][fx]['slots'], 0, a['reads'][fx]) if fx in a['stock']
                                        else (0, costs.get(fx, 0), 3, 1, a['reads'][fx] if fx < 32 else 0)) for fx in range(ids))))
    rows = []
    for n, tag in enumerate('AB'):
        s, w = layout[tag]['stock'], layout[tag]['words']
        rows.append('{%s}' % ', '.join('{stock%d_%d, stock%d_%d_relocations, %d, %d, %d, %d}' % (
            n, fx, n, fx, len(w[fx]), s[fx]['init'], s[fx]['proc'], len(s[fx]['relocations'])) if fx in s else '{0, 0, 0, 0, 0, 0}'
            for fx in range(ids)))
    lines.append('struct code dl_codes[2][%d] = {%s};' % (ids, ', '.join(rows)))
    return '\n'.join(lines) + '\n'


def choosers(image, ids=32):
    """The stock FX choosers, read from the base's own lists, which fxpage.c extends with each module that
    registers: -> (sites pointing stock's references at them and at the base's own copies of the four id tables,
    the C definitions of both with stock's rows). Read from the user's firmware.

    The id tables (FX1_IDS and FX2_IDS: id -> descriptor, 32 entries and a 0; FX1_ID2POS and ID2POS: id -> chooser
    row) are copied to `ids` entries (the base's MODWERK_FX_IDS; docs/OCTATRACK_MORE_EFFECT_IDS.md step 5): stock's
    entries, the module ids (and every id past 31) with no descriptor and no row yet. Stock names each table only
    by `lea table,%a0` (7, 7, 2 and 2 of them), so repointing those operands moves every reader; stock reads the
    Part's id sign-extended, so ids stay below 128. The chooser counts its rows to the list's 0, so the lists are
    `ids` long and need no other change."""
    meta = json.loads(CHOOSERS.read_text())
    layout = meta['layout']
    read = lambda at: int.from_bytes(image[at - 0x40000400:at - 0x40000400 + 4], 'big')
    if not 32 <= ids <= 128:
        raise ValueError('Effect ids stay between 32 and 128: stock reads the id as a signed byte.')
    lists = {}
    for slot, at in (('fx1', layout['FX1_LIST']), ('fx2', layout['FX2_LIST'])):
        rows = []
        while read(at + 4 * len(rows)) and len(rows) < 32:
            rows.append(read(at + 4 * len(rows)))
        lists[slot] = rows
    none = read(layout['FX1_IDS'])
    modules = set(meta['customIds']) | set(range(32, ids))
    if none != layout['FX1_NONE'] or any(rows[0] != none or len(rows) + len(modules) + 1 > ids for rows in lists.values()):
        raise ValueError('The stock FX choosers are not the lists the base extends.')
    sites = []
    for slot, at, symbol in (('fx1', layout['FX1_LIST'], 'modwerk_fx1_list'), ('fx2', layout['FX2_LIST'], 'modwerk_fx2_list')):
        for ref in meta[slot + 'References']:
            if read(ref) != at:
                raise ValueError('A stock chooser reference at %#x does not name its list.' % ref)
            sites.append(dict(addr=hex(ref), stock=image[ref - 0x40000400:ref - 0x40000400 + 4].hex(), op='ptr', target=symbol))
    c = ''
    for table, symbol, words, value, terminated, leas in (
            (layout['FX1_IDS'], 'modwerk_fx1_ids', 32, none, True, 7), (layout['FX2_IDS'], 'modwerk_fx2_ids', 32, none, True, 7),
            (layout['FX1_ID2POS'], 'modwerk_fx1_id2pos', 32, 0, False, 2), (layout['ID2POS'], 'modwerk_fx2_id2pos', 32, 0, False, 2)):
        if terminated and read(table + 4 * words):
            raise ValueError('Stock\'s table at %#x is not 32 entries and a 0.' % table)
        entries = [value if fx in modules else read(table + 4 * fx) for fx in range(ids)] + ([0] if terminated else [])
        c += 'uint32_t %s[%d] = {%s};\n' % (symbol, len(entries), ', '.join('%#xu' % e for e in entries))
        found, needle, at = [], table.to_bytes(4, 'big'), image.find(table.to_bytes(4, 'big'))
        while at >= 0:
            found.append(0x40000400 + at)
            at = image.find(needle, at + 1)
        # lea abs.l,%aN is 0x41f9 | N << 9, then the address
        if len(found) != leas or any(int.from_bytes(image[a - 0x40000400 - 2:a - 0x40000400], 'big') & 0xf1ff != 0x41f9 for a in found):
            raise ValueError('Stock\'s table at %#x is not named by %d lea operands alone.' % (table, leas))
        sites += [dict(addr=hex(a), stock=needle.hex(), op='ptr', target=symbol) for a in found]
    c += ''.join('uint32_t modwerk_%s_list[%d] = {%s};\n' % (slot, ids, ', '.join('%#xu' % row for row in rows)) for slot, rows in lists.items())
    c += 'const uint32_t modwerk_fx_rows[2] = {%d, %d};\n' % (len(lists['fx1']), len(lists['fx2']))
    return sites, c
