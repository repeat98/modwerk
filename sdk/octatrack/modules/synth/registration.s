#NO_APP
	.file	"registration.c"
	.text
	.align	2
	.type	signed_track, @function
signed_track:
	move.l %d2,-(%sp)
	move.l 8(%sp),%a0
	move.l 12(%sp),%d0
	mvz.b 34(%a0,%d0.l),%d1
	subq.l #1,%d1
	tst.l %d1
	jeq .L2
.L4:
	move.l (%sp)+,%d2
	clr.l %d0
	rts
.L2:
	mulu.w #30,%d0
	moveq #70,%d1
	lea 60(%a0,%d0.l),%a0
	mvz.b (%a0),%d0
	cmp.l %d0,%d1
	jne .L4
	mvz.b 1(%a0),%d0
	moveq #77,%d2
	cmp.l %d0,%d2
	jne .L4
	move.b 2(%a0),%d0
	mov3q.l #1,%d1
	move.l (%sp)+,%d2
	eor.l %d1,%d0
	tst.b %d0
	seq %d0
	mvs.b %d0,%d0
	neg.l %d0
	rts
	.size	signed_track, .-signed_track
	.align	2
	.globl	fm_admit_track
	.type	fm_admit_track, @function
fm_admit_track:
	mov3q.l #7,%d1
	cmp.l 8(%sp),%d1
	scc %d0
	moveq #1,%d1
	mvs.b %d0,%d0
	move.b %d1,fm_picked
	neg.l %d0
	rts
	.size	fm_admit_track, .-fm_admit_track
	.align	2
	.globl	fm_in_use
	.type	fm_in_use, @function
fm_in_use:
	lea (-16,%sp),%sp
	movem.l #28,(%sp)
	move.b fm_sweep,%d2
	move.l 1187521622,%d0
	move.l #635712,%d4
	move.l %d0,12(%sp)
	mvz.b %d2,%d3
	move.l %d3,%d1
	lsr.l #3,%d1
	muls.l %d4,%d1
	move.w %d2,%ccr
	jeq .L35
	mov3q.l #3,%d0
	and.l %d2,%d0
	mvz.w #6322,%d4
	move.l #585088,%a0
	muls.l %d4,%d0
	add.l %d1,%d0
	add.l #1074668000,%d0
	add.l %a0,%d0
	move.l %d0,%a1
	move.l %d0,%a0
	lea (34,%a1),%a1
	add.l #300,%d0
	lea (60,%a0),%a0
.L13:
	mvz.b (%a1),%d1
	addq.l #1,%a1
	subq.l #1,%d1
	tst.l %d1
	jeq .L55
.L11:
	lea (30,%a0),%a0
	cmp.l %d0,%a0
	jne .L13
	mulu.w #1096,%d3
	move.l %d3,%a0
	add.l #269161712,%a0
	move.l %d3,%a1
	move.l %a0,%d3
	add.l #269161967,%a1
.L17:
	move.b (%a0),%d0
	addq.l #1,%a0
	mvz.b %d0,%d1
	tst.b %d0
	jeq .L15
	moveq #47,%d0
	cmp.l %d1,%d0
	jeq .L56
	cmp.l %a1,%a0
	jne .L17
.L15:
	move.l %d3,%a0
	moveq #70,%d1
	mvz.b (%a0),%d0
	cmp.l %d0,%d1
	jeq .L57
.L20:
	move.l %d3,%a0
	moveq #83,%d1
	mvz.b (%a0),%d0
	cmp.l %d0,%d1
	jeq .L58
.L21:
	addq.l #1,%d2
	moveq #127,%d0
	and.l %d0,%d2
	move.b %d2,fm_sweep
	tst.l %d2
	jne .L22
	tst.b fm_seen.l
	seq %d0
	clr.b %d1
	neg.l %d0
	move.b %d1,fm_seen
	move.b %d0,fm_clean
.L22:
	tst.b fm_picked.l
	jne .L51
	tst.b 269161709.l
	jne .L52
	tst.b fm_seen.l
	jne .L30
	tst.b fm_clean.l
	jeq .L51
	move.l 12(%sp),%a0
	cmp.l #1073741823,%a0
	jls .L52
	move.l 12(%sp),%d1
	cmp.l #1206910975,%d1
	jhi .L51
	move.l 1187521622,%d3
	mov3q.l #3,%d1
	move.b 269161679,%d0
	mvz.w #6322,%d4
	add.l #585088,%d3
	clr.l %d2
	and.l %d1,%d0
	muls.l %d4,%d0
	add.l %d0,%d3
