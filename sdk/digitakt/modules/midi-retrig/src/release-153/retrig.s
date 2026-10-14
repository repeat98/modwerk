    .section .text.hooks,"ax"
    .macro save
    lea -20(%sp),%sp
    movem.l %d0-%d1/%a0-%a1,(%sp)
    move.w %sr,%d0
    move.w %d0,16(%sp)
    move.w #0x2700,%sr
    .endm
    .macro restore
    move.w 16(%sp),%d0
    move.w %d0,%sr
    movem.l (%sp),%d0-%d1/%a0-%a1
    lea 20(%sp),%sp
    .endm
    .global mr_prepare_hook
mr_prepare_hook:
    save
    move.l %d4,-(%sp)
    move.l %d6,-(%sp)
    move.l %a2,-(%sp)
    move.l %a3,-(%sp)
    jsr mr_prepare
    lea 16(%sp),%sp
    restore
    moveq #3,%d0
    move.l %d0,(%a3)
    moveq #1,%d0
    rts
    .global mr_dispatch_hook
mr_dispatch_hook:
    save
    move.l 4(%a5),-(%sp)
    move.l %a2,-(%sp)
    jsr mr_dispatch
    addq.l #8,%sp
    restore
    moveq #2,%d1
    move.l (%a2),%d0
    cmp.l %d0,%d1
    rts
    .global mr_tick_hook
mr_tick_hook:
    save
    jsr mr_tick
    restore
    jmp 0x400edf00
    .global mr_stop_hook
mr_stop_hook:
    save
    jsr mr_cancel_all
    restore
    moveq #1,%d0
    move.l %d0,0x421b5e24
    rts
