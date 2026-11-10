# Beta diagnostics, 7-8 November 2026

What the testers' shared diagnostics showed between the 7 November pull (14:07 UTC) and the 8 November pull
(14:54 UTC), with finding 72's 6 November note moved here from the findings log. Times are UTC. Units are
numbered, not named: unit 3 is the unit of the [7 November record](2026-11-07-beta-diagnostics.md); units 4 and 5
are new to these records.

Since 8 November about 08:50 the Worker accepts version 2 device logs (#1316). Loads now carry the longest frame
gap and UI-tick gap, and a log can carry the last stall and crash record. One unit has sent them so far.

## Finding 72: a stall with nothing installed, and the first full stall record

**6 Nov pull (moved from the findings log):** a unit's log first uploaded on 6 Nov shows the walk on 20 Oct
(`9280d484`, nothing installed): PROJ DOWN RIGHT YES YES at 99 % CPU stopped. Within seconds the site lost the link,
and about 40 s later it briefly saw a USB device without Modwerk's interface, as USB DISK MODE would present (not
checked on a unit). The next start carried stall reason 1 on the same base. A development unit made the same walk
before a base change (an OS upgrade from the card, stall at the new base's first start), so the keys alone don't
tell the two apart. One more on a 14-module unit (`9d3ab3e9`, 1 Nov); two starts later it took a USB update and
came back with 14 of 14.

**8 Nov pull:** unit 5's log began on `9b3ba417` (a new log, no earlier stall counted). Its first start had nothing
saved and nothing installed, and only nine keys were pressed. 109 s in, a hot record shows CPU 100 % stopped after
FUNC PROJ NO PROJ DOWN RIGHT DOWN UP YES. The DOWN and UP cancel, so this is the PROJ DOWN RIGHT YES walk. The next
start, on the same base, carried stall reason 1. All of it happened before the site first connected. The pull's
hint did not label it, because it wanted YES right after RIGHT.

Its stall record is the first one the field has sent in full (85 report words, version 12; `scripts/device.mjs`'s
report names cover the first 78):

- reason 1 (frames stopped), stall count 1
- loader: phase 0, 44 packets accepted on each core, none rejected, no errors, no eDMA error, `missed` 0
- set: none installed (`setModules` 0, `setResult` 2 = nothing saved, `modules` 0, pool 0)
- stock's frame chain: transfer state 7, frame interrupt not busy, nothing pending (IPRL 0)
- status: CPU 64.7 %, core 0 48.5 %, core 1 about 41 %
- `frames` 45,711 and `watchTicks` 804

45,711 frames of 16 samples are about 16.6 s. The test fires after 30 still ticks (half a second), so 804 ticks
are about 13 s. Both counters put the stall about 15-17 s into a boot, not at the walk 109 s in. Either stock
resets the base's counters when it enters what the walk opens, or the stall came early in the first boot, with
nothing installed and few keys pressed, and the walk didn't cause it. On the unit: make the walk with nothing
installed and read `npm run device -- stall`. If `frames` restarts, the counters reset; if it holds the moment of
the walk, they don't.

After the stall the site sent 6 modules (Scale Quantizer, Mute Modes, Quant Live Rec, Output Matrix, Repitch,
Preview Vol), all kept. A restart restored 6 of 6. The unit then sat stopped and connected to the site for about
23 hours: 168 five-minute loads at 42 % CPU (peak 42.7 %), longest frame gap 423 µs (frames are 363 µs, the DSPs
starve past about 515), longest UI-tick gap 48 frames. No freeze and no further stall, so a long idle link alone
does not freeze this unit (finding 77).

## Finding 78: base updates

Unit 4 took the USB update from `20a259c5` to `9b3ba417` on 7 Nov at 14:19 and was back in about 12 s. Its first
start carried no stall, and the set came back as another base's set, as designed. The site sent its 14 modules
again within a minute, kept, then Temp Save (15). The log also uploaded three earlier starts on `20a259c5` since
1 Nov: two one-second hot records at about 99 % stopped during key presses, no stall, no crash.

`72defb09` (#1332) has been the site's base since 8 Nov 13:48. No unit has taken it yet.

## Also

Four syncs started, four kept, none refused. No self-test, crash, freeze, `unresponsive` or browser error. Unit 3
(20 modules with Bar LED) restored 19 of 19 on 7 Nov and kept one more. Its site readings stopped at 17:49 with no
disconnect, as before its 6 Nov freeze; what followed shows only at its next upload. Unit 4's first reading at its
evening start was refused `busy` while the restore ran; 15 of 15 restored.
