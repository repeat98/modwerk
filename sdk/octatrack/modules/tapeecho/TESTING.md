# Tape Echo testing

Version: 0.1.9-experimental · author: [Jannik Aßfalg](https://github.com/repeat98)

0.1.9 ran on a unit on 23 November 2026 (the overload scene and its instance curve, below); the earlier evidence is retained. No DSP qualification is claimed.

## 0.1.9-experimental: bounded by the frame's deadline, dry while rested (prepared 22 November 2026, not tested on a unit)

**Why.** Tape Echo's work runs at IPL 5 inside stock's delay routine, where the base's guard cannot drop it: two Tape Echos
took a busy Part to 134-140 % of a frame and the frame interrupt into the DSP's late window (owner's MKII, 22 November 2026).
Base 0.8 raises `ev_frame_deadline(deadline, rest)` at every frame-interrupt entry; 0.1.9 subscribes (`runtime.json`, order 50)
and requires that two-argument event.

**Deadline hold.** Before each Tape Echo track's block, `te_cpu_hook` holds the block when `(int32_t)(DTCN3 - deadline +
5280) >= 0` (wrap-safe on the free-running 32-bit counter while the count is within 2^31 of the deadline). 5,280 counts (40 µs)
is an **estimate** of one block, not a bound: the first instance raised the longest frame by 9.4 % (34 µs) in
`evidence/frame-cost.json`, and the emulator's worst block (2,926 instructions against 1,800 on the default page) scales that to
about 55 µs, within the 20 µs margin the base leaves. A held block (deadline or 0.1.8's overload hold) gives the audio the dry gain of te_tape_block's MIX law
(`te_dry`: unity up to MIX 64, `((full - mix) >> 14) * 33028` above, from `s->mix`) and writes the scratch buffer stock commits
to the ring through te_tape_block's record path without feedback and hiss: the drive sum, the `[1,6,1]/8` FIR on `s->fir` and
the tape curve. Of the three choices this leaves the least in the later echo: zeros play back as a 0.36 ms gap, an unwritten
block as 16 samples of tape from 4 s before, and the input scaled linearly (230 instructions a hold) differed from the full
path's record by 0.044 FS at a 0.24 FS record peak, the curve's compression; with FIR and curve (524 instructions at MIX 64 or
below, 722 above, seam to exit, against 1,907 for a full block) it differs by under 0.0001 FS (hiss), and only the feedback's
repeat is missing. The 0.1.8 draft's accumulator clear is gone: stock leaves every accumulator empty at the seam, and the hold
clears what it uses.

**Rest.** While `rest` is nonzero, every Tape Echo track toggles the scratch buffers and steps the filter iterator as before,
clears its state's active word and returns to `0x400037e0`, past stock's ring write (the base's quiet-track path returns there
too): the audio gets the dry gain of the MIX knob, with no echo, no stock filter or mix (whose feedback would play the ring as a tail)
and no ring write. The first frame with `rest` 0 runs `te_block` from an inactive state: every state word cleared, `valid` 0,
so no tape from before the rest is read and the echo builds from the new input.

| Case | Why this change makes it a risk | How run | Result |
| --- | --- | --- | --- |
| Rest, wake and deadline in the emulator | the new exit must leave the frame as stock expects and the wake must start clean | the 0.1.8 scratch ColdFire probe (stock 1.40C image, detours in place, module at `0x47300000`) with three local cases added: 10 rested frames, deadlines 1, 8,192 and `0xfffff000` with DTIM3 at 0 | rested: all 8 tracks' audio equal to the input, the scratch buffer and ring untouched, sp, toggle and iterator as stock's, active cleared; the wake and every later block bit-exact with native arithmetic from a fresh state; deadlines 1 and `0xfffff000` held all 8, 8,192 none; held blocks' audio and tape equal to a reference of the dry gain and the record path; level continuity at MIX 32, 64, 96 and 127 (track 1 alone, no tape history yet, a hold and ten rested frames among 200): every block within 1 LSB of the full path's dry, the held tape under 0.0001 FS from the full block's; every 0.1.8 case passed again (peak 2,930 instructions a track block) |
| Software build | the new exit and arguments must assemble and link | `generate_cpu.py --check`, `npm run module:dev -- tapeecho --build-only`, `npm run coldfire:isa` | built; inside the MCF54455 set |
| Rest on a busy pattern | the output must be dry with no tail | the base's PATTERN IS BUSY scene, by ear and USB recording | not run: the overload scene below ran with the predicted brake firing, but nobody listened or recorded the output; the owner listens after release |
| Wake after rest | no stale echo; a dry level step at MIX above 64 is expected | pattern change back to a light one | not run: the takes stopped on the stacked pattern; by ear stays with the owner |
| Deadline holds | holds must keep the frame entry out of the late window; each is 0.36 ms without echo | the base's late counters, two Tape Echos (T1, T8) on the stacked pattern below | pass on the counters: latest entry 109-118 µs late against 144-146 µs with 0.1.6, 16 late entries held against 17-20; `te_guard` not read, holds not heard |
| Overload scene | the reason for 0.1.9: two Tape Echos took a busy Part into the DSP's late window | the scene below, three 15 s takes against two of 0.1.6 | pass: longest frame 129.1-131.2 % against 138.8-139.3 %, no stall or crash |
| 0.1.6 to 0.1.9 on a saved project | a saved Tape Echo slot must come back with its controls | sync 0.1.9 over 0.1.6, load a project saved with 0.1.6 | not run: the unit was held for the price runs; the controls and their layout are unchanged since 0.1.6 |
| An older base | 0.1.9 needs the two-argument ev_frame_deadline (event 62) | site preflight (`requiresCapabilities` 6144) and the base's hook-count refusal | not run on a unit: no 0.7.13 base was flashed; the package row asks for loader capabilities 2048 and 4096, which no published base before 0.8 reports |

The rest case's exit is checked up to `0x400037e0`, not through stock's following tracks with modelled DMA. The repository's
probe (`tools/harness/tapeecho_cpu_probe.cpp`) has not taken 0.1.8's state layout yet (it still writes `filters`), so
`verify_tapeecho_cpu.py` does not build against 0.1.8 or 0.1.9; the runs above used the local scratch probe.

### On a unit (23 November 2026, owner's MKII, development twin `856cbbcf` of base 0.8, `base/octatrack-next` 9ac83b232)

Both runs used the plain test package `9219d9e5` (`npm run module:dev -- tapeecho --build-only`). The release package
(`octatrack:module-packages`, sha256 `29aa9aca…`) differs from it only in its nine stock-copy records: 130 bytes of the image ship
as zeros that the base fills from the unit's own OS, each checked by SHA-256; filled, its image, relocations, sites, hook words
and DSP words equal the plain package's. The release package itself has not run on a unit.

**Overload scene, 10:15-10:18.** Tape Echo on T1 and T8 FX2, Euclid 0.1.5 T2 FX1, Mini Verb 0.2.3 T3 FX2, Air Chorus 0.1.3 T4 FX2,
E-Verb 0.1.2 T5 FX2, Vibrato 0.1.0 T6 FX1, FM Synth 0.1.5 on T8; picks made stopped on the empty pattern C02, Part 1, then the
stacked pattern C01 (all eight tracks trig on steps 1/5/9/13) played 15 s a take. The base's predicted brake fired (a `brake`
incident with bit 23); both trials rolled back.

| | Tape Echo 0.1.6 (control, 2 takes) | Tape Echo 0.1.9 (3 takes) |
| --- | --- | --- |
| longest frame | 138.8-139.3 % | 129.1-131.2 % |
| frame-interrupt share | 69.0 % | 55.6 % |
| latest frame entry | 144-146 µs late | 109-118 µs late |
| late entries held (each a skipped DSP frame) | 17-20 | 16 |
| renders the guard replaced | 2,277-2,542 | 2,661-2,896 |
| stalls / crashes | 0 | 0 |

**Instance curve, 10:26** (`npm run device:price -- --curve T1,T3,T6,T7 --pick-pattern 2 --measure-pattern 4 --limit 115
--seconds 8`; `evidence/frame-cost.json`):

| | first | each | longest frame +1/+2/+3/+4 | at rest frame / meter | in use (one slot, T1) frame / meter |
| --- | --- | --- | --- | --- | --- |
| 0.1.9, plain package 9219d9e5 | 11.5 | 4.1 | +9.6 / +15.6 / +19.7 / +21.8 | +0.6 / +1.5 | +3.7 / +9.7 |
| 0.1.6 (921e7a60), same run | 9.1 | 5.0 | +7.6 / +14.1 / +19.1 / +23.1 | +0.2 / +0.1 | +3.5 / +5.2 |

In ordinary use 0.1.9 measured **dearer** than 0.1.6 for one to three instances and cheaper at four; each point is a single 8 s
longest-frame reading, and twin 28 on 22 November had 0.1.9 at 10.7/4.2 against 0.1.6's 13.6/4.0, so the readings scatter by a few
points. On one slot in use the CPU meter rose 9.7 points against 5.2 for 0.1.6. 0.1.9's gain is under overload, above: the
frame-interrupt share fell from 69.0 % to 55.6 % and the latest entry from about 145 to 110 µs late. It is not cheaper in
normal use.

**Not run:** listening (hold, rest and wake by ear), Keep and a power cycle, `npm run test:procedure`, the six- and
seven-instance limit.

## 0.1.8-experimental: cheaper on the ColdFire, bounded under overload (prepared 22 November 2026, not tested on a unit)

**Why.** On the owner's MKII (development twin of base 0.7.14, `b36f9c53e`, 21 November 2026) one Tape Echo on T1 FX2 beside a big
installed set added 11.4 points of frame share (50.7 → 62.1 %, longest frame 134 %), the frame guard skipped 165 renders in about
11 s, and about 3 s into the next PLAY the audio froze and the unit left USB (no crash or stall record; a power-off is possible).
At rest it costs 0.4 points, so the in-use path is the expensive one. Its work runs inside stock's delay routine, which the eDMA
interrupt calls once a frame at IPL 5 (`0x40004b0e`); the frame guard cannot shed it.

**Same sound.** The audio is bit-identical to 0.1.7: no arithmetic changed, only what is computed again and where.

- **Other effects' tracks decline in assembly.** The seam hook runs on all eight tracks every frame while Tape Echo is awake.
  A track whose FX2 is not Tape Echo now goes back to stock in 14 instructions (was about 37, through the C entry), and its
  state is cleared only once, tracked by a live mask, instead of a store to its state on every frame.
- **Steady blocks skip the control half.** While the six knob words and the tempo word are the last steady block's and no ramp,
  glide or fade is running, every control computation (targets, gains, the five ramp steps, the motor, the BEAT fade logic)
  would repeat itself; `te_block` then runs only the clocks, the head and the audio. Any change takes the full path again,
  and a ramp leaves it only once it is exactly settled.
- **The per-track entry is assembly** (`te_cpu_hook`; GCC spilled most of the C version's values to the stack), the scratch
  toggle is the constant stock's delay reset writes (no data read of stock code each frame), and the settled wet and MIX loops
  fold the next sample's dry load into a multiply-with-load.

**Bounded under overload.** Per instance and block: at most 2,926 executed instructions (all controls reversing, BEAT, full
history), at most 64 uncached ring words (both heads of a BEAT crossfade on the per-sample path; 17 for an ordinary block),
fixed loop counts, three divides at most, no wait and no poll. Its only uncached accesses are those ring reads. A long delay
routine delays the rest of stock's eDMA chain, and the chain's end is what unmasks the frame interrupt (`0x40004bc2`), so
lateness carries into the next frame. The new **overload hold**: each delay-routine call's first Tape Echo block reads stock's
free-running DTIM3 count (`0xfc07c00c`, 132 MHz, set up by stock at `0x400209c2`); a call that begins more than a quarter frame
later than one frame after the last (more than 59,863 counts, less than two frames) holds every instance for that block: the
dry signal passes untouched, the block's tape is silence, no head, filter or clock runs (about 60 instructions and 32 stores).
A count that stands still or jumps by two frames or more never holds. It needs nothing from the base. The counters sit in
`te_guard` (`holds`: blocks held; `late`: the longest gap seen under two frames, in counts), 24 bytes before `te_states`.

**Run (22 November 2026, this checkout, no hardware).** m68k-elf-gcc 16.2.0, `cpu.s` regenerated by `generate_cpu.py` (the
header now records the compiler). The ColdFire probe (`tools/harness/tapeecho_cpu_probe.cpp`, the repository's emulator at
`sdk/octabam/tools/emu/ot_emu` built against upstream octabam's vendored cores) ran against the author's stock 1.40C image with
the two detours written in place, the module linked at `0x47300000`, its TIME formatter test skipped (it needs octabam's full
remix build).

| Gate | Result |
| --- | --- |
| Native signal and voice gates (`verify_tapeecho_cpu.py`'s host half) | 39 of 39 passed, every value as 0.1.7 |
| 0.1.8's `te_process` and steady path against 0.1.7's `te_process`, random piecewise-constant controls (out-of-range knobs, invalid tempos, SYNC above 1, dirty re-entry) | 40,000,000 blocks over two seeds, 10.6 M through the steady path: every state word, audio and record word equal |
| Probe: steady path against the full path (new) | 1,000,000 blocks, 290,468 steady: equal |
| Probe: kernels against their native oracles | filter 1,024, tape 1,024 (all modes), reader 2,048 blocks: equal; ceilings unchanged |
| Probe: eight instances against native arithmetic | 3,504 blocks (now with a 1,200-frame phase of standing controls: 4,385 of 9,600 blocks took the ColdFire's steady path): equal |
| Probe: overload hold (new) | a call 1.5 frames after the last holds all eight instances for one block (dry untouched, silence recorded, `holds` 8, `late` 71,836); the blocks before and after stay bit-exact |
| Probe: stock DELAY fallback, complete frame with modelled DMA | registers preserved, history invalidated; stock DELAY tracks bit-identical to stock |
| `npm run coldfire:isa` | inside the MCF54455 set |

Executed instructions per complete eight-track 16-sample delay routine, the probe's benchmark (1,500 warm-up and 1,000 measured
blocks, modelled DMA). Instructions, **not** cycles or CPU percent. "Tape Echo's own" is the routine minus the stock part (6,869
for one instance):

| Case | 0.1.7 | 0.1.8 | Change |
| --- | ---: | ---: | ---: |
| One instance, default page (TIME 64, WOW 25, MIX 40), stock ×7 | 8,944 | 8,669 | Tape Echo's own 2,075 → 1,800 (−13 %), 130 → 113 a sample |
| One instance, WOW 44, full wet, stock ×7 | 8,821 | 8,546 | own 1,952 → 1,677 (−14 %) |
| Awake on no track (a saved Part names it), stock ×8 | 7,900 | 7,724 | its overhead 272 → 96 |
| Three instances settled, WOW 44, stock ×5 | 10,668 | 10,194 | −4.4 % |
| Eight instances settled, WOW 44 | 15,283 | 14,315 | −6.3 % |
| Eight instances, moving FREE TIME | 15,539 | 15,580 | +0.3 % |
| Eight instances, all controls reversing in BEAT (peak, stress run) | 22,571 | 22,586 | +0.1 % |

While a knob moves every block takes the full path, which now carries the steady bookkeeping and the hold's clock read; those
peaks are within 1 % of 0.1.7's. Per frame for one instance on the default page the executed code fell from 173 to 147
sixteen-byte lines and the state and table data it touches from about 30 to 23 lines; the 17 uncached ring words are unchanged.
On a unit with a big installed set these lines are likely cold each frame, which is why they are counted: cold line fills are
the probable reason one instance cost 11.4 points there against 1.7 on base 0.7.11 with only Tape Echo installed (#1869). That
is an inference, not a measurement.

| Case | Why this change makes it a risk | How run | Result |
| --- | --- | --- | --- |
| Frame share, one instance, big set playing | the reason for the release | `guard` over 8 s, set G of the 0.7.14 run, T1 FX2, against 0.1.7 | not run (unit held by the owner) |
| Holds in normal use | a false hold is a 0.36 ms dropout of the echo | `te_guard` `holds`/`late` after minutes of playing, small set and big set | not run |
| Overload | the hold must keep the unit alive where 0.1.7 froze | the 0.7.14 freeze scene, then three and six instances | not run |
| Knob turns, BEAT switches, Part and pattern changes | steady blocks must end exactly when a control moves | by ear and USB recording against 0.1.7 | emulator bit-exact only; unit not run |
| Pick, rest and wake (0.1.7) | the live mask must clear a track's state when it leaves | T1 to DELAY and back | probe: decline clears the state; unit not run |


## 0.1.7-experimental: rests while no slot uses it (prepared 20 November 2026, not built, not tested)

No code change. A `runtime.json` holding only `"rests"` marks its ColdFire detours `te_cpu_reset` (0x40002f44) and `te_cpu_hook` (0x4000361a, the stock delay routine's seam, every track and frame). On a base that judges
effect modules (#1849, base 0.7.11, loader capability 2048) the base rests the module while no slot of the project,
working or saved, names its effect id and no live slot runs it: those detours hold stock's bytes. Its DSP code is
resident on demand as before.

- **Why:** 0.4 points of the frame interrupt at rest in its `evidence/cpu-price.json` (`npm run device:price`, playing; MKII, development twin `d3d71297` of base 0.7.8, the Tresor Prep scene, 18 November 2026). The owner's goal (20 November 2026): an installed module nobody uses costs nothing.
- **Note:** while it rests the stock delay routine runs unpatched, so the base's quiet-delay skip counts as without Tape Echo; a pick wakes it before stock writes the pick, so its first frame on the slot has its seam.
- **Not built yet:** the builder change that takes a rests-only `runtime.json` for an effect is in #1849; the package
  row then needs `requiresCapabilities: 2048`, and the standalone recipe re-pins after #1862.
- **Test procedure:** not run (no build; the unit was off USB, then held by another session, on 20 November 2026).

| Case | Why this change makes it a risk | How run | Result |
| --- | --- | --- | --- |
| Installed, no slot names it | the detours must hold stock's bytes and cost nothing | `device:price` at rest, same scene as before | not run: not built, unit unavailable |
| Picked while playing | the wake writes its sites masked before stock writes the pick | frame guard over the pick window, a stock effect pick as control | not run |
| A Part, pattern or bank change bringing it in | must not need a wake | any slot of the project keeps it awake (base host test) | pass (host, #1849); unit not run |
| A paste or a project load putting it on a live slot | it runs unpatched until the next tick | the live slot wakes it within a tick (base host test) | pass (host); unit not run |
| Both slots and two instances | the effect id is one for every slot | picks on T1 and T5 | not run |
| Undo of the trial that brought this version | resting sites restored while resting | whole-set trial and Undo | not run |

## Source evidence

Evidence source: repeat98/octamad commit `b8deefc88b2c3e5f3c6158e364eb741df1924e1d`. Read [the original record](README.md).

The pinned hardware record reports six instances running and a seventh freezing the unit; that limit remains open. Recorded gates cover native arithmetic parity, dirty state, eight-instance stress, moving controls and repeat/feedback behavior. Hardware timing and worst-case CPU headroom remain unqualified.

## Commands and results

Declared native gates:

`tools/verify/verify_tapeecho_cpu.py`

This SDK import did not rerun these gates. CPU-heavy checks remain paused. Historical results are source records, not new qualification of the SDK or a combined configuration. Record exact commands, tested source commit, workload, modes, track count, duration and results here whenever the module changes.

## Hardware and limitations

Hardware status: historical. Eight instances with all controls reversing in BEAT mode. FREE peaked at 18,063. These emulator instruction counts are not hardware cycles or CPU percentages.

Do not claim a passed hardware test without a model, image version, conditions and actual result. Packaging parity is separate from audio quality and hardware safety.

## OT UI captures — 1 October 2026

Module version: 0.1.2-experimental. Actual firmware-rendered LCD pixels captured
through the headless `ot_emu` interactive panel and `lcd_view.py`;
128×64 LCD, integer scale 6, MKII panel, transport stopped. Empty
scratch FAT16 card; no samples, personal projects or hardware connection.

The image was compiled from a temporary copy of the original seven module
sources and their required internal loader; pending imports were excluded.
Build environment: `REMIX=ui-capture XBUS=1 SPEC=1 DEV=0 BUILD=79
OCTABAM_STATIC_STOCK=0 OCTABAM_NO_CACHE=1`; native `build_bus.main()`
uses the catalog's seven-module profile (`MINIVERB`, `TAPE ECHO`, `EUCLID`
on FX2; the three station modules and Euclid added to FX1). No native
qualification, stress, audio-render or firmware parity gates were run.

Local MAIN OS build SHA-256: `5162680d8bc342deb623cef00307f2a343f539a90f0bfcef59b59ceb4c60bb83`.
Emulator binary SHA-256: `93484e4b71c70f48f795825103146a36ef95ef9ac06ee627e28608ae3e3bb3eb`.

Panel sequence and PNG hashes are recorded in [media/capture.json](media/capture.json).
Capture command: `ot_emu --image <local-image> --card <empty-scratch-card>
--dsp --frame --ms 3000 --interactive --lcd <temporary-plane> --main-level off
--rtc host --mkii`; input uses panel key rows and encoder detents. Export:
`lcd_view.png(lcd_view.screen(lcd_view.read_plane(<temporary-plane>)), <png>, 6)`.
The maintained equivalent is `scripts/capture-module-ui.py`; see
[the capture workflow](../../../../docs/MODULE_UI_CAPTURES.md).

Only screenshots, hashes and documentation are retained. This evidence
does not alter the existing hardware status or qualify a firmware release.

Publication metadata was synchronized with current main without changing native code.
The capture record preserves the original draft version and records the source-file
comparison binding these exact pixels to this documentation/media-only update.

## 0.1.6 MIX law (27 October 2026)

Issue [#969](https://github.com/repeat98/modwerk/issues/969): turning Tape Echo on dropped the track's level, because MIX was a straight crossfade (dry at (127 − MIX)/127, −10.7 dB at the old default 90). MIX now follows BBD's law with Tape Echo's full-wet level as unity: wet gain `min(MIX, 64)/64`, dry gain 1 up to MIX 64 and `(127 − MIX)/63` above it; the default MIX is 40. The change is the output stage of `te_tape_block` in `cpu_kernels.s` (`TE_TAPE_GAINS`, `TE_TAPE_RAMP_MIX`) and its native oracle `tape_block`/`mix_gains` in `cpu.c`; `te_process` and the compiled C are unchanged, so `cpu.s` was updated by replacing only its kernel section. Assembled for the 54454 and the 5475 the text is identical; against 0.1.5 every byte before `te_tape_block` is identical except the PC-relative tail call into the moved `te_read_linear`.

**Run.** `tools/verify/verify_tapeecho_cpu.py tapeecho` (m68k-elf-gcc/binutils of the reviewed 16.2.0 toolchain), on a private copy of this repository's `sdk/octabam` with upstream octabam's `vendor/` (`dcf93d37`), upstream's one-module `tapeecho` test remix and the author's own 1.40C MAIN OS, image built by `make bus REMIX=tapeecho`. The same run on the unmodified 0.1.5 sources is the left column below.

**Result: all gates passed.** Native signal gates; the voice gate with nine new MIX checks (dry within 0.001 dB of the input from MIX 1 to 64, −6.16 dB at MIX 96, none at full wet; echo at its full-wet level from MIX 64 up, −6.02 dB at 32, −4.08 dB at the default 40; MIX sweeps, endpoint jumps and reversals every 1, 16 and 64 blocks through the knee leave a peak sine-recurrence residual of 0.00075 FS against 0.00007 settled, the click limit being 0.006); the fused tape kernel against the native oracle bit for bit (1,024 blocks: 257 dry, 257 full wet, 254 mixed, 256 ramping, among them MIX ramps that cross the MIX 64 knee inside a block in both directions; 45 curve-limit records, 7,214 clipped outputs); eight instances bit for bit over 2,300 blocks; exact 32-bit dry at MIX 0; the complete stock delay routine with modelled DMA and stock DELAY tracks bit-identical to stock. The tape kernel's per-block ceiling rose from 1,000 to 1,100 instructions (1,074 now, only in the knob-ramp path).

| Executed instructions, 8 instances, full 16-sample routine | 0.1.5 | 0.1.6 |
| --- | ---: | ---: |
| Settled MIX=90, full history, peak | 16,248 | 16,312 |
| Moving FREE TIME, MIX=90, mean | 16,459 | 16,523 |
| MIX / FDBK / AGE endpoint reversals, peak | 17,624 / 17,600 / 17,776 | 18,648 / 18,624 / 18,800 |
| All controls reversing, FREE, peak | 18,063 | 19,087 |
| All controls reversing, BEAT, peak | 21,547 | 22,571 |

A settled block forms the two gains once, 8 instructions per instance; a block whose MIX, FDBK or AGE is ramping forms them for every sample (8 instructions each, 128 per block), so those peaks are 1,024 instructions (5 to 6%) higher while a knob moves. These are executed instructions, not hardware cycles, and the freeze at seven instances is not shown to be related or unrelated.

**Level.** Host oracle, FREE, TIME 64, AGE 64, WOW 0, Gaussian noise at −20 dBFS RMS, steady output relative to its input (dB), 0.1.5 / 0.1.6:

| MIX | FDBK 0 | FDBK 64 |
| ---: | ---: | ---: |
| 0 | 0.0 / 0.0 | 0.0 / 0.0 |
| 20 | −1.5 / 0.0 | −1.5 / 0.0 |
| 40 | −3.2 / +0.1 | −3.2 / +0.1 |
| 64 | −5.9 / +0.2 | −5.9 / +0.2 |
| 90 | −9.7 / −4.1 | −9.5 / −4.0 |
| 111 | −13.1 / −9.6 | −12.5 / −9.3 |
| 127 | −13.6 / −13.6 | −12.8 / −12.8 |

At the new default the track keeps its level (+0.1 dB with the echo added); at the old default MIX 90 it is 5.6 dB louder than in 0.1.5. Above MIX 64 the level falls toward the echo-only level, as it always did at 127. The echo level, the feedback law and the self-oscillation headroom are unchanged.

**On a unit (27 October 2026).** Octatrack MKII on Modwerk base `a0cf1a04`, the 0.1.6 USB package (`921e7a60…`) installed with BBD 0.1.1 over USB (trial, then Keep), driven and recorded over USB (`scripts/device.mjs`, the unit's 20-channel USB audio). Tape Echo was picked fresh on T4's FX2 (FX1 NONE) of a project whose only sounding track is T4, a FLEX stab pattern at 119 BPM; TIME, FDBK, WOW, AGE and SYNC stayed at their defaults. Each MIX value was set by encoder F and read back on screen. Measured on T4's USB channels, 12 s takes after 5 s of settling:

- The default MIX read on screen is 40.
- Dry level, fitted against the MIX 0 take: 0.986 at MIX 40, 0.993 at 64, 0.589 at 90 (law: 1, 1, 0.587). Echo level against the MIX 127 take, from the energy left after the dry part: 0.74 at MIX 40 (law 0.625; this estimate reads high by the dry fit's residual), 1.03 at 64, 1.00 at 90 (law 1, 1).
- Whole-track level against MIX 0: +0.4 dB at MIX 40, +0.9 dB at 64, −2.5 dB at 90, −6.6 dB at 127. MIX 0 against FX2 NONE: +0.02 dB. The pattern does not repeat sample-exactly (its loop is 88,941 or 88,942 samples), so MIX 0 against NONE was compared by level, not bit for bit.
- Clicks: a take with MIX swept in steps of 8 up and down and jumped 0↔127 and 0↔64 four times while playing has its largest second-difference burst at 0.056, inside the steady takes' 0.054–0.061 (the stabs' own attacks). No click beyond the material was found.

**Not tested for this version: any further hardware (a seventh instance, UI responsiveness while editing, listening by ear, BEAT mode, other FDBK/AGE/WOW settings), chip cycles, `npm run fx:audit` (aliasing, DC, clipping, idle), Part/project save and reload, reboot persistence, multiple-instance isolation beyond the eight-instance emulator gate. Emulator figures, the host oracle and the software comparisons above do not establish any of them. The UI captures above show the same panel for 0.1.6 and are retained from 0.1.2.
