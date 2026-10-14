 .text
 .global dt_native_free
dt_native_free:
 lea -12(%sp),%sp
 movem.l %d2-%d4,(%sp)
 jmp 0x400d4112
