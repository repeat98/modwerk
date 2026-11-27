# The models

Each synth track has one generator. Encoder A picks the model and B-H shape it; the ranges and
defaults are in the [README](README.md#controls).

All three read the track's NOTE, ROOT and SCALE, so a line stays in the key you set. Whatever you
hear can be kept: YES writes the page you are on into the track as ordinary trigs.

## EUCL (Euclidean)

A Euclidean rhythm spreads a number of hits as evenly as possible over a circle of steps. Three
over eight is the tresillo, five over sixteen is a rotation of the bossa nova figure, and ROT
moves where the pattern starts against the kick. MUTINY adds a scale degree, accents, a fill
layer and a riff.

With FILL above zero there are ghost hits at half velocity between the main ones. With RIFF above
zero the hits start taking neighbouring notes in the scale, so the rhythm turns into a melody.

- STEP is the size of the circle. 65 follows the track's own length, up to 64.
- HITS is the number of hits. It can't exceed STEP, so raising STEP again brings extra hits back.
- ROT rotates the figure, two detents per step.
- DEGR moves the melody up the scale, and RIFF works from that degree.

Try STEP 8, HITS 3 for a tresillo, STEP 16, HITS 7, ROT 3 for a figure that pulls against the
beat, or STEP 8, HITS 3, FILL 40 for something sparse with movement between the hits.

## TURI (Turing Machine)

Tom Whitwell's Turing Machine is a shift register that loops: a fixed run of random bits repeats,
and each time round there is a chance that a bit flips. Each pass stays close to the last one, and
LOCK sets how close.

At LOCK 100 it repeats note for note, which is the setting for writing something down. Lower LOCK
lets each pass change a little more; near zero it no longer sounds like a loop.

- LOOP is the length of the loop. 17 follows the track's own length, up to 16.
- DENS is how many steps play a note; 100 plays every step. RANG is the octave range, one to three.
- ROT rotates the loop and TRNS transposes it in scale degrees.
- Tap H for a new line with the same settings. Hold H to freeze the pass you are hearing, so you
  can catch one before it moves on.

LOOP 8, DENS 70, LOCK 100 gives a line to commit. LOCK 85 lets it change slowly while it plays, and
LOCK 40 lets it wander while you work on another track.

## TB3P (TB-3PO acid line)

TB3P is a port of TB-3PO from the Phazerville suite for Ornament & Crime. It writes lines the way a
TB-303 plays them: a monophonic sequence of notes, each with an accent flag and a slide flag. It
runs from a 16-bit seed: the same seed and settings always give the same line.

With SLID low you get a straight, staccato bassline. With SLID high almost every note glides into
the next one without a new attack. Accents are louder and, with VELOCITY MOD set up, brighter.

- LEN is the length of the line. 33 follows the track's own length, up to 32.
- GATE is how much of the line has notes: 0 is nearly empty, 7 nearly full.
- PTCH is the pitch spread: 0 stays on one note, 8 uses the full range. TRNS transposes by -7 to
  +7.
- SLID is the share of notes that slide into the next.
- ACNT is the accent strength, as a velocity boost plus a lock on filter FREQ and AMP VOL.
- SEED is the line itself: one seed per detent, eight on a fast turn. The default is 44061
  (`0xAC1D`).

The default seed with SLID 50 and ACNT 60 is a usable line straight away. Raise SLID to 70 for a run
of slides, or drop GATE to 3 for a sparse one. Slides only work with the sound set up for them;
the README lists the [settings](README.md#setting-up-the-sound-for-tb3p).

## More than one track

Every synth track has its own generator, so a project can run four different lines at once. YES and
NO act on the track and page you are on, which lets you commit one track while the others keep
generating. Commit a page on one track and answer it on another, or let a TURI line drift over a
bassline you already fixed.

Settings belong to the project, not the pattern: switching from A01 to A02 keeps the same settings
on every track, and YES writes into the pattern that is playing.
