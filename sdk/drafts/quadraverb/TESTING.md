# Quadraverb DEV testing

Development builds only: one factory program compiled into the engine, MIX on knob F, nothing else. They exist to
measure the compiled engine's DSP cost on a unit and to listen to it, before any base work ([ENGINE.md](ENGINE.md)).
Never published. Record what you ran, on which build and which unit, and what you saw; "not tested" is a valid answer,
and emulator runs stay apart from hardware ones.

## The builds

Each package is built on the developer's computer from the owner's own ROM image; neither the generated engine nor
the package enters the repository. `engine/qvunit.py gen` writes the program's `engine.asm` to
`~/.cache/modwerk-local/quadraverb/engine/pkg/<program>/` and copies it into `gen/`, which `.gitignore` ignores (and
so does every staged copy of the draft, which carries that file). `qvunit.py build` runs
`npm run module:dev -- quadraverb --build-only --slots fx2 --cycles 260 --cycles-kind modeled --state 132 --buffer 15870`
into `~/.cache/modwerk-local/quadraverb/pkg/`.

```sh
export PATH=~/.cache/modwerk-local/node/bin:$PATH
P=~/.cache/modwerk-local/quadraverb/engine/programs.json
cd sdk/drafts/quadraverb/engine
python3 -B qvunit.py gen $P 40 && python3 -B verify_unit.py $P 40 && python3 -B qvunit.py build 40 --cycles 260
```

`build` packages whatever `gen` wrote last, so run the two for one program before the next. The three builds share one
module identity (quadraverb): try one at a time.

| Package | Program | Chooser name | Ring (words) | DSP words | engine.asm SHA-256 | Package SHA-256 (26 Nov 2026) |
| --- | --- | --- | --- | --- | --- | --- |
| `qv-dev-5.mwrm` | 5 STEREO FLANGE (moving: a stereo sweep) | QV DEV 5 | 13,066 | 856 | `80df4a44…` | `28817e0e…` |
| `qv-dev-40.mwrm` | 40 167 ms DELAY (static) | QV DEV 40 | 7,062 | 874 | `719ec947…` | `63b4b667…` |
| `qv-dev-56.mwrm` | 56 SKANK GUITAR (static) | QV DEV 56 | 8,031 | 884 | `d399e8d2…` | `3561a4bd…` |

What a unit build adds to the prototype's code (`qvc.generate(unit=True)`, `qvc.USTATE`):

- **The ring cleared over calls**, 1,024 words a call, not in init. Until it is clear the engine does not run and the
  wet is silent: 7, 8 and 13 calls (under 5 ms). A clearing call costs about 1,280 cycles, a third of a playing one.
- **init and a stale state through one subroutine.** init reads the slot's buffer base (X:$213), then sets up the
  tables, the state and the clear. A proc that meets another build's state (the signature at r7+$0c differs; stock
  runs init only when a slot's effect id changes) sets up afresh from the kept base, as Midiverb does.
- **MIX** (knob F): out = floor((wet m + dry (128 − m)) / 128), m = MIX + (MIX ≥ 64), so 0 is the dry alone and 127
  the wet alone, exactly. The knob word is masked (`and #>$7f0000`) for an LFO's low bits. The dry L and R go to 32 Y
  words after the tables while the input pass averages them.
- **The dispatcher's registers given back:** r6 (the parameter page) and n7 (the count) are restored at the end of
  every call (the body uses n7 for the input word, r6 as a chain); m4-m6 back to linear.
