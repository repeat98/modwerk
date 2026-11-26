#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Probes A and B of a module-owned DSP stream: development twins only, never for users.

Probe A measures whether the base can push N more halfwords a frame to DSP core 0 through stock's host-port chain,
probe B whether it can pull N more from core 0, how safely and how fast. A build carries A, B or both (the real
channel's shape: both directions every frame). Build one with build_core.py's own arguments plus the probe flags,
through this file:

    python3 -B sdk/machines/octatrack/module-adapters/stream_probe.py --stream-probe 64 --stream-read 64 --stock OS.bin ... --dev

It runs build_core.py with the seams below (BUILD_EDITS) applied in memory, as resident_source.py runs the patched
loader; build_core.py and every file a base's identity hashes stay untouched, so every other build is byte-identical.
The probes' own files enter the identity (`inputs`), both N included. The build refuses --usb-input beside either:
both take the frame-head site (P:$88) that USB AUDIO IN's receiver uses, and A its block's place.

Probe A (--stream-probe N, ColdFire -> core 0):
- ColdFire: the shared state-7 scheduler (dsp_hooks.s) sends one block of N halfwords before the loader's packet, as
  USB AUDIO IN's did, from stream_probe.c's 16-byte-aligned buffer to host destination $6000 + the block's offset,
  which core 0's host handler masks into X:$2000 or X:$4000 + the offset, the bank it reads next frame. stream_probe.c
  saves TCD0's SADDR, NBYTES, CITER and BITER before the block and puts them back right before state 7 unmasks the
  frame interrupt (stock rewrites all four from state 1 on; nothing else is written), and stamps DTCN3 at the block's
  start, its completion and the unmask against the frame interrupt's entry (mw_frame_t0, so --site-events).
- DSP: a checker at core 0's frame head (P:$88) checks each block: magic, a sequence one past the last, every pattern
  word, bits 16-23. It counts frames, good, bad, missing and out-of-order blocks in private P words and publishes a copy
  when a block asks for it; the ColdFire reads that copy with the loader's PEEK (dev request 47, `do stream:dsp`).
- Up to 160 halfwords the block sits at X:$x360-$x3ff, as on the unit on 26 November 2026; from 192 to 928 it sits at
  X:$x1be0-$x1f7f (A_WIDE), the top of the free run below.

Probe B (--stream-read N, core 0 -> ColdFire):
- DSP: the same frame-head site writes a block of N words into this frame's bank at X:$x1840 (READ_REGION): magic
  $5352, a 16-bit sequence the DSP counts, then ((sequence & $ff) << 8) + i in the low 16 bits of word i.
- ColdFire: core 0's frame head switches the host handlers' bank masks to the other bank and then raises the frame
  interrupt, whose entry pulls 512 halfwords from X:$x600 of the bank the DSP worked on last frame, over eDMA channels
  1, 6 and 7. Channel 7's completion enters stock's state 0 (0x40004862), which this probe takes (its first 8
  bytes, guarded): with core 0 still selected, before stock turns to core 1, it pulls N halfwords from $6000 + $1840
  the same way (ICR $81, address, count - 1, host command $89, channel 1 with stock's inherited TCD1 attributes,
  16-byte bursts, minor loops of 64 bytes or 32, linked to itself as stock's are), so it reads the block the DSP wrote
  one frame earlier, in the bank the DSP does not touch this frame. Channel 1's completion enters state 0 again:
  stream_probe.c puts back TCD1's DADDR, NBYTES, CITER and BITER, clears channel 1's request and stock's state 0 runs
  as if nothing came between. TCD1's CSR is written $0002, the value stock's state 0 writes before its own transfer,
  and is not put back: stock's state 0 rewrites it before anything reads it. The block is checked after state 7's
  unmask (magic, the sequence one past the last, every pattern word), timed against the frame interrupt's entry:
  the read's start, completion, transfer, the unmask in frames with and without a read, and the check itself. Dev
  request 48 reads it (`npm run device -- do streamb`).

Why the regions are free in this build (`claims`, `proof`, `chain_proof`, `mailbox_initialization`, `scheduler`):
- X:$x360-$x3ff (160 words a bank): no base feature's ledger region (dsp-sites.json) meets it on core 0; no stock X
  record of payload A loads into it in either bank; the loader's packet ends below it ($x320-$x35f); stock's next
  transfer starts at $x400; USB AUDIO IN, which is not in this build, was its only writer.
- X:$x1840-$x1f7f (1856 words a bank) for B and wide A: payload A's X records load $4840-$583f (offsets $840-$183f,
  bank $4000) and nothing at $2840 and up in bank $2000; the ledger's one X region, Analog BD's tables and voices
  at $2840-$36ff, ends below $3840; payload A's frame head writes $3f80-$3f81, above it; no stock or base host
  transfer reaches past $x83f (TRANSFERS, from the stock chain whose bytes `chain_proof` guards).
Any other writer shows on the unit: as bad blocks on the DSP's checker (A) or the ColdFire's (B).

The channel (--stream-channel, stream_channel.c): A's and B's paths carry the blocks of the slots that stream (events.json
ot_dsp_effects stream_in, stream_out) instead of a pattern, from A's wide region X:$x1be0 (in) and B's X:$x1840 (out),
as many minor loops a frame as the open lanes cover; no frame-head code. dsp_programs.c names each slot's blocks in its
slot record. Development twins only, core 0 only (T5-T8), no --usb-input, beside the base's program areas.
"""
import hashlib
import json
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from usb_audio_input import DSP_FRAME_SITE, STOCK_FRAME_GUARD  # noqa: E402  payload A's frame-head site P:$88, its guard
APP = HERE.parents[3]
LEDGER = HERE.parent / 'dsp-sites.json'
SOURCE = HERE / 'stream_probe.c'
CHANNEL = (HERE / 'stream_channel.c', HERE / 'stream_channel.h')
BUILD_CORE = HERE.parent / 'elekloader' / 'build_core.py'
BANKS = (0x2000, 0x4000)  # core 0's host masks: $6000 + offset lands at $2000 or $4000 + offset, alternating each frame
DESTINATION = 0x6360   # probe A up to 160 words: X:$2360 or X:$4360 after the DSP's mask
REGION = DESTINATION & 0x0fff
CAPACITY = 0x400 - REGION  # 160 words a bank, up to stock's own $x400 transfer
FREE_RUN = (0x1840, 0x1f80)  # offsets free in both banks (the module docstring)
READ_REGION, READ_CAPACITY = 0x1840, 0x3a0  # probe B: X:$x1840-$x1bdf, 928 words
A_WIDE, A_WIDE_CAPACITY = 0x1be0, 0x3a0     # probe A past 160 words: X:$x1be0-$x1f7f, 928 words
WORDS = tuple(range(32, CAPACITY + 1, 32))  # whole 64-byte minor loops: 32, 64, 96, 128, 160
WIDE_WORDS = tuple(range(CAPACITY + 32, A_WIDE_CAPACITY + 1, 32))  # 192 .. 928
READ_WORDS = tuple(range(32, READ_CAPACITY + 1, 16))  # whole 32-byte minor loops: 32 .. 928
MAGIC = 0x5350         # bit 0 set: publish the counters after this block (a snapshot)
READ_MAGIC = 0x5352
REQUEST = 47           # dev.c: STREAM PROBE; wValue 0 read, 1 start, 2 stop, 3 snapshot, 4 read and restart the windows
READ_REQUEST = 48      # dev.c: STREAM PROBE B; wValue 0 read, 1 start, 2 stop, 3 zero the counts, 4 read and restart the windows
REPLY_WORDS = 51       # 16 counts, 5 time windows of 5 words, the published copy
READ_REPLY_WORDS = 50  # 20 counts, 6 time windows of 5 words
DSP_WORDS = 10         # the published copy: serial, frames, good, bad, missing, jumps, junk, last, diff, serial
COUNTERS = ('frames', 'good', 'bad', 'missing', 'jumps', 'junk', 'last', 'diff')
STATE0 = 0x40004862    # stock's state 0: `moveq #7,%d1; move.b %d1,0xfc04401c` (channel 7's request), then core 1's pull
STATE0_GUARD = '575368927015d4a39583271e15f2d7cbda056fa0f830e1453ebd6ba52d3fc365'
# The stock chain these proofs read: the eDMA completion entry and states 0-7 (0x40004840-0x40004bd1), and the frame
# interrupt's pull from core 0 and its state reset (0x4000ab1a-0x4000ac37).
CHAIN_GUARDS = ((0x40004840, 0x40004bd2, 'ab08f384c1560140749d616e58be273b632df105435a6363422890cdd5ac7501'),
                (0x4000ab1a, 0x4000ac38, '2d03ee9fe3c1f09ac3f7397d1d826f869e9d798281ff3da53e3cb874a7a73565'))
# Core 0's transfers in that chain: offset in the bank, words, direction, where (as read from the guarded bytes).
TRANSFERS = ((0x600, 512, 'read', 'frame entry, channels 1, 6, 7'), (0x080, 672, 'write', 'state 1'),
             (0x800, 64, 'write', 'state 3'), (0x000, 128, 'write', 'state 5'), (0x400, 512, 'write', 'state 6'),
             (0x320, 64, 'write', "the DSP loader's packet, state 7 (scheduler checks it)"))


def replace(text, before, after):
    if text.count(before) != 1:
        raise ValueError('Stream probe seam drifted: ' + before.splitlines()[0])
    return text.replace(before, after)


def check_words(words):
    if words not in WORDS + WIDE_WORDS:
        raise ValueError('--stream-probe takes %s halfwords: whole 64-byte minor loops within X:$%x-$3ff, or from %d '
                         'to %d by 32 at X:$%x.' % (', '.join(map(str, WORDS)), REGION, WIDE_WORDS[0], WIDE_WORDS[-1], A_WIDE))
    return words


def check_read_words(words):
    if words not in READ_WORDS:
        raise ValueError('--stream-read takes %d to %d halfwords by 16 (whole 32-byte minor loops within X:$%x-$%x).'
                         % (READ_WORDS[0], READ_WORDS[-1], READ_REGION, READ_REGION + READ_CAPACITY - 1))
    return words


def region_a(words):
    """Probe A's block: (offset in the bank, capacity)."""
    check_words(words)
    return (REGION, CAPACITY) if words <= CAPACITY else (A_WIDE, A_WIDE_CAPACITY)


def read_loop_bytes(words):
    """Probe B's minor loop: 64 bytes when the block is whole 64-byte loops, else 32 (both whole 16-byte bursts)."""
    return 64 if words % 32 == 0 else 32


def pattern(sequence, words, snapshot=False, magic=MAGIC):
    """The block a probe sends, as 16-bit halfwords: magic, sequence, then ((sequence & $ff) << 8) + i."""
    s = sequence & 0xffff
    return [magic | bool(snapshot), s] + [((s & 0xff) << 8) + i & 0xffff for i in range(2, words)]


def read_pattern(sequence, words):
    return pattern(sequence, words, magic=READ_MAGIC)


def claims(a_words=0, b_words=0):
    """The X ranges this build's probes use in each bank: (offset, words, who)."""
    found = []
    if a_words:
        at, capacity = region_a(a_words)
        found.append((at, capacity, 'stream probe A'))
    if b_words:
        check_read_words(b_words)
        found.append((READ_REGION, READ_CAPACITY, 'stream probe B'))
    return found


def proof(ledger=LEDGER, a_words=160, b_words=0):
    """No base feature's X region on core 0 meets a claimed range in either bank, no stock or base transfer to core 0
    meets one, and B and wide A stay in the free run; -> how many ledger X regions were checked."""
    regions = json.loads(Path(ledger).read_text())['regions']
    spans = claims(a_words, b_words)
    for at, words, who in spans:
        if at >= 0x800 and not (FREE_RUN[0] <= at and at + words <= FREE_RUN[1]):
            raise ValueError(who + ' leaves the free run X:$x%x-$x%x.' % FREE_RUN)
        for start, count, _, where in TRANSFERS:
            if start < at + words and at < start + count:
                raise ValueError('%s meets a host transfer to core 0 (%s).' % (who, where))
    for (a, n, who), (b, m, other) in ((x, y) for i, x in enumerate(spans) for y in spans[i + 1:]):
        if a < b + m and b < a + n:
            raise ValueError(who + ' meets ' + other)
    seen = 0
    for r in regions:
        if r['space'] != 'x' or not (r.get('shared') or 'A' in r.get('cores', ())):
            continue
        start = int(r['start'], 16)
        end = start + int(r['words'], 16)
        seen += 1
        for at, words, who in spans:
            if any(start < bank + at + words and bank + at < end for bank in BANKS):
                raise ValueError('The %s block meets a ledger region: %s' % (who, r['about']))
    return seen


def chain_proof(image, load):
    """The stock bytes TRANSFERS and the state-0 hook were read from."""
    for start, end, digest in CHAIN_GUARDS:
        if hashlib.sha256(image[start - load:end - load]).hexdigest() != digest:
            raise ValueError('The stock frame chain at %#x changed: review stream_probe.py TRANSFERS.' % start)
    return len(CHAIN_GUARDS)


def checker_source(words):
    """Probe A's frame-head checker, from its displaced instruction to its counters. Live at P:$88: r2 (stored here),
    r4-r7, b; free: a, x1, r0, r1 (as USB AUDIO IN's inject). y0 is kept in the block's consumed magic word and put
    back. One DO loop over the pattern, no rep, no brclr; logical tests only (Z from A1), so stale A2 bits neither
    pass nor fail a check. No label is part of another word: dsp_asm substitutes a label's text wherever it appears.
    Past 256 words the expected value carries into bit 16, so the junk test then looks at bits 17-23 only."""
    region, _ = region_a(words)
    junk = 0xff0000 if words <= 256 else 0xfe0000
    return f'''; Stream probe A, core 0 (stream_probe.py). The block at this frame's bank + ${region:x}: word 0 magic ${MAGIC:x}
; (bit 0: publish), word 1 the ColdFire's sequence, word i>=2 ((sequence & $ff) << 8) + i, 16 bits each.
sqentry:
        move    r2,x:>$204              ; the displaced instruction
        move    r6,a
        add     #>${region:x},a
        move    a,r0                    ; the block
        move    #>sqframes,r1
        move    p:(r1),a
        add     #<1,a
        move    a1,p:(r1)               ; frames
        move    x:(r0),a
        eor     #>${MAGIC:x},a
        and     #>$fffe,a
        beq     sqblock
        move    #>sqmiss,r1
        move    p:(r1),a
        add     #<1,a
        move    a1,p:(r1)               ; missing: no block this frame
        rts
sqblock:
        move    x:(r0),a
        move    x:(r0+1),x1
        move    #>sqsnap,r1
        move    a1,p:(r1)               ; bit 0: publish after this block
        or      x1,a
        and     #>$ff0000,a             ; the header's bits 16-23
        move    y0,x:(r0)               ; y0 kept over the consumed magic
        move    a1,y0                   ; y0: every difference, ORed
        move    x1,a
        and     #>$ffff,a
        move    a1,x1                   ; the sequence
        move    #>sqlast,r1
        move    p:(r1),a
        add     #<1,a
        and     #>$ffff,a
        eor     x1,a
        beq     sqorder
        move    #>sqjump,r1
        move    p:(r1),a
        add     #<1,a
        move    a1,p:(r1)               ; not one past the last block
        move    #>sqlast,r1
sqorder:
        move    x1,p:(r1)               ; last
        move    x1,a
        and     #>$ff,a
        asl     #$8,a,a
        add     #<2,a
        move    a1,r1                   ; word 2's value; r1 counts the pattern
        lua     (r0+2),r0
        do      #{words - 2},sqloop
        move    r1,x1
        lua     (r1+1),r1
        move    x:(r0)+,a
        eor     x1,a
        or      y0,a
        move    a1,y0
sqloop:
        move    y0,a
        and     #>$ffff,a
        beq     sqclean
        move    #>sqdiff,r1
        move    y0,p:(r1)               ; the last bad block's differences
        move    #>sqbad,r1
        bra     sqtally
sqclean:
        move    #>sqgood,r1
sqtally:
        move    p:(r1),a
        add     #<1,a
        move    a1,p:(r1)
        move    y0,a
        and     #>${junk:x},a
        beq     sqback
        move    #>sqjunk,r1
        move    p:(r1),a
        add     #<1,a
        move    a1,p:(r1)               ; a word with bits 16-23 set
sqback:
        move    r6,a
        add     #>${region:x},a
        move    a,r0
        move    #>sqsnap,r1
        move    x:(r0),y0               ; y0 back
        move    #<0,x1
        move    x1,x:(r0)               ; the block consumed
        move    p:(r1),a
        and     #>$1,a
        beq     sqdone
        move    #>sqpub,r1
        move    p:(r1),a
        add     #<1,a
        move    a1,p:(r1)+              ; serial
        move    a1,x1
        move    #>sqframes,r0
        do      #8,sqcopy
        move    p:(r0)+,a
        move    a1,p:(r1)+
sqcopy:
        move    x1,p:(r1)               ; the serial again: a read whose two serials differ is torn
sqdone:
        rts
sqframes:
        nop
sqgood:
        nop
sqbad:
        nop
sqmiss:
        nop
sqjump:
        nop
sqjunk:
        nop
sqlast:
        nop
sqdiff:
        nop
sqsnap:
        nop
sqpub:
''' + '        nop\n' * DSP_WORDS


def writer_source(words, displaced):
    """Probe B's frame-head writer: this frame's bank + READ_REGION gets the block the ColdFire reads at its next
    frame's state 0. Uses a, x1, r0 and r1 only (free at P:$88), keeps r2 for the displaced instruction (here when
    the writer runs alone, else at the head of probe A's checker, which follows it). A1 is stored, never A, so no
    value is limited; the values stay below $10400, so the low 16 bits the host reads are the pattern's."""
    check_read_words(words)
    first = '        move    r2,x:>$204              ; the displaced instruction\n' if displaced else ''
    return f'''; Stream probe B, core 0 (stream_probe.py). The block at this frame's bank + ${READ_REGION:x}: word 0 magic
; ${READ_MAGIC:x}, word 1 the DSP's sequence, word i>=2 ((sequence & $ff) << 8) + i, read by the host as 16 bits.
wbentry:
{first}        move    r6,a
        add     #>${READ_REGION:x},a
        move    a,r0                    ; the block, in the bank this frame works on
        move    #>wbseq,r1
        move    p:(r1),a
        add     #<1,a
        and     #>$ffff,a
        move    a1,p:(r1)               ; the sequence
        move    a1,x1
        move    #>${READ_MAGIC:x},a
        move    a1,x:(r0)+
        move    x1,x:(r0)+
        move    x1,a
        and     #>$ff,a
        asl     #$8,a,a
        add     #<2,a                   ; word 2's value
        do      #{words - 2},wbloop
        move    a1,x:(r0)+
        add     #<1,a
wbloop:
'''


def dsp_source(words=0, read_words=0):
    """Core 0's frame-head code: B's writer first, then A's checker (its displaced instruction at its head), then B's
    sequence word last, so A's counters keep their order. One of the two may be 0."""
    if not (words or read_words):
        raise ValueError('A stream probe build carries probe A, probe B or both.')
    text = writer_source(read_words, displaced=not words) if read_words else ''
    if words:
        check_words(words)
        text += checker_source(words)
    else:
        text += '        rts\n'
    return text + ('wbseq:\n        nop\n' if read_words else '')


PLACED = {}  # the frame-head code's absolute P addresses once placed: cflags() passes the published copy's to the C build


def place_receiver(args, place, assemble, tag, end, work):
    if tag != 'A' or getattr(args, 'stream_channel', False):  # the blocks are core 0's only; the channel's DSP side is the module's
        return place(end)
    words, read_words = args.stream_probe, args.stream_read
    text = dsp_source(words, read_words)
    template, _ = assemble(text, end, work)
    origin = end - len(template)
    code, labels = assemble(text, origin, work)
    entry = labels['wbentry'] if read_words else labels['sqentry']
    tail = origin + len(code) - (1 if read_words else 0)
    if entry != origin or len(code) != len(template) or (read_words and labels['wbseq'] != tail) or (
            words and (labels['sqpub'] + DSP_WORDS != tail or labels['sqframes'] + 9 != labels['sqpub'])):
        raise ValueError('The stream probe frame-head code changed its entry, length or counters.')
    if origin + len(code) > 0x2000:
        raise ValueError('The stream probe counters must be in private P, where PEEK reads.')
    PLACED.clear()
    PLACED.update(origin=origin, words=len(code))
    if words:
        PLACED.update(counters=labels['sqframes'], published=labels['sqpub'])
    if read_words:
        PLACED.update(sequence=labels['wbseq'])
    bundle = place(origin)
    bundle['words'] += code
    bundle['guards'].append(dict(module='stream-probe', site=DSP_FRAME_SITE, expectedSha256=STOCK_FRAME_GUARD,
                                 entry=origin, relocated=False))
    return bundle


def mailbox_initialization(image, device, dsp, args):
    """No stock X record of payload A loads into a claimed range in either bank; every block's magic word starts
    clear, so a cold DSP's garbage reads as no block."""
    spans = claims(*widths(args))
    for space, at, count, _ in dsp.records(image, device, 'A'):
        for offset, words, who in spans:
            if space == 1 and any(at < bank + offset + words and bank + offset < at + count for bank in BANKS):
                raise ValueError('The %s block overlaps a stock DSP record.' % who)
    if getattr(args, 'stream_channel', False):  # nothing reads a block before its slot record names it (dsp_programs.c)
        return {'A': []}
    return {'A': [dict(space='x', address=bank + offset, words=[0], owner=0) for offset, _, _ in spans for bank in BANKS]}


def widths(args):
    """(A's words, B's words): the channel's are its regions' whole width."""
    return (A_WIDE_CAPACITY, READ_CAPACITY) if getattr(args, 'stream_channel', False) else (args.stream_probe, args.stream_read)


def scheduler(text, args):
    """dsp_hooks.s. A: the block first, then the loader's packet (USB AUDIO IN's phases 3 and 4). B: stock's state 0
    comes to mw_stream_state0 (sites); the times are kept before the unmask, the block checked after it."""
    if text.count('move.w #0x6320,%d0') != 1 or text.count('move.w #63,%d0') != 1:
        raise ValueError('The loader packet no longer ends below the stream probe block ($x320-$x35f).')
    words, read_words = widths(args)
    if words:
        text = replace(text, '        jsr dl_frame\n        tst.l %d0', '''        jsr dl_frame
        move.l %d0,%d7
        jsr mw_stream_block     | stream_probe.c: the block's minor loops, 0 none
        tst.l %d0
        bne dl_send_stream
        move.l %d7,%d0
        tst.l %d0''')
        text = replace(text, 'dl_next:\n', '''dl_next:
        cmpi.l #3,%d2
        bcs dl_next_loader
        jsr mw_stream_complete  | the block's completion (C keeps d2)
        cmpi.l #3,%d2
        beq dl_complete
        moveq #1,%d2
        move.l %d2,dl_phase
        bra dl_write
dl_next_loader:
''')
        text = replace(text, 'dl_write:\n', f'''dl_send_stream:
        moveq #3,%d2
        tst.l %d7
        beq dl_stream_phase
        addq.l #1,%d2
dl_stream_phase:
        move.l %d2,dl_phase
        clr.b 0xfc0a400c
        move.l #mw_stream_tx+UNCACHED,%d1
        move.l %d1,0xfc045000
        moveq #64,%d1
        move.l %d1,0xfc045008
        move.w #0x81,%d1
        move.w %d1,0x20000000
        move.w #{0x6000 | region_a(words)[0]:#x},%d1
        move.w %d1,0x2000001c
        move.l %d0,%d1
        lsl.l #5,%d1
        subq.l #1,%d1
        move.w %d1,0x2000001c
        move.w #0x88,%d1
        move.w %d1,0x20000004
        ori.l #0x8000,%d0
        move.w %d0,0xfc045014
        move.w %d0,0xfc04501c
        clr.b 0xfc04401e
        move.l 0xfc07c00c,%d1
        move.l %d1,mw_stream_started
        move.b 0xfc094005,%d1
        move.b %d1,mw_stream_pin_start
        bra dl_return

dl_write:
''')
    text = replace(text, 'dl_complete:\n', 'dl_complete:\n        jsr mw_stream_account   | TCD0 back, the times kept\n')
    if not read_words:
        return text
    text = replace(text, '''        move.b %d0,0xfc0a400c   | next frame takes core 0 bank word without selecting it
        movem.l (%sp),%d2-%d7/%a2-%a6
        lea 44(%sp),%sp
        moveq #1,%d1
        move.b %d1,0xfc04801d
        jmp DONE
''', '''        move.b %d0,0xfc0a400c   | next frame takes core 0 bank word without selecting it
        movem.l (%sp),%d2-%d7/%a2-%a6
        lea 44(%sp),%sp
        moveq #1,%d1
        move.b %d1,0xfc04801d
        jsr mw_stream_check     | stream_probe.c: probe B's block, after the unmask
        jmp DONE
''')
    if getattr(args, 'stream_channel', False):
        return text + CHANNEL_STATE0
    loop = read_loop_bytes(read_words)
    return text + f'''
        .text
        .global mw_stream_state0
| Stream probe B (stream_probe.c): stock's state 0 jumps here, at channel 7's completion (the frame entry's pull from
| core 0 is done; core 0 is still selected) and again at the probe's own read's (channel 1). The second visit, and a
| frame without a read, go on to stock's state 0 as it was.
mw_stream_state0:
        jsr mw_stream_read      | 1: read the block now (TCD1 saved); else go on to stock's state 0
        subq.l #1,%d0
        bne mw_stream_stock0
        moveq #7,%d1
        move.b %d1,0xfc04401c   | channel 7's request, as stock's state 0 clears it
        clr.b 0xfc0a400c        | core 0, selected since the frame's entry
        move.w #0x81,%d1
        move.w %d1,0x20000000
        moveq #2,%d1
        move.w %d1,0xfc04503e   | TCD1 CSR: an interrupt at the end, no link, as stock's state 0 writes it
        move.w #{0x6000 | READ_REGION:#x},%d1
        move.w %d1,0x2000001c
        move.w #{read_words - 1},%d1
        move.w %d1,0x2000001c
        move.w #0x89,%d1
        move.w %d1,0x20000004
        move.l #mw_stream_rx+UNCACHED,%d1
        move.l %d1,0xfc045030   | DADDR
        moveq #{loop},%d1
        move.l %d1,0xfc045028   | NBYTES
        move.w #{0x8200 + 2 * read_words // loop:#x},%d1
        move.w %d1,0xfc045034   | CITER, BITER: each minor loop links to the next, as stock's
        move.w %d1,0xfc04503c
        moveq #1,%d1
        move.b %d1,0xfc04401e   | SSRT: channel 1
        move.l 0xfc07c00c,%d1
        move.l %d1,mw_stream_read_started
        jmp DONE
mw_stream_stock0:
        moveq #7,%d1
        move.b %d1,0xfc04401c   | stock's own first 8 bytes
        jmp 0x4000486a
'''


# The channel's read at stock's state 0: probe B's, its count and minor loops (32 bytes) from stream_channel.c.
CHANNEL_STATE0 = f'''
        .text
        .global mw_stream_state0
| The stream channel's read (stream_channel.c), probe B's path: stock's state 0 jumps here at channel 7's completion (core
| 0 still selected) and again at the read's own; the second visit, and a frame with no lane reading, go on to stock's.
mw_stream_state0:
        jsr mw_stream_read      | 1: read the out-region now (TCD1 saved); else go on to stock's state 0
        subq.l #1,%d0
        bne mw_stream_stock0
        moveq #7,%d1
        move.b %d1,0xfc04401c   | channel 7's request, as stock's state 0 clears it
        clr.b 0xfc0a400c        | core 0, selected since the frame's entry
        move.w #0x81,%d1
        move.w %d1,0x20000000
        moveq #2,%d1
        move.w %d1,0xfc04503e   | TCD1 CSR: an interrupt at the end, no link, as stock's state 0 writes it
        move.w #{0x6000 | READ_REGION:#x},%d1
        move.w %d1,0x2000001c
        move.w mw_stream_read_count,%d1
        move.w %d1,0x2000001c
        move.w #0x89,%d1
        move.w %d1,0x20000004
        move.l #mw_stream_rx+UNCACHED,%d1
        move.l %d1,0xfc045030   | DADDR
        moveq #32,%d1
        move.l %d1,0xfc045028   | NBYTES: 32-byte minor loops
        move.w mw_stream_read_iter,%d1
        move.w %d1,0xfc045034   | CITER, BITER: each minor loop links to the next, as stock's
        move.w %d1,0xfc04503c
        moveq #1,%d1
        move.b %d1,0xfc04401e   | SSRT: channel 1
        move.l 0xfc07c00c,%d1
        move.l %d1,mw_stream_read_started
        jmp DONE
mw_stream_stock0:
        moveq #7,%d1
        move.b %d1,0xfc04401c   | stock's own first 8 bytes
        jmp 0x4000486a
'''


def dsp_c(text, args):
    """dsp.c: A's recovery core select and give-up, as USB AUDIO IN's, and A's snapshot read ahead of the meter's; B's
    give-up in the same recovery."""
    if args.stream_probe or getattr(args, 'stream_channel', False):
        text = replace(text, 'DSP_SELECT = dl_c1_phase ? 1u : (uint8_t)(dl_phase - 1u);',
                       'DSP_SELECT = dl_c1_phase ? 1u : 0u; /* state 7 always targets core 0 */')
        text = replace(text, '    dl_phase = dl_c1_phase = 0;', '''    if (dl_phase >= 3u) {
        extern void mw_stream_dma_failed(void);
        mw_stream_dma_failed();
    }
    dl_phase = dl_c1_phase = 0;''')
    if args.stream_probe:
        text = replace(text, '        if (peeking < 0 && meter_wanted >= 0 && probing < 0',
                       f'''        {{ /* the stream probe's published copy (stream_probe.c), ahead of the status page's meter reads */
            extern volatile int32_t mw_stream_dsp_wanted;
            extern volatile uint32_t mw_stream_dsp_bits, mw_stream_dsp[{DSP_WORDS}];
            if (peeking < 0 && mw_stream_dsp_wanted && probing < 0 && dl_publication_idle() && dl_job_status(0u) == -2) {{
                peeking = 0;
                mw_stream_dsp_wanted = 0;
                mw_stream_dsp_bits = 0;
                for (unsigned i = 0; i < {DSP_WORDS}u; ++i) mw_stream_dsp[i] = 0;
                peek_from = MODWERK_STREAM_COUNTERS, peek_into = mw_stream_dsp, peek_bits = &mw_stream_dsp_bits;
                peek_words = {DSP_WORDS};
            }}
        }}
        if (peeking < 0 && meter_wanted >= 0 && probing < 0''')
    if args.stream_read or getattr(args, 'stream_channel', False):
        text = replace(text, '    dl_abort();\n    dl_residency_enabled = 0;\n', '''    { extern void mw_stream_read_failed(void); mw_stream_read_failed(); } /* stream probe B: read no more */
    dl_abort();
    dl_residency_enabled = 0;
''')
    return text


def dev_c(text, args):
    """dev.c: STREAM PROBE, request 47, and STREAM PROBE B, request 48 (stream_probe.c answers)."""
    seam = '    if (s[1] == 15 && want == 1) {'
    added = ''
    if args.stream_probe:
        added += f'''    if (s[1] == {REQUEST} && want == {4 * REPLY_WORDS}u && s[2] <= 4u && !s[3]) {{ /* STREAM PROBE (stream_probe.c) */
        uint32_t modwerk_stream_request(unsigned op, uint8_t *out);
        *reply = out;
        return modwerk_stream_request(s[2], out);
    }}
'''
    if args.stream_read:
        added += f'''    if (s[1] == {READ_REQUEST} && want == {4 * READ_REPLY_WORDS}u && s[2] <= 4u && !s[3]) {{ /* STREAM PROBE B (stream_probe.c) */
        uint32_t modwerk_stream_read_request(unsigned op, uint8_t *out);
        *reply = out;
        return modwerk_stream_read_request(s[2], out);
    }}
'''
    return replace(text, seam, added + seam)


def check_args(args):
    if getattr(args, 'stream_channel', False):
        if args.stream_probe or args.stream_read or not args.resident_on_demand:
            raise ValueError('--stream-channel takes no probe beside it, and needs --resident-on-demand (its slot records).')
        proof(a_words=A_WIDE_CAPACITY, b_words=READ_CAPACITY)
        return
    if not (args.stream_probe or args.stream_read):
        raise ValueError('Give --stream-probe N, --stream-read N or both.')
    if args.stream_probe:
        check_words(args.stream_probe)
    if args.stream_read:
        check_read_words(args.stream_read)
    proof(a_words=args.stream_probe, b_words=args.stream_read)


def prepare(args, source):
    """After build_core.py copied the base's sources: the probes' C source and their dev requests."""
    check_args(args)
    if getattr(args, 'stream_channel', False):
        for path in CHANNEL:
            (source / path.name).write_bytes(path.read_bytes())
        return
    (source / 'stream_probe.c').write_bytes(SOURCE.read_bytes())
    (source / 'dev.c').write_text(dev_c((source / 'dev.c').read_text(), args))


def sites(image, device, args):
    """Probe B takes stock's state 0 (its first 8 bytes, guarded); A takes no stock site of its own."""
    chain_proof(image, device.main_load)
    if not (args.stream_read or getattr(args, 'stream_channel', False)):
        return []
    stock = image[STATE0 - device.main_load:STATE0 - device.main_load + 8]
    if hashlib.sha256(stock).hexdigest() != STATE0_GUARD:
        raise ValueError("Stock bytes at %#x are not the state 0 stream probe B takes." % STATE0)
    return [dict(addr=hex(STATE0), stock=stock.hex(), op='jmp', target='mw_stream_state0')]


def inputs(args):
    """What the probes add to the base's source identity: their files and both N, so no other base shares its identity."""
    found = {p.relative_to(APP).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in (Path(__file__).resolve(), SOURCE)}
    if getattr(args, 'stream_channel', False):
        found.update({p.relative_to(APP).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in CHANNEL})
        found['stream-probe:channel'] = hashlib.sha256(b'1').hexdigest()
        return found
    found['stream-probe:words'] = hashlib.sha256(str(args.stream_probe).encode()).hexdigest()
    if args.stream_read:  # absent for an A-only build, so its identity is the one before probe B
        found['stream-probe:read-words'] = hashlib.sha256(str(args.stream_read).encode()).hexdigest()
    return found


def cflags(args):
    if getattr(args, 'stream_channel', False):
        return ['-DMODWERK_STREAM_CHANNEL']
    flags = []
    if args.stream_probe:
        if 'published' not in PLACED:
            raise ValueError('The stream probe checker was not placed on core 0.')
        flags += ['-DMODWERK_STREAM_WORDS=%du' % args.stream_probe, '-DMODWERK_STREAM_COUNTERS=%#xu' % PLACED['published']]
    if args.stream_read:
        if 'sequence' not in PLACED:
            raise ValueError('The stream probe B writer was not placed on core 0.')
        flags += ['-DMODWERK_STREAM_READ_WORDS=%du' % args.stream_read, '-DMODWERK_STREAM_READ_REGION=%#xu' % READ_REGION]
    return flags


def check_link(mapping, args):
    a, b = (1, 1) if getattr(args, 'stream_channel', False) else (args.stream_probe, args.stream_read)
    for name in ('mw_stream_tx',) * bool(a) + ('mw_stream_rx',) * bool(b):
        if mapping[name] % 16:
            raise ValueError('The stream probe buffer %s must be 16-byte aligned for its eDMA channel (16-byte bursts).' % name)


# build_core.py's seams, each found exactly once (else the build stops): the probes' flags and refusals, then their
# hooks into the steps USB AUDIO IN uses, and B's stock site beside the DSP loader's.
BUILD_EDITS = (
    ("    parser.add_argument('--usb-input', action='store_true',\n",
     "    parser.add_argument('--stream-probe', type=int, default=0, metavar='N',\n"
     "                        help='stream_probe.py, probe A: N halfwords to core 0 every frame (32-160 by 32, or 192-928) and a frame-head checker.')\n"
     "    parser.add_argument('--stream-read', type=int, default=0, metavar='N',\n"
     "                        help='stream_probe.py, probe B: N halfwords from core 0 every frame (32-928 by 16), written at its frame head.')\n"
     "    parser.add_argument('--stream-channel', action='store_true',\n"
     "                        help='stream_probe.py: the stream channel (stream_channel.c), probes A and B carrying the blocks of the slots that stream.')\n"
     "    parser.add_argument('--usb-input', action='store_true',\n"),
    ("        parser.error('--measure-voices is for a development twin: it needs --dev and --dsp-loader.')\n",
     "        parser.error('--measure-voices is for a development twin: it needs --dev and --dsp-loader.')\n"
     "    if (not args.dev or not args.dsp_loader or not args.site_events or not args.resident_stock_hooks or args.usb_input\n"
     "            or args.dsp_hook != 'guard' or args.dsp_probe or args.dsp_burn or not (args.stream_probe or args.stream_read or args.stream_channel)):\n"
     "        parser.error('--stream-probe and --stream-read are for a development twin: --dev, --dsp-loader, --site-events, '\n"
     "                     '--resident-stock-hooks, the guarded transfer, no DSP probe or burn, no --usb-input (the probes take '\n"
     "                     'its frame-head site), and at least one of the two.')\n"),
    ('    usb_input = None\n    if args.usb_input:\n',
     '    STREAM_PROBE.prepare(args, source)\n    usb_input = None\n    if args.usb_input:\n'),
    ("            resident_bundles[tag] = usb_input.place_receiver(place, dsp_packages.assemble, tag, hi, str(source)) if usb_input else place(hi)\n",
     "            resident_bundles[tag] = STREAM_PROBE.place_receiver(args, place, dsp_packages.assemble, tag, hi, str(source))\n"),
    ("            if usb_input and name == 'hooks.s':\n                text = usb_input.scheduler(text)\n",
     "            if usb_input and name == 'hooks.s':\n                text = usb_input.scheduler(text)\n"
     "            if name == 'hooks.s':\n                text = STREAM_PROBE.scheduler(text, args)\n"),
    ("        if saved_set_wiring:\n            (source / 'dsp.c').write_text(saved_set_wiring.dsp((source / 'dsp.c').read_text()))\n",
     "        if saved_set_wiring:\n            (source / 'dsp.c').write_text(saved_set_wiring.dsp((source / 'dsp.c').read_text()))\n"
     "        (source / 'dsp.c').write_text(STREAM_PROBE.dsp_c((source / 'dsp.c').read_text(), args))\n"),
    ('            extra = usb_input.mailbox_initialization(image, device, dsp) if usb_input else None\n',
     '            extra = STREAM_PROBE.mailbox_initialization(image, device, dsp, args)\n'),
    ('    source_hash = sha(json.dumps(inputs, sort_keys=True, separators=(\',\', \':\')).encode())\n',
     '    inputs.update(STREAM_PROBE.inputs(args))\n'
     '    source_hash = sha(json.dumps(inputs, sort_keys=True, separators=(\',\', \':\')).encode())\n'),
    ("        recipe['cflags'].append('-DMODWERK_MEASURE_VOICES')\n",
     "        recipe['cflags'].append('-DMODWERK_MEASURE_VOICES')\n    recipe['cflags'] += STREAM_PROBE.cflags(args)\n"),
    ("        recipe['sites'] += [] if args.dsp_probe == 'S' else dsp_sites\n",
     "        recipe['sites'] += STREAM_PROBE.sites(image, device, args)\n"
     "        recipe['sites'] += [] if args.dsp_probe == 'S' else dsp_sites\n"),
    ("        raise ValueError('The DSP loader packet buffers must be 16-byte aligned for eDMA channel 0.')\n",
     "        raise ValueError('The DSP loader packet buffers must be 16-byte aligned for eDMA channel 0.')\n"
     "    STREAM_PROBE.check_link(mapping, args)\n"),
)


def build_core_module():
    """build_core.py with BUILD_EDITS, as a module whose __file__ is the real file (its paths resolve as usual)."""
    import types
    text = BUILD_CORE.read_text()
    for before, after in BUILD_EDITS:
        text = replace(text, before, after)
    module = types.ModuleType('modwerk_stream_probe_build_core')
    module.__file__ = str(BUILD_CORE)
    module.STREAM_PROBE = sys.modules[__name__]
    exec(compile(text, str(BUILD_CORE), 'exec'), module.__dict__)
    return module


if __name__ == '__main__':
    sys.argv[0] = str(BUILD_CORE)
    build_core_module().main()
