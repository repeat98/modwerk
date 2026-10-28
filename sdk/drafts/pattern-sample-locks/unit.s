#NO_APP
	.file	"translation.c"
	.text
#APP
	.globl psl_stock_sample_write
psl_stock_sample_write:
	lea -32(%sp),%sp
	movem.l %d2-%d7/%a2-%a3,(%sp)
	jmp 0x40040ee8

	.globl psl_stock_trig_paste
psl_stock_trig_paste:
	lea -92(%sp),%sp
	movem.l %d2-%d7/%a2-%a6,(%sp)
	jmp 0x4002c8a4
.globl psl_track_paste_entry
psl_track_paste_entry:
	movem.l (%sp),%d2-%d7/%a2-%a6
	lea 68(%sp),%sp
	jmp psl_track_paste
.globl psl_stock_track_paste
psl_stock_track_paste:
	lea -68(%sp),%sp
	movem.l %d2-%d7/%a2-%a6,(%sp)
	move.l 72(%sp),%a3
	move.l 80(%sp),%d5
	jmp 0x4002b664
.globl psl_stock_pattern_paste
psl_stock_pattern_paste:
	lea -16(%sp),%sp
	movem.l %d2-%d4/%a2,(%sp)
	jmp 0x4002b9b8
.globl psl_stock_undo
psl_stock_undo:
	lea -16(%sp),%sp
	movem.l %d2-%d4/%a2,(%sp)
	jmp 0x4002b3bc
.globl psl_stock_track_clear
psl_stock_track_clear:
	lea -60(%sp),%sp
	movem.l %d2-%d7/%a2-%a6,(%sp)
	jmp 0x40039dfc
.globl psl_stock_banks_load
psl_stock_banks_load:
	lea -328(%sp),%sp
	movem.l %d2-%d7/%a2-%a6,(%sp)
	jmp 0x400905dc

	.globl psl_stock_bank_read
psl_stock_bank_read:
	link.w %a6,#-60
	movem.l %d2-%d7/%a2-%a5,(%sp)
	jmp 0x4008ded8

#NO_APP
	.align	2
	.type	nv_crc_byte, @function
nv_crc_byte:
	move.l %d2,-(%sp)
	moveq #15,%d2
	mvz.b 15(%sp),%d1
	move.l 8(%sp),%d0
	lea nv_crc_nibble,%a0
	eor.l %d0,%d1
	move.l %d1,%d0
	lsr.l #4,%d0
	and.l %d2,%d1
	move.l (%sp)+,%d2
	move.l (%a0,%d1.l*4),%d1
	eor.l %d1,%d0
	moveq #15,%d1
	and.l %d0,%d1
	lsr.l #4,%d0
	move.l (%a0,%d1.l*4),%d1
	eor.l %d1,%d0
	rts
	.size	nv_crc_byte, .-nv_crc_byte
	.align	2
	.type	nv_get32, @function
nv_get32:
	move.l %d2,-(%sp)
	moveq #24,%d2
	move.l 8(%sp),%a1
	move.b (%a1),%d1
	move.b 1(%a1),%d0
	lsl.l %d2,%d1
	move.w %d0,%a0
	move.b 2(%a1),%d0
	move.w %a0,%d2
	mvz.b %d0,%d0
	lsl.l #8,%d0
	mvz.b %d2,%d2
	swap %d2
	clr.w %d2
	or.l %d2,%d1
	mvz.b 3(%a1),%d2
	or.l %d2,%d1
	move.l (%sp)+,%d2
	or.l %d1,%d0
	rts
	.size	nv_get32, .-nv_get32
	.align	2
	.type	nv_header_crc, @function
nv_header_crc:
	move.l %a2,-(%sp)
	moveq #-1,%d0
	move.l %d2,-(%sp)
	clr.l %d2
	lea nv_crc_byte,%a2
.L4:
	move.l 12(%sp),%a0
	mvz.b (%a0,%d2.l),%d1
	addq.l #1,%d2
	move.l %d1,-(%sp)
	move.l %d0,-(%sp)
	jsr (%a2)
	addq.l #8,%sp
	cmp.l #520,%d2
	jne .L4
	move.l (%sp)+,%d2
	not.l %d0
	move.l (%sp)+,%a2
	rts
	.size	nv_header_crc, .-nv_header_crc
	.align	2
	.type	nv_entry_key, @function
nv_entry_key:
	move.l %d2,-(%sp)
	move.l 12(%sp),%d1
	add.l #64,%d1
	mvz.w %d1,%d1
	move.l 8(%sp),%a0
	lsl.l #4,%d1
	lea (%a0,%d1.l),%a1
	move.b (%a1),%d0
	mvz.b 1(%a1),%d2
	mvz.b %d0,%d0
	lsl.l #8,%d0
	or.l %d2,%d0
	cmp.l #2047,%d0
	jhi .L8
	lea 2(%a0,%d1.l),%a0
	move.b (%a0),%d1
	mvz.b 1(%a0),%d2
	mvz.b %d1,%d1
	lsl.l #8,%d1
	or.l %d2,%d1
	eor.l %d0,%d1
	cmp.l #65535,%d1
	jeq .L6
.L8:
	move.l #65535,%d0
.L6:
	move.l (%sp)+,%d2
	rts
	.size	nv_entry_key, .-nv_entry_key
	.align	2
	.type	nv_cache, @function
nv_cache:
	lea (-20,%sp),%sp
	movem.l #7180,(%sp)
	move.l 24(%sp),%a2
	pea 520(%a2)
	jsr nv_get32
	addq.l #4,%sp
	move.l %d0,%d3
	cmp.l nv_index_store.l,%a2
	jne .L13
	cmp.l nv_index_identity.l,%d0
	jeq .L12
.L13:
	lea nv_index,%a0
	move.l #nv_index+4096,%d0
	move.l %a0,%a3
.L15:
	move.w #-1,(%a0)+
	cmp.l %d0,%a0
	jne .L15
	clr.l %d2
	lea nv_entry_key,%a4
.L18:
	move.l %d2,-(%sp)
	move.l %a2,-(%sp)
	jsr (%a4)
	addq.l #8,%sp
	cmp.l #65535,%d0
	jeq .L16
	mvz.w (%a3,%d0.l*2),%d1
	cmp.l #65535,%d1
	jeq .L19
	move.l #65534,%d1
.L17:
	move.w %d1,(%a3,%d0.l*2)
.L16:
	addq.l #1,%d2
	cmp.l #704,%d2
	jne .L18
	move.l %a2,nv_index_store
	move.l %d3,nv_index_identity
.L12:
	movem.l (%sp),#7180
	lea (20,%sp),%sp
	rts
.L19:
	move.l %d2,%d1
	jra .L17
	.size	nv_cache, .-nv_cache
	.align	2
	.type	nv_find, @function
nv_find:
	move.l %d2,-(%sp)
	move.l 8(%sp),-(%sp)
	jsr nv_cache
	move.l 16(%sp),%d0
	addq.l #4,%sp
	lea nv_index,%a0
	mvz.w (%a0,%d0.l*2),%d2
	cmp.l #703,%d2
	jhi .L27
	move.l %d2,-(%sp)
	move.l 12(%sp),-(%sp)
	jsr nv_entry_key
	addq.l #8,%sp
	cmp.l 12(%sp),%d0
	jeq .L25
.L27:
	move.l #65535,%d2
.L25:
	move.l %d2,%d0
	move.l (%sp)+,%d2
	rts
	.size	nv_find, .-nv_find
	.align	2
	.type	nv_record_crc, @function
nv_record_crc:
	lea (-20,%sp),%sp
	moveq #-1,%d0
	movem.l #7180,(%sp)
	move.l 32(%sp),%a2
	move.l 24(%sp),%d2
	move.l %d2,%a4
	move.l %d2,%d3
	add.l #524,%d3
	lea (520,%a4),%a4
	lea nv_crc_byte,%a3
.L29:
	mvz.b (%a4)+,%d1
	move.l %d1,-(%sp)
	move.l %d0,-(%sp)
	jsr (%a3)
	addq.l #8,%sp
	cmp.l %a4,%d3
	jne .L29
	mvz.w 30(%sp),%d1
	sub.l %a4,%a4
	lsl.l #4,%d1
	add.l %d1,%d2
	add.l #1024,%d2
.L30:
	mvz.b (%a4,%d2.l),%d1
	addq.l #1,%a4
	move.l %d1,-(%sp)
	move.l %d0,-(%sp)
	jsr (%a3)
	addq.l #8,%sp
	moveq #12,%d1
	cmp.l %a4,%d1
	jne .L30
	clr.l %d2
.L31:
	mvz.b (%a2,%d2.l),%d1
	addq.l #1,%d2
	move.l %d1,-(%sp)
	move.l %d0,-(%sp)
	jsr (%a3)
	addq.l #8,%sp
	moveq #8,%d1
	cmp.l %d2,%d1
	jne .L31
	lea (120,%a2),%a4
	lea (2168,%a2),%a2
.L32:
	mvz.b (%a4),%d1
	lea (32,%a4),%a4
	move.l %d1,-(%sp)
	move.l %d0,-(%sp)
	jsr (%a3)
	addq.l #8,%sp
	cmp.l %a2,%a4
	jne .L32
	movem.l (%sp),#7180
	not.l %d0
	lea (20,%sp),%sp
	rts
	.size	nv_record_crc, .-nv_record_crc
	.align	2
	.type	nv_boot_crc, @function
nv_boot_crc:
	move.l %a2,-(%sp)
	moveq #-1,%d0
	move.l %d2,-(%sp)
	moveq #24,%d2
	lea nv_crc_byte,%a2
.L38:
	move.l 12(%sp),%d1
	lsr.l %d2,%d1
	subq.l #8,%d2
	mvz.b %d1,%d1
	move.l %d1,-(%sp)
	move.l %d0,-(%sp)
	jsr (%a2)
	addq.l #8,%sp
	moveq #-8,%d1
	cmp.l %d2,%d1
	jne .L38
	moveq #24,%d2
.L39:
	move.l 16(%sp),%d1
	lsr.l %d2,%d1
	subq.l #8,%d2
	mvz.b %d1,%d1
	move.l %d1,-(%sp)
	move.l %d0,-(%sp)
	jsr (%a2)
	addq.l #8,%sp
	moveq #-8,%d1
	cmp.l %d2,%d1
	jne .L39
	move.l (%sp)+,%d2
	not.l %d0
	move.l (%sp)+,%a2
	rts
	.size	nv_boot_crc, .-nv_boot_crc
	.align	2
	.type	close_view, @function
close_view:
	clr.b %d0
	clr.l phase
	clr.l encoder_residual
	move.b %d0,plan+10
	moveq #1,%d0
	move.l %d0,1187497772
	rts
	.size	close_view, .-close_view
	.align	2
	.type	text, @function
text:
	move.l 4(%sp),%a0
	move.l 8(%sp),%a1
.L44:
	move.b (%a1),%d0
	jne .L45
	clr.b (%a0)
	rts
.L45:
	move.b %d0,(%a0)+
	addq.l #1,%a1
	jra .L44
	.size	text, .-text
	.align	2
	.type	project_identity, @function
project_identity:
	move.l %a2,-(%sp)
	move.l %d2,-(%sp)
	clr.l %d1
	sub.l %a0,%a0
	lea identity,%a1
.L48:
	tst.l %a0
	jne .L53
	move.l %d1,%d0
	add.l #269452416,%d0
	move.l %d0,%a2
	move.b (%a2),%d0
.L47:
	move.b %d0,(%a1,%d1.l)
	seq %d0
	move.l %a0,%d2
	addq.l #1,%d1
	mvs.b %d0,%d0
	neg.l %d0
	or.l %d0,%d2
	move.l %d2,%a0
	cmp.l #256,%d1
	jne .L48
	tst.l %d2
	jne .L54
.L52:
	clr.l %d0
.L46:
	move.l (%sp)+,%d2
	move.l (%sp)+,%a2
	rts
.L53:
	clr.b %d0
	jra .L47
.L54:
	clr.l %d1
	sub.l %a0,%a0
	lea identity+256,%a1
.L49:
	tst.l %a0
	jne .L55
	move.l %d1,%d0
	add.l #269452152,%d0
	move.l %d0,%a2
	move.b (%a2),%d0
.L51:
	move.b %d0,(%a1,%d1.l)
	seq %d0
	move.l %a0,%d2
	addq.l #1,%d1
	mvs.b %d0,%d0
	neg.l %d0
	or.l %d0,%d2
	move.l %d2,%a0
	cmp.l #256,%d1
	jne .L49
	tst.l %d2
	jeq .L52
	tst.b identity.l
	jeq .L52
	tst.b identity+256.l
	sne %d0
	mvs.b %d0,%d0
	neg.l %d0
	jra .L46
.L55:
	clr.b %d0
	jra .L51
	.size	project_identity, .-project_identity
	.align	2
	.type	bank_valid, @function
bank_valid:
	move.l %d2,-(%sp)
	move.l 8(%sp),%d1
	add.l #-1074668000,%d1
	cmp.l #9535680,%d1
	jhi .L63
	move.l #635712,%d2
	remu.l %d2,%d0:%d1
	tst.l %d0
	seq %d0
	mvs.b %d0,%d0
	neg.l %d0
.L61:
	move.l (%sp)+,%d2
	rts
.L63:
	clr.l %d0
	jra .L61
	.size	bank_valid, .-bank_valid
	.align	2
	.type	psl_write_batch, @function
psl_write_batch:
	subq.l #4,%sp
	move.l %d2,-(%sp)
	move.l 12(%sp),%d1
#APP
| 138 "sdk/drafts/pattern-sample-locks/native.c" 1
	move.w %sr,%d2
	move.w #0x2700,%sr
| 0 "" 2
#NO_APP
	move.l -66600948,%d0
	move.l %d0,4(%sp)
	moveq #10,%d0
	muls.l %d1,%d0
	move.l %d0,%a0
	add.l #edits,%a0
.L65:
	cmp.l 16(%sp),%d1
	jcs .L67
	move.l -66600948,%d0
	sub.l 4(%sp),%d0
#APP
| 143 "sdk/drafts/pattern-sample-locks/native.c" 1
	move.w %d2,%sr
| 0 "" 2
#NO_APP
	addq.l #1,psl_guard_spans
	cmp.l psl_guard_max.l,%d0
	jls .L64
	move.l %d0,psl_guard_max
.L64:
	move.l (%sp)+,%d2
	addq.l #4,%sp
	rts
.L67:
	move.b 9(%a0),%d0
	move.l (%a0),%a1
	move.b %d0,(%a1)
	move.l 4(%a0),%a1
	tst.l %a1
	jeq .L66
	move.b %d0,(%a1)
.L66:
	addq.l #1,%d1
	lea (10,%a0),%a0
	jra .L65
	.size	psl_write_batch, .-psl_write_batch
	.align	2
	.type	psl_foreign_end, @function
psl_foreign_end:
#APP
| 254 "sdk/drafts/pattern-sample-locks/native.c" 1
	move.w %sr,%d0
	move.w #0x2700,%sr
| 0 "" 2
#NO_APP
	addq.l #1,origin_epoch
	subq.l #1,writer_depth
#APP
| 256 "sdk/drafts/pattern-sample-locks/native.c" 1
	move.w %d0,%sr
| 0 "" 2
#NO_APP
	rts
	.size	psl_foreign_end, .-psl_foreign_end
	.align	2
	.type	source_valid, @function
source_valid:
	move.l %d3,-(%sp)
	move.l %d2,-(%sp)
	move.l 12(%sp),%a0
	tst.l %a0
	jne .L74
.L76:
	clr.l %d0
.L73:
	move.l (%sp)+,%d2
	move.l (%sp)+,%d3
	rts
.L74:
	tst.l (%a0)
	jeq .L76
	mvz.b 4(%a0),%d0
	lsr.l #4,%d0
	jne .L76
	mvz.b 5(%a0),%d0
	lsr.l #2,%d0
	jne .L76
	mvz.b 6(%a0),%d2
	clr.l %d0
.L79:
	btst %d0,%d2
	jeq .L77
	tst.l 24(%a0,%d0.l*4)
	jeq .L76
	move.b 7(%a0,%d0.l),%d1
	move.w %d1,%a1
	mvz.b %d1,%d1
	lsr.l #1,%d1
	jne .L76
	move.w %a1,%d3
	mvz.b 15(%a0,%d0.l),%d1
	tst.b %d3
	jeq .L80
	move.w #135,%a1
.L78:
	cmp.l %d1,%a1
	jcc .L77
	cmp.l #255,%d1
	jne .L76
.L77:
	addq.l #1,%d0
	moveq #8,%d1
	cmp.l %d0,%d1
	jne .L79
	moveq #1,%d0
	jra .L73
.L80:
	move.w #127,%a1
	jra .L78
	.size	source_valid, .-source_valid
	.align	2
	.type	pixel, @function
pixel:
	move.l %d2,-(%sp)
	moveq #127,%d2
	move.l 12(%sp),%d0
	move.l 16(%sp),%d1
	cmp.l %d0,%d2
	jcs .L85
	moveq #63,%d2
	cmp.l %d1,%d2
	jcs .L85
	lsl.l #3,%d0
	move.l %d1,%d2
	lsr.l #3,%d2
	move.l 8(%sp),%a0
	sub.l %d2,%d0
	lea 7(%a0,%d0.l),%a0
	moveq #7,%d0
	and.l %d0,%d1
	moveq #1,%d0
	lsl.l %d1,%d0
	move.b (%a0),%d1
	tst.l 20(%sp)
	jeq .L87
	eor.l %d1,%d0
.L88:
	move.b %d0,(%a0)
.L85:
	move.l (%sp)+,%d2
	rts
.L87:
	or.l %d1,%d0
	jra .L88
	.size	pixel, .-pixel
	.align	2
	.globl	psl_prepare
	.type	psl_prepare, @function
psl_prepare:
	lea (-56,%sp),%sp
	movem.l #31996,(%sp)
	move.l 60(%sp),%a2
	move.l 64(%sp),%a3
	move.l 68(%sp),%d2
	tst.l %a2
	jeq .L106
	clr.b %d0
	move.b %d0,10(%a2)
	move.l %a3,-(%sp)
	jsr source_valid
	addq.l #4,%sp
	tst.l %d0
	jeq .L106
	cmp.l #255,%d2
	jhi .L89
	move.b 6(%a3),%d3
	mvz.b %d3,%d1
	not.l %d1
	and.l %d2,%d1
	tst.l %d1
	jne .L89
	move.l 72(%sp),%d1
	or.l 76(%sp),%d1
	lsr.l #1,%d1
	jne .L89
	tst.l %d2
	jeq .L107
	clr.l %d1
.L94:
	btst %d1,%d2
	jeq .L93
	tst.l 72(%sp)
	jne .L93
	mvz.b 15(%a3,%d1.l),%d4
	cmp.l #255,%d4
	jeq .L89
