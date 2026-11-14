# Analog Rytm MKII test runner

[`tools/rytm_test.py`](tools/rytm_test.py) runs case files on rytm-emu's `dtboot` or on a unit, over the
[development link](LINK.md), and judges the screens, memory and sound it gets back. One case drives both: it is
compiled to link requests on a timeline in milliseconds; the emulator gets them as USB MIDI events at instruction
clocks (200 million a second), the unit over USB MIDI at wall-clock times, and the same code judges the replies. Cases
live in [`tools/cases/`](tools/cases/README.md), a module's in a folder named by its id. Written by Nathaniel Pavel.

The [test-on-unit skill](../../../.claude/skills/modwerk-test-on-unit/SKILL.md) has the order of a session's work;
this file is the reference.

## Set up

- Python 3 with `mido` and `python-rtmidi` (the link), and `numpy`, `soundfile`, `sounddevice` for cases with sound
  (`rytm_audio.py` loads only for those). A virtual environment outside the repository is fine.
- rytm-emu from `npm run upstream:tools`, built once with `cargo build --release` in its checkout: `dtboot` is the
  binary (`--emu` or `RYTM_EMU`).
- A test image: a development base (`npm run machine:base -- analog-rytm-mkii --stock STOCK.syx --dev --out DIR`,
  the send-bus one unless the set has no send effect), linked with your module and those it must be tested beside by
  `node scripts/link-image.mjs --stock STOCK.syx --version XX01 --out IMAGE.syx --elemod DEV.elemod --module
  analog-rytm-mkii:<id> --lock-in RUNNING.store-lock.json --lock-out XX01.store-lock.json`. A new four-character label
  for every build; `ramSpare` 68 B or more. Images, lockfiles, reports and recordings stay outside Git.
- On the unit: a development base flashed once by hand (Transfer and YES, as any image). From then on test images
  RAM-boot over the link (`rytm_link.py ramboot IMAGE.syx --label XX01`, about 20 s, nothing written to the flash) and a
  power cycle brings the flashed base back. USB CONFIG: OVERBRIDGE for cases with sound.

## Run

```
rytm_test.py check CASE...                          # parse, print each timeline; touches nothing
rytm_test.py emu IMAGE.syx CASE... --emu DTBOOT     # emulator; --jobs 4
rytm_test.py unit CASE... --label XX01 --image IMAGE.syx --allow-state-change   # the unit
```

