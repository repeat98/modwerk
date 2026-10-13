#!/usr/bin/env python3
"""Rebuild ../locks_io.inc.s, SY DRUM's lock-file I/O, from locks_io.c (with scenes_io.h and
gjlocks_io.h) and the thunks below: m68k-elf-gcc -mcpu=5475 -O2, freestanding. The
TRAMPOLINES replay the instructions each stock I/O detour displaced (OS addresses only)."""
from pathlib import Path
import hashlib,subprocess,tempfile
HERE=Path(__file__).resolve().parent
SRC=HERE/'locks_io.c'; OUT=HERE.parent/'locks_io.inc.s'
TRAMPOLINES={
 'banks_load':(0x400905dc,'lea -328(%sp),%sp\nmovem.l %d2-%d7/%a2-%a6,(%sp)'),
 'banks_save':(0x400917d0,'link.w %a6,#-324\nmovem.l %d2-%d7/%a2-%a5,(%sp)'),
 'card_sync':(0x400919ec,'lea -12(%sp),%sp\nmovem.l %d2-%d4,(%sp)'),
 'project_store':(0x4008ee7c,'link.w %a6,#-560\nmovem.l %d2-%d7/%a2-%a5,(%sp)'),
 'project_restore':(0x4008f188,'link.w %a6,#-560\nmovem.l %d2-%d7/%a2-%a5,(%sp)'),
 'bank_store':(0x4008edac,'lea -564(%sp),%sp\nmovem.l %d2-%d7/%a2-%a6,(%sp)'),
 'bank_restore':(0x4008f0b8,'lea -564(%sp),%sp\nmovem.l %d2-%d7/%a2-%a6,(%sp)'),
 'export':(0x400912cc,'lea -104(%sp),%sp\nmovem.l %d2-%d7/%a2-%a5,(%sp)'),
 'clear':(0x400909e2,'move.l %a2,-(%sp)\nclr.l -(%sp)\njsr 0x4000fd34:l'),
 'delete':(0x4008ec54,'lea -324(%sp),%sp\nmovem.l %d2-%d5/%a2-%a3,(%sp)'),
}
THUNKS=r'''
        .section .text
sl_io_core_bank:
        move.l 4(%sp),%d0
        bsr sl_bank_ptr
        move.l %a0,%d0
        rts
sl_io_core_validate:
        move.l %a2,-(%sp)
        move.l 8(%sp),%d0
        move.l 12(%sp),%a0
        move.l 16(%sp),%d1
        move.l 20(%sp),%a2
        bsr sl_file_validate
        move.l %d1,(%a2)
        move.l (%sp)+,%a2
        rts
sl_io_core_pack:
        move.l 4(%sp),%d0
        move.l 8(%sp),%d1
        move.l 12(%sp),%a0
        move.l 16(%sp),%a1
        bra sl_file_pack
sl_io_core_publish:
        move.l 4(%sp),%d0
        move.l 8(%sp),%d1
        move.l 12(%sp),%a0
        bra sl_bank_publish
sl_io_core_seal:
        move.l 4(%sp),%d0
        move.l 8(%sp),%d1
        move.l 12(%sp),%a1
        bra sl_file_seal
sl_io_fs_open:
        jmp 0x40016864:l
sl_io_fs_read:
        jmp 0x40016564:l
sl_io_fs_write:
        jmp 0x400166b8:l
sl_io_fs_close:
        jmp 0x4001677c:l
sl_io_fs_size:
        move.l 0x46c8241e:l,%a0
        jmp (%a0)
sl_io_fs_copy:
        jmp 0x40016388:l
sl_io_fs_remove:
        move.l 0x46c82432:l,%a0
        jmp (%a0)
sl_io_stock_directory:
        jmp 0x40025230:l
sl_io_stock_card_ready:
        jmp 0x400255ec:l
sl_io_queue_post:
        jmp 0x40000c3c:l
sl_io_post:
        jmp 0x40084110:l
sl_io_toast:
        jmp 0x4005a2b8:l
sl_io_irq_lock:
        moveq #0,%d0
        move.w %sr,%d0
        move.w #0x2700,%sr
        rts
sl_io_irq_restore:
        move.l 4(%sp),%d0
        move.w %d0,%sr
        rts
| Displaced dispatcher switch prefix; a2 remains the stable stock job.
sl_io_dispatch:
        lea -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        move.l %a2,-(%sp)
        bsr sl_io_before_job
        addq.l #4,%sp
        tst.l %d0
        bpl sl_io_dispatch_resume
        move.l %d0,-(%sp)
        move.l %a2,-(%sp)
        bsr sl_io_reject_job
        addq.l #8,%sp
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea 16(%sp),%sp
        jmp 0x4008484e:l
sl_io_dispatch_resume:
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea 16(%sp),%sp
        mvz.b (%a2),%d0
        moveq #45,%d1
        cmp.l %d0,%d1
        jmp 0x40084864:l
| Existing UI timer schedules stock engine job2 when SY locks alone are dirty.
| No filesystem call, core call, allocation, or new queue descriptor here.
sl_io_background_request:
        and.l %d1,%d0
        bne sl_io_background_yes
        move.l %d1,-(%sp)
        move.l sl_dirty_mask:l,%d0
        and.l sl_ready_mask:l,%d0
        move.l sl_blocked_mask:l,%d1
        or.l sl_io_protected_mask:l,%d1
        not.l %d1
        and.l %d1,%d0
        tst.l %d0
        bne sl_io_background_some
        move.l sg_dirty_mask:l,%d0       | the G..J lock files (sylkgj) alone dirty
        and.l sl_ready_mask:l,%d0
        move.l sl_blocked_mask:l,%d1
        or.l sg_blocked_mask:l,%d1
        or.l sg_protected_mask:l,%d1
        not.l %d1
        and.l %d1,%d0
        tst.l %d0
sl_io_background_some:
        move.l (%sp)+,%d1
        tst.l %d0
        beq sl_io_background_no
sl_io_background_yes:
        moveq #1,%d0
        jmp 0x40022c1c:l
sl_io_background_no:
        jmp 0x40022c70:l
| The UI tick's transport test (0x4005224a; d0 = the sequencer state 0x800065b8): stopped
| (0) or 2 continue to stock's background save counter; otherwise stock clears that counter
| (0x40052278) and the lock files get their own flush (sl_io_play_tick).
sl_io_tick_hook:
        tst.l %d0
        beq sl_io_tick_stock
        moveq #2,%d1
        cmp.l %d0,%d1
        beq sl_io_tick_stock
        lea -16(%sp),%sp
        movem.l %d0-%d1/%a0-%a1,(%sp)
        bsr sl_io_play_tick
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea 16(%sp),%sp
        jmp 0x40052278:l
sl_io_tick_stock:
        jmp 0x40052254:l
'''
def generate():
    with tempfile.TemporaryDirectory(prefix='sy-locks-') as tmp:
        asm=Path(tmp)/'io.s'
        subprocess.run(['m68k-elf-gcc','-mcpu=5475','-O2','-fno-builtin','-ffreestanding',
                        '-fno-common','-fno-zero-initialized-in-bss','-fno-pic',
                        '-fno-asynchronous-unwind-tables','-fno-unwind-tables',
                        '-S',str(SRC),'-o',str(asm)],check=True)
        lines=[]
        for line in asm.read_text().splitlines():
            if line.lstrip().startswith(('.file','.ident')):continue
            if '.comm' in line:
                name,size,*rest=line.split('.comm',1)[1].strip().split(',')
                lines+=['.section .data','.balign 4',name+':','.space '+size]
            else:lines.append(line.replace('.bss','.data'))
        generated='\n'.join(lines)+'\n'+THUNKS
        for name,(resume,code) in TRAMPOLINES.items():
            generated+=f'\nsl_io_stock_{name}:\n{code}\njmp 0x{resume:08x}:l\n'
        generated+='\n.section .text\n'
        digest=hashlib.sha256(SRC.read_bytes()+(HERE/'scenes_io.h').read_bytes()+(HERE/'gjlocks_io.h').read_bytes()).hexdigest()
        OUT.write_text('| GENERATED from tools/locks_io.c (with tools/scenes_io.h, tools/gjlocks_io.h); do not edit.\n'
                       '| Run python3 sy-drum/tools/gen_locks_io.py (m68k-elf-gcc on PATH)\n'
                       f'| Source SHA256 (the .c, scenes_io.h, gjlocks_io.h) {digest}\n'+generated)
if __name__=='__main__':generate()
