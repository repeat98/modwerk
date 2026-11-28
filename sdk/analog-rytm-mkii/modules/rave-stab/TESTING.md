# Rave Stab testing

Record only what was observed, on a named build.

## Host tests (0.1.0-experimental, 27 Nov 2026)

`tools/run_host_test.sh` builds `src/ra_dsp.c` for the host with dsp.h's EMAC model and UBSan and runs `tools/host_test.c`; on this macOS it needs `RA_CFLAGS="-isysroot …/MacOSX26.5.sdk"`. 22 checks passed (28 since RH04, GRM's checks replaced by PCH's; 31 since RH05, DEC's by STR's):

- 2^x within 0.006 cents over ±6 octaves; note 60 at T-1 130.81 Hz, T-2 65.41, T 0 261.63, T+1 523.25; TUN 96 +12 semitones exactly; DET 127 moves the second note +30.0 cents and never the root.
- All 13 chords: every note's fundamental is in the spectrum within 12 dB of the loudest line (worst −2.2 dB) and 3 cents of its pitch (worst 0.62). EURK keeps HH Alloy CLSD's intervals.
- VOI 1 leaves nothing at the root (−89 dB) and puts its octave there; VOI 8 puts the fifth two octaves up. A CHD or VOI change after the hit leaves the ringing chord exactly as it was.
- WAV 127 (12 % pulse) has a spectral centroid of 1079 Hz against the square's 562, the saw 724; the narrow pulse's mean is −0.0009 (no DC).
- A saw chord at 1046.5 Hz: its strongest alias under 20 kHz is −30.3 dB under its loudest line.
- DEC 0 falls 60 dB in 25 ms, DEC 126 in 3.09 s; DEC 127 holds within 0.2 dB from 0.5 s to 3.5 s.
- Every chord, wave and DET 127 at velocity 127 peaks at 0.811 at most and never wraps; EURK as a square at velocity 100 peaks at 0.619. Velocity 127 is 8.6 dB over 30. GRM 127 changes the sound. A TUN jump moves 1/8 of the way a block and settles.

