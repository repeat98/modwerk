# Linked voices (Digitakt II OS 1.17)

A lead track plays its notes on the tracks after it, so notes overlap instead of cutting each other off, and live or MIDI chords sound on several tracks at once. The base owns it: every machine, stock or added by a module, plays this way, and no module carries voice allocation of its own. Code: `voices.c`, `voices-entry.s`; the frame entry in `mixer-entry.s` calls `core_voice_frame`.

## What the musician does

SETTINGS shows a row named after the track you are on, `T1 VOICES` to `T16 VOICES`, from 1 (stock) to 8. LEFT and RIGHT change it. With 3 on track 1, tracks 1, 2 and 3 form a group: each new note track 1 plays goes to the first of them, from the lead on, that holds no note, so the lead takes a chord's first note (the trig keys send a chord from the lowest note up); with all three busy, to the next one in turn.

- The voice tracks belong to the lead while linked: they play the lead's sound with its machine, with each trig's own locks, and follow knob turns made on the lead. Their own trigs are silent while linked (the base sends their notes to no track), so their own machine never sounds between or after the lead's notes. Their own sounds, trigs and pages are not changed: back at 1 they play as before.
- A muted lead plays nothing. A muted voice track is skipped.
- A track that is already a voice of an earlier lead leads nothing, and a group ends at track 16.
- The setting is the project's: saved with it (project archive tag `VOC1`), reset to 1 everywhere by a project saved without it.

The DT2 sequencer keeps one note per trig, so a pattern cannot hold a chord on one track; linking gives overlapping tails from the sequencer and chords from the keys and MIDI.

## How it works

**Notes.** Every note the stock OS plays, from the sequencer, the trig keys or MIDI, reaches the frame interrupt as a 0x6c-byte record on the note scheduler's list (inserted by `0x4013a98c`, or `0x4013aa66` for a note due now). The frame takes the due records one by one in its note loop: at `0x4002dff4` it loads the next record from its frame (`fp - 100`) and tests it. The base's `jsr` replaces those 6 bytes (SHA-256 `03aea46e…`); `core_voice_event` may change the record's track (`+0x10`) before stock reads it at `0x4002e1b4`.

Record fields (sequencer constructor at `0x400d6d24`; the frame's note handling from `0x4002e1b2`):

| Offset | Meaning |
| --- | --- |
| `+0x00` | kind: 0 and 1 take the note path, 2-8 are transport, pattern and parameter events |
| `+0x04` | 1 for a note-on |
| `+0x10` | track, 16 for none |
| `+0x14` | the note's source (1 for the sequencer) |
| `+0x1c`, `+0x20` | the trig's lock rows and its row index (-1 for none); the pitch is byte 2 of that 6-byte row, or of the record's own row at `+0x24` |
| `+0x2c` | the pattern track |
| `+0x3c`, `+0x40` | the sound the note plays: the kit's track sound (`kit + 0x34 + 0x450 * track`) or a sound lock's |

Because the record names its sound, a note moved to another track plays the lead's sound there. Stock keeps per track the source and pitch of the note it holds (`0x47db4310`, `0x47db4560`, cleared by the note-off that matches both), so the base sends a note-off to the group's track that holds that source and pitch, and prefers a track whose source word is 0 for a note-on.

**Knobs.** The per-track parameter targets are 71 int16 a track from `0x80003362` (142 bytes a track; the smoother at `0x400d9406` follows them each frame from `0x80003340`). A note-on loads the note's sound and locks into its track's targets. Once a frame, before the transfer, `core_voice_frame` compares the lead's targets with the last frame's and copies the values that changed to its voice tracks. In a frame where a sequencer note stayed on the lead, it only takes the lead's new values, so a trig lock on the lead does not spread to the voices; notes from the keys or MIDI carry no locks and never hold a turn back. As a safety net, each frame one voice track of the group that holds no note is copied from the lead in full, so the next note there starts from the lead's settings. Found on a unit (Morpha, build `e6ffc45b`): while chords were played and knobs turned, later chord notes no longer sounded like the lead; the frames skipped for every lead note had swallowed turns.

**Sound chip.** The machine wire's per-track types (`machine-frame.c`) give a voice track its lead's type for as long as it is linked, so an added machine's player plays every note its lead sends there, and the track's own machine never takes over its voices mid-note. A voice track's own note records go to track 16 (none) at the same entry.

## Checked

Emulator only (coupled ColdFire and sound-chip run from a ready point saved with each image, the stock sound-chip image, the test card's one-second tone on track 1, two taps of trig key 1 about half a second apart), 23 November 2026. Not yet tested on a unit.

| Build | Result |
| --- | --- |
| Base `a3ced45e` (before this change) | The known stock PCM (`da40d90b…`). The second note cuts the first: peak 0.063, a single tone. |
| This base, every track at 1 | The first note is identical to `a3ced45e`'s, sample for sample (40,000 samples aligned on the first sound). The run as a whole hashes differently because the scripted key taps land at a slightly different moment against the audio (the first note 58 ms later); the second note again cuts the first (peak 0.063). |
| This base, track 1 at 3 (`MODWERK_VOICES_TEST=3`, a test-only build flag that sets track 1 at the first project load) | The second note rings over the first instead of cutting it: peak 0.0955 and a 10 ms RMS of 0.064 where the notes overlap (two tones), against 0.063 and 0.025 without linking. |

| The test project's own pattern played (PLAY, about 1.2 s), every track at 1 and with track 1 at 3 | The two runs' PCM is identical (`5af68b89…`): with track 1 leading, the sequencer's notes on the project's other tracks play exactly as without. |

| Track 1 at 3 playing Granula (an added machine, in progress), two notes, then SIZE (knob C) turned on track 1 while both ring | The second note plays on track 2 as a grain cloud (the voice track takes its lead's machine). A trace of each grain's length: before the turn 256 samples on all four voices (tracks 1 and 2); after it 48,000 on all four, track 2's in the same block as track 1's. The turn on the lead reached its voice. |

On a unit (reported by the author, 23 November 2026), Digitakt II OS 1.17 with this base and the Morpha module (an added machine) on the lead, loaded over USB:

| Build | Reported |
| --- | --- |
| `063eea9a` (voices rotating, a voice track's own machine between borrowed notes) | Chords from the keys: each note and each key release moved to another track, each sounding a different wave; letting go of the second key of a two-key chord left a note sounding that jumped to the first key's pitch. Save, load another project and come back: the track kept its settings. |
| `e6ffc45b` (voice tracks reserved for the lead, filled from the lead, copied at linking; held pitch from the keys dropped) | Chords play; after a while of playing and turning knobs, later chord notes no longer had the lead's settings. |
| `27dfadf8` (turns copied with key and MIDI notes, idle voices copied in full) | Chords with VOICES 3-4 and knobs turned while playing: every chord note keeps the lead's settings. |

Not checked yet: sequencer trigs on a linked lead on a unit, MIDI chords, muted voices, a stock machine (SAMPLE) as the lead on a unit.

## Open

- A knob turned in the same frame as a sequencer note-on on the lead reaches a ringing voice only when it moves again (a voice with no note gets it from the idle copy).
- A knob turned on the lead overrides a voice's trig lock on that parameter while the voice's note plays.
- The setting is per project, not per kit or pattern.
- Chords from the trig keys in chromatic mode are not checked: in the emulator a second key held with the first added no note on either build.
- Changing VOICES while notes play regroups at once (routing pauses while the groups change); a note-off that then finds no owner stays on the lead.
