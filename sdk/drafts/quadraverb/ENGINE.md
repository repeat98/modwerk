# Quadraverb engine: design (draft, 26 November 2026)

Status: design, a pricing prototype, and a bit-exact prototype of the generator: five static programs and two moving
ones (stereo sweeps) run in `dsp_host` bit for bit against an integer model, and the pitch shift, a single-pair sweep and
a Leslie do on a larger host-only ring ([below](#the-first-bit-exact-prototype-26-november-2026),
[modulation](#modulation-on-the-dsp-26-november-2026)). Nothing has run on a unit.

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
| Copying the SDRAM lines in and out | about 25 median, up to about 70 (estimate, from the full-rate stream sizes) |
| Block overhead | about 3 |
| **Total** | **about 350 median, about 425 worst (estimate)** |

The prototype below measures the steps far lower: 164-231 (median 205), the proc around them about 12.5 more.

So 400 looks reachable for most programs; the dearest need the stalls scheduled away (reordering a write's copy of A
away from the step that computes it) or a cheaper stream copy. Code: 248-287 program words a program, plus 96 X and
about 100 Y table words, per instance.

## What it needs from the base

- **A program's code changes at a pick.** The base must write it into the module's arena while the effect plays:
  two code areas per instance, written while the other runs, switched at a frame boundary. The base's WRITE path
  already places engine code into unused arena words while playing (docs/OCTATRACK_RESIDENT_ENGINES_ON_DEMAND.md);
  switching a running slot's code is new.
- **The SDRAM stream** at full rate: a median of 224 and at most 560 halfwords a frame each way per instance. Probe A
  passed on the unit at 64, 128 and 160 (26 November 2026); probe B (reads, larger blocks) is being built.

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
- No stream: only programs whose lines fit the buffer. The modulation is below.
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
in `dsp_host` too. So the slow Leslies (8, 39, 67: 38,750 words and more) have no host test; their code differs from
38's only in the rotors' rate and depth.

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

**Left out:** the gated programs (3, 23-29, 73, 86, 87) and the sweeps a signal onset restarts (28, 29, 31, 32, 88).
Both need the signal detector. Also left out: VERB SHIFTER (73, gated), the Leslie's speed switching, and the MIDI
modulation offsets on rate and depth.

**Cheaper ticks.** A sweep's tick costs about 154 cycles (19 of them stalls), a Leslie's about 367 (36). Most of it is
two-word instructions: long immediates and displaced moves. Not optimised yet: the sweeps' distances could be written
straight from the displacement (each is a constant plus 0, 1 or 2 times it), and the Leslie's taps could skip the
scratch words.

## Not settled

- **Word width and saturation.** The engine stores 24-bit words in the DSP ring; the stream carries 16 bits. Whether
  to round every store to 16 bits (about 1 cycle a write) for one behaviour throughout is open. Either way it is an
  assumption, labelled as one: nothing records the original's width. SKANK GUITAR's resonant filters amplify
  truncation (above): with 16-bit words the integer model departs from the float model by -46 dBFS on quiet noise.
- **The gate's detector:** an envelope on the DSP, threshold and time constant assumed (README, "The gate").
- **Moving reads through the stream.** A streamed line that a moving read takes from needs a copy window covering
  the read's whole sweep (up to ±255 samples): not designed yet. Every moving program but 5 and 30 needs the stream.
- **A reverb through the stream**, bit-exact.