.L93:
	addq.l #1,%d1
	moveq #8,%d7
	cmp.l %d1,%d7
	jne .L94
	move.l (%a3),(%a2)
	move.b 4(%a3),4(%a2)
	lea (7,%a3),%a0
	sub.l %a1,%a1
	move.l %a0,46(%sp)
	move.l %a2,%d4
	add.l #91,%d4
	lea (11,%a2),%a5
	lea (24,%a3),%a0
	move.b 5(%a3),5(%a2)
	move.b %d3,6(%a2)
	move.b %d2,7(%a2)
	move.b 75(%sp),8(%a2)
	move.b 79(%sp),9(%a2)
	clr.l 1632(%a2)
	move.l 88(%a3),604(%a2)
.L104:
	move.l 46(%sp),%a3
	move.l %a1,%d0
	addq.l #1,46(%sp)
	move.b (%a3)+,(%a5)+
	move.b 7(%a3),%d6
	move.b %d6,7(%a5)
	btst %d0,%d2
	jeq .L95
	mvz.w %a1,%d0
	move.l (%a0),%d5
	lsl.l #3,%d0
	lea (%a2,%d0.l),%a4
	clr.l %d0
.L96:
	move.l %d5,%a3
	moveq #8,%d1
	lea (%a3,%d0.l),%a6
	move.b (%a6),27(%a4,%d0.l)
	addq.l #1,%d0
	cmp.l %d0,%d1
	jne .L96
	move.l 32(%a0),%a3
	move.l %d5,%a6
	lea (120,%a6),%a6
	clr.l %d1
	move.l %a3,52(%sp)
	move.l %d4,%a3
.L103:
	move.l %d1,%d7
	lsr.l #3,%d7
	moveq #7,%d0
	move.l %d5,%a4
	move.b (%a6),%d3
	sub.l %d7,%d0
	move.b (%a4,%d0.l),%d0
	move.b %d0,51(%sp)
	tst.l 52(%sp)
	jeq .L108
	move.l 52(%sp),%a4
	moveq #1,%d7
	move.b (%a4,%d1.l),%d0
	eor.l %d7,%d0
	tst.b %d0
	seq %d0
	mvs.b %d0,%d0
	neg.l %d0
.L97:
	move.b %d0,(%a3)+
	moveq #1,%d7
	cmp.l 72(%sp),%d7
	jne .L98
	or.l 76(%sp),%d0
	jne .L109
	mvz.b %d3,%d0
	cmp.l #255,%d0
	jeq .L100
.L129:
	move.w 1634(%a2),%d0
	addq.l #1,%d0
	move.w %d0,1634(%a2)
.L100:
	move.b %d3,%d0
	jra .L99
.L108:
	clr.l %d0
	jra .L97
.L98:
	moveq #7,%d7
	and.l %d1,%d7
	mvz.b 51(%sp),%d0
	btst %d7,%d0
	jeq .L100
	mvz.b %d3,%d0
	cmp.l #255,%d0
	jne .L101
.L102:
	move.b %d6,%d0
.L99:
	move.b %d0,1028(%a3)
	eor.l %d3,%d0
	move.b %d3,516(%a3)
	addq.l #1,%d1
	lea (32,%a6),%a6
	tst.b %d0
	sne %d0
	move.w 1632(%a2),%d3
	ext.w %d0
	sub.l %d0,%d3
	move.w %d3,1632(%a2)
	moveq #64,%d0
	cmp.l %d1,%d0
	jne .L103
.L95:
	addq.l #1,%a1
	add.l #64,%d4
	addq.l #4,%a0
	moveq #8,%d1
	cmp.l %a1,%d1
	jne .L104
	moveq #1,%d4
	clr.l %d0
	move.b %d4,10(%a2)
.L89:
	movem.l (%sp),#31996
	lea (56,%sp),%sp
	rts
.L101:
	tst.l 76(%sp)
	jne .L102
	jra .L129
.L109:
	st %d0
	jra .L99
.L106:
	moveq #1,%d0
	jra .L89
.L107:
	moveq #2,%d0
	jra .L89
	.size	psl_prepare, .-psl_prepare
	.align	2
	.globl	psl_validate
	.type	psl_validate, @function
psl_validate:
	lea (-36,%sp),%sp
	movem.l #31804,(%sp)
	move.l 40(%sp),%a2
	move.l 44(%sp),%a3
	tst.l %a2
	jne .L131
.L133:
	moveq #1,%d0
.L130:
	movem.l (%sp),#31804
	lea (36,%sp),%sp
	rts
.L131:
	tst.b 10(%a2)
	jeq .L133
	move.l %a3,-(%sp)
	jsr source_valid
	addq.l #4,%sp
	tst.l %d0
	jeq .L133
	move.l (%a2),%d0
	cmp.l (%a3),%d0
	jeq .L134
.L135:
	moveq #3,%d0
	jra .L130
.L134:
	mvz.b 4(%a3),%d1
	mvz.b 4(%a2),%d0
	cmp.l %d1,%d0
	jne .L135
	mvz.b 5(%a3),%d1
	mvz.b 5(%a2),%d0
	cmp.l %d1,%d0
	jne .L135
	mvz.b 6(%a3),%d1
	mvz.b 6(%a2),%d0
	cmp.l %d1,%d0
	jne .L135
	move.l 604(%a2),%d4
	cmp.l 88(%a3),%d4
	jne .L135
	mvz.b 7(%a2),%d3
	move.l %a2,%d2
	clr.l %d1
	add.l #91,%d2
	lea (24,%a3),%a4
.L140:
	btst %d1,%d3
	jeq .L136
	mvz.b 7(%a3,%d1.l),%d4
	mvz.b 11(%a2,%d1.l),%d0
	cmp.l %d4,%d0
	jne .L135
	mvz.b 15(%a3,%d1.l),%d4
	mvz.b 19(%a2,%d1.l),%d0
	cmp.l %d4,%d0
	jne .L135
	mvz.w %d1,%d0
	move.l (%a4),%a0
	lsl.l #3,%d0
	lea (%a2,%d0.l),%a1
	clr.l %d0
.L137:
	mvz.b (%a0,%d0.l),%d5
	mvz.b 27(%a1,%d0.l),%d4
	cmp.l %d5,%d4
	jne .L135
	addq.l #1,%d0
	moveq #8,%d4
	cmp.l %d0,%d4
	jne .L137
	move.l 32(%a4),%a5
	move.l %d2,%a6
	lea (120,%a0),%a0
	sub.l %a1,%a1
.L139:
	tst.l %a5
	jeq .L141
	move.b (%a5,%a1.l),%d0
	moveq #1,%d4
	eor.l %d4,%d0
	tst.b %d0
	seq %d0
	mvs.b %d0,%d0
	neg.l %d0
.L138:
	mvz.b (%a0),%d5
	mvz.b 517(%a6),%d4
	cmp.l %d5,%d4
	jne .L135
	mvz.b (%a6),%d4
	cmp.l %d0,%d4
	jne .L135
	addq.l #1,%a6
	addq.l #1,%a1
	lea (32,%a0),%a0
	moveq #64,%d0
	cmp.l %a1,%d0
	jne .L139
.L136:
	addq.l #1,%d1
	add.l #64,%d2
	addq.l #4,%a4
	moveq #8,%d4
	cmp.l %d1,%d4
	jne .L140
	clr.l %d0
	jra .L130
.L141:
	clr.l %d0
	jra .L138
	.size	psl_validate, .-psl_validate
	.align	2
	.globl	psl_apply
	.type	psl_apply, @function
psl_apply:
	lea (-56,%sp),%sp
	movem.l #31996,(%sp)
	move.l 60(%sp),%a2
	move.l 68(%sp),%a3
	move.l 72(%sp),%a4
	move.l 64(%sp),-(%sp)
	move.l %a2,-(%sp)
	jsr psl_validate
	addq.l #8,%sp
	tst.l %d0
	jne .L151
	tst.l %a3
	jeq .L154
	tst.l %a4
	jeq .L154
	clr.l %d1
.L155:
	move.l (%a3,%d1.l),%a1
	tst.l %a1
	jeq .L154
	move.l (%a4,%d1.l),%a0
	tst.l %a0
	jeq .L154
	cmp.l #-2331,%a1
	jhi .L154
	cmp.l #-2331,%a0
	jhi .L154
	addq.l #4,%d1
	moveq #32,%d2
	cmp.l %d1,%d2
	jne .L155
	move.l %a2,%d4
	add.l #608,%d4
	move.l %d4,%d5
	clr.l %d2
	sub.l %a1,%a1
.L162:
	move.l (%a3,%d2.l),%d3
	tst.l %d3
	jeq .L154
	move.l (%a4,%d2.l),%d1
	tst.l %d1
	jeq .L154
	move.l 64(%sp),%a0
	cmp.l 24(%a0,%d2.l),%d3
	jne .L154
	move.l %d3,%a5
	move.l %d1,%a6
	lea (2330,%a5),%a5
	sub.l %a0,%a0
	lea (2330,%a6),%a6
	move.l %a5,44(%sp)
	move.l %a6,52(%sp)
.L159:
	move.l (%a4,%a0.l*4),%d6
	move.l %d6,%d7
	add.l #2330,%d7
	cmp.l %d3,%d7
	jls .L156
	cmp.l 44(%sp),%d6
	jcs .L154
.L156:
	cmp.l %a1,%a0
	jeq .L157
	move.l (%a3,%a0.l*4),%a5
	lea (2330,%a5),%a6
	cmp.l %d3,%a6
	jls .L158
	cmp.l 44(%sp),%a5
	jcs .L154
.L158:
	cmp.l %d1,%d7
	jls .L157
	cmp.l 52(%sp),%d6
	jcs .L154
.L157:
	addq.l #1,%a0
	moveq #8,%d6
	cmp.l %a0,%d6
	jne .L159
	mvz.b 7(%a2),%d3
	move.l %a1,%d6
	btst %d6,%d3
	jeq .L160
	move.l %d1,%a0
	move.l %d5,%a5
	lea (120,%a0),%a0
	add.l #2168,%d1
.L161:
	mvz.b (%a0),%d6
	mvz.b (%a5),%d3
	cmp.l %d6,%d3
	jne .L168
	addq.l #1,%a5
	lea (32,%a0),%a0
	cmp.l %a0,%d1
	jne .L161
.L160:
	addq.l #1,%a1
	add.l #64,%d5
	addq.l #4,%d2
	moveq #8,%d1
	cmp.l %a1,%d1
	jne .L162
	clr.l %d1
.L166:
	mvz.b 7(%a2),%d2
	btst %d1,%d2
	jeq .L163
	move.w #120,%a1
	move.l %d4,%a5
.L165:
	move.b (%a5)+,%d3
	move.b 511(%a5),%d2
	mvz.b %d3,%d3
	mvz.b %d2,%d5
	cmp.l %d3,%d5
	jeq .L164
	move.l (%a3,%d1.l*4),%a0
	move.b %d2,(%a0,%a1.l)
	move.l (%a4,%d1.l*4),%a0
	move.b %d2,(%a0,%a1.l)
.L164:
	lea (32,%a1),%a1
	cmp.l #2168,%a1
	jne .L165
.L163:
	addq.l #1,%d1
	add.l #64,%d4
	moveq #8,%d2
	cmp.l %d1,%d2
	jne .L166
	clr.b %d6
	move.b %d6,10(%a2)
.L151:
	movem.l (%sp),#31996
	lea (56,%sp),%sp
	rts
.L154:
	moveq #1,%d0
	jra .L151
.L168:
	moveq #3,%d0
	jra .L151
	.size	psl_apply, .-psl_apply
	.align	2
	.globl	psl_nv_matches
	.type	psl_nv_matches, @function
psl_nv_matches:
	move.l %a2,-(%sp)
	move.l %d2,-(%sp)
	move.l 12(%sp),%a2
	move.l 16(%sp),%a0
	tst.l %a2
	jne .L200
.L202:
	clr.l %d0
.L199:
	move.l (%sp)+,%d2
	move.l (%sp)+,%a2
	rts
.L200:
	tst.l %a0
	jeq .L202
	clr.l %d0
	lea nv_tag,%a1
.L203:
	mvz.b (%a2,%d0.l),%d2
	mvz.b (%a1,%d0.l),%d1
	cmp.l %d2,%d1
	jne .L202
	addq.l #1,%d0
	moveq #8,%d1
	cmp.l %d0,%d1
	jne .L203
	clr.l %d0
	lea (8,%a2),%a1
.L204:
	mvz.b (%a1,%d0.l),%d2
	mvz.b (%a0,%d0.l),%d1
	cmp.l %d2,%d1
	jne .L202
	addq.l #1,%d0
	cmp.l #512,%d0
	jne .L204
	pea 520(%a2)
	jsr nv_get32
	move.l %a2,-(%sp)
	move.l %d0,%d2
	jsr nv_header_crc
	addq.l #8,%sp
	cmp.l %d2,%d0
	seq %d0
	mvs.b %d0,%d0
	neg.l %d0
	jra .L199
	.size	psl_nv_matches, .-psl_nv_matches
	.align	2
	.globl	psl_nv_begin
	.type	psl_nv_begin, @function
psl_nv_begin:
	lea (-28,%sp),%sp
	movem.l #7228,(%sp)
	move.l 32(%sp),%a2
	tst.l %a2
	jne .L211
.L213:
	clr.l %d2
.L210:
	move.l %d2,%d0
	movem.l (%sp),#7228
	lea (28,%sp),%sp
	rts
.L211:
	tst.l 36(%sp)
	jeq .L213
	move.l 36(%sp),-(%sp)
	move.l %a2,-(%sp)
	jsr psl_nv_matches
	addq.l #8,%sp
	move.l %d0,%d2
	tst.l %d0
	jne .L210
	move.w #1,%a1
	moveq #1,%d3
	moveq #1,%d4
	clr.l %d1
	lea nv_tag,%a3
.L218:
	lea (%a2,%d1.l),%a4
	tst.b (%a4)
	jeq .L214
	move.b (%a4),%d0
	move.l %a1,%d5
	not.l %d0
	tst.b %d0
	seq %d0
	mvs.b %d0,%d0
	neg.l %d0
	and.l %d0,%d5
	move.l %d5,%a1
.L214:
	move.b (%a4),%d0
	move.w %d0,%a0
	move.b (%a3,%d1.l),%d0
	move.l %a0,%d5
	eor.l %d0,%d5
	tst.b %d5
	seq %d5
	mvs.b %d5,%d5
	neg.l %d5
	and.l %d5,%d4
	tst.b (%a4)
	jeq .L217
	mvz.b (%a4),%d5
	cmp.l #255,%d5
	jeq .L217
	move.b (%a4),%d5
	move.w %d5,%a0
	move.l %a0,%d5
	eor.l %d5,%d0
	tst.b %d0
	seq %d0
	mvs.b %d0,%d0
	neg.l %d0
	and.l %d0,%d3
.L217:
	addq.l #1,%d1
	moveq #8,%d0
	cmp.l %d1,%d0
	jne .L218
	mvz.b (%a2),%d0
	moveq #80,%d5
	cmp.l %d0,%d5
	jeq .L219
	tst.b (%a2)
	jne .L220
.L219:
	mvz.b 1(%a2),%d0
	moveq #83,%d5
	cmp.l %d0,%d5
	jne .L220
	mvz.b 2(%a2),%d0
	moveq #76,%d5
	cmp.l %d0,%d5
	jne .L220
	mvz.b 3(%a2),%d0
	moveq #79,%d5
	cmp.l %d0,%d5
	jne .L220
	mvz.b 4(%a2),%d0
	moveq #87,%d5
	cmp.l %d0,%d5
	jne .L220
	mvz.b 5(%a2),%d0
	moveq #78,%d5
	cmp.l %d0,%d5
	jne .L220
	mvz.b 6(%a2),%d0
	subq.l #2,%d0
	tst.l %d0
	jne .L220
	tst.b 7(%a2)
	seq %d2
	mvs.b %d2,%d2
	neg.l %d2
.L220:
	move.l %a1,%d0
	or.l %d4,%d0
	or.l %d3,%d0
	or.l %d0,%d2
	jeq .L210
	clr.b (%a2)
	clr.l nv_index_store
.L223:
	clr.b %d0
	move.b %d0,(%a2,%d1.l)
	addq.l #1,%d1
	cmp.l #12288,%d1
	jne .L223
	move.l %a2,%d0
	add.l %d1,%d0
	lea (1024,%a2),%a0
.L224:
	st %d1
	move.b #-1,(%a0)
	lea (16,%a0),%a0
	move.b %d1,-15(%a0)
	cmp.l %a0,%d0
	jne .L224
	moveq #1,%d0
.L225:
	lea (%a3,%d0.l),%a0
	moveq #8,%d1
	move.b (%a0),(%a2,%d0.l)
	addq.l #1,%d0
	cmp.l %d0,%d1
	jne .L225
	clr.l %d0
	lea (8,%a2),%a0
.L226:
	move.l 36(%sp),%a1
	lea (%a1,%d0.l),%a3
	move.b (%a3),(%a0,%d0.l)
	addq.l #1,%d0
	cmp.l #512,%d0
	jne .L226
	move.b #80,(%a2)
	moveq #24,%d3
	move.l %a2,-(%sp)
	jsr nv_header_crc
	addq.l #4,%sp
	move.l %d0,%d1
	lsr.l %d3,%d1
	move.b %d1,520(%a2)
	move.l %d0,%d1
	clr.w %d1
	swap %d1
	move.b %d1,521(%a2)
	move.l %d0,%d1
	lsr.l #8,%d1
	move.b %d1,522(%a2)
	move.b %d0,523(%a2)
	jra .L210
	.size	psl_nv_begin, .-psl_nv_begin
	.align	2
	.globl	psl_nv_reserve
	.type	psl_nv_reserve, @function
psl_nv_reserve:
	lea (-36,%sp),%sp
	movem.l #15484,(%sp)
	move.l 40(%sp),%a2
	move.l 44(%sp),%d2
	move.l 48(%sp),%d4
	tst.l %a2
	jeq .L251
	move.l %d2,%d0
	or.l %d4,%d0
	lsr.l #8,%d0
	jeq .L252
.L251:
	clr.l %d0
.L250:
	movem.l (%sp),#15484
	lea (36,%sp),%sp
	rts
.L252:
	lsl.l #3,%d2
	move.l %a2,-(%sp)
	jsr nv_cache
	addq.l #4,%sp
	clr.l %d3
	clr.l %d5
	lea nv_index,%a4
	lea nv_find,%a5
	move.l %d2,%a3
.L257:
	btst %d5,%d4
	jeq .L255
	mvz.w (%a4,%a3.l*2),%d0
	cmp.l #65534,%d0
	jeq .L251
	move.l %a3,-(%sp)
	move.l %a2,-(%sp)
	jsr (%a5)
	addq.l #8,%sp
	cmp.l #65535,%d0
	jne .L255
	addq.l #1,%d3
.L255:
	addq.l #1,%d5
	addq.l #1,%a3
	moveq #8,%d0
	cmp.l %d5,%d0
	jne .L257
	clr.l %d5
	sub.l %a3,%a3
	lea nv_entry_key,%a4
.L258:
	cmp.l %d3,%d5
	jcs .L260
