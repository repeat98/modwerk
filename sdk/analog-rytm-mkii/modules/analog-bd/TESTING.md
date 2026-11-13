# Analog BD (Rytm): testing

## Builds

The bases named below are development builds of the Modwerk base with the digital voices (and, for BL01, a USB test link), not published and not rebuildable from this repository; the published base is the send-bus variant of repeat98/modwerk#1447 (3ece243b): this module ran on it in rytm-emu (BA21) and, by hand, on the author's unit (VB01, 12 November 2026: chosen from the BD section and offered on SD and BT only, the 808/909 tap, a kit reload keeping the type, a sound lock changing the type, a project save and power cycle; docs/verification/2026-11-12-rytm-base-digital-voices.md), but not the rig's knob sweeps.

- AB16 (0.2.0-experimental, sha256 d7bba966…, solo on Modwerk base 6fca633f): AB15 with BD ANALOG offered on the BD, SD and BT tracks only, after the unit's stress (below). emu_check: all pass, meter unchanged.
- BP02 (rytm-emu only): this module on the base of the digital voices pull request (send-bus 3ece243b, merged in repeat98/modwerk#1447): emu_check all pass, mean 3.4 %, dearest block 4.6 % of a block.
- AB15 (0.2.0-experimental, sha256 f3142d40…, solo on Modwerk base 6fca633f, send-bus with machine-list sections): the 909 of Analog BD 0.1.7 (refitted to the recorded TR-909: body from two tables, the click from a table and two decaying words, the noise envelope ramped, control every 16 samples, the model's rest), and LOW/HIGH as one weight per band for both models. tools/asm_check.py (`--pass` 1-4, machine-list sections base): every routine saves its registers; desk 134,991, bodies 270,542, click 13,156, noise 31,648 blocks checked, 0 differences. emu_check: all pass. rytm-emu meter, 808 then 909, against 0.1.0 with the lite desk on the same base: mean 3.4 % of a block (4.1 %), dearest block 4.6 % (6.5 %). Emulator counts, not unit time: the unit pays roughly three times them. Not on the unit.
- AB14 (sha256 a7676172…): base d8796d15 (the level loop two samples a turn, all four accumulators clear for render) + a voice's settings worked out only when its knobs change, the desk's crossover pipelined over two accumulators, the 909's sum and the 808's TONE in assembly. Host output bit-identical to AB12 (12 scenarios). tools/asm_check.py: every routine saves the registers it uses, and every pass matches its C. rytm-emu: mean 4.7 %, dearest block 7.1 %. (AB13, the same without saving a2 in ab_tone808.s, failed emu_check and was never flashed.)
- AB12 (sha256 61e5e703…): base a4a1b8bb + the desk's curve worked out (v - KSAT v^5 from four products) instead of read from its 2 KB table, a curve's input held inside (-1, 1), and the output stage two samples a turn. Output within -101.7 dB of AB10's (12 host scenarios); tools/compare.py against the float references unchanged to 0.1 dB. tools/asm_check.py: the desk matches its C. rytm-emu: mean 4.9 %, dearest block 7.3 % (AB10 5.0 %, 7.4 %).
- AB10 (sha256 daf92396…): base a4a1b8bb (a voice may use all four accumulators) + every per-sample pass in hand-scheduled assembly (src/ab_*.s), reading the voice and one settings record in place; a silent noise's 32 generator steps taken at once. Host output bit-identical to AB09 (12 scenarios of tools/host_render.c, both models, LOW and HIGH at both ends); tools/asm_check.py: every pass matches its C. Module RAM left 7.1 KB.
- AB09 (sha256 7da55374…): base d2b939fd (the type's name only with nothing open above the page) + the 909's pulse network and noise and the 808's trigger oscillator left out once they die away (-126 dB), and each block rendered in passes, one section each. Host output bit-identical to AB08 for the 808 default and within -130 dB elsewhere. rytm-emu: mean 6.4 % of a block (8.4 % in AB08), dearest block 8.4 %. emu_check: all pass.
- AB08 (2e0f7679): the type's name no longer draws over the list a double tap of SRC opens (rytm-emu render).
- AB07 (sha256 b170d83d…): base 910e5ce1: a trig scheduled a block or more ahead (a MIDI note's timer 16 and up) is waited for, as stock's BD CLASSIC does (0x40110a06). emu_check: all pass.
- AB06 (sha256 90de02c9…): base f5f41674: a trig's start tick (MIDI and played hits) taken and started on; the type's name black on the bar, a row higher. emu_check: all pass.
- AB05 (sha256 88d3a7ad…): Modwerk base 6ee1bda6 (digital voices, plain and centred dials, the type's name in the bottom bar, the base build's late-combine fix) + analog-bd, -O2, solo.
- AB04 (sha256 3bf53a46…): Modwerk base 85c95eab (a development base with digital voices and ev_sound_applied) + analog-bd 0.1.0-experimental, -O2, solo. Module RAM left: 8.6 KB (the base's 64 KB send-FX work area).
- AB02 (sha256 cebd12bf…): core-ar2 0.7 + analog-bd 0.1.0-experimental, -O2, solo. Its mod-storage layout is its own: don't save over projects you keep while it is on the unit.
- AB01 (c0e6a87e): withdrawn before any unit test. A guard lost in the debug clean-up let any key's press and release flip 808/909.

## Source fingerprint, 0.2.0

`evidence.sourceSha256` is the sha256 of `sha256sum build.json src/machine.c src/ab_dsp.c src/ab_desk.s src/ab_body.s src/ab_body808.s src/ab_noise.s src/ab_click.s src/ab_tone808.s src/ab_trig808.s src/ab_dsp.h src/tables.h` (in that order): `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

## Memory, 0.2.0 (12 November 2026)

22,484 bytes of the 128 KiB shared mod area (code, the 909's and 808's tables and the voice states of eight voices): `ramSpare` from `scripts/link-image.mjs` on the published base 3ece243b, 93,732 bytes with no module and 71,248 with this one.

## Unit rig, 0.2.0 (11 November 2026)

Run by an automated rig on the author's MKII, not by a person: development image BL01 (sha256 25f0415b…, RAM crc f2089275: a development base 6ae06939 with a USB control link, the same digital voices, + this module; a machine list without sections), booted from RAM, scratch project, Kit 1, 120 BPM. Notes on the auto channel (14), MAIN OUT over Overbridge, sweeps judged against src/ab_dsp.c on the host (voice_rig.py).

- Screens (screen cases of the author's rig, which is not in this repository): BD ANALOG chosen, B reads TON and the bar 808; a tap gives SWT and 909; a tap back 808. The type is kept with the sound when the machine is chosen again.
- First: silent, because Kit 1's BD had SYN off on its TRIG page (switched on at the panel). Then a MIDI note and a sequencer trig both play.
- 808: TUN within 0.0 % of the model; ATK, SWP, LOW and velocity follow it (rho 0.91 to 1.00). DEC rises on the unit (t20 58, 116, 164, 288 ms at 40-127) but the model's t20 dips at 127, so rho 0.80: not passed. TON and HI under the noise floor, not judged (as AB07).
- 909 (0.1.7 model): TUN within 0.0 % of the model at 16-112 (36.06-60.60 Hz on the unit, 36.04-60.61 in the model): the new one-octave range holds. SWP, ATK (click), LOW, HIGH follow the model (rho 1.00), velocity -> peak 0.95. DEC rises on the unit (t20 168, 342, 364 ms at 70, 100, 127); the model's 1 ms-envelope t20 sits at 104 ms for all three (the 45 Hz wave's zero crossings, its output clipped at velocity 100), so not judged. Velocity -> click fails (rho -0.2): the model clips at 100 and 127 and the Rytm's AMP follows velocity as well.
- Stress, the 909 on N voices hit together every 125 ms (BD SD BT LT MT CH RS CY): jumps (block overruns) 2 voices 0, 3 voices 0 (one silent gap in the recording), 4 voices 88, 5 voices 46, 6 voices 23, 8 voices 0 jumps but a gap (voices dropped). Three 909 voices hitting at the same instant fit; four overrun. The author, by ear: 5 is where it breaks. So 0.2.0 offers BD ANALOG on three tracks (AB16).
- Not covered: pads and pressure, save and reload, power cycle, the +Drive, an external clock, how it sounds beyond the measures.

## Host, 0.2.0 (tools/compare.py)

The C voices against dsp808.Voice and dsp909.Voice (0.1.7) at 48 kHz; the 909's reference runs 16 samples a call with its phase at 32 bits (`--p24` for the model's own). Eleven scenarios:

- 909: -58 to -68 dB of peak at defaults, TUNE ends and PTCH 127 DEC 0; -51 dB on a soft long hit; -41 dB late in a DEC 127 hit (the model's other 24-bit words). A retrig after the noise has gone quiet differs for about 1 ms, -49 to -32 dB depending on the model's noise state (worst at PTCH, TONE, ATK, SWEP and ACNT 127, DEC 0), because the engine rests the noise filters between hits and the model runs them.
- With the model's own 24-bit phase the 909 drifts by up to 1.4e-4 in pitch (0.24 cent): -42 dB at defaults.
- 808: as before (LOW/HIGH folded: -83.6 dB at 110/10/127, -86.9 before).
- A loud long 909 (ACNT 127, DEC 96-127 at LOW/HIGH 64, from DEC 90 at LOW/HIGH 127) now ends: in Q31 the VCA stops decaying once m dkm truncates to 0, above the base's quiet level; the model's rest (NIDLE, m below 2^-16) ends it at 4.2 s (DEC 100) to 7.1 s (DEC 127). Before 0.2.0 such hits never ended from DEC 112 up.
- Code review (independent agent): the asm against its C, the struct offsets and the desk fold read correct; the never-ending hit above was its finding. A second review of the rest and the tool changes found no bugs. Known small deviations: the rest is checked every 32 samples (the model every 16), so it can come up to 16 samples late, at -80 dBFS or below; and a soft hit the base ends before the rest (voice.c QUIET) keeps its slews, so the next hit's TDEP depth and thump start from the last hit's settings (-52.6 dB against the model at DEC 40, ACNT 20 then 127).
- LOW and HIGH: the 808's output is identical to 0.1.0's to -152 dB at LOW/HIGH 64/64, 110/10 and 0/127 (the lite desk already weighted the bands); the fold only saves work.

## Host, 0.1.0 (tools/compare.py)

The C voices against repeat98's float references (dsp808.Voice, dsp909.Voice) at 48 kHz, nine scenarios (defaults, endpoints, retrigs, LOW/HIGH):

- Short and mid hits match within -45 to -110 dB of peak.
- Long notes drift apart slowly (to about -23 dB of peak on a 2 s 808 at DEC 127). The reference truncates its phase step to 24 bits and this code keeps 32, so the waves drift; their level stays within -40 dB.
- At ATK 127 the 808's first samples are limited before TONE. The OT DSP limits there too (bd808.asm `move a,x1`); the float reference does not.
- Built with -fsanitize=undefined. A signed overflow in the triangle (fixed) had made -O2 differ from -O0.

## rytm-emu (2ac0f1f), AB01

The emulator's analog model is not hardware evidence: no sound was judged.

- Boots with no faults (only TRAP #0, as stock). BD ANALOG is at the top of BD's machine list (FUNC + SRC).
- The SYNTH page reads TUN TON ATK DEC / SWP LOW HI LEV. Slot 36's page order is A 10, B 13, C 14, D 11 / E 15, F 12, G 16, H 9.
- Trigs from the sequencer start the voice (state and timer reset). Stock writes the hit's velocity to 0x800067c4 + 2·track (0x7f00 for a pad press) before the engines run.
- The 808 default hit peaks at 0.41 of full scale in the voice's stream (LEV 100 = 0.62 × the model's 0.66).
- A tap of B (PUSH_B) on the page flips the sound to 909: B reads SWT, the bit is stored in the sound and the next hits run the 909 model (debug build).
- Render time per sounding voice, measured with DTIM0 in a debug build (instruction-timed, no cache model): 808 about 5.4 % of a block (max 5.9 %), 909 about 11.1 %.
- `--press BD` (a pad) and MIDI note-ons did not trigger track 1 in the emulator, for stock BD HARD either. Use the sequencer there.

## rytm-emu, AB02 (review fixes)

- Choosing the machine plays nothing and leaves the stream at zero (voice state -1, no hit).
- RECORD, T1, T9, PLAY and STOP leave B at TON; one tap of B after them gives SWT and the 909 plays; a second tap gives 808 again.
- The stream is cleared after the mixer on every block the engine wrote (ev_render_out, which core hooks at 0x401216c2, after the mixer call at 0x4012129a).
- A tap sent right after reloading a snapshot did not register once; the same tap in one run did. Not seen otherwise.

## AB03: speed (emulator, tools/emu_check.py)

- The 909 body (fitted polynomial and quadrature) and the 808 body (sine and second harmonic) are functions of phase alone, and the desk curve of one value: each is now a 1024- or 512-point table built from the same functions (tools/gen_tables.py), read with linear interpolation. State lives in locals for the block; sums of products accumulate in the EMAC and truncate once.
- Against AB02's C: -82 to -89 dB of peak at most, -94 to -107 dB RMS (16-bit table quantisation). Against the reference, unchanged except the cleanest scenario (-96 to -88 dB).
- Render time per sounding voice: 909 8.2 % of a block (11.1 % in AB02), 808 4.9 % (5.4 %). Module RAM +6 KB.
- `emu_check.py AB03.syx`: select, keys, tap (voice 1's DAC slot peaks 20317 of 32767 after the tap), meter: all pass.

## AB04: on the base's digital voices (rytm-emu)

- The module is now its DSP, a knob map and `struct mw_voice`; the base runs the rest. Host output is bit-identical to AB03.
- `emu_check.py AB04.syx`: select, keys, tap (voice 1 peaks 20317 of 32767 after the tap) and the base's meter (8.4 % of a block, 808 then 909): all pass.
- The apply-sound routine's two sites (0x4011f642, Sample Rate's, and 0x4011f654, the base's) are each visited 20 times from boot to choosing the machine.
- Not exercised in the emulator: a trig's sound lock (the type should follow it).

## AB05 (rytm-emu)

- The SYNTH page reads TUN TON ATK DEC / SWP LOW HI LEV with plain dials (SWP and the top row), centred dials (TUN, LOW, HI), LEV's bar, and 808 in the bottom bar, right of the pattern (rendered from the frame buffer).
- `emu_check.py AB05.syx`: all pass, as AB04.
- Not checked in the emulator: the value text while turning (its encoder nudges did not reach the knobs here).

## The unit rig (tools/rig_plan.json, rig_host.py)

`sdk/machines/analog-rytm-mkii/tools/voice_rig.py` with this plan: 808 and 909 passes of nine sweeps (TUN, DEC, TON, ATK, SWP, LOW, HI, velocity, the 909's click by velocity), against src/ab_dsp.c built for the host. Checked offline before the unit runs below: on the host model through a stand-in path (-6 dB, an 8 kHz low-pass, noise at -80 dBFS, 44.1 kHz) every sweep passes, but the 808's TON and HI, whose 1-8 kHz attack sits at that noise floor (reported, not judged); with TUN and velocity broken on purpose it fails both, on both types.

## Unit rig, AB05 (5 November 2026)

Over USB (MIDI and the unit's audio), 808 pass: select and switch passed, but 39 of 40 hits were silent, then 14 of 15 on a rerun. The base took a hit only when the voice timer read 0, and a MIDI trig sets it to its start tick (0..15; stock's engines read timer & 15). Fixed in AB06; the sweeps were not judged.

## Unit rig, AB06 (5 November 2026)

808 pass over USB: select and switch passed; 39 of 40 hits still silent. A probe of four hits each (note 0 on channels 1 and 10, note 60 on channel 1) sounded about one in four on every channel: the trig arrived but the base marked it taken while its timer still pointed a block or more ahead. Fixed in AB07.
Open: the type's name in the bottom bar draws over the menu a double tap of SRC opens (the author, AB06).

## Unit rig, AB07 (5 November 2026)

Found while running it, in the rig, not the module: the Rytm plays nothing for a note-off right after its note-on (stock BD HARD the same); knobs sent for the next hit retuned the ringing one; a sample on the track swamped level and the high band. Fixed: notes held 1 s, knobs set 0.25 s before their hit, the plan switches the sample layer off.
808 pass, AB07, over USB (MIDI and the unit's audio): select and switch pass; tune (0.0 % from the model), decay, attack, sweep, LOW and velocity follow the model. TON and HI not judged: every hit's 1-8 kHz attack sits about 24 dB over the model's on the unit, whatever TON or HI, so they do not move it. Where that energy comes from is open.

## Unit rig, AB07: both models (5 November 2026)

Over USB, sample layer off, re-judged with the rig's later measures (attack and HI on 2-8 kHz, onset back from the peak, hits with a recording dropout left out):
- 808: select, switch, tune (0.0 % from the model), decay, attack, sweep, LOW and velocity pass. TON and HI observed: the 808's own top end sits under the unit's hiss.
- 909: tune (0.1 %), decay, TON, attack, sweep, LOW, HI, velocity and the attack's presence by velocity pass.
- Stress: not conclusive. Six voices gave 75 sample jumps and 4 silent gaps against 0 and 0 for one, but later one-voice baselines gave up to 49 jumps (a 909 retrigger over a ringing hit is a legitimate jump) and the USB audio stream drops blocks with one voice too. The author heard dropouts with six voices by hand.

## Unit CPU, ABM1-ABM5 (5 November 2026)

Diagnostic builds (an on-screen meter, never released) on a MKII, one track of BD ANALOG playing four on the floor, samples off. DTIM0 runs at half the core clock (32 adds take 16 ticks). A `mac.l` read back by the next instruction costs 5 cycles; four spread over ACC0-ACC3 cost 2 each; three independent instructions between hide the wait. Each pass was timed twice in the same block: as rendered (cold: stock's work has evicted the module's code and tables) and again at once (warm). Ticks/10 a block of 8800, setup/body/pulse or trigger/noise/desk:

| Build | 909 cold | 909 warm | 808 cold | 808 warm |
| --- | --- | --- | --- | --- |
| ABM2, AB09's C | 58/232/54/65/412 = 821 | 18/172/28/42/339 = 599 | 16/126/34/-/405 = 581 | 7/88/20/-/341 = 456 |
| ABM3, the desk in assembly | 787 | 539 | 542 | 387 |
| ABM4, every pass in assembly | 56/212/58/40/323 = 689 | 17/134/35/22/256 = 464 | 531 | 367 |
| ABM5, nothing copied around the passes | 50/178/49/23/326 = 626 | 13/124/28/14/259 = 438 | 19/119/39/-/341 = 518 | 5/78/28/-/263 = 374 |

One 909 voice went from 9.3 % of a block to 7.1 %; rytm-emu's count matches the warm column (808: 426 against 456 in ABM2).

## Unit CPU, ABM6: the whole block (5 November 2026)

A diagnostic build of AB12 (never released) timing the whole audio block (ev_render_in to the last ev_render_out: stock's work, the base's and the voices') on a MKII, base with the send bus and no send effect chosen, sample layers off. Ticks/10 of 8800, a second's mean / dearest block:

| Playing | Whole block | BD ANALOG a voice | its passes (setup/body/pulse or trigger/noise/desk) |
| --- | --- | --- | --- |
| nothing | 5823 / 6392 | - | - |
| track 1, every 125 ms | 6747 / 7470 | 624 / 753 | 37/123/88/0/331 |
| tracks 1, 2, 5, 6 together | 8207 / 8719 | 459 / 688 | 15/89/75/0/262 |

With nothing playing the block already takes two thirds of its time (three quarters at its dearest), which leaves room for about four voices hitting together: the AB10 and AB12 stress overran from four. No noise pass ran, so these tracks played the 808 (the rig sets the machine over MIDI but cannot tap B for the 909). Voices in the same block share their code and tables in the cache: four cost 459 each against 624 for one.

## Host: is the desk transparent at LOW and HIGH 64?

No, not at a hit's level. Against the best fixed gain in its place (tools/host_render.c, 400 blocks), the desk's difference at LOW 64 and HIGH 64 is -73 dB (808) and -117 dB (909) below the peak at velocity 30, but -31 to -22 dB (808) and -17 to +5 dB (909) at velocities 100 to 127: its curves round the hit's peaks. So the desk cannot be skipped at the centred settings without changing the sound.

## Unit telemetry, ABT1 = AB14 (5 November 2026)

AB14 with a telemetry base (never released: the block's time and the module's pass costs sent as SysEx once a second), BD ANALOG on N tracks hit together every 125 ms (a scratch script, the rig's tracks and setup), 15 s each; every track played the 808 (no noise pass ran). Block share mean / dearest; a voice's render and its passes in ticks/10 of 8800:

| Voices | Block | Render a voice | setup/body/trigger/-/desk |
| --- | --- | --- | --- |
| 0 | 64.4 % / 71.6 % | - | - |
| 1 | 75.6 % / 83.1 % | 597 / 698 | 37/117/84/0/317 |
| 3 | 87.6 % / 95.8 % | 477 / 683 | 21/95/77/0/262 |
| 4 | 93.1 % / 101.2 % | 458 / 721 | 19/93/75/0/254 |
| 5 | 96.7 % / 113.4 % | 445 / 666 | (one message: the UI task starved) |

Each voice adds about 7.7 % of a block (render about 5.4 %, the rest the base's per-voice work and stock's for a playing track); the dearest block passes 100 % at four.

## Unit telemetry, ABT2 and ABT3 (5 November 2026)

ABT2 = AB14 + the 808's trigger oscillator in assembly; ABT3 also times the base's whole turn for a voice. Same run as ABT1 (808 on every track):

| Voices | Block | Added a voice | Render | Base around it | Stock and the rest |
| --- | --- | --- | --- | --- | --- |
| 1 | 75.0 % | 10.4 % | 6.56 % | 1.50 % | 2.33 % |
| 3 | 86.3 % | 7.2 % | 5.18 % | 0.89 % | 1.16 % |
| 4 | 92.0 % | 6.9 % | 4.98 % | 0.81 % | 1.07 % |

The trigger pass fell from 84 to 67 ticks/10 a block (one voice). The settings cache held: 0 or 1 recomputes in 21,000-87,000 voice blocks. Setup still costs 20-33 ticks/10: copying the cached settings into the shared records refills their cache lines. The base's per-voice work costs about four times its instructions (cache refills of its code and data).

## Unit telemetry, ABT4 (5 November 2026)

ABT3 + the base's rare per-voice paths (a hit's start, its delayed first blocks, the pitch ratio) moved out of the block's way. The base's share a voice fell from 1.50/0.89/0.81 % to 1.24/0.79/0.74 % of a block (1/3/4 voices); the block itself stayed within the runs' spread (4 voices: 92.1 % mean). Where a voice's time goes now, at four voices: render 5.1 %, the base 0.7 %, stock 1.1 %; stock itself takes 64.7 % with nothing playing. About four BD ANALOG voices hitting at the same instant fit; more overrun the dearest blocks.

## Unit stress, AB12 (5 November 2026)

AB10's stress again, the USB stream checked live before each step: 3 tracks 0 jumps (AB10: 9); 4 tracks 59 (43); 5 tracks 42 (172); jumps locked to one place in the block, as before. At 6 tracks the level fell 6 dB with 11 of 32 hits missing and no jumps; the stream stayed live this time, but its floor afterwards read -38 dBFS instead of about -82 (not looked into on the unit). Three 909 voices hitting together now play clean; four still overrun a little.

## Unit stress, AB10 (5 November 2026)

The same stress as AB09's (the 909 on N tracks at once every 125 ms, sample layers off, every voice in its attack together), USB stream live before each step. Sample jumps (> 0.5 between neighbours): 2 tracks 0; 3 tracks 9; 4 tracks 43 (AB09: 398); 5 tracks 172; each run locked to one place in the 32-sample block, the mark of a block overrun. At 6 tracks the level fell 6 dB with 12 of 32 hits missing, and the unit's USB audio stream then delivered only zeros (not replugged before the 8-track step, which recorded silence). The overrun starts at about four 909 voices hitting together, as in AB09, but an order of magnitude smaller there.

## Unit stress, AB09 (5 November 2026)

The rig's stress over USB, sample layers off on every track, the 909 hit on N voices together every 125 ms (every voice in its attack): one voice 0 sample jumps; 2 voices 3; 3 voices 3; 4 voices 398 jumps, 3 dB lower, the jumps locked to 3-5 samples into the 32-sample block: the audio block overruns. An earlier attempt (AB09, samples still on) left the unit's USB audio stream delivering zeros until it was replugged; the unit itself kept running. Module memory is cached: the OS sets ACR0 0x4007E020 (0x40000000-0x47FFFFFF, copy-back), the module area included. rytm-emu put 4 voices at about 34 % of a block, so the unit pays roughly three times what the emulator counts; the likeliest reason is the EMAC's result latency (every multiply's result read at once), which the emulator does not time.

## Unit

AB04, the author on a MKII (5 November 2026): boots; BD ANALOG tops BD's list; velocity, the tap of B (TON/SWT), chromatic mode, other keys leaving the type alone, saving and loading a 909 sound, a 909 sound lock on an 808 track, no buzz on a machine change mid-tail and a sample beside it all worked. SWP still acted as stock's 3-way waveform switch and HI as the transient picker (fixed in AB05). Six voices of BD ANALOG made the unit sluggish, with dropouts.

