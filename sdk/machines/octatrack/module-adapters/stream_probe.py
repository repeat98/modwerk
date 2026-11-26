#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Probe A of a module-owned DSP stream: a development twin only, never for users.

It measures whether the base can push N more halfwords a frame to DSP core 0 through stock's host-port chain, how
safely and how fast. Build it with build_core.py's own arguments plus --stream-probe N, through this file:

    python3 -B sdk/machines/octatrack/module-adapters/stream_probe.py --stream-probe 64 --stock OS.bin ... --dev

It runs build_core.py with the seams below (BUILD_EDITS) applied in memory, as resident_source.py runs the patched
loader; build_core.py and every file a base's identity hashes stay untouched, so every other build is byte-identical.
The probe's own files enter its identity (`inputs`), N included. The block takes USB AUDIO IN's place: the build
refuses --usb-input beside it.

- ColdFire: the shared state-7 scheduler (dsp_hooks.s) sends one block of N halfwords before the loader's packet, as
  USB AUDIO IN's did, from stream_probe.c's 16-byte-aligned buffer to host destination $6360, which core 0's host
  handler masks to X:$2360 or X:$4360, the bank it reads next frame. stream_probe.c saves TCD0's SADDR, NBYTES, CITER
  and BITER before the block and puts them back right before state 7 unmasks the frame interrupt (stock rewrites all
  four from state 1 on; nothing else is written), and stamps DTCN3 at the block's start, its completion and the
  unmask against the frame interrupt's entry (mw_frame_t0, so --site-events).
- DSP: a checker at core 0's frame head (P:$88, USB AUDIO IN's site) checks each block: magic, a sequence one past
  the last, every pattern word, bits 16-23. It counts frames, good, bad, missing and out-of-order blocks in private P
  words and publishes a copy when a block asks for it; the ColdFire reads that copy with the loader's PEEK
  (dev request 47, `npm run device -- do stream:dsp`).

Why X:$x360-$x3ff (160 words a bank) is free in this build (`proof`, `mailbox_initialization`, `scheduler`): no base
feature's ledger region (dsp-sites.json) meets it on core 0; no stock X initialization record of payload A loads into
it in either bank; the loader's packet ends below it ($x320-$x35f); stock's next transfer starts at $x400; and USB
AUDIO IN, which is not in this build, was its only writer. Any other writer between the transfer and the frame head
shows on the unit as bad blocks.
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
BUILD_CORE = HERE.parent / 'elekloader' / 'build_core.py'
DESTINATION = 0x6360   # core 0, host destination: X:$2360 or X:$4360 after the DSP's mask
REGION = DESTINATION & 0x0fff
CAPACITY = 0x400 - REGION  # 160 words a bank, up to stock's own $x400 transfer
WORDS = tuple(range(32, CAPACITY + 1, 32))  # whole 64-byte minor loops: 32, 64, 96, 128, 160
MAGIC = 0x5350         # bit 0 set: publish the counters after this block (a snapshot)
REQUEST = 47           # dev.c: STREAM PROBE; wValue 0 read, 1 start, 2 stop, 3 snapshot, 4 read and restart the windows
REPLY_WORDS = 51      # 16 counts, 5 time windows of 5 words, the published copy
DSP_WORDS = 10         # the published copy: serial, frames, good, bad, missing, jumps, junk, last, diff, serial
COUNTERS = ('frames', 'good', 'bad', 'missing', 'jumps', 'junk', 'last', 'diff')


def replace(text, before, after):
    if text.count(before) != 1:
        raise ValueError('Stream probe seam drifted: ' + before.splitlines()[0])
    return text.replace(before, after)


def check_words(words):
    if words not in WORDS:
        raise ValueError('--stream-probe takes %s halfwords: whole 64-byte minor loops within X:$%x-$3ff.'
                         % (', '.join(map(str, WORDS)), REGION))
    return words


def pattern(sequence, words, snapshot=False):
    """The block stream_probe.c sends, as 16-bit halfwords."""
    s = sequence & 0xffff
    return [MAGIC | bool(snapshot), s] + [(s & 0xff) << 8 | i for i in range(2, words)]


def proof(ledger=LEDGER):
    """No base feature's X region on core 0 meets either bank's block; -> how many X regions were checked."""
    regions = json.loads(Path(ledger).read_text())['regions']
    banks = [(bank + REGION, bank + REGION + CAPACITY) for bank in (0x2000, 0x4000)]
    seen = 0
    for r in regions:
        if r['space'] != 'x' or not (r.get('shared') or 'A' in r.get('cores', ())):
            continue
        start = int(r['start'], 16)
        end = start + int(r['words'], 16)
        seen += 1
        if any(start < hi and lo < end for lo, hi in banks):
            raise ValueError('The stream probe block meets a ledger region: ' + r['about'])
    return seen


