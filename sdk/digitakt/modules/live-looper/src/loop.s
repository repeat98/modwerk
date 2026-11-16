 .text
 .balign 2
 .global ram_lookup
ram_lookup:
 cmpi.l #0x830,%d0
 beq 1f
 addi.l #0x4031a3a0,%d0
 rts
1: move.l #ram_descriptor,%d0
 rts
 .global ram_native_new,ram_native_load,ram_native_set
ram_native_new:
 lea -20(%sp),%sp
 movem.l %d2-%d4/%a2-%a3,(%sp)
 jmp 0x40084c08
ram_native_load:
 lea -36(%sp),%sp
 movem.l %d2-%d5/%a2,(%sp)
 jmp 0x4001ac28
ram_native_set:
 lea -28(%sp),%sp
 movem.l %d2-%d5/%a2-%a4,(%sp)
 jmp 0x400225d2
