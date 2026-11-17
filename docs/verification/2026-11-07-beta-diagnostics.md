# Beta diagnostics, 6-7 November 2026

What the testers' shared diagnostics showed between the 6 November pull (10:13 UTC) and the 7 November pull
(14:07 UTC), with the 6 November finding-79 note moved here from the findings log. Times are UTC. Units are
numbered, not named.

## Finding 79: a stall while playing on the live base, without VECTOR or POLY8

**6 Nov pull (moved from the findings log):** unit 1 on `9680e9ac` with 7 modules (Tape Echo, Repitch, E-Verb, BBD,
VECTOR, Play Modes, POLY8): in a 132-minute session the guard skipped about 518,000 renders of tracks 1 and 3
(POLY8, then VECTOR), most within 20 minutes at 62-93 % CPU. No stall, but the next sync, which brought Ringmod SC
(it requires the key bus) among eight new modules, was refused 10 (`RUNTIME_FEATURE`: the key bus down for the
boot, `controller_board.c`); after a restart the same sync was kept. With 9 modules (FM Synth; VECTOR on three
tracks): 4 minutes at 90-100 % while playing, no stall. On `462fbd2b` since 5 Nov, 9 of 9 restored. No records
since 5 Nov.

**7 Nov pull:** unit 2 took the USB update from `a542a515` to `9b3ba417` at 08:24 (back in 13 s), was sent its
16 modules again, then two more at 08:25: Mini Verb, Tape Echo, Euclid, Repitch, TapeHead, E-Verb, LOFI2, Scale
Quantizer, FM Synth, Preview Vol, Sidechain, Play Modes, Mute Modes, Recorder Loop, Quant Live Rec, Deja Vu,
Temp Save and Beat Slicer. It played at 137 BPM; the site's readings climbed from 54 % (08:25) to a 64 % mean and
89 % peak (08:25-08:30), then 93 % at 08:30:55, the last reading. The next start (about 08:33, after a restart)
carried stall reason 1 (frames stopped). No shed, no freeze, no crash. The site recorded no disconnect at the
restart, so the stall's moment is only bracketed (08:31-08:33). The tester then removed E-Verb; the other 17 played
about 2 hours at 65-80 % (peaks up to 90 %) with no stall.

The unit's log holds three earlier stalls since 25 Oct, all with E-Verb, TapeHead and Euclid installed (finding
74's trio) among 16 to 23 modules: one on `76d6a12b` (25 Oct), one on `6134a8bf` and one on `a542a515` (both in
sessions without the site). Two other sessions with the trio on `a542a515` played 70-90 minutes at 90 %+ without
one. Unit 3 on `9b3ba417` with 19 modules, E-Verb and TapeHead but not Euclid, ran at 90 %+ for up to three
minutes at a time while playing, with no stall. So the trio installed is not enough on its own, and VECTOR and POLY8
are not needed for a stall.

## Finding 77: a freeze on an idle unit after the site's link went quiet

Unit 3 took the USB update from `462fbd2b` to `9b3ba417` at 15:30 (back in 11 s) with 19 modules. It played at
up to 98 % CPU until about 16:09, then stood stopped at 55 % with no key pressed (the last, STOP, ended playback).
The site's readings came every five minutes until 18:04 and then stopped, with no disconnect recorded. At about
18:11:30 the UI tick stood still and never came back before a restart (a `freeze` record with no length). A restart
at about 18:47 restored 19 of 19; the crash and stall counts did not change.

The site would have sent `unresponsive` had it still been reading, so the link went quiet first, as when the
computer sleeps. Finding 75's freeze followed the USB device leaving and returning, finding 77's a link drop 90 s
before. The base has no USB-suspend handling of its own (no `suspend` in `sdk/machines/octatrack/elekloader/`), so
the host-sleep link is a guess. On the unit: connect a set to the site, let the computer sleep, and read the log
after 10 minutes.

## Finding 78: base updates

Three more updates to `9b3ba417`: from `9280d484` (6 s), `462fbd2b` (11 s) and `a542a515` (13 s). All came back
on the new base, none carried a stall at the first start, and each set was sent again and kept. Unit 2's stall
(above) came about 7 minutes after its update, while playing.

## Also

Five syncs started and five kept (no refusal), no self-test, no crash, no `unresponsive`, no browser error since 6
Nov. Unit 1 and the unit that showed `in use` on 1 Nov have not connected since.
