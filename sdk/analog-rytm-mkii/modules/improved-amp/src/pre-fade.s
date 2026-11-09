        | SPDX-License-Identifier: GPL-2.0-only
        | Improved AMP - ENV RESET reaches AMP (from Env Reset Amp, MrScruff's rytm-mods 0015, and its 1.1 pre-fade).
        |
        | Mod 0015 - ENV RESET AMP: the amp envelope restarts from silence on
        | every trig.
        |
        | The amp envelope runs in the voice hardware, fed segment commands by
        | 0x401098d4: on a trig (state 0) an attack command, rate word
        | 0xB0000000 | atk[ATK] with level word 0x4000007f, and from the next
        | interrupt the hold states resend the attack with nibble 0x3, which
        | ramps from wherever the level is. So a trig on a sounding voice
        | continues from its current level.
        |
        | 1.0 sent stock's decay form at DEC 0 (rate 0xB0100000, level 0x80) in
        | state 0 instead, which took the level to -128 at once and clicked on a
        | sounding voice, most with the oscillator's phase reset on the same trig.
        | 1.1 (Nathaniel Pavel) ramps the voice to silence, at a fixed rate from its
        | current level (under 1 ms to ~3 ms on the unit), up to ~7 ms before a trig the
        | Rytm schedules itself - a sequencer trig or a retrig - so stock's own
        | attack, which ramps from the current level, starts from silence on
        | time. A pad or MIDI hit is not known in advance and plays as stock.
        |
        | Rate word bit 30, which stock sets for ENV RESET FILTER, resets the
        | level to 0 - the filter envelope's neutral point, but half gain on the
        | amp - so it is not used here.

        .equ    VOICE_TRACK,    0x40291138        | voice -> track, bytes
        .equ    TRIG,           0x8000e508        | per track, long: 1 on a trig
        .equ    FADE_START,     0xb006a7ec        | linear ramp from the current level
        .equ    FADE_GO_ON,     0x3006a7ec        | the same ramp, continued
        .equ    FADE_LEVEL,     0x00000080        | to -128
        .equ    ENV_RESET,      0x8000ea30        | per track, byte: bit 0 AMP (12 tracks)

        .text

        | ------------------------------------------------------------------
        | amp_prefade_write: an ev_amp_record entry (modwerk/amp.h, order 20,
        | a rewriter), run by the base once a voice an audio block, in every
        | state, before stock's stores of the voice's record at 0x40109c24.
        |
        | For voice 0 it first runs amp_prefade_scan (pre-fade.c), which marks
        | the voices a scheduled trig with AMP in its ENV RESET will restart
        | within the fade. The scan runs every block: a sound lock can bring
        | AMP to a track whose own sound has it off.
        | For a marked voice that is sounding and was not
        | trigged this block, it sends a linear ramp to -128 instead of the
        | state's command: the ramp (mode B) in its first block, then mode 3 with
        | the same target and rate every block until the trig, as stock's own
        | attack does - a linear ramp resent as B every block falls short on the
        | unit (ER02 measured about -8 dB by the trig). d0 the rate word and d2
        | the level word, in and out; d3 the voice, a2 its state (-1 idle).
        | It uses d1, d4 and a0, as the hook allows, and keeps a1.
        | ------------------------------------------------------------------
        .globl  amp_prefade_write
        .align  2
amp_prefade_write:
        tst.l   %d3
        bne.s   1f
        lea     -16(%sp),%sp                      | once a block, for voice 0
        movem.l %d0-%d1/%a0-%a1,(%sp)
        jsr     amp_prefade_scan
        movem.l (%sp),%d0-%d1/%a0-%a1
        lea     16(%sp),%sp
1:      move.l  amp_prefade_mask,%d1
        btst    %d3,%d1
        beq.s   9f
        tst.l   (%a2)
        bmi.s   9f                                | idle
        lea     VOICE_TRACK,%a0
        mvz.b   (%a0,%d3.l),%d1
        lea     TRIG,%a0
        moveq   #1,%d4
        cmp.l   (%a0,%d1.l*4),%d4
        beq.s   9f                                | trigged this block
        move.l  #FADE_GO_ON,%d0
        move.l  amp_prefade_first,%d1
        btst    %d3,%d1
        beq.s   2f
        move.l  #FADE_START,%d0
2:      move.l  #FADE_LEVEL,%d2
9:      rts
