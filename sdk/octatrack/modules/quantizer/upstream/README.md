# octatrick-modules

Six firmware modules for the Elektron Octatrack (OS 1.40C, MKI and MKII),
written for [sambanks/octabam](https://github.com/sambanks/octabam)'s build
system. **This repository is the source of truth for the modules**: octabam
consumes it as a git submodule (`modules/<name>/upstream`, pinned to a tag),
and the ready-to-build fork below does the same.

[![Octatrick demo video: the FM synth, scale quantizer and direct jump running on a real Octatrack MKI](https://img.youtube.com/vi/1DqUzvs8J3U/maxresdefault.jpg)](https://www.youtube.com/watch?v=1DqUzvs8J3U)

**Demo video:** [Octatrick running on a real Octatrack MKI (YouTube)](https://www.youtube.com/watch?v=1DqUzvs8J3U)
-- the FM synth, scale quantizer and direct jump in use. Click the picture
to watch.

## The modules

- **`synth/`** (key `SYNTH MACHINE`) -- a two-operator FM synth machine:
  **FM SYNTH is a machine of its own in the track's machine list** (since
  2.10: FUNC + SRC, or SELECT MACHINE TYPE -- no sample or marker file
  needed; see "Selecting FM SYNTH from the machine list" in
  [synth/README.md](synth/README.md); until 2.14 a FLEX track whose sample
  was named FMSYNTH*.wav or SYNTH*.wav also became a synth -- since 2.15 that
  marker file is a sample like any other, and the machine list is the way in),
  with its own PLAYBACK page (PTCH RATO INDX FINE
  FDBK DEC: PTCH in semitones, -64..+63, FINE in cents -- 0c the moment a
  track becomes a synth track), and on PLAYBACK SETUP
  VOIC (1 = mono, 2..4 = paraphonic: the most voices the track sounds
  at once, keys and chords alike) and CHRD (32 chord shapes as four-note
  voicings in priority order, in Syntakt order since 2.8 -- the triads MIN
  MAJ SU2 SU4, the sevenths and adds, the rest, the two-note intervals
  last (a CHRD byte saved by 2.7 names another shape) -- each at four
  detents -- the root position
  and three inversions (MIN MIN1 MIN2 MIN3 MAJ ...): VOIC 2 / 3 / 4 plays
  2 / 3 / 4 notes of any shape, a new chord replaces the last; lockable
  per step, snapped to SCALE); a voice is 1/sqrt(VOIC) of the mono voice,
  equal power; since 2.9 there is no limiter (a full 4-note chord sits
  about 6 dB above a single note and never clips). A chord fingered on the CHROMATIC keys or over MIDI IN
  during live recording (VOIC 2..4, CHRD "----") is recognised and
  recorded as locks on the first key's step -- keys within a rolling 150
  ms of each other, at any tempo; PTCH the bass, CHRD the shape AND its
  inversion (an exact voicing match first, the pitch classes second), VOIC
  the voices that were heard; a legato hand-over (the earlier key lifted
  within 50 ms) records single notes instead; two keys in one panel scan
  both sound; and one key is one voice: a second START for a held key (a
  bounce, the recorder's own copy under the finger) no longer doubles the
  note. The CHROMATIC keyboard of
  a synth track spans octaves -4..+4 (FUNC + LEFT/RIGHT). The engine is
  a DRAM unit in octabam's sample-RAM reserve (10 MB off the sample pool);
  the page is a pinned ROM cave whose FM SYNTH descriptor is a runtime
  clone of the stock FLEX record, built in the unit's RAM on first use --
  the repository carries no byte of the stock record. The AMP SETUP page
  (FUNC + AMP) of every audio track has a sixth box, LEG -- the legato
  switch, a Part byte saved with the project (a stock Part reads OFF; set
  MONO for the legato GLIDE used to give): OFF / MONO on a sample track
  (MONO: a key over a held key changes the pitch without a retrigger, and
  since 2.8 a FLEX or STATIC track with LEG MONO and GLIDE SLIDES every
  pitch change -- a legato key, a trigless trig's PTCH lock, the knob, an
  LFO -- over the GLIDE time, a sample trig starting at its own pitch),
  OFF / MONO / POLY on a synth track: MONO is legato at VOIC 1, POLY at
  any VOIC -- a key played over a held chord slides the sounding chord to
  its new voicing (or, with no shape, the newest voice), no retrigger,
  recorded as a trigless trig; GLIDE is the slide time only, everywhere.
  In GRID RECORDING, a placed trig held + FUNC + DOWN / UP moves that
  step's PTCH lock an octave down / up (every held trig; clamped -64..+63;
  a step without a lock starts from the Part's PTCH), the page showing the
  new value; with no trig held FUNC + UP / DOWN is still the trig-mode
  selector, as it is on every sample track.
  Since 2.11 the rows after PICKUP are a table the remix fills (FM SYNTH
  always, SY DRUM when the remix has it) and SELECT MACHINE TYPE scrolls
  when there are more than six rows. Since 2.12 a machine change resets
  the track's machine parameters (PLAYBACK, PLAYBACK SETUP, AMP, LFO and
  their SETUP pages) to the new machine's init; step and scene locks are
  kept, as in the stock firmware; FX slots are kept. This applies to a
  change to or from FM SYNTH or SY DRUM (either list; until 2.14 also a marker file);
  a stock machine's init is a new project's; a change between stock
  machines is stock's. Since 2.15 a selection guard keeps a Part within what
  the unit's processor can play: at most 2 SY DRUM tracks, 1 FM SYNTH track,
  or FM SYNTH with 1 SY DRUM track -- both lists and copy / paste refuse more,
  with a message (limits from PROCESSOR LOAD readings on the author's MKI).
  `synth/README.md`.
- **`sy-drum/`** (key `SY DRUM`, since 2.11; requires `SYNTH MACHINE`) -- a
  drum machine in the machine list, the row after FM SYNTH: a two-oscillator
  percussion voice with a sweep, a filter opened by the decay, six modes
  (PTCH MODE WDTH SWEP SPED DEC, stock p-locks, LFOs and scenes) and a
  dedicated LFO / S&H on its PLAYBACK SETUP page (LSPD LDEP WAVE S&H), each
  of the four lockable per step: hold a trig in GRID RECORDING and turn, or
  turn while LIVE RECORDING; the locks follow copy / paste / clear / shift
  and are saved in companion files beside the project's banks
  (`sylockNN.work` / `.strd`, the author's development builds' format, so a
  project moves between them with its locks). One voice a track, at most two
  SY DRUM tracks in a Part (since 2.15); no sample or marker file. It runs on SYNTH MACHINE's engine (one
  DRAM unit beside it, a 2 MiB lock table in the platform reserve, 53 stock
  hooks of its own). `sy-drum/README.md`.
- **`quantizer/`** (key `SCALE QUANTIZER`) -- a SCALE row in PROJECT >
  CONTROL > SEQUENCER (24 scales): the PTCH knob, parameter locks and
  CHROMATIC trig keys snap to the scale; a GLIDE row, the synth's slide
  time (the legato switch is the track's LEG setting on every audio track:
  the quantizer's key hooks ask the synth engine); live recording on synth tracks writes the played note
  length as an AMP HOLD lock and hands every recorded key to the synth
  engine, which records fingered chords; on synth tracks the quantizer works in the
  synth's semitone units and gives the CHROMATIC keyboard its -4..+4
  octaves. SCALE and GLIDE live in the unit's
  battery-backed RAM (`0x100b14ec` / `0x100b14ed`), so they survive a power
  cycle like the stock project settings do (since v10; before, they came
  back OFF at every power-on although SAVE had written them to the project
  file). Since Octatrick 2.9 a ROOT row (C..B, `0x100b14ee`) under SCALE:
  the scale is built on the root -- knob, locks, keys and the synth's chord
  snap all read one root-rotated mask, and key 1 of the CHROMATIC keyboard
  sounds the root -- and the unit itself is a DRAM unit of the platform
  runtime: only a 192-byte core (the boot clamps, the defaults, the mask)
  and the two pinned stubs stay in the OS image. Since 2.13 the MIDI tracks
  follow SCALE and ROOT too: the NOTE knob and NOTE locks step through the
  scale, and the MIDI CHROMATIC keyboard plays the scale from the root.
  Since 2.15 what a MIDI track plays follows the scale as well -- the
  chord notes NOT2..4, TRAN and the arpeggiator's notes are snapped to the
  nearest scale note on their way out (the offsets stay semitones; two
  chord notes that land on one note sound once) -- and rows MIDI 1 SCALE
  .. MIDI 8 SCALE (ON / OFF) take a MIDI track out of the scale, for a drum
  machine (battery RAM `0x100b14ef`; MIDI IN thru and the auto channel's
  direct play stay stock). Since 2.22 the per-track switches (MIDI and,
  since 2.19, AUDIO) are two rows: TRACK picks the track (AUDIO 1..8, MIDI
  1..8; not saved, AUDIO 1 at power-on) and FOLLOW is its ON / OFF, the
  same bits and project-file lines as before. `quantizer/README.md`.
- **`direct-jump/`** (key `DIRECT JUMP`) -- CHAIN AFTER gains a DIRECT option
  (option 2 of the list): a pattern chosen while the sequencer runs starts
  at the next step, at the step count the old pattern had reached. One ROM
  cave on the pattern-queue setter, two pokes. `direct-jump/README.md`.
- **`tuner/`** (key `TUNER`) -- hold UP and press TEMPO: a tuner window for
  the current audio track (note, octave, a +-50 cent needle, Hz) from the
  track's post-FX pre-fader audio, detected on the ColdFire (McLeod NSDF +
  YIN refine, integer only) in the UI task; TEMPO, YES, NO or the chord
  close it, and TEMPO alone, FUNC + TEMPO and UP alone stay stock. One DRAM
  unit, three detours, no ROM cave. `tuner/README.md`.
- **`processor-load/`** (key `PROCESSOR LOAD`) -- how busy the ColdFire
  is making audio, in the stock TEMPO popup: `47%`, the mean share of
  real time spent in the audio frame interrupt over the last quarter
  second, timed on the stock DMA timer 3; `!` from 70 %, `--%` while there
  is no fresh reading, and with FUNC held `W112`, the longest single block
  of the quarter second in % of a block's 362.8 us. Standalone (no USB, no
  other module); it conflicts with octabam's CF METER and TEMPO BUS. One
  DRAM unit, four detours, one poke. `processor-load/README.md` says what
  the number means, what it cannot see (the DSPs, the UI, the card, USB)
  and its limits.

Each directory is one octabam module: `manifest.py` (the declaration, in
octabam's `tools/remix/schema.py` vocabulary), the GNU-as `.s` sources, and
a README that says what was measured and what was inferred. The manifests
derive their source paths from their own location (`_HERE`), so the same
file serves at `modules/<name>/` and at `modules/<name>/upstream/<name>/`.

**No stock bytes.** The sources carry no byte sequence of Elektron's OS
beyond the displaced instructions at each hook site (octabam's
CONTRIBUTING.md, "The one rule"): `tools/stock_scan.py --stock
<octabam>/out/raw/section_3_MAIN_OS.bin` looks every data directive, hex
constant and assembled unit up in your own stock image and lists what
matches (the hook-site replays and a few call idioms the assembler shares
with the stock compiler; no data). The manifests hold no stock bytes at
all: every displaced span and every poke's stock value is read from your
OS through `stock_guard(site, length)` and asserted before anything is
written. The READMEs describe each hook site in words (its address, its
length, what the displaced code does) and quote no stock bytes or stock
instructions.

**No code at an odd address.** A ColdFire stops with an address error when
it fetches an instruction from an odd address, and neither GNU as (code
after an odd-length string or byte table) nor the emulators complain. After
`make bus` or `make image`, run from the octabam checkout

```
.venv/bin/python3 modules/synth/upstream/tools/align_check.py [--remix NAME] [-v]
```

(the remix of the last build by default). It assembles every linked unit
and source cave of the remix again with line rows, checks that they link
to the bytes the image carries, and fails if any instruction -- any code
symbol -- of them sits at an odd address, or if any detour, symbol ref, cave
hook or poke writes an odd target (or a jump into a unit that is not the
start of an instruction). Exit 0 = clean, 1 = an odd address (listed), 2 =
cannot check. Run it on every image before flashing.

## Using them

**In octabam** (merged 30 Sep 2026, sambanks/octabam PR #526): the module
folders `modules/synth`, `modules/quantizer`, `modules/direct-jump` and
`modules/tuner` are thin wrappers whose `upstream/` is this repository
(tag `v2.9`). Clone octabam with `--recurse-submodules` (or `git submodule
update --init`), follow its build guide (`docs/guide/BUILDING.md`: `make
setup`, `make os` and `make recon` with your own OS 1.40C), and

```
make image REMIX=octatrick BUILD=1 VERSION=OCTATRK2.9
```

builds the one `octatrick` remix: the four modules with markandrus's USB
MIDI and 20-channel USB audio out, Bryan T's USB audio in (the computer's
audio onto inputs A-D) and the stock effects less SPATIALIZER (its DSP
words hold the USB input). The author's own images have been built from
octabam's `main` since 30 Sep 2026.

PROCESSOR LOAD is not one of octabam's wrappers yet: copy (or link) this
repository's `processor-load/` to `modules/processor-load/` in an octabam
checkout (the manifest serves at either path) and add `"PROCESSOR LOAD"` to
a remix's `modules`.

SY DRUM is not one of octabam's wrappers yet either: copy (or link) `sy-drum/`
to `modules/sy-drum/` the same way and add `"SY DRUM"` to the remix's `modules`
beside `"SYNTH MACHINE"` (it needs the SYNTH MACHINE of the same tag). The
author's 2.11 test image was built this way on octabam's `main` of 9 Oct 2026.

**Standalone:** the manifests import `remix.schema` from octabam's `tools/`
and the build runs from octabam's repo root, so this repository is not
built on its own; it is linked into an octabam checkout.

## Status

`octatrick-usb` at tag `v9.1` (the OCTATRICK9 state; hardware-confirmed
again as OCTATRIK10 with the FM SYNTH page built at run time) was flashed
and in use on the author's Octatrack MKI (26 Sep 2026): the synth, the
quantizer and direct jump work, and USB audio works on the MKI on all 20
channels. Every test build since -- 2.3 .. 2.8 and the 2.9 line up to the
build before its last two fixes -- was flashed and tested on the same MKI
from the author's tree
([timhastie/octatrick](https://github.com/timhastie/octatrick), the same
wrappers over the same submodule); at 2.9 ROOT, the quantizer as a DRAM
unit, FINE 0c, the engine-owned AMP envelope and the limiter's removal ran
there, the held-chord crackle and the live-key pops gone, by ear; the tuner
(UP + TEMPO) works there too (29 Sep 2026). The last two 2.9 fixes (a sequencer trig on a sounding note, the index ramp) are
emulator-verified and not yet flashed; so is FM SYNTH in the machine list
(2.10, 8 Oct 2026). 2.15 (the selection guard, the MIDI tracks' scale)
was flashed on the author's MKI (18 Oct 2026) and works there. 2.16
(the load budget and the former LFO SETUP V/C column) was tested on Tim's
MKI on 22 Oct 2026. Tim reported that the voice cap was not shown and the
V/C speed dial could jump past the valid voice range. The 2.17 candidate
restores LFO 3 and moves VOIC/CHRD to PLAYBACK SETUP with independent step
and scene locks. PORT checks confirm the setup detents, restored LFO modulation and
GRID-lock power-cycle paths. The first candidate had a garbled CHRD label
(`R/work/r17/logs/gate6-c4-result.txt`). The 23 October bounded fix preserves the formatter
callback context and replaces the cap letter with dashes; its current disposition is
in the gate reports. The
live-recording test has a tool limitation and the emulator cannot establish a
physical crossfader sweep. The complete gate status
is in the author's `R/work/r17/REPORT.md` and `VERIFY.md`. It is not yet on a unit.
Every feature was verified in an
emulator before flashing (the companion repository
[timhastie/octa-panel](https://github.com/timhastie/octa-panel) has a
real-time build of octabam's emulator and a virtual front panel). Read
octabam's flashing notes first, power-cycle the unit after an OS upgrade,
and SAVE or SYNC TO CARD after changing project settings.

Combining with other modules: the synth page is pinned at the start of the
second free gap (`0x400d24d0`), which octabam's `tempo-bus` also uses, so
the ledger refuses that pair; the synth engine shares the sample-RAM
reserve with the other DRAM modules (USB, MIDI SCENES) inside one runtime.
PROCESSOR LOAD declares conflicts with octabam's CF METER (the same two
frame-interrupt sites) and TEMPO BUS (the TEMPO popup), and runs beside
everything in the `octatrick` remix.

## Tags

Only tagged versions are releases; the numbered builds between two tags
(2.3 .. 2.7 on the way to 2.8, the 2.9 builds before the tag) were test
builds on the author's unit and were never tagged.

- 2.17 (local candidate; PORT checks with limitations, not yet on a unit): LFO 3 is restored on
  FM SYNTH. VOIC and CHRD move to PLAYBACK SETUP and have separate step and
  scene locks in `fmlockNN.work` / `.strd`. The voice cap uses `--1` and mono CHRD uses `----`,
  and legacy voice/chord defaults and locks migrate out of LFO storage at
  project load. Scene selection switches at the crossfader midpoint.
  The 23 October candidate also appends VOIC/CHRD to FM LFO destinations as
  native PMTR values 30/31, with private application and note-start latching.
  PMTR retains native Part-byte storage and is not trig-lockable. Existing
  VOIC/CHRD step locks feed the LFO offset. See `synth/README.md` and the fix reports.
  The synth owns the shared lock-hook dispatch; SY DRUM keeps its existing
  independent storage and handlers. The quantizer reads effective VOIC
  through the synth's existing published reader. These two small
  integration changes are the approved exceptions to the original
  unchanged-module requirement. Other modules are unchanged.
  `R/work/r17/logs/hook-inventory.txt` records the detours: synth **119**,
  SY DRUM **2**, quantizer **24**, tuner **3**, processor-load **4**; synth
  also has **3** symbol references and **1** source cave, direct-jump **1**
  source cave. The PORT setup/LFO and GRID-lock persistence checks are
  emulator-verified; the first candidate's garbled CHRD label
  (`R/work/r17/logs/gate6-c4-result.txt`) is addressed by the 23 October formatter fix. Live recording and the physical
  crossfader retain the limits described in `synth/README.md`. This candidate
  is not ready to flash. See `R/work/r17/REPORT.md` and
  `VERIFY.md` for the complete gate status. Nothing has been pushed.

- 2.16 (tag `v2.16`, 18 Oct 2026): THE LOAD BUDGET -- TWO FM SYNTH TRACKS IN
  A PART -- AND THE LFO SETUP PAGE NAMES LFO 3'S COLUMN V/C ON AN FM SYNTH
  TRACK. 2.15's guard counted tracks (one FM SYNTH track at most). 2.16
  replaces its three counting rules with one price per Part: an FM SYNTH
  track costs by the voices that may sound on it (4 / 9 / 10 / 12 points at a
  voice cap of 1 / 2 / 3 / 4), an SY DRUM track 11, 15 are paid once when the
  Part holds any of the two and 13 once when it holds FM SYNTH, and the Part
  must fit 54 -- points of PROCESSOR LOAD's worst block above an empty
  project, fitted to twelve readings on the author's MKI (18 Oct 2026, 2.14,
  every synth track playing four-note chords); the ceiling is the worst
  block of about 88 the author has run on his unit. The engine then CAPS the
  FM voices so the Part fits: the largest cap in 4, 3, 2, 1 whose cost fits,
  and every FM SYNTH track plays min(VOIC, cap) voices -- VOIC 2, 3 and 4 act
  as the cap (the shape's first notes, the same stealing order and level per
  voice), the VOIC shown stays the one set. What a Part may hold: two FM
  SYNTH tracks at four voices each (2.15 refused the second); two FM SYNTH
  and one SY DRUM, both FM mono; one FM SYNTH and two SY DRUM, the FM mono;
  one FM SYNTH, with or without one SY DRUM, unchanged at four voices; two SY
  DRUM unchanged. Refused, with the message: a third FM SYNTH track (`FM
  SYNTH: 2 MAX`), a third SY DRUM track (`SY DRUM: 2 MAX`), and two FM SYNTH
  with two SY DRUM (`FM+SY DRUM: LIMIT`). Both lists, COPY / PASTE TRACK, the
  PLAYBACK page's paste, the Part paste, their undo and the FLEX preview
  apply the one rule; a project saved by an older build with more loads and
  plays as saved, every FM SYNTH track mono. The cap is cached per Part in
  the synth unit and checked at every voice START against the Part's own
  machine bytes and marks (about 50 instructions), so a machine change, a
  paste, a Part or pattern change, PART RELOAD, a bank change or a load is
  seen at the next note with nothing hooked for it. The weights and the
  budget are one table (`synth/machine_limits.inc`) and can be retuned after
  a reading on the unit.

  AND: on an FM SYNTH track the third LFO is muted and its SPD / DEP bytes
  are the track's VOIC and CHRD (the LFO page already prints them so), but
  the LFO SETUP page (FUNC + LFO) still showed an "LFO 3" column whose SPD
  and DEP dials turned VOIC and CHRD over the stock 0..127 without saying so.
  Now, on an FM SYNTH track, the LFO SETUP page's third column reads V/C, its
  SPD box is VOIC (1..4, as the LFO page's) and its DEP box is CHRD (the
  chord-shape names); the two LFO columns stay LFO 1 / LFO 2, the LFO
  designer is unchanged, and on SY DRUM tracks, stock tracks and MIDI tracks
  the page is byte-identical to 2.15 (the V/C label is drawn by the FM
  track's own page draw over the stock's; no string of the OS is renamed or
  repointed, so no other page can show it). The four LFO-only boxes (PMTR /
  WAVE / MULT / TRIG) are left as stock there (LFO 3 does nothing on an FM
  track). This is a display and naming change of one page: storage, the step
  and scene locks, the LFO destination list, the engine and the renders are
  untouched.

  Hooks at 2.16: SYNTH MACHINE 62 detours (58 at 2.15: four more for the LFO
  SETUP window's descriptor) and 3 symbol refs (as 2.15), SY DRUM 53, SCALE QUANTIZER 24 detours + 3 tables
  + 1 poke, TUNER 3, PROCESSOR LOAD 4 + 1 poke, DIRECT JUMP its cave; the
  stock instructions every detour and poke displaces were checked against OS
  1.40C (148 sites, 144 at 2.15). SY DRUM, SCALE QUANTIZER, TUNER, DIRECT
  JUMP and PROCESSOR LOAD are 2.15's. Emulator-verified, not yet on a unit.
  Known: with the cursor on the DESIGN row of LFO SETUP (or in the designer) the third row reads
  LFO 3, not V/C, until the cursor moves; the label only (2.17).

- 2.15 (tag `v2.15`, 16 Oct 2026): A SELECTION GUARD FOR FM SYNTH AND
  SY DRUM, AND MIDI TRACKS THAT PLAY IN THE SCALE. FM SYNTH and SY DRUM
  render their sound on the main processor; with too many of them it runs
  out of time and the unit freezes. Both machine lists now refuse a choice
  that would take the active Part past 2 SY DRUM tracks, 1 FM SYNTH track,
  or FM SYNTH with more than 1 SY DRUM track, and say why in the
  firmware's message box (`SY DRUM: 2 MAX`, `FM SYNTH: 1 MAX`,
  `FM+SY DRUM: LIMIT`); the track keeps its machine and nothing is
  written. The limits are final: they come from PROCESSOR LOAD readings
  on the author's MKI running 2.14 (everything the guard allows stays at
  or below a worst block of about 85 % in an empty project, leaving about
  15 points for a real one). Copy / paste that carries a machine is
  guarded the same way -- COPY TRACK / PASTE TRACK, the SRC page's paste,
  the Part paste and their undo: a paste past the limits is refused whole,
  nothing written, the clipboard kept. The 2.10 marker file
  (`FMSYNTH*.wav` / `SYNTH*.wav` on a FLEX track) selects nothing any more
  -- it plays as a sample, and FM SYNTH is chosen in the machine list --
  so every FM voice is one the guard counted. A project or Part saved
  with more (2.14 and before had no limit) loads and plays as saved;
  choosing a stock machine is always allowed. Every Part writes what 2.14
  writes and survives a power-off without SAVE as in 2.14. SY DRUM's
  recovered-locks message now fits the message box (`SY LOCKS
  RECOVERED`; the 31-character line before was never drawn). On the
  MIDI tracks, what a track plays now follows SCALE and ROOT: the chord
  notes NOT2..4, TRAN, and the arpeggiator's notes and RNGE octaves are
  snapped to the nearest scale note where the sequencer sends them (the
  offsets stay semitones; two chord notes that land on one note sound
  once; the note-off is for the note sent, so nothing hangs), and so is
  the chord GRID RECORDING previews with a [TRIG] key + YES. Rows MIDI 1
  SCALE .. MIDI 8 SCALE (ON / OFF, PROJECT > CONTROL > SEQUENCER, saved
  with the project) take a MIDI track out of the scale, for a drum
  machine; with SCALE OFF, or a track's row OFF, the track is stock. MIDI
  IN thru and the auto channel's direct play stay stock. Hooks at 2.15:
  SYNTH MACHINE 58 detours (52 at 2.14: six more on the paste stores,
  their undo and the FLEX preview), SY DRUM 53 (unchanged), SCALE
  QUANTIZER 24 detours (22: the note stage and the preview), three grown
  row tables (3 + 11 entries) and one poke, TUNER 3, PROCESSOR LOAD 4 and
  one poke, DIRECT JUMP its cave; the stock instructions every detour and
  poke displaces were checked against OS 1.40C (144 sites, 136 at 2.14).
  TUNER, DIRECT JUMP and PROCESSOR LOAD are 2.14's. Flashed and in use
  on the author's MKI (18 Oct 2026).
- 2.14 (tag `v2.14`, 12 Oct 2026): SY DRUM ONLY -- ITS STEP LOCKS SURVIVE
  A POWER-OFF WITHOUT SAVE. From the author's test of SY DRUM on his MKI:
  PLAYBACK SETUP locks (LSPD LDEP WAVE S&H) edited while the pattern
  played came back without those edits after a power-off with no SAVE
  PROJECT, while the PLAYBACK locks always came back. Stock keeps the
  current bank in battery-backed memory and writes its own working files
  only while the sequencer is stopped; the step locks' working files
  (`sylockNN.work`) were written by that same save, so a power-off while
  playing, or within about a second of STOP, found them behind. They are
  now written while the sequencer plays too, at most once every 60 UI
  ticks (1.2 s) and only while a lock edit is unwritten (one hook more, on
  the UI tick's transport test: 53). A lock edited less than about 1.2 s
  before a power-off can still come back without that edit; SAVE PROJECT
  closes that. And the step-lock files are now read whenever a project
  loads: before, one stock bank file of the project that was missing, cut
  short or damaged (stock shows its message, starts that bank empty and
  loads the project) left every bank without its step locks. The synth,
  SCALE QUANTIZER, TUNER, DIRECT JUMP and PROCESSOR LOAD are 2.13's;
  `v2.13` stays the release of the quantizer on MIDI tracks and the one
  Modwerk's FM Synth 0.1.5 is built on.
- 2.13 (tag `v2.13`, 12 Oct 2026): SCALE QUANTIZER ON MIDI TRACKS. With
  a scale on, a MIDI track's NOTE knob steps to the next note of the scale
  built on ROOT (as PTCH does on an audio track), NOTE locks do the same
  (a held trig in GRID RECORDING, and LIVE RECORDING), and the MIDI
  CHROMATIC keyboard plays the scale from the root -- key 1 sounds the
  root, every key the nearest scale note, the number beside the keyboard
  reads the root's name ("A 3"); the note-off, the arpeggiator's input and
  the live recorder take the same note. NOT2..4, TRAN, the arpeggiator's
  own notes and MIDI IN are stock in this version (an option for them to
  follow the scale, and a per-track switch that exempts a MIDI track from
  it, came in 2.15; program a drum track with SCALE OFF on 2.13 / 2.14); SCALE
  OFF is stock; no new setting, projects unchanged. A FIX FOR EVERY TAG SINCE 2.9: entering
  CHROMATIC mode on a MIDI track froze the unit (2.9 .. 2.12: the keyboard
  drawer's octave hook sat where stock's MIDI branch jumps into it); the
  hook now sits at the drawer's common push, the form Modwerk's bundled
  quantizer has carried since it found the bug (Modwerk #264; thanks to
  the Modwerk contributors). tools/align_check.py checks builds on current
  octabam again (the modules bound to the remix's settings,
  `registry.bound`). The NOTE knob's hook sits just before the knob's
  store, not on it, so octabam's MIDI SCENES (which hooks that store) can
  be built into one remix with the quantizer. The synth, SY DRUM, TUNER,
  DIRECT JUMP and PROCESSOR LOAD are unchanged.
- 2.12 (tag `v2.12`, 11 Oct 2026): two fixes from the author's test of
  2.11 on his MKI (as Modwerk's FM Synth 0.1.4). THE METRONOME NO LONGER
  CUTS A HELD NOTE: a held note no longer cuts out at every metronome click;
  the engine had taken the click word for a STOP. With the metronome on and
  the sequencer playing, a held CHROMATIC key or chord on an FM SYNTH (or SY
  DRUM) track was released at the next click as if it had been let go -- at
  REL INF cut within 5 ms -- and every sequencer note at the first click
  after it. Since 2.9 the engine had hooked the metronome's click word; the
  hook is gone, 0x4000b2c8 is stock, the click still sounds, and STOP still
  ends the voices at the stock voice kill. A MACHINE CHANGE RESETS THE
  TRACK'S MACHINE PARAMETERS TO INIT: a machine change to or from FM SYNTH /
  SY DRUM resets the track's machine parameters to the new machine's init;
  step and scene locks are kept as in the stock firmware; FX slots are kept.
  When a track's machine changes to or from FM SYNTH or SY DRUM -- in SELECT
  MACHINE TYPE, SRC SETUP or through a marker file -- its PLAYBACK and
  PLAYBACK SETUP pages, AMP and AMP SETUP, the three LFOs and LFO SETUP (FM
  SYNTH: VOIC 1, CHRD off) take the new machine's init, the values a new
  project gives a track (read from the OS's own page records); FX1 / FX2
  stay. No machine parameter inherits from the machine before (2.11 kept the
  FM values in the FLEX page and every AMP and LFO setting). The step locks,
  scene locks and SY DRUM's lock rows stay with the pattern and the Part, as
  stock keeps its locks at a machine change. A change between stock machines
  is unchanged, and so is a project load: 2.10 / 2.11 projects load as they
  were saved. GRID STEPS AND PLAYED NOTES, THE SAME LEVEL (no level
  changed): a grid trig, a held key and a live-recorded trig of the same
  note at the same VOIC were measured equal (within 0.01 dB RMS and peak);
  steps sound softer only by design -- through AMP HOLD (it gates sequencer
  trigs, not held keys), VOIC (a voice is 1 / sqrt(VOIC) of the mono voice,
  so a single step at VOIC 4 is 6 dB below a played four-note chord) or a
  same-pitch repeat at VOIC 2..4 summing with its own release tail --
  explained in synth/README.md. Everything else plays as on 2.11 (the FM
  harnesses' PCM, the click cards and SY DRUM's renders are unchanged; the
  machine lists show the same rows). Emulator-verified, not yet on
  hardware.
- 2.11 (tag `v2.11`, 9 Oct 2026): two new modules and the machine list
  they share. THE MACHINE LIST for more than one machine: the rows after
  PICKUP are a table filled per remix (FM SYNTH, then SY DRUM), the six
  row-count / row-bound pokes became detours that read the row count, and
  SELECT MACHINE TYPE scrolls (its six visible rows show the seventh). With
  FM SYNTH alone every list behaves as 2.10's and the engine
  (`synth/poly.s`) is byte for byte 2.10's, with 2.10's 6 dB of headroom
  (VOL 0 the reference, VOL up to about +6 clean); SYNTH MACHINE declares
  the conflict with ANALOG BD (the same chooser sites). SY DRUM
  (`sy-drum/`, requires SYNTH MACHINE): a drum machine in that list; the
  quantizer treats a SY DRUM track as a synth track (semitone PTCH, the
  keys), mono. Projects saved by 2.10 load unchanged (the FM SYNTH mark is
  the same three bytes). SY DRUM's PLAYBACK SETUP controls (LSPD LDEP WAVE
  S&H) lock per step as on the author's development builds -- GRID and LIVE
  RECORDING, the held-trig display, copy / paste / clear / shift -- with the
  same companion files (`sylockNN`, version 2), written only for banks that
  hold a lock; SY DRUM declares the conflicts with KITS and PLOCKS P2 (the
  same stock sites) and with STEM REC (the platform reserve does not hold
  both modules' buffers). With no SY DRUM track in the Part its per-frame
  work is a test, the SETUP controls' read and the LFOs' phase (they keep
  running, as with a SY DRUM track). FM SYNTH has no setup controls on this
  line and is unchanged. PROCESSOR LOAD (`processor-load/`): the ColdFire's
  audio-interrupt load in the TEMPO popup (the TEMPO meter of the author's
  diagnostic test images, made standalone: its own UI tick, started by the
  stock startup flag, no USB; FUNC held shows the longest block); it
  declares the conflicts with CF METER and TEMPO BUS. Both are
  emulator-verified, not yet on hardware.
- 2.10 (tag `v2.10`, 8 Oct 2026): FM SYNTH in the machine list,
  four synth changes and three fixes. FM SYNTH is the sixth row of SRC SETUP
  (FUNC + SRC) and of SELECT MACHINE TYPE on every track: it plays with no
  sample and no marker file (the chooser adapted from Modwerk's FM Synth
  module, MIT); the marker files still work. A stock or older build reads such
  a track as a plain FLEX track: choose FLEX or STATIC before downgrading. The
  quantizer of the same tag is needed for CHROMATIC keys on such a track.
  The DEC knob puts HOLD at 127, the last position on the right (the index
  holds); 0 is the shortest decay (prints `0`) and 1..126 are unchanged. A
  saved DEC 0 (was HOLD) now decays at once; a saved 127 (was 2.0 s) now holds. The
  note-start click is gone: every attack lasts at least one carrier period
  and is S-shaped (attacks below C3 are slower: C1 reaches full level in
  31 ms, C3 in 9.4 ms), a pitch change on a sounding mono note crossfades, a
  stolen voice fades over a period, and a chord-memory or stolen voice that
  must move UP fades out first and starts its note cold (that note starts up
  to one period of the old note late). LFO SETUP's destination list on a synth track names
  the FM SYNTH page's parameters (PTCH RATO INDX FINE FDBK DEC ...) and
  steps over SPD3 / DEP3 (VOIC / CHRD). A held CHROMATIC key sustains and
  releases at the key-up; HOLD gates sequencer trigs only. The fixes, after
  the author's test of the first 2.10 build on his MKI: a note restarted
  while it still sounds (a quick re-press, a trig on its own tail) no longer
  clicks at a short DEC (the index envelope restarts and the index ramps over
  at least one carrier period, where DEC 0 dropped it within a frame); a
  second key inside a paraphonic voice's fade no longer drops the first
  key's note; a live-recorded legato phrase no longer goes silent at its
  first trigless step on playback. And the engine leaves 6 dB of headroom
  (the author's decision, 8 Oct): the mono voice and each paraphonic voice
  are 6.02 dB lower, so VOL 0 is the reference and VOL up to about +6 stays
  clean (not Modwerk 0.1.2's 18.06 dB).
- `v2.9` -- Octatrick 2.9 (29 Sep 2026): a ROOT row under SCALE (the scale
  is built on it; battery RAM `0x100b14ee`); the quantizer as a DRAM unit
  (a 192-byte core stays in the OS image); FINE 0c the moment a track
  becomes a synth track; no limiter; the engine owns the AMP envelope (no
  pops, no crackle; a voice is never cut); a sequencer trig on a sounding
  note delivered in the panel key's form; the index envelope ramps at a
  warm START. The line up to the build before the last two fixes ran on
  the author's MKI; the last two fixes are emulator-verified.
- `v2.8` -- Octatrick 2.8 (28 Sep 2026): MIDI IN on synth tracks, chord
  recording with inversions, LEG legato modes, sample-track glide, step
  transpose, the TUNER module, SCALE / GLIDE in battery-backed RAM, the
  tuning system (PTCH in semitones, FINE in cents), `tools/stock_scan.py`.
  Flashed and tested on the author's MKI through the test builds 2.3 .. 2.8.
- `v9.1` -- the OCTATRICK9 state with the FM SYNTH page built at run time
  (no stock bytes in the repository; hardware-confirmed as OCTATRIK10), the
  manifests' source paths location-independent. The history starts here:
  no commit carries stock OS bytes.

## Credits

- [Sam Banks](https://github.com/sambanks) -- octabam: the build system,
  the ledger, the DRAM platform, the emulators and the gates these modules
  are written against; and the CF METER probe, whose two frame-interrupt
  sites and DMA-timer-3 method PROCESSOR LOAD's measurement uses.
- [Maxolydian](https://github.com/mxldyn/octamax) -- octamax, the reverse
  engineering of the OS format, memory map and parameter tables that made
  any of this reachable.
- Bryan T ([bryantysinger](https://github.com/bryantysinger)) -- the EMAC
  notes in octabam's firmware documentation (the `objdump -m m68k:cfv4e`
  route for the EMAC regions radare2 cannot decode, `docs/remixer/
  TOOLING.md`), which the synth's EMAC rate arithmetic was written against.
- [markandrus](https://github.com/markandrus/octemu) -- USB MIDI and USB
  AUDIO, carried in the `octatrick-usb` remix.
- Modwerk contributors ([repeat98/modwerk](https://github.com/repeat98/modwerk),
  MIT) -- the FM SYNTH machine chooser: the sixth machine row in SRC SETUP and
  SELECT MACHINE TYPE, the `FM`, 1 Part signature, the Part-validator guard
  and the sample-free START / source path, adapted from Modwerk's FM Synth
  module (derived from its Analog BD chooser hooks, Sam Banks' MIT notice) and
  ported to this repository's manifests; and the CHROMATIC drawer fix for
  MIDI tracks (Modwerk #264: the quantizer's octave hook at the drawer's
  common push), taken into the quantizer at 2.13. Their notices are in [LICENSE](LICENSE).

## Unofficial

Not affiliated with, endorsed by or supported by Elektron. No firmware is
distributed here: every image is built on your machine from your own copy
of OS 1.40C, and modifying your unit's firmware is outside Elektron's
licence terms and warranty. Back up your projects before flashing.

## License

[MIT](LICENSE), Tim Hastie 2026, for this repository's own code and
documentation. The FM SYNTH machine chooser (`synth/machine.s` and its parts of
`synth/poly.s`, `synth/page.s` and `quantizer/quantizer.s`) is adapted from
Modwerk's FM Synth module under its MIT notices (Copyright (c) 2026 Modwerk
contributors; Copyright (c) 2026 Sam Banks), reproduced in [LICENSE](LICENSE).
It does not extend to Elektron's firmware, nor to octabam, which is Sam
Banks's under its own MIT licence.