.L31:
	move.l %d2,-(%sp)
	move.l %d3,-(%sp)
	jsr signed_track
	addq.l #8,%sp
	addq.l #1,%d2
	tst.l %d0
	jne .L30
	moveq #8,%d1
	cmp.l %d2,%d1
	jne .L31
	clr.b %d4
	moveq #1,%d1
	move.b %d4,fm_picked
	movem.l (%sp),#28
	move.b %d1,fm_fr+10
	lea (16,%sp),%sp
	rts
.L55:
	mvz.b (%a0),%d1
	moveq #70,%d4
	cmp.l %d1,%d4
	jne .L11
	mvz.b 1(%a0),%d1
	moveq #77,%d4
	cmp.l %d1,%d4
	jne .L11
	mvz.b 2(%a0),%d1
	subq.l #1,%d1
	tst.l %d1
	jne .L11
	moveq #1,%d4
	move.b %d4,fm_seen
	jra .L21
.L35:
	mov3q.l #3,%d0
	and.l %d2,%d0
	mvz.w #6322,%d4
	move.l #610378,%a0
	muls.l %d4,%d0
	add.l %d1,%d0
	add.l #1074668000,%d0
	add.l %a0,%d0
	move.l %d0,%a1
	move.l %d0,%a0
	lea (34,%a1),%a1
	add.l #300,%d0
	lea (60,%a0),%a0
	jra .L13
.L56:
	move.l %a0,%d3
	cmp.l %a1,%a0
	jne .L17
	jra .L15
.L51:
	clr.b %d4
	move.b %d4,fm_picked
.L24:
	tst.b fm_fr+10.l
	jeq .L33
	moveq #1,%d4
	clr.b %d0
	move.b %d4,fm_fr+11
	move.b %d0,fm_fr+10
.L33:
	movem.l (%sp),#28
	mov3q.l #1,%d0
	lea (16,%sp),%sp
	rts
.L52:
	clr.b %d0
	move.b %d0,fm_picked
	jra .L24
.L30:
	clr.b %d1
	move.b %d1,fm_picked
	jra .L24
.L58:
	mvz.b 1(%a0),%d0
	moveq #89,%d4
	cmp.l %d0,%d4
	jne .L21
	mvz.b 2(%a0),%d0
	moveq #78,%d1
	cmp.l %d0,%d1
	jne .L21
	mvz.b 3(%a0),%d0
	moveq #84,%d4
	cmp.l %d0,%d4
	jne .L21
	mvz.b 4(%a0),%d0
	moveq #72,%d1
	cmp.l %d0,%d1
	jne .L21
	moveq #1,%d4
	move.b %d4,fm_seen
	jra .L21
.L57:
	mvz.b 1(%a0),%d0
	moveq #77,%d4
	cmp.l %d0,%d4
	jne .L20
	addq.l #2,%d3
	move.l %d3,%a0
	moveq #83,%d1
	mvz.b (%a0),%d0
	cmp.l %d0,%d1
	jne .L21
	jra .L58
	.size	fm_in_use, .-fm_in_use
	.align	2
	.globl	fm_type
	.type	fm_type, @function
fm_type:
	move.l %d2,-(%sp)
	move.l 1187521622,%d0
	mov3q.l #1,%d2
	move.b 269161679,%d1
	cmp.l 8(%sp),%d2
	jeq .L68
.L61:
	move.l 8(%sp),%d0
	move.l (%sp)+,%d2
	rts
.L68:
	mov3q.l #3,%d2
	and.l %d1,%d2
	mvz.w #6322,%d1
	add.l #585088,%d0
	move.l 12(%sp),%a0
	muls.l %d1,%d2
	add.l %d2,%d0
	move.l %d0,%a1
	mov3q.l #7,%d2
	lea (34,%a1),%a1
	sub.l %a1,%a0
	cmp.l %a0,%d2
	jcs .L61
	move.l %a0,-(%sp)
	move.l %d0,-(%sp)
	jsr signed_track
	addq.l #8,%sp
	tst.l %d0
	jeq .L61
	mov3q.l #5,8(%sp)
	move.l 8(%sp),%d0
	move.l (%sp)+,%d2
	rts
	.size	fm_type, .-fm_type
	.align	2
	.globl	fm_track_page
	.type	fm_track_page, @function
