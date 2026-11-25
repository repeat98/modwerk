# Octatrack diagnostics pass, 25 November 2026

An owner's pass ([/modwerk-diagnostics](../../.claude/skills/modwerk-diagnostics/SKILL.md)) over the diagnostics members
share. Nothing below was reproduced yet: every open item is a hypothesis with the step that would confirm it. No code
changed in this pass.

## Evidence

The pull used the read-only D1 route (the read key for `npm run diagnostics:pull` was missing in the environment). It
returned 29,650 retained records from 231 sharing identities, uploads up to 2026-11-25 14:04 UTC. The pass read the
records uploaded since the previous pass's pull (2026-11-23 07:49 UTC): 3,859 records from 56 identities, mostly from
bases 0.8.1 (`eb667962`) and 0.7.13 (`6d23e888`).

Stability per base from the summary (the owner's development unit left out; incident logs cover each unit's history,
not only this window):

| Base | Units | Hours logged | Stalls | Crashes | Freezes until a restart (playing) | Syncs kept |
| --- | --- | --- | --- | --- | --- | --- |
| 0.8.1 | 38 | 71.1 | 1 | 0 | 2 (0) | 84 of 98 |
| 0.8 | 10 | 18.1 | 0 | 0 | 0 (0) | 19 of 22 |
| 0.7.13 | 45 | 145.1 | 0 | 0 | 5 (3) | 71 of 99 |

## Not open

- **Refused syncs (18 records, 9 units).** Every one was a loader refusal the site already words for the musician
  (`octatrack-link.ts`): 7 in use (8 records, with the modules to look for since 16 November), 2 module memory (3),
  5 busy (2, retried by the link), and 0 before the start's restore (3, on 23 November, before #2129 said so). Each unit
  had a kept sync 0 to 77 minutes later. One trial on 0.8.1 with USB Audio in the set ended `reconnect=timeout`; the unit
  kept a sync 15 minutes later.
- **Build failures (13, one unit, Analog Rytm MKII).** Card-build selection checks, which the summary already counts as
  refusals on module changes, not failures.
- **`link_failed`.** `no-device` (15) is the device picker closed without a unit (`NotFoundError`); each of those units
  connected minutes later. `no-webusb` (4) is a browser without WebUSB. `claim-failed` (18) shows the busy message.
- **Freezes the summary marks as an OS upgrade or USB disk mode** (the keys PROJ … YES before them), on 0.7.13, 0.8 and
  0.8.1.
- **A freeze after 43.7 hours running, stopped, nothing playing**, on base 0.7.5: an old base.

## Open: hypotheses

### 1. A DSP stall on 0.8.1 with fourteen modules

A unit restored 14 modules 49 s after power-on: Mini Verb, Tape Echo, Air Chorus, E-Verb, BBD Delay, LOFI2, SC Ringmod,
Vibrato, Resonator, FM Synth, Mute Modes, Tuner, Slow LFO and Bar LED. At +1m25s, stopped, CPU read 100 % and T1-4 0.0 %
(core 0 no longer reporting) with T5-8 at 41.8 %. The next start read the stall record (reason 1) and restored 11 modules,
then ran normally. Same family as [finding 79](../OCTATRACK_BETA_TEST_PLAN.md) (open).

To confirm: restore this set on a unit, stopped, and watch T1-4 for the first two minutes; then drop Resonator, SC
Ringmod and Vibrato in turn.

### 2. A freeze two seconds after power-on on 0.8.1, before the restore

A unit's previous start logged USB Audio "the host never enumerated it: offered again". The next start froze at +0m2s
with CPU 96.6 %, both DSPs at 0, nothing pressed and the set (USB Audio only) not yet restored (it restores at about
+4 s). The start after that ran. Like [finding 75](../OCTATRACK_BETA_TEST_PLAN.md) (open).

To confirm: save USB Audio in the set and power the unit on repeatedly, cabled to a host that does not enumerate it and
with no cable.

### 3. A freeze while stopped after 4 h 50 min on 0.8.1

A unit with ten modules (among them a module machine on T1) logged frame-guard skipped renders on T1 for hours, short hot
spells while stopped, and then a UI freeze at +289m45s, stopped, CPU 42.3 %. Same unexplained family as the 0.7.12
[stall and playback freeze](2026-11-21-octatrack-stall-and-playback-freeze.md).

To confirm: a soak on a unit with a module machine on T1 and the frame guard shedding, watching the UI tick.

### 4. Shared records repeated up to five times in one second

`connected`, `disconnected`, `health` and `load` records arrive two to five times within the same second, each with its
own id, from 9 units on Windows and macOS. Pre-link failures also break their once-per-ten-minutes limit (one unit sent
five `no-device` in 17 minutes). The collector runs once per page and its cleanup removes every listener and timer
(`App.tsx`, `collectOctatrackDiagnostics`), so these look like several Modwerk tabs, each holding a working link to the
unit, rather than one tab sending twice. It would fit the connect and disconnect flapping two units show (three changes in
two seconds). If it holds, the busy message (`linkBusy`) never shows for these members, and several tabs read the unit at
once.

To confirm: two tabs and one unit on Chrome 158, on Windows and on macOS: do both reach `ready`? Instrumentation that
would show it from the field without an identifier: the number of open Modwerk tabs (a BroadcastChannel count) on health
records. That extends the contract and the consent text, so it waits for the owner.

### 5. An unhandled `TypeError` on the Octatrack page

A unit on 0.8.1 (Chrome 158, Windows) sent two pairs of `unhandled_rejection` records exactly five minutes apart, starting
three minutes after a disconnect, a `no-device` and a reconnect. Pairs fit hypothesis 4. The records carry the error
type only, by design.

To confirm: unplug and replug quickly on the Octatrack page and wait ten minutes with the console open; look for work on a
five-minute timer there.

### 6. `browser_error` `OtherError` on the configuration page

17 records from 2 units since 15 November (15 within two minutes on 24 November, Chrome on macOS). An `ErrorEvent`
without an error object is counted as `OtherError` (`diagnosticErrorKind`). The site uses no `ResizeObserver`, so a
browser extension or a cross-origin script is the likelier source than site code.

To confirm or filter: a separate error kind for "no error object", so this splits from real non-standard throws.
Contract change, so it waits for the owner.
