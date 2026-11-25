# FM Synth 0.1.5 experimental

0.1.5 began as two drafts, #1928 (the sequencer clock read once a frame through the base's `ev_audio_frame_prepare`, and
the LFO pass left to stock between notes) and #1974 (FM Synth rests while nothing in the project uses it), combined on
22 November 2026 (package `5b425a33`). The owner's unit run of that package (below) showed the rest working and #1928's
frame path costing 1.3 to 1.6 frame points more than the rest alone whenever FM Synth is awake: its saving was for an
installed FM Synth on no track, which the rest now makes free. So the current package keeps the rest, drops #1928's
frame-prepare clock and LFO gate (the LFO depth site and the clock are 0.1.4's again, so no base 0.7.14 is needed),
keeps #1928's faster `fm_frame`, and adds a path meant to cut what a silent FM track costs, which on the unit
did not lower a track's cost once it had played notes (23 November 2026, below; #2030). The owner waived the ask-the-author step for
this optimization work on 22 November 2026; the engine and its credit stay Tim Hastie's.

## The package `791e26c5` (built 23 November 2026; its code was `8cf43bfb`'s, prepared 22 November)

`public/octatrack-modules/synth/0.1.5-experimental.mwrm`, 31,598 bytes, SHA-256
`791e26c59c7223232a1a6b420078697e8bcc4020deec9bbb3b8fe2bea2a5c1c9`, module `e8c3e4fa`, 24 sites of which nine rest, 39
stock copies, no bss; hooks `ot_machines` and `ev_in_use` (order 40).

It differs from the package of 22 November, `8cf43bfbb0d2c5032bf02dbb1a29fcf8cfda8ef00a04a12e307a7a6a68a150de`, in one
byte: `cmp` finds offset 27,925 (0x6d15), 6 to 4, `reserved[0]` of the `mw_machine` descriptor (the byte after its
source kind, before its label "FM SYNTH"), which `machine_ports.py` writes from `"cpuPrice"` in FM Synth's entry of
`machine-ports.json`. Same size, same module id; no hash inside the package covers that byte. The new price is below
("The price, measured on 0.1.5"). Every unit reading of 0.1.5 below that names `8cf43bfb` was taken on that package,
whose code and data are this package's except for that byte. The recipe was recaptured from the stock OS 1.40C for the
new image (`build.py --octabam-machine synth --capture-stock-recipe`): the same 39 copies at the same offsets, only its
`imageSha256` moved, and every machine recipe's pin of `machine-ports.json` moved with it. Built on this branch with main's builder (`node
scripts/mirror-octatrack-modules.mjs && python3 -B scripts/octatrack-module-packages.py`); its recipe recaptured from
the stock OS 1.40C (the same 39 copies, at new offsets); `--check --stock`: every package identical, the strict
stock-free scans pass. It needs a base with resting sites (0.7.10 or later; an older base refuses the package).

**On a unit so far:** its cost on `8cf43bfb`: on 22 November 2026 the owner's MKII with the 0.8 development twin
`dce1d30e` recorded `evidence/frame-cost.json` (Dev17 C04 at 126 BPM, 79.4 % with stock alone: `rest` 0, `first` 31.3,
`each` 0.5), and on 23 November its CPU price (below). That first instance was read at 107.9 % of a frame, the overload:
on 24 November 2026 Laslo's MKII with the 0.8 development twin `2f0dcfa3` read the curve of `791e26c5` again on a pattern
with room (project CPUCURVE2, A03: trigs on T1 T3 T6 T7, no sample track, 63.8 % with stock alone), with the
`device:price` of #2110, which reads only what played: points 64.2, 81.0, 84.8, 85.0, 83.7, so `rest` 0, `first` 20.4,
`each` 0.2 (a first run the same hour: 17.3 and 1.9), now `evidence/frame-cost.json`. Admitted alone on the empty
pattern, nothing dropped. On the medium pattern (A01, 78.4 %) the pick was refused, judged by the table of the last set
synced to the unit, which still booked 31.3; a single-package trial sends none, so that run says nothing about 20.4. On 23 November `791e26c5` itself ran the cases in the table
below on twin `856cbbcf` ("MKII runs of `791e26c5`", below): the rest and a pick while it rests pass; the
released-silence and after-STOP paths did not lower the cost.

**Rests** (stock's bytes while `fm_in_use` answers 0):

| Site | What | Why it rests |
| --- | --- | --- |
| 0x4000d03e `po_lfo3b` | the frame builder's LFO depth read, every track and LFO; track 0's LFO 3 runs the clock and `fm_frame` | frame path |
| 0x40003ca4 `po_lfo3` | the LFO routine's depth read | LFO 3 is muted only on an FM track |
| 0x4000c634 `po_retrig` | the command byte copy, every track, a frame | acts on a sounding FM voice only |
| 0x4000d514 `fm_source_dispatch` | the renderer slot copy, every track, a frame | rests with the STATIC entry, below |
| 0x4000b51a `po_rel`, 0x4000b2c8 `po_stop`, 0x4000685c `po_kill` | release, STOP and voice kill consumers | end engine voices only |
| 0x400d6434 (data) | the STATIC renderer entry, `sy_render` | a STATIC track bound while it rests gets stock's renderer; resting puts every slot holding `sy_render` back to stock's |
| 0x400d6458 (data) | the FLEX start entry, `fm_start` | stock's start for every FLEX track |

The two data entries are symbol references, which the pinned builder (`build.py`, a base input) cannot flag: the
package row's `"restingReferences"` has the host wrapper (`scripts/octatrack-module-packages.py`) set the loader's rest
bit on them. The panel, page, chooser, AMP SETUP, MIDI and key paths stay awake.

**In use** (`fm_in_use`, each UI tick): a pick of FM SYNTH (the base's pick calls `fm_admit_track`, which sets a flag,
just before it asks whether to wake a resting machine), GLIDE on (sample tracks with LEG MONO slide through
`sy_render`), an FM/1 track in the live Part, and a sweep of one Part (16 banks, 4 working and 4 saved Parts each) and
one FLEX slot (a legacy FMSYNTH* / SYNTH* marker) a call; it rests only after a whole sweep, 128 ticks or about two
seconds, found neither. Cost a tick, in the UI task only: two Parts' type bytes (three signature bytes on a FLEX track),
GLIDE, the Part index and bank word, one slot path up to 255 bytes of battery RAM (an empty slot one read). Waking sets
`fm_fr`'s `FR_REBASE`, and the next frame's clock (`po_rebase`) drops the step change it would measure across the
frames it missed while its site held stock's bytes.

**A silent FM track** (`sy_render`, 0.1.5): two paths ship this call's silence without the FM engine, each bit for bit
what the full path ships (the source header and zeros, the cursor, the record's PTCH and RATE words, the AMP override
and LEG lane byte the DSP reads), and the next note starts from the same state:

- no voice of ours (S_ON 0: after a voice kill such as STOP, or a pattern change), GLIDE off, no START this call: the
  header and zeros, nothing else (the full path only wrote the record's PTCH word back as it was; S_CUR, which it also
  followed, is set by every synth START);
- a released mono voice at silence (S_ON bit 1, S_GAIN and S_GPREV 0, no paraphonic voice fading under it): every write
  the DSP sees as before, then no parameter block, no FM loop and no zeros written twice. That state only decays further
  and the next START is cold (S_GPREV 0), which resets the phases, envelopes and gains it would have advanced.

A legacy marker's track, a paraphonic voice, GLIDE on with no voice, and an FM track before its first START (the base
renders that one) keep their paths. `FM_NO_SILENT` assembles the full path alone, for the comparison.

Module instructions a frame for one FM track (`fm_frame` and its two `sy_render` calls, on Unicorn's ColdFire core,
stock calls stubbed; `test_silence.py` prints them):

| FM track state | 0.1.4 engine (`2ac17c3a`) | `8cf43bfb` |
| --- | ---: | ---: |
| before its first START | 121 | 57 |
| one sounding mono note | 1,424 | 1,396 |
| released, at silence | 1,432 | 477 |
| after a voice kill (STOP) | 397 | 250 |

The fixed part of each is `fm_frame`, once a frame for all eight tracks (148 instructions in 0.1.4 with an FM track
read, 112 now). Instruction counts are not frame points: memory access (cache misses) is not counted, nor is the
base's route of an FM track. On the unit (23 November 2026, below) a track that had played notes kept costing about 11
frame points while silent or stopped, so these counts did not show there (#2030).

**Software checks** (22 November 2026): `test_silence.py` (both builds over silence before a note, a note, its release to
silence, a second note, a retrigger, a voice kill and a note after it, and GLIDE on: every call's return and everything
the DSP and stock read identical, the engine's state identical after the notes; the instruction counts above),
`test_in_use.py` (the answer, the sweep, markers, GLIDE, the pick, the idle and rebase flags) and
`sdk/tests/test_module_packages_cli.py` pass; `fm_frame` matched 0.1.4's on 5,000 random mask, start, GLIDE, machine
and signature cases (a one-off comparison, not committed); `machine_composition_tests.py` passes.

| Case | Why this change makes it a risk | How run | Result |
| --- | --- | --- | --- |
| Installed, no FM track, C01 playing | the nine sites must cost nothing | `791e26c5` installed alone, frame share on C01 (all eight tracks trig on 1/5/9/13) against no modules; twin `856cbbcf`, Dev17 Part 1 | pass: 40.9 % and 41.0 % against 40.8 % (+0.1 to 0.2) |
| FM on T2, C01 (notes) | the awake path must cost no more than the rest alone | frame share, longest frame and CPU meter with T2 on FM SYNTH, against T2 on its sample; twin `856cbbcf`, Dev17 Part 1 | 55.4 %, longest frame 114.2 %, CPU meter 67.8 %, 0 skipped: +14.6 frame points against the sample. Not compared with `2ac17c3a` (not run), so "no more than the rest alone" is untested |
| FM on T2, C02 after notes on C01 (the note released) | the released-silence path must cut the silent track's cost | frame share on C02 started fresh after 8 s of quiet, two readings, against FM on T2 before any note (24.7 %) and no modules (23.7 %); twin `856cbbcf`, Dev17 Part 1 | **does not meet the claim**: 36.2 % and 36.2 %, +11.5 points over the same track before any note, held over about 45 s ([#2030](https://github.com/repeat98/modwerk/issues/2030)) |
| STOP, then PLAY | the no-voice path after a kill, then the first note | frame share stopped for 8 s after notes, two readings, against FM on T2 stopped before any note (24.6 %) and no modules stopped (23.7 %); then PLAY on C01; twin `856cbbcf`, Dev17 Part 1 | stopped: **does not meet the claim**, 36.0 % and 36.0 %, +11.4 points over the same track before any note ([#2030](https://github.com/repeat98/modwerk/issues/2030)). PLAY on C01 after the stop: 55.4 %, 0 skipped, no stall. The first note by ear: not judged |
| A pick while it rests | the wake must land before the commit | FM SYNTH picked on T2 while C01 played; twin `856cbbcf`, Dev17 Part 1 | pass: admitted, no stall, 0 skipped |
| GLIDE on with a LEG MONO sample track | GLIDE must keep it awake and slide | glide by ear, GLIDE on, then off | not run (the owner, at the unit) |
| HOLD shorter than INF on the first notes after a wake | the clock's rebase | listen to the note lengths | not run (the owner, at the unit) |
| Legacy FMSYNTH marker project | the slot sweep must keep it awake; its track keeps the full path | the saved marker fixture | not run: no fixture on this card |
| Silent paths against the full path | a silent path must ship what the full path ships | `test_silence.py` on Unicorn's ColdFire core | pass in the emulator; on the unit the saving did not show (rows above, [#2030](https://github.com/repeat98/modwerk/issues/2030)) |

## MKII runs of `791e26c5` on base 0.8 (23 November 2026)

Reported by the coordinating session for the owner: package `791e26c5`, Octatrack MKII, development twin `856cbbcf`
of base 0.8 (`base/octatrack-next` `9ac83b232`), project Dev17, bank C, Part 1. Two trials of FM Synth alone, each
rolled back. Readings are `guard`'s "in the frame interrupt" from `PLAY w2500 guard w6000` (stopped: `w8000 guard
w6000`).

**Run 1** (10:42 to 10:45). C01 has trigs on steps 1, 5, 9 and 13 of all eight tracks; C02 has none.

| State | Frame share | Longest frame | CPU meter | Skipped |
| --- | ---: | ---: | ---: | ---: |
| No modules, C01 | 40.8 % | | 58.5 % | |
| No modules, C02 | 30.4 % | | | |
| Installed, no FM track, C01 | 40.9 %, 41.0 % | | | |
| FM SYNTH picked on T2 while C01 played | admitted, no stall | | | 0 |
| FM on T2, C01 (notes) | 55.4 % | 114.2 % | 67.8 % | 0 |
| PLAY on C01 after STOP | 55.4 % | | | 0 |

**Run 2** (10:55 to 10:59), matched baselines: C02 started fresh after 8 s of quiet, and stopped after 8 s; two
readings each.

| State | C02 playing | Stopped |
| --- | --- | --- |
| No modules | 23.7 % / 23.7 % | 23.7 % / 23.7 % |
| Installed, no FM track | 23.8 % / 23.8 % | 23.7 % / 23.7 % |
| FM on T2, before any note | 24.7 % / 24.7 % | 24.6 % / 24.6 % |
| FM on T2, after notes on C01 | 36.2 % / 36.2 % | 36.0 % / 36.0 % |

**What it shows.** The rest works: installed on no track FM Synth adds 0.1 to 0.2 points, and a pick while it rests is
admitted without a stall. An FM track before its first note costs about 1 point. But once FM Synth has played notes,
its track keeps costing about 11.4 points more than before its first note, on an empty pattern (+11.5) and while
stopped (+11.4), over about 45 s; playing notes on C01 it cost +14.6 against T2 on its sample. So the released-silence path and the after-STOP no-voice path did **not** show the reduction this release set
out to make (the emulator's instruction counts above are for the paths themselves, not for what the unit reached). A
possible cause, not verified: the default sound's HOLD may be INF, so its voices never release; the owner will check by
ear. The fix is the follow-up [#2030](https://github.com/repeat98/modwerk/issues/2030). Admission still charges the track its in-use `first`
(`evidence/frame-cost.json`), so nothing is over-admitted.

Run 2's trial verdict was FAIL for one render the guard replaced on T8, a plain FLEX track with no machine, whose
render the guard substitutes with stock's FLEX render (`machine_registry.c`, #999). Both trials rolled back; T2 and
Part 1 were checked identical afterwards.

**Owner's decision** (23 November 2026): ship 0.1.5 with base 0.8, with these results recorded and the silent path's
fix as a follow-up ("yes, sounds good").

**Not run on the unit:** GLIDE with a LEG MONO track, HOLD shorter than INF after a wake and the first note by ear (the
owner, at the unit), and the legacy FMSYNTH marker project (no fixture on this card).

## The price, measured on 0.1.5 (23 November 2026)

Measured by the coordinating agent session for the owner, who chose to measure the price again the documented way
(docs/MODULE_PERFORMANCE.md, "A machine that renders on the ColdFire names its CPU price"): Octatrack MKII, OS 1.40C,
RAM-booted development twin `856cbbcf` of base 0.8 (`base/octatrack-next` `9ac83b232`, release identity `5368bb0b`),
the FM Synth 0.1.5 package `8cf43bfb` installed alone in a trial that rolled back by itself. Project Dev17, bank C,
pattern C02 (no trigs on any track before), Part 2, 126 BPM. FM Synth on T1 at its default sound (PTCH, RATO 1, INDX
32, DEC 198 on the screen), the seven other tracks without trigs, FILTER and DELAY on every track.
`npm run device -- do 'PLAY w2500 guard w6000 guard STOP'`, the second `guard` line's "in the frame interrupt", three
times with a trig on every step of T1 (mask `ffff`) and three times with T1's trigs removed (mask `0000`):

| T1 | Run | In the frame interrupt | Frames | Skipped | Longest frame |
| --- | ---: | ---: | ---: | ---: | ---: |
| a trig on every step | 1 | 30.8 % | 16,875 | 0 | 58.8 % |
| a trig on every step | 2 | 30.8 % | 16,877 | 0 | 59.5 % |
| a trig on every step | 3 | 30.8 % | 16,875 | 0 | 59.9 % |
| no trigs | 1 | 27.6 % | 16,872 | 0 | 36.8 % |
| no trigs | 2 | 27.6 % | 16,875 | 0 | 36.6 % |
| no trigs | 3 | 27.6 % | 16,872 | 0 | 36.5 % |

The lines cited, from the run's log (the second `guard` line of each run):

```
[10:10:34] C02 T1 mask with trigs: ffff
  with trigs #1: ... frame max 58.8 %, latest start 0.0 %, in the frame interrupt 30.8 % over 16875 frames, skipped 0 on -, share 80.0 %
  with trigs #2: ... frame max 59.5 %, latest start 0.0 %, in the frame interrupt 30.8 % over 16877 frames, skipped 0 on -, share 80.0 %
  with trigs #3: ... frame max 59.9 %, latest start 0.0 %, in the frame interrupt 30.8 % over 16875 frames, skipped 0 on -, share 80.0 %
[10:11:11] C02 T1 mask after removing: 0000
  without trigs #1: ... frame max 36.8 %, latest start 0.0 %, in the frame interrupt 27.6 % over 16872 frames, skipped 0 on -, share 80.0 %
  without trigs #2: ... frame max 36.6 %, latest start 0.0 %, in the frame interrupt 27.6 % over 16875 frames, skipped 0 on -, share 80.0 %
  without trigs #3: ... frame max 36.5 %, latest start 0.0 %, in the frame interrupt 27.6 % over 16872 frames, skipped 0 on -, share 80.0 %
[10:11:50] trial: verdict: no crash, stall, freeze or skipped track logged during the trial rolled back (pass --accept to keep it)
[10:11:51] inventory: []
```

The difference is 3.2 points of a frame, rounded up to **4**: `resources.cpuPrice` and `"cpuPrice"` in
`machine-ports.json`, so the descriptor's `reserved[0]`. The Part's working and saved copies and the other tracks'
masks were as before afterwards, and nothing stayed installed.

0.1.3 measured 4.6 points on 17 November (base 0.7.7 twin, a default Part with seven empty STATIC tracks; below) and was
priced 6 with room for longer notes. 0.1.5 reads lower in this scene, and is priced by its own reading. The two scenes
differ (base, project, the other tracks' machines and effects), so the two figures are not a measurement of the change
between the versions.

What it changes, reasoned from the base's source (`machine_registry.c`), not tried with this package: the base admits a
Part's machines against a CPU budget of 45 % of a frame; at 4 a Part's eight tracks book 32 %, so the budget refuses no
FM Synth track (at 6 it refused the eighth). The busy check, which judges a pick by the CPU meter plus its price against
85 %, still applies. A base with base 0.8's frame-cost table admits FM Synth by its curve (`evidence/frame-cost.json`)
instead.

## MKII runs of the combined package `5b425a33` (22 November 2026)

Reported by the owner's session: Octatrack MKII, twin `d3c83646` (base 0.7.14 plus frame admission), Dev17, FM Synth
alone in the set. Unused on C01: 38.9 % against about 39.0 % empty; the kind-table entries read `40004008` /
`4000f450` while it rested and `40d81210` / `40d85e5c` after a pick on T2, which was admitted with no skipped render;
back on STATIC it rested again. With FM Synth on T2 (frame share, longest frame, CPU meter):

| Scene | rest only `2ac17c3a` | combined `5b425a33` |
| --- | --- | --- |
| C01 (notes) | 52.5 %, 105.5 %, 61.7 | 53.8 %, 106.7 %, 66.2 |
| C02 (no trigs, silent) | 38.5 %, 64.7 %, 50.3 | 40.1 %, 65.7 %, 52.0 |

C02 with no module was 23.6 %: an FM track that plays no note cost about 15 frame points in both builds.

## MKII run of the rest package `2ac17c3a` (22 November 2026, #1974)

Reported by the owner's session: package `2ac17c3aa4e6e73fd0eaddc08d72ba01ea89601c753d8596384fe98976c77812` (#1974's
rest change without #1928's), Octatrack MKII, OS 1.40C, RAM-booted development twin `5aa7bdf8` (base 0.7.14
`b36f9c53e` plus the owned-wrap fix), Dev17 C01 at 126 BPM, trigs on T1-T8, the frame interrupt's share over 8 s:

| State | Frame share | Longest frame |
| --- | ---: | ---: |
| No module | 39.2 % | 88.3 % |
| FM Synth 0.1.4 installed, on no track | 45.0 % | 119.9 % |
| `2ac17c3a` installed, on no track | 39.3 % | 91.9 % |
| `2ac17c3a` picked on T2 while playing (it was resting) | 51.4 % | 105.9 % |
| T2 back to STATIC | 39.0 % | 103.2 % |

While it rested the kind-table entries read stock's (`0x400d6434` = `40004008`, `0x400d6458` = `4000f450`); after the
pick they read the module's before the commit, T2 became FLEX + FM/1 and no render was skipped; back on STATIC they were
stock again within 2 s. The trial rolled back cleanly. Not run: GLIDE on, legacy marker slots, project load, listening,
a Keep or power cycle.

## MKII hardware trial of `b904a852` on 21 November 2026 (#1928)

On an Octatrack MKII running OS 1.40C and the 0.7.13 development base `1d880c5a`, the private package `b904a852fa2cd0dc9b2aef39969ba77637fe05a394adc06c2833b93df1d15f02` added **0.619 percentage points** on MWREPROB/TARGET at 140 BPM while assigned to no track. Three FM-only installs measured +0.675, +0.587 and +0.594 against the mean of the empty windows on either side. Across 247,897 measured frames the guard recorded zero skips. The +0.2-point hardware target remains open.

The first isolated T1 audition sounded at 261.6 Hz. In a separate sequenced take, eight consecutive steady bar intervals averaged 1.71423 seconds at 140 BPM (expected 1.71429). The second onset overlapped the preceding sustained note. On the same sustained note in LEG MONO, moving PTCH up and down an octave stepped between 261.6 and 523.3 Hz with GLIDE OFF. At 96 it passed through intermediate pitches in both directions. GLIDE was returned to OFF.

A saved FLEX fixture with a silent `FMSYNTH_OLD.WAV` in its first sample slot and no dedicated FM signature sounded at 271.3 Hz on its first sequenced note. The empty and post-Undo T1 recordings were digitally silent. This tested a Part-assigned marker. Sample-locked legacy markers, external clock, swing, other track speeds, cold boot and listening by a person remain open on this build.

All five trials rolled back. TARGET's original bank, pattern, track, four working and saved Parts and stopped transport matched, and the original 0.7.12 base returned with the same saved and live set. Thirteen bank checksums were initially invalid and all passed on the final uncached reads. Byte-for-byte parity of those banks remains unverified.

## Emulator comparison of `b904a852` on base 0.7.13

The installed package was `b904a852fa2cd0dc9b2aef39969ba77637fe05a394adc06c2833b93df1d15f02`. Two local builds reproduced it, including one from base draft commit `024c677c`. Each install used virtual USB and ended with Undo.

On MWREPROB/TARGET at 140 BPM, four independent installs added 0.225, 0.165, 0.179 and 0.196 percentage points to the modeled frame interrupt, each against the mean of its adjacent empty windows. The mean increase was 0.192 points. All nine raw windows covered at least 16,000 frames with zero skipped renders. Each install returned to normal with an empty inventory after Undo. This is a ColdFire emulator measurement.

On the emulated ColdFire, 64 first-trigger cases covered native FM, assigned legacy markers, sample-locked markers and ordinary FLEX samples on all eight tracks, with glide off and at 96. Each case had 64 idle frames before the trigger. The LFO filter woke on the trigger frame, the renderer recognized the first FM note, and removing the last voice returned to the ordinary LFO loop. A routed FLEX trigger may enter the filter for one frame while its sample lock resolves. The ordinary sample played without starting an FM voice.

The two runtime packages produced the same output buffers and exit registers in 1,024 complete LFO passes. The comparison covered all 256 voice masks, both frame buffers and the standalone caller. All 24 LFO wave handlers ran on each pass. With no voices or pending starts the candidate made zero calls to the FM depth handler. Separate comparisons covered 38,352 clock frames, 4,096 routing cases, 1,284 marker cases and 6,144 glide trajectories at all 128 settings.

In separate Octemu runs of statically linked images, the released and candidate engines reloaded the same saved FLEX project with a legacy `FMSYNTH_OLD.WAV` marker. The first 176,400 stereo frames from note onset matched exactly. They also matched on a project with LEG MONO, glide 96 and two pitch locks. Both recordings ended in silence after Stop. Standalone SDK builds call frame preparation at the existing LFO detour. The USB build subscribes to the base callback and reproduces the MKII-tested package byte for byte.

The final standalone SDK image (`e0ea9dbc3f55468e6ae188ec66a9b98cb5c66ef37f4f317e7604d36e0339b7e2`) matched the reference for the first 176,400 stereo frames from note onset in each fixture. The legacy marker played after project reload. The glide-96 run used the previously loaded project snapshot after a fresh reload stalled on emulated card I/O. Both ended in silence after Stop.


## Previous release 0.1.4

0.1.4 differs from 0.1.3 only in the price byte of its generated machine descriptor: `"cpuPrice": 6` in FM Synth's entry of `sdk/machines/octatrack/module-adapters/machine-ports.json`, which `machine_ports.py` writes as `reserved[0]` of the `mw_machine` descriptor, and the same 6 as `resources.cpuPrice` in `octamod.module.json`. No code changed: in the module's folder only `release-notes.json`, the manifest and Markdown differ from 0.1.3. The 0.1.3 report follows unchanged below.

## The price (measured on 0.1.3, 17 November 2026)

Measured by the owner on his MKII, development twin `945cc074` of base 0.7.7, 17 November 2026, with FM Synth 0.1.3 (whose code 0.1.4 is), SYNTIZ, Amiga and POLY8 installed: one FM Synth track at its default sound with a trig on every step of a 16-step pattern, seven empty STATIC tracks, `npm run device -- do 'PLAY w2500 guard w6000 guard STOP'`, the second `guard` line's "in the frame interrupt". 36.8 % with the trigs against 32.2 % without them: 4.6 points, priced 6 with room for longer notes (docs/MODULE_PERFORMANCE.md, "A machine that renders on the ColdFire names its CPU price").

What it changes, reasoned from the base's source (`machine_registry.c`), not tried with 0.1.4: the base admits a Part's machines against a CPU budget of 45 % of a frame and charges a machine that names no price 12. So 0.1.3 fitted three FM Synth tracks a Part and the fourth was refused with CPU FULL; at 6, seven fit (42) and the eighth is refused. The budget came with #1482 (12 November 2026), so every base from 0.7 on has it; a base without it ignores the price. The base's other check, which refuses a further machine while the CPU meter plus ten times its price reaches 85 %, still applies.

## The package

`7d59f809…` (30,498 bytes, 24 sites, 39 stock copies, as 0.1.3's `19e7e08c…`). `cmp` finds one byte different from 0.1.3's package: offset 26,913 (0x6921), 0 to 6, `reserved[0]` of the `mw_machine` descriptor, between its source kind byte and its label "FM SYNTH". Its recipe was recaptured from the stock OS 1.40C (`build.py --octabam-machine synth --capture-stock-recipe`): the same 39 copies, only the image hash moved; every machine recipe's pin of `machine-ports.json` moved with it. `octatrack:module-packages -- --check`: every package identical.

Unit trial of the 0.1.4 package (17 November 2026, owner's MKII, development twin `945cc074` of base 0.7.7, package `7d59f809…`, FM Synth the only module, a timed trial that was rolled back; driven over USB by the agent, nobody listened):
- Picked on tracks 1 to 8 of a default Part: the budget booked 6, 12, 18, 24, 30, 36 and 42 % of its 45 %, and track 8 was refused with CPU FULL ("FM SYNTH NEEDS +13 %", "CPU 107 %").
- Seven FM Synth tracks at the default sound, trigs on steps 1, 5, 9 and 13 of each, playing: the frame interrupt at 53.6 %, the CPU meter at 59.3 %, no render skipped by the frame guard.
- Each track set back to STATIC; the Part's working copy then equalled its saved copy.
- Not tested: sound by ear, chords, glide, MIDI, other modules beside it, a Keep, a power cycle.

**Not tested on 0.1.4:** everything else: seven FM Synth tracks admitted and the eighth refused, the CPU FULL box, playback and sound, chords, glide, MIDI, Part and project reload, a power cycle, MKI. 0.1.3's untested list below stands.

# FM Synth 0.1.3: what it costs on no track

0.1.3 makes FM Synth cheaper on the CPU, above all while it is installed and on no track. Sound and controls are meant to be unchanged; one stock bug FM Synth caused is fixed (below). It changes `upstream/synth/poly.s`, the LFO site's kind in `upstream/synth/manifest.py` and the machine port (no RENDER_FLEX); no base change. The 0.1.2 report follows unchanged below.

## The report and the readings (14 November 2026)

**Report** (owner's MKII, development twin `0277c5c5` of main): four FLEX tracks sounding one loop, T5-T8 STATIC and silent, 126 BPM, playing. The frame interrupt takes 41-42 % without modules; with only FM Synth 0.1.2 installed, on no track, 19.1 points more, the CPU meter 7.8 more, the longest frame 86 % -> 109 %.

**Measurements** (`node scripts/octatrack-price.mjs` from the `price-sweep` worktree on that twin and scene, each package tried in RAM for 8 s and rolled back by itself, its own reading without modules just before it; points of the frame interrupt at rest, CPU meter in brackets). Every run included the first 0.1.3 source as its reference: +15.6 / +15.7 / +15.7 / +15.6. Bisect variants are measurement builds, never published: "without X" removes that site or flag from the package, "stub" makes the routine return at once.

| Package | Frame (CPU) | Tells |
| --- | --- | --- |
| 0.1.2 (published) | +19.0 (+8.5) | reference |
| 0.1.3, first source (`e9ae3e5e…`, 13 November) | +15.6 (+5.3), +15.6 (+6.6) | reference |
| ...every frame-interrupt site and RENDER_FLEX removed | +0.0 (-0.7) | nothing else of FM Synth costs at rest |
| ...without RENDER_FLEX | +6.8 (+2.6) | the base's FLEX route to FM Synth's render: 8.8 |
| ...RENDER_FLEX kept, `sy_render` jumps to stock at once | +13.3 (+4.4) | of that, the base's guarded route 6.5, `sy_render`'s fast path 2.3 |
| ...without the STATIC entry | +15.8 | 0 here (T5-T8 STATIC but silent) |
| ...without the slot copy `0x4000d514` | +13.4 | 2.2 |
| ...without the LFO depth sites | +12.8 | 2.8 |
| ...without the retrig site | +15.7 | 0 |
| ...without the trig-time sites (start, release, kill, stop) | +17.2 | none (noise or a side effect) |
| fix, first: frame masks, no RENDER_FLEX, the Part read every frame | +4.3 (+1.7) | |
| ...without the slot copy | +3.9 (+1.3) | the slot copy 0.4 |
| ...without the LFO depth sites (no clock, no masks) | +0.2 (+0.8) | the LFO pass's part 4.1 |
| ...`fm_frame` stub | +2.1 (+1.3) | the Part read every frame 2.2 |
| fix, second: the Part read a word at a time | +4.9 (+2.7) | no gain |
| ...`po_tick` stub | +4.3 (+1.8) | the clock about 0.6 |
| ...`fm_frame` stub | +2.4 (+0.9) | the Part read every frame 2.5 |
| **0.1.3 as committed**: the Part read only for tracks that may need the engine | **+3.2 (+2.2)** | |

**Cause.** Installed on no track, FM Synth's code and data were on every stock track's frame path, and every line of it a track touched missed the cache, since the renders between evict it: the base's route for unowned FLEX tracks to a RENDER_FLEX machine (its frame guard around each render), the slot copy, the LFO pass (24 calls a frame: eight tracks, three LFOs) and `sy_render`'s fast path. Reading the Part's bytes (bank, Part index in battery RAM) every frame for all eight tracks then cost 2.2-2.5 points by itself. This is reasoned from the readings above; no cache counters were read.

**Fix** (no new site, no base change):
- FM Synth's machine declares no RENDER_FLEX: the base renders a FLEX track nobody owns as stock, and FM Synth never sees it.
- `fm_frame` works out once a frame, from the LFO pass's track 0 (it runs every frame before the packer; nothing jumps into 0x4000cf40..0x4000d3fc from outside), which tracks the engine must render: FM tracks that have started, sample tracks while GLIDE is on, a sample track with a voice of ours on it (a legacy FMSYNTH* sample) and a sample track a voice starts on. It reads the Part only for those (FM last frame, a voice of ours on, a start this frame, every track while GLIDE is on); at rest it reads GLIDE and the packer's event bytes only.
- The slot copy (`fm_source_dispatch`) tests one bit of one line inline and gives the engine only those tracks; any other track keeps its renderer, and a STATIC track bound under the STATIC entry gets stock's back. The STATIC entry stays `sy_render` so that the base retargets every slot holding `sy_render` when FM Synth leaves (`runtime.c`).
- The LFO depth site in the frame builder is a `jsr` whose LFO 1 and 2 return within one line; LFO 3 tests one bit (`FR_ON`, kept by `sy_set` and `po_kill`, the only places `S_ON` turns zero or nonzero) instead of the track's record.

**Fixed on the way: track 1's LFO 3.** In 0.1.2 and 0.1.3's first source the frame builder's LFO site called the clock (`po_tick`) for track 1's LFO 3 before the displaced `lea (a0,d4.l*2),a1`, and `po_tick` leaves `a0` at FM Synth's clock: so whatever track 1 played, its LFO 3 wrote into FM Synth's clock instead of its destination (emulator, the first 0.1.3 image: `a1` = `po_clock + 10` for destination 5, the target for every other track). With a depth of 0 nothing changes; with any other depth track 1's LFO 3 did nothing and FM Synth's frames-per-step and tick count took the values. Now the displaced instructions come first. Not heard on a unit.

**Can it differ in use?**
- A FLEX track counts as another machine's when its signature bytes (the NEIGHBOR page's first three) are two capitals, or a capital and a digit, then 1..15 (PL/1, S2/1-2, AB/1, WV/1-15, FR/1); the module cannot see the base's rows. Such a track is never given to the engine, as the base never gave a machine's track to FM Synth. A plain FLEX track whose NEIGHBOR bytes only look like that plays without the GLIDE slide and plays a legacy marker as its sample (0.1.3's first source slid it). A future machine whose signature falls outside that pattern would get FM Synth's render on its tracks while GLIDE is on.
- A track that becomes an FM track is given to the engine at its first START; until then it renders through the base, its stock voice stopped, which is silence as before.
- A STATIC track bound before FM Synth was installed slides with GLIDE at once, where the first source waited for the track's next binding.
- `po_rtlog`'s pass counter still counts every pass of the retrig site (unchanged).
- The longest frame stays about 110 % at rest (86 % without modules), as with 0.1.2 and 0.1.3's first source. The four bisect builds that give the engine no START on a sample track read 88-89 %. Reasoned, not measured: at such a START `sy_render` looks for a legacy marker by scanning the slot's path in battery RAM a byte at a time. Not changed here.

**Emulator equivalence probe** (scratch, not committed: the octabam ColdFire emulator with the local stock MAIN for memory, the package's image relocated). It ran 3,000 frames of random bank pointers (valid, odd and out of range), Part indices, machine bytes (0-5, 0x81), signatures (FM/1, FM/2, PL/1, S2/2, AB/1, WV/7, WV/16, FR/1 and near misses), GLIDE, event bytes and `FR_ON`, then every LFO of every track and every track's slot copy with six kinds of renderer:
- `fm_frame` gave the masks the rules above give, `FR_NAT` matched 0.1.2's `fm_is_native` on every track it read, and it kept every register it must;
- `po_lfo3b` gave `po_lfo3_depth`'s depth and target on all 72,000 calls, ran the clock and the masks once, on track 1's LFO 3, and kept every register;
- `fm_source_dispatch` stored and passed the expected renderer on all 24,000 calls and pushed the second call's end.

1,508,128 checks, 0 failures. Not probed: `sy_render` and the engine (unchanged code), the start and release paths.

**Build checks.** The USB package is built through the site's builder (`19e7e08c…`, 30,498 bytes, 24 sites, 39 stock copies), the build the readings above measured, and is stock-free (longest run shared with the OS 11 bytes, `check_stock_free.py` none); its recipe was recaptured and the machine port's pins moved, and the other machine recipes' pin of `machine-ports.json` moved with it.

**What remains** (+3.2 at rest): the LFO pass's 24 entries and the clock (`po_tick`, which FM Synth's HOLD timing and the recording's note lengths need every frame), `fm_frame`'s reads of GLIDE (battery RAM) and the event bytes, the slot copy's eight entries, and the work at each START on a sample track (the engine's start path through the base's guard). Only a dispatch that never enters FM Synth's code for a stock track removes it all: the base calling the machine for its own tracks only, and a clock and LFO mute the base raises, a base change that is not part of this version.

**Unit check** (measured by the owner on his MKII, development twin `0277c5c5` of main, 14 November 2026; package `19e7e08c…`, FM Synth the only module, each build a timed trial in RAM, no Keep):
- FM Synth alone on T1 in the owner's project (B01, 126 BPM, one trig a beat), eight seconds recorded over USB from the track's outputs. Over one bar, 0.1.3 correlates 0.99991 and 0.99990 with two takes of 0.1.2, and the two 0.1.2 takes correlate 0.99991 with each other; the level is 0.0440 RMS in all three. Frame interrupt 61.9 % and 70.1 % (0.1.2), 64.5 % (0.1.3); longest frame 95-99 %.
- With T2-T4 FLEX loops sounding beside the FM track: the FLEX track T2 is sample-identical between 0.1.2 and 0.1.3 (difference 0). The FM track correlates 0.925-0.940 with 0.1.2, while two 0.1.2 takes correlate 0.868 with each other: the base's frame guard skipped renders on it in every take (410, 433 and 1010 skips). Frame interrupt 75.4 % (0.1.2), 70.5 % (0.1.3).
- Picking FM Synth on a track and going back left no Part byte changed.

**Not tested on hardware:** chords, glide (LEG MONO and POLY), GLIDE with LEG MONO on a FLEX and a STATIC sample track, a legacy FMSYNTH* sample, MIDI notes, track 1's LFO 3, STOP and pattern changes on a sounding FM track, a track changed from FM back to FLEX, Part and project save and reload, a power cycle, removing FM Synth while it plays, MKI, and listening by ear. The emulator gates of 0.1.2 were not rerun (see below).

**Why the 0.1.2 release records are not renewed.** 0.1.2's `evidence/regressions.json` replays #264 and #273 in Octemu on the card firmware the site's composer built with FM Synth (the "patched browser MAIN"), its screenshots come from a native octabam build of that firmware, and `sdk/native-comparisons/synth.json` compares the two over a coverage set (`module:verify`). The composer, `module:verify` and the native comparison were removed from main on 12 November 2026 (`ef5f86e2c`): FM Synth now reaches a unit only as its package on the base, over USB or in the module file. So none of those three records can be made for 0.1.3 from this repository, and they still describe 0.1.2. The UI is 0.1.2's (no page, chooser or control code changed), which the owner's approval names as retained.

## The first 0.1.3 source (13 November 2026)

The first source read the Part, GLIDE and each track's FM test once a frame in the render path, and `sy_render` gave stock a track that is not FM, holds no synth voice, has GLIDE off and starts no voice in that call. Measured on the owner's MKII (a development twin `55ab6215` of the base at `main` `bd9b5b0df`, one busy project at 126 BPM, fourteen other modules installed, FM Synth on no track; `npm run device -- guard`, `stats` and `profile`, three 5 s windows playing and two stopped):

| Build | Frame interrupt, playing | CPU meter, playing | Frame interrupt, stopped after playing | UI tick chain | Longest frame | Renders skipped in 10 s |
| --- | --- | --- | --- | --- | --- | --- |
| No FM Synth | 63.1 % | 73-76 % | 31.8 % | 574 us | 98 % | 0 |
| 0.1.2 | 76.6 % | 84-88 % | 43.6 % | 1,083 us | 110 % | about 12,200 |
| 0.1.3, first source | 73.9 % | 81-85 % | 40.2 % | 942 us | 111 % | about 230 |

That package was the build `e9ae3e5e…`. The frame guard's figure is its guarded window; the CPU meter is what the panel feels (docs/MODULE_PERFORMANCE.md). The committed 0.1.3 was not measured on this project.

# FM Synth 0.1.2 regression testing

This is the experimental 0.1.2 update for [#264](https://github.com/repeat98/modwerk/issues/264) and [#273](https://github.com/repeat98/modwerk/issues/273), tested on 8 October 2026. It is included in the catalog. Current hardware, chip worst-case timing and complete stack/memory bounds remain unknown. The owner explicitly authorized this new release and issue closure without current hardware validation: “please release them and close. I green light no hardware validation for now”. This is a new exact-source update approval; the 0.1.1 approval is historical.

## Changes and reproduced failure

The privately bundled quantizer's octave-number hook originally replaced eight bytes at `0x400449b8`. The stock MIDI branch targets `0x400449be`, inside that replacement, and skips the required octave argument push. The drawer then consumes one more argument than was pushed and corrupts its caller's stack. On the released browser image, selecting a MIDI trig mode freezes the UI; the debugger finds the stock HALT diagnostic after a bad return into a data address. The baseline does not reach the post-selector SRC gate.

The replacement starts at the common argument push, `0x400449be`, with a fresh eight-byte stock hash guard. MIDI uses the octave already in d0, pushes it once, preserves the stock format argument and resumes at `0x400449c6`. Audio retains the scale/root rendering. Normal MIDI/audio paths no longer branch into detour padding. The patched browser image passes repeated selector DOWN/UP navigation and returns to the Synth SRC controls. The repeatable `verify-regressions.py --case midi` runner also passes, including both pre- and post-selector display gates.

FM source output now shifts right three bits: mono after its output conversion, and each paraphonic contribution before accumulation. This leaves 18.06 dB more headroom before the stock AMP path and voice sum. Existing envelope gains, relative voice normalization and crossfade state are preserved. Every existing sound is quieter at the same mixer settings. Effects, resonant filtering and multiple tracks can still clip.

**The reported hardware static has not been reproduced.** Both baseline audio configurations below remain below signed 16-bit full scale. The measurements verify attenuation and continued playback/STOP recovery, not resolution of every artifact in #273. A physical MKI/MKII retest with the reporter's sound/settings is still needed.

## Private software builds

The current 0.1.2 source and metadata are compiled together with the ordinary shared compiler. The earlier development-image report is retained separately in `evidence/development-regressions.json`. Current-main builder inputs produce a slightly different browser image, so MIDI, mono and four-voice regressions were all rerun on that exact release image. The standalone native image reproduces the freshly captured LCD image byte for byte. The compiler/exporter run in the isolated stock-free toolchain container with network disabled, a read-only root and private tracked-source/output mounts. No firmware enters Git.
Compilation passes. Only the private Synth `poly`/`fm_qz` objects and their linked group change in requested-packages; unrelated packages remain identical. Build identities are recorded in `evidence/regressions.json`:

- Patched browser MAIN: `64beb992dd65cad096d2c70f23bb3064c715464d651da22dd3ad9024901831e9`.
- Patched upgrade: `c1a57f818998923e27ee9ae36061f2c1fe050788619ccceec6d0c24dac04d392`.
- Patched standalone native MAIN: `d5464195fac0033852546fbbc8f809b64d16646309c21ab25e2f203fbf123157`.
- Released 0.1.1 browser MAIN baseline: `c1fbc0b2eaf284e72692b7048d1dfd3693f3e3e90c71229159a619d585b52c95`.

The native proof's `osSha256` is the module-owned image before platform writes; it is not the emitted MAIN's file hash. Capture/replay checks use the actual emitted file hash.

All **110 current coverage selections** pass the existing `compareSelection` native/browser comparator: **31 built** (module-owned bytes equal outside the established platform/logger spans), **79 matching refusals**, **zero mismatches**. This covers standalone Synth, pairings, fuller selections and both stock-FX2 policies. The input stock image remains unchanged. An altered stock byte is rejected and that input also remains unchanged. See `evidence/composition.json`. Mixed images have composition evidence only, not audio stress qualification.

## Panel and audio regressions

Octemu binary SHA-256: `3ce6cebde0de2c61edc4228436338a1e115ce227373351a5ca84aefc9cf90acb`. The local source checkout is dirty, so its HEAD alone is not claimed as the tested executable identity. A private copied, sample-free firmware-created project has a step-1 T1 trig and FX1/FX2 NONE. Card/battery identities are recorded in `evidence/regressions.json`. Every image/case starts with a fresh copy of the battery state. Native UI capture uses the separately fingerprinted headless `ot_emu` in `media/capture.json`. The extra Octemu regression screenshots retain their original development-image bindings in `media/regression-capture.json`; they are not relabelled as new browser-image captures.

Actual panel input selects FM SYNTH, sets INDX=0, AMP REL raw 40 and AMP VOL maximum (display +63), starts PLAY, then sends STOP twice. The four-voice case additionally sets VOIC=4 and CHRD raw 127 (display M7S2). The retained LCD exports confirm these controls. Recordings are stereo 44.1 kHz signed 16-bit PCM, including boot/settle silence. Peak comparisons therefore measure the full captured take rather than time-aligned samples.

| Configuration | Released peak | Patched peak | Peak change | Final half-second peak, patched |
| --- | ---: | ---: | ---: | ---: |
| One voice, INDX=0 | 14,630 | 1,827 | −18.07 dB | 0 |
| Four voices, CHRD=127 | 21,912 | 2,740 | −18.06 dB | 1 |

Both mono takes have an autocorrelation period of 169 frames, about 261 Hz. This is a coarse period estimate, not a precision tuning claim. Both four-voice takes sound and stop; their 149-frame autocorrelation minimum is not interpreted as a single-note pitch. Host scheduling and audio delivery behavior are not measurements of real chip timing.

Sanitized measurements, fixture hashes and PCM fingerprints are in `evidence/regressions.json`; panel walks are the adjacent JSONL files. Raw logs, WAVs, card images, battery files, firmware and debugger memory stay private.

Reproduce with a reviewed local Octemu checkout and the sample-free fixture above, inside a restricted local sandbox with reads limited to tool/runtime, emulator and private fixture/image folders, writes limited to a fresh private output folder, and only local emulator IPC:

```sh
python3 -B verify-regressions.py \
  --octemu /path/to/octemu --image /private/patched-main.bin \
  --image-sha256 64beb992dd65cad096d2c70f23bb3064c715464d651da22dd3ad9024901831e9 \
  --card /private/sample-free/card.img --battery /private/sample-free/nvram.bin \
  --output /private/new-midi-run --case midi --timeout 300
```

Use `--case mono` or `--case poly` and a fresh output path to record audio. The runner verifies its supplied image hash, copies the fixture, gates on firmware displays/transport, checks sustained audio and double-STOP silence, and checks the mono carrier period. Run the same audio walks against the baseline image for a paired gain comparison. All three runner cases were executed against the exact 0.1.2 browser image. The earlier screenshot walks are retained separately as development evidence; their LCD controls are unchanged.

## LCD captures and remaining qualification

All seven control/chooser LCD images were captured again from the patched standalone native MAIN, then opened and visually reviewed. Their pixels are unchanged from 0.1.1, while their provenance binds the new emitted image. `media/capture.json` records the emulator, image, plan and screenshots. The maximum-AMP, four-voice and MIDI-selector screenshots have separate Octemu regression provenance.

Browser runtime reservation remains 10,586,112 bytes (native shared arena plus logger reservation), with a reported runtime extent of 90,268 bytes. These are shared build extents, not complete Synth ownership or worst-case stack/lifetime bounds. Worst-case ColdFire cycles and DSP transport overhead are unmeasured. Hardware on both models, maximum simultaneous tracks, external MIDI note/CC traffic, modulation, p-locks, scene sweeps, effects, saved project/Part reloads, non-default speed/length, swing, loop/restart transitions and neighbouring sample playback remain untested.

`evidence/release-0.1.1/` retains the previous reports and approval as historical context. They do not qualify 0.1.2. `qualification.example.json` remains an incomplete worksheet. The owner authorized this experimental release despite the disclosed qualification limits. The current source-bound approval is in `sdk/synth-build-approval.json`; version-matched release notes, catalog and compiled packages are updated together. Hardware, timing and memory quantities remain unknown.

## Repository validation

The fixes originated at `73490ef77f36bf523bc28f2b385d62e331ec7c5c`; current compiled code and exact release-image identities are recorded in `evidence/regressions.json`. The earlier draft's 167-file / 1,077-test result remains in `evidence/software-checks.json` as historical evidence. The 0.1.2 release runs `npm run check -- --base origin/main` and `module:doctor -- synth` against the promoted source and current compiled packages.

The release preserves every non-Synth package payload and recipe against the main-branch baseline. The retained Analog BD native matrix is checked against the current packages: 130 native OS and GNU bootloader comparisons, six matching refusals and five complete firmware round trips. Its global source-inventory binding changes only after those checks; Analog BD source and package bytes are unchanged. These software comparisons do not qualify hardware.
