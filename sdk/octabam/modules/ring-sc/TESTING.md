# Sidechain Ringmod testing

## 0.2.0-experimental: RING's SLEW, S&H and RECT (21 October 2026)

Source: branch `claude/ringmod-sc-0.2` on main `4d4f731d` (the key bus integrated, #750 and #737; the USB-only rule,
#774). Local, on a Mac with the octabam toolchain and the tester's own OS 1.40C. **Hardware: this source's package on an
MKII on 22 October 2026 (below and `evidence/hardware.md`), and the build before RECT on 21 October.** What changed
from 0.1.0 (below): in RING the key passes three stages before it multiplies the audio,
on the knobs DUCK uses for ATK, HOLD and REL, renamed in RING by MODE (a NameSelect, so MODE keeps its own name: SLEW, S&H, RECT):
- S&H (HOLD): a new key every 16v samples, held between; at 0 the same reload takes every key. The countdown is
  clamped to the period every call, so turning S&H down cuts the current hold short.
- SLEW (ATK): the key's level, |key| smoothed by 1 - q(v) on ATK's scale, kept every sample and crossfaded in by a
  weight w ramped over 16 samples (to 1 above 0, to 0 at 0), so SLEW crossing 0 (a turn, a lock, an LFO) does not
  step from the key to its level. At 0 the level keeps its last coefficient while w fades it out, so it does not jump
  to |key| either; at w = 0 it is not heard.
- RECT (REL): key + r (|key| - key), r = v/128 · 129/128, ramped over 16 samples like the depth; it replaces the
  first build's BIAS (key (1 - h) + h), a dry/wet crossfade the depth already gives. Kept as u = 2r - 1 (-1 at RECT 0,
  set by init): a key below 0 becomes -key · u, one at or above 0 stays, so RECT 0 is the key exactly. Applied before
  SLEW.
The RING loop stays straight-line (`cycle_count.py` needs it): its state is DUCK's words, cleared on a MODE change,
plus $11 (S&H's countdown), $13 (u's step) and $14/$15 (SLEW's weight and its step). 270 → 351 DSP words; 19 → 22
words of state. RECT as one multiply and a conditional transfer, and each ramp's step folded into its load
(`add x0,a a,y0`), keep the RING loop at DUCK's count with the crossfade in it.

**Review fixes** (21 October 2026, an independent review of the build before; the render gate's 10d and 10e fail that
build and pass this one):
- SLEW crossing 0 switched the carrier from the signed key to its level in one sample (up to -0.999 → +0.999 of gain):
  a click on turning it through 0, a lock on ATK in RING, and every cycle of an LFO crossing 0. Now the 16-sample
  crossfade above.
- S&H turned from 127 to 0 held the old key until its countdown ran out (up to 2,032 samples, 46 ms). Now the
  countdown is clamped to the new period every call.
- The model in `verify.py` now runs the key's low-pass, RECT and SLEW's level in exact integers, as the accumulator
  holds them (the level now keeps the fractional bits of |key| in its sum, so a float key drifted from it at ATK
  127); it matches the DSP within 1.78e-07 of full scale (3.14e-05 before), and the model gates (3, 6, 7, 8, 10d,
  10e) now hold it to 4e-07, about 3 LSB (5e-05 before).

**Against 0.1.0, sample for sample** (rerun on the review-fix source; `compare02.py`, kept privately; dsp_host, 0.1.0 = `c732b232`'s `ringsc.asm`,
source `c2f2ec3f`, both on the same synthetic key bus):

| Claim | Renders | Result |
| --- | --- | --- |
| DUCK: verify.py's settings grid (ATK 0/50/127 x REL 0/45/100/127 x KLPF 127/90/30/0 x DPTH 127/70 x HOLD 34/0/127) under a 55 Hz, a decaying 55 Hz and a noise key | 864 | identical |
| DUCK: the other core's window, the module on T2 (T1 local, T7 across), trig splits 1/5/11/15, a key dispatched after, a dirty state block, KEY T5 → OFF → T3 mid-render | 11 | identical |
| DUCK: each continuous knob swept one step every two blocks under a tone | 5 | identical |
| RING with S&H, RECT and SLEW at 0: KLPF 127/90/30/0 x DPTH 127/70/1, three keys | 36 | identical |
| RING at 0: the same paths, splits, key after, dirty state, KEY changes | 11 | identical |
| RING at 0: DPTH and KLPF sweeps | 2 | identical |
| MODE DUCK → RING, RING → DUCK and DUCK → RING → DUCK mid-render, S&H/RECT/SLEW at 0 | 3 | identical |

**Render gate.** `python3 verify.py`: every gate passes; 351 words, no mpysu.

| Gate | Result |
| --- | --- |
| No live key bus (four cases), KEY OFF, KEY 100, DPTH 0 in both modes (S&H 34, RECT 45), silent key in DUCK | bit for bit |
| DUCK and RING against the model, 576 settings (RING now over HOLD 0/34/127 too: S&H, RECT and SLEW) | worst 1.78e-07 of full scale (limit 4e-07, about 3 LSB; 5e-05 before the model was exact) |
| Other core, the module on T2, split blocks, key dispatched after, `-guard -dirty 0x5a`, MODE/KEY changes mid-render | pass, both modes |
| 10a S&H 8 under a full-scale 55 Hz key on a steady input | every key held exactly 128 samples |
| 10b SLEW 60 | gain 0.581..0.661, never below 0 (SLEW 0 reaches -1.000) |
| 10c RECT 127 | gain 0.000..1.000, mean 0.639 (2/π = 0.637); RECT 0 reaches -1.000 |
| 10d SLEW 0 → 30 → 0 under the full-scale key, once and every eight blocks, against the model | largest output step 0.050 and 0.106 of the input (limit 0.25; steady 0.008); the build before: 0.762 and 1.798 |
| 10e S&H 127 → 0 mid-render | equal to S&H 0's output from the change on (asserted from the change's first sample); the build before held 1,727 samples past it |
| Each continuous knob (now with SLEW and RECT in RING) swept under a tone | loudest -91 dBFS at the block rate (limit -70) |

