# Octatrack: the DSP receiver in the shared window (28 October 2026)

A dated record of the beta base change that moved the DSP loader's packet operations into the shared window (`dsp_loader.py`, `dsp_receiver.asm`, the block-3 rule in `build_core.py`), why, and what was measured. The rule for later work is in [OCTATRACK_HARDWARE_TRAPS.md](OCTATRACK_HARDWARE_TRAPS.md).

## Why and how

Octabam's demand loader (sambanks/octabam, 26-28 October 2026) runs effect code from the DSPs' shared window
(`0x30000..0x3ffff`), which both cores execute. Measured on the owner's MKII before taking anything from it (core 0,
stopped, dev builds of this base with `--dsp-burn 2000`, `--dsp-burn-window 0x36000`): idle passes a frame 2,119.2
with no burn, 2,018.8 with the loop in private P (100.4 passes, about 2,000 cycles), 1,915.7 with the same loop at
`P:0x36000` (203.5 passes, about 4,070 cycles). A fetch from the window takes a wait state; data reads do not.

- Effects stay in private P: module DSP time is already the tighter limit (findings 26, 33, 42).
- No code cache in the window: an upload is already under about 40 ms (above, 11 October), Part-switch time is the
  manager's, not the transfer's, and a cache's copy routine would cost arena words on both cores.
- What moved: the receiver's packet operations (WRITE and its read-back, SUM, BIND/UNBIND/BYPASS, BASE, PEEK, the
  refusal records), which run only on a frame with a packet. 489 words a core, at `P:0x37e00` (core 0) and `P:0x3fe00`
  (core 1), the top 512 words of each core's FX2 block 3: past every stock effect's extent (`0x3da3`, which the base
  already relied on for Sidechain's key window at `0x3dfe`) and E-Verb's and Mini Verb's 15,870 words. Both payloads'
  boot loops zero the window, so the payload record leaves the words at the arena's top and the frame path copies them
  out at the first frame, before any packet is read. The frame path, PROBE, the reply and the engines' ops 10 and 11
  stay in private P (the engines' code names private labels).
- The buffer planner (`build_core.py`'s block-3 rule): a buffer past `0x3e00` (catalog byte 2, `dsp.c`
  `BUFFER_READS`: Air Chorus and BBD declare 16,384) never takes or keeps FX2 block 3, and wide buffers are planned
  first. The resident build already keeps every buffered module out of FX2 block 2 (`mw_hook_buffer_permitted_held`:
  stock's staging and mailbox at its head), so a core's FX2 slots now hold two of them at once (were three); E-Verb,
  Mini Verb and every stock effect keep all their blocks. Owner's call, 28 October 2026: accepted for the room.
- Arena, nothing placed: 5,021 / 5,017 → 5,470 / 5,466 words (plain loader); 4,292 / 4,418 → 4,741 / 4,867 (beta
  flags). Finding 53's heavy stock Part needs 4,665 on core 0.
- On the owner's MKII (RAM boots, 28 October 2026): every build's boot uploads went through the window half on both
  cores, 0 rejected, 0 errors, 0 stalls. Beta base `ccc21bc8` (this change alone; the combined base below is `6541d7e9`): self-test passed; the bound Keep/Undo run passed 9 of
  10 steps (Sidechain, Output Matrix, Analog BD, CC Map, Recorder Loop Fix, TapeHead, VECTOR, POLY8, FM Synth, Scale
  Quantizer, Repitch, each self-tested); the tenth was refused because the project's T1 and T5 FX2 named module ids a
  synced module took (the project was then moved to DELAY there and synced to card). Its development twin `8d346525`:
  finding 53's Part loaded whole on core 0 (4,665 words, 8 effects, 0 rollbacks); Air Chorus ran on T1 and T2 FX2, a
  third on T3 was refused MEMORY FULL ("needs a buffer", 2/4), and E-Verb then took T3 (block 3).

## FX2 swaps keep their block

Found while playing the twin like a player: a track swapping one buffered FX2 effect for another (DARK REV to E-Verb on T4) was refused "MEMORY FULL ... NEEDS A BUFFER, FX2 BUFFERS 4/4" whenever the core's four blocks were in use, because the planner reserved the outgoing effect's block until the transition retired. Stock gives every slot a fixed block, and in the switch frame the outgoing effect runs its last sub-block before the incoming one's init, so the slot now keeps its own block (`build_core.py`'s buffers.c edits, `test_window_buffers.c`). Where an effect still finds no block, the box says "NO ROOM", the effect, "FX2 ON T1-4 FULL", "CHANGE ONE FIRST" (`status.c`). On the twin of `00302a7f`, E-Verb replaced DARK REV on T4 with all four blocks in use.

## Played like a player

Owner's steer: test with patterns, banks, Part switches and FX switches and listen for artifacts, not long churn runs. Same 80 s session on development twins of this branch and of `origin/main` (project LIVE/PROJECT 2610192 reloaded to its saved state, BBD, Tape Echo, E-Verb and Air Chorus synced; PLAY, picks of DARK REV, LO-FI, Air Chorus, SPRING and PLATE REV and E-Verb, Part 2 and back, bank B and back), 20 USB channels recorded: MAIN 0 dropouts and 0 clicks on both builds, the largest second difference within 400 ms of each action within 2 % between them, 0 rejected packets and 0 rollbacks. A 2.2 ms run of exact zeros on T4 about 1.3 s after DARK REV was picked there appears on both builds (not this change; cause not looked at). The combined base `6541d7e9` (with fix/base-oct28 and the firmware codec) RAM-booted, passed its self-test and synced Sidechain, Analog BD, E-Verb and BBD with a passing self-test; its twin `54180e46` played the same session as `origin/main`.
