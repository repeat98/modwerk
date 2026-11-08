| SPDX-License-Identifier: GPL-3.0-or-later
| The card-build counterpart of ev_trig_muted (HOOKS.md, base event index 35; Modwerk #777).
| A card build has no base, so it has no base events. Here a module that drops muted trigs
| answers through one global function, and a machine that starts its own note from a trig asks
| it. Neither module names the other: both name this file's symbol, and with either one
| missing nothing changes in what plays (the ask is 0, and an answer nobody asks is never called).
|
| The answer: unsigned modwerk_card_ev_trig_muted(void), C convention (d0 the answer, d0-d1 and
| a0-a1 free, every other register kept), no state written:
|   bits 0-7   track t+1's new trigs are dropped now (ev_trig_muted's answer: the tracks whose
|              voice bind the module drops this frame, muted or soloed out in a trig-dropping
|              mode, less the tracks it lets through)
|   bits 8-15  of those tracks, the ones whose sounding note the module also ends at the mute,
|              as it ends a sample track's (a note-off at the mute: Mute Modes' OTFX-T). The
|              asker ends its own note on a track when the track enters this set; a track that
|              is only in bits 0-7 lets its note finish (DT-T). An asker that keeps no notes
|              ignores these bits.
|   bits 16-31 zero; the ask masks them off.
| The contract, so answer and ask cannot drift:
|   - Bits 8-15 are a state, not a one-frame event: bit 8+t is set in every frame where bit t
|     is set and MUTE MODE is OTFX-T. It is never set without bit t, and never in DT-T. The
|     asker ends a sounding note when it first sees bit 8+t set, and starts nothing while it
|     stays set.
|   - A SIDE-CHAIN key track's bits are clear in both bytes: its trigs and its note carry on,
|     because the compressor still hears it (the exemption fresh_bind makes with KEYMASK).
|   - Unmute: when a track's bits clear, the asker plays its next trig as usual. A note it
|     cut stays cut.
| The ask: d0 := the answer, or 0 with no answering module in the image. C convention.
| Both sit in DRAM units (Linked(dram=True)). Every card build links its DRAM units together
| (remix/platform_build.py natively, src/engine/coldfire-link.ts in the configurator), so the
| weak reference meets the answer whatever the module order. ROM units cannot take part: the
| native builder links them one at a time before the DRAM link, the configurator after it.
| One module answers in an image: a second definition is refused by both linkers.
| Context: the frame interrupt or a task; short, nothing that blocks.
| A unit takes this file through its remix.inc (Linked.include) or with .include.

        .ifndef MODWERK_CARD_TRIG_MUTED_INC
        .set    MODWERK_CARD_TRIG_MUTED_INC, 1

        .set    MODWERK_TRIG_MUTED_DROP, 0x00ff
        .set    MODWERK_TRIG_MUTED_CUT, 0xff00

| d0 := the answer (bits 0-15), 0 when no module answers. d0-d1 and a0-a1 clobbered.
        .macro  MODWERK_CARD_ASK_TRIG_MUTED
        .weak   modwerk_card_ev_trig_muted
        move.l  #modwerk_card_ev_trig_muted,%d0
        beq.s   .Lmw_ctm_none\@
        movea.l %d0,%a0
        jsr     (%a0)
        andi.l  #0xffff,%d0
.Lmw_ctm_none\@:
        .endm

| The answer's entry: the body follows it and ends with rts.
        .macro  MODWERK_CARD_ANSWER_TRIG_MUTED
        .global modwerk_card_ev_trig_muted
modwerk_card_ev_trig_muted:
        .endm

        .endif
