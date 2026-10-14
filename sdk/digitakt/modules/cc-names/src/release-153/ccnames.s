    .section .text,"ax"
    .global ccn_stock_save,ccn_stock_load,ccn_stock_clear_kit,ccn_stock_clear_midi
ccn_stock_save:
    lea -28(%sp),%sp
    movem.l %d2-%d4/%a2-%a5,(%sp)
    jmp 0x4007a6ae
ccn_stock_load:
    move.l 4(%sp),%d0
    move.l 8(%sp),%a0
    jmp 0x4007a4d6
ccn_stock_clear_kit:
    lea -20(%sp),%sp
    movem.l %d2/%a2-%a5,(%sp)
    jmp 0x400846b4
ccn_stock_clear_midi:
    lea -32(%sp),%sp
    movem.l %d2/%a2-%a5,(%sp)
    jmp 0x40084768
    .global ccn_disabled_label_hook,ccn_enabled_label_hook
ccn_disabled_label_hook:
    move.l %d5,-(%sp)
    move.l %a2,-(%sp)
    jsr ccn_page_label
    addq.l #8,%sp
    rts
ccn_enabled_label_hook:
    move.l %d2,-(%sp)
    move.l %a4,-(%sp)
    jsr ccn_page_label
    addq.l #8,%sp
    rts