**Stress.** `python3 tools/stress.py 30`: eight instances and the fixture for 30 s, `-guard -dirty 0x5a`, 27,561 knob
moves: 8 of 8 clean, 0 samples on the limit, core meter 9,875 instructions a block at most.

**Cycle count.** `tools/build/cycle_count.py`: 63 cycles/sample in both mode loops (DUCK 63 as before, RING 32 → 63),
so the declared worst case does not rise.

**Performance record** (`perf.py`, on a private native image `a3c9b043…`, the key bus's seed marks written into both
dumps; the RING case now with S&H on at its shortest period): worst 80.56 executed instructions/sample (DUCK, trig split
at frame 1; 67.69 unsplit; unchanged), RING with S&H, RECT and SLEW on 79.19 with splits / 67.00 unsplit (0.1.0: 38.06 / 30.94); COMPRESSOR 72.06,
SPRING REV 314.19. `perf.py stress --both`: sixteen instances (eight a core, FX1 and FX2), 32 s with three LFOs, 14
random slots a step (MODE and RING's knobs included), six trig splits, `-guard -guard-shared -dirty 0x5a`: host exit 0,
0 stray regions, 0 clobbers, per-core peak 638.1 / 636.8.

**The USB package** (`public/octatrack-modules/ring-sc/0.2.0-experimental.mwrm`, 2,416 bytes, sha256 `2ba32a49…`,
built with main's `module_packages.py` on main `4d4f731d` from the source-built assets of `29fb0952` (the isolated
toolchain build; `60d3ac17` changes only `verify.py`'s tolerances, so the DSP, the package and the performance record
carry over). Earlier builds of this version: `72a1af2d…` (2,316 bytes, before MODE kept its name; first installed
on the MKII), `64dc83b9…` (2,300 bytes, with BIAS; the 21 Oct MKII session) and `8fd097af…` (2,304 bytes, RECT before
the review fixes)): ABI 9, requires the key bus, the same four read claims, state 22, cycles 81
executed; no run shared with the stock OS under either scan (0; fails at 12). Not base-bound: it installs on main's
base and its development twins.

**Screens.** `scripts/capture-module-ui.py` with `ot_emu` `23ba6f6c…` on a private card image of this version (remix
`x_rmsc02`: RINGMOD SC alone on the FX1 chooser, RINGSC20 `491f0ff0…`, the review-fix source; every screen is
pixel-identical to the capture on the build before, `e2fbb143…`), the plan in `media/capture.json` (KEY turned one
detent). The RING page names SLEW, S&H and RECT; the DUCK page is unchanged; MODE on SETUP keeps its name and shows
DUCK or RING below it once turned (a NameSelect: 0.1.0's MODE, as the mode_slot, wrote the word into its own name). A card image has no key bus, so these show
the pages, not the effect.

**Native comparison.** `npm run module:verify -- ring-sc` on the tester's 1.40C, on main `daffbbab` (Apply Scene and
LOFI2 0.1.1 in the pool; rerun on the source as released, module source `ed5235cb…`, the same figures as before): 142 selections,
56 native module-owned images match (24 identical outright, 32 outside the platform writes), 86 refusals agree, 0
mismatches.

