# Bar LED testing

## Commands and exact revision

Source: `sdk/octabam/modules/bar-led` (drafted in `sdk/drafts/bar-led`). OS: stock 1.40C (the owner's own `OCTATRACK_OS1.40C.bin`, decoded MAIN OS kept outside the repository). Port: `ot_emu` from octabam.

```sh
# the gate (from an octabam root holding out/emu/ot_emu and out/raw/section_3_MAIN_OS.bin)
python3 tools/emu/ot_emu/stage_card.py out/test-project OCTABAM BARLED --out <card.img>
BAR_CARD=<card.img> BAR_PROJECT=BARLED python3 <modwerk>/sdk/octabam/modules/bar-led/verify.py
# the USB package
python3 -B sdk/runtime/loader/build.py --octabam bar-led --name "Bar LED" \
  --upstream ~/.cache/modwerk-upstream/elekloader -o bar-led.mwrm
```

## ot_emu (2 November 2026)

Not hardware evidence: the port shows which LED ids the firmware asks for, not what the LED shows.

| Run | What was watched | Result |
|---|---|---|
| Stock, `--sequencer --internal-clock` | the beat-flash call `0x40056f24`; writes to the transport word `0x800065b8` | The transport word becomes 1 (playing) before the first flash, then one flash per beat, each `set_led(38, 3)`. No flash before the transport start. |
| Stock, the same | writes to `0x800065b2..0x800065b7` | `0x800065b6` counts ticks within a step (0..5 at 1x); `0x800065b4` is the master step now playing, `0x800065b2` the next. The master step is written before that step's beat flash, and wraps at 16 on the 16-step pattern. |
| Stock, pattern A01's length (bank RAM `0x400e21e0 + 0x8e53`) poked to 12 | `0x800065b4` | Wraps at 12: the master step follows the pattern's length. |
| Unit preloaded at `0x400d24d0`, `jsr` to it at `0x40056f24`, length 12, 16, 20 (`verify.py`) | every master-step write and every `set_led` call returning to `0x40056f2a` | Green (39) on every flash at step 0, red (38) on every other, each for 3 ticks: 12 steps `G@0 r@4 r@8` repeating, 16 `G@0 r@4 r@8 r@12`, 20 `G@0 r@4 r@8 r@12 r@16`. **PASS.** |
| The same, length 14 | as above | `G@0 r@4 r@8 r@12 G@2 r@6 r@10 G@0 …`: the pattern's 1 falls mid-beat every other pass, and the green comes on the first flash after it. |
| Built into the owner's private octabam remix `home-base` 5 (native card build; the unit linked at `0x40ac1384`), length 16 and 12 | as above, on the built `mainos_bus.bin` with nothing preloaded | 16 steps `G@0 r@4 r@8 r@12` repeating, 12 steps `G@0 r@4 r@8` repeating. |
| Static: the decoded 1.40C | `pea 0x27` before a call to `set_led` or the other LED writers (`0x400136f4`, `0x400131a0`, `0x400131c8`) | None: stock passes no literal 39, so the module lights an LED stock leaves alone. Computed ids were not traced. |

Not run in the port: STOP then PLAY again, pause and continue, a tempo change while playing, external MIDI clock, a pattern change, per-track mode with a MASTER LENGTH, pattern scales other than 1x.

## ot_emu: pause and continue (5 November 2026)

The owner's review found that the first source rearmed on every flash while the transport word `0x800065b8` was not 1, and that word is 2 while paused (stopped with the position kept, `docs/firmware/STEM_REC.md` in octabam), so the first flash after continuing would have been green wherever the pattern was. `unit.s` now rearms only on 0 (stopped and rewound). `verify.py`'s fourth run pauses and continues twice in a 16-step pattern by writing the word:

| Source | Flashes (G green, r red, @ master step) | Result |
|---|---|---|
| before the fix | G@0 r@4 r@8 r@12 G@0 r@4 r@4 r@4 **G@7** r@11 r@13 r@13 **G@14** G@2 r@6 | FAIL: green after each continue |
| this source | G@0 r@4 r@8 r@12 G@0 r@4 r@4 r@4 r@7 r@11 r@13 r@13 r@14 G@2 r@6 | PASS |

The poke leaves the beat ticks running, so after it the flashes fall on steps 7, 11, … and the first after the wrap on step 2; the stock pause path may realign them. The three runs at 12, 16 and 20 steps still pass.

## ot_emu: a pattern change while playing (7 November 2026)

`verify.py`'s fifth run, stock 1.40C with the unit preloaded, a staged card's project (`slow-card.img`, project `SLOW`). A01 is set to 16 steps and A02 to 12 in the bank's RAM, then a panel script presses [PLAY] and, in A01's first pass, [PTN] + [TRIG 2]. Stock switches at A01's end: the playing-pattern byte `0x800065be` turns 1.

| Flashes (G green, r red, @ master step; (A02) once A02 plays) | Result |
|---|---|
| r@– G@0 r@4 r@8 r@12 G@0 r@4 r@8 r@12 G@0(A02) r@4(A02) r@8(A02) G@0(A02) r@4(A02) r@8(A02) G@0(A02) … | PASS: the green lands on A02's 1 on every pass, and A02's passes end on step 8 |

The first red comes before [PLAY]'s first step write (stock's flash while stopped). Emulator only; not run on a unit.

## ot_emu: load and stress (5 November 2026)

[evidence/performance.json](evidence/performance.json) has the full method. Emulator, not hardware: `ot_emu --mkii --dsp --frame`, 62 s playing, a native build of octabam's test remix `bar-led` against the same remix without it, the same MIDI flood on both (one message a millisecond, clock at 250 BPM, four STOP/START pairs). PC watches on the frame handler, the MIDI handlers, the beat-flash call and `set_led`.