fm_track_page:
	jmp 1074603216
	.size	fm_track_page, .-fm_track_page
	.align	2
	.globl	fm_ui_tick
	.type	fm_ui_tick, @function
fm_ui_tick:
	jsr 1074603216
	move.l %d0,1074618188
	rts
	.size	fm_ui_tick, .-fm_ui_tick
	.align	2
	.globl	fm_validate_part
	.type	fm_validate_part, @function
fm_validate_part:
	lea (-140,%sp),%sp
	movem.l #31996,(%sp)
	move.l 144(%sp),%d2
	mov3q.l #6,%a6
	lea (44,%sp),%a2
	clr.l %d5
	move.l %a2,%a4
	clr.l %d3
.L77:
	move.l %d5,-(%sp)
	move.l %d2,-(%sp)
	jsr signed_track
	addq.l #8,%sp
	tst.l %d0
	jne .L102
.L74:
	addq.l #1,%d5
	lea (30,%a6),%a6
	lea (12,%a4),%a4
	cmp.l #246,%a6
	jne .L77
	move.l %d2,-(%sp)
	jsr fm_stock_validate
	addq.l #4,%sp
	clr.l %d5
	mov3q.l #6,%a0
.L82:
	btst %d5,%d3
	jne .L103
	addq.l #1,%d5
	lea (30,%a0),%a0
	lea (12,%a2),%a2
	cmp.l #246,%a0
	jne .L82
.L106:
	movem.l (%sp),#31996
	lea (140,%sp),%sp
	rts
.L102:
	mov3q.l #1,%d0
	lsl.l %d5,%d0
	sub.l %a0,%a0
	or.l %d0,%d3
.L76:
	move.l #1074606604,%a5
	mov3q.l #5,%d0
	add.l %a0,%a5
	lea 42(%a6,%a0.l),%a3
	move.l %a5,%a1
	cmp.l %a0,%d0
	jcc .L75
.L104:
	move.l %a0,%d1
	mov3q.l #6,%d7
	remu.l %d7,%d0:%d1
	lea (%a6,%d0.l),%a1
	moveq #12,%d0
	lea (474,%a1),%a1
	add.l %d2,%a1
	move.b (%a1),(%a4,%a0.l)
	addq.l #1,%a0
	move.b (%a5),(%a1)
	cmp.l %a0,%d0
	jeq .L74
	move.l #1074606604,%a5
	mov3q.l #5,%d0
	add.l %a0,%a5
	lea 42(%a6,%a0.l),%a3
	move.l %a5,%a1
	cmp.l %a0,%d0
	jcs .L104
.L75:
	lea (%a3,%d2.l),%a5
	move.b (%a5),(%a4,%a0.l)
	addq.l #1,%a0
	move.b (%a1),(%a5)
	jra .L76
.L103:
	clr.l %d1
	lea (%a0,%d2.l),%a3
.L81:
	mov3q.l #5,%d4
	cmp.l %d1,%d4
	jcs .L79
.L105:
	lea (%a2,%d1.l),%a4
	mov3q.l #5,%d4
	move.l %d2,%a1
	add.l %d1,%a1
	move.b (%a4),42(%a0,%a1.l)
	addq.l #1,%d1
	cmp.l %d1,%d4
	jcc .L105
.L79:
	move.l %d1,%d6
	mov3q.l #6,%d7
	remu.l %d7,%d4:%d6
	lea (%a2,%d1.l),%a4
	addq.l #1,%d1
	lea (%a3,%d4.l),%a1
	moveq #12,%d4
	move.b (%a4),474(%a1)
	cmp.l %d1,%d4
	jne .L81
	addq.l #1,%d5
	lea (30,%a0),%a0
	lea (12,%a2),%a2
	cmp.l #246,%a0
	jne .L82
	jra .L106
	.size	fm_validate_part, .-fm_validate_part
	.section	.data,"aw"
	.type	fm_clean, @object
	.size	fm_clean, 1
fm_clean:
	.zero	1
	.type	fm_seen, @object
	.size	fm_seen, 1
fm_seen:
	.zero	1
	.type	fm_sweep, @object
	.size	fm_sweep, 1
fm_sweep:
	.zero	1
	.type	fm_picked, @object
	.size	fm_picked, 1
fm_picked:
	.zero	1
	.globl	fm_defaults
	.section	.rodata
	.type	fm_defaults, @object
	.size	fm_defaults, 12
fm_defaults:
	.string	"@\f @"
	.string	"("
	.base64	"AAAAAAA="
	.ident	"GCC: (GNU) 16.2.0"