.L261:
	clr.l %d5
	lea nv_find,%a3
.L266:
	btst %d5,%d4
	jeq .L262
	move.l %d2,-(%sp)
	move.l %a2,-(%sp)
	jsr (%a3)
	addq.l #8,%sp
	cmp.l #65535,%d0
	jne .L262
	clr.l %d3
	lea nv_entry_key,%a4
.L265:
	move.l %d3,-(%sp)
	move.l %a2,-(%sp)
	jsr (%a4)
	addq.l #8,%sp
	cmp.l #65535,%d0
	jne .L263
	move.l %d3,%d0
	add.l #64,%d0
	mvz.w %d0,%d0
	clr.b %d1
	sub.l %a1,%a1
	lsl.l #4,%d0
	lea 12(%a2,%d0.l),%a0
	clr.b (%a0)
	move.b %d1,1(%a0)
	move.b %d1,2(%a0)
	move.b %d1,3(%a0)
	mvz.w %d3,%d1
	lsl.l #4,%d1
	lea (%a2,%d1.l),%a0
	lea (1028,%a0),%a0
.L264:
	clr.b %d6
	moveq #8,%d1
	move.b %d6,(%a0,%a1.l)
	addq.l #1,%a1
	cmp.l %a1,%d1
	jne .L264
	move.l #65535,%d1
	eor.l %d2,%d1
	lea 2(%a2,%d0.l),%a0
	move.l %d1,%d6
	lsr.l #8,%d6
	move.b %d6,(%a0)
	move.b %d1,1(%a0)
	lea (%a2,%d0.l),%a0
	move.l %d2,%d0
	lsr.l #8,%d0
	move.b %d0,(%a0)
	move.b %d2,1(%a0)
	lea nv_index,%a0
	move.w %d3,(%a0,%d2.l*2)
.L262:
	addq.l #1,%d5
	addq.l #1,%d2
	moveq #8,%d0
	cmp.l %d5,%d0
	jne .L266
	moveq #1,%d0
	jra .L250
.L260:
	move.l %a3,-(%sp)
	move.l %a2,-(%sp)
	jsr (%a4)
	addq.l #8,%sp
	addq.l #1,%a3
	cmp.l #65535,%d0
	seq %d0
	mvs.b %d0,%d0
	sub.l %d0,%d5
	cmp.l #704,%a3
	jne .L258
	cmp.l %d5,%d3
	jhi .L251
	jra .L261
.L263:
	addq.l #1,%d3
	cmp.l #704,%d3
	jne .L265
	jra .L262
	.size	psl_nv_reserve, .-psl_nv_reserve
	.align	2
	.globl	psl_nv_read
	.type	psl_nv_read, @function
psl_nv_read:
	lea (-20,%sp),%sp
	movem.l #3100,(%sp)
	move.l 40(%sp),%a3
	move.l 24(%sp),%a2
	move.l 28(%sp),%d0
	move.l 32(%sp),%a0
	tst.l %a3
	jeq .L280
	clr.l %d1
.L282:
	clr.b %d2
	moveq #64,%d3
	move.b %d2,(%a3,%d1.l)
	addq.l #1,%d1
	cmp.l %d1,%d3
	jne .L282
	tst.l %a2
	jeq .L280
	tst.l 36(%sp)
	jeq .L280
	cmp.l #255,%d0
	jhi .L280
	moveq #7,%d1
	cmp.l %a0,%d1
	jcs .L280
	lsl.l #3,%d0
	pea (%a0,%d0.l)
	move.l %a2,-(%sp)
	jsr nv_find
	addq.l #8,%sp
	move.l %d0,%d3
	cmp.l #65535,%d0
	jeq .L280
	move.l %d0,%d2
	add.l #64,%d2
	mvz.w %d2,%d2
	lsl.l #4,%d2
	pea 12(%a2,%d2.l)
	jsr nv_get32
	addq.l #4,%sp
	move.l %d0,%d4
	tst.l %d0
	jeq .L280
	move.l 36(%sp),-(%sp)
	move.l %d3,-(%sp)
	move.l %a2,-(%sp)
	jsr nv_record_crc
	lea (12,%sp),%sp
	cmp.l %d4,%d0
	jne .L280
	addq.l #4,%d2
	clr.l %d0
.L283:
	move.l %d0,%d1
	lsr.l #3,%d1
	moveq #7,%d3
	and.l %d0,%d3
	add.l %d2,%d1
	mvz.b (%a2,%d1.l),%d1
	asr.l %d3,%d1
	moveq #1,%d3
	and.l %d3,%d1
	move.b %d1,(%a3,%d0.l)
	addq.l #1,%d0
	moveq #64,%d1
	cmp.l %d0,%d1
	jne .L283
.L280:
	movem.l (%sp),#3100
	lea (20,%sp),%sp
	rts
	.size	psl_nv_read, .-psl_nv_read
	.align	2
	.globl	psl_nv_invalidate
	.type	psl_nv_invalidate, @function
psl_nv_invalidate:
	move.l 8(%sp),%d0
	move.l 12(%sp),%a0
	tst.l 4(%sp)
	jeq .L301
	cmp.l #255,%d0
	jhi .L301
	moveq #7,%d1
	cmp.l %a0,%d1
	jcs .L301
	lsl.l #3,%d0
	pea (%a0,%d0.l)
	move.l 8(%sp),-(%sp)
	jsr nv_find
	addq.l #8,%sp
	cmp.l #65535,%d0
	jeq .L301
	mvz.w %d0,%d0
	move.l 4(%sp),%a0
	lsl.l #4,%d0
	add.l #1036,%d0
	add.l %d0,%a0
	clr.b %d0
	clr.b (%a0)
	move.b %d0,1(%a0)
	move.b %d0,2(%a0)
	move.b %d0,3(%a0)
.L301:
	rts
	.size	psl_nv_invalidate, .-psl_nv_invalidate
	.align	2
	.globl	psl_nv_publish
	.type	psl_nv_publish, @function
psl_nv_publish:
	lea (-36,%sp),%sp
	movem.l #15484,(%sp)
	move.l 40(%sp),%a3
	move.l 44(%sp),%d3
	move.l 48(%sp),%d5
	tst.l %a3
	jeq .L309
	tst.l 52(%sp)
	jeq .L309
	tst.l 56(%sp)
	jeq .L309
	cmp.l #255,%d3
	jhi .L309
	moveq #7,%d0
	cmp.l %d5,%d0
	jcs .L309
	move.l %d3,%d0
	clr.l %d4
	lsl.l #3,%d0
	move.l 52(%sp),%d2
	add.l #120,%d2
	move.l %d2,%a0
	clr.l %d1
	move.l %d0,%a2
	add.l %d5,%a2
.L312:
	move.l 56(%sp),%a1
	mvz.b (%a1,%d1.l),%d0
	subq.l #1,%d0
	tst.l %d0
	jne .L321
	move.b (%a0),%d0
	not.l %d0
	tst.b %d0
	sne %d0
	mvs.b %d0,%d0
	neg.l %d0
.L311:
	or.l %d0,%d4
	addq.l #1,%d1
	lea (32,%a0),%a0
	moveq #64,%d0
	cmp.l %d1,%d0
	jne .L312
	move.l %a2,-(%sp)
	move.l %a3,-(%sp)
	lea nv_find,%a4
	jsr (%a4)
	addq.l #8,%sp
	tst.l %d4
	jne .L313
	cmp.l #65535,%d0
	jeq .L309
	add.l #64,%d0
	mvz.w %d0,%d0
	clr.b %d1
	st %d2
	moveq #-1,%d3
	lsl.l #4,%d0
	lea 12(%a3,%d0.l),%a0
	clr.b (%a0)
	move.b %d1,1(%a0)
	move.b %d1,2(%a0)
	move.b %d1,3(%a0)
	lea (%a3,%d0.l),%a0
	move.b #-1,(%a0)
	move.b %d2,1(%a0)
	lea 2(%a3,%d0.l),%a0
	clr.b (%a0)
	move.b %d1,1(%a0)
	lea nv_index,%a0
	move.w %d3,(%a0,%a2.l*2)
.L309:
	movem.l (%sp),#15484
	lea (36,%sp),%sp
	rts
.L321:
	clr.l %d0
	jra .L311
.L313:
	cmp.l #65535,%d0
	jne .L314
	moveq #1,%d0
	lsl.l %d5,%d0
	move.l %d0,-(%sp)
	move.l %d3,-(%sp)
	move.l %a3,-(%sp)
	jsr psl_nv_reserve
	lea (12,%sp),%sp
	tst.l %d0
	jeq .L309
	move.l %a2,-(%sp)
	move.l %a3,-(%sp)
	jsr (%a4)
	addq.l #8,%sp
.L314:
	move.l %d0,%d1
	sub.l %a0,%a0
	lea (1028,%a3),%a1
	lsl.l #4,%d1
	clr.b %d5
	move.l %d1,%a2
	mvz.w %d0,%d1
	lea (1036,%a2),%a2
	add.l %a3,%a2
	clr.b (%a2)
	move.b %d5,1(%a2)
	move.b %d5,2(%a2)
	lsl.l #4,%d1
	move.b %d5,3(%a2)
	add.l %d1,%a1
.L315:
	clr.b %d4
	move.l 56(%sp),%a5
	move.l %d2,%a4
	clr.l %d1
	add.l %a0,%a5
.L319:
	mvz.b (%a5,%d1.l),%d3
	moveq #1,%d6
	cmp.l %d3,%d6
	jne .L318
	mvz.b (%a4),%d5
	cmp.l #255,%d5
	jeq .L318
	lsl.l %d1,%d3
	or.l %d3,%d4
.L318:
	addq.l #1,%d1
	lea (32,%a4),%a4
	moveq #8,%d3
	cmp.l %d1,%d3
	jne .L319
	move.b %d4,(%a1)+
	add.l #256,%d2
	addq.l #8,%a0
	moveq #64,%d5
	cmp.l %a0,%d5
	jne .L315
	move.l 52(%sp),-(%sp)
	move.l %d0,-(%sp)
	moveq #24,%d6
	move.l %a3,-(%sp)
	jsr nv_record_crc
	lea (12,%sp),%sp
	move.l %d0,%d1
	lsr.l %d6,%d1
	move.b %d1,(%a2)
	move.l %d0,%d1
	clr.w %d1
	swap %d1
	move.b %d1,1(%a2)
	move.l %d0,%d1
	lsr.l #8,%d1
	move.b %d1,2(%a2)
	move.b %d0,3(%a2)
	jra .L309
	.size	psl_nv_publish, .-psl_nv_publish
	.align	2
	.globl	psl_nv_boot_matches
	.type	psl_nv_boot_matches, @function
psl_nv_boot_matches:
	lea (-16,%sp),%sp
	movem.l #3084,(%sp)
	move.l 20(%sp),%a2
	tst.l %a2
	jne .L340
.L342:
	clr.l %d0
.L339:
	movem.l (%sp),#3084
	lea (16,%sp),%sp
	rts
.L340:
	tst.l 28(%sp)
	jeq .L342
	pea 524(%a2)
	lea nv_get32,%a3
	jsr (%a3)
	addq.l #4,%sp
	move.l %d0,%d2
	cmp.l 24(%sp),%d0
	jne .L342
	pea 528(%a2)
	jsr (%a3)
	addq.l #4,%sp
	move.l %d0,%d3
	cmp.l 28(%sp),%d0
	jne .L342
	pea 532(%a2)
	jsr (%a3)
	move.l %d3,-(%sp)
	move.l %d2,-(%sp)
	move.l %d0,%a2
	jsr nv_boot_crc
	lea (12,%sp),%sp
	cmp.l %a2,%d0
	seq %d0
	mvs.b %d0,%d0
	neg.l %d0
	jra .L339
	.size	psl_nv_boot_matches, .-psl_nv_boot_matches
	.align	2
	.globl	psl_nv_forget
	.type	psl_nv_forget, @function
psl_nv_forget:
	move.l 4(%sp),%a0
	tst.l %a0
	jeq .L346
	mvz.b (%a0),%d0
	moveq #80,%d1
	cmp.l %d0,%d1
	jeq .L348
	tst.b (%a0)
	jne .L349
.L348:
	mvz.b 1(%a0),%d0
	moveq #83,%d1
	cmp.l %d0,%d1
	jne .L349
	mvz.b 2(%a0),%d0
	moveq #76,%d1
	cmp.l %d0,%d1
	jne .L349
	mvz.b 3(%a0),%d0
	moveq #79,%d1
	cmp.l %d0,%d1
	jne .L349
	mvz.b 4(%a0),%d0
	moveq #87,%d1
	cmp.l %d0,%d1
	jne .L349
	mvz.b 5(%a0),%d0
	moveq #78,%d1
	cmp.l %d0,%d1
	jne .L349
	mvz.b 6(%a0),%d0
	subq.l #2,%d0
	tst.l %d0
	jeq .L350
	mvz.b 6(%a0),%d0
	subq.l #3,%d0
	tst.l %d0
	jne .L349
.L350:
	tst.b 7(%a0)
	jne .L349
	clr.b (%a0)
.L349:
	clr.l nv_index_store
.L346:
	rts
	.size	psl_nv_forget, .-psl_nv_forget
	.align	2
	.globl	psl_nv_boot
	.type	psl_nv_boot, @function
psl_nv_boot:
	lea (-12,%sp),%sp
	movem.l #1036,(%sp)
	move.l 16(%sp),%a2
	move.l 20(%sp),%d3
	move.l 24(%sp),%d2
	tst.l %a2
	jeq .L361
	tst.l %d2
	jeq .L361
	clr.l %d0
	lea nv_tag,%a0
.L364:
	mvz.b (%a2,%d0.l),%d1
	move.l %d1,%a1
	mvz.b (%a0,%d0.l),%d1
	cmp.l %a1,%d1
	jeq .L362
.L366:
	move.l %a2,-(%sp)
	jsr psl_nv_forget
	addq.l #4,%sp
.L361:
	clr.l %d0
.L360:
	movem.l (%sp),#1036
	lea (12,%sp),%sp
	rts
.L362:
	addq.l #1,%d0
	moveq #8,%d1
	cmp.l %d0,%d1
	jne .L364
	tst.l 28(%sp)
	jeq .L365
	moveq #1,%d0
	cmp.l %d2,%d0
	jeq .L366
	move.l %d2,%a0
	pea -1(%a0)
	move.l %d3,-(%sp)
	move.l %a2,-(%sp)
	jsr psl_nv_boot_matches
	lea (12,%sp),%sp
	tst.l %d0
	jeq .L366
.L365:
	clr.b %d0
	moveq #24,%d1
	move.b %d0,532(%a2)
	move.b %d0,533(%a2)
	move.b %d0,534(%a2)
	move.b %d0,535(%a2)
	move.l %d3,%d0
	lsr.l %d1,%d0
	move.b %d0,524(%a2)
	move.l %d3,%d0
	clr.w %d0
	swap %d0
	move.b %d0,525(%a2)
	move.l %d3,%d0
	lsr.l #8,%d0
	move.b %d0,526(%a2)
	move.l %d2,%d0
	lsr.l %d1,%d0
	move.b %d3,527(%a2)
	move.b %d0,528(%a2)
	move.l %d2,%d0
	clr.w %d0
	swap %d0
	move.b %d0,529(%a2)
	move.l %d2,%d0
	lsr.l #8,%d0
	move.b %d0,530(%a2)
	move.b %d2,531(%a2)
	move.l %d2,-(%sp)
	moveq #24,%d2
	move.l %d3,-(%sp)
	jsr nv_boot_crc
	addq.l #8,%sp
	move.l %d0,%d1
	lsr.l %d2,%d1
	move.b %d1,532(%a2)
	move.l %d0,%d1
	clr.w %d1
	swap %d1
	move.b %d1,533(%a2)
	move.l %d0,%d1
	lsr.l #8,%d1
	move.b %d1,534(%a2)
	move.b %d0,535(%a2)
	moveq #1,%d0
	jra .L360
	.size	psl_nv_boot, .-psl_nv_boot
	.align	2
	.globl	psl_nv_forget_scope
	.type	psl_nv_forget_scope, @function
psl_nv_forget_scope:
	lea (-20,%sp),%sp
	movem.l #7180,(%sp)
	move.l 24(%sp),%a2
	tst.l %a2
	jeq .L383
	tst.l 28(%sp)
	jeq .L383
	tst.l 32(%sp)
	jeq .L383
	tst.l 36(%sp)
	jeq .L383
	mvz.b (%a2),%d0
	moveq #80,%d1
	cmp.l %d0,%d1
	jeq .L385
	tst.b (%a2)
	jne .L383
.L385:
	mvz.b 1(%a2),%d0
	moveq #83,%d3
	cmp.l %d0,%d3
	jne .L383
	mvz.b 2(%a2),%d0
	moveq #76,%d1
	cmp.l %d0,%d1
	jne .L383
	mvz.b 3(%a2),%d0
	moveq #79,%d3
	cmp.l %d0,%d3
	jne .L383
	mvz.b 4(%a2),%d0
	moveq #87,%d1
	cmp.l %d0,%d1
	jne .L383
	mvz.b 5(%a2),%d0
	moveq #78,%d3
	cmp.l %d0,%d3
	jne .L383
	mvz.b 6(%a2),%d0
	subq.l #2,%d0
	tst.l %d0
	jeq .L386
	mvz.b 6(%a2),%d0
	subq.l #3,%d0
	tst.l %d0
	jne .L383
.L386:
	tst.b 7(%a2)
	jne .L383
	lea (1036,%a2),%a3
	clr.l %d2
	lea nv_entry_key,%a4
.L388:
	move.l %d2,-(%sp)
	move.l %a2,-(%sp)
	jsr (%a4)
	addq.l #8,%sp
	cmp.l #65535,%d0
	jeq .L387
	move.l %d0,%d1
	lsr.l #7,%d1
	move.l 28(%sp),%d3
	btst %d1,%d3
	jeq .L387
	move.l %d0,%d1
	lsr.l #3,%d1
	moveq #15,%d3
	and.l %d3,%d1
	move.l 32(%sp),%d3
	btst %d1,%d3
	jeq .L387
	moveq #7,%d1
	and.l %d1,%d0
	move.l 36(%sp),%d3
	btst %d0,%d3
	jeq .L387
	clr.b %d0
	clr.b (%a3)
	move.b %d0,1(%a3)
	move.b %d0,2(%a3)
	move.b %d0,3(%a3)
.L387:
	addq.l #1,%d2
	lea (16,%a3),%a3
	cmp.l #704,%d2
	jne .L388
.L383:
	movem.l (%sp),#7180
	lea (20,%sp),%sp
	rts
	.size	psl_nv_forget_scope, .-psl_nv_forget_scope
	.align	2
	.type	psl_foreign_begin, @function
psl_foreign_begin:
	move.l %d2,-(%sp)
#APP
| 244 "sdk/drafts/pattern-sample-locks/native.c" 1
	move.w %sr,%d0
	move.w #0x2700,%sr
| 0 "" 2
#NO_APP
	addq.l #1,writer_depth
	addq.l #1,origin_epoch
