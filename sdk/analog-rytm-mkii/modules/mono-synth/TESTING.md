# Mono Synth testing

Record only what was observed, on a named build.

## Host tests (0.1.0-experimental, 27 Nov 2026)

`tools/run_host_test.sh` builds `src/ms_dsp.c` for the host with dsp.h's EMAC model and UBSan and runs `tools/host_test.c`; on this macOS it needs `MS_CFLAGS="-isysroot …/MacOSX26.5.sdk"`. 37 checks passed (31 for the voice, 6 for the AMP gate since SM04):

- 2^x within 0.006 cents over ±6 octaves; note 60 at 8' 261.626 Hz; 16' to 2' one octave apart each; TUN 0, 72, 96 at −24, +3, +12 semitones within 0.1 cent; the top held at 12 kHz.
- The rendered saw crosses zero 262 times a second at note 60 and peaks at 0.495 alone.
- At 4186 Hz the saw's aliases are −30.4 dB below its harmonics (a naive saw −10.1 dB), the pulse's −31.2 dB; the sub at 2093 Hz −38.5 dB.
- SUB 63 peaks at −1 octave, SUB 127 at −2, SUB 0 is silent. Noise: mean −0.0007, rms 0.29, flat within 0.14 dB between the two halves of the band.
- LFO 0.100 Hz at 0, 1.771 at 64, 29.998 at 127, rising every step; the triangle's corners; MOD 20 ±0.89 semitones, MOD 127 ±35.98 (want ±36) at 1.8 Hz and ±35.19 at 30 Hz (blocks sample the triangle's peaks); the pitch swings at the LFO's rate.
- A SAW lock from 0 to 127 steps at most 0.0009 of full scale a sample; a TUN lock of an octave at most 150 cents a block, then exact.
- Every source at full: the sum clips at full scale and never wraps.

## Build

`SM01`: the development base's voices variant (`879c6c23`) and mono-synth 0.1.0-experimental, linked by `scripts/link-image.mjs` on stock OS 1.74, sha256 `0beae12ada9858a99fd0bf3c89833305d3fcabb74dd2ee73ee8f1ddba6b26775`, ramSpare 102,008 B, a new store layout (0x92b7e214). Its code: 2,142 B for the voice, 721 B and 368 B of state for the machine (m68k-elf-gcc -O2), no library calls.

## Unit, SM01 (27 Nov 2026)

One MKII on OS 1.74, its flash holding the development base SC02. SM01 RAM-booted over the link (`rytm_link.py ramboot`, back in 13 s, `ident`: booted from RAM, image crc 4da52662); nothing written to the flash.