A first run found two voices on one note cancelling (VOI 1 of MIN put the root on the octave note at half a period's offset: a square and its half-period shift sum to zero); the oscillators now start at uneven phases.

## Build

`RV01`: the development base's voices variant (`879c6c23`) and rave-stab 0.1.0-experimental, linked by `scripts/link-image.mjs` on stock OS 1.74, sha256 `705ee504c2037b4990793c0502a19aa9ab2588d68823a2947fe7bce34cddad18`, store layout 0x92b7e214, ramSpare 101,056 B against 105,256 B for the base alone (4,200 B for the module). `RH01` holds it with HH Alloy (sha256 `5f059abf…`, ramSpare 94,616 B). Neither run on a unit or in rytm-emu.

## Unit, RH01 (27 Nov 2026)

One MKII on OS 1.74, its flash holding the development base SC02. RH01 (SY RAVE with HH Alloy) RAM-booted over the link (back in 13.2 s, image crc 40a124b0); nothing written to the flash.

- The developer chose SY RAVE on the SD track by hand. The page, read over the link: `T-1 GRM CHD DEC / WAV VOI DET LEV`, so slot 39 draws sound indices A10 B16 C12 D11 / E15 F13 G14 H9. The register's label (T-1) shows on A.
- CPU, the base's `mw_voice_meter` (slot 39) over 20 s while the developer played: 30,331 blocks (one voice ringing throughout), mean 6.76 % of a block, the dearest block since boot 7.95 %.

## Changes after the developer's first listen (RH01, 27 Nov 2026)

The developer, by ear on RH01: very good. WAV's level dipped around 25 and came back; GRM was barely audible; CHD's and VOI's dials stopped near their start (13 and 9 values); some voicings sounded too happy. Fixed in the source, host tests 27 pass:

- WAV: the square fell at PW and rose at the wrap, against the saw, so their crossfade cancelled; both now fall at the wrap, and the square sits at the saw's loudness. Saw and square within 0.03 dB, no dip from 0 to 64.
- GRM: 12 bits to 3, and 48 kHz to 3 kHz (12 kHz at 64).
- CHD and VOI: 0 to 127 in equal zones, so the dial turns end to end.
- VOI (RH03 only): the inversions, which put a higher note in the bass and turned a minor chord major, became voicings that move notes down or open them out with the root kept lowest.

`RH02` (WAV, GRM, the dials; sha256 `714ead79…`) was RAM-booted for the developer's second listen (image crc bde52133). `RH03` adds the new voicings (sha256 `386bb7bd…`), built from RH02's lockfile; not yet booted.

## Changes after RH03 (27 Nov 2026)

The developer, by ear on RH03: the new voicings sound very good. GRM did not add anything the Rytm's own OVR drive does not; they asked for a last touch for the stabs and chose a pitch drop. They also asked for the chord and voicing names on the knobs. In the source, host tests 28 pass:

- GRM is gone; knob B (sound index 16) is PCH, centred: the hit starts the chord up to two octaves above (127) or below (0) its pitch, falling back with a 20 ms time constant (0.368 of its start after 30 blocks; under a cent by 200 ms). Every chord and wave at PCH 0 and 127 with DET 127 at velocity 127 peaks at 0.901 and never wraps.
- CHD and VOI show their names (core_params at order 9, before the base's 10, slot 39's records at indices 12 and 13 only). Not checked on a unit yet.
- A knob that steps one name a click needs a stepped dial in the base: not done.

`RH04` (with HH Alloy, built from RH03's lockfile): sha256 `f9c6fa43f04a347ef939eaedf25343b405776f6b8c2ea4c7f05c7971edd69e15`, ramSpare 94,100 B. RAM-booted over the link (back in 13.2 s, image crc f4903837; the flash still holds SC02). The SYNTH page, read over the link: `T-1 PCH CHD DEC / WAV VOI DET LEV`, PCH's knob a centred dial. The names on CHD and VOI show only while a knob turns: left to the developer.

## Changes after RH04 (27 Nov 2026)

The developer, by ear on RH04: "bestial", the names and PCH included. Asked what DEC could become, since the AMP page has its own decay, they chose a strum. In the source, host tests 31 pass:

- DEC is gone (the level holds, as DEC 127 did) and sound index 11 is STR, centred: up from the lowest note over 64, down from the highest under it, the gap growing with the square of the turn to 43 blocks (29 ms) at 127 and 45 (30 ms) at 0. The order follows the pitches whatever the voicing. At STR 127 the first 29 ms play at 0.41 of the full chord's level; afterwards all six within 0.04 dB of an unstrummed chord. The largest sample step is under 0.5 with a strum from silence and 0.209 with a strum over a ringing chord: no click.

`RH05` (with HH Alloy, from RH04's lockfile): sha256 `cf3ff7402aa9f91be1853b090f22e542e8b0a94047c12e741f0e29a7b5067166`, ramSpare 93,944 B. RAM-booted over the link (back in 10.7 s, image crc 95887f46; the flash still holds SC02).

## Changes after RH05 (27 Nov 2026)

The developer, by ear on RH05: the strum is a good idea; the downward half is not needed. STR now starts at 0 (none) and runs up to 127 as far as it stays a strum: 150 blocks (100 ms) a note, half a second for the chord, upwards only. A first run with those times found the notes' waits clipped at 255 blocks (a byte); they are 16 bits now. Host tests 31 pass: at STR 127 the first 100 ms at 0.41 of the full chord, all six within 0.01 dB afterwards, the largest sample step 0.267 over a ringing chord.

`RH06` (with HH Alloy, from RH05's lockfile): sha256 `96509cc583150f679eeb3b719169f03018cc95af585a03ca10a3999c40e4030b`, ramSpare 93,960 B. RAM-booted over the link (image crc e3c8a7dd; the flash still holds SC02). The developer, by ear on RH06: "excellent".

## Screenshots (28 Nov 2026)

`RV07`: the development base's voices variant (`879c6c23`) and rave-stab 0.1.0-experimental alone, sha256 `d7697d672a32fb3176ab582ad00127d64a9af2ad4d80c7decf0418a955058c7b`, ramSpare 100,400 B. RAM-booted over the link (back in 13.2 s, image crc de8e3c72; the flash still holds SC02). On the SD track: FUNC + SRC lists SY RAVE in the SY section, YES chooses it and the SYNTH page reads `T-1 PCH CHD STR / WAV VOI DET LEV`; a turn of CHD shows the chord's name (EURK, OCT and MIN9 seen). The three screens are in `media/`, their plans in `media/capture.json`.

## Edge cases (0.1.0-experimental, RH06)

| Case | Why this change makes it a risk | How run | Result |
|---|---|---|---|
| CHD and VOI locked on several steps | the chord and voicing are latched at the hit; a lock must change the next hit and never the ringing chord | host test (a change after the hit leaves the ringing chord exactly as it was); not on a unit | not run: on a unit, needs a person to lock steps and listen |
| SY RAVE on BD, SD and BT at once | each voice costs 6.8 % of a block; three ringing together about a fifth | the CPU meter measured one voice (6.76 %, 7.95 % at most) on RH01 | not run: several voices together not measured |
| Project save and power cycle | the register (T-1 … T+1) is kept in the sound's mod storage | — | not run: needs a Keep or flash and a power cycle, left to a device reviewer |
| Other machines' knob text | the `core_params` entry at order 9 sits before the base's text for every hidden slot | code path: it returns PASS for every record whose owner is not slot 39 or whose index is not 12 or 13; on RH04–RH06 SY RAVE's own page read right | not run: another digital voice's page not read beside it |
| STR 127 over a chord still ringing | a waiting note fades out first; a step would click | host test: largest sample step 0.267; the author by ear on RH06 | pass (by ear as reported) |
| PCH at 0 and 127 with DET 127, velocity 127 | the pitch offset and spread add up; the sum must not wrap | host test: peak 0.901, never wraps | pass |
| A sound saved with stock DEC on index 11 | STR reuses DEC's index and CC | read the code: an old DEC value becomes a strum; written in the README | not run on a unit |
| Beside another module on the same base | slot 39 and the order-9 text entry must not clash with another voice machine | RH04–RH06 booted with HH Alloy (slot 41) beside it; `module:doctor` and `modules:check` green | pass |

## Not tested

- On a unit: the register tap, the sound by ear (the developer is playing it), locks, the filter after it, several voices at once, the CPU meter, a project save and a power cycle.
- In rytm-emu: not run.
