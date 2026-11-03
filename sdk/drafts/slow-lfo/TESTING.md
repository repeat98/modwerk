# Slow LFO testing

## Commands and exact revision

Source: `sdk/drafts/slow-lfo` on branch `module/slow-lfo`. OS: stock 1.40C (the developer's own `OCTATRACK_OS1.40C.bin`, decoded MAIN OS kept outside the repository). Port: `ot_emu` from octabam.

```sh
# the gate (from an octabam root holding out/emu/ot_emu and out/raw/section_3_MAIN_OS.bin)
python3 tools/emu/ot_emu/stage_card.py out/test-project OCTABAM SLOW --out <card.img>
SLOW_CARD=<card.img> SLOW_PROJECT=SLOW python3 <modwerk>/sdk/drafts/slow-lfo/verify.py
```

## ot_emu (2 November 2026)

Not hardware evidence: the port runs the firmware's arithmetic, not the audio.

| Run | What was watched | Result |
|---|---|---|
| Stock, one second of play | how often each engine runs (`--watch-pc`) | The audio engine ran 66,144 times in 2,756 frames: each of the 24 audio LFOs once a frame. The MIDI engine did not run (the project plays no MIDI track). |
| Stock | registers at the MULT load; writes to the live MULT byte | The engine reads MULT from `0x80000690 + 48·t + 0x24 + lfo`; `0x4000cb8a` copies it each frame from the track's live lane `0x80000810 + 72·t + 0x3e + lfo`. |
| Unit preloaded (`verify.py`); track 1's LFO 1 MULT set in its lane | the LFO's phase value over frames 100..2100 | 1X 760,990; 2X 1,521,980 (stock); 1/2X 380,995 (0.5007); 1/4X 190,997 (0.2510); 1/8X 94,984 (0.1248). **PASS** (within 1 %). |
| Stock, the same lane set to 7 | as above | 4,291,710,720: stock reads 7 as a shift count and runs the LFO about 5,600 times faster than 1X. |
| Unit preloaded; the MULT formatter called directly | its output | 0 → 1X, 3 → 8X, 6 → 64X, 7 → 1/2X, 8 → 1/4X, 9 → 1/8X, 10 → 128X (stock's clamp). **PASS.** |
| Cost: 2,756 frames, stock against the unit preloaded | ColdFire instructions the port counts | 23,082 a frame stock, 23,298 with the module: +216 for 24 audio LFOs at MULT 1X. |

Not run in the port: the MIDI engine, the page as drawn (the knob range on screen), turning MULT with the encoder, a tempo change, external MIDI clock, saving and reloading a Part with 1/2X.

## Hardware

Not tested.

To qualify: on audio and MIDI tracks, turn MULT past 64X and check 1/2X, 1/4X, 1/8X appear; that an LFO on PTCH or VOL takes 2, 4 and 8 times as long as at 1X; that it follows a tempo change; that a Part saved with 1/2X reloads with it; and that MULT 1X..64X sound as on stock.

## Stock flows

Not run on a unit. Values 1X..64X run stock's displaced instructions unchanged. No key, menu row, project byte or other page is touched.

## Performance

From the emulator: +216 ColdFire instructions a frame (362.8 µs) with 24 audio LFOs; about 9 per LFO. MIDI LFOs add at most as much again while MIDI tracks run. No DSP code. No `evidence/performance.json` yet.

## Resources

ColdFire: one linked unit of 184 bytes, five detours (6 to 10 bytes each), two four-byte pokes. No DSP memory, no new project or battery-RAM bytes.

## OT UI capture evidence

None yet.
