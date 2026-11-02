# Analog BD 0.1.6 — TYPE and FIXD switches

Current as of 28 October 2026. This pull request now publishes package `f83c7f81` on beta base `6483508a`, rebuilt after `main` took #943 and new bases (#1017, #1026, #1030); the module source is the one tested on 27 October as package `a2def725` on base `64ce4825` (below), and only the base link differs. This rebuild is not yet tested on hardware; every result below names the build it ran on.

## What changed and how it was checked (software)

- **SETUP layout.** TYPE (slot 6), FIXD (7), ACNT (8) above LOW (9), HIGH (10), LPF (11). TYPE and FIXD reuse stock's AMP SETUP SYNC mechanism, read from the local OS's descriptor: count 2, switch widget `0x40046f10`, no handler of their own. FIXD also takes SYNC's own OFF/ON words; TYPE has its own 808/909 formatter. Slot 6 is the model byte the engine browser edited, so the 808/909 choice and the default (808) are kept. The page follows the model each UI tick.
- **LPF.** Its tables are rotated so 0..126 run 500 Hz to 18 kHz (ORIG at 63) and 127, the default, is OFF (0.1.5's default was 18 kHz). `dsp_host` renders of the 52 scenarios with each old setting moved to its new slot (LPF value v -> v-1, 0 -> 127) are identical to 0.1.5's.
- **FIXD, both models.** 909 (`bd909.asm` zq06, at each trig): ON fixes the click strength at `KPBASE` (0.96) and restarts the noise LCG from `SEED`; OFF runs the 0.1.5 instructions behind one test and branch. With FIXD ON the four hits of a render differ by at most 0.0006 of full scale over the first 3000 samples (filter histories carry over; about -64 dB), against 0.008-0.033 with FIXD OFF. 808: FIXD OFF is new, one LCG step per hit scales the trigger transient (PC, PS, DC) by 1 + 0.04 * white; FIXD ON is bit-identical to the 0.1.5 808. The float models match the DSP at -75.7 dB (909 OFF), -75.2 dB (909 ON) and -100 dB (808).
- **FIXD's stored byte.** The ColdFire record sends FIXD as ON only when the byte is 1. A 0.1.5 track holds its ACCNT (0-127) in this slot, so until FIXD is set again it plays OFF, on every track; any nonzero accent no longer reads as ON. On the selected track the UI tick also puts TYPE or FIXD bytes outside 0/1 back in range (TYPE to 909, as the DSP played any nonzero byte; FIXD to OFF) in both Part copies, the live controls and the stock editor's dirty flags.
- **0.1.5 projects are not converted.** ACNT, LPF and FIXD moved slots, and there is no signature change or rewrite: a 0.1.5 track loads its old LPF byte as ACNT (127 by default), the old hidden slot's 0 as LPF (500 Hz) and FIXD OFF. README says to set them again.
- **HIGH.** The base's SRC SETUP editor hook (`machine_registry.s`) left encoder E read-only for every module machine, which is Analog BD's HIGH since the base took over the machine hooks (#585). Analog BD sets the base flag `SETUP_ALL` (repeat98/modwerk#943). The card build edits every slot.
- **Double tap.** Analog BD has no pool and sets the base flag `LIST`, so over USB the base opens the track's window on the machine list (`mw_chooser_column`, 0x400788c4), as for PICKUP. Card builds keep the module's own handling: it opens the window about 200 ms (12 UI ticks) after the double tap and keeps it on the machine column, because a key release reaching an open window returns stock to the (empty) pool column of the FLEX track underneath. RIGHT on the Analog BD row does nothing. `ot_emu` (card build): the double tap shows SELECT MACHINE TYPE with ANALOG BD highlighted; T2's double tap then T1 shows the machine list; FLEX + RIGHT still opens FLEX's pool.
- **The engine browser** is not opened any more. Its code stays compiled, unreachable after `if(1) return;` in `ab_engine_open` (commented there), because the card build's list hooks and the CF verifier still name its symbols.
- **SRC SETUP preview.** While the track is still FLEX, TYPE's slot holds FLEX's LOOP byte; the preview always uses the 808 page (the default after assignment). In the preview the TYPE switch can still read 909 until YES.
- **DSP efficiency, bit-identical.** Both engines are rescheduled without changing a result: the desk skips its three SAT table interpolations once SAT has settled, immediate loads ride in the parallel-move slot of the ALU instruction before them, `tfr` with a parallel immediate replaces a register copy plus a load, and the VCO phase, the pulse HP and the biquad histories stay in registers. `dsp_host`, 52 scenarios (26 per engine, 1.2 s each: defaults, every control at both extremes, FIXD ON, SAT steps, ramps and random jitter, random automation, retriggers at random offsets): every output sample identical to the previous build. Executed instructions per 16-sample block (emulator count, not chip cycles): 909 peak 6534 -> 5999 (about -8 %), mean 6488 -> 5519 (about -15 %); 808 peak 4260 -> 4034 (about -5 %), mean 3979 -> 3345 (about -16 %). The declared DSP price (411 per voice) is unchanged: it comes from 0.1.5's full-chain emulator measurement, which was not repeated, so it now over-states the cost and gives no voice more room.
- **P words.** Resident engine 1009 per core (998 in 0.1.5): -26 from the rescheduling, +37 for the FIXD tests and the 808's per-hit variation (one LCG state word in the 808 voice block, which had it free). The card build's combined glue and engines: 1008 (997 in 0.1.5).
- **Exact render.** `exact-render.json` holds 0.1.6's 16 audio and state hashes (`verify_analog_bd_exact.py` passes). The pins it replaced were already stale on `main`; 0.1.6's own changes are the 808's per-hit variation (FIXD OFF in the default, minimum and automation cases) and the new slot meanings (the `maximum` case now has FIXD ON and LPF OFF). `tools/harness/bd909.py` is a pinned infrastructure import and stays byte-identical, so its patches keep the 0.1.5 slot order.

## Hardware (MKII, reported by npp1993)

- 27 October, this build: base `64ce4825` RAM-booted over USB, Analog BD `a2def725` kept, self-test passed (1/1). Then flashed as part of a personal base `5afa623e` (this branch plus a separate base fix for FLEX switching, not in this pull request) with 13 other modules: self-test passed (14/14 intact, 9 DSP effects together, cores 77 % / 80 %), and after a power cycle the unit started from that slot and reloaded all 14. Observed: SRC SETUP reads TYPE FIXD ACNT / LOW HIGH LPF with 4-letter labels; TYPE flips 808/909 live; FIXD shows and switches on both models; encoder E moves HIGH; LOW and LPF move, LPF reads OFF fully clockwise; the double tap opens the machine list at once with no flicker. On the flashed personal base, later the same evening: T2's window switched to T1 shows the machine list, and a double tap on a FLEX and on a STATIC track opens their pools.
- Known base limits seen in the same run, not caused by this module: switching a track FLEX → Analog BD → FLEX left the old machine's live parameters until SOURCE CLEAR (a base fix on its own branch); right after a boot, Analog BD stays silent if PLAY is pressed before its engine is placed, which happens only while stopped (`docs/OCTATRACK_RESIDENT_ENGINES_ON_DEMAND.md`, "What this costs"; a base fix is planned separately).

- 25 October, RAM-booted base `7346a1f5`, Analog BD `fbc09d07`: the SETUP order, LPF direction and default, 4-letter labels, TYPE flipping live, save/reload of every value and SOURCE CLEAR (LPF back to OFF) work. HIGH did not move; the double tap flickered from the main page and showed an empty page when the window was switched to the Analog BD track from another track. Both were fixed afterwards (HIGH and Double tap, above).
- Later RAM boots: base `1e022103` (FIXD shows at once, T2 -> T1 shows the machine list, the direct double tap still flickered); base `89b8226d` (no flicker, but the window came up a little later than on stock machines).
- 26 October, flashed base `9976a5e8`, Analog BD `dfcb89a1`, 13 other modules kept: the layout and labels, TYPE flips live, FIXD shows on both models, HIGH moves, LPF OFF fully clockwise and at SOURCE CLEAR, save/reload keeps every SETUP value, the double tap opens the machine list at once with no flicker, T2 -> T1 shows the list, and the 14-module set survives a power cycle.

## DSP load on the chip (MKII, 27 October)

Development twins of the two bases (`--dev`, identical but for Analog BD's trust row: #944's with 0.1.6 `462af6b8`, #943's with 0.1.5 `c03c9a5b`), RAM-booted. A blank project, one Analog BD voice on T1 (core 1), a trig on all 16 steps at 120 BPM, playing; the same settings on both (ACNT 64, LOW/HIGH 64, LPF 18 kHz, FIXD OFF). Twelve readings of the base's per-core meter (`stats`, per mille of core 1, idle-pass based) one second apart after 3 s of play; medians. One voice because the base refused a second (DSP FULL, +23 %).

| | 0.1.5 | 0.1.6 | change |
|---|---|---|---|
| 909, mean | 545 (+141 over the empty track's 404) | 508 (+104) | -26 % |
| 808, mean | 495 (+91) | 476 (+72) | -21 % |
| 909, peak | 554 (+142 over 412) | 529 (+117) | -18 % |
| 808, peak | 506 (+94) | 487 (+75) | -20 % |

So one voice loads its core about a fifth to a quarter less than in 0.1.5 on the chip, more than the emulator count (about 15 % fewer executed instructions on average). Limits: one voice on one core, knobs still, the base's idle-pass meter rather than a cycle counter; the 0.1.6 808 includes its per-hit variation. The declared price (411 per voice) is unchanged.

## Not tested

- Loading a project saved with 0.1.5 on the unit (808/909 kept, FIXD OFF before a track is selected, ACNT/LPF as README says, save and reload): no such project was at hand. There is no migration; this would check the documented behaviour.
- A null test of FIXD OFF (909) or FIXD ON (808) against 0.1.5 on the unit.
- Chip cycles per instruction and full-chain loads with several voices.

# Analog BD 0.1.5 — FLEX restore regression

Date: 9 October 2026. Tester and approving owner: repeat98 (Jannik Aßfalg).

The exact private candidate offered for the hardware check was **AB015FIX01**, module 0.1.5-experimental. After the request to switch Analog BD to FLEX without SRC + PLAY and power-cycle, the owner replied:

> flex persists. merge and update

This is a reported physical FLEX reboot-persistence result, limited to that statement. Model, duration, audio/transport behavior, number of instances, Part/project save/reload results and maximum load were not supplied. It does not establish the Output Matrix sequencer-halt fix. The owner directed this exact release after being informed that 0.1.4 approval did not cover it and broader checks remained missing. The separate sdk/analog-bassdrum-build-approval.json records the new version/source approval and its remaining qualification limits.

The candidate machine source was copied byte-for-byte into the public module. Native source SHA-256: `e741e4876ea3ae44eb54ddc93ff3b5bf5f65ebb3e9320cc5fd1f602f7925966d`. Private MAIN OS SHA-256: `137580f326b6adc3b0d58f2183d530507f1b370c48911b38d5d0cf94d9e96898`. Saved private upgrade SHA-256: `5737e32c4823fffa3236469e82425b3eb53ba75da1d8d0a690b824eaefeb63e2` (568,928 bytes); its decoded MAIN OS equals the native image.

## Software regression

The compiled ColdFire hook restores six playback and six SETUP bytes from the owned stock defaults at runtime before clearing a valid AB/1 marker. All four callers, eight tracks and four Parts pass 512 marked/unsigned/malformed cases; 32 Analog BD reselection cases and all five other machine destination rows pass. Both volatile and battery-backed Part copies are checked, along with unchanged unrelated bytes and register/stack behavior. The 0.1.4 writer fails the restore assertion.

Current-source DSP-enabled ot_emu receives actual panel assignment and switching. A separate process then restarts with only the captured battery RAM and saved card, `--cs1-in --no-post`; no LOAD PROJECT is posted. 0.1.4 switch rejects the bank and restores all eight STATIC machines. The candidate switch restores all eight FLEX machines. Leaving 0.1.4 assigned Analog BD restores its marked track as a control. Sanitized records and reproducible gates are in sdk/drafts/analog-bassdrum-flex-restore/evidence/chooser.json and evidence/reboot.json, verify.py and reboot.py. These are emulator results, distinct from the owner report.

Both cores' DSP code and complete DSP uploads are byte-identical to 0.1.4. The ColdFire runtime grows from 14,016 to 14,052 bytes (36 bytes). No new DSP state allocation is introduced; the copy occurs during machine assignment, not in the audio loop. Historical DSP instruction measurements below remain historical, not new chip-cycle measurements. Complete memory/stack lifetime bounds, maximum FX load and broader current-build hardware checks remain unverified under the exact owner-approved experimental release.

## 0.1.5 common-builder comparison

116 selections: 46 native module-owned OS/DSP images match, 70 matching native/browser refusals, zero byte mismatches. Four of the 46 native images fit the smaller logger-free runtime but are refused by the browser’s mandatory logger boot-memory guard; these are explicitly recorded as additional browser platform refusals, leaving 42 buildable matched selections. No guard is disabled and no firmware is generated for those crowded layouts. The standalone native image remains identical to tested AB015FIX01; the downloadable image additionally carries the mandatory core logger and is checked independently by saved-download identity.

## Historical 0.1.4 reference qualification

# Analog BD 0.1.4 — 909 direct-out reference update

Current release uses the owner-auditioned **AB014REF05** DSP/fit source. The owner replied “it's ok, let's release it”, then explicitly confirmed “Yes—waive those limits and release” for fresh physical hardware/persistence, worst-case chip timing and complete memory bounds. This is a new exact-source approval; the 0.1.3 physical report below remains historical. Current hardware status is **untested**, not reported or verified.

The 909 body phase/asymmetry, envelope/DC and both Tune endpoints are fitted to Skee Mask's 70 BPM direct-out recordings. Attack is fitted at LPF bypass; the real 909 main-out LPF was not in the recording path. The reference instrument has a decay modification; its complete modified range is not modeled. Intermediate recorded knob positions remain unknown, and endpoint repeats may still contain knob motion.

Current evidence lives in `evidence/909-reference-*.json`; the full analysis/methods are in [the reference testing report](../../../drafts/analog-bassdrum-909-reference/TESTING.md). The exact pre-promotion native gates were run from commit `d96ae7f` against the approved 0.1.3 SDK snapshot, then these three DSP/fit files were copied byte-for-byte into the release folder. Their individual hashes and the tested private MAIN OS are recorded in port/private-build evidence. Tests do not play captured samples.

- Native min/max, SAT 0/64/127, moving controls, rapid retriggers and all 16 trigger offsets pass. All 128 values of ten audible controls are fraction-bounded and pass model comparison. Quiet all-minimum cases pass explicit absolute quantization limits rather than relative error.
- Four interleaved distinct voices/core pass control/reset isolation; both combined code origins match standalone audio. Tested 808 audio and instruction counts remain bit-identical to 0.1.3.
- Actual complete-image source/control/stock AMP output passes at TUNE/ATK 0/0 and 0/127 on core A and 127/0 on core B, with 808 on the other core. Eight complete repeated high-Attack hits were captured. Source/model error is −72.1 to −72.7 dB; AMP/source residual −118.1 to −118.6 dB. The saved private upgrade decodes exactly to the tested image.
- Matched both-core 2048-block instruction runs give 909 mean 6524.07/peak 6563 per block versus 6141.77/6176 for 0.1.3: +6.22% mean and +6.27% maximum matched-block increase. 808 mean 4268.47/peak 4294 remains unchanged. These are executed instructions, not modeled chip cycles or hardware timing.
- Code occupies 997 P words/core plus the separate 35-word stock helper, within the existing reservation. X upload remains 3776 words/core, four 64-word voices/core; Y and ColdFire allocation are unchanged. Complete lifetime/stack bounds remain unmeasured.
- The original treble analysis clipped the reference partway into the attack, creating an artificial discontinuity. Corrected full-onset measurements include 512 samples of natural pre-roll. Current upper-band deficits and neighboring-shape mismatch remain explicit; the private listening clips always contained full hits.
- Eight native equal-control hits have 2.23% peak spread, down from 3.42%. Seven carried-state firmware-emulator hits have 1.81% tail-normalized peak spread. After fitted level/alignment removal, reference final-four shape spread is 3.12%/3.01% over 0–10/10–30 ms, versus 0.86%/0.24% in the emulator. Faithful individual-hit reproduction is not established.
- Current-source physical audio, Part/project/reboot persistence, demanding FX load, worst-case chip timing and complete memory bounds remain untested/unmeasured. The exact owner exception does not convert them to passes. High ACCNT/LOW can still reach the existing output limiter.

Fresh DSP-enabled UI capture passes on AB014REF05: source assignment, engine browser and 808/909 pages were captured with the disposable loaded project, then all four PNGs were opened and reviewed. The 808 shared page reads TUNE for its third encoder; its underlying TONE behavior is unchanged. Current media metadata documents the displayed label. The isolated pinned source toolchain compiled all current source-only packages without firmware. Development import validates their complete source inventory and version pins. Native/browser parity passes all 112 configurations: 36 matching builds outside existing platform writes, 76 matching refusals, zero mismatches. Node 24.21.0 `npm run check -- --base origin/main` passes after integration with main `d1e38bc`: 1,402 app tests in 200 files, 86 SDK tests, catalogue/licence checks, lint, types and the production bundle. Existing lint/bundle warnings remain. The broader 136-profile interaction matrix is regenerated from the current source; its native/bootstrap verification and clean-commit package reproduction are completed before publication.

## Historical 0.1.3 qualification — retained without relabelling

# Analog BD modulation fix — testing

Release: `0.1.3-experimental`; approved base: `0.1.2-experimental`.
Owner report, 8 October 2026: modulating TDEP and SAT produces audible zipping.
The report did not identify the device, image hash or modulation settings.
The later owner hardware result and release approval are recorded below.

## Native evidence — 8 October 2026

The isolated Linux DSP interpreter assembled and disassembled the exact candidate.
[evidence/native.json](evidence/native.json) binds source, base, tool and test
identities to the results. No stock firmware was used in these tests.

- Ten constant renders (808/909, SAT 0/64/127 and all-controls minimum/maximum) are bit-identical to the approved
  sources: 13,216 stereo samples each, all trigger offsets and rapid retriggers.
- Stepped TDEP, SAT and combined automation match the independent sample-wise
  reference with residuals from −92.39 to −106.31 dB. Actual native state checks
  verify upward/downward slews and continuity through retriggers.
- Full-range first-sample parameter-change deltas fall by 36.07–36.26 dB for
  909 TDEP, 28.02–58.35 dB for 909 SAT and 39.08–43.49 dB for 808 SAT. The probes
  compare a changed control to a held control with the same preceding state;
  these are deterministic jump measurements, not listening scores or a guarantee
  about every patch/modulation rate.
- The compact combined image renders exactly like the standalone engines at
  both native P origins (A `0x1252`, B `0x1012`). It uses 946 P words per core
  against a 1,028-word region, preserving the separate stock-helper reservation.
- Four interleaved instances per core placement use distinct patches and two
  808s/two 909s. Every audio stream is bit-identical to that voice alone. Editing
  their controls and resetting one 909 does not change the other voices. The host
  uses the native 64-word voice stride and stores knobs at voice +48, exercising
  the reused scratch slots. These are DSP-core placement/instance tests, not
  full-machine or physical-device tests.

The initial approach slewed SAT's three coefficients independently. The 808
full-range jump probe exposed gain overshoot and insufficient step reduction.
The delivered candidate slews SAT position before table interpolation; all probes
above then pass. The macOS execution sandbox failed before Python started, so
only the isolated Linux results are claimed.

## Resource accounting and limits

Combined peak executed instructions in the focused modulation/retrigger workload
are 6,176 per 16-frame 909 block (386/sample) and 4,294 per 808 block (268.375/sample).
These are measured executed instructions, **not worst-case chip cycles**. They
exceed the approved standalone harness's old instruction-growth guards, so that
old timing evidence must not be used to release this update. Full-chain budgets
and maximum audio/FX load remain untested.

P allocation: 946 words / 2,838 packed bytes per core; the 35-word stock helper
stays in its separate reservation. The existing X upload region remains
`[0x2840,0x3700)`: 3,776 words / 11,328 packed bytes per core, including tables,
voice blocks and alignment gaps. Both engine banks keep four 64-word blocks per
core, 512 words / 1,536 packed bytes in total. No X, Y or ColdFire allocation is
added. Per voice, SAT history uses previously unused X word +61. The 909's depth
histories reuse +21/+22; temporary body/pulse scratch moves to consumed MODEL
and unused-control slots +54/+59. Controls are recopied before each block. Init
clears PAD, so first-use seeding also resets the SAT history without clearing
another voice. ColdFire assignment, transport and saved control layouts are
byte-identical to the approved base (bound in [evidence/native.json](evidence/native.json)).

Relative resource estimates: ColdFire demand unchanged; DSP remains high per
active voice because synthesis plus desk now also performs per-sample smoothing
and table interpolation; memory demand is unchanged. These estimates do not
replace the missing full qualification accounting/timing.

## Reproduction

Use an existing reviewed native-toolchain image with Python, a C++ compiler,
DSP assembler/disassembler and emulator static libraries at `/opt/toolchain`.
The local run used `octamod-tapehead-qualification-tools:local`, image ID
`3a5861370c0f`. The exact assembler/disassembler hashes are in the evidence.
Keep the source mount read-only, disable network, drop capabilities, and allow
writes only to a new temporary workspace and container tmpfs:

```sh
docker run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --pids-limit 128 --memory 2g --cpus 2 \
  --shm-size 256m \
  --mount type=bind,source=<repository>,target=/source,readonly \
  --mount type=bind,source=<new-private-workspace>,target=/work \
  --tmpfs /tmp -w /work -e PYTHONDONTWRITEBYTECODE=1 \
  octamod-tapehead-qualification-tools:local \
  python3 /source/sdk/drafts/analog-bassdrum/qualification/run.py --output /work
```

Use the original pinned 0.1.2 SDK snapshot when running these historical development scripts; the promoted module is already overlaid. The runner verifies input identities before creating the disposable SDK overlay,
compiles the two test hosts, then runs baseline, static/modulation, jump and
multiple-instance gates. Only sanitized `evidence.json` may be retained publicly;
compiled payloads, raw audio/state, firmware, projects and cards remain private.

## Firmware persistence and actual LCD — 8 October 2026

[evidence/persistence.json](evidence/persistence.json) binds the private candidate
image (`87e56b38…`) and emulator to the tested source. The existing disposable
fixture was copied, not edited in place. T1 runs 808 and T5 runs 909, with different
patches and both stock FX slots populated. Part save/reload restores a saved
baseline after unsaved edits. Panel-driven PROJECT SAVE/RELOAD restores both
tracks after later edits. A fresh explicit project load also matches.

A new emulator process retaining only the saved card and 1 MiB battery RAM
restores both tracks without posting LOAD PROJECT, including seven seconds with
frame interrupts. Machine/FX assignments, source/engine/sample settings and
source/FX main/setup controls match throughout. Editing T1 preserves T5 and
editing FX2 preserves FX1. These are **control-state passes**, separate from the
DSP instance/audio tests above. No physical device was rebooted.

The initial DSP-enabled probe exited with SIGBUS (exit −7), before usable
audio or capture readiness. The actual controller LCD captures therefore used
the working stand-in DSP path. A private copy of `scripts/capture-module-ui.py`
removed its forced `--dsp` argument and set a 20-second project-load budget; the
source LCD renderer and actual panel actions were unchanged. Both tool hashes,
exact actions, source/image/emulator identities and visually reviewed PNG hashes
are retained in [media/capture.json](media/capture.json). Those historical captures
remain labelled stand-in DSP. An initial plan left a DISARM popup on two captures;
those were rejected and recaptured after it expired.

## Full-emulator SIGBUS diagnosis and fix — 8 October 2026

[evidence/emulator-shm.json](evidence/emulator-shm.json) records the regression and
recovery on the unchanged candidate image (`87e56b38…`) and unchanged emulator.
Docker's default `/dev/shm` allowance is 64 MiB. The DSP library reserves 52 MiB
of shared-memory backing per core (104 MiB for the pair), including the
invalid-address backing block. Mapping succeeds before storage is touched;
constructing the second DSP core exhausts that pool and raises SIGBUS.

An identical `--dsp --max 1000` probe exits −7 with `--shm-size 64m`; with
`--shm-size 256m` it constructs both cores and stops normally at the intentional
instruction budget (exit 1, BUDGET). The existing isolation settings and 2 GiB
overall memory limit stay in place. No firmware or emulator source change was
needed. The capture tool now checks for at least 128 MiB free in `/dev/shm` on
Linux, reports the `--shm-size 256m` setting and refuses before creating its output
directory. Both the real 64 MiB rejection and 256 MiB acceptance passed.

With 256 MiB, the full candidate boots both DSP cores, passes the RTOS gate and
completes LOAD PROJECT with distinct T1 808 and T5 909 assignments and both FX
slots populated. The initial 64-frame playback probe reaches its frame target
and captures 623,039 eight-channel frames, but all samples are zero: it did not
reach a trigger. That probe establishes crash recovery and project loading,
not usable audio. A separate 1,024-frame probe with `--internal-clock` reached
its 180-second wall-clock cap and was killed; no usable-audio pass is claimed.
The follow-up ran Node 24 `npm run check -- --base origin/main`: all 185 test
files / 1,249 tests and lint/build/SDK/catalog checks passed.

## Open acceptance paths

- Usable full-chain audio after Part/project reload and battery-only restart:
  **owner-reported physical MKII pass**, confirmed below. The emulator audio path
  remains unverified; emulator control-state passes are separate.
- Full machine reset/model-replacement isolation and maximum audio/FX load:
  **untested**. Native voice reset/isolation tests do not replace these checks.
- Worst-case chip cycles and complete final-image memory bounds: **unmeasured**,
  accepted for this exact owner-approved experimental update. Native/browser
  composition and release packaging are checked separately below. The
  owner-attributed MKII operation/reload/reboot/audio report is recorded below.

No physical device was flashed by the agent. The owner tested the private build.
The private candidate image, cards,
raw audio/LCD/memory traces and logs are not published. The owner requested release of this exact tested update. The separate source-bound
owner approval preserves the named incomplete measurements as explicit limits. The existing approved thumbnail is retained;
this update changes modulation behavior without changing the control design.

## Owner functional hardware report and release approval — 8 October 2026

Jannik Aßfalg (`repeat98`) received `OCTATRACK_ANALOG_BD_0.1.3_TEST.bin`,
label `AB013TEST`, built from commit `207964506864dec8a71ca0bc35ca19aca46a6f48`.
Complete update SHA-256:
`48217f8b1bf2b9284fc5831a79b94f020c70f1dafc94f6a72ff6857765a83a5a`.
Decoded MAIN OS SHA-256:
`87e56b38fe45a5b10fda2129193f67946b078f4d84b07a0cb1afbc2ef0ebaa54`.
The file passed native/browser full-update byte parity, checksum and decoded
MAIN identity checks. Firmware remains local.

The owner's exact statement was: **“works great and stable, let's release”**.
This is a credited functional hardware report and release authorization for
`0.1.3-experimental`, not a measured stress or worst-case timing result. The owner then answered **“MK2 yes all”** to the question asking for the model
and whether distinct 808/909 instances, Part/project reload and normal power-off/on
all kept their settings and audible output. This records an MKII physical
functional/persistence pass, separately from the emulator evidence. Duration,
maximum instance/FX load and worst-case chip timing were not reported.

The separate `sdk/analog-bassdrum-build-approval.json` binds the release approval
to this version and final native-source fingerprint. It preserves the existing
owner-approved update path for worst-case chip cycles and complete memory bounds. These exceptions do not grant later versions
a pass; source integrity, native/browser composition, packaging, licences, UI
provenance and documentation remain required.

## Release composition and packaging — 8 October 2026

The promotion was rebased onto approved main `f7ba0d1`, including Mini Verb 0.2.0.
A clean, tracked-source-only build at `fdb94e7ab46cb9240962456594819650ec4bc1fa`
compiled the published 0.1.3 packages without stock firmware. Toolchain image:
`sha256:6711f0abb3c30dcfda4e9a8a812555f8bbceb37a0fc988918b5d624b603d4a6a`.
Source tree SHA-256:
`dabaf66190efa66d07ddd7a5cc4eed7baf7efa4980887e093d733edb3ac4e053`.
Every other generated code package is unchanged from approved main; the requested
package changes only Analog BD's engine data and associated hashes/word counts.

`npm run module:verify -- analog-bassdrum --os <owner-stock> --jobs 1
--image modwerk-source-tools:continuation` passed 112 selections: 36 native/browser
matching builds and 76 matching refusals, zero mismatches. The record is
`sdk/native-comparisons/analog-bassdrum.json`. Changed stock input is refused.
Use one worker for this native builder: its DSP assembly output paths are shared;
a two-worker probe raced those paths and failed the decode preflight.

The native Analog BD suite then refreshed all 136 DSP/utility profiles, with
both stock-FX2 menu choices: 130 builds and six expected refusals. The source-bound
fingerprints are in `src/engine/assets/analog-bd-composition-proofs.json`.
`node scripts/verify-analog-bd-native.mjs <owner-stock> <proofs>` passed all 130
module-owned MAIN comparisons and independent GNU bootloader byte comparisons,
six matching refusals and five complete browser firmware round trips. Stock input
is unchanged and no platform/logger writes overlap module-owned writes.

Four full native update packages match browser ELEK/ELUP encoding byte-for-byte:
Analog BD alone and Analog BD + Tape Echo + all five utilities, each with stock
FX2 kept and compact. Every decoded MAIN, container tail and checksum passes.
Compression is sampled here; the 136-case matrix checks composition/bootloader
bytes for every accepted profile. Firmware and native packing inputs stay private.

The standalone native MAIN is
`e5639f9f47feaaaf74d202c411409d42a021017d0067e3c5aa4f2493798fd8d3`.
Only 50 bytes differ from the owner's test MAIN: the shared builder clones the
identical stock FX1 chooser table at `0x400d6b20` and changes its three references
at `0x40037990`, `0x40052706` and `0x40059bd2`. Restoring those four chooser writes
reproduces the owner's entire MAIN hash exactly, including the appended payloads.
The test image retains the original stock FX1 references; both menus are identical.
The public worker also adds its already-approved logger/startup infrastructure.
The standalone public-worker composition, label `ELEKLOADER`, round-trips to MAIN
`80dfdd8f938daaf86f87e1332cec93a735a9c3ba00997ce70a20b9886b2fdeac`;
full update is 575,496 bytes, SHA-256
`c871fc7424404985ca2c4c1a2ee3be1fa5c68e47494c6abf66ef4e3d479dca33`.
These are software checks; the credited physical report remains bound to the
actual `AB013TEST` image and is not relabelled as a physical test of every composition.
