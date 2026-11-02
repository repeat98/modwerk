# Bar LED testing

## Commands and exact revision

Source: `sdk/drafts/bar-led` on branch `module/bar-led`. OS: stock 1.40C (the owner's own `OCTATRACK_OS1.40C.bin`, decoded MAIN OS kept outside the repository). Port: `ot_emu` from octabam.

```sh
# the gate (from an octabam root holding out/emu/ot_emu and out/raw/section_3_MAIN_OS.bin)
python3 tools/emu/ot_emu/stage_card.py out/test-project OCTABAM BARLED --out <card.img>
BAR_CARD=<card.img> BAR_PROJECT=BARLED python3 <modwerk>/sdk/drafts/bar-led/verify.py
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

## Hardware

**Reported by the tester (@nathangroth), MKI, 2 November 2026.** Build: the tester's private octabam remix `home-base` 5 (octabam-home commit `404ef7bd`), a native card build carrying this unit's source, booted from the card through REMIX SWITCH (`/BRAIN/REMIXES/HOMEBAS5.RMX`, SHA-256 `72a711492805c7ef331d8be69617f9bd77e41f858d1481da3779a14dbe4126eb`), not flashed. Before it, the tester's MKI in TEST mode lit the tempo LED red, green and amber.

| Case | Reported |
|---|---|
| Transport stopped | The tempo LED blinks red, as stock. |
| Playing | Green on the first beat of the pattern, red on the others. |
| Several PLAY MODES (the remix's sequencer play modes) | Green only on the pattern's first step in each. |
| A non-standard master length, 17 steps | Green on the right step on every pass. |

Not tested on a unit: the USB package (the unit runs no Modwerk base, so the USB link has nothing to talk to), Keep, Undo and removal, a tempo change while playing, pause and continue, a pattern change, external MIDI clock, pattern scales other than 1x, MKII.

## Stock flows

Not run on a unit. The module changes one call: the beat flash. Stopped, and on every beat but the pattern's 1 while playing, `set_led` gets stock's arguments. No key, page, menu, project, Part or MIDI path is touched.

## Performance

From the source: at most 11 ColdFire instructions before stock's `set_led`, once per beat, in stock's clock-message loop. No per-sample or per-frame work, no DSP code. No `evidence/performance.json` yet: `perf:audit` asks for a ColdFire flood run, not yet made.

## Resources

ColdFire: one linked unit of 64 bytes (58 code, 2 padding, a 4-byte last-step word in the unit's text), one six-byte detour; USB package 196 bytes. No DSP memory, no project or battery-RAM bytes.

## OT UI capture evidence

None: the module draws nothing on the LCD.
