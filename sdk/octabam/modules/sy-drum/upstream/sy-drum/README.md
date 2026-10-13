# SY DRUM -- a drum machine in the machine list (2.11)

SY DRUM is a percussion voice for FLEX tracks: two oscillators, a sweep, a two-pole filter opened by the decay
envelope, six modes, and a dedicated LFO with sample-and-hold. It runs on SYNTH MACHINE's engine (`synth/`, key
`SYNTH MACHINE`) and is chosen in the track's machine list, in the row after FM SYNTH.

SY DRUM is modelled on the 1979 Pearl Syncussion SY-1, written from a study of that unit's circuit. It is not affiliated with or endorsed by Pearl or Behringer. Syncussion is a trademark of its owner.

The module is key `SY DRUM` and **requires `SYNTH MACHINE`** (octabam refuses a remix that has SY DRUM without it):
the machine list, the sample-free voice, the engine-owned AMP envelope, the CHROMATIC keys, MIDI IN, LEG and the
live recorder are that module's. With SY DRUM in the remix, SYNTH MACHINE assembles its calls into SY DRUM's unit
and adds the row; without it, SYNTH MACHINE is byte for byte the FM-only engine.

## Choosing it

- **SELECT MACHINE TYPE**: press the track key twice (QUICK ASSIGN), LEFT (`<< MACHINE`), DOWN to `SY DRUM` (the
  seventh row: STATIC FLEX THRU NEIGHBOR PICKUP FM SYNTH SY DRUM; the window shows six rows and scrolls), YES.
- **SRC SETUP**: hold FUNC and press the PLAYBACK (SRC) key, DOWN to `SY DRUM`, YES.

The track is stored as FLEX with `S`, `Y`, 1 in the first three bytes of its NEIGHBOR PLAYBACK column (the FM
SYNTH mechanism; synth/README.md, "Selecting FM SYNTH from the machine list"): no sample and no marker file. The
PLAYBACK page reads `PTCH MODE WDTH SWEP SPED DEC`, the title and footer `SY DRUM`, and both lists open on the
`SY DRUM` row. Choosing it on a track that does not play SY DRUM yet sets the knobs to PTCH 0, MODE A, WDTH 64,
SWEP 0, SPED 64, DEC 64 and the setup to LSPD 64, LDEP 0, WAVE OFF, S&H OFF; choosing it again keeps the patch.
Choosing any other row clears the mark. **A machine change resets the track's machine parameters (PLAYBACK,
PLAYBACK SETUP, AMP, LFO and their SETUP pages) to the new machine's init; step and scene locks are kept, as in the
stock firmware; FX slots are kept** (2.12): to or from SY DRUM, those pages get the new machine's values (a stock
machine's: a new project's) (synth/README.md, "A machine change resets the track's machine parameters"). The
choice is a Part byte like the machine: saved with the Part and the project, copied and pasted with the Part.

**Downgrading**: a build without SY DRUM reads such a track as a plain FLEX track with no sample (silent); the stock
loader then clamps its PLAYBACK / SETUP bytes into FLEX's ranges. Choose a stock machine and SAVE before flashing
such a build.

## Knobs (PLAYBACK)

| Knob | Display | Meaning |
| --- | --- | --- |
| PTCH | -64..+63 semitones | C4 at 0; the CHROMATIC keys, MIDI IN and the SCALE quantizer use semitones. |
| MODE | A..F | Triangle; exponential FM; mixed oscillators; independently swept oscillators; FM pseudo-saw; noise. The six choices are spaced evenly across the dial. |
| WDTH | 0..127 | The decay envelope opens the two-pole low-pass filter; turn left for a darker attack and tail (at C4 with no sweep or LFO, WDTH 0 sets the poles to 50 / 200 Hz). |
| SWEP | -64..+63 | Negative starts above PTCH and sweeps down; positive starts below and sweeps up; 0 is off. |
| SPED | 20 ms..1.1 s | The sweep's time constant; clockwise is longer and slower. |
| DEC | 6 ms..2.5 s | The amplitude decay's time constant at C4; higher tuning shortens it. |

