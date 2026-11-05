# Slow LFO testing

## Commands and exact revision

Source: `sdk/octabam/modules/slow-lfo` (drafted in `sdk/drafts/slow-lfo`). OS: stock 1.40C (the developer's own `OCTATRACK_OS1.40C.bin`, decoded MAIN OS kept outside the repository). Port: `ot_emu` from octabam.

```sh
# the gate (from an octabam root holding out/emu/ot_emu and out/raw/section_3_MAIN_OS.bin)
python3 tools/emu/ot_emu/stage_card.py out/test-project OCTABAM SLOW --out <card.img>
SLOW_CARD=<card.img> SLOW_PROJECT=SLOW python3 <modwerk>/sdk/octabam/modules/slow-lfo/verify.py
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
| Built into the developer's private octabam remix `home-base` 7 (native card build, beside Bar LED and Deja Vu), nothing preloaded | track 1's LFO 1 phase over frames 100..2100 | 1X 760,990; 1/2X 380,995; 1/8X 94,984: the same as preloaded. `make check` on that remix passes. |
| Cost: 2,756 frames, stock against the unit preloaded | ColdFire instructions the port counts | 23,082 a frame stock, 23,298 with the module: +216 for 24 audio LFOs at MULT 1X. |

## ot_emu: tempo change while playing (5 November 2026)

`verify.py` part 3, the same preloaded unit and card. At frame 1100 the tempo word `0x80001814` (BPM × 24) is set from 120 to 210 BPM; the LFO's distance over frames 100..1100 and 1100..2100 is compared.

| MULT | 100..1100 | 1100..2100 | ratio (want ×1.75) |
|---|---|---|---|
| 1X | 380,495 | 665,497 | ×1.7490 **PASS** |
| 1/2X | 190,498 | 332,493 | ×1.7454 **PASS** |

After the change 1/2X moves 0.4996 of 1X (want 0.5): **PASS**. The slow values follow a tempo change as stock's do, because the step is still stock's SPD × tempo.

Not run in the port: the MIDI engine, external MIDI clock, saving and reloading a Part with 1/2X.

## Hardware

**USB, MKI, 4 November 2026.** The tester's MKI on the flashed Modwerk beta base `9680e9ac861ff931…` (built with `npm run octatrack:base -- --beta` from the tester's own 1.40C; it reproduced the committed base), USB straight into the Mac. Package `slow-lfo.mwrm` (608 bytes, SHA-256 `7392526b133647e5e7b0a0bb85f33c8f4360b0289c16d89cca733ec5ce6ffd65`, module `cd8a0e36`, 184 bytes of code, 4 relocations, 7 stock-code sites) built with `sdk/runtime/loader/build.py --octabam slow-lfo` from commit `79e96c87`, sent with `npm run device`. What the unit answered was read over USB; what the LFOs did is the tester's report.

| Step | The unit answered | The tester reported |
|---|---|---|
| Before: `status`, `do inventory` | base `9680e9ac…`, generation 5, nothing installed | |
| Trial: `try slow-lfo.mwrm --seconds 900` | trial running, then rolled back at the end; generation 7, nothing installed | LFO SETUP MULT shows 1/2X, 1/4X and 1/8X after 64X |
| Second trial: `try slow-lfo.mwrm --seconds 1800`, ended early (rolled back, generation 9) | trial running | Audio track: the LFO slows to the expected rate at each value. MIDI track (LFO to an external MIDI device): MULT shows the same three values and the LFO slows to the expected rate |
| Keep: `try slow-lfo.mwrm --seconds 5 --accept` | accepted; generation 10, active `7392526b…`; inventory `SLOW LFO` (`cd8a0e36`) | |
| Power cycle (the tester) | inventory `SLOW LFO` after the boot's restore | MULT still offers 1/2X, 1/4X and 1/8X after the reboot |
| `do selftest` | SELF TEST passed: 1/1 modules intact, 0 with DSP effects, longest frame 420 us, card set 1, 1/1 | |
| Remove: `remove slow-lfo.mwrm --accept` | accepted; generation 1, nothing installed | MULT stops at 64X, as stock |

The committed package `octatrack-modules/slow-lfo/0.1.0-experimental.mwrm` (SHA-256 `3505194ebe34509b765bb71d38ab6a62ab5f4f5ba18cdfd829c741fec472aeb4`, built by `npm run octatrack:module-packages` after the move out of drafts) differs from the tested `7392526b…` in three bytes only, the package name at offsets 0x33..0x35 (`Slow LFO` against the `SLOW LFO` the tester's build passed with `--name`); code, sites and relocations are the same bytes.

The rates were judged by ear and eye, not measured; the emulator measured them within 1 % (above). Not tested on a unit: a tempo change while playing, external MIDI clock, saving and reloading a Part with 1/2X, a project with 1/2X opened without the module (expected to read 128X), Deja Vu's waves together with the slow values, MKII, the site's own install dialog (the same package and base protocol, sent from the command line).

## Stock flows

Not run on a unit. Values 1X..64X run stock's displaced instructions unchanged. No key, menu row, project byte or other page is touched.

## Performance

From the emulator: +216 ColdFire instructions a frame (362.8 µs) with 24 audio LFOs; about 9 per LFO. MIDI LFOs add at most as much again while MIDI tracks run. No DSP code. Worst case, counted from `unit.s`: 16 instructions an LFO a frame at MULT 1/2X..1/8X (9 at the rate step, 7 at the MULT load, detour jumps included; stock runs 4 there), 768 for all 24 audio and 24 MIDI LFOs, against a frame of 95,778 cycles at 264 MHz. The MULT label code runs only while the page draws.

## Resources

ColdFire: one linked unit of 184 bytes, five detours (6 to 10 bytes each), two four-byte pokes. No DSP memory, no new project or battery-RAM bytes.

## OT UI capture evidence

5 November 2026. `scripts/capture-module-ui.py` with the octabam port's `ot_emu` (SHA-256 `28391993…`), MKII panel, empty scratch card, stopped transport, on a MAIN OS build of the octabam test remix `slow-lfo` (Slow LFO and the stock effects; `make bus`, image SHA-256 `bdd9d88e58516c66192b7966307505fa51b4367df851a40a375ae746df0ee059`, kept local). Plan: dismiss the date prompt, [FUNC]+[LFO], seven turns of C (+4 each) to 1/2X, capture; two more to 1/8X, capture. Each +4 turn moves MULT one value; two further turns stayed on 1/8X (the end of the knob). `media/capture.json` holds the hashes.

| File | Shows |
|---|---|
| `media/slow_lfo_mult_half.png` | LFO SETUP, LFO 1, MULT 1/2X |
| `media/slow_lfo_mult_eighth.png` | LFO SETUP, LFO 1, MULT 1/8X |
