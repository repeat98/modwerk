        | SPDX-License-Identifier: GPL-3.0-or-later
        | Modwerk's Analog Rytm MKII base: the amp envelope's record (the table ev_amp_record) and
        | the tracks a module holds silent (mw_amp_silence). modwerk/amp.h is the modules' side.
        |
        | Stock OS 1.74's amp_env_commands (0x40109940, once an audio block) runs each voice's amp
        | envelope state machine, then stores the voice's record for the amp: the rate word at
        | 172/236(a3) and the level word at 168/232(a3) (0x40109c24..0x40109c34). The base takes those
        | four stores, so no module patches them:
        |
        |   1. A voice whose track (0x40291138, voice -> track) has a nonzero mw_amp_silence byte gets a
        |      linear ramp to -128 instead of stock's record: 0xb006a7ec its first block, 0x3006a7ec
        |      after, level 0x80. Stock's state machine keeps running underneath; once the byte is 0
        |      again the voice takes stock's record (an attack ramps up from where it is). The voices
        |      held this block are mw_amp_silenced's bits.
        |   2. Each ev_amp_record entry in turn, by order: d0 the rate word and d2 the level word, in
        |      and out; d3 the voice (0..7), a2 its state (+0 state, +4 hold counter), a3 the frame at
        |      its record, a4 its track's sound slice (+0 ATK, +2 HLD, +4 DEC). An entry may rewrite
        |      d0, d2 and the state's +0, may use d1, d4 and a0, and keeps every other register.
        |   3. Stock's four stores, then stock's loop.
        |
        | With no silenced voice and no entry, a voice costs two table reads and two tests more than
        | stock.

        .equ    VOICE_TRACK,    0x40291138        | voice -> track, bytes
        .equ    STORES_DONE,    0x40109c36        | stock's loop after the four stores
        .equ    FADE_START,     0xb006a7ec        | a linear ramp from the current level
        .equ    FADE_GO_ON,     0x3006a7ec        | the same ramp, continued
        .equ    FADE_LEVEL,     0x00000080        | to -128
        .equ    TRACKS,         12

        .extern ev_amp_record

        .bss
        .globl  mw_amp_silence, mw_amp_silenced
mw_amp_silence:
        .space  TRACKS                            | per track: nonzero holds its voice silent
mw_amp_silenced:
        .space  1                                 | per voice, a bit: held silent this block
        .space  3

        .text
        .globl  mw_amp_record
        .align  2
mw_amp_record:
        lea     VOICE_TRACK,%a0
        moveq   #0,%d1
        move.b  (%a0,%d3.l),%d1
        moveq   #TRACKS,%d4
        cmp.l   %d4,%d1
        bcc.s   2f                                | no track: stock's record
        lea     mw_amp_silence,%a0
        tst.b   (%a0,%d1.l)
        beq.s   2f
        lea     mw_amp_silenced,%a0
        move.l  #FADE_GO_ON,%d0
        bset    %d3,(%a0)
        bne.s   1f                                | held last block: the ramp goes on
        move.l  #FADE_START,%d0
1:      move.l  #FADE_LEVEL,%d2
        bra.s   3f
2:      lea     mw_amp_silenced,%a0
        bclr    %d3,(%a0)
3:      lea     ev_amp_record,%a0
        tst.l   (%a0)
        beq.s   5f
        move.l  %a1,-(%sp)
        movea.l %a0,%a1
4:      movea.l (%a1)+,%a0
        jsr     (%a0)
        tst.l   (%a1)
        bne.s   4b
        movea.l (%sp)+,%a1
5:      move.l  %d0,172(%a3)                      | stock's four stores, as at 0x40109c24
        move.l  %d0,236(%a3)
        moveq   #8,%d0                            | the loop's voice count, as stock
        move.l  %d2,168(%a3)
        move.l  %d2,232(%a3)
        jmp     STORES_DONE