These are the FLEX PLAYBACK bytes, so stock p-locks, the three LFOs and scenes reach them as on any FLEX track. An
encoder pressed gives steps of seven; with FUNCTION held a detent moves PTCH 12, MODE 1, WDTH 16, SWEP 12, SPED 16,
DEC 16. The AMP page (ATK, HOLD, REL, VOL, BAL) works as on FM SYNTH: the engine runs the envelope; a CHROMATIC key
sustains while held, sequencer trigs use HOLD.

## The LFO (PLAYBACK SETUP: FUNC + PLAYBACK)

| Encoder | Control | Meaning |
| --- | --- | --- |
| A | LSPD | Free-running LFO speed, 0.40..200.0 Hz (raw 0..64: 0.40..4.56 Hz, above it exponential to 200 Hz). |
| B | LDEP | Continuous LFO depth, 0..127; nominally +-24 semitones at maximum. |
| C | WAVE | OFF, TRI, SQR or RND. RND steps to a new random value each LFO cycle when S&H is off. |
| D | S&H | Capture the selected waveform at each hit; RND draws a fresh random value per hit. WAVE OFF samples the triangle. |
| E, F | blank | |

The oscillator runs on between hits. S&H has its own fixed nominal +-24-semitone range, independent of LDEP;
switching S&H off makes the next hit capture zero. Continuous TRI / SQR and S&H add to the tuning, so they move the
oscillators' pitch, the filter's tracking and the tuning-dependent decay. With RND and S&H on, each hit draws a new
value and holds it to the next hit. The random streams are separate for each track and are not restarted by notes;
a cold boot starts them again.

The four setup controls are the **Part's defaults** (saved with the Part, edited on the page) and **each can be
locked per step** (next section). They are not in scenes and are no LFO destinations (see "What it leaves out").
The three ordinary Octatrack LFOs work on the PLAYBACK knobs as on any track; the LFO page is the stock one (no
VOIC / CHRD: SY DRUM is one voice a track).

## Step locks of the setup controls (LSPD LDEP WAVE S&H)

The PLAYBACK SETUP page's four controls have per-step locks of their own, separate from the stock parameter locks
(they use no stock lock column and none of the three LFOs). They are the author's development builds' locks
(Octatrick 3.0), with the same card files, so a project moves between those builds and this module with its
locks.

**Recording a lock.** Open the page (FUNC + PLAYBACK), turn on GRID RECORDING, hold a trig and turn A..D: the step
gets a lock, starting from its own lock or, if it has none, from the Part's value.

- Several held trigs are edited together (each moves by the same turn).
- The page follows stock's main pages: while one or more trigs are held, a control is drawn **inverted** when a
  held step carries a lock on it, with the value of the **lowest** such step; releasing every trig redraws the page
  normal at once, and holding a locked trig shows its locked controls inverted with their values.
- Press and release an encoder without turning it: on a control the held steps do not lock, every held step gets a
  lock at the Part's value; on a locked control the untouched locks are removed.
- With no trig held, turning edits the Part's value. While a locked step plays, editing that control releases the
  step's lock until the next step, so the new value is heard at once.
- **LIVE RECORDING:** turning A..D while recording live records locks at the playing step, with the stock
  recording's timing and quantization. An empty step gains an ordinary lock trig; an existing trig keeps its
  timing and conditions.

**Playing.** A step's lock applies from its own START until the next step; a step without a lock plays the Part's
value: the effective value is the Part's default, then the step's lock (clamped to LSPD 127, LDEP 127, WAVE 3,
S&H 1). A step whose only locks are these is a lock trig (trigless): it changes the values without a new note.
Conditional trigs the stock sequencer rejects apply no lock. The locks belong to bank, pattern, audio track and
step; they are applied only while the track plays SY DRUM (a track switched to another machine keeps them, unheard,
and they come back with SY DRUM; a machine change keeps them, as stock keeps its locks).

**Copy, paste, clear.** The locks travel with the step in every stock sequence edit: a held trig's copy / paste /
clear, a page's or a track's or a pattern's copy / paste / clear and their undo, the shift of a track's trigs, the
duplication of a page, and the erase of a step in GRID RECORDING or LIVE RECORDING.

