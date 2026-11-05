| Engine and preview readers share this path: Part -> selected scene -> accepted step.
| The engine's existing cap remains the final stage at every caller.
        .global fl_effective
fl_effective:
        lea     -16(%sp),%sp
        movem.l %d3-%d4/%a0-%a1,(%sp)
        jsr     fs_effective:l
        cmpi.l  #8,%d2
        bcc     fl_eff_out
        lea     0x8000182a,%a0
        mvz.b   (%a0,%d2.l),%d3
        cmpi.l  #16,%d3
        bcc     fl_eff_out
        move.l  fl_ready_mask:l,%d4
        btst    %d3,%d4
        beq     fl_eff_out
        move.l  fl_blocked_mask:l,%d4
        btst    %d3,%d4
        bne     fl_eff_out
        move.l  %d2,%d3
        lsl.l   #4,%d3
        lea     fl_seq_active:l,%a0
        adda.l  %d3,%a0
        mvz.b   (%a0),%d3
        cmpi.l  #255,%d3
        beq     fl_eff_chord
        move.l  %d3,%d0
fl_eff_chord:
        mvz.b   1(%a0),%d3
        cmpi.l  #255,%d3
        beq     fl_eff_out
        move.l  %d3,%d1
fl_eff_out:
        movem.l (%sp),%d3-%d4/%a0-%a1
        lea     16(%sp),%sp
        rts
