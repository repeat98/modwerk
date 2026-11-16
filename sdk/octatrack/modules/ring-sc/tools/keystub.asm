; SPDX-License-Identifier: MIT
; SPDX-FileCopyrightText: 2026 Nathaniel Pawelczyk
; Test fixture for verify.py only; never placed in an image. Three "effects"
; that publish their own audio block where the base's key bus (Sidechain
; Compressor's tap made a base feature, KEYBUS) puts a track's, so a second
; instance can be keyed from it in dsp_host:
;   ksloc  to this core's key bus, Y:$800 + track*$40
;   ksfor  to the tracks 1-4 core's publish region, every generation, so a
;          reader on the other core finds it whatever its counter holds
;          (Y:$3be00 + local*$80 + gen*$20)
;   ksfob  the same for the tracks 5-8 core's region, Y:$33e00
; Knob 0 (x:(r6+$0), value<<16) is the track, 0..7 or 0..3.
ksini:
        rts
ksloc:
        move    r0,b
        and     #>$1f,b
        move    b1,x1
        move    x:(r6+$0),b
        asr     #$10,b,b
        move    b1,a
        asl     #6,a,a
        add     x1,a
        move    a1,n1
        move    #>$800,r1
        lua     (r1)+n1,r1
        move    #>$ffffff,m0
        move    #>$ffffff,m1
        do      n7,>ks01
        move    x:(r0)+,x0
        move    x0,y:(r1)+
        move    x:(r0)+,x0
        move    x0,y:(r1)+
ks01:
        rts
ksfor:
        move    r0,b
        and     #>$1f,b
        move    b1,x1
        move    x:(r6+$0),b
        asr     #$10,b,b
        move    b1,a
        asl     #7,a,a
        add     x1,a
        move    a1,n1
        move    #>$3be00,r1
        lua     (r1)+n1,r1
        move    #>$ffffff,m0
        move    #>$ffffff,m1
        move    #>$20,n1
        do      n7,>ks02
        move    x:(r0)+,x0
        move    x0,y:(r1)+n1
        move    x0,y:(r1)+n1
        move    x0,y:(r1)+n1
        move    x0,y:(r1)-n1
        move    (r1)-n1
        move    (r1)-n1
        move    (r1)+
        move    x:(r0)+,x0
        move    x0,y:(r1)+n1
        move    x0,y:(r1)+n1
        move    x0,y:(r1)+n1
        move    x0,y:(r1)-n1
        move    (r1)-n1
        move    (r1)-n1
        move    (r1)+
ks02:
        rts
ksfob:
        move    r0,b
        and     #>$1f,b
        move    b1,x1
        move    x:(r6+$0),b
        asr     #$10,b,b
        move    b1,a
        asl     #7,a,a
        add     x1,a
        move    a1,n1
        move    #>$33e00,r1
        lua     (r1)+n1,r1
        move    #>$ffffff,m0
        move    #>$ffffff,m1
        move    #>$20,n1
        do      n7,>ks03
        move    x:(r0)+,x0
        move    x0,y:(r1)+n1
        move    x0,y:(r1)+n1
        move    x0,y:(r1)+n1
        move    x0,y:(r1)-n1
        move    (r1)-n1
        move    (r1)-n1
        move    (r1)+
        move    x:(r0)+,x0
        move    x0,y:(r1)+n1
        move    x0,y:(r1)+n1
        move    x0,y:(r1)+n1
        move    x0,y:(r1)-n1
        move    (r1)-n1
        move    (r1)-n1
        move    (r1)+
ks03:
        rts
