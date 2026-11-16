# Octatrack beta base: what to improve next, 9 November 2026

A survey for the owner's next session: where the beta base can gain stability, ColdFire CPU and DSP room. It is a
reading of the [7-8 November diagnostics record](2026-11-08-beta-diagnostics.md), the
[findings log](../OCTATRACK_BETA_TEST_PLAN.md) and the base's source on `main` at `41529e29e`. Nothing was built
and nothing ran on a unit or an emulator, so every cause below is a reading of the code until a unit confirms it.

## Where the beta stands

Syncs and USB base updates are clean in the field (finding 78). Four things still hurt:

- DSP stalls that only a power cycle clears: finding 72 (after a PROJECT > SYSTEM walk) and findings 74 and 79
  (E-Verb, TapeHead and Euclid together; playing at about 90 % CPU).
- ColdFire CPU at 80-100 % with module machines, where the frame guard skips renders (#1123, #1137).
- What is left of #998: noise when a Part switch changes effects on a full core.
- Three UI freezes (finding 77), unexplained.

## The options

Each is a yes or no for the owner. "Unit" says whether it needs the development unit.

| # | What | Why | Unit |
| --- | --- | --- | --- |
| 1 | Chase finding 72 first | At least eleven records in the 1-8 November pulls, also with nothing installed, so it is the base's own | yes |
| 2 | Finish #998 | The refusals were fixed on 28 October (#1017); the Part-switch noise was never checked again | yes |
| 3 | Reproduce the stall trio (74, 79) | No code change is worth making before a repro | yes |
| 4 | Measure CPU while playing | Only stopped figures exist; every CPU fix is a guess until then | yes |
| 5 | Look up a track's machine once a frame | The FLEX render hook repeats the lookup on every render of every FLEX track | to measure |
| 6 | Cut what installed, unused modules cost | About 5 points of the frame interrupt, stopped | to measure |
| 7 | Make the frame guard's skips shorter | A single slow render can keep a track nearly silent for seconds | to hear |
| 8 | Trace finding 33 | Module DSP code costs 1.4-1.7 cycles an instruction, stock's about 1 | yes |

### 1. Finding 72: a suspect

The stall follows the walk PROJ, DOWN, RIGHT, YES, which most likely opens USB DISK MODE.

`modwerk_dsp_stalled` in `sdk/machines/octatrack/elekloader/dsp.c` calls it a stall when the frames stand still
for 30 ticks while a loader job is in flight. The status meter's reads keep a job in flight much of the time. Since
#1089 the watchdog stands down while the base writes itself (`modwerk_flash_quiesced`), which fixed finding 78.
It knows nothing of stock stopping the frames on its own, as for USB DISK MODE or a card OS upgrade. If stock does
that, `recover(1)` shuts the loader off until a restart, cancels a transfer that is open, drains both cores and
lets the frame interrupt back in while stock holds everything still.

Against it: the one full stall record from the field shows the frame interrupt unmasked when the watchdog fired,
and its counters put the stall about 16 s into a boot, not at the walk.

**Test:** on a development twin with nothing installed, make the walk, leave with NO, then read
`npm run device -- stall`. If the watchdog fired inside USB DISK MODE, the fix is to keep it out while stock holds
the frames, as #1089 did for our own write.

### 2. What is left of #998

Since #1017 a slot whose effect changes keeps its own buffer block, so a full core no longer refuses the change.
Still open, as the issue says: nothing clears a block when it changes hands, FILTER may be flagged as needing a
buffer when it does not, and a refused pick may drop the NONE that follows it. **Test:** the issue's steps on the
current base: all four FX1 slots of a core on buffered effects, two Parts that differ in them, switch while
recording.

### 4. Measure CPU while playing

One busy stock project, playing, about a minute each: the original OS, the bare base, and the base with FM Synth,
POLY8, Euclid and Repitch installed but on no track. A development twin can stamp the cost of each base hook
(`modwerk_cost_stamp`, `diag.c`). Options 5 to 7 follow from what this shows.

### 5. The machine lookup in the FLEX render

`mw_source_render_impl` in `machine_registry.c` runs for every render of a FLEX track, about twice a frame for
each track. Each time it walks the machine table, checks the bank, finds the Part and compares the track's
signature with every installed machine. The card build's guard (`sdk/runtime/logging/frame_guard.c`) works this
out once a frame into a mask of tracks and tests one bit a render. The base could do the same. The saving is not
measured.

### 6. Installed, unused modules

A sweep on the development MKII on 24 October (stopped, modules added one by one, none on a track) took the frame
interrupt from 23.3 % of a frame to 28.2 % with 26 installed: FM Synth 1.9 points, POLY8 1.2, Euclid 1.0,
Sidechain Compressor 0.4, the rest 0.2 or less. Effects that only run on the DSP cost nothing. The fixes belong to
the modules, so each needs its author. The cost while stock tracks play has not been measured (option 4).

### 7. The frame guard

Read in `guarded()` (`machine_registry.c`), not heard on a unit:

- The guard decides per render, in track order, so the first machine track of a long frame is skipped, whatever
  it costs. The dearest track would free more.
- A skipped track's cost is measured again only when it renders, at most once in 1,024 frames (0.37 s), and an
  estimate falls by an eighth a render. After one slow render, as at a pattern change, a track can stay nearly
  silent for seconds. Taking a probe's measurement as the new estimate would end that at the first probe.

### 8. Finding 33

E-Verb's 382 executed instructions cost 663 cycles on the unit, SPRING REV's 314 cost 298. The loader is not the
cause: stock effects loaded the same way cost what they always did. Small DSP test programs that compare a
module's instruction mix and delay-buffer access with Spring's would show where the cycles go. At stock's rate a
module would cost about a third less, which is why the finding calls it the biggest lever on how many a core holds.

## Suggested order

One unit session covers the tests of 1, 2 and 4, then the trio (3). Options 5 to 7 wait for what 4 shows; 8 is its
own session. Five base pull requests are open and conflict again at every base merge (#1272, #1320, #1321, #1098,
#1165), so the fixes that come out of this are better batched into one base pull request than opened one by one.

Already in: the beta base runs module code from the cached alias (`--cached-modules`, `scripts/octatrack-base.mjs`).

## Not checked

- Nothing here ran on a unit or an emulator.
- The diagnostics were not pulled again; the latest pull is 8 November.
- The menu order behind finding 72's walk is still unverified.
- Why each module in option 6 costs what it does was not read again in its source.
