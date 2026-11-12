| Panel publication is committed only at the validated command-store boundary.
| The fixed key table is unchanged. qz_tx accepted fields are frame-owned.
        .global qz_panel_stage, qz_panel_commit
qz_panel_stage:
        .if     HAVE_PANEL_TRANSACTION
        jbsr    qz_is_synth
        subq.l  #1,%d0
        jbne    qz_panel_stage_replay    | FM only; SY and sample paths keep their existing route
        lea     -20(%sp),%sp
        move.l  %a2,(%sp)              | immutable raw base, key, generation, membership, legato intent
        move.l  %d3,4(%sp)
        clr.l   16(%sp)
        move.l  %d2,%d0
        lsl.l   #5,%d0
        lea     qz_tx,%a0
        adda.l  %d0,%a0
        move.w  %sr,%d1
        move.w  #0x2700,%sr
        addq.l  #1,(%a0)
        move.l  (%a0),8(%sp)
        move.w  %d1,%sr
        move.w  %a2,%d1
        jbsr    qz_leg2_select
qz_panel_selected:
        move.l  %d0,-(%sp)             | capture membership after the selector adds the current key
        lea     qz_pmask,%a0
        move.l  (%a0,%d2.l*4),%d0
        move.l  %d0,16(%sp)
        move.l  (%sp)+,%d0
        tst.l   %d0
        jbne    qz_panel_trigless
        pea     -1
        pea     1
        pea     29
        move.l  %d2,-(%sp)
        jsr     0x40005030
qz_panel_return:
        lea     36(%sp),%sp
        jmp     0x4004fcca             | preserve validated result, HELD and recorder continuation
        .endif
qz_panel_stage_replay:
        move.l  %d2,%d0
        lsl.l   #5,%d0
        lea     0x46c7dfda,%a0
        move.w  %a2,%d1
        move.b  %d1,(%a0,%d0.l)
        jmp     0x4004fc94

