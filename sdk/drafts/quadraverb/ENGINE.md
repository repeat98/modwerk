# Quadraverb engine: design (draft, 26 November 2026)

Status: design, a pricing prototype, and a bit-exact prototype of the generator. With the SDRAM stream every program
but the gated ones fits the FX2 buffer at full rate, and each runs in `dsp_host` bit for bit against an integer model,
the stream's ColdFire side modelled ([below](#the-first-bit-exact-prototype-26-november-2026),
[modulation](#modulation-on-the-dsp-26-november-2026), [the stream](#the-sdram-stream-26-november-2026)). On a unit
only the three FX2-only development builds have run: priced on an MKII within a step of the meter of the stall model
([TESTING.md](TESTING.md#on-the-unit)), not yet heard.

## The owner's decisions (26 November 2026)

- **Full rate, programs untouched.** The engine runs the firmware's 96-step programs at the Octatrack's 44.1 kHz
  (the original runs at about 42 kHz, so delays and reverb times come out about 5 % shorter, as Midiverb's are 6 %
  longer). Rewriting the programs for half rate (halved delays, recomputed filter and EQ coefficients) was turned
  down: it would make every program our translation.
- **About 400 chip cycles a sample per instance at most.**

## Why compiled code, not an interpreter

An interpreter like Midiverb's jumps to a handler for every step. Midiverb's dieted engine prices at about 9 cycles
a step, so 96 steps would be about 860 cycles a sample, more than twice the target.

The engine instead turns the selected program into straight-line DSP code. The 90 factory programs use 60 distinct
step patterns, so fixed code for each pattern would not fit the arena (about 18K words); the code is made for the
program when it is picked.

## The step code

Registers: `a` is the Quadraverb's accumulator, `b` latch B, `x1` latch M. `x0` holds the step's coefficient and
`y0` its delay word, both fetched by the step before. `y1` holds A before a write.

- **Delay memory:** one Y ring with modulo addressing. Three address registers (`r4`-`r6`) take turns. Each walks
  from one access to its next with a post-added `n`, so an access is `y:(r4)+n4`: no displacement, no index stall.
  The distance after a chain's last access in a sample closes the loop for the next one, so nothing resets a sample.
- **Tables:** the coefficients in X (the instance's `r7` block, 96 words, walked by `r2`), the distances in Y (walked
  by `r3`, one reload after every access). The sweeps, pitch shift and Leslie rewrite entries of these two tables
  (`tools/qvlfo.mjs`); the code never changes while a program plays.
- **A read step** is one instruction plus a reload: `mac y0,x0,a x:(r2)+,x0 y:(r5)+n5,y0` multiplies this step's
  word and coefficient while fetching the next step's, then `move y:(r3)+,n5`. A latch or an add of B or M costs one
  more instruction (`tfr b,a`, `tfr y0,b`), which can carry the reload.
- **A write step:** `move a,y1`, then `mpy x0,y1,a x:(r2)+,x0 a,y:(r4)+n4` stores the old A while it scales it, then
  the next step's delay word.
- Only `x0,y1` and `y0,x0` products are used (sdk/octabam/docs/TRAPS.md: other orders assemble as `mpysu`). Every
  form above assembles; `move x:…,n a,y1` (an `n` load beside a register copy) does not exist, and the pricing
  respects that.

## What it costs

`tools/qvc_price.py` compiles every factory program to this code and prices it with the stall model
(`sdk/cycle-scan/interlock_scan.py`, Table A-1 and the A.2 interlocks; a model from the manual, calibrated idle on an
MKII, not a measurement):

| Part | Cycles a sample |
| --- | --- |
| The 96 steps | 274-328 (median 306), of which 24-39 are stalls from storing A right after computing it |
| Input, output, mix | about 15 (estimate) |
| Sweeps, pitch shift, Leslie: table rewrites about every 10.7 samples | about 5-10 (estimate); measured 12-16.5, ticks of 130-155 cycles (367 for a Leslie) ([below](#modulation-on-the-dsp-26-november-2026)) |
| Copying the SDRAM lines in and out | about 25 median, up to about 70 (estimate, from the full-rate stream sizes); measured 6-57 (2.1-2.5 a halfword in, 1.3-2.0 out) ([the stream](#the-sdram-stream-26-november-2026)) |
| Block overhead | about 3 |
| **Total** | **about 350 median, about 425 worst (estimate)**; measured 207-310 on average, 316 in the dearest block |

The prototype below measures the steps far lower: 164-231 (median 205), the proc around them about 12.5 more.

So 400 is reached by every program, with room ([the stream](#the-sdram-stream-26-november-2026)). Code: 248-287
program words a program, plus 96 X and about 100 Y table words, per instance, and the stream's copies (about one P word
a halfword out, two in; the long static run in a DO loop).

## What it needs from the base

- **A program's code changes at a pick: built** (base 0.8.3 draft, branch `base/octatrack-program-areas`, development
  twins only, not on a unit yet; [on the base](#on-the-base-program-areas-and-an-fx2-id-26-november-2026)).
- **The SDRAM stream**: per instance and frame, a median of 96 and at most 352 halfwords to the DSP, 64 and at most 144
  from it, at a fixed latency ([what the base must provide](#what-the-base-must-provide)). On the owner's MKII (26
  November 2026) probe A (to core 0) passed at 64-160 halfwords, probe B (from core 0) at 64-256, and both together at
  160 each through a 5-minute soak: 160-256 each way per core is proven, and the frame interrupt, not memory or DMA,
  limits it. That budget is per core, shared by every instance on it: one instance fits 160 each way in 59 of the 76
  programs, 256 in 68; the 8 plates need 336-352 in.

## On the base: program areas and an FX2 id (26 November 2026)

**Program areas** (docs/OCTATRACK_API.md, "Program areas"): the package requires `programs`, its ColdFire half gives
`ot_dsp_effects` a record (`program_words`, `program(slot)`, `code(slot, program, at, out)`), and proc jumps to the area
its slot record names, `X:$7fb0 + 4 * ((r7 >> 8) & 15)`, word 0. The base holds two areas a slot in its core's arena,
writes the next program into the idle one while the other plays and switches between two frames; a program held in
the idle area switches with no write. So an area holds a program's own code with every address final for `at`; the
I/O pass, MIX, the clear and the state set-up stay in the package. The tables cannot stay immediates in init (the
prototype's 338-514 init words, about 3 a table word): an area carries them as P data that one shared routine copies
to X and Y at the switch, or the stream brings them. Measured on the prototype's generated code (`qvs.generate`, the
static programs and 5): proc 282-421 words, 67-74 coefficients and 77-82 distances, so an area of about 430-570
words; the moving programs add their tick (and the pitch shifts their 256-word fade, unless the stream brings it), so
`program_words` of about 600-850 for the dearest. Two areas a slot is 1,200-1,700 words of an arena of about 4,700 a
core (twin `8feb3f71`: 4,673 and 4,839, before stock effects and the resident engines): one instance a core beside a
Part's stock effects, two where they leave room; a slot with no room stays dry (its record 0).

**Cycles:** admission takes one instance up to 726 chip cycles; a modeled price is charged at 7/4 (at most 414
declared), a hardware one as measured. Every program's proc, 207-310 cycles a sample on average and 316 in the dearest
block with the stream, fits either way; a hardware price (the MKII matched the model within a meter step) lets two
dear instances share a core.

**Its FX2 id:** the base needs nothing. Over USB it gives each installed module its own handle of 128 at install
(dsp.c `choose`: the package's id if free, else the first free; id 32 ran on the MKII, docs/OCTATRACK_MORE_EFFECT_IDS.md
S63); the package's id is only its preferred one. Midiverb took the last of 0x04-0x1f in the *tools*: the octabam
registry refuses two modules on one `fx2_id`, `module-list.mjs` refuses one outside 0x04-0x1f, the builder's
`dsp_section` one at 32 or more, and the catalogue (`module-contract-v3.ts`) a shipped id twice. Those are card-build
rules (a card image pins ids into stock's 32-entry tables), and a package that requires `programs` is USB-only, as a
key-bus reader is. The fix is tooling, not base: let a USB-only effect share a preferred id, or take one of 0x20-0x7f,
in those four checks.

## The first bit-exact prototype (26 November 2026)

`engine/` turns one static factory program into straight-line code and holds it to an integer model:

```sh
node engine/extract.mjs <rom> ~/.cache/modwerk-local/quadraverb/engine/programs.json   # programs, integer coefficients
python3 -B engine/verify.py <programs.json> 40 [--cycles <dsp_host with -steptrace>]    # dsp_host against the model
python3 -B engine/check_model.py <programs.json> 40                                      # the model against tools/qv.mjs
python3 -B engine/qvc.py <programs.json> --all                                           # every program's body, priced
```

The programs file and every generated program are derived from the ROM: they stay in `~/.cache/modwerk-local/`.

**What runs bit-exact.** Of the 9 programs whose DSP program never moves, 5 fit the FX2 buffer untouched at full rate:
40 167 ms DELAY (7,062 words), 41 250 ms DELAY (10,548), 56 SKANK GUITAR (8,031), 76 VELOCITY ECHO+ and 77 VELOCITY
ECHO- (12,523 each); no reverb does (MEDIUM HALL needs 31,614, PINGPONG DELAY 63,049). Each passes `verify.py`:
16,000 samples of stereo noise and of two impulses, one instance in 16-frame blocks; trig splits at frames 1, 5, 7
and 13; an r7 block full of another effect's words before init; two instances on separate buffers and state blocks
(the second split at 7) in one run; and under the tracing host. The relocated model equals the model on the original's
64K addresses bit for bit, and every instruction disassembles with the operands written.

**The integer model** (`engine/qvc.py`, `Machine`) is the engine's arithmetic. Each choice the original may make
otherwise is an assumption, marked in the code:

| Choice | The model | Assumption about the original |
| --- | --- | --- |
| Word | 24-bit fraction | its width is not recorded |
| Store | A truncated (floored) to a word; the largest word of its sign outside [-1, 1) | truncation, not rounding; saturation, not wrap |
| A | 56 bits; products kept whole (`mpy`/`mac`); sums wrap at 56 bits (saturation mode off) | no product bit lost |
| A write's product | scales A limited to a word (`mpy x0,y1`); select 01 adds the full A | it may scale the full A |
| B, M | words: a read latches its word, a write the word it stores (the input at 0x5e) | word-wide latches |
| Coefficient | c / 2048 exactly (`x0 = c << 12`) | as the README reads it |
| Input, output | floor((L + R) / 2) at step 0x5e; the words read at 0x00 (left) and 0x5f (right), wet only | not the original's converters |

**Against the float model** (`tools/qv.mjs`, 2 s, `check_model.py`, tolerance -80 dBFS): an impulse and noise at 0.1, where no store
saturates. The largest difference is 1-3 LSB (-130 to -138 dBFS) for 40 and 41, 19-20 LSB (-113 dBFS) for 76 and 77,
and 51 LSB (impulse) and 243 LSB (noise, -91 dBFS) for SKANK GUITAR. With 32-bit words
(`--frac 31`) SKANK's differences fall to 0.6 and 1.0 LSB, so they are truncation that its resonant filters amplify,
not a different program. Noise at 0.3 drives A past full scale at about 100 writes in 2 s (584 in 77); in the delays
that reaches the output by 3 LSB at most, in 56, 76 and 77 by up to -54, -39 and -28 dBFS, where the two models part by
design. Finding for the word-width question, measured with `--frac 15`: with 16-bit words SKANK's difference grows to
-46 dBFS on noise at 0.1, only about 19 dB below its output's peak.

**Cycles a sample** (interlock_scan's model on the traced proc, one instance, 16-frame blocks):

| Program | Body | Body stalls | Whole proc |
| --- | --- | --- | --- |
| 40, 41 delays | 213.0 (211 instructions) | 2.0 | 225.4 |
| 56 SKANK GUITAR, 76 VELOCITY ECHO+ | 212.9 (209) | 3.9 | 225.4 |
| 77 VELOCITY ECHO- | 214.0 (211) | 3.0 | 226.4 |

The whole proc adds about 12.5: the (L+R)/2 pass, the state saved and restored a call, the loop. Across all 90
programs' snapshots the body prices at 164-231 cycles (median 205), where `tools/qvc_price.py` estimated 274-328
(median 306) for the steps. The difference: steps nothing uses are left out (a read with no product, latch or output;
a store no read reaches); a read's word is fetched ahead of the stores before it, into the last product's free Y slot,
unless it reads one of them at delay 0; and a reload that needs an instruction of its own goes where it fills the
stall of a move of A after the instruction computing it, at least three instructions before its chain's next access.
Without that scheduling (`verify.py --plain`) the delays cost 267 (25 arith and 21 AGU stall cycles). Add the stream
copy and table rewrites of the estimate above (about 30-80) and the engine stays well under 400.

**The code as built** differs from "The step code" above in these details: `n7` holds the input word (loaded at the
sample's start, before the left output overwrites its slot); `r0` and `r1` walk the left and right slots (`n0 = n1 =
2`) after a pass that writes (L+R)/2 into each left slot; the last coefficient fetch is `x:(r2)+n2` and the last reload
`y:(r3)+n3`, which close both tables for the next sample; the distance table sits in Y right after the ring.

**Simplified or not done:**
- No stream in this first step: only programs whose lines fit the buffer ([the stream](#the-sdram-stream-26-november-2026) came next). The modulation is below.
- init clears the whole ring in one loop and writes both tables from immediates; on a unit the base writes the code and
  tables at a pick, and the clear has to be spread over calls (Midiverb clears 512 words a call).
- No knobs: wet only, no mix or level.
- proc leaves r6 (the parameter page) changed, as Vibrato does (the dispatcher reloads it).
- The second instance's buffer (Y:0x8000) is set by the gate: the synthetic image hands every allocator entry 0x4000.

## Modulation on the DSP (26 November 2026)

The sweeps, pitch shift and Leslie now run on the DSP. The code still never changes while a program plays. On a tick,
the engine steps the LFO as the firmware does and rewrites the table entries the firmware would rewrite: the
coefficients in X and the distances in Y.

```sh
node engine/extract_lfo.mjs <rom> ~/.cache/modwerk-local/quadraverb/engine/lfo     # every moving program, its ticks
python3 -B engine/qvc.py - --moving ~/.cache/modwerk-local/quadraverb/engine/lfo/lfo.json   # which ones fit
python3 -B engine/verify.py <programs.json> 5 [--cycles <host>] [--realtime] [--test-ring]
```

`extract_lfo.mjs` runs the firmware for each moving program (a fresh boot, then one recall). It writes the
parameters, the state the LFO starts from, the DSP program at that tick, and the firmware's whole program after each of
the next 16,384 ticks. All of it comes from the ROM, so it stays in the cache.

**What runs bit-exact.** Only two moving programs fit the 15,870-word buffer at full rate: 5 STEREO FLANGE (13,066
words) and 30 MONO FLANGE (13,026). Both are stereo sweeps. The other 65 need 16,621 to 63,413 words (`qvc.py
--moving`): no single-pair sweep, pitch shift or Leslie fits. So those kinds run in `dsp_host` on a larger ring
(`--test-ring`). That proves the code, not that the program fits a unit: on a unit they need the stream. A test ring
can hold at most 32,768 words: the DSP56300's modulo buffers stop there (M from $8000 selects multiple wrap-around),
in `dsp_host` too. So the slow Leslies (8, 39, 67: 38,750 words and more) had no host test; their code differs from
38's only in the rotors' rate and depth. With the stream all of them fit the real buffer and run bit for bit
([the stream](#the-sdram-stream-26-november-2026)); the figures below are from the test ring, without it.

| Program | Kind | Ring (words) | Fits | Body | Proc, average | Dearest block | A tick | Dearest sample |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 5 STEREO FLANGE | stereo sweep, parabolic | 13,066 | yes | 165.0 | 199.5 | 206.4 | 151-155 | about 363 |
| 30 MONO FLANGE | stereo sweep, parabolic | 13,026 | yes | 164.9 | 199.3 | 206.2 | 151-155 | about 362 |
| 69 STEREO SPREAD2 | stereo sweep, triangle | 16,621 | no | 187.0 | 221.5 | 228.4 | 151-155 | about 385 |
| 20 LO DIFUZ CHMBR | single-pair sweep (reverb) | 25,381 | no | 202.0 | 234.4 | 240.6 | 129-133 | about 378 |
| 60 CONCERT GUITAR | pitch shift, down | 25,801 | no | 227.9 | 261.0 | 267.6 | 138-142 | about 412 |
| 37 STEREO PITCH | pitch shift, up | 29,320 | no | 170.0 | 202.8 | 209.2 | 134-138 | about 351 |
| 38 LOOSE LEZLIE | Leslie, fast | 28,359 | no | 218.9 | 252.8 | 260.5 | 366-373 | about 653 |

Cycles are interlock_scan's model on the traced proc, one instance, 16-frame blocks; blocks 1 to 32 are traced, one
`dsp_host` run each, so the ticks land on every position a block can hold them. "Body" is the program's own code a
sample, "Proc" everything a call runs divided by its samples, "A tick" the tick's own code, and "Dearest sample" the body
plus the proc's fixed part, the dearest tick and the segment it adds. The engine works in blocks, so the dearest block
is the figure that has to fit the budget. Ticks add about 12-15 cycles a sample on average (16.5 for the Leslie, whose
tick costs more but comes half as often).

Each passes every gate in `verify.py`:
- **tables:** the model's DSP program equals the firmware's after each of 16,384 ticks (about 4.2 s; 8.7 s for the
  Leslie), byte for byte. This holds for all 67 moving programs `extract_lfo.mjs` gives, not only the ones above.
  For the sweeps, the DSP's simpler form of the triangle step (`qvc.tri8_plain`) also equals the firmware's at every
  phase and direction for the program's rate.
- **relocation:** the model on the relocated ring equals the model on the original's 64K addresses, with the modulation
  running (noise and impulse, 16,000 samples).
- **bit-exact:** `dsp_host` equals the model with the modulation running: noise and impulse, trig splits at frames 1,
  5, 7 and 13, a dirty state block, two instances, and every traced run.

**Tick timing.** The original's ticks come from the 8051's timer: 255.4 µs each (252.4 cycles measured in the
emulator plus the assumed 3-cycle interrupt response; about 531 µs for the Leslies). The original's DSP runs at about
42 kHz (the firmware's own delay conversion), so it sees a tick every 10.73 of its samples (22.3 for the Leslies). The
engine has two ways to place them at 44.1 kHz:
- **Samples a tick as on the original** (the owner's choice, 26 November 2026): a tick every 10.73 samples. Each program plays sample for sample as
  on the original, so its sweeps run about 5 % faster in seconds, like every delay and reverb time.
- **Ticks a second as on the original** (`--realtime`): a tick every 11.26 samples. The sweeps' periods in seconds
  match the original, but their depth in samples does not shrink with them.

Samples a tick is the more consistent with "programs untouched". The firmware rewrites the program the DSP runs, so the
rewrites are part of the program as the DSP sees it. Kept in samples, the original's output is reproduced sample for
sample, only played 5 % faster, as for the static programs. Kept in seconds, the modulation is resampled against the
audio. The pitch shift's detune (its ratio is 1 − rate / (256 × samples a tick)) and every sweep's pitch excursion would
come out about 5 % smaller while their delays are 5 % shorter: neither the original nor a uniform speed-up. Both are
one constant (`qvc.tick_timing`); program 5 passes every gate with either.

On the DSP the timing is a count and a fraction: samples a tick = INT + FRAC / 2^23 (10 + 0.7255 for 5). When the
count reaches 0, a tick lands before the next sample. The count then restarts at INT, or INT + 1 when the fraction's
running sum carries. The model does the same arithmetic, so a tick lands on the same sample in both, splits included.

**How a tick runs.** proc runs a call's samples in segments: up to the next tick or the call's end. That is at most
three segments in a 16-sample call. It saves A, B and M at a segment's end, so a tick has every data register to
itself. The tick does four things:
- **The LFO step**, in the firmware's integer arithmetic. The phase moves, reflects at both ends and flips its flags.
  The parabolic shape is floor(P² / 65536), which equals the firmware's 8-bit pieces. The displacement is
  floor(X × depth / 256), with products as `mpy x0,y1`.
- **The coefficients:** the high byte of each moving coefficient goes into its X entry (the low three bits stay).
- **The addresses:** each moving read's relocated address. It is linear in the displacement for the sweeps and the
  Leslie; the pitch shift's four taps are computed as the firmware writes them, tap A's quirk at 0xfe and 0xff
  included.
- **The distances:** a moved read changes the distance into it and the one out of it. The tick writes both slots of
  the Y table. Where the moved read is the second access on its chain, the distance into it is already loaded in that
  chain's `n` register, so the tick writes the register too. A moving read is never a chain's first access in a sample
  (the generator checks this): its register would already point at the old address. The distances are written as
  signed differences, not reduced to the ring: modulo addressing takes a negative N as long as |N| ≤ M (the rule as
  the DSP56300 family manual gives it, from memory; `dsp_host`'s AGU does the same). Not seen on a unit.

`dsp_asm` takes no absolute jump to a label and no backward branch, so every conditional in the tick is a forward
  `bcc` or a `btst`, and the segments run in an outer `do` whose idle passes skip to its last `nop`.

**Relocation for moving reads.** A moving read counts at every address it can take: every displacement at both signs
for the sweeps and the Leslie, every tap position for the pitch shift. At all of them it must read the same line, at
a delay of 1 or more. Its line then covers the longest delay, and its relocated address is its original address plus one
offset. The generator also checks that no sweep wraps the 16-bit address. A step whose coefficient the modulation
writes counts as live, and as a product, even while its coefficient is 0. So the dead-step test holds for every value.

**Tables from the ROM.** None is committed:
- The pitch crossfade (256 values) is read from the ROM by `extract_lfo.mjs` into the cache. The generator writes it
  into the generated program, after the distance table in Y. The formula 255 sin(π/2 · i/255) misses 136 of the 256
  entries, by up to 2. A formula would not be bit-exact, so the table stays.
- The Leslie's depth curve is not needed. The rotors start at the program's own speed, so the slew toward it never
  acts and the depth stays fixed. The speed bits come from MIDI (aftertouch, pitch bend, the sustain pedal), which the
  engine does not take: each Leslie plays its default speed (38 and 82 fast; 8, 39 and 67 slow). `extract_lfo.mjs` runs
  the firmware until both rotors reach it.
- VERB SHIFTER's curves are not needed: its only program, 73, is gated (below).

**The r7 block.** $00-$0C hold the state as before, and $0D-$0F the call's samples left, the samples to the next tick
and the timing's fraction. The coefficients start at $10 (43-78 products in these programs, so they end by $5D, and
the closing fetch reads $5E at most). The LFO's words start at $71: the phase and flags for a sweep (2 words), the phase
for the pitch shift (1), and for the Leslie each rotor's phase and flags plus four scratch words for its taps (8, to
$78). Free: from the coefficients' end to $70, and $79-$83 at least.

**Assumed:** the time base (above); the start state, which is the firmware's when the program is the first recalled
after power-up (a recall does not reset the phase: it runs on from the program before); the Leslie's default speed.

**Left out:** the gate itself (3, 23-29, 73, 86, 87) and the onset restart (28, 29, 31, 32, 88). Both need the signal
detector; their open, free-running form runs ([the stream](#the-sdram-stream-26-november-2026)). Also left out: VERB
SHIFTER (73, gated: its coefficient sweep reads two 256-entry curves from the ROM, and the engine has no tick for that
kind yet), the Leslie's speed switching, and the MIDI modulation offsets on rate and depth.

**Cheaper ticks.** A sweep's tick costs about 154 cycles (19 of them stalls), a Leslie's about 367 (36). Most of it is
two-word instructions: long immediates and displaced moves. Not optimised yet: the sweeps' distances could be written
straight from the displacement (each is a constant plus 0, 1 or 2 times it), and the Leslie's taps could skip the
scratch words.

## The SDRAM stream (26 November 2026)

Long delay lines now live in a ColdFire-side ring and reach the DSP through per-frame blocks, so every program but the
gated ones fits the FX2 buffer at full rate, untouched.

```sh
python3 -B engine/qvs.py <programs.json> --all                         # every program's split and transfer sizes
python3 -B engine/qvs.py <programs.json> <p> [--force 34]              # one plan, and the models' closed loop
python3 -B engine/verify_stream.py <programs.json> <p> [--cycles <host>] [--force 34] [--lat FRAMES]
python3 -B engine/widths.py <programs.json> <p> ...                    # 16-bit words against 24-bit
```

**What runs bit-exact.** All 69 programs that stream run bit-exact: 54 sweeps (the rooms, halls, chambers and plates among them, and the choruses, flanges and echoes), the 4 static ones that stream (PINGPONG DELAY, MEDIUM HALL, the 500 ms and 1.5 s delays), all 6 pitch shifts and all 5 Leslies. Each passes `verify_stream.py`: the DSP model and the ColdFire model together
equal the integer model of the unsplit program on the original's 64K addresses (noise and two impulses, 16,000 samples
or 3,200 past the longest streamed delay: 66,208 for the 1.5 s delay), and `dsp_host` equals them bit for bit, audio
and every out-block: one instance, trig splits at frames 1, 5, 7 and 13, a dirty Y before init, two instances (the
second split at 7). Every injected halfword carries random junk in bits 16-23. One flipped LSB in one in-block word
fails the gate. A moving program also passes with a swept tap through the stream: SMALL ROOM with its swept line
forced out (`--force 34`; the split itself keeps every moving read local). The 7 programs that need no stream (5, 30,
40, 41, 56, 76, 77) keep `verify.py`. The 69 include the slow Leslies (8, 39, 67), which had no host test before, and
the pitch shifts, which found a bug in the earlier prototype: two labels of the pitch tick, `qvTQ` and `qvTQF`, where
dsp_asm put the first's address into the second, so the tick went astray when the phase reached $FE. Both gates now
refuse a label inside another.

**The gated and onset programs, gate held open (26 November 2026).** `extract_lfo.mjs --signal` runs the firmware with
the gate's detector reading "signal" all the time (pin P3.2 held low). Then every gate stays at its open level and no
onset restarts a sweep, so each of those programs is a plain sweep or pitch shift, and its firmware program after every
tick still matches the reconstruction. All 13 that leaves pass the same gates: 3 GATED REVERB, 23-27, 28 and 29
FLANGE/GATE, 32 TWITCH FLANGER, 86-88 through `verify_stream.py`, and 31 TRIGGER FLANGE, which needs no stream (ring
468 words), through `verify.py`. They stream 48-352 halfwords in and 32-144 out a frame. This proves the code of their
open form only: the gate's own work (a window every 16 ticks, hold and release) and the onset restart are not in the
engine, and the detector they need is hardware (README, "The gate"). Their cycles have not been traced. So 89 of the
90 programs run bit-exact, 13 of them as their open form; 73 VERB SHIFTER is the one left (below).

**The split** (`qvs.Plan`). A read at delay D (from `qvc.analyse`) can take its word from SDRAM when D is at least 16 ×
LAT, the channel's round trip in samples. A greedy pass streams the reads that free the most ring words per transferred
halfword (an in-word counts twice, as it costs two cycles), from the farthest end of each line, until the ring and its
tables fit 15,870 words; a second pass then takes back any streaming the budget no longer needs. A streamed line keeps
its head in the ring: 16 samples, or up to its longest read that stays. Reads of one line less than 16 apart share a
window. Every factory program but the gated ones fits:

| | Halfwords a frame to the DSP | from the DSP | Ring (words) |
| --- | --- | --- | --- |
| 76 programs (69 stream) | median 96, at most 352 | median 64, at most 144 | 79 (1.5 s delay) to 15,772 |

The earlier estimate (README, Memory: median 224, worst 560 each way) streamed whole lines, a 16-word run for every
read. The plan is the same for every latency from 2 to 32 frames: the reads that move are all far longer.

Per kind (the 69 that stream; `qvs.py --all` lists every program), with cycles a sample by interlock_scan's model on
the traced proc, one instance, blocks 1 to 32 for a moving program:

| Kind | Programs | Ring (words) | In | Out | Proc, average | Dearest block | Of it, the copies |
| --- | --- | --- | --- | --- | --- | --- | --- |
| sweep | 54 | 444-15,772 | 16-352 | 16-144 | 207-310 | 214-316 | 6-57 |
| static | 4 | 79-15,681 | 16-215 | 16-80 | 234-248 | 234-248 | 6-36 |
| pitch shift | 6 | 12,879-15,417 | 64-128 | 64-96 | 220-287 | 226-293 | 16-25 |
| Leslie | 5 | 13,963-15,567 | 32-128 | 32-96 | 259-274 | 267-282 | 10-25 |

**The transfer plan**, fixed per program. In-block (ColdFire to DSP, read in frame k): each window's run of W
halfwords, newest first. Out-block (DSP to ColdFire, written in frame k): each streamed line's 16 new head words, newest
first, then one word per moving window. The ColdFire keeps a ring per streamed line (a power of two above its longest
read plus the latency: 2,048 to 81,920 halfwords an instance, median 36,864) and builds in-block k from out-blocks up to
k − LAT. Its whole work a frame is copying 6 to 31 runs (median 11), each contiguous in its ring: no arithmetic but
the moving windows' start. `qvs.ColdFire` is that model; it refuses to read a sample it has not received.

In the DSP's ring, a window is a region read and written only relative to the sample pointer, like a line: its run
lands at the frame's start, newest word at the region's head, and the read at line delay D reads local delay 15 + D −
Dmin. As the pointer walks down 16 words, each word is read before the region above takes it, and the region below
never reaches it. So the step code is unchanged; only its addresses move.

**Moving reads.** A streamed swept tap gets a window that moves with it. The DSP publishes the tap's address in every
out-block and keeps the last LAT values. At frame k both sides take the value published at frame k − LAT and start the
run at its delay plus `lo`, where `lo` and `hi` bound the drift of every tap in the window from the published one over
LAT + 1 frames. The generator finds them over the LFO's whole cycle, with the most ticks that fit that span. So W = 16 +
hi − lo, and the region holds every start the run can take (the sweep's range plus W). The copy writes at the region's
offset for this frame's start; the tick code and the step code are as before.

The other way, the ColdFire running the same LFO, would need only the drift within one frame. The windows come out
almost the same: 19-22 halfwords against 19-20 (a pair needs 17), on every moving read long enough to stream, because
the sweeps move only a few samples over five frames. Publishing was chosen: it costs one word out and one or two in a
window, and it keeps a second copy of the modulation, with the tick timing to stay in step with, off the ColdFire. A
missed frame or an unexpected pick cannot leave the two out of step.

**The DSP code** (`qvs.stream_code`, through hooks in `qvc.assemble_text`):
- **Which call.** An a=0 call starts a split frame; an a=1 call ends every frame. The frame's first call copies the
  in-block in, before anything else; the a=1 call copies the out-block out at its end. A frame split by a trig is
  copied once each way.
- **In: two cycles a halfword.** The halfword lands in bits 0-15 with bits 16-23 unknown (on the unit, reported set in
  every word), so it cannot go through an accumulator move: `mpy x0,y1,a` with y1 = $80 leaves exactly h << 8 in a0,
  whatever bits 16-23 hold, and `move a0,y0` takes it to the Y store. An XY move cannot store a0, so a halfword is two
  instructions: `mpy x0,y1,a x:(r3)+,x0 y0,y:(r5)+` and `move b0,y0`, a and b in turn so no move reads an
  accumulator the instruction before wrote. No `rep`; the static windows sit side by side in the ring, so they are one
  run, in a DO loop.
- **Out: one cycle a halfword.** `mpy y0,x0,a a,x:(r3)+ y:(r5)+,y0` with x0 = $008000 floors the word to its top 16
  bits in a1's low bits, and stores the accumulator it computed two instructions earlier. The last read of a line skips
  to the next line's head with `(r5)+n5`.
- **State.** In the r7 block's free words after the coefficients (and after the LFO's words): FLAG, LAST, the two
  block addresses, and per moving window its address and the last LAT published ones. The most a program needs is
  four words, plus five per moving window at LAT 4.

| Program | Ring | In / out | Body | Copy in | Copy out | Proc, average | Dearest block |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 10 SMALL ROOM | 15,526 | 208 / 96 | 206.0 | 27.6 | 8.6 | 275.3 | 281.2 |
| 10, its swept line streamed (`--force 34`) | 15,343 | 228 / 113 | 206.0 | 32.8 | 9.9 | 282.1 | 288.1 |
| 15 Concert Hall 1 | 15,582 | 247 / 80 | 201.9 | 32.5 | 7.3 | 275.4 | 281.5 |
| 66 HOLMES' Plate | 15,170 | 352 / 144 | 213.0 | 45.6 | 11.6 | 303.5 | 309.5 |
| 53 BALLAD SNARE 2 (the dearest) | 15,114 | 352 / 144 | | | | 310 | 316 |
| 43 1500 ms DELAY | 79 | 16 / 16 | 213.0 | 3.6 | 2.9 | 233.6 | 233.6 |
| 6 PINGPONG DELAY | 111 | 32 / 32 | 212.0 | 5.6 | 4.0 | 235.7 | 235.7 |

Cycles a sample. The copies cost 2.1-2.5 cycles a halfword in and 1.3-2.0 out, the setup, the frame test and each
line's skip included. Every program stays under 400: 207-310 on average, 316 in the dearest block.

### What the base must provide
- **Blocks each way, every frame**, per instance: up to 352 halfwords to the DSP (median 96) and up to 144 from it
  (median 64). The unit's measured budget (probes A and B on the owner's MKII, 26 November 2026) is per core and
  shared by every instance on it: 160 each way passed a 5-minute soak, the frame interrupt's unmask then coming at
  worst at 328 µs of the 363 µs frame; reads alone passed at 256 (worst 319 µs). The frame interrupt, not memory or
  DMA, is the limit. A transfer costs about 0.07 µs a halfword (4.8 µs for 64, 11.2 for 160, 17.7 for 256, either
  way), so a median instance adds about 7 µs in and 5 out a frame, the dearest about 23 and 10 (extrapolated past 256).
  One instance a core fits 160 each way (proven both ways) in 59 of the 76 programs, and 256 (proven for reads; writes
  ran to 160) in 68; the 8 plates (17-19, 52, 53, 66, 78, 79) need 336-352 in. Several Quadraverbs on one core, or the plates, need a channel
  that carries more a frame (not run: 384, 560, both ways at 560) or spreads its transfers over the frame. Core 0's
  free run in each bank (X:$x1840-$x1f7f, 1,856 words) holds the blocks of four median instances, not four dearest.
- **Where.** In the frame's bank, both blocks: the in-block written by the ColdFire for the frame that reads it, the
  out-block read after the frame that wrote it, as probes A and B do on the unit (A sends at state 7 into the bank the DSP
  reads next frame; B reads at the next frame's state 0 the bank the DSP wrote). The engine reads the two addresses from r7
  words at the frame's first call (MBIN, MBOUT); how the base names them per FX2 position is open.
- **Words.** In: the halfword in bits 0-15 (probe A on the unit); bits 16-23 are ignored. Out: the halfword in bits
  0-15, as probe B reads it (intact on the unit at 64-256).
- **A fixed latency** of LAT frames: in-block k built from out-blocks up to k − LAT, every frame, none dropped. Assumed
  LAT = 4 (64 samples). By the probes' timing the shortest is 2: an out-block written in frame k − 1 is read at frame
  k's state 0, and state 7 of the same frame sends into the bank of frame k + 1. The engine is generated for one LAT;
  the split is the same for any LAT from 2 to 32 frames, only a moving window's W and FIFO depend on it.
- **Rings** per instance: 2,048 to 81,920 halfwords (4 to 160 KB), cleared at the pick, with the frame count starting
  at the engine's first call. A first call that starts mid-frame (an effect added at a trig) shifts both sides' sample
  count by the same amount, so it needs nothing more (by reasoning; `dsp_host` does not model that call).
- **The plan** from the generator: per window its line, W and start (a constant, or the published word's offset), per
  streamed line its ring.

**Assumed or not done:**
- LAT = 4, the in-block's junk bits, the block addresses handed over in r7 words: assumptions, listed above.
- The words crossing SDRAM are floored to 16 bits, not rounded: rounding (`mpyr`) would need a clamp at +full scale.
- The copies take 59-194 P words a program (median 126); the copy out could fold into DO loops too.
- The streamed engine has not run on a unit (the FX2-only development builds have, [TESTING.md](TESTING.md#on-the-unit)); the channel ran there only as probes A and B, on core 0, up to 160-256 a frame.

### Word width: the input to the owner's decision

**Decided (owner, 26 November 2026):** 24-bit words in the DSP ring, floored to 16 bits only where a word crosses
SDRAM. It is an assumption, labelled as one: nothing records the original's width.

`widths.py`, 2 s of the integer model on the original's addresses, against all words at 24 bits: "stream" floors the
words that cross SDRAM (what the engine runs), "all 16" floors every store. The largest difference / its RMS, in dB
below full scale, beside the 24-bit output's peak:

| Program | Noise 0.1: peak | stream | all 16 | Impulse 0.25: peak | stream | all 16 |
| --- | --- | --- | --- | --- | --- | --- |
| 10 SMALL ROOM | -29 | -90 / -96 | -57 / -58 | -32 | -90 / -93 | -59 / -59 |
| 11 MEDIUM ROOM | -29 | -92 / -98 | -57 / -58 | -38 | -92 / -97 | -59 / -59 |
| 12 LARGE ROOM | -29 | -91 / -97 | -56 / -57 | -40 | -91 / -96 | -55 / -56 |
| 13 SMALL HALL | -28 | -84 / -88 | -53 / -54 | -44 | -84 / -88 | -57 / -58 |
| 14 MEDIUM HALL | -29 | -84 / -89 | -51 / -52 | -45 | -84 / -89 | -54 / -55 |
| 15 Concert Hall 1 | -28 | -78 / -81 | -50 / -51 | -45 | -83 / -88 | -52 / -54 |
| 16 Concert Hall 2 | -35 | -79 / -82 | -50 / -52 | -54 | -84 / -88 | -54 / -56 |
| 17 SML VOCALPLATE | -24 | -87 / -91 | -72 / -74 | -37 | -87 / -91 | -76 / -78 |
| 20 LO DIFUZ CHMBR | -25 | -87 / -94 | -46 / -47 | -38 | -88 / -94 | -46 / -47 |
| 22 KINGS CHAMBER | -32 | -88 / -95 | -52 / -53 | -59 | -88 / -95 | -48 / -49 |
| 1 PRE EQ REVERB | -28 | -82 / -86 | -46 / -47 | -45 | -82 / -87 | -52 / -54 |
| 52 BALLAD SNARE 1 | -26 | -86 / -90 | -57 / -58 | -40 | -86 / -90 | -60 / -61 |
| 66 HOLMES' Plate | -23 | -80 / -84 | -35 / -36 | -39 | -79 / -81 | -42 / -43 |
| 78 VELOCITY+REVRB | -26 | -90 / -95 | -49 / -50 | -27 | -94 / -96 | -71 / -72 |
| 6 PINGPONG DELAY | -27 | -97 / -108 | -82 / -90 | -24 | none | -104 / -153 |
| 43 1500 ms DELAY | -30 | -108 / -118 | -82 / -91 | -27 | none | -92 / -140 |

On noise, flooring only the words that cross SDRAM stays 43-74 dB below each reverb's output peak (-78 to -93 dBFS).
Flooring every store stays only 12-59 dB below it (-35 to -72 dBFS), within 30 dB in most reverbs and 12 dB in
HOLMES' Plate. Its error hardly changes between noise at 0.1 and 0.3, so it does not scale with the signal: probably
the floor's downward bias, which the tanks' filters and feedback gather (not analysed further). Noise at 0.3 gives
the same picture (`widths.py` prints it). Neither is a claim about the original's width.

## The development build (26 November 2026)

`qvc.generate(unit=True)` wraps the prototype's code in what a unit needs and `dsp_host` does not model: the ring
cleared 1,024 words a call with the wet silent until it is clear, init and a stale state set up through one
subroutine, MIX on knob F (exact at 0 and 127), and the dispatcher's r6 and n7 given back (`qvc.USTATE`). `engine/qvunit.py`
writes one program's engine and builds its package; `engine/verify_unit.py` holds the generated file to the integer
model (MIX values, splits, a dirty Y, two instances, a stale state, the guard). It costs about 15 cycles a sample more
than the prototype: 214.7 (221.6 dearest) for 5 STEREO FLANGE, 240.6 for 40 and 56. The builds, figures and the unit
procedure: [TESTING.md](TESTING.md).

## Not settled

- **The gate's detector:** an envelope on the DSP, threshold and time constant assumed (README, "The gate").
- **The stream's base side**: the channel's latency, mailboxes and core 1 ([what the base must provide](#what-the-base-must-provide)).
