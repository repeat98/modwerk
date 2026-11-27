# MUTINY

Eurorack-style sequencers on the Elektron Digitone mk1.

MUTINY is a custom firmware mod for the Digitone mk1 on OS 1.44. It adds three generative
sequencers from the modular world to the synth tracks: a Euclidean rhythm, a Turing Machine and a
TB-303-style acid line. You play them from the encoders, and YES writes what you hear into the
pattern as ordinary trigs.

> [!WARNING]
> MUTINY is an unofficial custom mod. It is not made, supported or endorsed by Elektron. It replaces
> the firmware on your instrument with a modified build, and that can go wrong: the unit can hang,
> refuse to start until you recover it, or lose project data. I give no guarantee that it works and
> accept no responsibility for damage or lost work. You install it at your own risk. Recovery
> needs a computer, Elektron Transfer and your original OS file. Back up your projects and Sounds
> first, and read [Install](#install) before you flash anything.

## Why

Modular sequencers are small machines with a few knobs that make patterns instead of storing them.
Patch a few together and the music moves on its own. Getting back to a good moment is
hard, though, because the only record of it is where the knobs were.

On an Elektron, everything you make is in the pattern and comes back when you load the project. You
play it with one control per function, and YES and NO decide what stays.

MUTINY builds the first idea into the second. Each model is a self-contained module with seven
controls, plugged into a synth track. Its seed and controls are saved with the project, and when
you like what you hear you commit it to the pattern as normal trigs. Each encoder does one thing,
the change is audible right away, and commit and undo are one key press each. That makes the
generators repeatable and something you can perform with.

## What it is, and what it isn't

MUTINY is:

- a mod you build with [Elekloader](https://github.com/elekloader/elekloader) from your own copy
  of Elektron's OS 1.44;
- three generators (EUCL, TURI, TB3P) on synth tracks T1-T4, one per track;
- a preview you can play and shape without touching your pattern, and an explicit commit: nothing
  is written until you press YES, and NO takes the last commit back.

MUTINY is not:

- an official Elektron feature or update, or something Elektron will help you with;
- for the Digitone Keys, the Digitone II or any OS other than 1.44;
- a new page in the stock menu system: it is an overlay on the TRIG page;
- per pattern: its settings are saved once per project;
- a finished, validated release (see [Status](#status)).

## Status

Version 0.2.1, experimental.

- **Hardware:** I tested it for about an hour on my own Digitone mk1 running OS 1.44, going through
  every feature: the three models, page commits and undo, project save and reload, pattern switches
  and four tracks generating at once. I found no bugs beyond the [known limits](#known-limits).
  That covers one unit and one session; yours may behave differently.
- **Software:** the host test suite (C under AddressSanitizer and UndefinedBehaviorSanitizer, plus
  an engine equivalence test) runs in CI. The mod builds and passes Elekloader's lint against the
  stock OS 1.44 file, core-dn1 4.1 and seq-events 0.1. I also ran it in the
  [digiemu](https://github.com/irpina/digiemu) emulator, including next to digitables; that test
  setup is not part of this repository.
- **Not done:** other units, long sessions, other mods on hardware, and a measured timing margin on
  the hardware.

Please report what you find at <https://github.com/mbaumannn/mutiny/issues>.

## The models

- **EUCL** spreads a number of hits evenly over a circle of steps: a tresillo, a bossa nova
  figure, a pattern that shifts against the beat.
- **TURI** is a looping shift register. A short line repeats and changes a little on each pass, or
  stays exactly the same when LOCK is at 100.
- **TB3P** plays a TB-303-style acid line with slides and accents, from a 16-bit seed.

All three follow the track's NOTE, ROOT and SCALE, so a line stays in the key you set.
[MODELS.md](MODELS.md) describes what each one sounds like and where to start.

## Quick start

1. Install it (see [Install](#install)) and open a project you don't mind changing.
2. On synth track 1, press TRIG PARAMETERS on the TRIG page, then turn encoder A to EUCL.
3. Start the transport and turn C (HITS) and D (ROT). Press YES when you hear something you want to
   keep. NO takes it back.

EUCL at STEP 8, HITS 3 is a tresillo; the default STEP 16, HITS 5 is a rotated bossa nova figure.
For an acid line, turn A to TB3P and follow
[Setting up the sound for TB3P](#setting-up-the-sound-for-tb3p).

## Performing with it

Press TRIG PARAMETERS on the stock TRIG page to open MUTINY, and press it again to go back. Opening
it never writes anything. MIDI tracks are left alone: on a MIDI track the page does not open.

While a model is on, the track plays the generated line. Turning a control changes the line, not
your pattern.

YES commits one page: the sixteen steps the sequencer keys are on become ordinary trigs, and the
track plays those. So a 64-step pattern is built in passes. Let TB3P run, commit page 1, tap H for a
new line, move to page 2 and commit the answer. Pages 3 and 4 can repeat the call or break it.
Meanwhile the next track keeps generating against the trigs you fixed, so one line holds still
while another moves. NO undoes the last commit and nothing else.

## Controls

A is always MODEL; three detents move to the next model. B-H are the model's seven
controls.

| Key | Action |
| --- | --- |
| TRIG PARAMETERS | open the page from the stock TRIG page; press again to go back |
| Track key 1-4 | select the track and show it on the page |
| Encoder A | MODEL: OFF, EUCL, TURI, TB3P |
| Encoder B-H | the model's controls |
| YES | commit the page the sequencer keys are on |
| NO | cancel the preview; after a commit, restore the track as it was |
| FUNC + YES / FUNC + NO | the stock temporary save and reload, unchanged |
| Encoder H, tapped | a new line from the same settings (a new source, or on TB3P a new seed) |
| Encoder H, held | TURI only: freeze the current pass until you let go |
| Track key, held | hands the screen back and opens Elekloader's Mod Menu |

Hold an encoder and press NO to reset that control to its default, as on a stock page. H is the
exception, because tapping and holding it already do something. The tables give the detents per
value. Fast turns speed up the 0-100 controls, STEP, LEN and SEED; the others always move at their
table rate.

### EUCL (Euclidean)

| Knob | Range | Default | Detents per value | What it does |
| --- | --- | --- | --- | --- |
| B STEP | 1-65 | 16 | 1 | steps in the circle; 65 follows the track's length, up to 64 |
| C HITS | 0-64 | 5 | 2 | hits spread over them, never more than STEP |
| D ROT | 0-63 | 0 | 2 | rotation of the pattern |
| E DEGR | 0-14 | 0 | 2 | scale degree of the melody |
| F ACNT | 0-100 | 0 | 1 | accent strength |
| G FILL | 0-100 | 0 | 1 | ghost hits between the main ones |
| H RIFF | 0-100 | 0 | 1 | gives hits their own notes, walking the scale; adds no trigs |

### TURI (Turing Machine)

| Knob | Range | Default | Detents per value | What it does |
| --- | --- | --- | --- | --- |
| B LOOP | 2-17 | 8 | 2 | loop length; 17 follows the track's length, up to 16 |
| C DENS | 0-100 | 70 | 1 | how many steps play a note; 100 plays every step |
| D RANG | 1-3 | 1 | 8 | octave range |
| E ACNT | 0-100 | 0 | 1 | accent strength |
| F ROT | 0-15 | 0 | 2 | rotation |
| G TRNS | 0-14 | 0 | 2 | transpose in scale degrees |
| H LOCK | 0-100 | 85 | 1 | 100 keeps the loop; lower lets it drift, one pass at a time |

### TB3P (TB-3PO acid line)

| Knob | Range | Default | Detents per value | What it does |
| --- | --- | --- | --- | --- |
| B LEN | 1-33 | 16 | 1 | steps in the line; 33 follows the track's length, up to 32 |
| C GATE | 0-7 | 5 | 4 | how much of the line has notes; 0 is nearly empty, 7 nearly full |
| D PTCH | 0-8 | 8 | 4 | pitch spread; 0 stays on one note, 8 uses the full range |
| E SLID | 0-100 | 50 | 1 | share of sliding notes |
| F ACNT | 0-100 | 60 | 1 | accent strength |
| G TRNS | 0-14 | 7 | 2 | transpose, -7 to +7 |
| H SEED | 0-65535 | 44061 | 1 | the 16-bit seed (`0xAC1D`); eight seeds per detent on a fast turn |

#### Setting up the sound for TB3P

A 303 line glides and skips the attack on a slide, so the sound has to be monophonic and legato. On
the track TB3P plays, open SOUND SETUP (FUNC + TRIG PARAMETERS) and set:

| Setting | Value |
| --- | --- |
| PLAY MODE | MONO LEG. (required: a slid-into note then does not attack again) |
| MONO NOTE PRIO | LAST |
| PORTAMENTO > TYPE | TRACK |
| PORTAMENTO > SLOPE | CONSTANT TIME |
| PORTAMENTO > AMOUNT | 100 |
| PORTAMENTO > STYLE | GLIDE |
| PORTAMENTO > GATING | OFF |

In TRIG PARAMETERS with no trig held, set LEN to 0.5, the 303's half-step gate. Keep it under one
step, or every note runs into the next and the whole line plays legato. Leave PORT and PTIM alone:
TB3P locks PORT on every note it plays and PTIM on the notes a slide enters. A good start is
VELOCITY MOD to FLTR ENV, FLTR FREQ and AMP VOL, a 4-pole lowpass with some resonance, and a short
filter envelope.

Accents are a higher velocity plus a lock on the filter's FREQ and the AMP page's VOL, which is why
an accent is heard even on a slid-into note.

## Committing

YES writes the page you are on, clipped to the track's length. A page past the end of the track has
nothing to write and is refused. Nothing outside that page changes.

- A generated note writes its note and velocity and clears the trig condition.
- An accent adds a FREQ and VOL lock, based on the sound's current values.
- Every note gets a PORT lock (on when a slide enters it, off otherwise), and a slid-into note also
  gets PTIM.
- A generated rest removes the note trig and leaves the step's other locks alone.

MUTINY builds the whole new track before it writes anything, then reads every byte back. If the
pattern changed in the meantime the write is refused, and if the readback is wrong the previous
bytes are restored.

NO after a commit puts the previous track back and resumes the generator. Once you have edited the
track yourself after the commit, NO refuses, because restoring would overwrite your edit.

## Saving

Settings are saved with the project, not with the pattern. They take one 116-byte record (`MUT2`)
in the project data area that Elekloader's core provides; stock OS 1.44 keeps that area through
save and load without reading it.

- Loading a project brings back each track's model and controls, and TB3P's line exactly.
- EUCL and TURI keep their controls and seed but rebuild their line on load, so a TURI line that has
  drifted for a long time can come back slightly different.
- A project without MUTINY data, or with a damaged record, loads with MODEL OFF on every track and
  leaves the pattern alone. The next project save replaces that record.

## Install

MUTINY is a mod for [Elekloader](https://github.com/elekloader/elekloader), a tool that builds a
custom Digitone OS from your own copy of the stock one. Mods come as `.elemod` files. You combine
them with Elekloader's web builder or its command line, and send the resulting OS to the Digitone
with Elektron Transfer, the same way as an official update. You need:

1. Elektron's Digitone OS 1.44 file, from [Elektron's support site](https://www.elektron.se/support).
   It is not included here and must not be shared.
2. The core `core-dn1` 4.1 for OS 1.44, from Elekloader's mod shop.
3. `seq-events-0.1-os1.44.elemod` from this project's release. It is Dracyr's work, included
   because it is not in the shop yet.
4. `mutiny-0.2.1.elemod` from this project's release.

Elekloader checks the stock file's hash, the core version and the dependencies. Do not bypass those
checks.

Before you flash:

- check that your unit is a Digitone mk1 (not Keys) and that SYSTEM shows OS 1.44;
- back up your projects and Sounds with Transfer, and check that the backup files are there;
- keep your original OS 1.44 file and Elekloader's
  [recovery steps](https://github.com/elekloader/elekloader/blob/main/docs/BUILDING.md) at hand;
- start in a project you don't mind losing.

To go back to stock, install Elektron's own OS 1.44 the normal way. Elekloader's documentation
explains what to do if the unit does not start.

## Building from source

You need Python 3.9 or newer, a C compiler, clang-format 23.1.4, an `m68k-elf` toolchain (binutils
and gcc), an Elekloader checkout (built and tested with commit `b893c93`), your own OS 1.44 file and
the two `.elemod` files from Install.

```sh
make test     # host C tests under sanitizers, Python tests, format check

make mod ELEKLOADER=/path/to/elekloader \
         CORE_MOD=/path/to/core-dn1-4.1-os1.44.elemod \
         SEQ_MOD=/path/to/seq-events-0.1-os1.44.elemod \
         STOCK=/path/to/Digitone_and_Digitone_Keys_OS1.44.syx
```

`make mod` checks the SHA256 of the stock file and the two mods, then builds, patches and lints. It
prints the hashes of `mutiny-0.2.1.elemod` and the patched image in `.make-work/mod/out/`. The image
I tested has SHA256 `2aa55942525cc4959275b7f4846a8761a7ee879a837b44ba06af3d05511f2e64`. Never
share the patched image: it contains Elektron's firmware.

The engine in `src/engine/` is portable C with no firmware dependencies. Everything specific to OS
1.44 is in `mods/mutiny/`, mostly `port144.*` and `len.s`.

## What it uses

| Item | Value |
| --- | --- |
| Patch sites | one: six stock bytes at `0x40094688` (the held-step LEN), replaced by a `jsr` |
| Code and data | 26,004 B |
| BSS | 69,712 B, mostly the undo copies of the four tracks (45,232 B) and the playback buffers |
| Project record | 116 B (`MUT2`) |
| Stack | 1,052 B at most in the UI tick, 548 B in draw, 40 B in the step fire |

That is about 96 kB of the 1.25 MB the core gives mods. MUTINY and digitables fit in the same
project data area, with 20 bytes to spare. The firmware's own stack size is not known, so the stack
figures are what MUTINY adds, not a margin.

## Known limits

- Settings are per project, not per pattern, and copying a pattern does not copy them.
- Synth tracks T1-T4 only.
- Twelve of the 35 scales have no intervals in the OS 1.44 table (PENTATONIC MINOR/MAJOR, BLUES,
  COMBO MINOR, PERSIAN, IWATO, IN-SEN, HIRAJOSHI, PELOG, WHOLE-HALF and HALF-WHOLE DIMINISHED,
  SPANISH). Under those, MUTINY plays chromatically rather than guess.
- A stored trig condition or probability does not gate a generated note. Stored locks and micro
  timing do apply to it.
- Setting ACNT to 0 does not remove accent locks an earlier commit wrote.
- Commit and undo recognise a pattern by its place in memory, so a different pattern at the same
  place cannot be told apart. They refuse when that changes, and undo also refuses after your own
  edit.
- No per-pattern parameter locks, no live recording and no LFO destinations yet.

## Contributing

Bug reports, model ideas and pull requests are welcome at <https://github.com/mbaumannn/mutiny>.

A model is seven controls and a render function in `src/engine/`, behind the shared page, commit
and project record. A new model needs room in the project record, which is versioned, so please
open an issue before you start on one.

## Licence and credits

MUTINY is GPL-2.0-or-later. See [LICENSE](LICENSE) and [NOTICE](NOTICE). The licence includes no
warranty of any kind.

TB3P is a port of TB-3PO by Logarhythm, modified by djphazer (MIT). TURI follows Tom Whitwell's
Turing Machine (Music Thing Modular) as an idea; no code is shared. `seq-events` is Dracyr's,
GPL-2.0-or-later. MUTINY is built on irpina's Elekloader. Elektron and Digitone are trademarks of
Elektron Music Machines.
