#NO_APP
	.file	"source.c"
	.text
	.align	2
	.globl	og_describe
	.type	og_describe, @function
og_describe:
	mvz.w #14602,%d1
	move.l %d1,%d0
	sub.l 1074360194,%d0
	lea (-12,%sp),%sp
	movem.l #28,(%sp)
	move.l 16(%sp),%d2
	move.l 20(%sp),%a0
	cmp.l %d1,%d0
	jcs .L2
.L4:
	clr.l %d0
.L1:
	movem.l (%sp),#28
	lea (12,%sp),%sp
	rts
.L2:
	mulu.w #6144,%d0
	move.l 1073742942,%d1
	add.l #-1084839392,%d1
	cmp.l %d1,%d0
	jcs .L4
	moveq #127,%d0
	cmp.l %d2,%d0
	jcs .L4
	moveq #44,%d1
	mov3q.l #3,%d3
	muls.l %d2,%d1
	move.l %d1,%a1
	add.l #1187586756,%a1
	move.l (%a1),%d0
	cmp.l %d0,%d3
	jcs .L4
	tst.l 8(%a1)
	jne .L4
	move.l 16(%a1),%d3
	move.l 20(%a1),%d1
	move.l %d3,%a1
	subq.l #1,%a1
	cmp.l #44860415,%a1
	jhi .L4
	tst.l %d1
	jeq .L4
	move.l %d2,%a1
	add.l #296896553,%a1
	move.l %a1,%d4
	lsl.l #2,%d4
	move.l %d4,%a1
	cmp.l (%a1),%d1
	jne .L4
	move.l %d2,(%a0)
	mov3q.l #1,%d2
	move.l %d1,8(%a0)
	cmp.l %d0,%d2
	scs %d1
	move.l %d3,4(%a0)
	and.l %d2,%d0
	clr.w %d3
	addq.l #3,%d1
	move.b %d1,12(%a0)
	addq.l #1,%d0
	move.b %d0,13(%a0)
	move.w %d3,14(%a0)
	mov3q.l #1,%d0
	jra .L1
	.size	og_describe, .-og_describe
	.align	2
	.globl	og_locate
	.type	og_locate, @function
og_locate:
	lea (-28,%sp),%sp
	movem.l #7228,(%sp)
	move.l 40(%sp),%a3
	move.l 32(%sp),%a2
	move.l 36(%sp),%d2
	clr.l (%a3)
	move.l -2147456744,%a4
	move.l -2147456748,%a1
	move.l 1074360194,%d4
	cmp.l 4(%a2),%d2
	jcs .L11
.L13:
	clr.l %d0
.L10:
	movem.l (%sp),#7228
	lea (28,%sp),%sp
	rts
.L11:
	move.l %a1,%d1
	move.l %a4,%d0
	add.l #-1174405120,%d1
	add.l #-1174405120,%d0
	or.l %d1,%d0
	cmp.l #33554431,%d0
	jhi .L13
	mvz.b 13(%a2),%d0
	mvz.b 12(%a2),%d1
	mvz.w #6144,%d3
	muls.w %d0,%d1
	divu.l %d1,%d3
	move.l %d2,%d0
	move.l %d3,%d5
	move.l %d3,%a0
	remu.l %d5,%d3:%d0
	divu.l %d5,%d0
	move.l (%a2),%d5
	add.l (%a4,%d5.l*4),%d0
	cmp.l %d4,%d0
	jhi .L13
	move.w (%a1,%d0.l*2),%a1
	move.w %a1,%d5
	mvz.w %a1,%d0
	tst.w %d5
	jeq .L10
	cmp.l %d4,%d0
	jhi .L13
	sub.l %d3,%a0
	move.l %a0,(%a3)
	move.l 4(%a2),%d0
	sub.l %d2,%d0
	cmp.l %a0,%d0
	jcc .L14
	move.l %d0,(%a3)
.L14:
	mulu.w %d3,%d1
	move.l %d1,%d0
	move.w %a1,%d1
	add.l 1073742942,%d0
	mulu.w #6144,%d1
	add.l %d1,%d0
	jra .L10
	.size	og_locate, .-og_locate
	.align	2
	.globl	og_stream_pcm
	.type	og_stream_pcm, @function
og_stream_pcm:
	lea (-20,%sp),%sp
	movem.l #7180,(%sp)
	move.l 24(%sp),%a3
	move.l 32(%sp),%a2
	move.l 8(%a3),%d0
	move.l (%a3),%a4
	tst.l %d0
	jeq .L19
	move.l 28(%sp),%d2
	sub.l 4(%a3),%d2
	cmp.l %d0,%d2
	jcs .L20
.L19:
	pea 8(%a3)
	move.l 32(%sp),-(%sp)
	move.l %a4,-(%sp)
	jsr og_locate
	clr.l %d2
	move.l 40(%sp),4(%a3)
	move.l %d0,12(%a3)
	lea (12,%sp),%sp
