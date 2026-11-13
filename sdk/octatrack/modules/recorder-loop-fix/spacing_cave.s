| RECORDER LOOP FIX: infer the exact consecutive-arm phase without arm/q drift.
| Added Modwerk correction, GPL-3.0-or-later; Sam Banks's displaced path retained.
| Fixed RLEN 1..64, tempo24 720..7200 (30..300 BPM). Outside that range keep stock.
| q >= 2205: k0=arm/q; k1=k0-floor(f(k0)/q) is k or k-1 over uint32 arms.
| f(k)=floor(k*r/D), computed as (k/D)*r + ((k%D)*r)/D to avoid 32-bit overflow.
| Compare the next arm once to choose k, then return q+f(k+1)-f(k).
| Saved d0-d3/a0-a1; 16 local bytes plus a 4-byte fraction-call return: 44 bytes.
        .text
cave:
        move.l  %d0,%d4
        addq.l  #1,%d4
        asr.l   #1,%d4
        lea     -40(%sp),%sp
        movem.l %d0-%d3/%a0-%a1,16(%sp)
        move.l  0x80001814,%d1
        cmpi.l  #720,%d1
        blo     keep
        cmpi.l  #7200,%d1
        bhi     keep
        move.l  %d4,%d0
        mulu.l  %d1,%d0
        add.l   #7938000,%d0
        move.l  #15876000,%d2
        divu.l  %d2,%d0
        beq     keep
        cmpi.l  #64,%d0
        bhi     keep
        mulu.l  %d2,%d0
        move.l  %d0,%d3
        divu.l  %d1,%d0
        beq     keep
        move.l  %d0,%d2
        mulu.l  %d1,%d0
        sub.l   %d0,%d3
        beq     guard
        move.l  %d3,4(%sp)
        move.l  180(%sp),%d0
        lsl.l   #2,%d0
        lea     0x46c7fa84,%a0
        move.l  (%a0,%d0.l),%d0
        move.l  %d0,(%sp)
        divu.l  %d2,%d0
        move.l  %d0,12(%sp)
        bsr     fraction
        divu.l  %d2,%d0
        move.l  12(%sp),%d3
        sub.l   %d0,%d3
        move.l  %d3,12(%sp)
        move.l  %d3,%d0
        mulu.l  %d2,%d0
        move.l  (%sp),%d3
        sub.l   %d0,%d3
        move.l  %d3,(%sp)
        move.l  12(%sp),%d0
        addq.l  #1,%d0
        bsr     fraction
        add.l   %d2,%d0
        cmp.l   (%sp),%d0
        bhi     phase_ready
        addq.l  #1,12(%sp)
phase_ready:
        move.l  12(%sp),%d0
        bsr     fraction
        move.l  %d0,(%sp)
        move.l  12(%sp),%d0
        addq.l  #1,%d0
        bsr     fraction
        sub.l   (%sp),%d0
        add.l   %d0,%d2
guard:
        move.l  %d2,%d0
        sub.l   %d4,%d0
        addq.l  #1,%d0
        cmpi.l  #2,%d0
        bhi     keep
        move.l  %d2,%d4
keep:
        movem.l 16(%sp),%d0-%d3/%a0-%a1
        lea     40(%sp),%sp
        rts
fraction:
        move.l  %d0,%a1
        divu.l  %d1,%d0
        move.l  8(%sp),%d3
        mulu.l  %d3,%d0
        move.l  %d0,%a0
        move.l  %a1,%d0
        move.l  %d0,%d3
        divu.l  %d1,%d3
        mulu.l  %d1,%d3
        sub.l   %d3,%d0
        move.l  8(%sp),%d3
        mulu.l  %d3,%d0
        divu.l  %d1,%d0
        add.l   %a0,%d0
        rts
