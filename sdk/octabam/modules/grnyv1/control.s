#NO_APP
	.file	"control.c"
	.text
	.align	2
	.globl	og_size
	.type	og_size, @function
og_size:
	move.l 4(%sp),%d1
	move.l %d1,%d0
	lsr.l #1,%d0
	lea og_lengths_low,%a0
	move.l %d0,%a1
	moveq #119,%d0
	cmp.l %d1,%d0
	scs %d1
	mvz.w (%a0,%a1.l*2),%d0
	mvs.b %d1,%d1
	swap %d1
	clr.w %d1
	sub.l %d1,%d0
	rts
	.size	og_size, .-og_size
	.globl	og_ui_frames
	.text
	.align	4
	.type	og_ui_frames, @object
	.size	og_ui_frames, 4
og_ui_frames:
	.zero	4
	.globl	og_ui_scanned
	.align	4
	.type	og_ui_scanned, @object
	.size	og_ui_scanned, 4
og_ui_scanned:
	.zero	4
	.globl	og_ui_identity
	.align	4
	.type	og_ui_identity, @object
	.size	og_ui_identity, 4
og_ui_identity:
	.zero	4
	.globl	og_cached_track
	.align	4
	.type	og_cached_track, @object
	.size	og_cached_track, 4
og_cached_track:
	.long	8
	.globl	og_ui_wait
	.align	4
	.type	og_ui_wait, @object
	.size	og_ui_wait, 4
og_ui_wait:
	.zero	4
	.text
	.align	2
	.type	og_lengths_low, @object
	.size	og_lengths_low, 128
og_lengths_low:
	.word	441
	.word	480
	.word	522
	.word	568
	.word	617
	.word	672
	.word	730
	.word	795
	.word	864
	.word	940
	.word	1023
	.word	1112
	.word	1210
	.word	1316
	.word	1431
	.word	1557
	.word	1694
	.word	1842
	.word	2004
	.word	2180
	.word	2371
	.word	2579
	.word	2805
	.word	3051
	.word	3319
	.word	3610
	.word	3927
	.word	4272
	.word	4646
	.word	5054
	.word	5498
	.word	5980
	.word	6505
	.word	7075
	.word	7696
	.word	8371
	.word	9106
	.word	9905
	.word	10774
	.word	11719
	.word	12747
	.word	13865
	.word	15082
	.word	16405
	.word	17845
	.word	19410
	.word	21113
	.word	22966
	.word	24981
	.word	27172
	.word	29556
	.word	32150
	.word	-30566
	.word	-27497
	.word	-24160
	.word	-20530
	.word	-16581
	.word	-12286
	.word	-7614
	.word	-2532
	.word	2996
	.word	9009
	.word	15550
	.word	22664
	.ident	"GCC: (GNU) 16.2.0"