.L20:
	mvz.b 12(%a4),%d0
	mvz.b 13(%a4),%d1
	move.l %d0,%a1
	mulu.w %d1,%d0
	muls.l %d2,%d0
	move.l %d0,%a0
	add.l 12(%a3),%a0
	tst.l %a0
	jne .L21
	clr.l 4(%a2)
	clr.l (%a2)
.L18:
	movem.l (%sp),#7180
	lea (20,%sp),%sp
	rts
.L21:
	mov3q.l #2,%d3
	cmp.l %a1,%d3
	jne .L26
	cmp.l %d1,%d3
	jne .L24
	move.l (%a0),%d0
	move.l %d0,%d1
	clr.w %d1
	swap %d1
	mvs.w %d0,%d0
	move.l %d0,4(%a2)
	mvs.w %d1,%d1
	move.l %d1,(%a2)
	jra .L18
.L24:
	mvs.w (%a0),%d0
	move.l %d0,4(%a2)
	move.l %d0,(%a2)
	jra .L18
.L25:
	move.l %a0,%a4
	add.l %a1,%a0
	move.b (%a4)+,%d2
	lsl.l #8,%d2
	mvz.b (%a4),%d3
	or.l %d3,%d2
	mvs.w %d2,%d2
	move.l %d2,(%a2,%d0.l*4)
	addq.l #1,%d0
.L23:
	cmp.l %d1,%d0
	jcs .L25
	subq.l #1,%d1
	tst.l %d1
	jne .L18
	move.l (%a2),4(%a2)
	jra .L18
.L26:
	clr.l %d0
	jra .L23
	.size	og_stream_pcm, .-og_stream_pcm
	.align	2
	.globl	og_release_check
	.type	og_release_check, @function
og_release_check:
	move.l og_owner,%d0
	mov3q.l #7,%d1
	move.l %d2,-(%sp)
	cmp.l %d0,%d1
	jcs .L30
	mvz.w #168,%d1
	muls.l %d0,%d1
	move.l %d1,%a0
	add.l #-2147464744,%a0
	tst.b (%a0)
	jeq .L32
	lsl.l #6,%d0
	mov3q.l #7,%d2
	move.l %d0,%a0
	add.l #-2147483320,%a0
	move.w (%a0),%d1
	mvz.b %d1,%d1
	cmp.l %d1,%d2
	jne .L32
	move.w 512(%a0),%d0
	mvz.b %d0,%d0
	cmp.l %d0,%d2
	jeq .L30
.L32:
	pea og_state
	jsr og_stop
	addq.l #4,%sp
	moveq #8,%d0
	move.l %d0,og_owner
.L30:
	move.l (%sp)+,%d2
	rts
	.size	og_release_check, .-og_release_check
	.align	2
	.globl	og_render
	.type	og_render, @function
og_render:
	link.w %fp,#-52
	mov3q.l #7,%d0
	movem.l #60,(%sp)
	move.l 16(%fp),%d3
	cmp.l %d3,%d0
	jcs .L39
	move.l 20(%fp),%d0
	subq.l #1,%d0
	lsr.l #6,%d0
	jne .L39
	mov3q.l #1,%d4
	and.l 12(%fp),%d4
	move.l og_owner,%d2
	move.l %d4,%d0
	lsl.l #3,%d0
	move.l %d0,%a0
	add.l %d3,%a0
	mvz.w %a0,%d1
	lsl.l #6,%d1
	move.l %d1,-36(%fp)
	move.l %d1,%d5
	mov3q.l #7,%d1
	add.l #-2147483320,%d5
	cmp.l %d2,%d1
	jcs .L44
	mvz.w #168,%d1
	muls.l %d2,%d1
	move.l %d1,%a0
	add.l #-2147464744,%a0
	tst.b (%a0)
	jeq .L42
	add.l %d2,%d0
	mvz.w %d0,%d0
	lsl.l #6,%d0
	move.l %d0,%a0
	add.l #-2147483320,%a0
	move.w (%a0),%d0
	mvz.b %d0,%d0
	subq.l #7,%d0
	tst.l %d0
	jeq .L43
.L42:
	pea og_state
	moveq #8,%d2
	jsr og_stop
	addq.l #4,%sp
	moveq #8,%d0
	move.l %d0,og_owner
.L44:
	move.l %d5,%a0
	move.w (%a0),%d0
	mvz.b %d0,%d0
	subq.l #7,%d0
	tst.l %d0
	jne .L45
	mulu.w #384,%d4
	moveq #48,%d0
	muls.l %d3,%d0
	move.l %d4,%a0
	add.l #-2147482324,%a0
	tst.b (%a0,%d0.l)
	jne .L45
	mvz.w #168,%d5
	muls.l %d3,%d5
	move.l %d5,%a0
	add.l #-2147464724,%a0
	mvz.b (%a0),%d0
	subq.l #1,%d0
	tst.l %d0
	jne .L45
	move.b 1(%a0),%d0
	move.l %fp,%d4
	add.l #-24,%d4
	move.l %d4,-(%sp)
	mvz.b %d0,%d0
	move.l %d0,-(%sp)
	jsr og_describe
	addq.l #8,%sp
	tst.l %d0
	jne .L46
