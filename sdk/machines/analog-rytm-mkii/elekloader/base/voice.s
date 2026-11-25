| SPDX-License-Identifier: GPL-3.0-or-later
| Modwerk's Analog Rytm MKII base: ev_sound_applied's site.
|
| Stock's routine that applies a sound to a track (0x4011f60a: kit and sound loads,
| a trig's sound lock, SOUND SETTINGS) copies the sound's machine and settings into
| the audio side's per-track arrays, with the sound in a2 and the track in d2. The
| site is its second array's `lea 0x8000ea0c,%a0` (6 bytes), after the track's
| machine byte (0x8000ea00) is written; d0 (84) and d1 (0) are live there. The jsr
| that replaces it calls mw_voice_applied(sound, track) with d0, d1 and a1 kept,
| then runs the displaced instruction. (Sample Rate gates the first array's lea at
| 0x4011f642 itself; it can subscribe to ev_sound_applied once its builds take the
| base.)

        .text
        .globl  mw_voice_applied_gate
        .extern mw_voice_applied

mw_voice_applied_gate:
        lea     -12(%sp),%sp
        movem.l %d0-%d1/%a1,(%sp)
        move.l  %d2,-(%sp)                      | the track
        move.l  %a2,-(%sp)                      | the sound
        jsr     mw_voice_applied
        addq.l  #8,%sp
        movem.l (%sp),%d0-%d1/%a1
        lea     12(%sp),%sp
        lea     0x8000ea0c,%a0                  | displaced
        rts