**On the card.** Each project folder may hold `sylock01.work` / `sylock01.strd` .. `sylock16.work` /
`sylock16.strd`, one pair a bank:

- a bank's files are written only when the bank holds a lock, or when its file already exists (so removing the last
  lock is saved too): a project without SY DRUM locks gets no file;
- WORK follows working edits, STRD an explicit SAVE PROJECT / SAVE BANK; RELOAD restores the saved state (a bank
  saved without locks loses its WORK file); SAVE TO NEW and EXPORT carry the files, DELETE removes them (stock
  removes only the files it knows, then the folder);
- WORK is written within about 1.2 s of a lock edit, while the sequencer plays or not (stopped, by stock's own
  background save; playing, which stock's background save skips, by a job of the module's at the same cadence: at
  most one write every 1.2 s, and none while no lock edit is unwritten), and at SYNC TO CARD and SAVE. Stock needs
  no such write for the current bank: it keeps that bank's patterns (and their stock locks) in battery-backed memory
  across a power-off. The step locks have no battery-backed copy: a power-off less than about 1.2 s after a lock
  edit, before the next write, can bring that step back without the edit while the stock locks of the same steps
  are kept. SAVE PROJECT before powering off, or two seconds without a lock edit, keeps the step locks (measured
  below; before 2.14 the WORK files were written only while stopped, so locks edited during playback were lost by
  a power-off while playing or within a second of STOP);
- a project without these files loads with no step locks, as before (projects saved by 2.10 load unchanged);
- they load whenever the project loads, also when one of the project's stock bank files is missing, cut short or
  damaged: stock shows its own message (SOME ERRORS OCCURED ... ABORT LOADING THIS PROJECT?); answered NO, it starts
  that bank empty and loads the project, and the step-lock files are read as usual. Before 2.14 one such stock bank
  file left every bank without its step locks, with no message of the module's: at power-on the PLAYBACK locks came
  back (stock keeps the current bank in battery-backed memory) and the PLAYBACK SETUP locks did not;
- the stock bank files keep their format. Keep the companion files with the project when copying or backing it up
  on a computer.

Recovery: a damaged WORK file with a good STRD loads the saved locks and shows `LOCKS RECOVERED; SAVE TO REPAIR` (the
damaged file is rewritten only by an explicit SAVE); a file this module cannot read, or one of a later format, is
preserved and that bank's locks are disabled with `SY LOCK FILE ERROR`; every other project feature keeps working.
Writes are checked; the stock files and the companion files are separate writes, so a save is not one atomic step
across a power loss.

