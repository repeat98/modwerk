| Detour just after the native source fetch: the site 0x400041cc holds the
| six bytes that follow the stock call (move.l %d7,%d0; asl.l #3,%d0;
| adda.l %d0,%a4), and every exit replays them and resumes the stock caller
| at 0x400041d2. By then the stock renderer 0x40007960 has filled this
| call's output with the dry samples and popped its arguments, so FRACT
| granulates the buffer as 0.9.6 did after its own copy of that call.
| The stock caller's frame holds the track at 52(%sp) and the ping at
| 56(%sp); a4 is the output and d7 its frame count, d3 the output samples,
| all three saved across the stock call (the caller reads a4 and d7 next).
| d0, d1, a0 and a1 are dead: the displaced code writes d0, and the caller
| writes d1, a0 and a1 before it reads them. POLY8's polyphony_call (its
| site is the stock call at 0x400041c4) also continues at 0x400041cc, so the
| two chain and FRACT runs on POLY8's mix.
| Every track with a loaded Flex/Static sample reaches the seam once or twice
| a block, stopped or playing, so a call whose own frame record does not name
| FRACT on FX2, on a track that does not own FRACT, takes only those two
| tests and the three displaced instructions: one pool read (og_owner), no
| register save. The owner's own calls always reach og_render, so it lets go
| of the owner as 0.9.6 did, in card builds too. og_fetch_wants (source.c) is
| the same test
| for host models; the UI tick (og_release_check) lets go of an owner whose
| calls stopped coming.
| The record index comes from the caller: from 0x40004056 on, a5 holds
| 0x80000eb4 + 8*ping + track; nothing in the caller writes it again and the
| stock renderer restores it (tests/verify_image.py proves all three on the
| stock MAIN). Shifted by 6 that is (0x80000eb4 << 6) mod 2^32 = 0x3ad00
| plus the record offset, so the FX2 id byte (rec+57, 0x80000149 +
| 64*(8*ping+track)) sits at 0x7ffc5449 + d0. 7 is OG_FX_ID (fxid.h,
| checked by tests/verify_detour.py).
        .text
        .global og_fetch
og_fetch:
        move.l %a5,%d0
        lsl.l #6,%d0
        lea 0x7ffc5449,%a0
        moveq #7,%d1
        cmp.b (%a0,%d0.l),%d1
        beq.s 2f
        move.l 52(%sp),%d0
        cmp.l og_owner(%pc),%d0
        beq.s 1f
| The three displaced instructions, then back to the stock caller.
0:      move.l %d7,%d0
        asl.l #3,%d0
        adda.l %d0,%a4
        jmp 0x400041d2
| A FRACT call whose voice is stopped needs no og_render unless its track
| owns FRACT (og_render only returns): the displaced instructions, and,
| while another track owns FRACT, the second FRACT's bypass og_render makes
| for a playing voice: the SPCE word of the call's own record cleared
| (rec+32 = 0x7ffc5430 + d0 as above), so SPACE stays dry (source.c). Without
| an owner nothing is written: every FRACT track keeps its SPACE.
2:      move.l 52(%sp),%d0
        cmp.l og_owner(%pc),%d0
        beq.s 1f
        mulu.w #168,%d0
        lea 0x800049d8,%a0
        tst.b (%a0,%d0.l)
        bne.s 1f
        moveq #8,%d1
        cmp.l og_owner(%pc),%d1
        bls.s 0b
        move.l %a5,%d0
        lsl.l #6,%d0
        lea 0x7ffc5430,%a0
        clr.w (%a0,%d0.l)
        bra.s 0b
| FRACT's own call: og_render(output, ping, track, frames, output samples,
| 0). It ignores the last two; the stock call's flags word is gone by now.
1:
        lea -60(%sp),%sp
        movem.l %d0-%d7/%a0-%a6,(%sp)
        movea.l %sp,%a6
| GCC's ColdFire code assumes a 4-aligned stack, and kernel.s reads its run
| and the join's pairs from og_engine's frame as longwords: hand og_render
| a stack on 0 mod 4, whatever the stock's (a6 keeps the frame).
        move.l %sp,%d0
        andi.l #-4,%d0
        movea.l %d0,%sp
        clr.l -(%sp)
        move.l %d3,-(%sp)
        move.l %d7,-(%sp)
        move.l 112(%a6),-(%sp)
        move.l 116(%a6),-(%sp)
        move.l %a4,-(%sp)
        jsr og_render
        movea.l %a6,%sp
        movem.l (%sp),%d0-%d7/%a0-%a6
        lea 60(%sp),%sp
        move.l %d7,%d0
        asl.l #3,%d0
        adda.l %d0,%a4
        jmp 0x400041d2
