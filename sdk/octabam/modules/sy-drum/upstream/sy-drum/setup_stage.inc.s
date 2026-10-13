| ==== THE SETUP STAGE: the four EFFECTIVE PLAYBACK SETUP bytes of a SY DRUM track ======
| (the development line's setup_stage, 8 Oct 2026, for its SY kind; its scene and LFO
| stages are not part of this module):
|
|   base (the Part default: the live lane's setup bytes LSPD LDEP WAVE S&H)
|     -> the step lock (the dedicated lock table: sl_seq_active[t], 255 = none)
|     -> ss_commit: clamp to SY DRUM's maxima (LSPD 127, LDEP 127, WAVE 3, S&H 1),
|        publish ss_eff[t], hand the engine its copy (sy1_mod_params[t])
|
| WHEN. ss_stage(d2 = track) is the tail of sl_seq_refresh_track (locks_seq.inc.s) for a
| SY DRUM track (ss_kind[t] 2): once a frame for every track from sd_tick (sl_seq_tick;
| the frame builder's LFO pass), and once more in the frame builder at sl_seq_publish
| (0x4000c62e) for a track whose accepted event is published, before that frame's START
| dispatch -- so a step's lock is the effective value its own START reads. A track that is
| not SY DRUM (ss_kind[t] 0) is not staged: sy1_setup_tick's Part values stand.
|
| THE ARRAYS (8 tracks x 4 bytes, control A..D at +0..+3, raw 0..127):
|   ss_kind[t]  byte: 0 not SY DRUM / 2 SY DRUM (the development line's numbering: 1 is its
|               FM kind) -- written by sl_seq_refresh_track.
|   ss_base[t]  the Part default as the live lane holds it (0x80000830 + 72 t: the stock UI
|               and Part loader keep it equal to the Part's setup bytes).
|   ss_eff[t]   the effective bytes, clamped: what the engine reads (its copy).
        .text
        .global ss_stage, ss_commit, ss_kind, ss_base, ss_eff

| d2 = a SY DRUM track. Clobbers d0, d1, d3, a0-a2.
ss_stage:
        move.l  %d2,%d0
        moveq   #72,%d1
        mulu.l  %d1,%d0
        lea     0x80000830,%a0
        adda.l  %d0,%a0                  | the live lane's six setup bytes
        move.l  (%a0),%d0                | BASE: A..D
        lea     ss_base:l,%a1
        move.l  %d0,(%a1,%d2.l*4)
        lea     ss_pre:l,%a1
        lea     (%a1,%d2.l*4),%a1
        move.l  %d0,(%a1)
        move.l  %d2,%d0                  | the active entry is an SL_ROW (16-byte) row
        lsl.l   #4,%d0
        lea     sl_seq_active:l,%a0      | LOCK: the accepted event's dedicated row (255 = no lock)
        adda.l  %d0,%a0
        move.l  (%a0),%d0
        addq.l  #1,%d0
        beq     ss_commit                | 0xffffffff: no lock on any control
        moveq   #3,%d1
ss_st_lock:
        mvz.b   (%a0,%d1.l),%d0
        cmpi.l  #255,%d0
        beq     ss_st_lock1
        move.b  %d0,(%a1,%d1.l)
ss_st_lock1:
        subq.l  #1,%d1
        bpl     ss_st_lock
                                         | (falls into the commit)
| ss_commit: d2 = track, a1 = four bytes A..D -> ss_eff[t] (clamped to SY DRUM's maxima)
| and the engine's copy. Clobbers d0, d1, d3, a0, a2.
ss_commit:
        lea     ss_kind:l,%a2
        mvz.b   (%a2,%d2.l),%d3
        cmpi.l  #2,%d3
        bne     ss_cm_out
        lea     ss_eff:l,%a0
        lea     (%a0,%d2.l*4),%a0
        move.l  (%a1),%d0
        move.l  #0x8080fcfe,%d1          | the bits no legal row has (above 127 127 3 1)
        and.l   %d0,%d1
        bne     ss_cm_clamp
        move.l  %d0,(%a0)                | all four within their maxima (the usual case): one store
        bra     ss_cm_engine
ss_cm_clamp:
        lea     ss_max:l,%a2             | the four maxima
        moveq   #3,%d1
ss_cm_byte:
        mvz.b   (%a1,%d1.l),%d0
        mvz.b   (%a2,%d1.l),%d3
        cmp.l   %d3,%d0
        bls     ss_cm_store
        move.l  %d3,%d0
ss_cm_store:
        move.b  %d0,(%a0,%d1.l)
        subq.l  #1,%d1
        bpl     ss_cm_byte
        move.l  (%a0),%d0
ss_cm_engine:
        lea     sy1_mod_params:l,%a0     | the engine's LSPD / LDEP / WAVE / S&H
        move.l  %d0,(%a0,%d2.l*4)
ss_cm_out:
        rts

        .data
        .balign 4
ss_base:        .fill 8,4,0x40000000     | per track: the Part default A..D (the stage's input)
ss_pre:         .fill 8,4,0x40000000     | per track: the base with the active lock laid over it
ss_eff:         .fill 8,4,0x40000000     | per track: THE EFFECTIVE BYTES (clamped; the engine's copy)
ss_kind:        .fill 8,1,0              | per track: 0 not SY DRUM / 2 SY DRUM
ss_max:         .byte 127,127,3,1        | LSPD LDEP WAVE S&H
        .balign 4
        .text
