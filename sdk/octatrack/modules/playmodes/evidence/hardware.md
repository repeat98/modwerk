# Play Modes: hardware report (functional, author-reported)

- Tester: devilfish707 (the author), Octatrack MKII, OS 1.40C.
- Image: octamod test image `playmodes-test` (this module and the stock
  effects), build 24, source Octaplay `41dbdaa`; MAIN OS SHA-256 recorded in
  `tests.qualification.imageSha256`.
- Dates: builds 12–18 on 3–7 Oct, build 19 for about 15 minutes on 7 Oct,
  builds 20–24 on 8 Oct 2026 (TESTING.md).

Reported working on build 19, and kept in build 20: PINGPONG 2 (the end steps twice); per-pattern
modes across pattern switches; save and reload of the project; modes back
after a power cycle; pattern copy / paste, also into other banks; clear
pattern. Build 20 (8 Oct): the reported length bug is fixed (NORMAL scale
mode LEN 10, switched to PER TRACK, now plays the per-track length); build 21 fixes REVERSED on a
14-step track under MASTER LENGTH 16; build 22 starts PINGPONG over at each
master loop, builds 23–24 do so for a 15-step track too (checked by ear) and
keep the trig LEDs on the played step there.
Earlier builds: the modes, the popup, the trig LEDs following the
played step, PLAY restarts, PER TRACK lengths, MASTER LENGTH INF, pattern
changes across banks and tempo changes (TESTING.md).

Limitations: a short interactive report, not a timed stress run; no audio
or timing measurement; one unit (MKII), no MKI; micro-timing, trig
conditions, slides, live recording, scenes and Parts during non-NORMAL
playback, and MIDI tracks beyond a first check were not tested on purpose;
no combination with other modules on the unit.

Modwerk 0.1.1 imports the build-24 runtime unchanged. The physical save/reload
and reboot results above apply to build 19, not build 24 or Modwerk's composed
release image. Build-24 physical reboot, Part/project reload after unsaved
edits and distinct-track isolation have not been rechecked. No current stock
load/flood benchmark, measured chip timing or stress result is available.

Owner exception, 8 October 2026: “Approve scoped exception and release.”
Applies only to Play Modes 0.1.1-experimental and native source
`86105af37d68fcd051cab991b747c949d7813733b73a1fe6d900cf3ec239c5a6`.
Waives fresh physical reboot, Part/project restore after unsaved edits,
distinct-track isolation and stock/flood performance tests. Retain the
author's MKII functional report; missing checks stay unverified.