A CASE is a `.case` file or a folder of them. Options: `--out DIR` (report folder), `--cache DIR` (snapshots and runs,
default `~/.cache/rytm-test`), `--refs DIR` (references, default under the cache), `--record` (write references),
`--note-channel` (the unit's AUTO CHANNEL, default 14). For the unit: `--label` is the *flashed* image's label, also
while another image runs from RAM; `--image` makes the runner check by CRC that the unit runs exactly that image (leave
it out to test what is flashed); `--allow-state-change` lets cases not marked `state: safe` run; `--boot-settle S` (the
first case starts no sooner than S seconds after the boot, default 6: the first note right after a boot can be silent,
on stock too); `--audio` (audio device name part, default `Analog Rytm`); `--port`.

Exit 0 when every case passes, 1 otherwise, 2 for a case that cannot be read or a run that had to stop. The report
folder gets `report.txt`, `report.json`, and per case every screen as a PNG and a `diff-*.png` for each screen
compare that found a difference.

The emulator run boots the image once, arms REMOTE CTRL by panel presses and saves a snapshot; each case resumes it,
so cases do not see each other and run in parallel. A `FAULT vector` or `BREAK` from dtboot makes the case an error.
Check every new image answers there before the unit sees it.

The unit run reads `ident` before each case and refuses a wrong label, a disarmed unit, a person at the unit or a
playing sequencer; stops at the first `person at the unit` or `not armed` and skips the rest; sends `release` when it
leaves, also on Ctrl-C, SIGTERM and SIGHUP (not on SIGKILL or a pulled cable: a held key then stays held until a person
presses one); marks a case an error when the link's person or drop counters moved while it ran. A request that cannot
go at its time goes late and moves the rest of the case by as much (`late_ms` in the report). It never flashes or
resets. Cases run one after another on the state the last one left. A run that stops on `no reply` is run again.

## A case

Header lines, then steps; `#` starts a comment.

```
name: my-case            # default: the file's name
state: safe              # or changes (default): may alter what the unit has saved
start: home              # or as-is: home presses NO three times first
transport: stopped       # or any: the unit run refuses a playing unit otherwise
settle: 250              # ms before a capture that follows input
target: any              # or emu, unit: the other target logs NOT RUN
ignore: 0 0 128 8        # X Y W H no screen compare looks at; more after commas

key TRIG                 # a tap; key FUNC+YES is a chord, key DOWN x8 repeats
hold FUNC                # down until `release FUNC` or `release all`
nudge A +2               # exactly two steps of knob A (A-H, LEVEL), up to 31
nudge B +6 per 3         # 3 counts a step (1 to 8; AMP and FILTER pages)
enc LEVEL +1             # one raw count message, up to 127: menus, tempo
nudge LEVEL +21 per 6 x4 # xN (1 to 64) repeats a nudge or enc
wait 3500
screen up                # capture the screen under a name
mem m 0x417e32b8 1       # capture 1 to 1024 bytes
ident i                  # capture the link's ident
note BD                  # a MIDI note for a track: velocity 100, held 100 ms
note SD 64 250           # velocity 1 to 127, held 10 to 10000 ms
cc 79 42                 # a controller (0 to 119) on the auto channel: the active track's
audio hit BD 1200        # record 1200 ms (20 to 30000) from here: a track, MAIN or IN
expect up != rest                    # two captures of one kind
expect up == ref                     # a screen's recorded reference (never `!=`, never mem)
expect up == rest region 0 9 128 55  # only inside X Y W H
expect m == 00                       # bytes, hex
expect i.armed == 1                  # an ident field: == != < > (text fields: == !=)
expect after.refused == before.refused
expect hit.len20 > 50                # a measure of a sound: == != < >
expect long.len20 > short.len20 + 50 # or another sound's measure, + or - a number
expect a.onset == b.onset within 3   # == and != take a tolerance
expect hit == ref                    # every measure against the recorded ones
```

Every case starts with `release` and ends with the up of every key still held, then `release`. References are kept
per target, `<refs>/<case folder>/<case>/<emu|unit>/NAME.pbm`, screens and sound measures only: a memory reference
would be a memory dump, so `mem` compares with bytes written in the case or another capture. They are captures of the
unit's screen and never enter Git. `--record` writes a reference only when the case had no problem and every other
check passed, and says when it replaced a different one; it still records whatever the screen shows, so look at the
PNGs before keeping a reference: one recorded from a wrong screen passes for ever. An `expect` that could not be
checked (a failed capture, a short reply, no reference) makes the case an error, never a pass. A case with no `expect`
passes when every request was answered, marked `(no checks)`.

## Writing cases

- Take each claim from the module's README and write the case that would fail if the claim were false. One `.case`
  per behaviour. A case sets everything it shows (tempo, track, page, parameters, by `cc` where the parameter has
  one), puts back what it changed, and its header says what it changes and what it ends on.
- Compare screens by `region`: the rest of the frame depends on kit, tempo and what ran before.
- A comparison with stock needs numbers measured on a link image without the module (the same core and storage
  layout), RAM-booted in the same session with the same case; an ordering alone often passes on stock too.
- Find a gesture on the emulator first and look at the screen it gives.
- Have the cases reviewed independently (the cases, the module's README and code, and this file; not your
  conclusions) before the unit run. Reviews found real faults each time: a STOP racing the last trig, a count the
  take could not reach, a header claiming a path the case never exercised.
- On the unit, run plain first: new screens come back as "no reference". Look at the PNGs, run with `--record`, then
  plain again to see it pass.

## Timing the runner keeps

The link's turns take stock's per-knob filter ([LINK.md](LINK.md#turns)):

- `nudge` waits until the knob has rested 3 s since its last turn, sends 16 counts the other way, then all steps as
  one turn. One unit is one step where the divisor is 4 (NOT, TUN); `per 3` makes it one step on the AMP and FILTER
  pages. Check a new parameter's step with a `screen` first.
- A turn comes at least 300 ms after the last key change, a key change 100 ms after the last turn.
- With `hold FUNC` down, the first `nudge` after a plain turn sends a throw-away nudge first (the one stock drops). On
  the unit the runner reads stock's FUNC-turn byte (0x417e32b8) before each case with a FUNC nudge and compiles the
  case to match; a FUNC `nudge` after a raw `enc` is refused. Keep FUNC nudges away from a value's ends. FUNC inside
  a `key` chord does not count for a turn: use `hold`.

Not kept for you:

- Stock shows the page's name in the title bar for a few seconds after a page key, and the value overlay for about
  2.3 s after a turn (a `cc` shows none). A screen meant to equal another is taken `wait 3500` after a page key and
  `wait 3000` after a turn; a screen meant to show a turn `wait 750` after it.
- TRIG pressed on its own page shows its second page, kept into the next case: press another page key first. SMPL
  pressed on its own page toggles the knob and waveform views, and the view survives the case: press AMP first. A
  boot shows the knob view again.
- Read a parameter by its target (0x8000e5b0 + 84 x track + 2 x index) or smoother state (0x8000eeec + 168 x track +
  4 x index, 16.16), not its effective word: the scratch project may modulate it.
- Stock lists open on the row they were left on: press UP before counting down.

## Sound

A `note` goes as plain USB MIDI on the auto channel, its number the track's index (BD 0 to CB 11). A `cc` sets a
parameter of the active track whatever it was, so a sound case sets every parameter it depends on first: AMP ATK 78,
HLD 79, DEC 80, OVR 81, DEL 82, REV 83, PAN 10, VOL 7; FILTER ATK 70, DEC 71, SUS 72, REL 73, FRQ 74, RES 75, TYP 76,
ENV 77. An `audio` window is cut from the Rytm's 12 USB audio channels at 48 kHz (MAIN L/R, eight voice outputs,
AUDIO IN L/R; RS and CP, MT and HT, CH and OH, CY and CB share an output): rytm-emu's `--usb-wav` on the emulator, the
OVERBRIDGE audio device on the unit.

Measures: `peak` and `rms` in dBFS; `hits`, the runs above 20 dB under the peak (25 ms under it ends one); `dips`, the
times the level falls 30 dB under the peak for 1 ms or more inside a hit and comes back within 20 ms; `gapmin` and
`gapmax` between dips; of the first hit `onset`, `attack`, `len20`, `len40` in ms (0.5 ms bins), and `pitch` in Hz. A
window that peaks under -70 dBFS has 0 hits. Check silence as `x.peak < y.peak - 40`. The report keeps each window as
a WAV (never in Git); a sound reference is the measures only, compared within `AUDIO_TOL`. The emulator's voices
follow the unit's only roughly, so a case that checks how long or how loud is `target: unit`. On the unit the
driver's time stamps place a window to a few ms; `rytm_audio.py`'s `Recorder` counts the zero blocks the driver
inserts.

## Sequencer gestures

Seen on rytm-emu and a MKII, 10 November 2026. The unit takes PLAY and STOP 20 to 70 ms after they are sent: send a
STOP 130 ms or more before the trig it must come before. The tempo popup covers y 13 to 49 only: compare it as
`region 40 15 88 33`. In GRID RECORDING: `hold FUNC`, `key Tn` places a lock trig; `hold Tn`, then `key RIGHT` or
`LEFT` opens MICRO TIMING and moves the trig 1/384 of a bar a press; `hold Tn`, `key RTRG` opens the retrig menu, a
second `key RTRG` sets RETRIG on, UP or DOWN steps the RATE. A trig condition: on the TRIG page hold the trig and
`nudge D +1 per 6` shows the value, a second locks 100 %, and `nudge D +N per 6` moves N places in the list; a
re-hold shows 100 % whatever is locked, so compare before the release (`region 95 9 33 19`). A sound lock's list
(hold the trig, turn LEVEL) moves one sound for 9 turns of 4 only 400 ms or more apart. `cc 94 127` mutes the active
track, `cc 94 0` unmutes it. Stopped, `hold BANK_A`, `key T2` selects A02, with its own kit and tempo. A case never
stores sounds: a pool sound it needs is stored by hand to the project's pool, and the header says which.

## Rules on the unit

- The unit is the developer's: run on it only with their go for this run, and tell them beforehand how long, how
  many restarts (every RAM boot shows OS UPGRADE and restarts), hands off, a scratch project open, REMOTE CTRL on.
- RAM boot only for a test; never `flash` without the developer asking for it.
- A scratch project: an image with other modules than the flashed one has another storage layout, and stamps the
  project and every sound and kit it edits; the flashed OS then reads those module settings as zeros. Load no other
  project and never write to the +Drive.
- `a person is at the unit` or `not armed` stops the run. Do not retry: tell the developer and wait.

## What a pass does not show

How a sound is beyond the measures (nobody listens), pad hits and pressure (a `note` is MIDI), LEDs, anything the
128 x 64 frame or the read bytes do not hold, timing finer than about one UI frame, a power cycle, project save and
load, the +Drive and an external clock. An emulator pass is not hardware evidence. Write what the runner measured into
the module's TESTING.md as the rig's report, on the named image, labelled as run by the rig, not by a person, and list
what it could not cover.

## Not tested

The references hold for the kit, pattern and tempo they were recorded on; a pass after a power cycle or on another
kit was not tried. A `cc` followed at once by a `nudge` of the same knob; that note k plays track k for tracks other
than the BD; a sound reference (`== ref`) on the unit.