- **Inside the buffer:** the ring, its distance table and the dry scratch end within the first 15,870 words (block 3's
  rule and Sidechain's key window); the r7 block stays within $00-$83 (the highest used is $80).

## Emulator (dsp_host)

`engine/verify_unit.py` on the generated file (26 Nov 2026), each program: the file is what the generator makes now;
labels, assembler traps and every operand as written; then bit-exact against the integer model at MIX 127 (noise,
two impulses), MIX 0, MIX 64, MIX 100 with an LFO's low byte in the knob word, trig splits at frames 1, 5, 7 and 13
(MIX 90), a Y full of garbage before init (the spread clear), two instances (the second split at 7, MIX 64), a state
another build left at the first call, and dsp_host's guard over the instance's 15,870 words (no stray write, no
clobber). All pass for 5, 40 and 56.

Cycles a sample, interlock_scan's stall model on the traced proc (`--cycles` with the `-steptrace` dsp_host), one
instance, 16-frame blocks, MIX 127. A model calibrated idle on an MKII, not a measurement:

| Program | Proc, average | Dearest block | The body | Executed a sample (dearest) | Before (the prototype, no MIX) |
| --- | --- | --- | --- | --- | --- |
| 5 STEREO FLANGE (32 blocks, 48 ticks of 151-155 cycles) | 214.7 | 221.6 | 165.0 | 194.4 | 199.5 / 206.4 |
| 40 167 ms DELAY | 240.6 | 240.6 | 213.0 | 228.6 | 225.4 |
| 56 SKANK GUITAR | 240.6 | 240.6 | 212.9 | 226.6 | 225.4 |

The unit build costs about 15 more than the prototype: the mix pass (8 instructions a sample) and the knob and state
work of each call. dsp_host's meter, the worst block of 16,000 samples including init's table writes: 228.7 (5),
274.9 (40), 231.2 (56) executed instructions a sample; init runs once, about 700 instructions. Declared to the base:
260 modeled cycles, charged at 7/4 (455) until a hardware figure replaces it; one instance must fit 726.

Not seen in dsp_host: that the real dispatcher accepts what proc gives back (by inspection), the unit's Y wait states,
the frame interrupt's share, and the sound on a unit.

## On the unit

Not tested. The procedure for the owner and the developer (the agent does not drive the unit for these builds):

**Base.** Any base with the USB loader from 0.8.1 takes the package (no ColdFire code, no hook, no base-bound part:
a DSP effect of 856-884 words, 132 state words, a 15,870-word FX2 buffer). Use 0.8.2 or later: on 0.8.1 the first NO
after a pick on FX2 SETUP closes only the memory box. `try` works on the flashed 0.8.2 or the 0.8.3 development twin.
`device:price` needs a development twin (its guard request): run it on the 0.8.3 twin.

**Link.** `while [ -f scripts/device.mjs ]; do npm run device -- serve --share /tmp/modwerk-share.sock; sleep 1; done`
from a checkout that stays ([driving the Octatrack](../../../docs/OCTATRACK_DRIVING.md)). Device commands take their
turn on the unit by themselves (`npm run unit -- status`).

**1. Listen (about 5 minutes a build).** Leave the CF card in. A drum loop or a short melodic part on T1, transport
stopped, then:

```sh
npm run device -- try ~/.cache/modwerk-local/quadraverb/pkg/qv-dev-40.mwrm --seconds 300 --socket /tmp/modwerk-share.sock
```

T1, FUNC+FX2, turn LEVEL to QV DEV 40, YES, then FX2 for its page (one knob, MIX on F, default 64). Play. Listen for:

- 40 167 ms DELAY: the input itself, then repeats 7,015 samples apart (159 ms here, 167 ms at the original's 42 kHz),
  each about 13 dB quieter than the last (the model's impulse response); MIX 0 exactly dry, 127 the program alone.
- 5 STEREO FLANGE: a slow stereo flange sweep, the two sides moving apart; 5 % faster than the original.
- 56 SKANK GUITAR: a resonant, filtered ring that lasts about a second after a hit (the model's impulse response).
- On every build: no click when it is picked (the dry stays at its mix for the first few ms while the ring clears), no
  crackle, no DC thump, no noise when the input stops; other tracks unchanged; the CPU meter steady. A second
  instance on T5 FX2 (the other core) sounds the same.

The trial rolls back by itself after 300 s or on Ctrl-C. Do not Keep a development build.

**2. Price (about 10 minutes a build, on the 0.8.3 twin).** Select a busy pattern (trigs on several tracks), leave the
transport stopped, T1 FX2 on a stock effect, then:

```sh
npm run device:price -- --slot T1 --fx-name 'qv-dev-40=QV DEV 40' --memory \
  --out ~/.cache/modwerk-local/quadraverb/price-40.json ~/.cache/modwerk-local/quadraverb/pkg/qv-dev-40.mwrm
```

(`--socket` and `--share` default to the session's sockets of a `serve --share /tmp/modwerk-share.sock`; the same for `qv-dev-5` with `QV DEV 5`, and `qv-dev-56` with `QV DEV 56`). It presses PLAY and STOP itself, reads
the frame interrupt, the CPU meter and both DSPs before the build, installed and used nowhere, and in use on T1 FX2,
then picks T1's effect back and rolls the trial back. No `--write`: these figures are for the engine, not a release.
What to read: the in-use DSP T1-4 mean and peak against the reading before. By Midiverb's ratio (397 executed
instructions a sample took about 17.8 points of core 1) the model predicts about 10 points; the 7/4 charge assumes up
to 1.74 times the model. Add `--curve T1,T2` to read a second instance on the same core if the first is clean.

**Abort at once, and tell the owner, on any of:** a frozen screen or keys, audio stopping or stuck on one sample, the
DSP stall or skipped-track lines in the trial's verdict (`npm run device -- do diaglog`), a refusal other than
cycles or memory, or the trial neither starting nor being refused. A freeze needs the owner's power cycle: never
try the next build on a unit that froze until it has had one. A refusal for cycles (loader refusal 6) or memory is
not a freeze: note it and stop.

## Stock flows

Not tested.

## Sound quality

Not tested: `npm run fx:audit` (aliasing, DC, clipping, idle) was not run. The wet path is the original program's,
at 44.1 kHz with 24-bit words; the mix of two words cannot clip.

## Performance

No `evidence/performance.json`: a development build. The model's figures are above; the unit's come from step 2.