qz_panel_commit:
        .if     HAVE_PANEL_TRANSACTION
        lea     -24(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        move.w  %sr,%d1                | preserve X before the indexing shift
        move.w  %d1,16(%sp)
        move.l  %a2,%d0                | helper track; this is not the panel's original raw a2
        cmpi.l  #8,%d0
        jbcc    qz_panel_outside        | unknown/non-audio callers retain the original store only
        lsl.l   #5,%d0
        lea     qz_tx,%a0
        adda.l  %d0,%a0
        move.w  #0x2700,%sr
        move.l  48(%sp),%d0            | helper's immediate return, including this24-byte save
        cmpi.l  #qz_panel_return,%d0
        jbne    qz_panel_other
        move.l  76(%sp),%d0
        cmp.l   (%a0),%d0
        jbne    qz_panel_commit_done   | superseded: keep successful press continuation, no stale repost
        move.l  %d0,4(%a0)
        move.l  72(%sp),%d0
        move.b  %d0,8(%a0)
        lea     qz_pkey,%a1
        move.b  %d0,(%a1,%a2.l)
        move.l  68(%sp),%d0
        move.b  %d0,9(%a0)
        move.l  %a2,%d1
        lsl.l   #5,%d1
        lea     0x46c7dfda,%a1
        move.b  %d0,(%a1,%d1.l)
        move.l  80(%sp),%d0
        move.l  %d0,12(%a0)
        moveq   #1,%d0
        move.b  %d0,10(%a0)
        move.b  %d0,11(%a0)
        tst.l   84(%sp)
        jbeq    qz_panel_command
        move.l  %a2,%d1
        lsl.l   #7,%d1
        lea     sy_state,%a1
        adda.l  %d1,%a1
        move.l  72(%sp),%d0
        move.b  %d0,124(%a1)            | deferred FM poly T_LEGKEY; existing state ABI
        clr.b   125(%a1)                | T_LEGN, published with this pitch and command
        jbra    qz_panel_command
qz_panel_other:
        cmpi.l  #0x4004fcc6,%d0         | the legacy panel call owns its already-written key
        jbeq    qz_panel_invalidate
        tst.b   11(%a0)
        jbeq    qz_panel_invalidate
        mvz.b   10(%a0),%d0
        cmpi.l  #1,%d0
        jbne    qz_panel_invalidate
        lea     qz_pkey,%a1
        clr.b   (%a1,%a2.l)            | only the superseded pending panel publication's identity
qz_panel_invalidate:
        addq.l  #1,(%a0)
        clr.b   11(%a0)                | competing publisher cannot erase a frame-owned accepted tuple
qz_panel_command:
        movea.l 8(%sp),%a1            | original shared command base
        move.l  %d6,(%a1,%a2.l*4)
qz_panel_commit_done:
        move.w  16(%sp),%d1
        move.w  %d1,%sr
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea     24(%sp),%sp
        jbra    qz_panel_success
qz_panel_outside:
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea     24(%sp),%sp
        .endif
        move.l  %d6,(%a0,%a2.l*4)
qz_panel_success:
        movea.l #1,%a1
        jmp     0x4000516a

        .if     HAVE_PANEL_TRANSACTION
qz_panel_legacy_key:
        lea     -16(%sp),%sp
        movem.l %d0-%d1/%a1,(%sp)
        move.w  %sr,%d0
        move.w  %d0,12(%sp)
        move.w  #0x2700,%sr
        move.l  %d2,%d0
        cmpi.l  #8,%d0
        jbcc    qz_panel_legacy_store
        lsl.l   #5,%d0
        lea     qz_tx,%a1
        adda.l  %d0,%a1
        addq.l  #1,(%a1)
        clr.b   11(%a1)                | release old FM publication ownership before the legacy key
qz_panel_legacy_store:
        lea     qz_pkey,%a0
        move.b  %d3,(%a0,%d2.l)
        move.w  12(%sp),%d0
        move.w  %d0,%sr
        movem.l (%sp),%d0-%d1/%a1
        lea     16(%sp),%sp
        tst.b   %d3                    | same NZVC as the key-byte store; X remains the saved value
        rts

qz_panel_trigless:
        lea     -16(%sp),%sp
        movem.l %d1/%a1,(%sp)
        move.w  %sr,%d1                | save before shifts; preserve the caller's X bit too
        move.w  %d1,8(%sp)
        move.l  %d2,%d0
        lsl.l   #5,%d0
        lea     qz_tx,%a0
        adda.l  %d0,%a0
        move.w  #0x2700,%sr
        move.l  24(%sp),%d0            | immutable per-call generation, original frame now atsp+16
        cmp.l   (%a0),%d0
        jbne    qz_panel_trigless_done
        lea     0x46c80354,%a1
        move.l  (%a1,%d2.l*4),%d0      | read and OR under the same exclusion as publication
        move.l  %d0,12(%sp)
        btst    #2,%d0
        jbeq    qz_panel_no_fresh
        move.l  24(%sp),%d0            | final positive contributor owns a coalesced fresh START
        move.l  %d0,4(%a0)
        move.l  20(%sp),%d0
        move.b  %d0,8(%a0)
        lea     qz_pkey,%a1
        move.b  %d0,(%a1,%d2.l)
        move.l  16(%sp),%d0
        move.b  %d0,9(%a0)
        move.l  28(%sp),%d0
        move.l  %d0,12(%a0)
        moveq   #1,%d0
        move.b  %d0,10(%a0)
        move.b  %d0,11(%a0)
        jbra    qz_panel_trigless_stage
qz_panel_no_fresh:
        clr.b   11(%a0)                | ordinary trigless: no new START and no fresh-key publication
qz_panel_trigless_stage:
        move.l  %d2,%d1
        lsl.l   #5,%d1
        lea     0x46c7dfda,%a0
        move.l  16(%sp),%d0
        move.b  %d0,(%a0,%d1.l)
        tst.l   32(%sp)
        jbeq    qz_panel_trigless_command
        move.l  %d2,%d1
        lsl.l   #7,%d1
        lea     sy_state,%a1
        adda.l  %d1,%a1
        move.l  20(%sp),%d0
        move.b  %d0,124(%a1)
        clr.b   125(%a1)
qz_panel_trigless_command:
        lea     0x46c80354,%a0
        move.l  12(%sp),%d0
        ori.l   #0x119,%d0
        move.l  %d0,(%a0,%d2.l*4)
qz_panel_trigless_done:
        move.w  8(%sp),%d1
        move.w  %d1,%sr
        movem.l (%sp),%d1/%a1
        lea     36(%sp),%sp
        jmp     0x4004fcd8

        .balign 4
        .global qz_tx
qz_tx:
        .fill   8 * 32,1,0
        .endif
