# CX OSC hardware load (optimization-style)

This mirrors the octabam CX optimization tables: fixed 12-byte PLAYBACK + SETUP presets, increasing instance count, Part readback, then play.

## Presets (`load-scenarios.json`)

| Preset | PLAYBACK | SETUP | Instances |
|--------|----------|-------|-----------|
| `morph_zero_hot_playback` | PTCH 64, RATO/INDX/FOLD/MIX 127; CAR/MOD 0 | DEC 127, SYMM/PWM 64, FDBK 0 | 1-6 |
| `morph_heavy_all` | same hot PLAYBACK | CAR/MOD/DEC/SYMM/FDBK/PWM all 127 | 1-4 |

`init` matches `fm_defaults` in `standalone/machine.s`.

## On the unit

1. RAM-boot dev twin, transport stopped, Part saved. **CX only sounds on pattern trigs** while PLAY runs: put trigs on every track you stress (steps 1/5/9/13 is enough), or pass `--arm-trigs` to toggle steps 1-16 on those tracks (mutates the pattern).
2. Trial cx-osc: `npm run device -- --socket /tmp/modwerk-share.sock try …/cx-osc.mwrm --seconds 3600`
3. Run: `MODWERK_QUALIFY_TIMEOUT=180 npm run device:cx-stress -- --arm-trigs --preset all sdk/octatrack/modules/cx-osc/cx-osc.mwrm`
4. Output: `evidence/stress-hardware.json` (params read back per track, stats, longest frame µs, refusal on N+1).

USB panel driving (no `PLAYBACK` key): after `place`, morph PLAYBACK knobs with a **double-tap** on the track key, then SETUP knobs with **`Tn FUNC+SRC`**. Part bytes live at `PB_OFF + 6 * machine + 30 * track` (`machine.s`).

Host gate: `python3 -B sdk/octatrack/modules/cx-osc/test_cx_osc_load.py` (preset bytes vs `fm_defaults`).