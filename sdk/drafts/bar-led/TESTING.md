# Bar LED testing

## Commands and exact revision

Source: `sdk/drafts/bar-led` on branch `module/bar-led`, cut from `main` at `53973679`. OS: stock 1.40C (the owner's own `OCTATRACK_OS1.40C.bin`, decoded MAIN OS kept outside the repository). Port: `ot_emu` from octabam.

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
| Stock, `--sequencer --internal-clock --frames 6000` | the beat-flash call `0x40056f24`; writes to the transport word `0x800065b8` | The transport word becomes 1 (playing) at instruction 805,319,030; the first flash follows at 805,401,527, then one per beat, each `set_led(38, 3)`. No flash before the transport start. |
| Unit preloaded at `0x400d24d0`, `jsr` to it at `0x40056f24`, `--frames 14000` (`verify.py`) | every `set_led` call returning to `0x40056f2a` | 11 beats: ids 39, 38, 38, 38, 39, 38, 38, 38, 39, 38, 38, each for 3 ticks. **PASS.** |
| Static: the decoded 1.40C | `pea 0x27` before a call to `set_led` or the other LED writers (`0x400136f4`, `0x400131a0`, `0x400131c8`) | None: stock passes no literal 39, so the module lights an LED stock leaves alone. Computed ids were not traced. |

Not run in the port: STOP then PLAY again, pause and continue, a tempo change while playing, external MIDI clock, a pattern change.

## Hardware

Not tested. The owner's MKI in TEST mode lights the tempo LED red, green and amber (reported by the owner, 2 November 2026), so a green half exists; that id 39 drives it is not yet seen on a unit.

To qualify on a unit over USB: install the package, Keep, then check green on the 1 and red on 2–4 at a slow and a fast tempo, after a tempo change while playing, after STOP and PLAY, after pause and continue, following external MIDI clock, and after Undo and removal (stock red on every beat).

## Stock flows

Not run on a unit. The module changes one call: the beat flash. Stopped, and on beats 2–4 while playing, `set_led` gets stock's arguments. No key, page, menu, project, Part or MIDI path is touched.

## Performance

Measured from the source: at most 12 ColdFire instructions before stock's `set_led`, once per beat, in stock's clock-message loop. No per-sample or per-frame work, no DSP code. No `evidence/performance.json` yet: `perf:audit` asks for a ColdFire flood run, not yet made.

## Resources

ColdFire: one linked unit of 60 bytes (56 code, a 4-byte beat counter in the unit's text), one six-byte detour; USB package 192 bytes. No DSP memory, no project or battery-RAM bytes.

## OT UI capture evidence

None: the module draws nothing on the LCD.
