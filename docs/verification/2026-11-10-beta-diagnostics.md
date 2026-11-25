# Beta diagnostics, 8-10 November 2026

What the testers' shared diagnostics showed between the 8 November pull (14:54 UTC) and the 10 November pull
(14:35 UTC). Times are UTC. Units 3-5 are those of the [8 November record](2026-11-08-beta-diagnostics.md);
units 6 and 7 are new to these records.

`dd3827f0` (#1098, 10 Nov 09:58) and `5080b8d6` (#1389, 10 Nov 12:13) became the site's base; no unit has taken
either yet. Version 2 logs now come from three testers' units.

## A stall 30 s after a USB sync, and an hour with the frames stopped (finding 71)

Unit 6 took the USB update from `d6bfff70` to `72defb09` at 15:37 and was back in about 10 s, no stall at the first
start (finding 78 holds). At 15:43:33 the site sent 8 modules (Deja Vu, LOFI2, Mini Verb, E-Verb, Output Matrix,
BBD, Euclid, Tape Echo), kept in 2 s, set saved (8 of 8). The stall record (version 12, count 1, reason 1):

- `frames` 1,079,350 (about 392 s into the boot, about 30 s after the set) and `watchTicks` 23,308
- loader: 60 and 20 packets accepted, none rejected, no errors, no eDMA error, `missed` 0
- set: `setModules` 8, `modules` 8, `parked` 8, `reinit` 8, `resCommits` 5, pool 157,168 bytes
- status: CPU 65 %, core 0 41.9 %, core 1 32.8 %: stock's idle load, so no module's DSP code was placed
- stock's frame chain: transfer state 7

The unit did not restart. For the next hour its load windows show CPU 4-8 % with no frame or UI-tick gap (the
frames stood still), and the site's live readings came back empty from 15:53 until the link closed at 16:45; the
site took no health reading after 15:43 and showed the unit as ready. Nothing was playing. Like finding 71, the
stall came within a minute of installs, before anything was placed; E-Verb and Euclid were installed, TapeHead was
not, and no self-test ran.

## Three stalls in a row, and the field's first crash record

Unit 3 (20 modules: E-Verb and TapeHead, no Euclid; FM Synth, VECTOR, Sidechain) on `9b3ba417`, uploaded 8 Nov
15:24: its 7 Nov evening boot ended without a stall or freeze. The next three boots each ended in a stall: one
after 41 minutes (a one-second hot record at 100 % stopped at 2,468 s), then two under five minutes each. The last
stall record (count 13, reason 1): `frames` 152,073 (about 55 s into the boot, after the 20-module restore),
CPU 45 %, core 0 60.7 %, core 1 76.5 %, nothing rejected, no eDMA error, `missing` 1. Two later boots ran 55 and
225 minutes without a stall.

The log also carried a crash record (count 1): vector 3, PC `0x40D52F64`, 164,724 bytes into the module pool of
`9b3ba417` (pool used 279,296), so in a module's ColdFire code. No start in the uploaded log is marked as following
it, so when it happened is unknown. #1321 would name the module.

Then the USB update to `72defb09` at 15:25: back in about 10 s, no first-start stall. The set came back as another
base's set, as designed, but the site's readings stopped a minute later with no disconnect, so the 20 modules were
not sent again; the unit has not connected since.

## Also

- Unit 5 (`9b3ba417`, 6 modules) stayed connected and stopped for about 70 hours in one boot (minutes 1,375 to
  4,225): CPU 42 % (peak 42.8 %), longest frame gap 424 µs, UI-tick gap 48 frames, no stall, freeze or crash.
- Unit 7 is back on `9280d484` (version 1 logs) with 8 modules restored 8 of 8 (FM Synth on T1 and T3): three
  sessions on 9 Nov, playing, no stall. Its 6 Nov update to `9b3ba417` is no longer the running base; how it went
  back is not in the log.
- UI-tick gaps of 3,491 to 4,356 frames (1.3-1.6 s) appear only in a boot's first five-minute window (start-up
  and restore), never later. Not a freeze (13,781).
- One sync started and kept, none refused. No self-test, freeze, `unresponsive` or browser error.