#APP
| 246 "sdk/drafts/pattern-sample-locks/native.c" 1
	move.w %d0,%sr
| 0 "" 2
#NO_APP
	move.l 1187521622,%d2
	tst.l 16(%sp)
	jne .L422
	move.l %d2,-(%sp)
	jsr bank_valid
	addq.l #4,%sp
	tst.l %d0
	jeq .L422
	add.l #-1074668000,%d2
	move.l #635712,%d1
	divu.l %d1,%d2
	moveq #1,%d0
	lsl.l %d2,%d0
	move.l %d0,16(%sp)
.L422:
	move.l 12(%sp),-(%sp)
	move.l 12(%sp),-(%sp)
	move.l 24(%sp),-(%sp)
	move.l #269455360,-(%sp)
	jsr psl_nv_forget_scope
	lea (16,%sp),%sp
	move.l (%sp)+,%d2
	rts
	.size	psl_foreign_begin, .-psl_foreign_begin
	.align	2
	.globl	psl_font_text_at
	.type	psl_font_text_at, @function
psl_font_text_at:
	lea (-40,%sp),%sp
	movem.l #1276,(%sp)
	move.l 48(%sp),%d2
	move.l 56(%sp),%a1
	tst.l 44(%sp)
	jeq .L427
	tst.l %a1
	jeq .L427
	moveq #57,%d0
	cmp.l 52(%sp),%d0
	jcs .L427
	moveq #1,%d6
.L430:
	move.b (%a1),%d0
	jeq .L427
	move.l %d2,%d1
	moveq #124,%d3
	addq.l #5,%d1
	cmp.l %d1,%d3
	jcc .L441
.L427:
	movem.l (%sp),#1276
	lea (40,%sp),%sp
	rts
.L441:
	move.l %d0,%d1
	add.l #-65,%d1
	mvz.b %d1,%d1
	addq.l #1,%a1
	moveq #25,%d3
	cmp.l %d1,%d3
	jcs .L431
	mvs.b %d0,%d0
	add.l #-65,%d0
	mulu.w #7,%d0
	move.l %d0,%a0
	add.l #letters,%a0
.L432:
	move.l %d2,%d5
	clr.l %d0
	lsl.l #3,%d5
	move.l %d5,28(%sp)
.L440:
	tst.l %a0
	jeq .L443
	mvz.b (%a0,%d0.l),%d1
.L433:
	moveq #58,%d7
	mvs.b -1(%a1),%d3
	cmp.l %d3,%d7
	jne .L434
	moveq #36,%d3
	btst %d0,%d3
	jeq .L435
.L445:
	moveq #4,%d1
	jra .L435
.L431:
	move.l %d0,%d1
	add.l #-48,%d1
	mvz.b %d1,%d1
	moveq #9,%d4
	cmp.l %d1,%d4
	jcs .L442
	mvs.b %d0,%d0
	add.l #-48,%d0
	mulu.w #7,%d0
	move.l %d0,%a0
	add.l #digits,%a0
	jra .L432
.L442:
	sub.l %a0,%a0
	jra .L432
.L443:
	clr.l %d1
	jra .L433
.L434:
	moveq #46,%d4
	cmp.l %d3,%d4
	jne .L436
	moveq #6,%d5
	cmp.l %d0,%d5
	jeq .L445
.L435:
	move.l 52(%sp),%d5
	add.l %d0,%d5
	move.l %d5,%d7
	lsr.l #3,%d7
	move.l 28(%sp),%d4
	clr.l %d3
	move.l %d7,%a2
	moveq #7,%d7
	sub.l %a2,%d7
	move.l %d7,32(%sp)
	moveq #7,%d7
	and.l %d7,%d5
	move.l %d6,%d7
	lsl.l %d5,%d7
	move.l %d7,36(%sp)
.L439:
	moveq #16,%d5
	lsr.l %d3,%d5
	and.l %d1,%d5
	tst.l %d5
	jeq .L438
	move.l 32(%sp),%a2
	add.l %d4,%a2
	add.l 44(%sp),%a2
	move.b (%a2),%d5
	or.l 36(%sp),%d5
	move.b %d5,(%a2)
.L438:
	addq.l #1,%d3
	addq.l #8,%d4
	moveq #5,%d5
	cmp.l %d3,%d5
	jne .L439
	addq.l #1,%d0
	moveq #7,%d7
	cmp.l %d0,%d7
	jne .L440
	addq.l #6,%d2
	jra .L430
.L436:
	moveq #45,%d7
	cmp.l %d3,%d7
	jne .L437
	moveq #3,%d3
	cmp.l %d0,%d3
	jne .L435
	moveq #14,%d1
	jra .L435
.L437:
	moveq #47,%d4
	cmp.l %d3,%d4
	jne .L435
	mvz.w %d0,%d1
	moveq #6,%d5
	lsl.l #2,%d1
	move.l %d1,%d3
	move.l %d6,%d1
	divu.l %d5,%d3
	lsl.l %d3,%d1
	jra .L435
	.size	psl_font_text_at, .-psl_font_text_at
	.align	2
	.globl	psl_font_clear
	.type	psl_font_clear, @function
psl_font_clear:
	lea (-36,%sp),%sp
	movem.l #7420,(%sp)
	move.l 40(%sp),%a2
	move.l 44(%sp),%d2
	move.l 48(%sp),%d1
	move.l 52(%sp),%d0
	move.l 56(%sp),%a0
	tst.l %a2
	jeq .L458
	tst.l %d0
	jeq .L458
	tst.l %a0
	jeq .L458
	moveq #127,%d3
	cmp.l %d2,%d3
	jcs .L458
	moveq #63,%d5
	cmp.l %d1,%d5
	jcs .L458
	move.w #128,%a1
	sub.l %d2,%a1
	cmp.l %a1,%d0
	jhi .L458
	move.w #64,%a1
	sub.l %d1,%a1
	cmp.l %a1,%a0
	jhi .L458
	lea -1(%a0,%d1.l),%a0
	move.l %d2,%d4
	moveq #7,%d5
	lsl.l #3,%d4
	and.l %d1,%d5
	move.l %d1,%d7
	moveq #7,%d1
	lsr.l #3,%d7
	move.w #255,%a3
	add.l %d2,%d0
	move.l %d7,%a1
	move.l %a0,%d3
	move.l %a0,%d6
	and.l %d1,%d3
	lea 7(%a2,%d4.l),%a4
	lsr.l #3,%d6
	move.l %d5,%a0
.L461:
	cmp.l %a1,%d6
	jcc .L465
.L458:
	movem.l (%sp),#7420
	lea (36,%sp),%sp
	rts
.L465:
	cmp.l %d7,%a1
	jne .L466
	move.l %a0,%d4
.L462:
	cmp.l %a1,%d6
	jne .L467
	move.l %d3,%d1
.L463:
	moveq #7,%d5
	sub.l %d1,%d5
	move.l %a3,%d1
	lsr.l %d5,%d1
	move.l %a3,%d5
	move.l %a4,%a2
	lsl.l %d4,%d5
	sub.l %a1,%a2
	move.l %d2,%d4
	and.l %d5,%d1
	not.l %d1
.L464:
	move.b (%a2),%d5
	addq.l #1,%d4
	addq.l #8,%a2
	and.l %d1,%d5
	move.b %d5,-8(%a2)
	cmp.l %d4,%d0
	jhi .L464
	addq.l #1,%a1
	jra .L461
.L466:
	clr.l %d4
	jra .L462
.L467:
	moveq #7,%d1
	jra .L463
	.size	psl_font_clear, .-psl_font_clear
	.align	2
	.globl	psl_font_small_text
	.type	psl_font_small_text, @function
psl_font_small_text:
	lea (-36,%sp),%sp
	movem.l #15484,(%sp)
	move.l 44(%sp),%a5
	move.l 52(%sp),%a4
	tst.l 40(%sp)
	jeq .L475
	tst.l %a4
	jeq .L475
	moveq #59,%d0
	cmp.l 48(%sp),%d0
	jcs .L475
	moveq #1,%d2
	lea pixel,%a3
.L478:
	move.b (%a4),%d0
	jeq .L475
	move.l %a5,%d1
	moveq #124,%d3
	addq.l #3,%d1
	cmp.l %d1,%d3
	jcc .L491
.L475:
	movem.l (%sp),#15484
	lea (36,%sp),%sp
	rts
.L491:
	move.l %d0,%d1
	add.l #-65,%d1
	mvz.b %d1,%d1
	addq.l #1,%a4
	moveq #25,%d3
	cmp.l %d1,%d3
	jcs .L479
	mvs.b %d0,%d0
	add.l #-65,%d0
	mulu.w #5,%d0
	move.l %d0,%a2
	add.l #alpha.1,%a2
.L480:
	clr.l %d3
	moveq #4,%d5
.L490:
	tst.l %a2
	jeq .L493
	mvz.b (%a2,%d3.l),%d4
.L481:
	mvs.b -1(%a4),%d0
	moveq #58,%d1
	cmp.l %d0,%d1
	jne .L482
	moveq #-3,%d0
	and.l %d3,%d0
	subq.l #1,%d0
	tst.l %d0
	jne .L486
.L495:
	moveq #2,%d4
	jra .L486
.L479:
	move.l %d0,%d1
	add.l #-48,%d1
	mvz.b %d1,%d1
	moveq #9,%d3
	cmp.l %d1,%d3
	jcs .L492
	mvs.b %d0,%d0
	add.l #-48,%d0
	mulu.w #5,%d0
	move.l %d0,%a2
	add.l #digit.0,%a2
	jra .L480
.L492:
	sub.l %a2,%a2
	jra .L480
.L493:
	clr.l %d4
	jra .L481
.L482:
	moveq #46,%d1
	cmp.l %d0,%d1
	jne .L485
	moveq #4,%d0
	cmp.l %d3,%d0
	jeq .L495
.L486:
	clr.l %d6
.L489:
	move.l %d5,%d0
	lsr.l %d6,%d0
	and.l %d4,%d0
	tst.l %d0
	jeq .L488
	clr.l -(%sp)
	move.l 52(%sp),%a0
	pea (%a0,%d3.l)
	pea (%a5,%d6.l)
	move.l 52(%sp),-(%sp)
	jsr (%a3)
	lea (16,%sp),%sp
.L488:
	addq.l #1,%d6
	moveq #3,%d0
	cmp.l %d6,%d0
	jne .L489
	addq.l #1,%d3
	moveq #5,%d1
	cmp.l %d3,%d1
	jne .L490
	addq.l #4,%a5
	jra .L478
.L485:
	moveq #45,%d1
	cmp.l %d0,%d1
	jne .L487
	moveq #2,%d0
	cmp.l %d3,%d0
	jne .L486
	moveq #7,%d4
	jra .L486
.L487:
	moveq #47,%d1
	cmp.l %d0,%d1
	jne .L484
	move.l %d3,%d0
	lsr.l #1,%d0
	move.l %d2,%d4
	lsl.l %d0,%d4
	jra .L486
.L484:
	moveq #91,%d1
	cmp.l %d0,%d1
	jne .L483
	moveq #-5,%d0
	and.l %d3,%d0
	tst.l %d0
	jne .L497
	moveq #6,%d4
	jra .L486
.L483:
	moveq #93,%d1
	cmp.l %d0,%d1
	jne .L486
	moveq #-5,%d0
	and.l %d3,%d0
	tst.l %d0
	jeq .L498
	moveq #1,%d4
	jra .L486
.L497:
	moveq #4,%d4
	jra .L486
.L498:
	moveq #3,%d4
	jra .L486
	.size	psl_font_small_text, .-psl_font_small_text
	.align	2
	.globl	psl_font_box
	.type	psl_font_box, @function
psl_font_box:
	lea (-36,%sp),%sp
	movem.l #31772,(%sp)
	move.l 40(%sp),%d2
	move.l 44(%sp),%d3
	move.l 48(%sp),%a2
	move.l 52(%sp),%d0
	move.l 56(%sp),%a3
	tst.l %d2
	jeq .L510
	tst.l %d0
	jeq .L510
	tst.l %a3
	jeq .L510
	moveq #127,%d1
	cmp.l %d3,%d1
	jcs .L510
	moveq #63,%d1
	cmp.l %a2,%d1
	jcs .L510
	move.l #128,%d1
	sub.l %d3,%d1
	cmp.l %d1,%d0
	jhi .L510
	moveq #64,%d1
	sub.l %a2,%d1
	cmp.l %d1,%a3
	jhi .L510
	lea -1(%a2,%a3.l),%a6
	lea pixel,%a4
	add.l %d3,%d0
	move.l %d3,%d4
	move.l %a4,%a5
.L513:
	clr.l -(%sp)
	move.l %a2,-(%sp)
	move.l %d4,-(%sp)
	move.l %d2,-(%sp)
	move.l %d0,48(%sp)
	jsr (%a4)
	clr.l -(%sp)
	move.l %a6,-(%sp)
	move.l %d4,-(%sp)
	move.l %d2,-(%sp)
	jsr (%a4)
	lea (32,%sp),%sp
	addq.l #1,%d4
	move.l 32(%sp),%d0
	cmp.l %d4,%d0
	jhi .L513
	move.l %d0,%d4
	add.l %a2,%a3
	subq.l #1,%d4
.L514:
	clr.l -(%sp)
	move.l %a2,-(%sp)
	move.l %d3,-(%sp)
	move.l %d2,-(%sp)
	jsr (%a5)
	clr.l -(%sp)
	move.l %a2,-(%sp)
	move.l %d4,-(%sp)
	move.l %d2,-(%sp)
	jsr (%a5)
	addq.l #1,%a2
	lea (32,%sp),%sp
	cmp.l %a2,%a3
	jhi .L514
.L510:
	movem.l (%sp),#31772
	lea (36,%sp),%sp
	rts
	.size	psl_font_box, .-psl_font_box
	.align	2
	.globl	psl_font_dashed_box
	.type	psl_font_dashed_box, @function
psl_font_dashed_box:
	lea (-36,%sp),%sp
	movem.l #31772,(%sp)
	move.l 40(%sp),%d3
	move.l 44(%sp),%a2
	move.l 48(%sp),%a3
	move.l 52(%sp),%a5
	move.l 56(%sp),%a4
	tst.l %d3
	jeq .L523
	tst.l %a5
	jeq .L523
	tst.l %a4
	jeq .L523
	moveq #127,%d0
	cmp.l %a2,%d0
	jcs .L523
	moveq #63,%d0
	cmp.l %a3,%d0
	jcs .L523
	move.l #128,%d0
	sub.l %a2,%d0
	cmp.l %d0,%a5
	jhi .L523
	moveq #64,%d0
	sub.l %a3,%d0
	cmp.l %d0,%a4
	jhi .L523
	lea -1(%a3,%a4.l),%a0
	clr.l %d2
	lea pixel,%a6
	move.l %a0,32(%sp)
.L526:
	btst #1,%d2
	jne .L525
	clr.l -(%sp)
	move.l %a3,-(%sp)
	move.l %a2,%d4
	add.l %d2,%d4
	move.l %d4,-(%sp)
	move.l %d3,-(%sp)
	jsr (%a6)
	clr.l -(%sp)
	move.l 52(%sp),-(%sp)
	move.l %d4,-(%sp)
	move.l %d3,-(%sp)
	jsr (%a6)
	lea (32,%sp),%sp
.L525:
	addq.l #1,%d2
	cmp.l %a5,%d2
	jne .L526
	lea -1(%a2,%a5.l),%a5
	clr.l %d2
	lea pixel,%a6
	move.l %a5,%d4
.L528:
	btst #1,%d2
	jne .L527
	clr.l -(%sp)
	lea (%a3,%d2.l),%a5
	move.l %a5,-(%sp)
	move.l %a2,-(%sp)
	move.l %d3,-(%sp)
	jsr (%a6)
	clr.l -(%sp)
	move.l %a5,-(%sp)
	move.l %d4,-(%sp)
	move.l %d3,-(%sp)
	jsr (%a6)
	lea (32,%sp),%sp
.L527:
	addq.l #1,%d2
	cmp.l %a4,%d2
	jne .L528
.L523:
	movem.l (%sp),#31772
	lea (36,%sp),%sp
	rts
	.size	psl_font_dashed_box, .-psl_font_dashed_box
	.align	2
	.globl	psl_font_invert
	.type	psl_font_invert, @function
psl_font_invert:
	lea (-24,%sp),%sp
	movem.l #1148,(%sp)
	move.l 32(%sp),%d2
	move.l 36(%sp),%d4
	move.l 40(%sp),%d0
	move.l 44(%sp),%d1
	tst.l 28(%sp)
	jeq .L540
	moveq #127,%d3
	cmp.l %d2,%d3
	jcs .L540
	moveq #63,%d3
	cmp.l %d4,%d3
	jcs .L540
	move.w #128,%a0
	sub.l %d2,%a0
	cmp.l %a0,%d0
	jhi .L540
	move.w #64,%a0
	sub.l %d4,%a0
	cmp.l %a0,%d1
	jhi .L540
	move.l %d2,%d5
	move.l %d4,%d6
	add.l %d0,%d5
	add.l %d1,%d6
	lea pixel,%a2
.L542:
	cmp.l %d2,%d5
	jls .L540
	move.l %d4,%d3
	jra .L544
.L543:
	pea 1.w
	move.l %d3,-(%sp)
	move.l %d2,-(%sp)
	move.l 40(%sp),-(%sp)
	jsr (%a2)
	addq.l #1,%d3
	lea (16,%sp),%sp
.L544:
	cmp.l %d3,%d6
	jhi .L543
	addq.l #1,%d2
	jra .L542
.L540:
	movem.l (%sp),#1148
	lea (24,%sp),%sp
	rts
	.size	psl_font_invert, .-psl_font_invert
	.align	2
	.globl	psl_ui_retire
	.type	psl_ui_retire, @function
psl_ui_retire:
	clr.b %d0
	clr.l phase
	clr.l selected
	clr.l consumed+4
	clr.l consumed
	move.b %d0,plan+10
	rts
	.size	psl_ui_retire, .-psl_ui_retire
	.align	2
	.globl	psl_lifecycle_notify
	.type	psl_lifecycle_notify, @function
psl_lifecycle_notify:
	move.l %a2,-(%sp)
	move.l %d2,-(%sp)
	move.l 12(%sp),%a2
	jsr psl_ui_retire
	addq.l #1,origin_epoch
	tst.l %a2
	jne .L550
	move.l #269455360,-(%sp)
	jsr psl_nv_forget
	clr.l base_boot
	clr.l base_nonce
	addq.l #4,%sp
.L549:
	move.l (%sp)+,%d2
	move.l (%sp)+,%a2
	rts
.L550:
	move.l 4(%a2),%d1
	moveq #3,%d2
	move.l 8(%a2),%d0
	move.l %d1,base_nonce
	move.l %d0,base_boot
	cmp.l (%a2),%d2
	jne .L552
	tst.l %d0
	jeq .L552
	pea 1.w
	move.l %d0,-(%sp)
	move.l %d1,-(%sp)
	move.l #269455360,-(%sp)
	jsr psl_nv_boot
	lea (16,%sp),%sp
	jra .L549
