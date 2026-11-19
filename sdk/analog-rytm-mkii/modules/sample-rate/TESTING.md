# Improved SMPL (sample-rate) — test report

Everything below was observed in rytm-emu on the named build. Nothing has run on a unit, and the emulator is not hardware evidence: the Hardware section is empty until the author reports from one.

- Source (0.1.0-experimental): fingerprint (`sha256` of `sha256sum build.json src/audio.s src/rate.c`) `42c5c9d9…b425` (`evidence.sourceSha256`).
- Stock OS 1.74: `.syx` `cb0f99d6…e123`, the owner's file. Core: elekloader core-ar2 0.7 as vendored.
- Build SR04 (core + Sample RATE, `--version SR04`): `.syx` `f8802bc146dacce2e7770ff700f4f1efb9cdc9d265d0faf262214568e7520347`.
- Build SP03 (core + Sample RATE + Pipo Loop 0.1.1-experimental from its local branch, commit `f48b95d9`; test image only): `.syx` `f2316e1bca4e513ec37f49e561e391897e850177327d218a07414ce399ab8c96`.
- Build SA03 (as SP03, with Silent Pad+Trig, Loop Sync and Filter Hz; test image only): `.syx` `ab4b96cae7ecfc17730aec36e78727606da1a75c399ac033b8ca2534f76f4f09`.
- Build SR05 (core + Sample RATE, this source): `.syx` `fcf216bba8ebf1f4db0a52dd01405616577bd8b37e75b84180ade3e2391b9393`.
- Build SP04 (as SR05, with Pipo Loop `b0ed4fe7`, which removes the same step from its own turn; test image only): `.syx` `c86d191ebffd3fb30c8e6376c1cae97189d3eb5c3b7059af6bb5aab6f5dc678d`.
- Build SA04 (as SP04, with Silent Pad+Trig, Loop Sync and Filter Hz; test image only): `.syx` `6c21772a988a637f92a002ddbbc905802a3f90bc3b43e1e598d9cff5068982e1`.
- Build SR06 (core + Sample RATE, this source: row under SMP:, checkbox, tap, stock's value): `.syx` `f6a4ca9e703ad976cb8a6db3f41c4a7c0761dd73a39336e03f96fc55012b289a`.
- Build SP05 (as SR06, with Pipo Loop `b0ed4fe7`; test image only): `.syx` `7a5a9ad4120ed5c21bc526989b0bd764857ce0de31d82d88f16c0c8b69f25501`.
- Build SA05 (as SP05, with Silent Pad+Trig, Loop Sync and Filter Hz; test image only): `.syx` `1096f70b7a348673ae0f571574b90c5b1442872d6393241d68e33d6c248940a0`.
- Build SR07 (core + Sample RATE, this source: the tap survives nudges and bounce): `.syx` `63c970d2fb1d72898332c09564fc658e8303fb83d5385e554292f9cd2501cc24`.
- Build SR08 (core + Sample RATE, this source: no tap with SCNE, PERF or a pad held): `.syx` `04ef1f1af4a5cb4446261f202a8a9897a40efa6963532b1f5b7082990799c88a`.
- Build SP07 (as SR08, with Pipo Loop `b0ed4fe7`; test image only): `.syx` `d0a1a13d9a60abe1dad38276058c5761fef4faacc72bcb874eb18d7de295ec48`.
- Build SR11 (core + Sample RATE, this source: no tap in scene or performance mode): `.syx` `e57111c198562843ad14a6f3e7ae23e8e5d0f233d6d1c007481f6b8dccbac37d`.
- Build SP09 (as SR11, with Pipo Loop `b0ed4fe7`; test image only): `.syx` `104d66314f20ad59fa96ae31a6a668794e2114962eaa8cf58249b0692fd01f0c`.
- Build SR12 (core + Sample RATE, this source: the header follows a tap): `.syx` `bd37af600e1af24a361380f57541296f520da3ac006c8c800fc026c2f222df6d`.
- Build SP10 (as SR12, with Pipo Loop `b0ed4fe7`; test image only): `.syx` `2cf3fb8489166957c5fc2622297b3889cc7105c88c59ca9b6002b9df68877524`.
- Build SR13 (core + Sample RATE, this source: the tap works in scene and performance mode, not with a pad held there): `.syx` `cbe12b5e1a67bca1ca3d6911892ebe0d0757bae446f1206fd4616ae64110514b`.
- Build SP11 (as SR13, with Pipo Loop `b0ed4fe7`; test image only): `.syx` `78210b55cf82ed64337c2fa5ffb58c9c5a7e7431d7f657b6aa00bdcce1f6ebb0`.
- Build SR14 (core + Sample RATE, this source: held SCNE or PERF no longer blocks the tap): `.syx` `a2ee1e521274ffa8201d548504bba41f4b5c0411134c9a2fd06bd0716e1bbd1e`.
- Build SP12 (as SR14, with Pipo Loop `b0ed4fe7`; test image only): `.syx` `bef040aa0cf559a8b3332fa87dda32007b7c4b051a81fd8b3d3cde540f57eede`.
- Build SR15 (core + Sample RATE, this source: no debounce, the tap's rules checked again at release): `.syx` `0c8822cd2f12ef3b7ecaf4e2c3b4efda282e56f4c0e3f23482de4d829542b416`.
- Build SP13 (as SR15, with Pipo Loop `b0ed4fe7`; test image only): `.syx` `221e94bca82b49a56f4179a51df6e01ed472cdcff311475b1ea38a3c86834d5d`.
- A core-only image, same stock and core, for comparison.
- Emulator: rytm-emu `c5732f0`, headless `dtboot`, JIT on. One generated sample, RAMP, 23,777 frames (odd, so STA and END fall on no round multiple), on BD with LOP ON. Audio is dtboot's `--wav`. Voice words are read with `DTBOOT_PEEK`: step at rec + 12, position at rec + 4, effective FIN at 0x8000f7cc. A click means a sample-to-sample step over 40, or six times the median, on a ramp whose normal step is below 2; each run also flags the trig's own attack, which is not counted.

## 0.6.1: Ping Pong Loop retired (2026-11-16)

Ping Pong Loop (`pipo-loop`) leaves the library, so `compatibility.conflicts` no longer names it; nothing else changes. Linked, 0.6.1 gives the same images byte for byte as 0.6.0: MS01 (`5ecfe9cb…ed0d`, vendored core-ar2 0.7 + this module, `--version MS01`) and MSU1 (`a34e9ec9…0579`, the author's development base, RB08's lockfile). So every 0.6.0 result below, the emulator captures and the unit run of MSU1 included, holds for 0.6.1 unchanged.

## 0.6.0: Ping Pong Loop folded in (2026-11-16)

0.6.0 is Improved SMPL 0.5.1 and Ping Pong Loop 0.1.2 in one module. The code is unchanged: Ping Pong Loop's `src/pipo.c`, `src/snap.c` and `src/marks.c` are copied as they were (comments only now name `src/pipo.s`), its `src/audio.s` is `src/pipo.s` here, and its sites, defsyms, cflags and claims join `build.json` as they were. The two modules shared no stock site: their 22 sites do not overlap (checked when merging), and the two audio-block gates stay in their order (RATE's at 0x4012112c, then PIPO's at 0x40121134). Shared cflags (`PARAMS_EFF_AT`, `VOICE_REC_AT`, `VOICE_OWNER_AT`, `TRIG_NEXT_AT`, `FILLRECT_AT`) carry the same values in both. Symbols keep their prefixes (`sample_rate_`, `pipo_loop_`), so none clash.

- Build MS00 (vendored core-ar2 0.7 + Ping Pong Loop 0.1.2 + Improved SMPL 0.5.1, as on main, `--version MS00`): `.syx` `229cb17d6a1b9b7e96611441eadaff360ccb75c78c4377d2e62f60e9502b3e3e`, `ramSpare` 109244.
- Build MS01 (vendored core-ar2 0.7 + this folder's 0.6.0, `--version MS01`): `.syx` `792b0739bea198d65e2348a332fdac20ef4cc4f3536fd82ab7e0d79066b217fd`, `ramSpare` 109232. Core alone: `ramSpare` 118944, so the module takes 9,712 bytes (`resources.memoryBytes`).
- rytm-emu `c5732f0`, headless `dtboot`: every documented capture plan of both former modules (Ping Pong Loop's ten: LOP OFF, ON and PIPO, a PIPO p-lock in GRID RECORDING, PIPO in a scene, FUNC + STA and END on zero crossings, STA and END sharing a crossing and reversed, the playhead, a held trig's STA lock snapped; Improved SMPL's four: TUN in cents, the value row, RATE turning, the LFO destination list) replayed on MS00 and MS01. All 126 frames, the intermediate turn frames included, are byte-identical between the two; no fault, no dropped key. The media/ screens are these MS01 frames ([media/capture.json](media/capture.json)).
- Emulator trap found on the way: rytm-emu `c5732f0` drops a panel event that falls exactly on an `--every` report boundary (`no key named "SMPL" on this machine` in the log), so the setup never reached the SAMPLE page; every plan now runs with `--every 99999M`.
- Development images for the unit, on the author's private development base with the link (send-bus, `--dev`, `0b33f8ec`), linked against the unit's flashed RB08 lockfile: MSU0 (Ping Pong Loop 0.1.2 + Improved SMPL 0.5.1) `.syx` `ac7a5865591ad90314ffcdff3f334f813abe2634ea569842ca4e490c2e66fcbc`, `ramSpare` 76028; MSU1 (this 0.6.0) `.syx` `a34e9ec9bfc1540fbc7125b7b10c1d06e5e848e781c684a5ebc998129b590579`, `ramSpare` 76016. The author's rig cases for Improved SMPL (`sample-rate`, six emulator cases) in rytm-emu's RAM-boot build: the same result on both (one pass; five need references the cache does not hold, and one still expects FIN's pre-0.3.0 default 0x4000), and all 11 captured screens byte-identical.
- Emulator side note: after `CC 30 127` (LOP) the row's LOOP reads ERR on MS00, MS01 and on Improved SMPL 0.5.1 alone, and Ping Pong Loop 0.1.2 alone prints ERR as LOP's value text after a turn; stock 1.74 shows LOP's switch at ON on its knob view. CC 30 writes its value unchanged (Ping Pong Loop's limitation), and the value text has no word for 127. Not changed by the merge; a later version could show ON for any nonzero LOP above 2.

### On the unit (16 Nov 2026)

MSU1 (`.syx` `a34e9ec9bfc1540fbc7125b7b10c1d06e5e848e781c684a5ebc998129b590579`, unpacked CRC `a046b2ee`) RAM-booted on npp1993's Analog Rytm MKII, OS 1.74, over the flashed RB08 (development base with the link), scratch project; the flash was not written.

- **The author's rig** (run by the rig on the unit, not by a person): Improved SMPL's seven cases and five of its unit cases (LFO look, LFO playhead, lock read, playhead at 1x, 0.125x, stop and -0.5x, recording off). No check failed: 7 pass, 5 stop at "no reference" (the cache holds none for the unit). The 26 screens, judged by eye: TUN in cents (+2.04, +0.05 boxed as a held trig's lock, +0.04, -0.02, (0)), the value row, RATE's values, the S and E labels on the lines. The LOOP slot reads ERR in the cases that send `CC 30 127`, as above.
- **The author, by hand, as reported ("all pass"):** the SMPL key opens the waveform view with the row; LOP PIPO plays the loop back and forth with no click at the turns; FUNC + STA and END step to zero crossings, with the S and E labels; RATE down through 0 into reverse with LOP ON and with PIPO; TUN in cents, pressed in semitones; a PIPO lock on a held trig in GRID RECORDING.
- Not run on a unit: several voices in PIPO at once, a scene lock of PIPO, MIDI CC 30 by ear, samples over 0.64 s, a power cycle with PIPO saved, sound browser load, scene and performance locks on RATE.

## 0.5.1: the sample preview plays at 1x (2026-11-16, issue #1591)

rytm-emu, headless `dtboot`; emulator results are not hardware evidence.

- Source (0.5.1-experimental): fingerprint `8645bba7…4c1e` (`evidence.sourceSha256`). Builds on Modwerk base `3ece243b`: SO01 (0.5.0, the reproduction) `.syx` `7a9ca3fd…09e4`, SF02 (this source) `.syx` `d6a0d07a…e288`. SV12 (vendored core-ar2 0.7 + this source, LFO case and screenshots): `.syx` `08dcf7e5…8074`. Stock OS 1.74 and the author's combo RC40 (`5d5241e0`, 0.5.0) for comparison.
- Cause, read in stock's code: the sample preview routine (0x400a0dac, called from 0x400a5236 and 0x400e742e) applies an override to the active track's sound that puts SMP in slot 129 and TUN and FIN at rest (0x4000); LFO modulation is added after it. 0.5.0 read FIN at rest as RATE 0 and scaled the step to 0.
- Reproduction (the card's RAMP in GLOBAL > SAMPLES > incoming, BD active, its sound saved by stock with FIN +0, FUNC held and YES): stock: voice 0's step went from 0x02000000 to 0x08000000, its position advancing 0xdf a 100 M instructions; row FIN 0x4000, SMP 0x81. RC40 and SO01: step 0, position frozen, the preview silent. SF02: step 0x08000000, the position advancing as on stock.
- LFO on RATE (SV12, LFO DEST SAMP:Rate, DEP +16.18, SPD +63, RATE +63): during the preview the row's FIN swung from 0x3097 to 0x4f86 around 0x4000. A first version of the fix that also required FIN at 0x4000 played the preview at a wobbling step that went negative (backward); this source held the step at 0x08000000 and the position ran forward at stock's rate throughout. Stock's own preview would bend in pitch by the LFO's fine tune here; 0.5.1 plays it without the bend.
- Negative RATE (SF02 and stock, CC 25 at 32, RATE -32, before the preview): the step went from 0xff000000 (0.5.1) or 0x02000000 (stock) to 0x08000000 on both, and the position ran forward at the same rate on both.
- LFO on SMP (SV12, triangle, full depth, slot 1): the effective SMP word swung both ways and stayed within 0x0000..0x7fff (held at 0x0000 below), so a project voice never reads as slot 128 or above.
- Normal play unchanged: RAMP in project slot 1 on BD, BD pressed at RATE 100 then 64 (CC 25), and again at RATE 32 (backward): SO01 and SF02 gave identical step, position, FIN and SMP words at every 100 M.
- Screenshots retaken on SV12 with 0.5.0's plans: the same screens, apart from where the playhead stood.
- Unit image SU02 (base 1e92a59a with the link + this source, lock RB08, layout 0x026f1e10): `.syx` `3eb6830e…89fe`; boots and answers the link in rytm-emu. The author's earlier rig cases for this module (`cases/sample-rate`) give the same 1 pass and 5 fails on SU02 as on SU00 (0.5.0, same base): their references predate 0.5.0's screen.
- Not run: a Sound previewed from the SOUND BROWSER whose sample is not in the project (if stock plays it from slot 129, it previews at 1x whatever its RATE).
- Unit (16 Nov 2026, SU02 booted from RAM over RB08 on npp1993's Analog Rytm MKII, OS 1.74, scratch project), as the author reports: FUNC + YES in GLOBAL > SAMPLES previewed at normal speed with the active track at RATE 0, +63 and -64 and with an LFO on RATE; pad play followed RATE. "All good."

## 0.5.0: one row of values over a taller waveform (2026-11-12)

rytm-emu (`c5732f0`, RAMP on BD, LOP ON, RATE +63 by CC 25); emulator results are not hardware evidence. Nothing of 0.5.0 has run on a unit yet.

- Source (0.5.0-experimental): fingerprint `88eb9a55…46f6` (`evidence.sourceSha256`). Build SV02 (vendored core-ar2 0.7 + this source): `.syx` `c2c24d116312b5b6e4dc795f3a41025d1a9f025c40935770075377f16ea15685`. Build SV1P (SV01's source, the same layout code with a saved return slot, + Ping Pong Loop as on main; test image only): `.syx` `f29b7f04…8783`.
- Idle: one row reads (0), +63, 0, ON, 100 (TUN, RATE, BR, LOP, LEV) above a waveform 37 pixels tall (rows 10..46 from the bottom; stock 16..47); no STA, END or SMP text.
- Turning each knob: the header names it (TUNE, RATE, START, LOOP) and the row shows the new value in its place: TUN +0.01 a cent a step, RATE +45 and +29, LOP ON to OFF. START moved its line. D opened stock's sample list over the right half; OFF + YES gave a flat line under the same row.
- BD playing with LOP ON, 16 frames 70 M apart: in rows 9..11 from the bottom and above the waveform, the only lit pixel was the playhead's own, at its current column; no trail.
- Grid record, T1 held: TUN locked to +0.24 and RATE to +61, each boxed in the row with the module's text (the cents show); neighbouring boxes overlap by 2 columns, which XOR to a 2-pixel gap between them. A STA turn with T1 held showed START in the header and no box (no STA place in the row, as designed). 0.4.0 (SR43) compared with the same presses: the same boxes on its eight places.
- With Ping Pong Loop (SV1P, sample loaded by replaying the setup's presses): LOP turned up reads PIPO in the row; its S and E marks sit at the bottom and top of the taller waveform.
- Independent code review: stack and argument layout of the gate against stock's knob loop, registers, mapping, clipping (text clamped, the 27-wide lock box inside 0..127 at the row's ends) and the widget's area checked against stock 1.74; nothing serious. Applied: the gate returns with a jmp to 0x400d20f6 instead of a saved return. Noted: two neighbouring lock boxes overlap (above); in stock's bare lock-editor routine a knob's value text is stock's own, not a module's (not seen in the captures above).
- Lock boxes, changed after the unit report below: the module draws a locked value's box itself, tiling the row (columns 0..25, 27..51, 53..76, 78..101, 103..127, one column between), and passes stock's routine no lock, so stock's 27-wide boxes no longer overlap. Build SV03 (vendored core-ar2 0.7 + this source): `.syx` `8ca41daa87c0360fa30cbd8dc615846824699d5eebbce54aac18b8e69a70ff1f`. rytm-emu, T1 held: TUN (-4.60), RATE (+61), BR and LOP locked, four boxes with one dark column between each, text inside.
- Unit, 12 Nov 2026, as reported by npp1993 on their Analog Rytm MKII (OS 1.74), test image RC38 (`41071e4c…b2ab`: the author's private combo RC37 with this module's first 0.5.0 build, SV02's source, flashed by hand): the row, the knobs, LOOP and PIPO, the playhead and the sound look and sound right. Locking TUN and RATE (and LEV beside LOP) on a held trig, the two boxes met with a 2-pixel black bar between them, and a negative four-digit TUN reached its box's right edge; fixed as above, RC39 (`7c8ed400…069c`, RC38 with SV03's source) not yet on the unit. A trig whose SMP was locked to an empty slot showed no waveform while STA and END were locked on it: stock's behaviour (on each STA, END or SMP change stock reads SMP through the held trig's locks, 0x400d253a, and draws no sample for an empty slot), not this module's.
- No waveform after boot, reported by npp1993 on RC39 (`7c8ed400…`, RC38 with SV03's source): booting into the SMPL page with a sample on BD drew only the centre line until STA or END was turned. Cause, read in stock 1.74: the widget draws the slot in its +0, which stock's page callback 0x400d253a sets, on a parameter or track change only, to SMP's slot or to 0 while that slot has no sample name yet (0x400b8192); at boot it runs before the samples are loaded, and stock's own SAMPLE page sits on its knobs at boot. Fix: while the widget's slot reads 0 the module runs that callback again every 8 ticks. Build SV05 (`9a953918…8c5e`), rytm-emu: with the widget's slot set to 0 by poke, SV03 stayed on the centre line for 700 M; SV05 showed the waveform by the first read (100 M); SMP OFF ran without a fault. Combo RC40 (`5d5241e0…b35e`, RC39 with this source), not yet on the unit. An independent review of the box and slot changes found nothing serious; it notes that with SMP OFF and a trig held whose SMP lock names a loaded sample, the callback can show that sample until the next change (not run).
- Unit, 12 Nov 2026, as reported by npp1993: RC40 (`5d5241e0…b35e`, this source) flashed by hand, three boots into the SMPL page with a sample on BD. Each time the page showed no waveform for a few seconds after boot, then the waveform appeared with no knob touched. On the third boot STA and END were turned straight away: still no waveform until the sample came in, then it showed. Read in stock 1.74: a slot gets its name (0x41942350, written at 0x4009e39e) only when the sample loader (0x4009df72) has read its file whole; the project's pool loads slot by slot (0x400b739c) from background jobs after boot, and the widget takes a slot only once it has a name, so those seconds are stock's load time.
- Not run: a KIT menu or other full-screen menu over the page, scene and performance modes on the SMPL page, a sound with a module's page added behind SMPL (the layout then still applies to the waveform page).

## 0.4.0: the SMPL key shows the waveform only (2026-11-11)

rytm-emu (`c5732f0`) unless it says unit; emulator results are not hardware evidence.

- SR42/SR43 (vendored core-ar2 0.7 + this source; SR43 `0a12166c…`): with the SAMPLE page left on its knob view, the view turns to SMPL WAVEFORM by itself; a second SMPL press stays there (stock toggles to the knobs); AMP then SMPL opens the waveform; SMPL held + PLAY still clears the page (CLEAR PAGE SMPL WAVEFORM, RATE back to +63). SR41, which made the list {5} with index 0, showed the waveform's title over the knob view: the view draws by index, so 0.4.0 keeps the list {4, 5}, counts one page and shows index 1.
- Rig cases on SG04 (`aa073d83…`, the author's private test base + this source), emulator: all six pass, the new sample-rate-smpl-waveform among them (three SMPL presses, the same waveform body each time); the screen references were recorded again in the waveform view.
- Source (0.4.0-experimental): fingerprint `2c8ec3bf…1270` (`evidence.sourceSha256`).
- Hardware, 11 Nov 2026: npp1993's Analog Rytm MKII (OS 1.74, RB08 flashed), scratch project, SG04 (`aa073d83…`, image CRC `a04e51b5`) booted from RAM, flash untouched, run by the author's automated rig with the author's go: 7 cases pass in two runs in a row (one recording the unit references, now compared on the label row only, as the rate-default case clears BD's sample slot): sample-rate-smpl-waveform (three SMPL presses, SMPL WAVEFORM each time), rate-always, rate-default, fine-tun, coarse-tun, func-tun and fine-lock, all on the waveform view.
- Independent code review: no crash, memory or bounds problem; every stock reader of the page list (page key, title, knob ids, CLEAR PAGE, draw, destructor) checked. Noted, not changed: if the change lands while the SAMPLE page is on screen, the header keeps the knob page's title until the next SMPL press; it normally lands at boot.

## 0.3.0: FIN is RATE on every sound (2026-11-11)

Everything in this section ran in rytm-emu (`c5732f0`, RAMP on BD, LOP ON) unless it says unit. Emulator results are not hardware evidence.

- SR30/SR31/SR32 (vendored core-ar2 0.7 + this source as it grew; SR32 `6c18cead…`): with no switch, BD's saved FIN +0 plays as a stop (step word 0); CC 25 127 gives 1x (0x08000000), CC 25 0 gives -1x (0xf8000000), CC 25 64 a stop again.
- Names: FIN's row now points at RATE and Rate, and the two name gates are gone: the SAMPLE page knob and the header while turning read RATE, and the LFO destination list reads SAMP:Rate (0.2.0 read SAMP:Fine Tune there).
- Default: clearing the SAMPLE page (SMPL held, PLAY) sets BD's FIN target to 0x7f00 on SR31; SR07 (0.1.1) sets 0x4000.
- Rig cases on SG02 (`3b9aba2d…`, the author's private test base + this source), emulator: fine-tun, coarse-tun, fine-lock, rate-always (label RATE, CC 25, a tap of encoder B changes nothing) and rate-default pass; func-tun is unit only. In rytm-emu stock's undo of a page clear did not undo it.
- Independent code review: no defect in the link or audio path; one change taken (a track's STA and END swap once a block even if two voices were its own).
- Source (0.3.0-experimental): fingerprint `8b335547…9144` (`evidence.sourceSha256`).

Hardware, 11 Nov 2026: npp1993's Analog Rytm MKII (OS 1.74, RB08 flashed again by the author), scratch project, SG02 (`3b9aba2d…`, image CRC `38dd88f8`) booted from RAM, flash untouched, run by the author's automated rig over USB with the author's go; no person at the unit. 6 cases pass in two runs in a row (one recording the unit references):

| Case (unit) | Measured |
| --- | --- |
| sample-rate-rate-always | knob B reads RATE at rest; CC 25 127 and 64 give 0x7f00 and 0x4000; a tap of encoder B leaves 0x7f00 and the screen as it was |
| sample-rate-rate-default | from 0x4000, clearing the SAMPLE page gives 0x7f00 |
| sample-rate-fine-tun | 0x400a, 0x3ffa, 0x4000; +0.04, -0.02, (0); CC 24 back to 0x4000 |
| sample-rate-coarse-tun | 0x420a, 0x410a; +2.04 |
| sample-rate-func-tun | 0x5800 (stock's jump to +24) |
| sample-rate-fine-lock | the held trig's lock reads +0.05, inverted |

Playhead, the rig on SG02 the same day (no checks, judged by eye from screens and BD's voice position, voice 0 record +4 of 0x2cf9 frames): with the scratch kit's sample looping, RATE set by CC 25, SMPL WAVEFORM's line sat where the voice was: 30 % at 1x (voice 30 %), about 8 % at 0.125x (voice 9 %), and moving back in reverse at -0.5x; at a stop the voice held 0x2cc0 for 1.5 s, at 99.5 %, where the line is hidden by the edge dots. An LFO on RATE moves the same word; in rytm-emu with an LFO on SAMP:Rate the line matched the voice at eight reads.

Lock in cents across a save, as reported by the author on SG02, 11 Nov 2026: a trig on BD with TUN locked to +0.04, the project saved, SG02 booted from RAM again, the project reloaded: the lock reads +0.04. (The rig's own try kept no unsaved edit: a RAM boot reloads the project as last saved.) The author also reports hearing an LFO on RATE change the speed, and, on SG02, SMPL WAVEFORM's playhead moving with an LFO on RATE. Before that, a QPERF performance setup in the scratch project held RATE (and the FILTER page) still, so neither the LFO nor the knobs moved them; performance and scene values are written into the effective words after stock's glide, so a lock on RATE hides everything else on it. Clearing it brought both back.

Not covered: how RATE and the cents sound beyond that report, pads, stock OS loading a sound saved with cents, NRPN, two voices, CPU load.

## 0.2.0: fine TUNE and the switch without a glide (2026-11-11)

Everything in this section ran in rytm-emu unless it says unit. Emulator results are not hardware evidence.

The switch glide, measured. Build SR07 (0.1.1, `59efe414…`) against SF01 (core-ar2 0.7 + this module with the snap alone, `8602953a…`), rytm-emu `c5732f0`, BD on the 23,777-frame RAMP, LOP ON, BD held, encoder B tapped on, then off, `DTBOOT_PEEK` every 1M instructions (5 ms):

| | 0.1.1 (SR07) | 0.2.0 (SF01) |
| --- | --- | --- |
| FIN's effective word after the tap on | 0x4da0, 0x571b, 0x5fbb ... 0x7efe after about 200 ms | 0x7f00 at the first read |
| Step word (1x = 0x08000000) after the tap on | 0x01b40000 (0.21x), back over the glide | 0x08000000 throughout |
| Loop period through the tap on (WAV, ramp wraps) | 0.5201 s (0.4954 s elsewhere: 25 ms lost) | 0.4954 s |
| Loop period through the tap off | 0.4941 s (13 ms gained: the pitch slide) | 0.4954 s |

Fine TUNE, raw dtboot on SF04 (`cfd2f464…`): turns of 4 counts at 100M took TUN's word 0x4000, 0x4003, 0x4005, 0x4008, 0x400a (+1 cent a step, each on the cent grid); with encoder A pressed, 0x4008 to 0x4108 and back (a semitone, cents kept); the knob read +0.02; a held trig's lock in GRID RECORDING read +0.01.

Rig cases, `tools/cases/sample-rate/` on the author's private rig (not in this repository), emulator `rytm-emu-ramboot`, image SF05 (`0cb4620e…`: the rig's base with the link + this source) against SO05 (`f2bea70c…`: the same with 0.1.1):

| Case | SF05 | SO05 (0.1.1) |
| --- | --- | --- |
| sample-rate-fine-tun: nudges +3, -5, +2 on TUN | +4, -6, +2 cents: words 0x400a, 0x3ffa, 0x4000; reads +0.04, -0.02 | +4, -6 semitones (the same steps) |
| sample-rate-coarse-tun: pressed +2, -1 from +0.04 | 0x420a, 0x410a (+2.04, +1.04) | 0x5800, 0x5000 (8 semitones a step) |
| sample-rate-fine-lock: held trig, second nudge | reads +0.05, inverted | not compared |
| sample-rate-switch-snap: FIN read right after each tap | 0x7f00, 0x4000: pass | 0x782e, 0x40b2: fail (mid-glide) |

Hardware, 11 Nov 2026: npp1993's Analog Rytm MKII (OS 1.74, flash RB08), scratch project, run by the author's automated rig over USB with the author's go; no person at the unit. Results are the rig's: memory words and screens, nobody listened.

- Source (0.2.0-experimental): fingerprint `6837e13d…21a0` (`evidence.sourceSha256`), run as SF08; SF06 (`cbbe1dc7…a0ef`) was the same but for TUN's text, which then dropped the two places on whole semitones.
- SF06 (`12fbe1bc…9533`, the rig's base with the USB link + this source), booted from RAM (image CRC `829dd163`), flash untouched. SO05 (`f2bea70c…fe91`, the same with 0.1.1), booted from RAM in the same session.
- The first unit runs found two faults in the cases, not the module: BD's FIN on the scratch project is modulated, so its effective word moved by itself (the cases now read FIN's smoother state, 0x8000ef34, and its target, 0x8000e5d4); and pressing SMPL on its own page toggled the knob and waveform views between cases (the cases now press AMP first). The references are the unit's waveform view.

| Case (unit) | SF06, three runs | SO05 (0.1.1), one run |
| --- | --- | --- |
| sample-rate-fine-tun | pass: 0x400a, 0x3ffa, 0x4000; +0.04, -0.02, 0; CC 24 back to 0x4000 | fail: 0x4400, 0x3e00 (semitones) |
| sample-rate-coarse-tun | pass: 0x420a, 0x410a; +2.04 | fail: 0x5800, 0x5000 |
| sample-rate-func-tun | pass: 0x5800 (stock's jump to +24), CC 24 back to 0x4000 | pass (unchanged) |
| sample-rate-fine-lock | pass: the held trig's lock reads +0.05, inverted | fail (screen) |
| sample-rate-switch-snap | pass: smoother state 0x7f000000 right after the tap on, 0x40000000 after the tap off; label FIN, then RATE +63 | fail: 0x770f31fe, 0x4a71e633 (mid-glide) |
| sample-rate-switch-keep | pass: FIN +10 stays 0x4a00 through both taps | pass (unchanged) |

SO05's screen checks also differ because it came up in the other SAMPLE view after its boot; its memory checks are the comparison.

SF08 (`2768bf1e…f1f2f`, the rig's base + this source: TUN always with two places, (0) at zero), 11 Nov 2026, booted from RAM after RB08 was flashed again by the author: 6 cases pass in two runs in a row. Screens recorded in the knob view: +0.04, -0.02, (0), +2.04, a held trig's lock +0.05, FIN then RATE +63.

Not covered by the rig: how the switch and the cents sound, pads, a pattern save and reload of TUN locks (the +Drive stays untouched), stock OS loading a sound saved with cents, NRPN, two voices together, CPU load.

## 0.1.1: idle CPU (2026-11-06)

0.1.0's block handler walked all eight voices every block before the prefetch, with no track's RATE on too. 0.1.1 returns at once when no track has RATE on and no voice is still going down (`going_any`, kept at the end of the full pass); otherwise the pass runs as before. The two gates in the step loop are unchanged.

- Source (0.1.1-experimental): fingerprint `22e0fea1…0050` (`evidence.sourceSha256`).
- Build SR07 (vendored core-ar2 0.7 + Sample Playback Rate 0.1.1-experimental, `--version SR07`): `.syx` `59efe41469ce121a43c9f9d3ed7dd11292487e02615baaf0c0b9f5d949443ac1`. rytm-emu `c5732f0`: the five media frames, replayed from the timed plans now in media/capture.json, are byte-identical to SR06's.
- Hardware, measured on npp1993's Analog Rytm MKII (OS 1.74) with a private telemetry base that times every audio block on DTIM0 and sends it over USB MIDI, sequencer stopped, scratch project, no USB audio streaming:
  - 0.1.0's cost: the author's 16-module set idles at 72.9 % of the audio block; the same set without this module at 72.1 %.
  - LF01 (`a6d85a85…`, that set with this source and Ping Pong Loop's and QPERF's idle fixes, on that base): 71.1 %. Its own share was not separated. npp1993 reports that RATE still slows, stops and reverses on LF01.
- Not run alone on a unit.

## The row, the tap and the value (SR06)

The row moved under SMP:, named SMP RATE, drawn as stock's checkbox; the value is stock's -64 to +63, so the module's own value text is gone.

| Check, from RATE on | Result |
| --- | --- |
| SMP RATE row | under SMP:, LEGACY FX SEND below it; the box follows RIGHT and LEFT; ticking takes FIN 64 to 127 |
| Tap of encoder B | FIN 127 to 64 and the row clears; a second tap puts both back; in both SAMPLE views |
| Tap while the sequencer plays | turns over |
| Press held 300 M, press and turn, FUNC, NO or a trig held, encoders A and E pressed, running live recording | no change to the row |
| The value while turning | reads +51, +35, +29 in stock's format, header RATE |
| SR07: press with one or two encoder steps | turns over, FIN unchanged but for the turn over |
| SR15: a trig or FUNC pressed during the tap | no toggle |
| SR15: two clicks 22 M apart | turns over once: the emulator doesn't register the second press that fast, so bounce can't be judged here |
| SR07: press and turn, 6 and 10 steps | stock's edit, FIN 127 to 87 and 7, no turn over |
| SR14: tap with SCNE or PERF held, no pad | turns over |
| SR14: tap with a pad alone held, outside those modes | turns over |
| SR14: tap in scene mode and performance mode, no key held | turns over; with a pad held in either mode, no toggle |
| SR12: right after a tap | the header reads the new name; on SP09 the unit showed it late, as reported |

The speed tables below read in raw values, 0 to 127: subtract 64 for what the knob now shows.

## Rerun on the source before the row moved (SR05, SP04, SA04), and again on SR06, SP05 and SA05

The audio code is the same in both; every run named here passed on both sets.

Stock rebuilds the effective array every block, so the handler's step that put its swap back had no work and could match by chance; it is gone. On SR05 the row-off comparison is again identical over 239,890 frames, and the speed and direction rows match. On SP04 the 22 PIPO speed runs, 11 flip and stop runs, 8 phase runs and the four sweeps that gave 12 jumps show no click past the trig's attack. On SA04 the 11 runs are clean. The tables below name the build each was first run on. The Hardware section is SP03, the source before this change, with Pipo Loop `f48b95d9`.

## Row and display (SR04)

| Check | Result |
| --- | --- |
| FUNC + MUTE, SOUND SETTINGS, DOWN to the end | FIN AS RATE is the last row, after LEGACY FX SEND; the list scrolls; reads OFF on a new sound |
| RIGHT, LEFT, YES on the row | ON, OFF, turned over; the menu stays open and the rows above do not change |
| Row ON from FIN +0 | FIN goes to raw 127 |
| Row OFF from RATE 127 | FIN goes back to raw 64 |
| SAMPLE page, both views, row ON | label RATE; header RATE while turning; value 0 to 127 |
| Another track (SD) while BD is on | label FIN: the setting is per sound |
| Power off (power-fail save), cold boot, row not saved first | label RATE, FIN 127, step exactly 1x |
| Stock kit reload (NO + PLAY MODE), row switched on unsaved | FIN 64, step 1x: back to the saved sound with RATE off |
| Power off, cold boot, then kit reload | FIN 127, step 1x |

## Speed (SR02, SR03, same engine code)

| FIN (raw) | Step word | Expected |
| --- | --- | --- |
| 127 | 0x08000000, 1.0000x | 1x |
| 111 | 0x05e00000, 0.7344x | 47/64 |
| 95 | 0x03e00000, 0.4844x | 31/64 |
| 72 | 0x01000000, 0.1250x | 8/64 |
| 65 | 0x00200000, 0.0156x | 1/64, half a frame a block |
| 64 | 0 | stop |
| 57 | -0.1094x | -7/64 |
| 34 | -0.4688x | -30/64 |

## Direction

| Check | Result |
| --- | --- |
| Trig at raw 58, 29, 8, 4 with LOP ON | starts at END (position 23,555 at raw 58 on the first report), loops downward |
| Trig at raw 64 | starts at STA and holds |
| LOP OFF, about -0.52x | plays once, 0.93 s (23,777 frames predicts 0.95 s), then silence; no wrap in the audio |
| LOP OFF, then RATE to 127 after it played out | stays silent until a trig |
| FIN locked to raw 1 on T1, T9 plain, sequencer running | T1 at -0.984x from END (position 23,336 after the first report), T9 at 1.000x from STA; alternates over six passes |
| MIDI CC 25 | sets RATE, and it holds across a trig, as stock's FIN on the core-only image |

## Row OFF against the core alone

Same steps on SR03 and on the core-only image: FIN +12, two BD hits. Effective FIN and the step word match, and the audio is identical, sample for sample, over 239,890 frames from the first onset.

## With Pipo Loop (SP03, LOP PIPO, loops of about 380 and about 2,100 frames)

| Check | Result |
| --- | --- |
| Effective RATE 127, 96, 73, 67, 66, 65, 64, 58, 35 and 5 on both loops (22 runs) | no click; turning points scale with speed; at raw 65, half a frame a block, the voice turns at both edges and does not stall; raw 64 holds |
| Slow reverse, raw 63, 62, 60 | no click; at raw 63 the voice turns at both edges |
| Flips 127 to 1 every 193 M and 137 M, 100 to 28 every 61 M, 96 to 32 every 211 M and 223 M, 72 to 56 every 173 M | no click |
| Stop at 64, resume, reverse, stop, reverse | no click |
| 100 to 28 every 61 M, four start offsets, two report intervals (8 runs) | no click |

An earlier build (SP01) clicked here: flips that landed the voice at an edge at near zero speed sent it back past the edge, where Pipo Loop's turn leaves it for a moment, and stock wrapped it by a whole loop. One run of 40 flips showed 12 and one of 16 showed 1, only at offsets that locked the flips to the loop. The change of direction now waits until the voice is 32 frames clear of both edges.

## Built beside other modules

| Check | Result |
| --- | --- |
| Link with Pipo Loop | no shared sites |
| Link with Pipo Loop, Silent Pad+Trig, Loop Sync and Filter Hz | no shared sites |
| SA03, the slow reverse, flip, stop and CC cases above (11 runs) | no click |

## Sound locks and two voices (SP03)

| Check | Result |
| --- | --- |
| BD at RATE 38, row on, T1 and T9 plain, T5 sound-locked to a pool sound with the row off, sequencer running | T5 at +1.000x from STA, T1 and T9 at -0.406x from END, for five passes: the setting follows the sound played and comes back on the next plain trig |
| The reverse: a pool sound with the row on, locked onto a track with the row off | not run in the emulator; reported on a unit, see Hardware |
| Row on, RATE 127, SOUND MANAGER, store to the empty slot A:162, LOAD TO TRACK on SD | SD reads RATE at 127: the setting travelled, which differs from the unit report. Replacing a slot that already holds a sound was not reached |
| BD at +1.0000x and SD at -0.4163x in the same blocks | each step exact for its own FIN and sign; SD's slot held a 248-frame built-in sample and its pad did not start in this run, so two ramps heard together were not shown |
| SD's RATE moving during a pattern | the step followed FIN in every report |
| Scene lock on RATE at about 53, on a sound at 127, scene toggled | effective RATE 127 and 53 by turn, the step followed, sign included |
| Performance lock on RATE, amount written to the engine's word (0, half, full) | effective RATE 127, 91, 55, the step followed, sign included; the amount was poked, not played from a pad or the QPER knob |

## RATE sweeps with LOP PIPO (SP03, MIDI CC 25 as a stand-in for an LFO)

| Check | Result |
| --- | --- |
| Sweep around 96, loop of about 2,100 frames | no click |
| Sweep with a period of 2 s, loop of about 380 frames, four 45 s runs | 12 full-loop jumps, about 1 in 1,100 turns, all at END's edge, with RATE about 74 and no change of direction |
| Same, period 2.8 s | no click |
| Stock TUN and FIN sweeps with the row off | no click |

A diagnostic build (not kept) logged two of those jumps block by block. The voice lands on END's frame near 5 frames a block, which stock's pitch cannot reach (its floor is 8), turns, and a block later is back to going up: stock wraps it to STA, and Pipo Loop's next turn sends it back. The cause was the put-back step in Pipo Loop's turn: stock's rebuilt STA and END could match what it wrote a block earlier, and it swapped them again. Fixed in Pipo Loop `b0ed4fe7`, a module update of its own, with no change needed here for that fault.

## Playhead (SP03, SMPL WAVEFORM, LOP ON)

The line moves about 37 columns in 30 M at RATE 127, 19 at RATE 96, and stays put at RATE 64: it follows fixed RATE values.

## Playhead with RATE moving (2 November 2026, PH01)

The unit report (SP04, SP12) says the playhead looks linear under an LFO on RATE. It is not: stock's line is the voice's own position, and this module needs no change for it.

How stock draws it, read on OS 1.74: SamplePageView's tick (vtable +48, 0x400d1ef6) takes the selected track's voice and calls the widget's setter (0x4006ca8a) with the voice's position as a fraction of the sample, `0x4011cfb8(voice)`: record + 4 (the position the prefetch advances by the step this module scales) over record + 20 (the sample's frames) >> 8. The line shows only while the voice still belongs to the track and its active byte (record + 40) is set. The column is that fraction of 123, over the whole sample, not STA to END. No start time and no nominal speed are involved, so whatever moves the voice (RATE, an LFO, a lock, PIPO, the swap below 0) moves the line.

rytm-emu c5732f0, build PH01 (core-ar2 0.7 + Sample RATE 0.1.0 + Pipo Loop 0.1.1, emulator only), the 24,000-frame RAMP on BD, LOP ON, SMPL WAVEFORM, RATE on. Read every 2 M: the widget's column (+20 of the widget at view + 400) against the column the voice's record gives at that moment.

| Check | Result |
| --- | --- |
| Refresh | the setter runs 20 times a second, the draw about 15: one update every 50 ms |
| RATE 127 | the line lags the voice by up to one tick: 9 to 12 columns at 1x on this 0.5 s sample |
| RATE swept +63 to -64 and back over 1 s (MIDI CC 25) | the line slows, stops, runs back, wraps from STA to END going down and turns again, always within one tick of the voice |
| LFO 1 to SAMP:Fine Tune (triangle, FREE, x16, full depth; FIN swings 127 to about 30, so briefly into reverse) | 200 samples: the line 4 columns behind on average, at most 12 (one tick at 1x); each dip into reverse moves it back 1 to 4 columns |

Why it looks linear on a unit: the line moves by how far the voice moves, and a speed LFO moves the voice by little. For a sine of depth D (in x) at f Hz the position swings about 2 x D x 48,000 / (2 pi f) frames peak to peak, about 39 x D / (f x L) columns on a sample of L seconds. Here (0.5 s sample, a short dip) that is 1 to 4 columns; a 4 s sample under a 1 Hz LFO of depth 0.5 gives about 5, at 4 Hz about 1. On a sample of a few seconds that is a pixel or two, updated at 20 Hz, over a line that keeps advancing: it reads as linear. With LOP PIPO the voice also turns at STA and END, which Pipo Loop's TESTING.md already found the line follows.

What a change could buy, not built: a faster refresh (stock's view tick, not this module's) or a line drawn over STA to END instead of the whole sample (a change to a stock screen, needing the owner's agreement). Neither follows the voice more truly than stock does now.

On a unit, 2 November 2026, as reported by npp1993 on looking again: the playhead does follow the LFO.

## Not tested

Replacing a stored sound in the emulator, a project file round trip, Env Reset Amp beside it, MKI. CPU load on a unit: the figures in the manifest are a static estimate.

## Hardware

npp1993 flashed SP03 on an Analog Rytm MKII, OS 1.74, and reports the following. Reported by the author, not itemized measurements; no CPU reading was available.

| Check | Reported |
| --- | --- |
| Row OFF on a new sound, RIGHT turns it ON; the knob reads RATE on that track and FIN on others | pass |
| RATE 127 normal speed, slows to a stop at 64, runs backward below it | pass |
| A pad hit at 64 | a tiny pop, also with STA on a zero crossing; the author puts it down to the analog amp, as an empty channel does it too |
| Trig below 64 starts from END | pass |
| LOP OFF at RATE 20 | pass |
| RATE locked to 1 on one trig, a plain trig later | locked trig backward, plain trig forward |
| LOP PIPO at RATE 127, 66, 62 | no clicks at the turns, never sticks |
| Sweeps through 64 with LOP PIPO, near STA and END | no pops or jumps |
| Row on, kit not saved, power cycle | row and RATE came back |
| Kit saved with row off and FIN +0, row on unsaved, power cycle, NO + PLAY MODE | row OFF, FIN +0: the two stayed together |
| Row on, RATE 90, kit saved | row on, RATE 90 (whether the power cycle was run on this step was not stated) |
| Row on unsaved, NO + PLAY MODE | row OFF, FIN +0 |
| Row OFF at RATE 127 | FIN +0, normal pitch |
| Track copied, 1 to 11 | row on and RATE on the copy |
| LFO to the sample's Fine Tune, RATE about 96, LOP PIPO | pitch rises and falls, passes through a stop into reverse, with some minor clicks; the waveform's playhead looks linear, not following the LFO |
| Track sound stored to a pool slot | stored; it shows in SOUND MANAGER |
| That slot, LOAD TO TRACK on another track | a toast reading ERROR; cause not found |
| Many other stored sounds, LOAD TO TRACK | also ERROR, some loaded; cause not found |
| A new store over a sound, then LOAD TO TRACK on another track | loaded, with FIN AS RATE off: the setting did not travel |

On SP13, the source of this version, as reported by npp1993: the tap is very snappy, and two fast taps register as two.

On SP12, as reported by npp1993: holding SCNE or PERF and tapping flips; holding a pad to edit a scene does not; FUNC, NO or a held trig and a tap do not; in running live recording a tap does not flip; with a pad held outside those modes, in grid recording or with recording off, it flips.

On SP11, as reported by npp1993: taps flip normally and in scene and performance mode; while setting a scene or a performance with a pad held the press sets a lock and does not flip; holding SCNE or PERF and tapping does not flip; the author reads this as working as expected.

On SP10, as reported by npp1993: the header changes over quickly after a tap, and the tap is blocked in scene and performance mode; SP11 allows it there.

On SP05 (SMP RATE row and first tap), as reported by npp1993: the checkbox works; taps of encoder B often did nothing, and repeated clicks got through; on SP06 the tap reliably switches, holding does not toggle, press and turn does not toggle, and NO + press on a FIN lock clears it and stays on FIN, as reported. The SOUND menu on the unit is FUNC + FILTER.

On SP04 (with Pipo Loop `b0ed4fe7`), as reported by npp1993:

| Check | Reported |
| --- | --- |
| LFO to the sample's Fine Tune with LOP PIPO, short loop | passes through the stop; test passed by the author's ear, with no clicks reported at turns; dropouts only while moving STA or END, which the author accepts |
| RATE by hand 127 to 0 and back, LOP PIPO | pass |
| Pad at RATE 20 | starts from END, backward |
| Row OFF and ON at raw 21 | reads FIN -43, then RATE 21 |
| Row-on sound locked onto a row-off track | the trig's knob reads FIN, as the label follows the selected track's sound; the knob sat where the source sound's did; by ear the locked trig played as that RATE value would |
| Waveform playhead with the LFO | looks linear, does not seem to follow the LFO |

Flashing note: on the first attempt the unit stopped on UPGRADE OS NOW? and answered no key after NO had been pressed during the transfer. A power cycle returned it to the earlier OS, and the second transfer, with nothing pressed until the prompt, went through.

## Library release (2 November 2026)

The owner approved the first library release of 0.1.0-experimental on 2 November 2026, on the results above. The library's package is compiled from this source in Modwerk's source-only container; that exact package has not run on a unit.

# Ping Pong Loop (pipo-loop) up to 0.1.2: its test report

Ping Pong Loop was its own module, `pipo-loop`, until it moved into Improved SMPL 0.6.0 unchanged. Its report follows as it stood at 0.1.2; file names are its own (`src/audio.s` there is `src/pipo.s` here), and its media/ captures are retaken on MS01 (see 0.6.0 above).

Everything below was observed in rytm-emu on the named build, except the Hardware section, which records what npp1993 reported from a unit.

- Source (0.1.0-experimental, on main 7ad765b0): `build.json` `1c7f575a…09d8`, `src/audio.s` `4cc9d5e4…78d6`,
  `src/pipo.c` `bd1e8dc2…a9d8`, `src/snap.c` `af812459…7bfb`, `src/marks.c` `d2994d5d…79a9`. Fingerprint (`sha256`
  of `sha256sum build.json src/audio.s src/pipo.c src/snap.c src/marks.c`): `1a344049…96b7` (`evidence.sourceSha256`).
- Stock OS 1.74: `.syx` `cb0f99d6…e123`, the owner's file.
- Core: elekloader core-ar2 0.3 (`core-ar2-0.3.elemod` `6b97dfb3…3e58`, as vendored) for every build below except PP14;
  PP14 takes core-ar2 0.7 (`core-ar2-0.7.elemod` `f1e9cb2c…d9c1`, as vendored), the core Modwerk's Rytm builds use since #987.
- Build PP13 (core-ar2 0.3 + Pipo Loop 0.1.0-experimental, `--version PP13`), from that source: `.syx`
  `ae15d8b52b4485e0216a4416dd809334b07cdfde0529ca69e8fcd9b59ca58147`.
- Build PP14 (core-ar2 0.7 + Pipo Loop 0.1.0-experimental, `--version PP14`), from the same source: `.syx`
  `94bb114986d71e23760cdfec3d0de1f055637c5417bd9b40a29febcbc474e2ac`. Linked by Modwerk's linker on the owner's stock 1.74;
  the same route with core 0.3 reproduces PP13 byte for byte. It boots to the main screen in rytm-emu `c5732f0`.
- Build PC11 (core-ar2 0.3 + Silent Pad+Trig 0.5.1 as on main + Pipo Loop 0.1.0, `--version PC11`): `.syx`
  `f6e59b8fca126ec3bbc173e5617e30ade67dfe430693bc936a2d2d0495adb5c5`.
- Diagnostic PD05 (PC11's code plus an on-screen readout, branch `diag/pipo-loop`; not for release): `.syx`
  `c0ea404ef4aac79334f1513a4a81953997a405f7811f45426bd6d484efc3ccb4`.
- Source (0.1.1-experimental): fingerprint `709f7620…5075` (`evidence.sourceSha256`), PP20 below. Before it, PP19 `be8b3083…c068`, PP18 `20b63b12…d2ff` and PP17 `5066d24b…b76f`. Build PP17 (core-ar2 0.7 as vendored + Pipo Loop 0.1.1-experimental, `--version PP17`): `.syx` `11cf7f270b5323fdc8beab00ebfbd2cfe3a7b5f4e4b29d3abe408652ec969d52`. Every screenshot in media/ was recaptured on PP17; lop-off, lop-on, lop-pipo, plock-pipo and scene-pipo came out byte-identical to the 0.1.0 captures.
- Earlier builds: PP03 and PC01 (before the code review), PP05 and PC03 (after it), PP06 and PC04 (the
  three-position switch), PP07 and PC05 (zero snap on the sound), PP08 and PC06 (locks), PP09 and PC07 (exact turns), PP10, PC08 and PD02 (snap holds), PP11, PC09 and PD03 (code review), PP12, PC10 and PD04 (LOP's feel);
  each passed the battery below. PP10 to PP13 gave the same results as PP09 on every row of it.
- Emulator: rytm-emu `c5732f0`, headless `dtboot`, JIT on. A card image holds one generated sample,
  RAMP (24,000 frames, a straight rise from -26,000 to +26,000), loaded to the project and set on
  BD with LOP ON on the SAMPLE page (the setup in [media/capture.json](media/capture.json)). Audio is
  dtboot's `--wav` with `--every 20M` (longer report intervals keep only about a second of audio).
  Effective LOP is read from the track's effective parameter word (`DTBOOT_PEEK`).

### 0.1.2: idle CPU (2026-11-06)

0.1.1's four voice gates in stock's prefetch called `pipo_loop_mirror` for every voice every block, with LOP OFF everywhere too; it returned at once. 0.1.2 keeps a byte of the voices armed for a turn (`pipo_loop_armed`, set at the end of `pipo_loop_audio`, before the prefetch) and the gates test it first. Nothing else changes.

- Source (0.1.2-experimental): fingerprint `c47b6405…c9e1` (`evidence.sourceSha256`).
- Build PP21 (vendored core-ar2 0.7 + Ping Pong Loop 0.1.2-experimental, `--version PP21`): `.syx` `df1762de120d304615ac58d944250666fcdcbe20e3cf40cdca4cf9529a451432`. rytm-emu `c5732f0`: the ten media/ plans replay on it; nine frames are byte-identical to PP17's, and markers-playing differs only in the playhead's position (the emulator's timing follows the code).
- Hardware, measured on npp1993's Analog Rytm MKII (OS 1.74) with a private telemetry base that times every audio block on DTIM0 and sends it over USB MIDI, sequencer stopped, scratch project, no USB audio streaming:
  - 0.1.1's cost: RC30's 16-module set idles at 72.9 % of the audio block; the same set without Pipo Loop at 70.6 %.
  - LF01 (`a6d85a85…`, the RC30 set with this source and QPERF's and Sample Playback Rate's idle fixes, on that base): 71.1 %. Its own share was not separated. npp1993 reports that PIPO loops still work on LF01.
- Not run alone on a unit; the other 0.1.1 hardware rows still describe this code's playback, which 0.1.2 does not change.

### Emulator, 0.1.1 (2026-10-31)

0.1.0 could play about 48 frames from the far end of the loop at a turn, a click, mostly at low pitch. Two causes, read in stock's reverse prefetch:

- A voice going down that starts a block exactly on the loop's low frame gets a window with no wrap, near the high end, so there is nothing to mirror. 0.1.1 turns the voice on that block, as it does for a pass of the low frame. Below one frame a block a move back above it would never let the voice past.
- A voice just turned at the high end can sit above it, so its window crosses the high end. The mirror took that for the low end's window and filled it with the low end's frames. 0.1.1 mirrors that way only for a voice within 160 frames of the low end.

Builds: PP15 is 0.1.0 and PP16 and PP17 are 0.1.1, each alone on the vendored core-ar2 0.7, from origin/main 00ecaf52. rytm-emu, RAMP on BD, step above 100 between samples counted once per 64 frames, about 30 s after one hit.

| Check | PP15 (0.1.0) | PP16 (0.1.1) |
| --- | --- | --- |
| PIPO, TUN -24, END 34 (6,800 frames), FIN at 0 | 18 clicks: 18 at END, 0 at STA | 0 |
| The same, FIN raised in three steps (voice lands on other frames) | 18/0, 23/5, 25/7 at END/STA | 0, 0, 0 |
| Output range of those runs | -6,741 to -2,451 | -6,421 to -2,768, the loop's own |
| PIPO, TUN +24 | 0 clicks | 0, output differs |
| PIPO, END below STA | 2 clicks | 0 |
| LOP ON; LOP OFF; PIPO at TUN 0 | | sample-identical to PP15 (SHA-256 of channel 0) |

PP17 gave 0 clicks on the first two rows. Rates below one frame a block need a scratch build that forces the voice's rate word, never released: on a 7,100-frame loop at 1/64x and 1/32x, forward and reverse, the voice reached both ends with no stall.

A third cause, found after a unit report (below): the module worked out STA's and END's frames with its own formula, rounding up, where stock's EMAC truncates. Where the two sit either side of a multiple of 8, stock's DMA aligns 8 frames lower, the mirror refuses that window, and every turn at that STA or END plays frames from the other end. A 24,000-frame sample cannot show it: every whole STA and END is then a multiple of 200 frames, where both agree. 0.1.1 now calls stock's own routine (0x4011bf44) under the MACSR stock's prefetch sets; zero snap's formula truncates too.

Build PP18 (core-ar2 0.7 as vendored + Pipo Loop 0.1.1-experimental, this source, `--version PP18`): `.syx` `055930b7e6605945ca2bcf7e4c0f7cd5d734c274cec98e3659e418d8e9efed69`.

A 23,777-frame ramp, TUN at five settings from 0 to -24, four STA and END pairs mid-sample, 20 runs of about 22 s of audio, step above 60 counted once per 64 frames, on combined images: RC05 (Pipo Loop as PP17) gave 0 clicks in 15 runs and clicks on every turn in the other 5, all at STA 10,903 (271 at TUN 0, 68 to 96 lower); the same image with this source gave 0 in all 20. PP18 against PP17 on the 24,000-frame ramp: LOP ON, LOP OFF, PIPO at TUN 0 and +24 sample-identical; END below STA 0 clicks on both, output differs.

Zero snap's landing frame, read from the voice's position after a trig (position mod 16, as it advances 480 frames between readings at TUN 0), LOP OFF, FUNC + STA up to the 23,777-frame ramp's one crossing, first positive sample at frame 11,893: RC05 stored 0x3c05 and started on 11,892, one frame early; the build with this source stored 0x3c06 and started on 11,893. Three plain STA values (0x33d8, 0x3838, 0x4188) started on the floor frame too.

Build PP19 (PP18 with one more change, zero snap's frame now rounds up as stock does within 1/256 of the next frame, `--version PP19`): `.syx` `cd64821c0baa3e7396502d76f33e930d69a5ca5269f93fc919db0ce81bffc527`. The ramp's crossing again started on frame 11,893; the 20-run sweep gave 0 clicks. A model of stock's EMAC arithmetic, checked against every value on 16 sample lengths from 2,000 to 480,017 frames, matches this formula on every value up to 30,721 frames and on all but 2 to 30 values above. Not flashed.

Build PP20 (PP19 with the put-back step removed, `--version PP20`): `.syx` `51f4c019245374c80f1ada41173486587682946a41b1fc4fab069f1c98db243f`. Stock rebuilds the effective array every block before this handler (read from the code: the only branch past the rebuild also skips the handler), so the step never had work to do, and it could misfire: when another writer (a test build with a sample RATE that reverses by swapping STA and END) made stock's rebuilt values match what the handler wrote a block before, it swapped them again and lost the way the voice was going, and at the next turn a short piece from the loop's far end played. A block log showed that sequence. On that test build, RATE swept 46 to 127 every 2 s on a 345-frame loop: 12 full-loop jumps in four 45 s runs before, 0 after, largest step 139 to 5. Fixed RATE at raw 127, 66, 62, 20 and 0, and the sweep at TUN up and down: no click after the trig's attack. Pipo Loop alone: PP20 against PP18 sample-identical at LOP ON, LOP OFF, PIPO at TUN 0 and END below STA; PIPO at TUN +24 0 clicks, output differs; the 20-run sweep 0 clicks. PP20 not flashed.

### Hardware, 0.1.1 (reported by npp1993, 2026-10-31)

RC05 (Pipo Loop as PP17, in a combined image) on an Analog Rytm MKII, OS 1.74, sample set by hand, LOP PIPO, STA and END mid-sample: a click at the sample's attack; pops that come and go at TUN -24 and -20, and with END below STA, hard to tell from the audio itself; LOP ON clicks, as expected of an unsnapped loop; PIPO back after saving the kit and a power cycle. 
RC07 (`6ae42b7b717b63d7aecc09875b76e5b0cd9a69bcbfe37a8850b111dbaaf6b7de`, this source in a combined image; PP18 alone not flashed): a short, loud sample, LOP PIPO, STA and END moved around, on zero crossings and off them, TUN moved up and down: "I'm not getting any pops or clicks." Reported, not itemized; exact TUN values were not stated.

The same build, checks asked for after that: END below STA, "that's good"; FUNC + STA and END with LOP ON, "it's good, yeah".

Those reports are on PP18's source. PP19's change to zero snap and PP20's to the turn have not been on a unit.

### Emulator, 0.1.0 (2026-10-27)

Every row was run on PP09, except the MIDI row (PP03) and the switch rows (PP06, the same drawing code);
PP03, PP05, PP06 and PP07 gave the same results.

| Check | Stock 1.74 | PP09 |
| --- | --- | --- |
| LOP turned clockwise from ON | stays ON | reaches PIPO; the value text reads PIPO |
| LOP turned +4, -6, +4 detents from ON | — | ON, PIPO, ON, OFF, ON, PIPO |
| LOP's switch at OFF / ON / PIPO | two-way: knob left / right | three-way: knob left / middle / right, the same pictures as BD CLASSIC's WAV at 0 / 1 / 2 on stock |
| BD PLASTIC's TYP (another OFF/ON switch) | two-way | two-way, as stock |
| Ramp, LOP ON, one BD hit | sawtooth, period 24,000 frames, a 12,044 step at each wrap | identical |
| Ramp, LOP PIPO, one BD hit | (no PIPO) | triangle; turns every 23,935-23,937 frames; largest sample-to-sample step 5 (of 32,767) |
| PIPO at TUN +24 / about -24 | — | triangle, segments 5,952 frames (6,000 ideal) / 95,872 (96,000), largest step 5 |
| LOP turned ON to PIPO while BD sounds | — | saw until the knob reaches PIPO, then it plays on forward and turns at END; no early turn |
| P-lock: GRID RECORDING, trigs on steps 1 and 9, LOP locked to PIPO on step 1, PLAY | — | lock shows PIPO; effective LOP alternates PIPO (step 1) and ON (step 9); triangle from step 1, saw from step 9 |
| Retrig while playing backward (step 9 above) | — | restarts forward from STA |
| Scene: SCENE held, BD pad held, LOP turned | — | footer SCENE: 1, LOP locked to PIPO; toggling scene 1 in SCENE mode switches effective LOP between ON and PIPO |
| Two voices: BD and SD both RAMP, LOP PIPO, hit together | — | both channels ping-pong (BD clean; SD's channel also carries its analog snare) |
| MIDI CC 30 on channel 1: 0, 32, 63, 64, 85, 86, 127, 0, 1, 2 (PP03) | LOP = the CC value, unclamped | identical (so CC 2 gives PIPO) |
| PC07: ramp with LOP ON / PIPO | — | saw / triangle, as PP09 |

The turn needs one block of lookahead: with none (tested by setting it to 0), stock wraps the voice
to STA first and the saw comes back. The prototype looked two blocks ahead (turns 23,872 frames
apart); one block halves the early turn and stays click-free at every pitch above.

#### Saving and stock compatibility

- PP09 with BD on LOP PIPO, power-off (`--power-off`; the firmware's handler saved the working state):
  the card then cold-booted on **stock 1.74** with effective LOP 2 (no clamp) and a BD hit played a
  **normal forward loop** (sawtooth, period 24,000, as ON).
- The same card cold-booted on PP09: LOP PIPO came back and BD ping-ponged.

#### Captures

`media/lop-off.png`, `media/lop-on.png`, `media/lop-pipo.png`, `media/plock-pipo.png` and
`media/scene-pipo.png`: PP06 frames, plans in [media/capture.json](media/capture.json).

### Playhead on the SMPL WAVEFORM view (2026-10-27)

Pressing SMPL on the SAMPLE page opens SMPL WAVEFORM, which draws a playhead line. Stock 1.74's rules,
from its code: the page's tick takes the selected track's voice (track-to-voice table) and shows the line
only while that voice still belongs to the track and the voice's active flag (record + 40) is set; the
line's x is the voice's play position over the sample's length, across the whole sample (not STA to END),
refreshed on the page's tick. The active flag stays set while a looping voice runs, after the AMP envelope
has ended too, and clears when a one-shot voice (LOP OFF) reaches its end.

rytm-emu, stock 1.74 against PP06, ramp on BD with AMP DEC 3, frames 0.1 to 4 s after one hit: stock LOP ON
and PP06 LOP ON move the line identically (the same positions) and keep it moving after the envelope; LOP
OFF hides it at the sample's end; PP06 PIPO moves it forward to END, then back to STA, and so on (the
voice's direction byte, + 42, is 1 on the way back, as for stock's reverse play). Pipo Loop changes
nothing here: the line follows the voice's real position, so PIPO reads as expected.

### Zero snap: FUNC + STA / END (2026-10-27)

Test sample ZSIN (24,000 frames): a 141.7-frame sine of amplitude 20,000 with a phase offset (no crossing
at frame 0), silent from 9,000 to 11,000 and at a DC of 3 from 15,000 to 16,000; 296 crossings, computed
offline with the module's rule. ZS01 (the same main OS as PP07), SAMPLE page, SMP 2:

| Check | Result |
| --- | --- |
| FUNC + STA, 16 detents forward from 0 | STA stepped 54, 124, 195, 266, 337, 408, 479, 550 (frames): the first eight crossings, in order (the other detents fell to stock's encoder hysteresis) |
| then 8 detents back | 479, 408, 337 |
| FUNC + END back from the end | 23,930, 23,859, 23,788, 23,717: consecutive crossings |
| one detent at a time, settled for 1 s | the stored value's frame is the crossing exactly (16,278; 16,207) |
| FUNC + STA back from 16,335 across the DC run | 16,278, 16,207, 16,137 (glide values 16,138 and 16,136 seen), 16,066, then 15,000 (the edge of the DC run, next to -3,441), then 14,932, 14,861, ...: the near-zero DC is passed over |
| plain turn on STA | fine steps, as stock |
| FUNC + turn on STA with a trig held in GRID RECORDING | the lock moves in stock's fine steps (0, 0.12): lock editing takes stock's other branch, which the site does not touch |

Every value in between is stock's parameter glide on the effective value; the stored values sit on the
crossings. STA and END are 1/30,720 of the sample, so for samples up to 30,720 frames each crossing has an
exact value; past that the nearest value is taken, at most frames / 61,440 frames off: 0.8 frame at 1 s,
3.9 at 5 s, 7.8 at 10 s, 23 at 30 s, 47 at 60 s (48 kHz). Not tested: a sample over 30,720 frames, a
sample with no crossing at all (the code leaves the turn to stock), STA and END meeting.

#### Next crossing, not the other half of the same one; locks (2026-10-27)

PP07 had a flaw: a point on a crossing sits on the sample of the pair nearer zero, and when that was the
pair's first sample the way the turn went, the next detent moved it one frame to the pair's other sample
(seen on ZSIN: 124 then 125, 195 then 196, 266 then 267). PP08 skips the pair under the point. The same
run, one detent at a time and settled: PP07 54, 124, 124, 125, 195, 196, 196, 266, 267; PP08 54, 124,
124, 195, 266, 337, 337, 408, 479 (a repeat is a detent stock's encoder hysteresis swallowed).

Locks (LK03, the same main OS as PP08), ZSIN on BD:

| Check | Result |
| --- | --- |
| GRID RECORDING, trig on step 1, held with FUNC, STA turned 4 to 14 detents, then played | the first detents make the lock at the sound's value, as stock; then the lock steps 54, 195, 266, 408, 479 (frames), each a crossing, in order (detents between fell to hysteresis) |
| LIVE RECORDING, FUNC + STA turned while it records | the sound's STA steps 54, 124, 195, 266 and the locks recorded on the steps play those frames, all crossings |
| plain turn with a trig held | stock's fine steps |

Stock edits a held trig's lock in one of two ways: through the view's lock editor when there is one
(0x4003a19c's call; not reached in these runs), or, without one, trig by trig through a callback that
reads each trig's lock (view vt + 112) and adds the turn (view vt + 120). Pipo Loop steps each trig's
lock from its own value at that callback (0x40037f6c), so several held trigs each go to their own next
crossing. The editor path is hooked the same way but was not exercised. LIVE RECORDING records the
sound edit, which the 0x4003a240 site already snaps.

### Sample-exact turns and fine offsets: findings (2026-10-27)

- **Sample-exact PIPO turns.** Stock's prefetch builds each block's loop wrap a block ahead: two
  8-frame-aligned eDMA segments (the loop's tail, then its start) into a 140-frame SRAM window that the
  resampler reads straight through. A turn exactly at END would need the second segment replaced by a
  reversed copy of the tail after the DMA lands and before the render reads it, in both of stock's
  prefetch routines (voice 0 inline, voices 1-7 in a loop), and the position, phase and direction put
  right the next block. That is several new sites inside the audio interrupt and DMA timing the emulator
  may not show as the unit does. Not built.
- **Exact zero snap past 30,720 frames.** Prototyped (FO01-FO03) and dropped at npp1993's choice (his
  precise loops are short); the 0.64 s limit stays. Found on the way: reading the kit's sounds from an
  `ev_project` handler broke the project load at boot in rytm-emu; reading them from `ev_tick` did not.
  The design: a per-sound fine offset: 16 bits a sound of
  core-ar2's sound storage (an 8-bit offset and an 8-bit tag of the STA or END value it belongs to, for
  each), saved with the sound and kit; added to the start and end frames where stock computes them (the
  returns of 0x4011bf44 at 0x4011c2a8 and 0x4011c850, both free), and only while the effective value
  still equals the tagged one, so locks, scenes and the LFO play stock's grid. Stock OS ignores the
  storage and plays the 1/30,720 grid. Not built.

### Exact turns and exact snap (2026-10-28)

**Exact turns (PP09).** Stock's prefetch copies each block's 140-frame window by DMA, a block ahead;
near the loop's end it copies the frames up to the end, then the loop's start, so the voice wraps at
the exact frame. For a voice in PIPO the module points that DMA's source at a buffer of the loop's
frames in reverse order (at the top: the segment after END; at the bottom, read backward: the main
segment), so the voice plays straight on into the way back; the block after, it moves the position
stock wrapped to the mirrored frame, 8 frames on (the play position runs 8 frames ahead of the frames
heard, at every pitch tried), and turns the voice round. rytm-emu, ramp on BD: period 48,000 frames
for a 24,000-frame loop, turns symmetric to within a few units; TUN +24 period 6,000, about -24
95,965 (96,000 ideal); with END inside the sample every turn's largest step is 1; with END on the
sample's last frame the first turn after a hit can be up to 7 frames off (no room past the end).
SD (voices 1-7 routine) ping-pongs too. Not provable in the emulator: the data cache (the module
pushes its buffer's lines; rytm-emu models no cache) and the unit's DMA timing.

**Snap on stock's own frame.** Stock maps STA and END to frames with an EMAC multiply by 8/15 that
truncates: floor(frames * value / 30720), read from the voice's position in 0.1.1 (below). PP09's reading of it as
ceil(frames * value / 30720), from working the instructions through for 400,000 cases, was wrong, and it held only
where the two agree. As run on PP09, it landed on the first sample of the new sign:
on ZSIN, sound and locks alike play from crossings exactly (sound: #3-#6; locks: #1, #4, #5). One
crossing a detent: core-ar2's ev_enc counts the encoder (8 counts a detent); four 2-count events step
one crossing, as one 8-count event does. With LOP ON, END stepped from 23,647 down by whole periods
(rising crossings only), matching STA's rising crossing.

### Zero snap holds; shared crossings and edges (2026-10-28)

With FUNC held a turn on STA or END only ever lands on a crossing: where none is left the way it
goes, the point holds (PD01 had passed such a turn to stock, which stepped off the crossings). STA
and END may pass each other and may share a crossing (npp1993's rule). rytm-emu, PP10, ZSIN on BD
(24,000 frames, not at zero at its first or last frame), settled values as frames, `d`/`u` the
crossing's direction:

- STA, LOP ON, END at 120: right 54d 125u 196d 267u 337d, left back to 54d, then held at 54 for the
  remaining detents (frame 0 is not at zero, so it is no crossing).
- END: left 23931u 23860d 23789u 23718d 23647u, right back to 23931u, then held (the sample's end is
  not at zero).
- END at 0, STA on 196d, LOP ON: END right 54d 196d 337d 479d …: only falling crossings (STA's
  direction), onto STA's own crossing, then past it.
- A trig's lock (GRID RECORDING, sound STA = END = 196d, LOP ON): the lock's STA left to 54d and held
  there; right from 54d to 196d (END's crossing), 337d, 479d, 621d.
- A loop of no length (STA = END = 196) with LOP ON and with PIPO, BD hit twice: plays without a fault
  for the whole run; the voice stays parked around frame 196, LOP ON and PIPO alike (PIPO leaves
  loops under 160 frames to stock).

Stock glides STA and END to a new value rather than jumping: PP10, effective STA read every 1M
instructions during a FUNC turn from 0 to ZSIN's first crossing went 0x00, 0x02, 0x0f, 0x1a, 0x22, …
0x41, 0x42, 0x43 and settled on 0x44 about 30M instructions later (the same on the next step, 0x47
… 0x9f). A wrap or PIPO turn inside that glide plays from a point between crossings, which matches
npp1993's report of clicks only while turning (PD01/PD02 era, PIPO_110). Nathaniel chose to keep
stock's glide (2026-10-28).

The emulator drops the first two to four encoder events after FUNC goes down or the turn changes
direction (stock's encoder smoothing in rytm-emu), so the step counts above are not one a turn.

PD02's counters (rytm-emu, ZSIN on BD in PIPO, STA 0 and END 120, after one hit): PIPO turns 4,
mirrored segments 16, unmirrored turns 0 500M instructions after the hit; 17, 68 and 0 after 1,800M.
Counting idle voices too had shown thousands of unmirrored "turns": before its first trig a voice
reads stock's silence buffer and its position wanders, so PD02 counts playing voices only.

### Hardware

#### PC03 on an Analog Rytm MKII (2026-10-27), as reported

npp1993 flashed PC03 (`f128beb4…1e2a`; core-ar2 0.3, Silent Pad+Trig 0.5.1, Pipo Loop 0.1.0) and reported:

- LOP displays the three values OFF, ON and PIPO, but the switch graphic is only two-way: PIPO draws like ON.
- Zero crossing does not work. (Not part of this module: stock never snaps STA, END or the loop to a zero
  crossing, and Zero Snap is planned as a separate module.)
- The playhead in the sample player keeps moving after the envelope finishes.

Not yet reported: clicks at the turns, several voices, p-locks, scenes, kit save and reload, power cycle.

Follow-up in rytm-emu (PP05 against stock 1.74, BD with AMP DEC 3, LOP ON, one hit): the sample voice's
play position (voice 0, sampled every 23M instructions) runs through the same values on both, looping
on long after the amp envelope has ended. With LOP OFF it stops at the sample's end. With PIPO it keeps
bouncing for as long as stock keeps an ON loop running. The voice keeps playing silently behind the amp
envelope on stock too, so this is stock behaviour, not something the module adds. (rytm-emu's mixed
output does not apply the AMP envelope to the sample layer, so audio could not show the silence.)
Which screen shows the playhead was not identified.

The switch icon is drawn from a two-frame sprite (17 x 9 pixels; OFF, ON) shared by twelve OFF/ON
parameters; stock clamps any value above 1 to the last frame, so PIPO drew as ON. npp1993 chose LOP to
look like BD CLASSIC's WAV switch: PP06 draws LOP, and only LOP, through the routine and frames stock
uses for that WAV (three positions), so the module carries no picture of its own.

#### PD01 on an Analog Rytm MKII (2026-10-28), as reported

npp1993 flashed PD01 (`6ba6b5cc…9134`; PC07's code with one crossing an encoder event, plus a readout
of encoder counts, events, crossings moved and the last snapped frame while FUNC is held), loaded the
test samples PIPO_SLOW, PIPO_110 and PIPO_SQR and reported:

- A, detents: a slow detent gave one tick. FUNC + STA snapped onto PIPO_SLOW's zero crossings well.
  FUNC + END near the sample's end sat near two crossings but not exactly on them. Readouts (counts,
  events, crossings, frame), END turned left one slow detent at a time: -104 711 1 22340; -107 714 1
  22340; -108 715 1 22340; -110 717 1 22340; one fast flick: -170 721 1 22340; another: -303 731 -4
  10820. Frame 22340 is one before PIPO_SLOW's crossing at 22341: a backward snap took the last
  quiet sample, not the first signed one, and the next left turn found the same crossing again.
  Fixed after PD01 (the backward snap lands on the first signed sample, as the forward one does).
- B, line against frame: the STA and END lines on SMPL WAVEFORM sat about one column off at times.
  At the left edge, FUNC + turn left moved STA off the crossing; STA and END moved toward each other
  on neighbouring crossings went off the crossings. Both were the module passing a turn with no
  crossing to stock's whole-number step; fixed (see above). The line is stock's drawing: the module
  never draws it, and one column covers about 225 frames of a 0.6 s sample, so a line on a crossing
  can sit a column off; the frame readout is what plays.
- Later on PD01 (PIPO_110): plain points with LOP ON click; FUNC-snapped points with LOP ON are clean;
  holding FUNC and turning STA while the loop plays gives occasional clicks, clean once it lands;
  PIPO, once settled, gives a muffled knock at the turns, not a discontinuity.
- C, clicks (PIPO_110): LOP ON with STA and END not snapped clicked on every pass; snapped, LOP ON
  was clean; PIPO gave a soft knock at the turns. At a turn the waveform's slope reverses, which no
  choice of frame avoids on a pure tone, so this is expected (README).

### PD05 on an Analog Rytm MKII (2026-10-28), as reported

npp1993 flashed the build with the S and E labels (PD05/PC11 code) and reported: the labels look
great; STA and END can sit on top of each other and change places (END before STA), with both labels
showing; the loop plays; a lock set with FUNC + turn while a trig is held lands on a crossing and shows
its position when that trig is held again; "I think that's everything good". PD05 is PC11's code plus
the readout; PC11 and PP13 themselves were not flashed.

### PP14 on an Analog Rytm MKII (2026-10-29), as reported

npp1993 flashed PP14 (Pipo Loop 0.1.0 alone on core-ar2 0.7, `94bb1149…e2ac`) on an Analog Rytm MKII with stock OS 1.74
and reported, in order:

- PIPO turns on a looping sample: "fine"; the LOP switch works; moving the sample markers, zero crossing
  works fine.
- A kit saved with PIPO on and reloaded: seemed to work fine.
- A power cycle: the OS came up and booted fine. "I think we're all good."
- Stock 1.74 restored over USB (`cb0f99d6…e123`) and the PIPO kit loaded: LOP reads ERROR on the SAMPLE page,
  also after the kit reloaded; turning the knob steps between OFF and ON; no crash. The sound still loops
  ("it seems to treat the error value as loop. So it still functions").

Not itemized: no listening notes beyond "fine" for the PIPO turns, no duration, no sample length, no
firmware read-back. Several voices, LOP locks and scenes and MIDI CC 30 were not run.

### PD04 report; S and E labels (2026-10-28)

**PD04 on an Analog Rytm MKII, as reported by npp1993.** FUNC + STA/END feels better. A very slow
turn registers no change, the same as LOP with or without FUNC (stock). Once the marker skipped
between two non-adjacent crossings and would not land on the one between; not reproduced. With LOP
ON every other crossing is skipped by design (same direction as the other point); otherwise a
moderately quick turn, for which LOP's profile gives two values, stepped two crossings. Fixed after
PD04: up to two values step one crossing, past that one fewer than the values.

**Labels (PM01 test build, then PP13, PC11 and PD05).** npp1993 approved the look from the emulator screenshots ("looking great"). Stock's waveform widget (draw routine 0x4006cb16, only
caller 0x400d211c) keeps the lines' columns at +4 and +8 (value x 123 / 30720, from x0 = 2), draws
them dotted from y0 + 1 to y0 + height - 2 (y0 16, height 32) and draws the waveform over 124
columns, which is why a line can sit a column left of its crossing. As the routine ends (site
0x4006ce72) the module draws a boxed S at the bottom of STA's line and a boxed E at the top of
END's: a 3 x 5 letter, a black pixel round it, a white box round that (7 x 9), kept on screen at the
edges. rytm-emu, PIPO_SLOW: points at the sample's ends, mid-sample, sharing a column (stock draws
one line; both labels show), END before STA, and playing (the playhead runs under the labels). PP13:
the full battery as PP12, the labels and snap as PM01; PC11's quick check as PC10.

### FUNC turns step like LOP (2026-10-28)

**PD03 on an Analog Rytm MKII, as reported by npp1993.** Test E passed: STA held at PIPO_SLOW's first
crossing and END at its last; they passed each other and landed on the same crossing. With LOP ON,
plain points clicked and snapped points were clean. Test F: during untouched PIPO playback the
unmirrored counter stayed at 1 (it had reached 1 earlier, while points were being moved). A very
slow FUNC + STA turn did not step: readout -337 1077 -67 22341 / 260 931 1 before, -335 1079 -67
22341 / 260 931 1 after, so two 1-count encoder events arrived and no crossing went by.

**Cause.** Stock's encoder handler turns an event's counts into a value delta with its encoder
engine (0x4006efca, 0x4006f1fa), using the parameter's encoder profile (a pointer at its record +
16, records at 0x419a4888 + 84 x id) and two count factors (record + 4, + 8), and returns before the
edit when the delta is 0. STA and END use a fine profile (factors 1 and 64) whose delta stays 0 for
slow single counts, so the snap never ran; PD01 and PD02 behaved the same. Stock has four profiles:
the default (381 parameters), SMP's list profile (SMP and one other), STA and END's, and a stepped
profile shared by 32 parameters, among them LOP, BD CLASSIC's WAV, the OFF/ON switches and
parameter 33 (0-64).

**Change (PP12, PC10, PD04).** With FUNC held, a turn on STA or END is read through LOP's profile and
count factors (site 0x4003a0de, where the handler's two paths meet before the engine), and the snap
steps one crossing for each whole value in the delta (at most 16): a crossing goes by when LOP would
step a value, several on a fast turn through stock's acceleration. The encoder-count hook is gone.
rytm-emu, ZSIN on BD: FUNC + STA's first step came on the same event as FUNC + LOP's (8-count events
120M apart, 16-count 120M apart, 8-count 40M apart; LOP's range of two steps shows no more);
stock drops the first FUNC-held event or two after FUNC goes down, for any FUNC turn; edges held,
STA and END passed and shared crossings, grid locks and live recording landed on crossings; the full
battery as PP11. rytm-emu's encoder counts do not match a unit's (single counts never move stock's
own stepped or list controls there), so how it feels is for the unit to show.

### Code review (2026-10-28)

A second `/code-review` (high), of everything since the first, raised ten points. Each was checked
against the code and, where it could be, in rytm-emu; PP11, PC09 and PD03 carry the fixes:

- **Fixed:** the cache push before the mirrored DMA pushed only way 0 of each line's set. It now
  pushes ways 0-3 and ends with a `nop`, as poly8 does. rytm-emu models no cache, so only the unit
  can show the difference; nothing changed in the emulator.
- **Fixed:** the block after a turn, the voice's new position was worked out from STA and END as
  they are now, not as they were when the DMA was mirrored. It now uses the loop as armed.
  PIPO with END turned through the note gave the same output on PP10 and PP11 (stock's own glide
  dominates there); the battery is unchanged.
- **Fixed:** the encoder, lock and per-trig gates now hand stock back d0, d1 and a1 (the per-trig
  gate the delta exactly as it came), and the main-segment DMA gates keep d1. No symptom was seen
  in the emulator; this removes the dependence on stock not reading them.
- **Fixed:** LOP set above 2 over MIDI CC 30 plays and reads as ON but drew on the three-position
  switch. It now draws stock's ON switch (CC 1 middle, CC 2 right, CC 64 stock ON; rytm-emu).
- **Fixed:** the snap's direction came from the encoder count; it now comes from stock's delta, so a
  stale count cannot step the wrong way. A trig lock's "none" is tested as an int and as 8.8,
  `frame_of` clamps negatives in snap.c too, and LOP ON's direction filter runs before the value
  search.
- **Not a bug:** TURN_LAG with one sign at both ends. With END inside the sample every turn's largest
  step on the ramp is 1, at both ends, so neither end repeats or skips frames.
- **Kept:** a turn is still taken when the DMA was not mirrored (the window was not the one the
  module expects); not taking it would play stock's forward wrap instead, a click either way.
  PD02/PD03's third counter shows when it happens; it stayed 0 in rytm-emu, also while STA was
  snapped during PIPO.

After the fixes, on PP11: the full battery as PP10; the snap edge, shared-crossing, pass and p-lock
runs as PP10 (sound, lock editor and per-trig paths); live recording records the snapped crossings;
PC09's quick check as PC08.

### Code review (2026-10-27)

A `/code-review` of the branch raised ten points. What was done with each:

- **Fixed:** the PIPO text printed for value 2 on all eight parameters sharing the OFF/ON routine,
  and MIDI CC can put 2 in any of them. The gate now also checks that the call is for LOP's record
  (ctx 0x419a5760; a breakpoint on stock showed LOP's text called with exactly that).
- **Fixed:** the swap relied on stock rebuilding the effective STA and END every block. The handler
  now puts the values back itself when they still read as it wrote them a block ago. (Removed in
  0.1.1, PP20: stock does rebuild them every block, and that step could misfire.)
- **Fixed:** the travel estimate took any move up to 512 frames, so a wrap could pass for travel.
  It now counts only moves in the direction the voice was going, keeps the last good value, and
  follows voices with LOP ON too, so a switch to PIPO mid-note starts with a known step.
- **Fixed:** a voice with no track kept its direction state; it is now cleared there too.
- **Fixed:** STA and END were converted to frames (four divisions) every block; the result is now
  cached per voice and recomputed only when STA, END or the sample change. Voices with LOP OFF
  return after one test.
- **Not a bug:** the trig mask is per voice. Stock's prefetch for voices 1-7 tests it with the
  voice index (`btst` with the loop counter) and looks the track up separately in the owner table.
- **Kept, documented:** turns land on block boundaries. A sample-exact turn would need the engine's
  own wrap, which the prefetch does a block ahead with a forward DMA; not cheap.
- **Kept out of the branch:** the release-notes file. `npm run check` rejects notes for a module the
  library does not list yet (Silent Pad+Trig has none either); it goes in with the library entry.
- **Done another way:** `module:doctor` does not reach `_submissions/`. Run on a temporary,
  uncommitted copy in `sdk/analog-rytm-mkii/modules/`, it passed manifest, category guide and
  module rules; its one red line, no pinned browser package, applies only to library modules.
  `node scripts/machine-modules.mjs --drafts` validates this folder.
- **Fixed:** the evidence hash now fingerprints exactly the source PP05 was built from.

### Sites

| Site | Length | What | Stock guard |
| --- | --- | --- | --- |
| 0x40121134 | 6 | `jsr` to voice 0's sample prefetch in the audio interrupt, after locks, scenes and LFOs are in the effective parameters; the gate runs the handler, then tail-jumps to stock | `2e4c18b1…7c8` |
| 0x400fb56c | 6 | the first two instructions of stock's shared OFF/ON value text; prints PIPO for 2 on LOP's record, else stock | `26c0ee91…7581` |
| 0x401c04f8 | 4 | data: LOP's maximum in stock's parameter table, 1.0 to 2.0 (8.8) | `6b1e73a0…0f93` |
| 0x4011c58a / 0x4011c5e6 | 6 / 8 | voice 0's prefetch: where the DMA sources of the segment after the loop's end and of the main segment are written; exact turns swap in the mirrored frames | stock guards in build.json |
| 0x4011cb2e / 0x4011cb98 | 10 / 8 | the same in the voices 1-7 prefetch | stock guards in build.json |
| 0x4003a19c | 6 | the setup of the edit handler's lock call (a held trig, with a lock editor): for STA and END with FUNC held, the step from the lock to the next crossing | `8b2ff131…1acf` |
| 0x40037f6c | 6 | in stock's per-trig lock edit, the setup of the call that adds the turn to a trig's lock: for STA and END with FUNC held, the step from that trig's lock to its next crossing | `6bec112e…370e` |
| 0x4006ce72 | 6 | the end of stock's waveform widget draw routine (only caller: SMPL WAVEFORM), after the lines and playheads: the S and E labels | `fd3a7a09…b4f0` |
| 0x4003a0de | 6 | in stock's encoder handler, the three pushes before its encoder engine, where both paths meet: for STA and END with FUNC held, LOP's encoder profile and count factors instead of theirs | `e88c5d87…48e0` |
| 0x4003a240 | 6 | in stock's encoder handler, the setup of the view's apply-delta call; for STA and END with FUNC held it replaces the whole-number step by the step to the next zero crossing, sent as a fine turn | `87377367…3e20` |
| 0x400fedf4 | 6 | the first instruction of stock's shared OFF/ON switch icon; for LOP's record (ctx 0x419a5770, seen on a breakpoint on stock) it tail-calls BD CLASSIC WAV's three-position icon routine 0x400fef4a with the same arguments, else stock | `0528305f…fac3` |

Modwerk's linker links Pipo Loop beside Filter Hz, Loop Sync and Silent Pad+Trig together (PX07).
None of the thirteen sites is patched by Silent Pad+Trig (0x400c772e, 0x400c7a3e, 0x400c7e90,
0x400c7950, 0x400ec184), Loop Sync (0x40121020) or Filter Hz. The OFF/ON text routine is shared by
parameter ids 34-37, 45 (LOP), 224, 248 and 463; the switch icon by twelve parameters (those and 73, 414, 415, 434).

### Load and memory

- Memory: 7,221 bytes in the shared mod area (4,393 of code and text, 2,828 of state, 2,560 of it the mirror buffers), from PP09's package. The icon and zero-snap gates run in the UI task only, not in the audio path.
- Load: static estimate from the compiled handler: about 15 instructions a block for a voice with LOP
  OFF or no track, about 70 for one looping with ON, about 105 for one in PIPO, plus two calls of
  stock's frame routine (about 35 instructions each, with the MACSR wrapper) when a voice's STA, END or sample change, in place of 0.1.0's four 32-bit divisions. With the Rytm guide's emulator figure (0.023 %
  of a block per instruction a frame), about 0.1 % with nothing looping and about 0.6 % with all eight
  voices in PIPO. rytm-emu's breakpoints and profiler do not reach the audio interrupt's mod code, so
  it was not measured. Not measured on a unit.

### The STA and END lines on SMPL WAVEFORM (2026-10-28)

npp1993 sent a photo (PIPO_SLOW, both points snapped): the END line sat about a column left of where
the waveform crosses zero. rytm-emu, PP10, PIPO_SLOW on BD, STA snapped to 5061 (rising) and END to
16581 (rising), SMPL WAVEFORM read pixel by pixel (128 columns, 225 frames a column): the STA line is
in column 23, the column where the drawn waveform changes sign; the END line is in column 72, and the
waveform changes sign in column 73. The same as the photo. The module draws nothing on this view;
the lines are stock's rendering of the STA and END values, and the frames played are the crossings
(checked earlier from the voice position and the audio).
Stock-only control (stock 1.74, no module, PIPO_SLOW, END by plain and FUNC turns, settled screens):
END 17680 and 17688 (stock can't reach our 17686) both draw in column 72, as PP10 does. Fitted from
stock's own screens and checked on new values: a line sits at column 2 + floor(value x 123 / 30720),
STA and END alike, while the waveform's columns are 2 + floor(frame x 124 / frames). The lines are
spaced over 123 columns and the wave over 124, so a line drifts up to one column left of its frame
across the screen: of PIPO_SLOW's ten crossings, 7941, 16581, 22341 and 25221 draw a column left
(STA on 7941 seen in column 35, its crossing drawn in 36), the other six on the crossing's column.
Screens taken during fast turning can show a line from mid-glide; the settled screen is the one
above.

### Open items

- Possible later improvement (npp1993, 2026-10-28): FUNC snaps could skip stock's STA/END glide and
  jump straight to the crossing, so no wrap or PIPO turn plays from between crossings while a turn
  settles. Not built: STA and END as played are stock's smoothing plus LFO and velocity modulation,
  so the module would have to work out the target itself every audio block, only after a FUNC snap,
  without breaking plain-turn smoothing or modulation: more code in the audio path and another
  round of emulator and unit tests.

### Not tested

On a unit (everything below was run in rytm-emu only, or not at all):

- PC11 and PP13 themselves (PD05, the same code plus the readout, was flashed). PP14, the same code on core-ar2 0.7, was.
- Moderate-speed FUNC turns after the skip fix (one crossing for up to two values); the unmirrored
  counter staying 0 over a long PIPO note. (PIPO turns after the four-way cache push were reported fine on PP14, not itemized.)
- Several voices in PIPO at once (eight), retrig, and LFO or velocity modulation of STA and END
  while in PIPO.
- LOP's PIPO as a p-lock and in scenes, LOP set over MIDI CC 30 (including values above 2).
- The sound browser, sound SysEx dumps and Overbridge. (Kit save and reload, a power cycle and a PIPO kit on
  stock 1.74 were run on PP14; see above.)
- Silent Pad+Trig's rows and pads used together with Pipo Loop in one session (PC11 builds both;
  PD05 carried both but only Pipo Loop was exercised); Loop Sync and Pipo Loop on the same track.
- Several trigs held at once while snapping locks.
- Samples longer than 0.64 s (zero snap lands on the nearest step there).

### Library release (2 November 2026)

The owner approved the first library release of 0.1.1-experimental on 2 November 2026, on the results above. The library's package is compiled from this source in Modwerk's source-only container; that exact package has not run on a unit.