**Landing** (on main `a3c5fd52`, with the qualification record of the 22 October run): the beta base regenerated with
RINGMOD SC's chooser row and main's flags (`67ab0fae…`, on main's base with the reader admission, module select step
and MISSING popup fixes; the base-bound packages rebuild byte-identical, only
`requiredBase` moves; Analog BD's recipe unchanged); the source-built packages imported from the isolated toolchain
build; the Analog BD companion proofs re-exported natively (`export-composition-proofs.py --suite analog-bd`, 8 shards
in the toolchain image, menus precomputed with `defaultChoosers`: all 212 identical, only `moduleSourceTreeSha256`
moves), and `verify-analog-bd-native.mjs` passes (162 native OS and GNU bootloader comparisons, 50 matching refusals,
6 firmware round trips); RING_SC in `choosers.test.ts`'s compact FX2 menu. `module:doctor ring-sc` reports every
integration point green; `npm run check` passes apart from three Python tests that fail the same way on main in this
checkout.

**MKII, 21 October 2026** (the owner's unit, OS 1.40C, RAM-booted development twin `f178641b…` of main's base with
the key bus reader admission fix; package `64dc83b9…`, the build before RECT replaced BIAS; beside Output Matrix,
Analog BD, LOFI2, Quantize Live Rec, Apply Scene, LIFT and BS WAVESHAPER; ears by the owner). Bus state with it
installed: priced 1, readers 1, both resets 1,026, masks `0e 0c`, both cores known, board open, MWEV +53 `01`.
By ear: DUCK ducks; SETUP reads MODE over DUCK and RING; the RING page reads SLEW, S&H and BIAS; RING with S&H and BIAS
at 0, DPTH 127: kick-gated ring modulation; S&H up: stepped; SLEW up: smoother; BIAS up: the dry signal returns under
the ring (which is why it was replaced: it is the depth again). KEY, after re-entering the page, moved a track per
several detents (the stock select step).

**MKII, 22 October 2026: this source** (the owner's unit, OS 1.40C, RAM-booted development twin `53ddaf60…` of main's
base `4d4f731d` with the module select step fix and the key bus reader admission fix, MAIN.raw `712666cb…`; package
`2ba32a49…`, evidence revision `60d3ac17`; ears and hands by the owner, readings over USB by a coordinating session;
the full table is in `evidence/hardware.md`):
- By ear, KEY T1 with a kick on T1: DUCK, plain RING, RECT swept, SLEW through 0 turned quickly and slowly (no click),
  S&H 127 → 0 (the hold stops at once): pass. The three names follow MODE on a MODE change, a page change and on
  leaving and re-entering the FX page. KEY on the first visit steps cleanly (several encoder ticks a track) and DPTH
  right after it moves at its fine resolution: the base's step fix.
- Two instances, T4 FX1 (DUCK) and T5 FX2 (RING, DPTH 64), both on KEY T1, on both cores and both slots: both work
  and do not affect each other. Part SAVE / RELOAD and project save / load another / load back restore them, with
  the bus live afterwards (handle `0x0a` on both).
- Over USB: install alone (flags `01 01 01`, resets `0402 0402`, masks `08 08`, the bus placed on both cores, charge
  72 a core); Sidechain Compressor after it shares the bus (masks `09 09`, no second bus job); every removal order
  returns the bus and arena as expected; removal while a track uses it is refused (loader refusal 7). The base's
  self-test passed with Sidechain beside it (CPU 52.8 %, T1-4 27.7 %, T5-8 37.5 %, longest frame 401 µs) and with two
  instances (CPU 66.7 %, T1-4 21.8 %, T5-8 39.5 %, longest frame 384 µs).
- Not run on a unit for any 0.2.0 build: parameter locks and LFOs (a lock or LFO on SLEW through 0 included), the
  stale-seed install while playing, the window and buffer reads, the missing-module message, scenes, eight instances
  a core. The key latency (T4 0, T2 16, T5 32) is carried from the 21 October key bus re-check, not re-measured
  through this module. A power cycle cannot be tested on a RAM-booted twin.
- Seen once after the project reload: "MISSING SPECTRUM" (Spectrum's legacy id is `0x0a`, the handle RINGMOD SC held),
  probably the base's legacy-name fallback; followed up separately.

**Not tested (0.2.0):** on a unit, the items above; a power cycle; `fx:audit`; MKI.

**Known limits (0.2.0, from the review):**
- A slow SLEW stalls short of the key's level: each sample adds (1 - s)(|key| - level), truncated to the word, so near
  the target the rise drops under one step (the review measured about 1.4% of full scale at 127 on the build before;
  the fractional bits of |key| now kept in the sum make it smaller on average, not re-measured), and a key that quiet
  never raises the level from 0.
- An LFO on S&H (HOLD) adds its fraction to the period's low bits, so S&H 0 under an LFO holds 1 to 15 samples.
- The register-to-register parallel forms this version uses (`abs a a,b`, `tfr a,b a,y1`, `tfr b,a b,y1`,
  `add x0,a a,y0`) ran in dsp_host's emulation before the 22 October session, which ran them on the chip (by ear;
  nothing on the unit compares them sample for sample).

---

## The key bus reader (0.1.0-experimental, never published; 20-21 October 2026)

Source: branch `claude/ringmod-sc-keybus` (on `claude/keybus`, the base's key bus, PR #750), module source
`e2e84eb393c7…`; local, on a Mac with the octabam toolchain and the tester's own OS 1.40C. **Nothing in this section
ran on hardware.** What changed from the previous build (`84b4529d`, history below): the dispatcher tap, its hook and
want words are gone; the key is read from the base's key bus at the same layout; a KEY or MODE change is adopted with
the key's state cleared and the depth ramps back from the next call (the ten-call wait for the tap is gone); with no
live key bus on its core (a card image) the depth stays at 0; fx id 0x06; `keystep.s` removed; KEY's track labels
padded (" T1 "). 361 → 270 DSP words.

**Render gate.** `python3 verify.py` (dsp_host; `tools/keystub.asm` publishes the key where the base's bus does; the
memory image carries the bus's live seed marks). All gates pass:

| Gate | Result |
| --- | --- |
| No instruction decodes as mpysu | pass, 270 words |
| No live key bus (no seed mark, a wrong mark, a counter of 4, only the other core seeded): both modes, both key paths | output equals input bit for bit |
| KEY OFF, a KEY byte of 100, DPTH 0 in both modes, a silent key in DUCK | bit for bit |
| DUCK and RING against the float model, 384 settings | worst error 3.14e-05 of full scale |
| A steady 55 Hz key: swing once settled; a decaying key: largest dip | 0.0000 at REL 0 and 45; 0.00000 |
| DUCK ATK 32 on a key that steps on: 63% down | after 203 samples |
| The key in the other core's window; the module on the other core (T2: T1 local, T7 across) | the same samples |
| A trig split (5): equal once the ramps have landed; a key dispatched after: one block late | pass (1.3e-07, 1.7e-07 against the model) |
| `-guard -dirty 0x5a` | no write outside the instance at all |
| MODE / KEY change mid-render: the model's fade, no step | pass; largest step 0.018 against an input of 0.25 |
| Each continuous knob turned one step every two blocks under a tone | loudest -91 dBFS at the block rate (limit -70) |

**Against the previous build, sample for sample** (`compare.py`, kept privately; dsp_host, both builds fed the same key
by the same fixture). 417 renders: the 384-setting sweep, the other-core window, both cores, trig splits at 5 and 11, a
late key, a noise key, a dirty state, five mid-render KEY/MODE changes and every knob's zipper schedule. The new source
equals `84b4529d` with its wait constant changed from 10 to 1 in all 417. Against `84b4529d` as it was, 412 differ, each
only from the first adoption on: the depth ramps in nine calls earlier and the key's low-pass and follower start from
then (the five equal ones are the bit-exact passthrough cases). So the audio path is the old one; the only intended
difference is the wait.

**Stress.** `python3 tools/stress.py 30`: eight instances and the fixture on one core for 30 s, `-guard -dirty
0x5a`, 27,561 knob moves (MODE and KEY included), four instances on a trig split: 8 of 8 instances wrote nothing
outside their blocks, no hang, no sample on the store's limit; dearest block 8,688 instructions.

**Cycle count.** `tools/build/cycle_count.py` on a scratch remix carrying RING_SC: 63 cycles/sample in the dearer loop
(DUCK, its bsr counted), RING 32; unchanged from the previous build (the loops are the same code).

**Performance record** (`evidence/performance.json`; `modules/ring-sc/perf.py`, after LOFI2's, on a private native
image `c2f9ccc2…` with the key bus's seed marks written into both payloads' dumps so the dear path runs; stock effects
on the original image; executed instructions/sample, null stub subtracted, not chip cycles):

| Effect | Worst unsplit | Worst with trig splits |
| --- | --- | --- |
| RINGMOD SC, dearest DUCK | 67.69 | 80.56 (split at 1) |
| RINGMOD SC, dearest RING | 30.94 | 38.06 |
| COMPRESSOR | 67.44 | 72.06 |
| DARK REV | 193.25 | 242.38 |
| SPRING REV | 257.50 | 314.19 |
| DJ EQ | 293.38 | 330.94 |

`benchmark_stock_dsp.py` in the same session gave the same unsplit stock figures (COMPRESSOR 67.4, SPRING REV 257.5,
DJ EQ 293.4). The base's key bus tap is not in these figures: the base charges it to RINGMOD SC on both cores while
it is installed, 41 executed instructions a sample a core for the four tracks (counted from its source), at 7/4.

**Stress project** (`perf.py stress`, the load `stress_project.py` describes driven straight into dsp_host on the same
image, 32 s plus a 2 s tail, `-guard 0x4000 -guard-shared -dirty 0x5a`, three LFOs a track on DPTH, KLPF and REL, every
slot redrawn each sixteenth at 120 BPM, KEY and MODE included, trig splits on six tracks):

| Layout | Result |
| --- | --- |
| `--both`: RINGMOD SC on FX1 and FX2 of all eight tracks (eight a core), 14 slots changed per step and track | host exit 0, no hang, 16 guarded instances, 0 stray write regions, 0 clobbers; per-core peak 628.2 / 636.8 |
| DJ EQ on every FX1, RINGMOD SC on FX2 (four a core), 12 slots changed per step | the same; RINGMOD SC 0 stray regions and 0 clobbers (DJ EQ writes its own scratch); per-core peak 1622.8 / 1623.1 |

`npm run perf:audit -- check evidence/performance.json`:

| Check | Result |
| --- | --- |
| record | dsp record for ring-sc@0.1.0-experimental |
| cycles | 8 x 63 = 504 of 3120 per sample per core (16%), measured 80.56 per instance |
| stock benchmark | 80.56 vs COMPRESSOR 72.06 (1.12x); the dearest stock effect is 330.94 |
| stress | 8 per core, eight tracks, 3 LFOs and 14 locked slots, 32 s, no clobber, no hang |

No check failed. With the base's key bus tap (41 a core while installed) one instance's footprint on its core is about
122 executed instructions a sample, under half of SPRING REV's worst.

**The USB package** (`public/octatrack-modules/ring-sc/0.1.0-experimental.mwrm`, 2,108 bytes, sha256 `8063657f…`, built with the padded KEY labels):
ABI 9, `requires` the key bus (8), four read claims (Y $800+$200 on each core, Y $33dfe+$202 and $3bdfe+$202), no hook
entries; the relocatable DSP package (270 words, four-origin proofs) from the isolated toolchain build, its page recipe
(the KEY and MODE formatters, the mode renames), 81 executed instructions a sample, 19 state words, name "Ringmod SC".
Built as `module_packages.py` builds an entry with `requiresFeatures` (build.py --dsp, then abi9.py). Checked:

- `module_packages.py`'s two stock-free scans against the tester's 1.40C: no shared run at all. (With KEY's plain
  labels OFF/T1-T8 the formatter's strings repeated a 25-byte stock string list and both scans refused it; hence the
  padded labels.)
- The on-demand board host test (`test_resident_engines_board.py`, at base 0321cf3b's source; the merge of main's Quant Live Rec that made it 163ba0e3 changed no board code) with these exact bytes (the padded-label package `8063657f…`) as its reader (module id
  swapped for the fixture's) and the base's claim admission (resident_base.patch's `modwerk_machine_dsp_claims_admit`,
  copied into the fixture): modes 39-42 pass: alone (bus placed, reset, enabled, priced), beside Sidechain in both
  orders, refused while the tap's price does not fit, removed mid-reset and installed again (fresh reset), a stuck bus
  engine refusing a second reader; and modes 43-46: after its run its removal scrubs the window's seed before the window
  is free, a second reader arriving during the disable or the scrub is told to retry, Sidechain arriving mid-scrub gets a
  fresh reset, a lagging core holds the other core's enable back; and modes 47-48: a core left unknown refuses readers
  (CONFLICT) and keeps the other core's bus off, a slot buffer over the window holds the scrub back while readers retry.
- The site's module-set checks (`module-set.ts`) accept the manifest entry and the package.

**Key latency method** (`ringlag.py`, for the MKII capture; RINGMOD SC has no MON): RING, DPTH 127, KLPF 127, the
receiver playing the key's own audio; against the module's real DSP in dsp_host it recovered 0 (key before) and 16
(key after) exactly, correlation 1.0000. The 32-sample cross-core case needs two cores: the key bus's own interpreter
test and its MKII runs measured it, not with this module.

**Native comparison.** `npm run module:verify -- ring-sc` on the tester's 1.40C (after main's Quant Live Rec and LOFI2 joined the
pool): 138 selections, 56 native module-owned images match (24 identical outright, 32 outside the platform writes), 82
refusals agree, 0 mismatches; native pairs recorded (`sdk/native-comparisons/ring-sc.json`). It needed `static-dsp.json`'s
RING_SC row; it was run with a local, uncommitted qualification stub, because the catalogue offers a module only with
its qualification record and that waits for the hardware run (with the stub, `module:doctor ring-sc` reports every
integration point green). A card image has no key bus, so those images carry an effect that passes audio.

**MKII, 21 October 2026** (the owner's unit, OS 1.40C, RAM-booted development twin `2e467c17…` of the key bus base
`dead8ea7…`; this source's package `8063657f…`; ears and readings by the owner, over USB with the developer tools):
- Key bus re-check on that twin, passed: the bus's engine order 00 → 08 → 09 with both cores' resets (0402) first;
  Sidechain Compressor not charged for the bus; latency T5 32, T4 0, T2 16 samples, correlation 1.000; on removal
  the flags clear and the arena comes back.
- Step 1, install: the receiver masks 00 → 08 08; key bus flags 01 01 01 01 01; the charge rows `4b425553` 72 on
  both cores; the key bus placed, 4,203 of 4,331 with 101 reserved; the inventory lists "Ringmod SC", handle 10;
  KEY's " T1 " label draws centred; KEY steps like a stock select, about three detents a track.
- Step 2, by ear: DUCK works; DPTH 0 and KEY OFF leave the track untouched; KLPF, HOLD, ATK and REL act. A buzz only
  at the very shortest ATK, HOLD and REL: the gain then follows each cycle of the key, audio-rate amplitude
  modulation, as expected (now a stated limitation).
- Steps 3-10 (RING, both cores, locks and LFOs, Parts, reload, removal, a power cycle) were not run: superseded by
  0.2.0, whose DUCK and plain RING are this source's sample for sample.

**Not tested (this source):** the runbook's steps 3-10, the sound-quality audit (`fx:audit`), MKI.

---

## History: the previous build (own dispatcher tap, `84b4529d` and before)

Everything below is about the earlier source, which carried its own key tap at the dispatcher and conflicted with
Sidechain Compressor. Kept as the record of that source; none of it is evidence for the key bus reader except where
the section above says the code is the same.

Source: branch `claude/ring-mod-sidechain-effect-e0027c`, local only, on a Mac with a local octabam toolchain and the tester's own OS 1.40C. **Nothing here ran on hardware.**

**15 October 2026 rework** (after the user found the duck buzzy and weak): KGN and XOVR removed, a fixed 4x key boost, the follower fed by the key's peak over the last 13-26 ms instead of |key| itself, KLPF on an exponential law, REL default 45, and HOLD (the peak window, 0.7-47 ms); page 1 is KEY, DPTH, KLPF over ATK, HOLD, REL. The render gate, stress run, cycle count, native build and screenshots below are from that source. The emulator results on a built image (key lag, both modes, locks and LFOs, the tap's on-demand publishing, stock audio) and the sound-quality audit are from the earlier DSP at `edf88a4c69` (12 October) and were not rerun; the tap and the key paths they exercise are unchanged.

### Commands and results

**Render gate.** `python3 verify.py` (dsp_host, the module beside `tools/keystub.asm`, which publishes its audio the way the module's own dispatcher tap does). All gates pass.

| Gate | Result |
| --- | --- |
| No instruction decodes as mpysu | pass, 361 words |
| KEY OFF, a KEY byte of 100, DPTH 0 in both modes, a silent key in DUCK: output equals input bit for bit | pass |
| DUCK and RING against the float model, 384 settings (ATK, REL, KLPF 127/90/30/0, DPTH, HOLD 34/0/127 in DUCK) | worst error 3.10e-05 of full scale |
| A steady 55 Hz key at 0.1, DPTH 64, on a steady input: swing of the output once settled | 0.0000 of the input at REL 0 and at REL 45, HOLD 34 (following \|key\| itself swung the gain from full to none 110 times a second) |
| A 55 Hz key decaying with a 100 ms time constant: largest drop of the output while the gain recovers | 0.00000 of the input: it recovers without dipping again |
| DUCK ATK 32 on a key that steps on: 63% down | after 203 samples (4.6 ms) |
| A key in the other core's publish region gives the same samples | pass |
| The same module placed on the other core (T2): T1 local and T7 across give the same samples | pass |
| The module's own tap, run in the fixture's place, gives the same samples (this core's bus only) | pass |
| A block split by a trig gives the same samples once the knob ramps have landed | pass |
| A key track dispatched after this one is heard one block late | pass |
| `-guard -dirty 0x5a`: no write outside the instance but its key track's want word | pass |
| A MODE or KEY change mid-render follows the model's fade and eight-block wait | pass; largest output step 0.018 against an input of 0.25 |
| Each continuous knob turned 20 to 110, one step every two blocks, under a 438.75 Hz tone | no block-rate step above the steady render; the loudest candidate measured -91 dBFS (limit -70) |

The step measure is `verify_knob_clicks.py`'s, reimplemented in the gate because that tool cannot feed a key. Checked on a synthetic block-rate step it read -59 dBFS where arithmetic gives about -52, so it reads low by several dB; the margin to the limit is correspondingly smaller than 9 dB.

**Stress.** `python3 tools/stress.py 30`: eight instances and the fixture on one core for 30 s, `-guard -dirty 0x5a`, 27,561 scheduled knob moves (MODE and KEY included), four instances on a trig split. Eight of eight instances wrote nothing outside their blocks but want words, no hang, no sample on the store's limit. Dearest block 8,631 instructions: at most 67.4 executed instructions a sample per instance, the fixture included (half the instances in DUCK with KLPF at different settings; HOLD among the moved knobs).

**Efficiency pass, bit-identical** (15 October 2026): short immediates, parallel and register-to-register parallel moves in the sample loops, the depth ramp inlined, redundant moves and tests dropped, the tap's pointer arithmetic simplified; only forms stock payloads already run (no `rep`, no plain (Rn+Nn) Y moves). 428 to 361 words, DUCK 70 to 63 and RING 36 to 32 instructions a sample. Against the previous source (`09de2318`), every render case of the gate (420 runs: the 384-setting sweep, both cores, both key paths, trig splits at 5 and 11, a late key, the module's own tap, the guard on a dirty state, MODE and KEY changes mid-render, every knob's zipper schedule) gave identical output sample for sample, and the tap, run with seeded want words and cold and warm counter marks on six tracks, left identical Y memory over the key bus and both cores' windows. Not rerun on a built image under `ot_emu`.

**Key level.** `ot_emu` on RINGSC02 (the same key path as RINGSC04), a 0 dBFS tone into a THRU key track, the key bus read with `--dsp-peek`: at AMP VOL 64 (the default) the key peaks at 0.254 of full scale, at AMP VOL 127 at full scale. So the fixed 4x boost brings a full-scale key at the default AMP VOL to full. A sample track's playback level was not measured.

**Native build.** A private copy of `sdk/octabam`, remix `x-rmsc`: RINGMOD SC with every stock effect but LO-FI, whose span holds it (image RINGSC05). `make image` builds. RINGMOD SC places 361 code words on each core (about 85 of them the tap; 176 words of LO-FI's span left) and its hook at the dispatcher (`P:0x4a7` on payload A, `P:0x29c` on B). One source serves both cores: it reads the track being dispatched (X:$420) to tell them apart. `cycle_count.py`: 63 in the dearer sample loop (DUCK, with its subroutine call counted; RING 32); the tap is not in that figure. Earlier composed builds (with Output Matrix, Analog BD, TapeHead, LOFI2 and Quantize Live Rec) were on the earlier DSP. Other selections, the browser builder and `module:verify`: not tested.

**Screens.** `scripts/capture-module-ui.py` on RINGSC04 with the plan in `media/capture.json` (KEY now turned four detents: one no longer moves it). The four captures in `media/` show the new layout.

**The tap publishes on demand.** `ot_emu --dsp-pcwatch` on the tap's first copy loop on core 0: no arrival in a run with no RINGMOD SC on any track, arrivals in a run with T6 keyed by T5. A reader stays silent for ten calls after KEY or MODE changes, so it never hears a bus the tap has not yet filled.

**Stock audio with the tap in place.** The same project with no effect on any track, on this image and on the earlier image that carried Sidechain Compressor's tap: MAIN left identical over 4,814 samples. A comparison against an image with no tap at all was not run.

**That image under `ot_emu`** (the ColdFire port, both DSP cores, the module's own tap; no Sidechain Compressor in the image). THRU machines fed mono noise, MAIN left read back, the gain change correlated against the key at each lag:

| Case | Lag, samples | Correlation |
| --- | --- | --- |
| DUCK on T2 FX1, KEY T1 (same core, key first) | 0 | 0.9995 |
| DUCK on T6 FX1, KEY T5 (the other core's same-core case) | 0 | 0.9995 |
| DUCK on T5 FX2, KEY T6 (same core, key after) | 16 | 0.9995 |
| DUCK on T6 FX1, KEY T1 (across the cores) | 32 | 0.9995 |
| DUCK on T3 FX1, KEY T7 (across, the other way) | 32 | 0.9995 |
| DUCK on T2 FX2, KEY T1 | 0 | 0.9995 |
| RING on T2 FX1, KEY T1 (against the signed key) | 0 | 0.9999 |
| RING on T6 FX2, KEY T1 | 32 | 0.9999 |
| RING on T1 FX2, KEY T8 | 32 | 0.9999 |
| DUCK on T2 at DPTH 127 and on T3 at DPTH 64, both KEY T1 | 0 | 0.9995, with the summed depth the two settings predict |

The emulator runs the cores in a fixed relation; the unit's cross-core timing is not measured.

**Parameter locks and LFOs on that image** (`ot_emu`, the sequencer running, the gain reduction read per 512 samples against the key):

| Case | Result |
| --- | --- |
| T2 FX1, KEY T1, trigs on steps 1-5; step 2 locks DPTH 0, step 3 locks KEY OFF, step 5 locks DPTH 64 | reduction 2.86, 0, 0, 2.86, 1.44 on the five steps: each lock lands on its step and the next unlocked step returns to the set value |
| LFO 1 on DPTH (speed 70, depth 127), DPTH 64 | the reduction climbs smoothly from 1.51 to its ceiling of 2.86, no steps between windows |
| LFO 1 on KGN (a knob since removed) | climbs smoothly from 3.3 to 13.8 |
| LFO 1 on KEY at full depth, KEY T1 | KEY is carried past T8, which reads as OFF: no reduction, the track passes, nothing faults |

Loading these projects from the card is the only persistence shown: the stored KEY, MODE and knob bytes come up as saved. Saving from the panel and a power cycle were not run.

**Panel.** `scripts/capture-module-ui.py` on that image: the FX1 chooser lists RINGMOD SC; the main page drew KEY, DPTH, KGN, ATK, REL, KLPF; in RING KEY, DPTH, KGN, "-", "-", KLPF; SETUP drew MODE and XOVR. Those captures were replaced on 15 October (Screens, above).

**KEY's step** (`ot_emu`, a later image with `keystep.s`, 13 Oct 2026; turns of one detent 100 ms apart, then of four):

| Case | Result |
| --- | --- |
| Before `keystep.s`: RINGMOD SC chosen on SETUP, FX1 pressed, KEY turned | a track a detent: the knob record still held the last staging (step 256, count 128) |
| Before: the same after AMP then FX1 | the stock select step (819, count 9): single slow detents do not move it, four detents move one track |
| With `keystep.s`: chosen on SETUP, FX1 pressed, KEY turned | single detents OFF, OFF, OFF; four detents T1, T2, T3, T4; eight back, T2 |
| With it: DPTH turned 3 back, ATK 5 up | 124 and 5: plain knobs still move one a detent |
| KEY turned with a trig held (a lock), with and without it | four detents move four tracks in both images: that branch of the knob routine is not changed |
| Stock THRU INAB, for reference | eleven single detents 250 ms apart do not move it |

**The gate** (13 Oct 2026). `keystep.s` now acts only when the descriptor the knob routine resolved is RINGMOD SC's clone (`CLONE_RING_SC`); 68 B. Built alone with every stock effect but LO-FI (whose span holds the 426 words; image RINGSC01, the earlier DSP), then swept under `ot_emu` against a control: the same image with the stock instruction put back at 0x40055140 (3 bytes differ). Each case turns all six knobs 1, 1, 3, -2, 4, 4, -8, 5 detents and reads the knob record and value, on first visit after choosing the effect on SETUP and after AMP then back:

| Case | Result |
| --- | --- |
| SRC, AMP and LFO main pages; the nine stock effects on FX1, the thirteen on FX2; RINGMOD SC's other five knobs | 302 of 306 sweeps identical to the control: records and values |
| RINGMOD SC KEY, FX1 and FX2, first visit | gated: record restaged to step 819, count 9, single detents leave KEY on OFF, about four move it a track; control: 256/128, a track a detent |
| The same after re-entry | same steps in both (819/9); only the starting track differs, carried over from the first visit |

On the user's MKII (OMXATS21, the ungated routine, 13 Oct 2026) KEY was reported to feel right; the gated build has not been on the unit. Not checked: the unit with the gated build.

### Sound quality

`npm run fx:audit`, the nine signals rendered through the module with dsp_host and the fixture, DPTH 127, KGN 45 (about the fixed 4x now used). These renders were made on the earlier DSP, which followed |key| itself, and have not been repeated.

| Render | Result |
| --- | --- |
| DUCK, steady key, ATK 127, REL 127 | passes: aliasing below -140 dBc, harmonics -119 dBc or lower, DC -100.6 dBFS, idle digital silence |
| RING, steady key (rendered when RING still had a GAIN knob, set to 4x; since removed) | passed at -12 dBFS; at -1 dBFS that 4x gain put the output on the store's limit. Not re-rendered without it |
| DUCK and RING with a 55 Hz key | the audit fails on "aliasing" of -2 to -45 dBc. These are the sidebands the key puts beside each tone, which is what the effect is; the audit's guide says to judge with modulation off |

So with a steady key the effect is clean, and it adds no DC and leaves nothing after the input stops (it has no memory of the audio). A moving key creates sidebands by design, and those above 22.05 kHz fold back; KLPF limits how high the key reaches.

### Performance

`npm run perf:audit -- check evidence/performance.json`:

| Check | Result |
| --- | --- |
| cycles | 8 x 63 = 504 of 3,120 per sample per core (16%), measured 67.4 per instance (the fixture included) |
| stock benchmark | 67.4 against COMPRESSOR's 67.4 (1.00x); SPRING REV measured 257.5 and the dearest stock effect, DJ EQ, 293.4 (`benchmark_stock_dsp.py`, same host, earlier run) |
| stress | **does not pass the audit**: it asks for eight tracks, three LFOs a track and twelve locked slots from `stress_project.py` and `pressure.py`. the repository's stress project was not built for this module (it was first blocked by a tool limit while the module still needed Sidechain Compressor, and has not been retried since). `tools/stress.py` above was run instead and is what the record states: one core, no LFOs or locks, and without the tap |

Figures are executed instructions in the emulator, not hardware cycles. The key tap is not in them: by a count of the source it costs each track about 35 instructions a block when nothing listens to it (about 2 a sample) and about 75 more for each of its two copies when something does. It was not metered.

### Stock flows

Not tested. The module changes no stock flow by design: it adds a row to the effect choosers and nothing else.

### Not tested

All hardware behaviour. Scenes and the crossfader, saving a Part or project from the panel, a power cycle, an LFO walking KEY between tracks, MKI, the browser builder, `module:verify`, and compositions other than the one above.