.L552:
	move.l #269455360,%d0
	move.l %d0,12(%sp)
	move.l (%sp)+,%d2
	move.l (%sp)+,%a2
	jra psl_nv_forget
	.size	psl_lifecycle_notify, .-psl_lifecycle_notify
	.align	2
	.globl	psl_ui_phase
	.type	psl_ui_phase, @function
psl_ui_phase:
	move.l phase,%d0
	rts
	.size	psl_ui_phase, .-psl_ui_phase
	.align	2
	.globl	psl_ui_open
	.type	psl_ui_open, @function
psl_ui_open:
	moveq #1,%d0
	moveq #3,%d1
	move.l %d0,phase
	move.l 1175346752,%d0
	cmp.l %d0,%d1
	jcc .L558
	clr.l %d0
.L558:
	move.l %d0,cursor
	moveq #1,%d1
	clr.b %d0
	clr.l replace
	clr.l selected
	clr.l encoder_residual
	move.l %d1,1187497772
	move.b %d0,plan+10
	rts
	.size	psl_ui_open, .-psl_ui_open
	.section	.rodata.str1.1,"aMS",@progbits,1
.LC0:
	.string	"LOCK SAMPLES TO PATTERN"
.LC1:
	.string	"CLEAR SAMPLE LOCKS"
.LC2:
	.string	"    "
.LC3:
	.string	"[X] "
.LC4:
	.string	"[ ] "
.LC5:
	.string	"MANUAL LOCKS: KEEP"
.LC6:
	.string	"REPLACE EXISTING: YES"
.LC7:
	.string	"EXISTING LOCKS: KEEP"
.LC8:
	.string	"INCLUDES MANUAL LOCKS"
.LC9:
	.string	"C:RETAIN MANUAL ON"
.LC10:
	.string	"C:REPLACE EXISTING ON"
.LC11:
	.string	"C:REPLACE EXISTING OFF"
.LC12:
	.string	"C:RETAIN MANUAL OFF"
.LC13:
	.string	"STOPPING PLAYBACK..."
.LC14:
	.string	"NO:CANCEL"
.LC15:
	.string	"YES/NO:CLOSE"
.LC16:
	.string	"PATTERN "
.LC17:
	.string	"-"
.LC18:
	.string	"YES:APPLY NO:BACK"
.LC19:
	.string	"A:ALL B:TRACK"
.LC20:
	.string	"YES:NEXT NO:CLOSE"
	.text
	.align	2
	.globl	module_draw
	.type	module_draw, @function
module_draw:
	lea (-92,%sp),%sp
	movem.l #31996,(%sp)
	move.l phase,%d2
	move.l 96(%sp),%a6
	tst.l %d2
	jeq .L560
	tst.l %a6
	jeq .L560
	move.l %d2,%d0
	subq.l #2,%d0
	lsr.l #1,%d0
	jne .L600
	moveq #64,%d4
	sub.l %a2,%a2
	move.l %d4,52(%sp)
.L562:
	move.l 52(%sp),-(%sp)
	pea 116.w
	moveq #1,%d7
	move.l %a2,-(%sp)
	pea 6.w
	move.l %a6,-(%sp)
	jsr psl_font_clear
	lea (20,%sp),%sp
	lea psl_font_small_text,%a3
	cmp.l %d2,%d7
	jne .L563
	lea part_rows,%a4
	addq.l #5,%a2
	clr.l %d2
	lea psl_font_invert,%a5
.L565:
	move.l (%a4)+,-(%sp)
	move.l %a2,-(%sp)
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a3)
	lea (16,%sp),%sp
	cmp.l cursor.l,%d2
	jne .L564
	pea 7.w
	pea 112.w
	pea -1(%a2)
	pea 8.w
	move.l %a6,-(%sp)
	jsr (%a5)
	lea (20,%sp),%sp
.L564:
	addq.l #1,%d2
	addq.l #8,%a2
	moveq #6,%d0
	cmp.l %d2,%d0
	jne .L565
.L630:
	pea 58.w
	pea 116.w
	pea 3.w
.L628:
	pea 6.w
	move.l %a6,-(%sp)
	jsr psl_font_box
	lea (20,%sp),%sp
.L560:
	movem.l (%sp),#31996
	lea (92,%sp),%sp
	rts
.L600:
	moveq #58,%d5
	move.w #3,%a2
	move.l %d5,52(%sp)
	jra .L562
.L563:
	move.l action,%d1
	move.l %d1,48(%sp)
	tst.l %d1
	jne .L601
	move.l #.LC0,%d0
.L566:
	move.l %d0,-(%sp)
	moveq #5,%d4
	pea 2(%a2)
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a3)
	pea 7.w
	pea 114.w
	pea 1(%a2)
	pea 7.w
	move.l %a6,-(%sp)
	jsr psl_font_invert
	lea (36,%sp),%sp
	cmp.l %d2,%d4
	jne .L567
	pea .LC13
	pea 18(%a2)
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a3)
	pea .LC14
.L629:
	pea 26(%a2)
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a3)
	lea (32,%sp),%sp
	jra .L630
.L601:
	move.l #.LC1,%d0
	jra .L566
.L567:
	moveq #4,%d5
	cmp.l %d2,%d5
	jne .L568
	move.l message,-(%sp)
	pea 18(%a2)
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a3)
	pea .LC15
	jra .L629
.L568:
	moveq #3,%d7
	cmp.l %d2,%d7
	jne .L569
	pea .LC16
	move.l #635712,%d4
	move.l %sp,%d3
	add.l #72,%d3
	move.l %d3,-(%sp)
	moveq #10,%d5
	jsr text
	move.l plan,%d0
	add.l #-1074668000,%d0
	divu.l %d4,%d0
	clr.b %d7
	add.l #65,%d0
	move.b %d0,84(%sp)
	mvz.b plan+4,%d0
	addq.l #8,%sp
	move.b %d7,79(%sp)
	addq.l #1,%d0
	remu.l %d5,%d1:%d0
	divu.l %d5,%d0
	add.l #48,%d0
	add.l #48,%d1
	move.b %d0,77(%sp)
	move.b %d1,78(%sp)
	move.l %d3,-(%sp)
	pea 10.w
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a3)
	lea (16,%sp),%sp
.L569:
	moveq #3,%d1
	cmp.l %d2,%d1
	seq %d0
	neg.l %d0
	tst.b %d0
	jeq .L570
	moveq #18,%d4
	move.l %d4,64(%sp)
.L571:
	moveq #3,%d7
	cmp.l %d2,%d7
	sne %d0
	neg.l %d0
	tst.b %d0
	jeq .L572
	lea (72,%sp),%a5
.L573:
	lea (3,%a5),%a0
	clr.l %d3
	move.l %a0,60(%sp)
	lea plan+608,%a0
	move.l %a0,56(%sp)
	lea psl_font_small_text,%a4
.L593:
	moveq #3,%d0
	moveq #3,%d1
	and.l %d3,%d0
	move.l %d3,%d4
	lsr.l #2,%d4
	move.l eligible,%d5
	lsr.l %d3,%d5
	move.l 64(%sp),%a3
	mulu.w #56,%d4
	lsl.l #3,%d0
	move.l %d4,%d6
	add.l #10,%d6
	move.l %d4,44(%sp)
	add.l %d0,%a3
	moveq #1,%d0
	and.l %d0,%d5
	cmp.l %d2,%d1
	jeq .L574
	tst.l %d5
	jeq .L602
	move.l selected,%d0
	btst %d3,%d0
	jeq .L603
	move.l #.LC3,%d0
.L575:
	move.l %d0,-(%sp)
	pea 72(%sp)
	jsr text
	addq.l #8,%sp
.L574:
	move.l %d3,%d0
	add.l #49,%d0
	moveq #3,%d7
	moveq #32,%d4
	move.b #84,(%a5)
	move.b %d0,1(%a5)
	move.b %d4,2(%a5)
	cmp.l %d2,%d7
	jne .L576
	tst.l %d5
	jeq .L577
	move.l selected,%d0
	btst %d3,%d0
	jne .L604
.L577:
	pea .LC17
	move.l 64(%sp),-(%sp)
	jsr text
	addq.l #8,%sp
.L579:
	pea 68(%sp)
	move.l %a3,-(%sp)
	move.l %d6,-(%sp)
	move.l %a6,-(%sp)
	jsr psl_font_small_text
	lea (16,%sp),%sp
	tst.l %d5
	jne .L584
	tst.l 44(%sp)
	seq %d4
	neg.l %d4
	tst.b %d4
	jeq .L585
	moveq #58,%d7
.L586:
	move.l %a3,%d1
	move.l %a3,%d0
	addq.l #5,%d1
	addq.l #1,%d0
	cmp.l %d0,%d1
	scs %d0
	neg.l %d0
	tst.b %d0
	jeq .L587
	move.w #1,%a0
.L588:
	add.l %a3,%a0
.L589:
	cmp.l %d6,%d7
	jls .L592
	mvz.w %d6,%d1
	move.l %a3,%d0
	lsl.l #3,%d1
	addq.l #7,%d1
.L591:
	move.w %d0,%d4
	moveq #3,%d5
	mulu.w #3,%d4
	add.l %d6,%d4
	and.l %d5,%d4
	tst.l %d4
	jne .L590
	moveq #7,%d5
	and.l %d0,%d5
	move.l %d0,%d4
	lsr.l #3,%d4
	move.l %d1,%a1
	sub.l %d4,%a1
	moveq #1,%d4
	add.l %a6,%a1
	lsl.l %d5,%d4
	move.b (%a1),%d5
	not.l %d4
	and.l %d5,%d4
	move.b %d4,(%a1)
.L590:
	addq.l #1,%d0
	cmp.l %d0,%a0
	jne .L591
	addq.l #1,%d6
	jra .L589
.L570:
	moveq #10,%d5
	move.l %d5,64(%sp)
	jra .L571
.L572:
	lea (68,%sp),%a5
	jra .L573
.L602:
	move.l #.LC2,%d0
	jra .L575
.L603:
	move.l #.LC4,%d0
	jra .L575
.L604:
	move.l 56(%sp),%a1
	clr.l %d0
	sub.l %a0,%a0
.L578:
	move.b (%a1)+,%d7
	addq.l #1,%a0
	move.b 511(%a1),%d1
	eor.l %d7,%d1
	tst.b %d1
	sne %d1
	mvs.b %d1,%d1
	sub.l %d1,%d0
	moveq #64,%d1
	cmp.l %a0,%d1
	jne .L578
	moveq #99,%d4
	cmp.l %d0,%d4
	jcc .L580
	moveq #100,%d4
	move.l %d0,%d7
	divu.l %d4,%d7
	lea (4,%a5),%a0
	moveq #10,%d1
	remu.l %d1,%d4:%d7
	move.l %d4,%d1
	add.l #48,%d1
	move.b %d1,3(%a5)
.L581:
	moveq #10,%d4
	move.l %d0,%d1
	divu.l %d4,%d1
	move.l %d1,%d7
	remu.l %d4,%d1:%d7
	add.l #48,%d1
	move.b %d1,(%a0)+
	jra .L582
.L580:
	move.l 60(%sp),%a0
	moveq #9,%d7
	cmp.l %d0,%d7
	jcs .L581
.L582:
	moveq #10,%d4
	remu.l %d4,%d1:%d0
	clr.b %d7
	add.l #48,%d1
	move.b %d1,(%a0)
	move.b %d7,1(%a0)
	jra .L579
.L576:
	tst.l %d5
	jeq .L606
	lea captured+7,%a0
	tst.b (%a0,%d3.l)
	jeq .L607
	moveq #70,%d0
.L583:
	move.b %d0,3(%a5)
	clr.b %d0
	move.b %d0,4(%a5)
	jra .L579
.L606:
	moveq #45,%d0
	jra .L583
.L607:
	moveq #83,%d0
	jra .L583
.L585:
	moveq #114,%d7
	jra .L586
.L587:
	move.w #5,%a0
	jra .L588
.L584:
	moveq #2,%d7
	cmp.l %d2,%d7
	jne .L592
	cmp.l cursor.l,%d3
	jne .L592
	pea 7.w
	pea 50.w
	pea -1(%a3)
	move.l 56(%sp),%a0
	pea 8(%a0)
	move.l %a6,-(%sp)
	jsr psl_font_invert
	lea (20,%sp),%sp
.L592:
	moveq #64,%d0
	addq.l #1,%d3
	moveq #8,%d1
	add.l %d0,56(%sp)
	cmp.l %d3,%d1
	jne .L593
	subq.l #3,%d2
	tst.l %d2
	jne .L594
	moveq #1,%d5
	move.l replace,%d0
	cmp.l 48(%sp),%d5
	jne .L595
	tst.l %d0
	jeq .L608
	move.l #.LC8,%d0
.L596:
	move.l %d0,-(%sp)
	pea 50.w
	pea 10.w
	move.l %a6,-(%sp)
	lea psl_font_small_text,%a3
	jsr (%a3)
	pea .LC18
	pea 58.w
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a3)
	lea (32,%sp),%sp
.L597:
	move.l 52(%sp),-(%sp)
	pea 116.w
	move.l %a2,-(%sp)
	jra .L628
.L595:
	tst.l %d0
	jeq .L609
	move.l #.LC6,%d0
	jra .L596
.L608:
	move.l #.LC5,%d0
	jra .L596
.L609:
	move.l #.LC7,%d0
	jra .L596
.L594:
	move.l message,%d0
	tst.l %d0
	jne .L598
	move.l replace,%d0
	moveq #1,%d7
	cmp.l 48(%sp),%d7
	jne .L599
	tst.l %d0
	jeq .L610
	move.l #.LC12,%d0
.L598:
	move.l %d0,-(%sp)
	pea 42.w
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a4)
	pea .LC19
	pea 50.w
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a4)
	lea (28,%sp),%sp
	move.l #.LC20,(%sp)
	pea 58.w
	pea 10.w
	move.l %a6,-(%sp)
	jsr (%a4)
	lea (16,%sp),%sp
	jra .L597
.L599:
	tst.l %d0
	jeq .L611
	move.l #.LC10,%d0
	jra .L598
.L610:
	move.l #.LC9,%d0
	jra .L598
.L611:
	move.l #.LC11,%d0
	jra .L598
	.size	module_draw, .-module_draw
	.align	2
	.globl	psl_native_source
	.type	psl_native_source, @function
psl_native_source:
	lea (-56,%sp),%sp
	movem.l #31996,(%sp)
	move.l 1187521622,%d5
	move.l 60(%sp),%a3
	move.b 269161680,%d3
	move.b 269161679,%d4
	tst.l writer_depth
	jne .L632
	tst.l %a3
	jne .L633
.L632:
	clr.l %d0
.L631:
	movem.l (%sp),#31996
	lea (56,%sp),%sp
	rts
.L633:
	move.l %d5,-(%sp)
	jsr bank_valid
	addq.l #4,%sp
	tst.l %d0
	jeq .L631
	mvz.b %d3,%d6
	moveq #15,%d0
	cmp.l %d6,%d0
	jcs .L632
	mvz.b %d4,%d0
	lsr.l #2,%d0
	jne .L632
	move.b %d4,%d0
	move.l %d5,%a5
	add.l #585088,%a5
	move.l %d5,%d2
	move.l #635712,%d1
	add.l #-1074668000,%d2
	move.b %d3,4(%a3)
	move.b %d4,5(%a3)
	lea origin_epoch,%a0
	move.l %d5,(%a3)
	move.l (%a0),88(%a3)
	ext.w %d0
	mulu.w #6322,%d0
	add.l %d0,%a5
	clr.b %d0
	move.b %d0,6(%a3)
	divu.l %d1,%d2
	mvz.w %d2,%d2
	lsl.l #4,%d2
	add.l %d6,%d2
	move.l %d2,source_row
	jsr project_identity
	tst.l %d0
	jeq .L635
	pea identity
	move.l #269455360,-(%sp)
	jsr psl_nv_matches
	addq.l #8,%sp
	tst.l %d0
	jeq .L635
	move.l base_boot,-(%sp)
	move.l base_nonce,-(%sp)
	move.l #269455360,-(%sp)
	jsr psl_nv_boot_matches
	lea (12,%sp),%sp
.L635:
	ext.w %d3
	lea (60,%a5),%a2
	lea origin,%a4
	lea (24,%a3),%a1
	mulu.w #36568,%d3
	lea (34,%a5),%a6
	move.l %d3,%d7
	clr.l %d3
	add.l %d5,%d7
.L645:
	move.b (%a6,%d3.l),%d1
	move.w %d1,%a0
	mvz.b %d1,%d1
	move.l %d1,52(%sp)
	move.w %a0,%d1
	move.b %d1,7(%a3,%d3.l)
	moveq #1,%d1
	cmp.l 52(%sp),%d1
	jcs .L646
	move.w %d3,%d1
	mulu.w #5,%d1
	move.l %d1,%a0
	lea (714,%a0),%a0
	add.l 52(%sp),%a0
	move.b (%a5,%a0.l),%d1
.L636:
	move.b %d1,15(%a3,%d3.l)
	move.l %d7,(%a1)+
	tst.l %d0
	jeq .L647
	move.l %a4,-(%sp)
	move.l %d7,-(%sp)
	move.l %d3,-(%sp)
	move.l %d2,-(%sp)
	move.l #269455360,-(%sp)
	move.l %d0,68(%sp)
	move.l %a1,64(%sp)
	jsr psl_nv_read
	lea (20,%sp),%sp
	move.l 48(%sp),%d0
	move.l 44(%sp),%a1
.L638:
	move.l %a4,28(%a1)
	moveq #1,%d1
	cmp.l 52(%sp),%d1
	jcs .L639
	mvz.b 2(%a2),%d1
	move.l %d1,%a0
	moveq #1,%d1
	cmp.l %a0,%d1
	jne .L640
	mvz.b (%a2),%d1
	move.l %d1,%a0
	moveq #80,%d1
	cmp.l %a0,%d1
	jne .L641
	mvz.b 1(%a2),%d1
	move.l %d1,%a0
	moveq #76,%d1
	cmp.l %a0,%d1
	jeq .L639
.L641:
	mvz.b (%a2),%d1
	move.l %d1,%a0
	moveq #65,%d1
	cmp.l %a0,%d1
	jne .L642
	mvz.b 1(%a2),%d1
	move.l %d1,%a0
	moveq #66,%d1
	cmp.l %a0,%d1
	jeq .L639
.L642:
	mvz.b (%a2),%d1
	move.l %d1,%a0
	moveq #70,%d1
	cmp.l %a0,%d1
	jne .L640
	mvz.b 1(%a2),%d1
	move.l %d1,%a0
	moveq #77,%d1
	cmp.l %a0,%d1
	jeq .L639
.L640:
	mvz.b 2(%a2),%d1
	move.l %d1,%a0
	moveq #1,%d1
	cmp.l %a0,%d1
	jeq .L643
	mvz.b 2(%a2),%d1
	move.l %d1,%a0
	moveq #2,%d1
	cmp.l %a0,%d1
	jne .L644