**The file format** (the development line's version 2): a 32-byte big-endian header -- `SYLOCKS\0`, the version
(2), the header length (32), the zero-based bank, flags 0, the payload length (49,152), the edit generation, the
CRC-32 (ISO-HDLC) of the payload and of the first 28 header bytes -- then 8,192 rows (pattern, track, step) of six
controls: A..D = LSPD LDEP WAVE S&H on a SY DRUM track, E / F (a sidecar FM track's controls on the development
line; never written here, carried as read), each 0..127 or 255 for no lock. A file is 49,184 bytes. Version 1 files
(older development builds: four controls a row) are read. `tools/lockfile.py FILE` prints a file's bank, version,
generation and lock count; it reads and writes both versions.

**Development-line projects.** Their sylock files load and save as here (the development line writes all sixteen
pairs; this module then keeps updating the pairs that exist). Their two other companion families stay intact:
`sylkgjNN` (the GRANULAR machine's controls G..J) is read, carried with the rows and written back by that line's
rules; `syscenNN` (setup scenes, which this module does not have) is never read for playback; RELOAD restores it as
that line does, EXPORT copies it and DELETE removes it. SAVE TO NEW copies the locks this module holds, not the
scene files.

## Playing it

- One voice a track, any number of tracks: every SY DRUM track has its own state and patch.
- A trig recharges both envelopes; a trig on a sounding note keeps the oscillators' phase and the filter (warm).
- LEG MONO (AMP SETUP's sixth box): a legato key recharges the envelopes when its pitch arrives, without a new START.
  SY DRUM offers LEG OFF / MONO, as a sample track does.
- PTCH, SWEP, the CHROMATIC keys and MIDI notes are in semitones, as on FM SYNTH; the SCALE quantizer snaps PTCH.
- No chords, no VOIC, no fingered-chord recording (FM SYNTH's).

## What it leaves out

The author's development builds (Octatrick 3.0) have more than this module: setup scenes (hold a scene and turn a
setup control), the four setup controls as destinations of the three LFOs, and a marker file that selects the
machine from a FLEX slot. They can follow as an addition (nothing stored here would change).

## How it works

- `sydrum.s` is one DRAM unit in octabam's platform reserve, linked beside SYNTH MACHINE's `poly.s` and `machine.s`.
  Its `remix.inc` (written per remix by the manifest) brings `synth/engine_abi.inc` -- the equates the two modules
  share, one copy -- and, at the unit's end, `engine.inc.s`, the engine: the model in fixed point, its tables and
  the per-track state (`sy1_*`), then the step locks (`setup_stage.inc.s`, `locks_*.inc.s`).
- SYNTH MACHINE's `poly.s` calls it where its own FM engine runs, when the remix carries SY DRUM: at a START
  (`sd_trigger`: the envelopes recharge; `sy1_kind[t]`, the engine a track's last START chose, 0 FM or 1 SY DRUM),
  every frame (`sy1_mono_frame`: the controls from the frame's parameter record), every render call
  (`sy1_mono_render`: the samples), and once a frame from its clock (`sd_tick`: the setup controls to the engine,
  the CF record's sample settings neutral on SY DRUM tracks, the LFOs; a test and a return when no track of the
  Part plays SY DRUM). The machine-list row is `sd_row` in
  SYNTH MACHINE's row table (`synth/machine.s`, `ml_rows`).
- The page resolver's epilogue (`0x40031ed6`, `sd_page`): a FLEX track whose page would be the
  stock FLEX page and which has SY DRUM chosen gets SY DRUM's page -- a run-time clone of the FM SYNTH page (itself a
  clone of the stock FLEX record built in RAM; the repository carries no byte of it) with SY DRUM's title, names,
  ranges, formatters, widgets and knob handler, and a setup half with LSPD LDEP WAVE S&H. The same clone is SRC
  SETUP's page for the SY DRUM row.
- **The step locks** are the development line's code (8 Oct 2026, its on-board configuration) for SY DRUM's page:
  - the table: 16 banks x 8,192 rows x 16 bytes = 2 MiB of uninitialised DRAM at the top of octabam's platform
    reserve (a `DramRegion`, `sl_work_table`; it is filled before any reader looks), the rows' controls A..F, G..J
    (the development line's) and padding; `locks_store.inc.s` writes and checks rows and packs / validates the files;
  - the sequencer (`locks_seq.inc.s`): the row of an accepted event is snapshotted into the stock event queues and
    published with the event, so a lock plays on its own step even when the stock queue prefetches it (the next
    pattern, the next bank by negative micro timing); a lock-only step becomes a trigless trig after the stock trig
    condition accepted it;
  - the setup stage (`setup_stage.inc.s`): every frame and once more before a step's START, a SY DRUM track's four
    effective values = the live lane's (the Part default the page edits), then the playing step's lock, clamped,
    handed to the engine;
  - the UI (`locks_ui.inc.s`, `locks_live.inc.s`): the held-trig encoder, the encoder press / release, the trig
    press / release redraw, the four widgets (a held step's lock inverted), LIVE RECORDING, the has-lock marks of the
    trig LEDs;
  - copy / paste / clear / shift / duplicate / undo (`locks_clip`, `locks_sparse`, `locks_transform`,
    `locks_delete`): the companion rows follow every stock sequence operation;
  - the card (`locks_io.inc.s`, generated from `tools/locks_io.c` by `tools/gen_locks_io.py`): the stock engine
    task's load / save / reload / sync / SAVE TO NEW / EXPORT / DELETE jobs carry the companion files; the UI tick
    asks for the background save of dirty lock files (stock's own while stopped; a job of the module's while the
    sequencer plays, which stock's background save skips); playback reads RAM only.
  53 stock hooks of its own (the manifest: the resolver, the setup editor `sd_setup_edit`, and `LOCK_HOOKS`' 51); the
  machine is the Part's signature (`sd_kind`), where the development line asks its marker files. SY DRUM declares
  the conflicts with octabam's KITS (the card jobs and the pattern clipboard) and PLOCKS P2 (the lock queue and the
  held encoder): the same stock sites; and with STEM REC: the platform reserve does not hold both modules' DRAM
  regions ("Measured").
- `tools/gen_tables.py --check` checks the generated tables against the calibration constants; `tools/sy1_model.py`
  and `tools/sy1_mod_model.py` are the float reference models the engine was written against.

## Measured

All on octabam's emulator (`ot_emu`, the pinned build: MKII panel, DSP lockstep), 8 - 9 Oct 2026, with the
octatrick remix plus SY DRUM; nothing on hardware yet. Instruction counts are the emulator's, not hardware
percentages.

**Sound.** Batch renders (the transport started frame-exactly, the SY LFOs' state set at its first frame) against
the author's development build 3.0 (its on-board SY engine): three SY DRUM tracks at once (TRI / SQR LFOs, MODE F
with RND S&H, a track with step locks) and single tracks (MODE F, RND S&H, both): sample for sample identical over
the whole 2.2 s capture. A project the development build saved with a step lock plays identically on both.
Without any lock, SY DRUM 2.11 with the locks renders exactly as before them.

**Step locks.** The same pattern with and without one lock (T1 step 5, LDEP 100 over a TRI LFO): identical up to step
5, the locked step's pitch modulated (zero-crossing periods 64..142 samples against 170..172), every later step back
at the Part's pitch (the later samples differ by at most 2 / 2^23 -- the tail of the modulated note -- when each
START is cold, and in oscillator phase only when the notes run into each other). A project loaded with a lock on step
1 plays it on its first step (the render differs from the unlocked one from its first samples and is the development
build's, sample for sample). A track switched to SY DRUM in SRC SETUP while the pattern plays, in a Part that had no
SY DRUM track: its locks are applied on their steps from the first pass, the effective values frame by frame the same
as without the per-frame test (`sd_tick`, "Cost"). Two SY DRUM tracks locked on different steps: each lock changes
only its own track's step. GRID RECORDING (hold a trig, turn; several held; the lowest held step's value inverted;
release; encoder press to add / remove), LIVE RECORDING (six turns of LDEP while the pattern played, recorded as
locks on the playing steps 4, 6, 7, 10, 13 and 16 -- four of them, 4, 6, 10 and 16, steps that had no trig), shift
(FUNC + RIGHT / LEFT in GRID RECORDING moves a lock with its step), a held trig's clear (FUNC + PLAY), and in GRID
RECORDING a page's copy (FUNC + REC), its paste onto another SY DRUM track (FUNC + STOP: the lock lands on that
track's step) and the paste's undo (FUNC + STOP again), a page's clear (FUNC + PLAY) and the clear's undo (FUNC +
PLAY again) were run on this module and on development build 3.0 with the same key presses: every lock row the same
on both, every screen taken pixel-identical but where each build names the machine (the footer, the machine list: the
development build names it from a marker file). Not exercised on the emulator: a held trig's copy / paste (the
presses tried changed no lock on either build), a track's or a pattern's copy / paste and the duplication of a page;
they use the development build's code unchanged.

**Card files.** SAVE PROJECT writes the `sylock` pair of each bank that has a lock (version 2, 49,184 bytes); a
project without locks gets no file; a cold load of a saved project brings the locks back (WORK, which also holds a
lock made after the SAVE once the background save has run, as stock's working files do); PROJECT > RELOAD
brings back the saved locks (a lock made after the SAVE is gone; development build 3.0 gives the same rows on
the same card); SAVE TO NEW writes into the new project exactly the pair of the one bank that holds locks; a
Part SAVE / RELOAD leaves the step locks alone. The file I/O
(`tools/locks_io.c`) was also run on the Mac against an in-memory card: 31 cases -- no file without locks, exactly
the locked banks' pairs, cold load, removing the last lock, RELOAD, SAVE TO NEW and a new project over a folder with
stale files, a development-build project (sixteen pairs, `syscen`, `sylkgj`) loaded, saved, EXPORTed and DELETEd,
a version 1 file, a later version (blocked, preserved, `SY LOCK FILE ERROR`), a damaged WORK (`LOCKS RECOVERED; SAVE
TO REPAIR`, repaired by SAVE), RELOAD with the development build's scene files. One finding on the way: without
the development build's RELOAD step for its scene files (`syscenNN`), a RELOAD on an emulated card whose files had
been saved in place failed in the stock loader ('PARSE ERROR'); with it -- the development build's own sequence --
the same card reloads (why the step matters to the stock loader was not established). EXPORT and DELETE ran on
the Mac only.

**Cost.** `sd_tick`, once a frame (2 s of playing, 5,513 frames, the emulator's PC watch): 588 instructions with no SY
DRUM track in the Part (the four SETUP controls read from the Part and the LFOs' phase, as every frame; no lock
staging, shield or LFO outputs; 1,404 without that test, 751 in SY DRUM before the locks), 1,620 with one SY DRUM
track and a trig on every step (1,616 without the test, 973 before the locks), 1,645 with a lock on every step (1,641
without the test); 223 - 268 more at each START (`sl_seq_publish`). The voice itself is unchanged (`sy1_mono_render`
about 938 a call). With no SY DRUM track the free-running LFOs still advance every frame at the LSPD in force: a
track switched to SY DRUM after such a stretch, even one in which LSPD changed, renders sample for sample as without
the test. DRAM: the unit 136,061 bytes (code 68,297, data 67,764: the 49 KB file buffer and the 16 KB clipboards),
the lock table 2 MiB in the platform reserve's top (no sample memory is taken: the reserve is octabam's fixed one).

**Not with STEM REC.** The lock table and STEM REC's ring, stack and stream buffers (9,099,264 bytes) are both
DRAM regions at the top of the platform reserve (10,487,808 bytes) and do not fit it together: built with both,
the platform link refuses (the regions reach down to 0x409e8400; the runtime, its packed stage and its .bss end at
0x40af8fc4 in the octatrick remix with SY DRUM and STEM REC, measured at 2.11). SY DRUM
declares the conflict, so octabam refuses the pair by name. A table of the four SY DRUM controls alone
(512 KiB) would fit by arithmetic (not built); it would no longer hold the development builds' E / F and G..J
controls that a project from them carries through a save here.

**Power-off without SAVE** (octabam's emulator with the battery-backed memory carried over and a power-up as the unit
does it; a project with Flex samples loaded, two SY DRUM tracks, each with new PLAYBACK locks on two steps and new
PLAYBACK SETUP locks on two steps, no SAVE after the edits; 12 Oct 2026). Before 2.14 locks edited while the sequencer
played came back only when the unit had stopped for about a second before the power-off: a power-off after 10 or 30 s
of playing, after a pattern change while playing, or 0.3 s after STOP brought the stock locks back and the PLAYBACK
SETUP locks as they were before the edits. With 2.14 each of these comes back whole -- 10 s and 30 s of playing, a
pattern change, 0.3 s and 2 s after STOP, edits made while stopped and a power-off 2 s later -- the PLAYBACK SETUP and
PLAYBACK lock rows read back as they were at the power-off. The residue: a power-off 0.3 s after the last edit lost
that one edit (the step came back as before it) when stopped, and kept it while playing (a write fell in between);
WORK is written every 60 UI ticks (1.2 s on the emulator) while an edit is unwritten, and not otherwise (40 edits in
12 s of playing: ten writes 1.2 s apart, then none while playing on and none at STOP; an edit while stopped: one
write, by stock's own background save). A stock bank file of the project (`bank05.work`) removed, cut to 4 KB or with
a damaged header: stock's own message, the same before and with 2.14; answering NO, the project loads, and with 2.14
the PLAYBACK SETUP locks of every bank load with it (before 2.14: none, and no lock could be set until the next
project load); answering YES leaves no project and no step locks, as before.

**Not yet measured:** anything on hardware beyond the first SY DRUM reports -- in particular the card writes of
WORK during playback beside a STATIC track streaming from the card (the companion files are on the card; the RAM
table is filled from them at every project load).