def dsp_source(words):
    """Core 0's frame-head checker. Live at P:$88: r2 (stored here), r4-r7, b; free: a, x1, r0, r1 (as USB AUDIO IN's
    inject). y0 is kept in the block's consumed magic word and put back. One DO loop over the pattern, no rep, no
    brclr; logical tests only (Z from A1), so stale A2 bits neither pass nor fail a check. No label is part of another
    word: dsp_asm substitutes a label's text wherever it appears."""
    check_words(words)
    return f'''; Stream probe A, core 0 (stream_probe.py). The block at this frame's bank + ${REGION:x}: word 0 magic ${MAGIC:x}
; (bit 0: publish), word 1 the ColdFire's sequence, word i>=2 ((sequence & $ff) << 8) | i, 16 bits each.
sqentry:
        move    r2,x:>$204              ; the displaced instruction
        move    r6,a
        add     #>${REGION:x},a
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
        and     #>$ff0000,a
        beq     sqback
        move    #>sqjunk,r1
        move    p:(r1),a
        add     #<1,a
        move    a1,p:(r1)               ; a word with bits 16-23 set
sqback:
        move    r6,a
        add     #>${REGION:x},a
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


PLACED = {}  # the checker's absolute P addresses once placed: cflags() passes the published copy's to the C build


def place_receiver(words, place, assemble, tag, end, work):
    if tag != 'A':  # the block lands on core 0 only
        return place(end)
    text = dsp_source(words)
    template, _ = assemble(text, end, work)
    origin = end - len(template)
    code, labels = assemble(text, origin, work)
    if labels['sqentry'] != origin or len(code) != len(template) or labels['sqpub'] + DSP_WORDS != origin + len(code) \
            or labels['sqframes'] + 9 != labels['sqpub']:
        raise ValueError('The stream probe checker changed its entry, length or counters.')
    if origin + len(code) > 0x2000:
        raise ValueError('The stream probe counters must be in private P, where PEEK reads.')
    PLACED.update(origin=origin, words=len(code), counters=labels['sqframes'], published=labels['sqpub'])
    bundle = place(origin)
    bundle['words'] += code
    bundle['guards'].append(dict(module='stream-probe', site=DSP_FRAME_SITE, expectedSha256=STOCK_FRAME_GUARD,
                                 entry=origin, relocated=False))
    return bundle


def mailbox_initialization(image, device, dsp):
    """No stock X record of payload A loads into either bank's block; both magic words start clear, so a cold
    DSP's garbage reads as no block."""
    markers = (0x2000 + REGION, 0x4000 + REGION)
    for space, at, count, _ in dsp.records(image, device, 'A'):
        if space == 1 and any(at < marker + CAPACITY and marker < at + count for marker in markers):
            raise ValueError('The stream probe block overlaps a stock DSP record.')
    return {'A': [dict(space='x', address=marker, words=[0], owner=0) for marker in markers]}


def scheduler(text):
    """dsp_hooks.s: the block first, then the loader's packet (USB AUDIO IN's phases 3 and 4)."""
    if text.count('move.w #0x6320,%d0') != 1 or text.count('move.w #63,%d0') != 1:
        raise ValueError('The loader packet no longer ends below the stream probe block ($x320-$x35f).')
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
    text = replace(text, 'dl_complete:\n', 'dl_complete:\n        jsr mw_stream_account   | TCD0 back, the times kept\n')
    return replace(text, 'dl_write:\n', f'''dl_send_stream:
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
        move.w #{DESTINATION:#x},%d1
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