.L45:
	cmp.l %d3,%d2
	jne .L39
	clr.l -(%sp)
	pea og_state
	jsr og_reset
	addq.l #8,%sp
	moveq #8,%d0
	move.l %d0,og_owner
	jra .L39
.L43:
	cmp.l %d2,%d3
	jeq .L44
	move.l %d5,%a0
	move.w (%a0),%d0
	mvz.b %d0,%d0
	subq.l #7,%d0
	tst.l %d0
	jne .L44
	move.l -36(%fp),%a0
	add.l #-2147483344,%a0
	clr.w (%a0)
.L39:
	movem.l -52(%fp),#60
	unlk %fp
	rts
.L46:
	move.l %d5,%a0
	add.l #-2147464744,%a0
	tst.b (%a0)
	jne .L47
	cmp.l %d3,%d2
	jne .L39
	pea og_state
	jsr og_stop
	addq.l #4,%sp
	moveq #8,%d1
	move.l %d1,og_owner
	jra .L39
.L47:
	move.l -36(%fp),%a0
	add.l #-2147483325,%a0
	mvz.b (%a0),%d0
	moveq #127,%d1
	cmp.l %d0,%d1
	jcc .L48
	moveq #127,%d0
.L48:
	lea og_densities,%a0
	add.l %d0,%a0
	move.b (%a0),-32(%fp)
	move.l -36(%fp),%a0
	add.l #-2147483350,%a0
	move.b (%a0),-31(%fp)
	move.l -36(%fp),%a0
	add.l #-2147483352,%a0
	move.b (%a0),-30(%fp)
	move.l -36(%fp),%a0
	add.l #-2147483327,%a0
	move.b (%a0),-29(%fp)
	move.l -36(%fp),%a0
	add.l #-2147483346,%a0
	move.b (%a0),-28(%fp)
	move.l -36(%fp),%a0
	add.l #-2147483328,%a0
	move.b (%a0),-27(%fp)
	move.l -36(%fp),%a0
	add.l #-2147483342,%a0
	move.b (%a0),-26(%fp)
	move.l -36(%fp),%a0
	add.l #-2147483348,%a0
	move.b (%a0),%d0
	jpl .L49
	moveq #127,%d0
.L49:
	moveq #127,%d1
	sub.l %d0,%d1
	move.b %d1,-25(%fp)
	moveq #8,%d0
	cmp.l %d2,%d0
	jne .L50
	move.l %d3,og_owner
.L50:
	move.l -36(%fp),%a0
	add.l #-2147483316,%a0
	move.w (%a0),%d0
	moveq #24,%d1
	subq.l #8,%d2
	bclr #8,%d0
	move.w %d0,(%a0)
	move.l -24(%fp),%d0
	lsl.l %d1,%d0
	move.l -16(%fp),%d1
	eor.l %d1,%d0
	tst.l %d2
	jeq .L51
	cmp.l og_state+104.l,%d0
	jeq .L52
.L51:
	move.l %d0,-(%sp)
	pea og_state
	jsr og_reset
	addq.l #8,%sp
.L52:
	mov3q.l #1,%d1
	clr.b %d0
	move.l -36(%fp),%a0
	add.l #-2147483326,%a0
	move.b %d0,og_state+122
	move.b (%a0),%d0
	move.w #2047,%a0
	move.l 20(%fp),-(%sp)
	move.l 8(%fp),-(%sp)
	pea -32(%fp)
	move.l %d4,-(%sp)
	pea og_state
	eor.l %d1,%d0
	tst.b %d0
	seq %d0
	neg.l %d0
	move.b %d0,og_state+123
	cmp.l -20(%fp),%a0
	scs %d0
	neg.l %d0
	move.b %d0,-9(%fp)
	jsr og_engine
	lea (20,%sp),%sp
	jra .L39
	.size	og_render, .-og_render
	.text
	.type	og_densities, @object
	.size	og_densities, 128
og_densities:
	.base64	"CAgICQkJCQkKCgoKCwsLCwsMDAwNDQ0NDg4ODw8PEBAQEREREhISExMUFBUVFRYWFxcYGBkaGhsbHBwdHh4fICAhIiMjJCUmJycoKSorLC0uLzAxMjM0NTc4OTo8PT5AQUJERUdISkxNT1FSVFZYWlxeYGJkZmlrbXBydHd6fH8="
	.ident	"GCC: (GNU) 16.2.0"

#APP
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
