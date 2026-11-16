# Beta diagnostics, 12-16 November 2026

What the shared diagnostics showed between the 12 November pull (09:31 UTC) and the 16 November pull (07:12 UTC):
7,290 records from 87 units, on 16 base generations. `f6422fa6` has been the site's base since 14 November; about
50 units run it. Times are UTC. Nothing here was reproduced on a unit; each section says what would confirm it.

## Most "freeze until a restart" records follow one key walk while stopped

34 such records from 20 units in the 30 days pulled, nearly all since 11 November. 21 of them (12 units) were
taken stopped and end on the same keys: PROJ (FUNC + MIX on an MKI), one to four arrows, YES, YES. Five of the 21
are followed by a start on another base, so those are stock's OS upgrade seen by `diag.c`'s freeze watch, as
finding 55 is for stalls; the pull now says so. In 14 of the 21 the next start had nothing installed. The other 16
kept their base; one unit shows the walk five times in five hours on `f6422fa6`, its set restored after each. The
same image written again, USB DISK MODE or a project action would all fit (finding 72), and the records cannot
tell them apart.

To confirm: on a development unit, run PROJECT > SYSTEM > USB DISK MODE and an OS upgrade to the same base, and
read the log for a freeze record. If either leaves one, the freeze watch should stay out of it as the stall
watchdog does (`modwerk_machine_usb_disk`, `modwerk_flash_quiesced`).

Four records (three units) were taken while playing, at 60-83 % CPU, three of them with 14 modules installed; one
is on `f6422fa6`. They are the ones to read as hangs. One further unit froze stopped after DOWN, FUNC + YES five times
in a row (sample previews in a file list) with 14 modules installed, on `4854b76c`.

## Sync failures on `f6422fa6`

Ten in the shared records, from six units, 14 to 16 November (everyone, sharing or not, started 144 syncs on 15 and 16 November):

- seven "in use" refusals (loader refusal 7) on four units. One unit was refused four times in half an hour before
  a sync was kept. The message names no track and no module.
- two "conflict" refusals (refusal 3) on one unit, a 16-package sync after a restart, 90 minutes after a freeze.
- one `unsafe` at the staging step on one unit; the next sync a moment later was kept.

No transport failure and no failed save on `f6422fa6`. Earlier generations had 39 transport failures at staging
(four units, one of them 21 times on Windows) and four "couldn't save" reports (three units); the save report was
reworded on 13 November and the base update retries since 14 November.

## A restore that drops the same module at every start

One unit on `f6422fa6` has a saved set of 12 modules. At six of seven starts the restore loaded 11 and refused SC
Ringmod for module memory; at the seventh it refused Tape Echo instead (no free handle). A sync then added the
twelfth again and it was kept, 12 of 12 running. A set the unit accepts at a sync should fit again at the restore.
To confirm: restore that set (Mini Verb, Tape Echo, TapeHead,
E-Verb, BBD Delay, LOFI2, Scale Quantizer, FM Synth, Play Modes, POLY8, Deja Vu, SC Ringmod) in the emulator.

## Stalls on `f6422fa6`

- One unit, playing, CPU 100 %, eight modules with FM Synth and Syntiz: the last frame began 145 µs late after a
  515 µs gap, which fits the late frame entry (`docs/MODULE_PERFORMANCE.md`).
- Two units, 10 s and 49 s into the first start on a newly written base, nothing installed yet, CPU 52-58 %, every
  frame on time, no loader error. Both ran normally from the next start. Finding 78's shape, after its fix.

## Connecting

40 `claim-failed` link failures from 11 units (25 on Windows from nine units, the last on 15 November) and 16
`no-device` from 11. A claim failure carries no base, so the records cannot say whether those Windows units run a
base with the new USB device revision.