.L643:
	mvz.b (%a2),%d1
	move.l %d1,%a0
	moveq #83,%d1
	cmp.l %a0,%d1
	jne .L644
	mvz.b 1(%a2),%d1
	move.l %d1,%a0
	moveq #50,%d1
	cmp.l %a0,%d1
	jeq .L639
.L644:
	move.b 6(%a3),%d1
	move.w %d1,%a0
	moveq #1,%d1
	lsl.l %d3,%d1
	move.l %d1,52(%sp)
	move.l %a0,%d1
	or.l 52(%sp),%d1
	move.b %d1,6(%a3)
.L639:
	addq.l #1,%d3
	lea (30,%a2),%a2
	add.l #2330,%d7
	lea (64,%a4),%a4
	moveq #8,%d1
	cmp.l %d3,%d1
	jne .L645
	cmp.l 1187521622.l,%d5
	jne .L632
	mvz.b 269161680,%d0
	cmp.l %d6,%d0
	jne .L632
	move.b 269161679,%d0
	eor.l %d0,%d4
	tst.b %d4
	seq %d4
	mvs.b %d4,%d0
	neg.l %d0
	jra .L631
.L646:
	st %d1
	jra .L636
.L647:
	sub.l %a0,%a0
.L637:
	clr.b %d1
	move.b %d1,(%a4,%a0.l)
	addq.l #1,%a0
	moveq #64,%d1
	cmp.l %a0,%d1
	jne .L637
	jra .L638
	.size	psl_native_source, .-psl_native_source
	.align	2
	.globl	psl_native_context
	.type	psl_native_context, @function
psl_native_context:
	move.l 4(%sp),%d0
	tst.l writer_depth
	jeq .L675
.L677:
	clr.l %d0
.L674:
	rts
.L675:
	cmp.l 1187521622.l,%d0
	jne .L677
	mvz.b 269161680,%d0
	cmp.l 8(%sp),%d0
	jne .L677
	mvz.b 269161679,%d0
	cmp.l 12(%sp),%d0
	seq %d0
	mvs.b %d0,%d0
	neg.l %d0
	jra .L674
	.size	psl_native_context, .-psl_native_context
	.align	2
	.globl	psl_native_popup
	.type	psl_native_popup, @function
psl_native_popup:
	tst.l 1175346736
	jeq .L680
	move.l #1074502404,%d0
	cmp.l 1175346728.l,%d0
	jne .L681
	move.l #1074502420,%d0
	cmp.l 1175346732.l,%d0
	jeq .L682
.L681:
	moveq #2,%d0
	jra .L678
.L680:
	clr.l %d0
.L678:
	rts
.L682:
	moveq #1,%d0
	jra .L678
	.size	psl_native_popup, .-psl_native_popup
	.align	2
	.globl	psl_native_cursor
	.type	psl_native_cursor, @function
psl_native_cursor:
	move.l 1175346752,%d0
	rts
	.size	psl_native_cursor, .-psl_native_cursor
	.align	2
	.globl	psl_native_set_cursor
	.type	psl_native_set_cursor, @function
psl_native_set_cursor:
	move.l 4(%sp),%d0
	moveq #3,%d1
	cmp.l %d0,%d1
	jcs .L684
	move.l %d0,1175346752
.L684:
	rts
	.size	psl_native_set_cursor, .-psl_native_set_cursor
	.align	2
	.type	move, @function
move:
	lea (-16,%sp),%sp
	move.l phase,%d0
	movem.l #1052,(%sp)
	move.l 20(%sp),%d1
	moveq #1,%d2
	cmp.l %d0,%d2
	jne .L687
	move.l cursor,%d0
	moveq #51,%d3
	cmp.l %d1,%d3
	jne .L688
	tst.l %d0
	jeq .L689
	subq.l #1,%d0
.L714:
	move.l %d0,cursor
.L689:
	move.l cursor,%d0
	moveq #3,%d2
	cmp.l %d0,%d2
	jcc .L690
	moveq #3,%d0
.L690:
	move.l %d0,-(%sp)
	jsr psl_native_set_cursor
	addq.l #4,%sp
.L691:
	moveq #1,%d2
	move.l %d2,1187497772
	movem.l (%sp),#1052
	lea (16,%sp),%sp
	rts
.L688:
	moveq #32,%d4
	cmp.l %d1,%d4
	jne .L689
	moveq #4,%d1
	cmp.l %d0,%d1
	jcs .L689
	addq.l #1,%d0
	jra .L714
.L687:
	subq.l #2,%d0
	tst.l %d0
	jne .L691
	move.l eligible,%a0
	tst.l %a0
	jeq .L691
	move.l cursor,%d0
	moveq #3,%d4
	moveq #51,%d2
	and.l %d0,%d4
	lsr.l #2,%d0
	move.l %d4,%a1
	cmp.l %d1,%d2
	jeq .L703
	moveq #32,%d3
	cmp.l %d1,%d3
	jne .L693
	moveq #1,%d2
.L692:
	lsl.l #2,%d0
	move.l %a1,%d1
	add.l %d2,%d1
.L694:
	moveq #3,%d4
	cmp.l %d1,%d4
	jcs .L691
	move.l %d0,%a1
	add.l %d1,%a1
	move.l %a0,%d4
	move.l %a1,%d3
	btst %d3,%d4
	jeq .L695
	move.l %a1,cursor
	jra .L691
.L703:
	moveq #-1,%d2
	jra .L692
.L695:
	add.l %d2,%d1
	jra .L694
.L693:
	moveq #52,%d2
	cmp.l %d1,%d2
	jne .L697
	tst.l %d0
	jeq .L691
.L698:
	moveq #1,%d1
	sub.l %d0,%d1
	lea (%a1,%d1.l*4),%a2
	clr.l %d0
	move.l %a2,%d2
.L702:
	move.l %a1,%d1
	sub.l %d0,%d1
	lsr.l #2,%d1
	jne .L699
	move.l %d2,%d1
	move.l %a0,%d4
	sub.l %d0,%d1
	btst %d1,%d4
	jne .L700
.L699:
	move.l %a1,%d1
	add.l %d0,%d1
	lsr.l #2,%d1
	jne .L701
	move.l %d2,%d1
	move.l %a0,%d4
	add.l %d0,%d1
	btst %d1,%d4
	jeq .L701
.L700:
	move.l %d1,cursor
	jra .L691
.L697:
	moveq #33,%d3
	cmp.l %d1,%d3
	jne .L691
	tst.l %d0
	jne .L691
	jra .L698
.L701:
	addq.l #1,%d0
	moveq #4,%d1
	cmp.l %d0,%d1
	jne .L702
	jra .L691
	.size	move, .-move
	.align	2
	.globl	module_enc
	.type	module_enc, @function
module_enc:
	move.l phase,%a0
	lea (-12,%sp),%sp
	movem.l #1036,(%sp)
	move.l 16(%sp),%d1
	move.l 20(%sp),%d0
	tst.l %a0
	jeq .L739
	moveq #2,%d2
	cmp.l %a0,%d2
	jne .L717
	tst.l %d0
	jeq .L718
	tst.l %d1
	jne .L719
	tst.l %d0
	jle .L740
	move.l eligible,%d0
.L720:
	move.l %d0,selected
.L718:
	clr.l message
	moveq #1,%d2
	move.l %d2,1187497772
.L725:
	moveq #1,%d0
.L715:
	movem.l (%sp),#1036
	lea (12,%sp),%sp
	rts
.L740:
	clr.l %d0
	jra .L720
.L719:
	moveq #1,%d2
	cmp.l %d1,%d2
	jne .L721
	move.l cursor,%d2
	move.l eligible,%d3
	btst %d2,%d3
	jeq .L718
	lsl.l %d2,%d1
	move.l selected,%d2
	tst.l %d0
	jle .L722
	or.l %d2,%d1
.L752:
	move.l %d1,selected
	jra .L718
.L722:
	not.l %d1
	and.l %d2,%d1
	jra .L752
.L721:
	subq.l #2,%d1
	tst.l %d1
	jne .L718
	moveq #1,%d1
	cmp.l action.l,%d1
	jne .L723
	add.l %d0,%d0
	subx.l %d0,%d0
	neg.l %d0
.L724:
	mvz.b %d0,%d0
	move.l %d0,replace
	jra .L718
.L723:
	tst.l %d0
	sgt %d0
	neg.l %d0
	jra .L724
.L717:
	moveq #1,%d2
	cmp.l %a0,%d2
	jne .L725
	subq.l #6,%d1
	tst.l %d1
	jne .L725
	move.l encoder_residual,%d2
	tst.l %d2
	jge .L726
	tst.l %d0
	jgt .L742
.L727:
	move.l %d0,%d3
	tst.l %d0
	jge .L728
	addq.l #3,%d3
.L728:
	move.l %d0,%d1
	asr.l #2,%d3
	and.l #-2147483645,%d1
	tst.l %d0
	jge .L729
	subq.l #1,%d1
	moveq #-4,%d0
	or.l %d0,%d1
	addq.l #1,%d1
.L729:
	add.l %d1,%d2
	move.l %d2,%d0
	and.l #-2147483645,%d0
	tst.l %d2
	jge .L730
	subq.l #1,%d0
	moveq #-4,%d1
	or.l %d1,%d0
	addq.l #1,%d0
.L730:
	move.l %d0,encoder_residual
	tst.l %d2
	jge .L731
	addq.l #3,%d2
.L731:
	asr.l #2,%d2
	moveq #-6,%d0
	add.l %d3,%d2
	cmp.l %d2,%d0
	jle .L732
	moveq #-6,%d2
.L733:
	move.l %d2,%d3
	lea move,%a2
.L734:
	tst.l %d3
	jgt .L735
	move.l %d2,%d0
	tst.l %d2
	jge .L736
	clr.l %d0
.L736:
	sub.l %d0,%d2
	lea move,%a2
.L737:
	tst.l %d2
	jeq .L725
	pea 51.w
	jsr (%a2)
	addq.l #1,%d2
	addq.l #4,%sp
	jra .L737
.L726:
	tst.l %d2
	jeq .L727
	tst.l %d0
	jge .L727
.L742:
	clr.l %d2
	jra .L727
.L732:
	moveq #6,%d1
	cmp.l %d2,%d1
	jge .L733
	moveq #6,%d2
	jra .L733
.L735:
	pea 32.w
	jsr (%a2)
	subq.l #1,%d3
	addq.l #4,%sp
	jra .L734
.L739:
	clr.l %d0
	jra .L715
	.size	module_enc, .-module_enc
	.align	2
	.globl	psl_native_close_popup
	.type	psl_native_close_popup, @function
psl_native_close_popup:
	jmp 1074190164
	.size	psl_native_close_popup, .-psl_native_close_popup
	.align	2
	.globl	psl_native_redraw
	.type	psl_native_redraw, @function
psl_native_redraw:
	moveq #1,%d0
	move.l %d0,1187497772
	rts
	.size	psl_native_redraw, .-psl_native_redraw
	.align	2
	.globl	psl_native_transport
	.type	psl_native_transport, @function
psl_native_transport:
	move.l #-2147463394,%a0
.L757:
	tst.b (%a0)
	jne .L760
	lea (84,%a0),%a0
	cmp.l #-2147462050,%a0
	jne .L757
	move.l -2147457608,%d0
	tst.l %d0
	jeq .L761
.L759:
	moveq #1,%d0
.L755:
	rts
.L761:
	move.l #-2147457792,%a0
.L758:
	tst.b (%a0)
	jne .L759
	addq.l #1,%a0
	cmp.l #-2147457776,%a0
	jne .L758
	jra .L755
.L760:
	moveq #2,%d0
	jra .L755
	.size	psl_native_transport, .-psl_native_transport
	.align	2
	.type	psl_commit_locked.constprop.0, @function
psl_commit_locked.constprop.0:
	lea (-372,%sp),%sp
	movem.l #31996,(%sp)
	move.l 376(%sp),%a6
	tst.l %a6
	jeq .L765
	tst.b 10(%a6)
	jne .L766
.L765:
	moveq #1,%d3
.L764:
	move.l %d3,%d0
	movem.l (%sp),#31996
	lea (372,%sp),%sp
	rts
.L766:
	jsr psl_native_transport
	tst.l %d0
	jne .L765
	move.l %sp,%d4
	add.l #280,%d4
	move.l %d4,-(%sp)
	jsr psl_native_source
	addq.l #4,%sp
	move.l %d0,%d3
	tst.l %d0
	jeq .L765
	move.l %d4,-(%sp)
	move.l %a6,-(%sp)
	jsr psl_validate
	addq.l #8,%sp
	tst.l %d0
	jeq .L768
.L770:
	move.l %d0,%d3
	jra .L764
.L768:
	tst.w 1632(%a6)
	jne .L769
	clr.b %d1
	move.b %d1,10(%a6)
	jra .L770
.L769:
	move.l base_boot,%d5
	move.l base_nonce,%d6
	move.l %d5,-(%sp)
	move.l %d6,-(%sp)
	move.l #269455360,-(%sp)
	jsr psl_nv_boot_matches
	lea (12,%sp),%sp
	tst.l %d0
	jne .L771
	move.l #269455360,-(%sp)
	jsr psl_nv_forget
	addq.l #4,%sp
.L771:
	tst.l %d5
	jeq .L764
	jsr project_identity
	move.l %d0,%d2
	tst.l %d0
	jeq .L764
	pea identity
	move.l #269455360,-(%sp)
	jsr psl_nv_begin
	addq.l #8,%sp
	move.l %d0,%d3
	tst.l %d0
	jeq .L808
	clr.l -(%sp)
	move.l %d5,-(%sp)
	move.l %d6,-(%sp)
	move.l #269455360,-(%sp)
	jsr psl_nv_boot
	lea (16,%sp),%sp
	tst.l %d0
	jeq .L764
	clr.l %d0
	lea (216,%sp),%a0
.L774:
	move.l %d0,%a1
	add.l #1187501196,%a1
	move.b (%a1),%d1
	lea (152,%sp),%a1
	addq.l #1,%d0
	move.b %d1,-1(%a0,%d0.l)
	move.b %d1,-1(%a1,%d0.l)
	moveq #64,%d1
	cmp.l %d0,%d1
	jne .L774
	mvz.b 4(%a6),%d0
	mvz.b 7(%a6),%d3
	lea (608,%a6),%a2
	clr.l %d2
	lea (304,%sp),%a1
	clr.l %d1
	mulu.w #36568,%d0
	lea (120,%sp),%a3
	move.l %sp,%d7
	move.l %a2,%d6
	move.l %d3,76(%sp)
	move.l %d4,66(%sp)
	move.l %a1,62(%sp)
	add.l #88,%d7
	move.l %d0,%a0
	add.l #268525902,%a0
	move.l %a2,58(%sp)
	move.l %a3,50(%sp)
	clr.l 54(%sp)
.L784:
	move.l 62(%sp),%a5
	move.l %d7,%a1
	move.l (%a5),%d0
	move.l 50(%sp),%a2
	move.l 76(%sp),%d3
	move.l %d0,(%a1)
	move.l %a0,(%a2)
	btst %d1,%d3
	jeq .L775
	mvz.w %d1,%d3
	sub.l %a1,%a1
	lsl.l #3,%d3
	lea (%a6,%d3.l),%a2
.L777:
	mvz.b (%a1,%a0.l),%d4
	mvz.b 27(%a2,%a1.l),%d3
	cmp.l %d4,%d3
	jne .L776
	addq.l #1,%a1
	moveq #8,%d5
	cmp.l %a1,%d5
	jne .L777
	moveq #1,%d3
	moveq #89,%d4
	lsl.l %d1,%d3
	lea (31,%a0),%a2
	lea (216,%sp),%a1
	move.l %d6,%a4
	move.l %a2,80(%sp)
	move.l %d3,%d5
	not.l %d5
	move.l %d5,84(%sp)
.L783:
	move.b (%a4),74(%sp)
	move.l 80(%sp),%a2
	add.l %d4,%a2
	mvz.b (%a2),%d5
	move.l %a2,70(%sp)
	move.l %d5,%a5
	mvz.b 74(%sp),%d5
	cmp.l %a5,%d5
	jeq .L778
.L776:
	moveq #3,%d3
	jra .L764
.L778:
	move.b 512(%a4),%d5
	addq.l #1,%a4
	move.b %d5,75(%sp)
	mvz.b %d5,%d5
	move.l %d5,46(%sp)
	cmp.l %a5,%d5
	jeq .L779
	moveq #10,%d5
	muls.l %d2,%d5
	move.l %d0,%a2
	addq.l #1,%d2
	lea (120,%a2),%a2
	or.l %d3,54(%sp)
	move.l %d5,%a5
	move.l #edits,%d5
	move.l %a2,(%a5,%d5.l)
	move.l %a5,%a2
	add.l %d5,%a2
	move.b 74(%sp),%d5
	move.l 70(%sp),%a5
	move.l %a5,4(%a2)
	move.b %d5,8(%a2)
	move.b 75(%sp),%d5
	move.b %d5,9(%a2)
	move.l 46(%sp),%d5
	cmp.l #255,%d5
	jne .L780
	sub.l %a2,%a2
.L781:
	mvz.b 89(%a2,%d0.l),%d5
	cmp.l #255,%d5
	jne .L780
	addq.l #1,%a2
	moveq #31,%d5
	cmp.l %a2,%d5
	jne .L781
	move.b (%a1),%d5
	and.l 84(%sp),%d5
	jra .L858
.L780:
	move.b (%a1),%d5
	or.l %d3,%d5
.L858:
	move.b %d5,(%a1)
.L779:
	addq.l #1,%a1
	add.l #32,%d0
	add.l #32,%d4
	cmp.l #2137,%d4
	jne .L783
.L775:
	addq.l #4,62(%sp)
	addq.l #4,%d7
	addq.l #4,50(%sp)
	addq.l #1,%d1
	lea (2330,%a0),%a0
	add.l #64,%d6
	moveq #8,%d0
	cmp.l %d1,%d0
	jne .L784
	tst.b 8(%a6)
	jne .L785
	move.l 54(%sp),-(%sp)
	move.l source_row,-(%sp)
	move.l #269455360,-(%sp)
	jsr psl_nv_reserve
	lea (12,%sp),%sp
	tst.l %d0
	jeq .L809
.L785:
	jsr psl_native_transport
	tst.l %d0
	jne .L776
	mvz.b 5(%a6),%d5
	move.l (%a6),%d4
	move.l %d5,-(%sp)
	mvz.b 4(%a6),%d0
	move.l %d0,-(%sp)
	move.l %d4,-(%sp)
	jsr psl_native_context
	lea (12,%sp),%sp
	tst.l %d0
	jeq .L776
	move.l origin_epoch,%d1
	cmp.l 604(%a6),%d1
	jne .L776
	lea (152,%sp),%a1
	clr.l %d3
	move.l #1187501196,%a0
.L787:
	mvz.b (%a0),%d1
	mvz.b (%a1)+,%d0
	cmp.l %d1,%d0
	jeq .L786
	moveq #3,%d3
