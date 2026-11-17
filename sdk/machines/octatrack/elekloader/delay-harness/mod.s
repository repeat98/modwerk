| SPDX-License-Identifier: GPL-3.0-or-later
| Test double of a module that takes the delay routine's seam 0x4000361a for its own FX2 id (as Tape Echo does):
| its tracks never reach 0x4000362a, and it writes the track's audio into the ring. Linked at 0x47300000.
        movea.l 76(%sp),%a0
        mvz.b   7(%a0),%d1
        cmpi.l  #0x15,%d1
        bne.s   1f
        move.l  0x800000e8,%d0
        move.l  0x40003626,%d1
        eor.l   %d1,%d0
        move.l  %d0,0x800000e8
        movea.l %d0,%a0
        movea.l 96(%sp),%a1
        moveq   #32,%d1
2:      move.l  (%a1)+,(%a0)+
        subq.l  #1,%d1
        bne.s   2b
        movea.l 0x80006180,%a0
        lea     68(%a0),%a0
        move.l  %a0,0x80006180
        jmp     0x4000377a
1:      movea.l 92(%sp),%a5
        move.l  0x800000e8,%d0
        jmp     0x40003624
