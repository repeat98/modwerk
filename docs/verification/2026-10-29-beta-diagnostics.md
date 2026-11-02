# Octatrack beta diagnostics pull — 29 October 2026

The shared diagnostics up to 28 October 2026, 20:05 UTC, read for the findings log in
[OCTATRACK_BETA_TEST_PLAN.md](../OCTATRACK_BETA_TEST_PLAN.md). Testers are not named. Times are UTC.

**Base identities on main.** `903f8ed6` (#992), `6541d7e9` (#1017), `88c68eed` (#1026) and `9b7e0eb3` (#1030, the same code as `88c68eed`). The site offers `9b7e0eb3`.

## New: finding 77, UI freezes while playing on `9b7e0eb3`

- **Unit.** An MKII, about 6.5 minutes into its first boot after the USB update to `9b7e0eb3` (28 Oct, about 18:47).
- **Freezes.** Six `freeze` records within 13 s (+6m29s to +6m42s). The UI tick stood still 9.1, 9.1, 7.3, 5.4, 9.1 and 5.4 s while the audio frames ran.
- **State.** CPU 100 % (T1-4 32.5-36.2 %, T5-8 48.6-50.4 %), playing at 150 BPM. 11 modules installed: Tape Echo, Repitch, Preview Vol, CC Map, VECTOR, Play Modes, Recorder Loop, Output Matrix, Quant Live Rec, Apply Scene, Arp Key Locks. No module machine on any track.
- **Keys.** Before the first freeze: FX1 and FX2 pages, T1 pressed four times (more than 77 s earlier), then STOP and PLAY. After it only PLAY and STOP.
- **Site link.** It dropped about 90 s before the first freeze, so no site window was polling the unit. This argues against finding 75's guess of two site windows.
- **After.** No stall, no crash. A restart 3 minutes later ran more than 25 minutes with no freeze.
- **Why it matters.** The first freeze on a current base. Finding 75's was on `52b22249`, before the frame guard.
- **Next step.** On the dev unit with `9b7e0eb3` at high CPU: STOP and PLAY after FX page edits while playing, then the same on `903f8ed6`.

## Finding 72, a new occurrence

- Base `c1ae2ee9`, 27 Oct about 11:40. 9 modules installed, none of finding 74's trio (E-Verb, TapeHead, Euclid).
- Keys: PROJ DOWN RIGHT YES, PLAY/STOP three times, NO, at 100 % CPU while stopped.
- Six self-tests in a row then found the DSPs already stopped (failed 4 and 132: bits 2 and 7) until a power cycle. The next start carried stall reason 1.
- So the walk that ends in NO stops the DSP side without 74's placement. 72 is its own bug, not 74.

## Finding 71, a second occurrence

- Base `903f8ed6`, no base change. A power-on restore of 15 modules, E-Verb and TapeHead among them.
- A `hot` record at +61 s: 98.4 % CPU, stopped, no key pressed all boot.
- A stall record (reason 1) at the next start.

## Finding 69, BUSY confirmed in the field

- Refusal 5 (`RUNTIME_BUSY`) on Ring SC at power-on, and the restore left Ring SC out: 19 of 20 saved packages (14 of 15 modules) restored.
- Two units, three power-ons, bases `903f8ed6` and its main-cue USB Audio variant `2ba936b9`, 28 Oct about 00:00-00:10.
- All of them ran before #1026's retry (base `88c68eed`). That retry has not yet run in the field with Ring SC.

## Finding 76, fixed in the field

- No shed of renders on module-free tracks with FM Synth installed on `9b7e0eb3` (issue #999, fixed in #1017, base `6541d7e9`).
- Watch: one unit runs 90-100 % CPU while playing for about 25 minutes (179 and then 466 half-seconds at 90 % or more, 120 BPM) with no shed, stall or freeze.

## Other observations

- **`stale` on the first sync after a base update.** Seven sync failures `sending error=stale`, 26-28 Oct, each the first sync after the unit's base changed. A fix is being opened as its own pull request.
- **A stall at the moment of a USB base update.** It happened on two units, not on a third.
- **Sync counts.** 28 Oct: 7 started, 6 kept, 1 failed. 27 Oct: 19 started, 11 kept, 8 failed.
