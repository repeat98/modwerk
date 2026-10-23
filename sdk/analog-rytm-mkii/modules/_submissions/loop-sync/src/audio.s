| SPDX-License-Identifier: GPL-3.0-or-later
| Loop Sync: the audio interrupt's hook.
|
| Detours the audio interrupt just after its LFO call, where the effective
| sound parameter array (each track's 42 values after locks, scenes, slides
| and the LFO) is complete for this block and the voices have not read it yet.
| The 10 bytes replaced are `addql #4,%sp; clrl %d0; lea 0x80005eac,%a0`:
| d0, d1, a0 and a1 are free here (stock sets each before it reads it), so the
| C handler, which keeps d2-d7/a2-a6, needs no register save. The three stock
| instructions are re-emitted, then stock resumes 10 bytes on. The addresses
| come from build.json for each OS release.

        .text
        .globl  loop_sync_audio_gate
        .extern loop_sync_audio

loop_sync_audio_gate:
        addq.l  #4,%sp                            | stock: drop the LFO's argument
        jsr     loop_sync_audio
        clr.l   %d0                               | stock
        lea     loop_sync_lfo_area,%a0            | stock
        jmp     loop_sync_audio_resume