.L786:
	addq.l #1,%a0
	cmp.l #1187501260,%a0
	jne .L787
	mulu.w #6322,%d5
	move.l %d4,%a1
	add.l #585088,%a1
	clr.l %d0
	move.l #714,%d4
	add.l %d5,%a1
	mvz.b 7(%a6),%d5
	lea (34,%a1),%a4
	move.l %d5,62(%sp)
	move.l 58(%sp),%d5
.L794:
	move.l 62(%sp),%d6
	btst %d0,%d6
	jeq .L788
	mvz.b (%a4,%d0.l),%d1
	mvz.b 11(%a6,%d0.l),%d6
	cmp.l %d1,%d6
	jne .L812
	move.l %d1,%a0
	add.l %d4,%a0
	mvz.b 19(%a6,%d0.l),%d1
	mvz.b (%a1,%a0.l),%d6
	cmp.l %d6,%d1
	jne .L812
.L789:
	mvz.w %d0,%d1
	move.l 88(%sp,%d0.l*4),%a2
	lsl.l #3,%d1
	lea (%a6,%d1.l),%a5
	clr.l %d1
.L791:
	mvz.b (%a2,%d1.l),%d6
	mvz.b 27(%a5,%d1.l),%d7
	cmp.l %d6,%d7
	jne .L814
	move.l (%a3),%a0
	mvz.b (%a0,%d1.l),%d7
	cmp.l %d6,%d7
	jne .L814
.L790:
	addq.l #1,%d1
	moveq #8,%d6
	cmp.l %d1,%d6
	jne .L791
	move.l %d5,%a5
	moveq #120,%d1
.L793:
	mvz.b (%a2,%d1.l),%d6
	mvz.b (%a5)+,%d7
	cmp.l %d6,%d7
	jne .L816
	move.l (%a3),%a0
	mvz.b (%a0,%d1.l),%d7
	cmp.l %d6,%d7
	jne .L816
.L792:
	add.l #32,%d1
	cmp.l #2168,%d1
	jne .L793
.L788:
	addq.l #1,%d0
	addq.l #4,%a3
	add.l #64,%d5
	addq.l #5,%d4
	moveq #8,%d1
	cmp.l %d0,%d1
	jne .L794
	tst.l %d3
	jne .L764
	clr.l %d4
	lea psl_nv_invalidate,%a2
.L797:
	move.l 54(%sp),%d5
	btst %d4,%d5
	jeq .L796
	move.l %d4,-(%sp)
	move.l source_row,-(%sp)
	move.l #269455360,-(%sp)
	jsr (%a2)
	lea (12,%sp),%sp
.L796:
	addq.l #1,%d4
	moveq #8,%d6
	cmp.l %d4,%d6
	jne .L797
	addq.l #1,writer_depth
	clr.l %d0
	lea (216,%sp),%a2
	lea edits,%a1
.L799:
	lea (152,%sp),%a0
	move.b (%a2,%d0.l),%d4
	mvz.b (%a0,%d0.l),%d5
	mvz.b %d4,%d1
	cmp.l %d5,%d1
	jeq .L798
	moveq #10,%d1
	muls.l %d2,%d1
	move.l %d0,%a5
	add.l #1187501196,%a5
	addq.l #1,%d2
	lea (%a1,%d1.l),%a0
	move.b %d4,9(%a0)
	move.l %a5,(%a1,%d1.l)
	clr.l 4(%a0)
.L798:
	addq.l #1,%d0
	moveq #64,%d1
	cmp.l %d0,%d1
	jne .L799
	clr.l %d0
	lea psl_write_batch,%a2
.L800:
	cmp.l %d0,%d2
	jhi .L802
	clr.b %d6
	move.l (%a6),%a0
	moveq #1,%d0
	add.l #635698,%a0
	move.l %d0,(%a0)
	moveq #1,%d5
	move.l %d5,269452696
	lea origin,%a2
	clr.l %d2
	lea psl_nv_publish,%a3
	move.b %d6,10(%a6)
.L806:
	move.l 54(%sp),%d1
	btst %d2,%d1
	jeq .L803
	move.l 58(%sp),%a1
	sub.l %a0,%a0
.L805:
	move.b (%a1)+,%d1
	move.b 511(%a1),%d0
	mvz.b %d1,%d1
	mvz.b %d0,%d4
	cmp.l %d1,%d4
	jeq .L804
	not.l %d0
	tst.b %d0
	sne %d0
	neg.l %d0
	move.b %d0,(%a2,%a0.l)
.L804:
	addq.l #1,%a0
	moveq #64,%d5
	cmp.l %a0,%d5
	jne .L805
	move.l %a2,-(%sp)
	move.l 70(%sp),%a0
	move.l 24(%a0),-(%sp)
	move.l %d2,-(%sp)
	move.l source_row,-(%sp)
	move.l #269455360,-(%sp)
	jsr (%a3)
	lea (20,%sp),%sp
.L803:
	moveq #64,%d0
	addq.l #1,%d2
	lea (64,%a2),%a2
	moveq #8,%d1
	addq.l #4,66(%sp)
	add.l %d0,58(%sp)
	cmp.l %d2,%d1
	jne .L806
	move.l 380(%sp),%a0
	addq.l #1,origin_epoch
	subq.l #1,writer_depth
	move.l 54(%sp),(%a0)
	jra .L764
.L812:
	moveq #3,%d3
	jra .L789
.L814:
	moveq #3,%d3
	jra .L790
.L816:
	moveq #3,%d3
	jra .L792
.L802:
	move.l %d0,%d4
	add.l #16,%d4
	move.l %d4,%d1
	cmp.l %d4,%d2
	jcc .L801
	move.l %d2,%d1
.L801:
	move.l %d1,-(%sp)
	move.l %d0,-(%sp)
	jsr (%a2)
	addq.l #8,%sp
	move.l %d4,%d0
	jra .L800
.L808:
	move.l %d2,%d3
	jra .L764
.L809:
	moveq #4,%d3
	jra .L764
	.size	psl_commit_locked.constprop.0, .-psl_commit_locked.constprop.0
	.align	2
	.globl	psl_native_stop
	.type	psl_native_stop, @function
psl_native_stop:
	lea (-12,%sp),%sp
	movem.l #1036,(%sp)
	move.b 1175456541,%d0
	btst #5,%d0
	jeq .L860
.L862:
	clr.l %d0
.L859:
	movem.l (%sp),#1036
	lea (12,%sp),%sp
	rts
.L860:
	tst.w 1175263050.l
	jne .L862
#APP
| 87 "sdk/drafts/pattern-sample-locks/native.c" 1
	move.w %sr,%d3
	move.w #0x2700,%sr
| 0 "" 2
#NO_APP
	move.b 1175456540,%d2
	pea 36.w
	move.l #1074340436,%a2
	jsr (%a2)
	moveq #-128,%d0
	or.l %d2,%d0
	mvz.b %d0,%d0
	move.l %d0,-(%sp)
	jsr (%a2)
	pea 36.w
	jsr (%a2)
	moveq #127,%d0
	and.l %d2,%d0
	move.l %d0,-(%sp)
	jsr (%a2)
#APP
| 90 "sdk/drafts/pattern-sample-locks/native.c" 1
	move.w %d3,%sr
| 0 "" 2
#NO_APP
	moveq #1,%d0
	lea (16,%sp),%sp
	jra .L859
	.size	psl_native_stop, .-psl_native_stop
	.align	2
	.globl	psl_native_observe_key
	.type	psl_native_observe_key, @function
psl_native_observe_key:
	lea (-12,%sp),%sp
	movem.l #1036,(%sp)
	tst.l 20(%sp)
	jeq .L863
	move.l 16(%sp),%d0
	add.l #-39,%d0
	lsr.l #1,%d0
	jne .L863
	tst.w 1175263050.l
	jne .L865
	move.b 1175456541,%d0
	btst #5,%d0
	jeq .L863
.L865:
	move.l 1187521622,%d2
	move.b 269161680,%d3
	move.l %d2,-(%sp)
	jsr bank_valid
	addq.l #4,%sp
	tst.l %d0
	jeq .L863
	mvz.b %d3,%d3
	moveq #15,%d0
	cmp.l %d3,%d0
	jcs .L863
	jsr project_identity
	tst.l %d0
	jeq .L863
	pea identity
	move.l #269455360,-(%sp)
	jsr psl_nv_matches
	addq.l #8,%sp
	tst.l %d0
	jeq .L863
	add.l #-1074668000,%d2
	move.l #635712,%d1
	divu.l %d1,%d2
	lea psl_nv_invalidate,%a2
	mvz.w %d2,%d2
	lsl.l #4,%d2
	add.l %d3,%d2
	clr.l %d3
.L866:
	move.l %d3,-(%sp)
	move.l %d2,-(%sp)
	move.l #269455360,-(%sp)
	jsr (%a2)
	addq.l #1,%d3
	lea (12,%sp),%sp
	moveq #8,%d0
	cmp.l %d3,%d0
	jne .L866
	addq.l #1,origin_epoch
.L863:
	movem.l (%sp),#1036
	lea (12,%sp),%sp
	rts
	.size	psl_native_observe_key, .-psl_native_observe_key
	.align	2
	.globl	psl_manual_sample
	.type	psl_manual_sample, @function
psl_manual_sample:
	subq.l #4,%sp
	move.l %d2,-(%sp)
	moveq #7,%d2
	move.l 12(%sp),%d0
	move.l %d0,4(%sp)
	mvz.b 269161676,%d0
	mvz.b 269161680,%d1
	move.l %d1,%a0
	cmp.l %d0,%d2
	jcs .L886
	moveq #1,%d1
	lsl.l %d0,%d1
.L884:
	moveq #15,%d0
	cmp.l %a0,%d0
	jcs .L887
	moveq #1,%d0
	move.l %a0,%d2
	lsl.l %d2,%d0
.L885:
	clr.l -(%sp)
	move.l %d1,-(%sp)
	move.l %d0,-(%sp)
	jsr psl_foreign_begin
	move.l 16(%sp),-(%sp)
	jsr psl_stock_sample_write
	lea (16,%sp),%sp
	move.l (%sp)+,%d2
	addq.l #4,%sp
	jra psl_foreign_end
.L886:
	clr.l %d1
	jra .L884
.L887:
	clr.l %d0
	jra .L885
	.size	psl_manual_sample, .-psl_manual_sample
	.align	2
	.globl	psl_native_commit
	.type	psl_native_commit, @function
psl_native_commit:
	link.w %fp,#-8
	move.l %d3,-(%sp)
	move.l %d2,-(%sp)
	clr.l -4(%fp)
#APP
| 127 "sdk/drafts/pattern-sample-locks/native.c" 1
	move.w %sr,%d3
| 0 "" 2
#NO_APP
	move.l %d3,%d0
	and.l #1792,%d0
	cmp.l #1023,%d0
	jhi .L889
	move.l %d3,%d0
	and.l #-1793,%d0
	bset #10,%d0
#APP
| 129 "sdk/drafts/pattern-sample-locks/native.c" 1
	move.w %d0,%sr
| 0 "" 2
#NO_APP
.L889:
	pea -4(%fp)
	move.l 8(%fp),-(%sp)
	jsr (psl_commit_locked.constprop.0)
	move.l %d0,%d2
#APP
| 212 "sdk/drafts/pattern-sample-locks/native.c" 1
	move.w %d3,%sr
| 0 "" 2
#NO_APP
	addq.l #8,%sp
	tst.l %d0
	jne .L888
	move.l -4(%fp),%d3
	tst.l %d3
	jeq .L888
	jsr 1073905152
	clr.l -8(%fp)
.L892:
	move.l -8(%fp),%d0
	btst %d0,%d3
	jeq .L891
	move.l %d0,-(%sp)
	jsr 1074387488
	addq.l #4,%sp
.L891:
	addq.l #1,-8(%fp)
	moveq #8,%d0
	cmp.l -8(%fp),%d0
	jne .L892
.L888:
	move.l %d2,%d0
	move.l -16(%fp),%d2
	move.l -12(%fp),%d3
	unlk %fp
	rts
	.size	psl_native_commit, .-psl_native_commit
	.align	2
	.type	finish_action, @function
finish_action:
	pea plan
	jsr psl_native_commit
	addq.l #4,%sp
	lea CSWTCH.243,%a0
	lea (%a0,%d0.l*4),%a0
	clr.b %d0
	move.l (%a0),message
	move.b %d0,plan+10
	moveq #4,%d0
	move.l %d0,phase
	moveq #1,%d0
	move.l %d0,1187497772
	rts
	.size	finish_action, .-finish_action
	.section	.rodata.str1.1
.LC21:
	.string	"RECORDER ACTIVE - REFUSED"
.LC22:
	.string	"STOP TIMED OUT - REFUSED"
	.text
	.align	2
	.globl	module_tick
	.type	module_tick, @function
module_tick:
	moveq #1,%d0
	cmp.l phase.l,%d0
	jne .L902
	jsr psl_native_popup
	subq.l #1,%d0
	tst.l %d0
	jeq .L902
	jsr close_view
.L902:
	move.l phase,%d0
	moveq #1,%d1
	cmp.l %d0,%d1
	jcc .L903
	subq.l #4,%d0
	tst.l %d0
	jeq .L903
	mvz.b captured+5,%d0
	move.l %d0,-(%sp)
	mvz.b captured+4,%d0
	move.l %d0,-(%sp)
	move.l captured,-(%sp)
	jsr psl_native_context
	lea (12,%sp),%sp
	tst.l %d0
	jne .L904
.L906:
	jsr close_view
.L905:
	moveq #5,%d0
	cmp.l phase.l,%d0
	jne .L903
	jsr psl_native_transport
	tst.l %d0
	jne .L907
	jsr finish_action
.L903:
	move.l phase,%d0
	moveq #24,%d1
	move.l 4(%sp),%a0
	lsl.l %d1,%d0
	move.l selected,%d1
	swap %d1
	clr.w %d1
	or.l %d1,%d0
	mvz.w plan+1632,%d1
	or.l %d1,%d0
	move.l %d0,(%a0)
	rts
.L904:
	jsr psl_native_popup
	tst.l %d0
	jne .L906
	jra .L905
.L907:
	subq.l #2,%d0
	tst.l %d0
	jeq .L910
	move.l stop_ticks,%d0
	addq.l #1,%d0
	move.l %d0,stop_ticks
	moveq #119,%d1
	cmp.l %d0,%d1
	jcc .L909
	move.l #.LC22,%d0
.L908:
	move.l %d0,message
	moveq #4,%d1
	move.l %d1,phase
	clr.b %d0
	move.b %d0,plan+10
	moveq #1,%d0
	move.l %d0,1187497772
	jra .L903
.L910:
	move.l #.LC21,%d0
	jra .L908
.L909:
	tst.l stop_requested
	jne .L903
	jsr psl_native_stop
	move.l %d0,stop_requested
	jra .L903
	.size	module_tick, .-module_tick
	.section	.rodata.str1.1
.LC23:
	.string	"ACTIVE PATTERN ONLY"
.LC24:
	.string	"SOURCE CHANGED - REOPEN"
.LC25:
	.string	"SELECT TRACKS FIRST"
.LC26:
	.string	"CHECK SAMPLE ASSIGNMENTS"
	.text
	.align	2
	.globl	module_key
	.type	module_key, @function
module_key:
	lea (-124,%sp),%sp
	moveq #63,%d1
	movem.l #19516,(%sp)
	move.l 128(%sp),%a6
	move.l 132(%sp),%d0
	cmp.l %a6,%d1
	jcs .L918
	moveq #31,%d3
	move.l %a6,%d2
	move.l %a6,%d1
	and.l %d3,%d2
	moveq #1,%d3
	lsr.l #5,%d1
	lea consumed,%a0
	move.l (%a0,%d1.l*4),%a1
	lsl.l %d2,%d3
	move.l %a1,%d2
	and.l %d3,%d2
	tst.l %d0
	jne .L919
	tst.l %d2
	jeq .L920
	not.l %d3
	move.l %a1,%d5
	and.l %d3,%d5
	move.l %d5,(%a0,%d1.l*4)
.L921:
	moveq #1,%d0
	jra .L920
.L919:
	tst.l %d2
	jne .L921
	move.l phase,%d4
	moveq #5,%d5
	cmp.l %d4,%d5
	jeq .L922
	move.l %d0,-(%sp)
	move.l %a6,-(%sp)
	jsr psl_native_observe_key
	addq.l #8,%sp
	tst.l %d4
	jeq .L918
	move.l %a6,%d0
	moveq #3,%d1
	add.l #-49,%d0
	cmp.l %d0,%d1
	jcc .L924
	add.l #17,%d0
	lsr.l #1,%d0
	jeq .L924
.L927:
	jsr close_view
.L918:
	clr.l %d0
.L920:
	movem.l (%sp),#19516
	lea (124,%sp),%sp
	rts
.L922:
	moveq #39,%d0
	cmp.l %a6,%d0
	jeq .L918
	move.l %a1,%d5
	moveq #50,%d0
	or.l %d3,%d5
	move.l %d5,(%a0,%d1.l*4)
	cmp.l %a6,%d0
	jne .L921
.L929:
	jsr close_view
	jra .L921
.L924:
	moveq #1,%d0
	cmp.l %d4,%d0
	jne .L925
	moveq #49,%d1
	cmp.l %a6,%d1
	jne .L926
	moveq #3,%d5
	cmp.l cursor.l,%d5
	jcc .L927
.L925:
	or.l %d3,consumed+4
	moveq #50,%d1
	cmp.l %a6,%d1
	jne .L928
	subq.l #3,%d4
	tst.l %d4
	jne .L929
	clr.b %d0
	moveq #2,%d5
	move.l %d5,phase
	clr.l message
	move.b %d0,plan+10
.L939:
	moveq #1,%d1
	move.l %d1,1187497772
	jra .L921
.L926:
	moveq #50,%d0
	cmp.l %a6,%d0
	jne .L925
	jra .L927
.L928:
	move.l %a6,%d0
	moveq #1,%d3
	add.l #-51,%d0
	cmp.l %d0,%d3
	jcc .L930
	add.l #19,%d0
	cmp.l %d0,%d3
	jcs .L931
.L930:
	move.l %a6,-(%sp)
	jsr move
	addq.l #4,%sp
	jra .L921
.L931:
	moveq #1,%d5
	cmp.l %d4,%d5
	jne .L932
	moveq #4,%d1
	cmp.l cursor.l,%d1
	sne %d0
	mvs.b %d0,%d0
	neg.l %d0
	move.l %d0,action
	jsr psl_native_close_popup
	pea captured
	jsr psl_native_source
	addq.l #4,%sp
	tst.l %d0
	jne .L933
	move.l #.LC23,%d3
	moveq #4,%d5
	move.l %d3,message
	moveq #1,%d0
	move.l %d5,phase
	move.l %d0,1187497772
	jra .L921
.L933:
	clr.b %d5
	mvz.b captured+6,%d1
	moveq #2,%d3
	clr.l cursor
	clr.l replace
	move.l %d1,eligible
	clr.l selected
	move.l %d3,phase
	clr.l message
	move.b %d5,plan+10
	tst.l %d1
	jeq .L934
	clr.b %d3