- MIDI CC 15 = 40 on track 1's channel chose the machine. The SYNTH page read `T16 LFO MOD PLS / SAW SUB NSE LEV` (A's label at the first type, 16').
- 16 notes over MIDI (48 to 63, velocity 100), then `mw_voice_meter` (the base's record at 0x47be50c0 in this build) for slot 40: 43,344 blocks rendered, mean 3.26 % of a block (88,000 DTIM0 ticks), dearest block 4.12 %. One voice; the oscillator runs on after each note until the base's silence check ends the hit.

## Unit, SM02 (27 Nov 2026)

SM02 is SM01 with the machine offered on pads 1 to 8 (BD, SD, RS/CP, BT, LT, MT/HT voices), built with SM01's storage lock (the same layout), sha256 `0871bb2e…`, RAM-booted over SM01 (image crc ecac7cca). In a scratch state:

- MIDI CC 15 = 40 and a note on each of the 12 track channels in turn, then the meter at rest: slot 40 rendered 48,168 blocks in 5.35 s, 9,000 a second, which is six voices at 1,500 blocks a second. Six, not eight: the hi-hat and cymbal voices did not take the machine.
- At rest the six render on: the oscillator never falls below the base's -102 dB, so a hit never ends while the track keeps SY MONO, whatever the AMP does. Mean 2.04 % of a block a voice over those blocks, dearest block 4.30 %: about 12 % of the block for six, 26 % at their dearest together.

## Unit, SM03 and SM04: the voice stops when the AMP closes (27 Nov 2026)

SM03 (a probe, not kept) followed `ev_amp_record` and kept each voice's state and record: at rest every voice that had played sat in state 3 (decay) with stock's decay record repeated (level 0x80, rates such as b01a7b2d, b0184147, b0100000) or 0/0, never -1. So the state cannot say the amp has closed. SM04 (sha256 `d8532a31…`, the same storage layout) estimates each fall to silence from its rate word, with margin (`src/ms_gate.c`; the host tests check the estimate against the record format's fall for the rates the unit sent), and renders zeros after it, so the base ends the hit. On the unit, `mw_voice_meter`'s blocks a second for slot 40:

- Booted, the machine on pads 1 to 8 over MIDI, nothing played: 0.
- Every track AMP DEC 50, a note on each: 7,876 just after, 0 five seconds later.
- BD at DEC 127 (INF), a note: 1,500 five seconds later (one voice keeps playing, as it should); BD back at DEC 50 and a note: 0 five seconds later.
- Before (SM02), every voice that had played rendered for ever: 9,000 a second for six.

By ear: not checked whether a long decay is ever cut before it ends.

## Screenshots (27 Nov 2026)

`media/machine-list.png`, `synth-t16.png` and `synth-t8.png`: SM04 on the author's unit, read over the link at 3x after the steps in `media/capture.json`. The list shows SY MONO last in the SY section of BD's machine list; a tap of A stepped the range to 8' (header TUNE 8FT) and three more brought it back to 16'.

## Evidence binding

`evidence.sourceSha256`, worked out in the module's folder as `shasum -a 256 build.json src/machine.c src/ms_dsp.c src/ms_gate.c src/amp_follow.s src/ms_dsp.h src/ms_gate.h | shasum -a 256` (the same as `sha256sum … | sha256sum`), is the source SM04 was built from. Memory: the package's `.run` 3,539 B and `.bss` 480 B, 4,019 B (`scripts/build-elemod-packages.mjs`); no fast RAM.

## The pinned package (27 Nov 2026)

`sdk/imports/packages/mono-synth/mono-synth-0.1.0-experimental-os1.74.elemod` (sha256 `64d9877c…59c3`), committed at `7e495d2f1`: compiled at `1210cbde7` in the pinned toolchain (`sdk/build/Dockerfile`, GCC 16.2.0, image built locally under colima) by `scripts/build-elemod-isolated.sh` twice with identical output, source tree `06e440fa…6686`, and exported by `scripts/package-elemod-recipe.mjs`; `verify-elemod-release-exports.mjs` reproduced the 75 current exports. Pinned in `sdk/imports/elekloader-mono-synth-2026-11-27.json` and `sdk/imports/mono-synth-2026-11-27.json`. SM04 was linked by `scripts/link-image.mjs` from the same `src/` (the same `evidence.sourceSha256`); this exported package has not run on a unit by itself.

## Test procedure (27 Nov 2026)

`npm run test:procedure -- analog-rytm-mkii:mono-synth --package mono-synth-SM04.syx --no-unit` at `981ba53dd`: step 1 stops on the doctor's browser-builder line (no pinned Rytm `.elemod` until the pull request pins this module's package), so steps 2 to 12 did not run from the runner; for the Rytm it has no compatibility gate, cycle scan, soak or price yet. The unit steps were done by hand on SM04 instead, as recorded above: read the unit (`ident`), the machine on every track, the meter at rest and in use, the screenshots, and the unit left on SM04 for the author.

| Case | Why this change makes it a risk | How run | Result |
|---|---|---|---|
| Hi-hat and cymbal tracks | the voice mask covers six voices | CC 15 = 40 and a note on all 12 channels, meter blocks a second | pass: six voices; CH, OH, CY, CB refused |
| A track left on SY MONO at rest | a free-running oscillator never falls silent before LEV | meter 5 s after notes at AMP DEC 50 | pass: 0 blocks a second (SM02: 9,000) |
| AMP DEC INF | the gate must not stop a held voice | BD at DEC 127, a note, meter 5 s later | pass: still rendering |
| A long decay | the gate's estimate could end a tail early | host test against the record format's fall | pass on the host; by ear not run |
| Six voices at once | 4.3 % a voice at worst | meter with six rendering | 26 % of the block together; dropouts not recorded |
| The range tap | the type field and the label | PUSH_A over the link, screenshots | pass: T16 to T8 and back after three more |
| Project save and power cycle | the type is saved with the sound | not run: the author's own stage | not run |

## Not tested

- On a unit: whether a long decay is ever cut short by ear, the range tap, locks, the analog filter after it, several voices at once, a project save and a power cycle.
- In rytm-emu: not run. Whether slot 40 shows any knob as bipolar is unseen.