def dsp_c(text):
    """dsp.c: the recovery's core select and give-up, as USB AUDIO IN's; the snapshot read ahead of the meter's."""
    text = replace(text, 'DSP_SELECT = dl_c1_phase ? 1u : (uint8_t)(dl_phase - 1u);',
                   'DSP_SELECT = dl_c1_phase ? 1u : 0u; /* state 7 always targets core 0 */')
    text = replace(text, '    dl_phase = dl_c1_phase = 0;', '''    if (dl_phase >= 3u) {
        extern void mw_stream_dma_failed(void);
        mw_stream_dma_failed();
    }
    dl_phase = dl_c1_phase = 0;''')
    return replace(text, '        if (peeking < 0 && meter_wanted >= 0 && probing < 0',
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


def dev_c(text):
    """dev.c: STREAM PROBE, request 47 (stream_probe.c answers)."""
    return replace(text, '    if (s[1] == 15 && want == 1) {', f'''    if (s[1] == {REQUEST} && want == {4 * REPLY_WORDS}u && s[2] <= 4u && !s[3]) {{ /* STREAM PROBE (stream_probe.c) */
        uint32_t modwerk_stream_request(unsigned op, uint8_t *out);
        *reply = out;
        return modwerk_stream_request(s[2], out);
    }}
    if (s[1] == 15 && want == 1) {{''')


def prepare(args, source):
    """After build_core.py copied the base's sources: the probe's C source and its dev request."""
    check_words(args.stream_probe)
    proof()
    (source / 'stream_probe.c').write_bytes(SOURCE.read_bytes())
    (source / 'dev.c').write_text(dev_c((source / 'dev.c').read_text()))


def inputs(words):
    """What the probe adds to the base's source identity: its files and N, so no other base shares its identity."""
    found = {p.relative_to(APP).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in (Path(__file__).resolve(), SOURCE)}
    found['stream-probe:words'] = hashlib.sha256(str(words).encode()).hexdigest()
    return found


def cflags(words):
    if 'published' not in PLACED:
        raise ValueError('The stream probe checker was not placed on core 0.')
    return ['-DMODWERK_STREAM_WORDS=%du' % words, '-DMODWERK_STREAM_COUNTERS=%#xu' % PLACED['published']]


def check_link(mapping):
    if mapping['mw_stream_tx'] % 16:
        raise ValueError('The stream probe block must be 16-byte aligned for eDMA channel 0 (its inherited bursts).')


# build_core.py's seams, each found exactly once (else the build stops): the probe's flag and refusals, then its
# hooks into the steps USB AUDIO IN uses.
BUILD_EDITS = (
    ("    parser.add_argument('--usb-input', action='store_true',\n",
     "    parser.add_argument('--stream-probe', type=int, required=True, metavar='N',\n"
     "                        help='stream_probe.py: N halfwords to core 0 every frame (32-160 by 32) and a frame-head checker.')\n"
     "    parser.add_argument('--usb-input', action='store_true',\n"),
    ("        parser.error('--measure-voices is for a development twin: it needs --dev and --dsp-loader.')\n",
     "        parser.error('--measure-voices is for a development twin: it needs --dev and --dsp-loader.')\n"
     "    if (not args.dev or not args.dsp_loader or not args.site_events or not args.resident_stock_hooks or args.usb_input\n"
     "            or args.dsp_hook != 'guard' or args.dsp_probe or args.dsp_burn):\n"
     "        parser.error('--stream-probe is for a development twin: --dev, --dsp-loader, --site-events, --resident-stock-hooks, '\n"
     "                     'the guarded transfer, no DSP probe or burn, and no --usb-input (the block takes its place).')\n"),
    ('    usb_input = None\n    if args.usb_input:\n',
     '    STREAM_PROBE.prepare(args, source)\n    usb_input = None\n    if args.usb_input:\n'),
    ("            resident_bundles[tag] = usb_input.place_receiver(place, dsp_packages.assemble, tag, hi, str(source)) if usb_input else place(hi)\n",
     "            resident_bundles[tag] = STREAM_PROBE.place_receiver(args.stream_probe, place, dsp_packages.assemble, tag, hi, str(source))\n"),
    ("            if usb_input and name == 'hooks.s':\n                text = usb_input.scheduler(text)\n",
     "            if usb_input and name == 'hooks.s':\n                text = usb_input.scheduler(text)\n"
     "            if name == 'hooks.s':\n                text = STREAM_PROBE.scheduler(text)\n"),
    ("        if saved_set_wiring:\n            (source / 'dsp.c').write_text(saved_set_wiring.dsp((source / 'dsp.c').read_text()))\n",
     "        if saved_set_wiring:\n            (source / 'dsp.c').write_text(saved_set_wiring.dsp((source / 'dsp.c').read_text()))\n"
     "        (source / 'dsp.c').write_text(STREAM_PROBE.dsp_c((source / 'dsp.c').read_text()))\n"),
    ('            extra = usb_input.mailbox_initialization(image, device, dsp) if usb_input else None\n',
     '            extra = STREAM_PROBE.mailbox_initialization(image, device, dsp)\n'),
    ('    source_hash = sha(json.dumps(inputs, sort_keys=True, separators=(\',\', \':\')).encode())\n',
     '    inputs.update(STREAM_PROBE.inputs(args.stream_probe))\n'
     '    source_hash = sha(json.dumps(inputs, sort_keys=True, separators=(\',\', \':\')).encode())\n'),
    ("        recipe['cflags'].append('-DMODWERK_MEASURE_VOICES')\n",
     "        recipe['cflags'].append('-DMODWERK_MEASURE_VOICES')\n    recipe['cflags'] += STREAM_PROBE.cflags(args.stream_probe)\n"),
    ("        raise ValueError('The DSP loader packet buffers must be 16-byte aligned for eDMA channel 0.')\n",
     "        raise ValueError('The DSP loader packet buffers must be 16-byte aligned for eDMA channel 0.')\n"
     "    STREAM_PROBE.check_link(mapping)\n"),
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
