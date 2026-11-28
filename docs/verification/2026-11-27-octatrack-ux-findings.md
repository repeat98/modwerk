# What hurts Octatrack musicians, 27 November 2026

An owner's investigation over three sources: the diagnostics members share (pulled 27 November 17:00 UTC), the Discord
channels since 8 November, and all 60 open issues with the open pull requests. Six readers went through them, one
merged the findings into ranked candidates, and one skeptic per top candidate recounted its numbers from the raw
records. The figures below are the recounted ones. Nothing here was reproduced on a unit: causes are hypotheses unless
a line says otherwise.

## Scope and limits

- Bases 0.8, 0.8.1 and 0.8.2, without the owner's development unit. Base 0.8.3 went live on the day of the pull and
  had under one playing hour, so its rates are unknown.
- A session is one start with at least one playing minute: 172 of them, 99 playing hours, 59 units.
- Device-log incidents are deduplicated by member, start and sequence number. A CPU, SHED or LATE record is written at
  most once in ten minutes, so its counts are since the start and its context can lag.
- One unit with 18 to 24 modules, a hub and macOS is behind six open issues and about a third of the Discord
  incidents. Themes that rest on it need a second unit.
- Members who do not share diagnostics fail about 40 % of syncs, against 25 % for those who do. Their reasons are not
  in the pull.

## What musicians hit

| Problem | How often | Units |
| --- | --- | --- |
| CPU FULL refusals | 274, in 54 of 172 playing sessions | 28 |
| Renders the frame guard dropped | 7.2 million, in 52 sessions | 21 (11 with 1,000 or more) |
| Late frame entries held, each a skipped DSP frame | 1,762 after the start, in 47 sessions | 25 (five carry 82 %) |
| Syncs the unit refused | 34 of 307 | 16 members |
| Syncs that stopped while sending | 30 of 307 | 3 members, retrying many times |
| DSP stalls | 3 in 362 starts | 3 |

### CPU refusals

- 149 of the 274 cannot be the Part budget's: rebuilt from each record's machines, even the dearest pick would not
  pass the allowance. They are the frame line's pick refusals (`status.c`). At most 50 are likely the Part budget's.
  The record could not say which check refused or for which module; a DETAIL record on the next base does
  (`diag.h`).
- 68 of 170 refusal records were taken while stopped, 45 of them with the meter under 50 %. Stopped, the meter reads
  the idle unit while the check judges the load the Part last played at.
- Pricing each machine at its measured cost (#2286) ends false refusals of a machine priced far above what it
  renders, and adds refusals for Parts with three FM Synth tracks and for POLY8 beside almost anything. Over every
  0.8.x snapshot, 41 go over the budget at the old prices and 61 to 65 at the new. It is a correctness fix, not a way
  to fewer refusals.

### Dropped renders

- By the machine on the skipped track: Amiga 3.17 million (almost all from one session that lost about half its
  track's sound for twenty minutes), tracks with a VECTOR signature 1.73 million (two units), Analog BD 0.85 million,
  stock tracks 0.61 million, WV 0.59 million, Grain 0.22 million. FM Synth and UNGEMACH together are 0.5 %.
- 23 of 57 sessions with drops had fewer than ten. 18 sessions on 11 units had 1,000 or more.
- Nothing on the unit or the site tells the musician that sound was dropped, or on which track.
- A machine can reach a track without the frame-line check: by a paste (closed on the cumulative draft #2333), by a
  project load, and by LFO or scene edits after a pick.

### Late entries

- The count since the start includes stock's own start-up lag; without it, 1,762 skipped frames in 99 playing hours,
  17.8 an hour. By base: 15.4 an hour on 0.8.1 and 7.8 on 0.8.2.
- Only three sessions, all on 0.8.1, had entries later than the wait can hold after the start.
- Sets with Tape Echo show about twice the rate (26.2 against 13.5 an hour), but those sets are also heavier.
- Frame gaps over 515 µs are mostly 500 to 599 µs on 0.8.x: the wait's own signature, not independent evidence.
- The record could not say whether a wait came after a long frame (the shape of the stall it exists for) or was only
  barely late. The DETAIL record counts both.

### Syncs and connections

- Refusals on 0.8.x: 20 in use (refusal 7), 5 module memory, 5 with no loader code, 4 busy (refusal 5). 18 of the 20
  in-use refusals ended in a kept sync within ten minutes.
- Both busy refusals that reached the musician came while the last change's card save was pending for three to seven
  minutes, not while code was loading. The text said "still loading module code".
- After a sync stopped while sending, the next try failed 61 of 64 times (#1596, #2305).
- The device picker was closed without a choice 53 times by 27 members; the page then showed nothing. Two members
  never connected.
- 91 failed claims from 25 members; 76 connected within ten seconds without help.
- #2340 changes the four texts above on the site.
- Module memory refusals: none since 25 November, after the site's pre-check and MIDI Scenes 0.3.1.

### Stalls and freezes

- Stalls per 100 starts: 0.8 on 0.8.x, none on 0.7.13, 3.2 to 3.8 on 0.7.5, 0.7.9 and 0.7.12. No regression.
- Two of the three 0.8.x stalls had on-time frames with the manager writing tables; the third came right after a
  start with late frames and the manager idle.
- "Freeze until a restart" lines over 30 days and all bases: 45, of which 23 are OS upgrades and 7 USB disk mode. 15
  are unexplained, 8 of them while playing.

## What did not hold

- **A frame figure past 100 % in the CPU FULL box.** The box already shows what the pick needs and the checked load
  as a share of the line, and the owner ruled out figures past 100 % on 22 November.
- **One fix for clicks at a Part change.** The buffer-table fix in #2274 does not explain the stall by its own text
  and cannot explain clicks between identical Parts. Holding the meter request during a Part change has no data
  behind it: that request is the last packet in 31 of 44 stall records, always answered.
- **Warning earlier about heavy modules.** Three warnings already come before a sync. It would not cut refusals.
- **An automatic retry after a sync stops while sending.** It would rescue about one sync in twenty.

## Order of work proposed

1. Record which check refused and what kind a late entry was (on #2333; host tests only so far).
2. The owner's two open questions on #2333: whether the predicted brake uses a measured stock above the ladder, and
   whether a Part change or a load is judged against the frame line.
3. Before the next base ships: count refusals on an empty, a medium and a heavy pattern with #2286 in.
4. Tell the musician about dropped sound, on the site first, above a sustained rate.
5. After a few days of DETAIL records: the cost of the machines that shed (Amiga, Analog BD, WV).

## Not verified

- Candidates ranked below the eighth had no skeptic: the step a failed card save stopped at, the resting releases
  that wait for a new approval, a Kits guide section on moving patterns, and a rule against asking a reporter to
  retest with fewer modules.
- Every stall and late-entry cause above.
- Discord counts come from keyword reading and from our own replies in the channels.