| | stock effects | with Bar LED |
|---|---|---|
| longest frame interrupt | 25,388 instructions (144.3 µs in the port's time) | 25,388 |
| idle | 53.46 % | 53.46 % |
| MIDI handler entries (note on / off / CC / clock) | 20,667 / 20,666 / 20,667 / 6,200 | the same |
| beat flashes; instructions from the call to `set_led` | 154; 1 | 154; 8 to 12 |

## Hardware

**Reported by the tester (@nathangroth), MKI, 2 November 2026.** Build: the tester's private octabam remix `home-base` 5 (octabam-home commit `404ef7bd`), a native card build carrying this unit's source, booted from the card through REMIX SWITCH (`/BRAIN/REMIXES/HOMEBAS5.RMX`, SHA-256 `72a711492805c7ef331d8be69617f9bd77e41f858d1481da3779a14dbe4126eb`), not flashed. Before it, the tester's MKI in TEST mode lit the tempo LED red, green and amber.

| Case | Reported |
|---|---|
| Transport stopped | The tempo LED blinks red, as stock. |
| Playing | Green on the first beat of the pattern, red on the others. |
| Several PLAY MODES (the remix's sequencer play modes) | Green only on the pattern's first step in each. |
| A non-standard master length, 17 steps | Green on the right step on every pass. |

**USB, MKI, 4 November 2026.** The tester's MKI on the flashed Modwerk beta base `9680e9ac861ff931…` (built with `npm run octatrack:base -- --beta` from the tester's own 1.40C; it reproduced the committed base), USB straight into the Mac (through a USB 2.0 hub every package upload was refused at EP0 before the loader saw it; small requests worked). Package `bar-led.mwrm` (196 bytes, SHA-256 `bce3b4d6906c5368cb0c129dfa82a215b986d9cbe221c5178053ea8eed1a72a4`) built as above from commit `faa39c79`, sent with `npm run device`. What the unit answered was read over USB; what the LED did is the tester's report.

| Step | The unit answered | The tester reported |
|---|---|---|
| Before: `status`, `do inventory` | base `9680e9ac…`, generation 0, nothing installed | |
| Trial: `try bar-led.mwrm --seconds 120` | staged, trial running, then rolled back; generation 2, active the bare base, nothing installed | Playing: green on the pattern's 1, red on the other beats. Stopped: red only. After the trial ended: red only, as stock (Undo) |
| Keep: `try bar-led.mwrm --seconds 3 --accept` | accepted, card set written; inventory `BAR LED` (module `9b41cd3d`) | Green on the 1 |
| Power cycle (the tester), transport stopped through the boot | inventory `BAR LED` after the boot's restore | Green on the 1 after the reboot |
| Remove: `remove bar-led.mwrm --seconds 3 --accept` | accepted; nothing installed | Red only, as stock |
| Kept again, then `do selftest` (transport stopped), then removed | SELF TEST passed: 1/1 modules intact, 0 with DSP effects, longest frame 391 us, card set saved (1/1); removal accepted, nothing installed | |

**The committed package beside Slow LFO, MKI, 5 November 2026.** The same unit and flashed base `9680e9ac…`, empty inventory before. The committed `0.1.0-experimental.mwrm` (SHA-256 `de7f9caed60bffecc47a33144a223125500c4c8bcbd76e5022d1dc2ee9393600`) and Slow LFO's committed package (`3505194e…`), each sent with the USB session's `try` (accepted at once). What the unit answered was read over USB; the LED is the tester's report.

| Step | The unit answered | The tester reported |
|---|---|---|
| Keep Bar LED, then Slow LFO | generation 1, then 2; inventory `Bar LED` (`9b41cd3d`), `Slow LFO` (`cd8a0e36`) | |
| `selftest` (transport stopped) | SELF TEST passed: 2/2 modules intact, 0 with DSP effects, longest frame 371 us, card set 7, 2/2 | |
| External MIDI clock | | Green on the pattern's 1, red on the other beats |
| A tempo change while playing, internal and external clock | | Shown correctly on both |
| Pattern scale 3/4 and 3/2 | | Green on the pattern's 1 |
| Per-track mode, a track at 2X, master scale 1X | | The track plays through twice before the green: the green follows the master scale, as intended (first reported as "pattern scale 2X"; corrected on 6 November) |
| Per-track mode | | Follows the master length, not the selected track's length, as intended |
| STOP, then PLAY | | Starts again from the top, green on the 1 |
| Pause (PLAY while playing), then PLAY to continue | | The green still falls on the pattern's 1; no green on continuing |

**The same unit and packages, 6 November 2026.** Tester's report: pattern scale 2X in normal scale mode, green on every pass.

Not tested on a unit: a pattern change while playing (emulator only, above), MKII, the site's own install dialog (the same package and base protocol, sent from the command line).

## Stock flows

Not run on a unit. The module changes one call: the beat flash. Stopped, and on every beat but the pattern's 1 while playing, `set_led` gets stock's arguments. No key, page, menu, project, Part or MIDI path is touched.

## Performance

From the source: at most 11 ColdFire instructions before stock's `set_led`, once per beat, in stock's clock-message loop. No per-sample or per-frame work, no DSP code. Measured in the emulator: see the load and stress run above and [evidence/performance.json](evidence/performance.json).

## Resources

ColdFire: one linked unit of 64 bytes (58 code, 2 padding, a 4-byte last-step word in the unit's text), one six-byte detour; USB package 196 bytes. No DSP memory, no project or battery-RAM bytes.

## OT UI capture evidence

None: the module draws nothing on the LCD.