.L935:
	move.l %d1,%d4
	lsr.l %d2,%d4
	move.l %d2,%a0
	addq.l #1,%d2
	btst #0,%d4
	jeq .L946
	tst.b %d3
	jeq .L934
	move.l %a0,cursor
.L934:
	moveq #1,%d1
	move.l %d1,1187497772
	jra .L920
.L946:
	moveq #1,%d3
	jra .L935
.L932:
	moveq #2,%d3
	cmp.l %d4,%d3
	jne .L936
	lea (32,%sp),%a6
	move.l %a6,-(%sp)
	clr.l message
	jsr psl_native_source
	addq.l #4,%sp
	tst.l %d0
	jeq .L937
	move.l 32(%sp),%d4
	cmp.l captured.l,%d4
	jne .L937
	mvz.w captured+4,%d1
	mvz.w 36(%sp),%d0
	cmp.l %d1,%d0
	jne .L937
	move.b 38(%sp),%d3
	mvz.b %d3,%d0
	cmp.l eligible.l,%d0
	jeq .L938
.L937:
	move.l #.LC24,%d5
	moveq #4,%d0
	move.l %d5,message
.L970:
	move.l %d0,phase
	jra .L939
.L938:
	move.w 36(%sp),%d1
	moveq #2,%d5
	move.w %d1,30(%sp)
	move.l replace,-(%sp)
	move.l action,-(%sp)
	move.l selected,-(%sp)
	move.l %a6,-(%sp)
	pea plan
	jsr psl_prepare
	lea (20,%sp),%sp
	cmp.l %d0,%d5
	jne .L940
	lea .LC25,%a0
	move.l %a0,message
	jra .L939
.L940:
	tst.l %d0
	jeq .L941
	lea .LC26,%a2
	move.l %a2,message
	jra .L939
.L941:
	move.w 30(%sp),%a3
	move.b %d3,captured+6
	move.l %sp,%d0
	add.l #39,%d0
	move.l %d4,captured
	lea captured+7,%a6
	lea (56,%sp),%a1
	lea captured+24,%a0
	move.w %a3,captured+4
.L942:
	move.l %d0,%a2
	addq.l #1,%d2
	move.b (%a2)+,(%a6)+
	moveq #8,%d1
	move.b 7(%a2),7(%a6)
	lea (7,%a2),%a3
	move.l %a2,%d0
	move.l (%a1)+,(%a0)+
	move.l 28(%a1),28(%a0)
	cmp.l %d2,%d1
	jne .L942
	lea (120,%sp),%a0
	moveq #3,%d0
	move.l (%a0),captured+88
	jra .L970
.L936:
	subq.l #3,%d4
	tst.l %d4
	jne .L929
	jsr psl_native_transport
	moveq #2,%d5
	cmp.l %d0,%d5
	jne .L943
	clr.b %d0
	lea .LC21,%a0
	moveq #4,%d1
	move.l %a0,message
	move.l %d1,phase
	move.b %d0,plan+10
.L944:
	moveq #1,%d5
	move.l %d5,1187497772
	jra .L921
.L943:
	tst.l %d0
	jne .L945
	jsr finish_action
	jra .L944
.L945:
	moveq #5,%d3
	move.l %d3,phase
	clr.l stop_ticks
	jsr psl_native_stop
	move.l %d0,stop_requested
	jra .L944
	.size	module_key, .-module_key
	.align	2
	.globl	psl_open
	.type	psl_open, @function
psl_open:
	lea (-16,%sp),%sp
	movem.l #60,(%sp)
	move.l 36(%sp),%d2
	move.l 32(%sp),%d3
	move.l 20(%sp),%d5
	move.l 28(%sp),%d4
	move.l %d2,-(%sp)
	move.l %d3,-(%sp)
	move.l %d4,-(%sp)
	move.l 36(%sp),-(%sp)
	move.l %d5,-(%sp)
	jsr 1074190668
	lea (20,%sp),%sp
	subq.l #4,%d5
	tst.l %d5
	jne .L971
	cmp.l #1175261212,%d4
	jne .L971
	cmp.l #1074502420,%d3
	jne .L971
	cmp.l #1074502404,%d2
	jne .L971
	jsr psl_native_popup
	subq.l #1,%d0
	tst.l %d0
	jne .L971
	movem.l (%sp),#60
	lea (16,%sp),%sp
	jra psl_ui_open
.L971:
	movem.l (%sp),#60
	lea (16,%sp),%sp
	rts
	.size	psl_open, .-psl_open
	.align	2
	.globl	psl_trig_paste
	.type	psl_trig_paste, @function
psl_trig_paste:
	subq.l #4,%sp
	move.l %d2,-(%sp)
	moveq #7,%d0
	cmp.l 20(%sp),%d0
	jcs .L976
	move.l 20(%sp),%d2
	moveq #1,%d1
	lsl.l %d2,%d1
.L974:
	moveq #15,%d0
	cmp.l 16(%sp),%d0
	jcs .L977
	move.l 16(%sp),%d2
	moveq #1,%d0
	lsl.l %d2,%d0
.L975:
	clr.l -(%sp)
	move.l %d1,-(%sp)
	move.l %d0,-(%sp)
	jsr psl_foreign_begin
	move.l 40(%sp),-(%sp)
	move.l 40(%sp),-(%sp)
	move.l 40(%sp),-(%sp)
	move.l 40(%sp),-(%sp)
	move.l 40(%sp),-(%sp)
	jsr psl_stock_trig_paste
	lea (32,%sp),%sp
	move.l %d0,4(%sp)
	jsr psl_foreign_end
	move.l 4(%sp),%d0
	move.l (%sp)+,%d2
	addq.l #4,%sp
	rts
.L976:
	clr.l %d1
	jra .L974
.L977:
	clr.l %d0
	jra .L975
	.size	psl_trig_paste, .-psl_trig_paste
	.align	2
	.globl	psl_track_paste
	.type	psl_track_paste, @function
psl_track_paste:
	subq.l #4,%sp
	move.l %d2,-(%sp)
	moveq #7,%d0
	cmp.l 20(%sp),%d0
	jcs .L981
	move.l 20(%sp),%d2
	moveq #1,%d1
	lsl.l %d2,%d1
.L979:
	moveq #15,%d0
	cmp.l 16(%sp),%d0
	jcs .L982
	move.l 16(%sp),%d2
	moveq #1,%d0
	lsl.l %d2,%d0
.L980:
	clr.l -(%sp)
	move.l %d1,-(%sp)
	move.l %d0,-(%sp)
	jsr psl_foreign_begin
	move.l 32(%sp),-(%sp)
	move.l 32(%sp),-(%sp)
	move.l 32(%sp),-(%sp)
	jsr psl_stock_track_paste
	move.l %d0,28(%sp)
	jsr psl_foreign_end
	lea (24,%sp),%sp
	move.l 4(%sp),%d0
	move.l (%sp)+,%d2
	addq.l #4,%sp
	rts
.L981:
	clr.l %d1
	jra .L979
.L982:
	clr.l %d0
	jra .L980
	.size	psl_track_paste, .-psl_track_paste
	.align	2
	.globl	psl_pattern_paste
	.type	psl_pattern_paste, @function
psl_pattern_paste:
	subq.l #4,%sp
	moveq #15,%d0
	cmp.l 12(%sp),%d0
	jcs .L985
	move.l 12(%sp),%d1
	moveq #1,%d0
	lsl.l %d1,%d0
.L984:
	clr.l -(%sp)
	pea 255.w
	move.l %d0,-(%sp)
	jsr psl_foreign_begin
	move.l 24(%sp),-(%sp)
	move.l 24(%sp),-(%sp)
	jsr psl_stock_pattern_paste
	move.l %d0,20(%sp)
	jsr psl_foreign_end
	move.l 20(%sp),%d0
	lea (24,%sp),%sp
	rts
.L985:
	clr.l %d0
	jra .L984
	.size	psl_pattern_paste, .-psl_pattern_paste
	.align	2
	.globl	psl_undo
	.type	psl_undo, @function
psl_undo:
	subq.l #4,%sp
	clr.l -(%sp)
	pea 255.w
	move.l #65535,-(%sp)
	jsr psl_foreign_begin
	move.l 28(%sp),-(%sp)
	move.l 28(%sp),-(%sp)
	move.l 28(%sp),-(%sp)
	jsr psl_stock_undo
	move.l %d0,24(%sp)
	jsr psl_foreign_end
	move.l 24(%sp),%d0
	lea (28,%sp),%sp
	rts
	.size	psl_undo, .-psl_undo
	.align	2
	.globl	psl_track_clear
	.type	psl_track_clear, @function
psl_track_clear:
	subq.l #4,%sp
	move.l %d2,-(%sp)
	moveq #1,%d0
	move.l 20(%sp),%d1
	and.l 20(%sp),%d0
	btst #0,%d1
	jeq .L988
	moveq #7,%d2
	cmp.l 16(%sp),%d2
	jcs .L990
	move.l 16(%sp),%d1
	moveq #1,%d0
	lsl.l %d1,%d0
.L988:
	moveq #15,%d2
	cmp.l 12(%sp),%d2
	jcs .L991
	move.l 12(%sp),%d2
	moveq #1,%d1
	lsl.l %d2,%d1
.L989:
	clr.l -(%sp)
	move.l %d0,-(%sp)
	move.l %d1,-(%sp)
	jsr psl_foreign_begin
	move.l 32(%sp),-(%sp)
	move.l 32(%sp),-(%sp)
	move.l 32(%sp),-(%sp)
	jsr psl_stock_track_clear
	move.l %d0,28(%sp)
	jsr psl_foreign_end
	lea (24,%sp),%sp
	move.l 4(%sp),%d0
	move.l (%sp)+,%d2
	addq.l #4,%sp
	rts
.L990:
	clr.l %d0
	jra .L988
.L991:
	clr.l %d1
	jra .L989
	.size	psl_track_clear, .-psl_track_clear
	.align	2
	.globl	psl_banks_load
	.type	psl_banks_load, @function
psl_banks_load:
	subq.l #4,%sp
	move.l 12(%sp),%d1
	mvz.w %d1,%d1
	tst.w 14(%sp)
	jeq .L997
	move.l #65535,%d0
.L996:
	move.l %d1,-(%sp)
	pea 255.w
	move.l %d0,-(%sp)
	jsr psl_foreign_begin
	move.l 32(%sp),-(%sp)
	move.l 32(%sp),-(%sp)
	move.l 32(%sp),-(%sp)
	move.l 32(%sp),-(%sp)
	jsr psl_stock_banks_load
	move.l %d0,28(%sp)
	jsr psl_foreign_end
	move.l 28(%sp),%d0
	lea (32,%sp),%sp
	rts
.L997:
	clr.l %d0
	jra .L996
	.size	psl_banks_load, .-psl_banks_load
	.align	2
	.globl	psl_bank_read
	.type	psl_bank_read, @function
psl_bank_read:
	lea (-12,%sp),%sp
	move.l 24(%sp),%d0
	movem.l #28,(%sp)
	move.l 16(%sp),%d4
	move.l 20(%sp),%d3
	tst.l %d0
	jeq .L999
	move.l %d3,20(%sp)
	move.l %d4,16(%sp)
	movem.l (%sp),#28
	move.l %d0,24(%sp)
	lea (12,%sp),%sp
	jra psl_stock_bank_read
.L999:
	move.l %d3,%d0
	move.l %d3,%d2
	add.l #-1208885728,%d0
	cmp.l #9535680,%d0
	jhi .L1000
	add.l #-134217728,%d2
.L1000:
	move.l %d2,-(%sp)
	jsr bank_valid
	addq.l #4,%sp
	tst.l %d0
	jeq .L1003
	add.l #-1074668000,%d2
	move.l #635712,%d1
	divu.l %d1,%d2
	moveq #1,%d0
	lsl.l %d2,%d0
.L1001:
	move.l %d0,-(%sp)
	pea 255.w
	move.l #65535,-(%sp)
	jsr psl_foreign_begin
	clr.l -(%sp)
	move.l %d3,-(%sp)
	move.l %d4,-(%sp)
	jsr psl_stock_bank_read
	move.l %d0,%d2
	jsr psl_foreign_end
	move.l %d2,%d0
	movem.l 24(%sp),#28
	lea (36,%sp),%sp
	rts
.L1003:
	move.l #65535,%d0
	jra .L1001
	.size	psl_bank_read, .-psl_bank_read
	.section	.rodata.str1.1
.LC27:
	.string	"DONE - PROJECT NOT SAVED"
.LC28:
	.string	"REFUSED - NO CHANGES"
.LC29:
	.string	"OWNERSHIP STORE FULL"
	.section	.rodata
	.align	2
	.type	CSWTCH.243, @object
	.size	CSWTCH.243, 20
CSWTCH.243:
	.long	.LC27
	.long	.LC28
	.long	.LC28
	.long	.LC24
	.long	.LC29
	.type	digit.0, @object
	.size	digit.0, 50
digit.0:
	.base64	"BwUFBQc="
	.base64	"AgYCAgc="
	.base64	"BgEHBAc="
	.base64	"BgECAQY="
	.base64	"BQUHAQE="
	.base64	"BwQGAQY="
	.base64	"AwQHBQc="
	.base64	"BwECAgI="
	.base64	"BwUHBQc="
	.base64	"BwUHAQY="
	.type	alpha.1, @object
	.size	alpha.1, 130
alpha.1:
	.base64	"AgUHBQU="
	.base64	"BgUGBQY="
	.base64	"AwQEBAM="
	.base64	"BgUFBQY="
	.base64	"BwQGBAc="
	.base64	"BwQGBAQ="
	.base64	"AwQFBQM="
	.base64	"BQUHBQU="
	.base64	"BwICAgc="
	.base64	"AQEBBQI="
	.base64	"BQUGBQU="
	.base64	"BAQEBAc="
	.base64	"BQcHBQU="
	.base64	"BQcHBwU="
	.base64	"AgUFBQI="
	.base64	"BgUGBAQ="
	.base64	"AgUFAwE="
	.base64	"BgUGBQU="
	.base64	"AwQCAQY="
	.base64	"BwICAgI="
	.base64	"BQUFBQc="
	.base64	"BQUFBQI="
	.base64	"BQUHBwU="
	.base64	"BQUCBQU="
	.base64	"BQUCAgI="
	.base64	"BwECBAc="
	.globl	psl_lifecycle
	.align	4
	.type	psl_lifecycle, @object
	.size	psl_lifecycle, 4
psl_lifecycle:
	.long	psl_lifecycle_notify
	.globl	psl_guard_spans
	.section	.bss
	.align	2
	.type	psl_guard_spans, @object
	.size	psl_guard_spans, 4
psl_guard_spans:
	.zero	4
	.globl	psl_guard_max
	.align	2
	.type	psl_guard_max, @object
	.size	psl_guard_max, 4
psl_guard_max:
	.zero	4
	.local	edits
	.comm	edits,5760,2
	.local	source_row
	.comm	source_row,4,2
	.local	base_boot
	.comm	base_boot,4,2
	.local	base_nonce
	.comm	base_nonce,4,2
	.local	writer_depth
	.comm	writer_depth,4,2
	.local	origin_epoch
	.comm	origin_epoch,4,2
	.local	origin
	.comm	origin,512,1
	.local	identity
	.comm	identity,512,1
	.section	.rodata.str1.1
.LC30:
	.string	"RENAME"
.LC31:
	.string	"RELOAD"
.LC32:
	.string	"SAVE"
.LC33:
	.string	"SAVE ALL"
	.section	.rodata
	.align	2
	.type	part_rows, @object
	.size	part_rows, 24
part_rows:
	.long	.LC30
	.long	.LC31
	.long	.LC32
	.long	.LC33
	.long	.LC0
	.long	.LC1
	.local	encoder_residual
	.comm	encoder_residual,4,2
	.local	consumed
	.comm	consumed,8,2
	.local	message
	.comm	message,4,2
	.local	captured
	.comm	captured,92,2
	.local	plan
	.comm	plan,1636,2
	.local	eligible
	.comm	eligible,4,2
	.local	action
	.comm	action,4,2
	.local	replace
	.comm	replace,4,2
	.local	selected
	.comm	selected,4,2
	.local	cursor
	.comm	cursor,4,2
	.local	phase
	.comm	phase,4,2
	.local	stop_requested
	.comm	stop_requested,4,2
	.local	stop_ticks
	.comm	stop_ticks,4,2
	.type	digits, @object
	.size	digits, 70
digits:
	.base64	"DhETFRkRDg=="
	.base64	"BAwEBAQEDg=="
	.base64	"DhEBAgQIHw=="
	.base64	"HgEBDgEBHg=="
	.base64	"AgYKEh8CAg=="
	.base64	"HxAQHgEBHg=="
	.base64	"DhAQHhERDg=="
	.base64	"HwECBAgICA=="
	.base64	"DhERDhERDg=="
	.base64	"DhERDwEBDg=="
	.type	letters, @object
	.size	letters, 182
letters:
	.base64	"DhERHxEREQ=="
	.base64	"HhERHhERHg=="
	.base64	"DhEQEBARDg=="
	.base64	"HhERERERHg=="
	.base64	"HxAQHhAQHw=="
	.base64	"HxAQHhAQEA=="
	.base64	"DhEQFxERDg=="
	.base64	"ERERHxEREQ=="
	.base64	"HwQEBAQEHw=="
	.base64	"AQEBARERDg=="
	.base64	"ERIUGBQSEQ=="
	.base64	"EBAQEBAQHw=="
	.base64	"ERsVFREREQ=="
	.base64	"ERkVExEREQ=="
	.base64	"DhERERERDg=="
	.base64	"HhERHhAQEA=="
	.base64	"DhERERUSDQ=="
	.base64	"HhERHhQSEQ=="
	.base64	"DxAQDgEBHg=="
	.base64	"HwQEBAQEBA=="
	.base64	"ERERERERDg=="
	.base64	"EREREREKBA=="
	.base64	"ERERFRUVCg=="
	.base64	"EREKBAoREQ=="
	.base64	"EREKBAQEBA=="
	.base64	"HwECBAgQHw=="
	.align	2
	.type	nv_crc_nibble, @object
	.size	nv_crc_nibble, 64
nv_crc_nibble:
	.long	0
	.long	498536548
	.long	997073096
	.long	651767980
	.long	1994146192
	.long	1802195444
	.long	1303535960
	.long	1342533948
	.long	-306674912
	.long	-267414716
	.long	-690576408
	.long	-882789492
	.long	-1687895376
	.long	-2032938284
	.long	-1609899400
	.long	-1111625188
	.local	nv_index_identity
	.comm	nv_index_identity,4,2
	.local	nv_index_store
	.comm	nv_index_store,4,2
	.local	nv_index
	.comm	nv_index,4096,2
	.type	nv_tag, @object
	.size	nv_tag, 8
nv_tag:
	.string	"PSLOWN\003"
	.ident	"GCC: (GNU) 16.2.0"
