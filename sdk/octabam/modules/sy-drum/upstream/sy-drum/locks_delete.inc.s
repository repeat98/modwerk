        .global sl_grid_delete_hook
| Ordinary GRID RECORDING tap-delete is inline in the stock trig-release
| callback, separate from the selected-trig/all-locks clear API. This pin
| follows its complete audio lock-row clear; d3 is the absolute step.
| Companion locks belong to the musical row, including latent sample/FM rows.
sl_grid_delete_hook:
        bsr     sl_grid_delete_row
        lea     0x46c7d48c,%a0          | displaced native has-lock cache pointer
        jmp     0x400603f8
sl_grid_delete_row:
        lea     -64(%sp),%sp
        movem.l %d0-%d7/%a0-%a6,(%sp)
        move.w  %sr,%d0
        move.l  %d0,60(%sp)
        move.w  #0x2700,%sr             | clear all six values as one publication
        tst.l   0x80000012
        bne     sl_gd_out               | this native path is audio only
        mvz.b   0x100b14d0,%d1
        mvz.b   0x100b14cc,%d2
        moveq   #0,%d4
        move.l  #255,%d5
sl_gd_control:
        mvz.b   0x100b14ce,%d0
        jsr     sl_write:l             | validates bank/pattern/track/step/readiness
        addq.l  #1,%d4
        cmpi.l  #SL_CONTROLS,%d4         | A..F
        bne     sl_gd_control
sl_gd_out:
        move.l  60(%sp),%d0
        move.w  %d0,%sr
        movem.l (%sp),%d0-%d7/%a0-%a6
        lea     64(%sp),%sp
        rts
