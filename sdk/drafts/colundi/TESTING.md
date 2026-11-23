# COLUNDI 0.1.0-experimental

Target: Octatrack MKII OS 1.40C. Source and build recipe at d0ee901d9. Tests run on macOS, 23 November 2026.

| Test | Result | Scope |
|---|---|---|
| Host renderer and synthetic fixture | PASS | PCM zero crossings at 439.999990 and 441.000000 Hz, all other byte values silent on a fresh voice, release reaches zero. |
| Native link | PASS | Production package colundi.mwrm SHA-256 59d1ccc1fed5d9a9f83a604e99f3a575fa59694e02107106c8fd039d09963435. Linked code/data 1,512 bytes, BSS 288 bytes (8 voices and counters), file 1,804 bytes, 16 relocations, two table entries, zero stock-code sites. |
| Preloaded pattern, STOP/restart | PASS | On base 0.7.12 the meter observed four accepted STARTs per PLAY. Degrees 78,79,79,78 produced 439.999987,441,441,439.999987 Hz at the source packer. The repeated 79 restarted the envelope and phase. The step-5 trigless B=79 produced no fifth START. The two captures matched. |
| First PLAY after editing stopped pattern RAM | FAIL | First START saw 0 and generated silence. Steps 2–4 played correctly. On the next PLAY step 1 produced 440 Hz. This setup writes the pattern RAM directly and does not establish that UI editing has the same problem. |
| Hardware and physical frame timing | NOT TESTED | No MKII trial, CPU price, DTCN3 timing or headroom claim. At most 16 samples per callback, two bounded render calls, no allocation. |
| Lifecycle and compatibility | NOT TESTED | Audible stock-track comparison, rapid Part/FLEX changes, Part/project reload, power cycle, removal and downstream AMP/FX audio remain open. The adapter clears on explicit leave. A Part transition that misses leave may replay the residual short note. |

Both runs preserved the 30-byte neighboring T2 Part record. The machine-readable measurements and package identities are in [emu/results.json](emu/results.json).

## Emulator reproduction

Use Python 3.12, Node 24, m68k-elf GCC/binutils, a compatible local ot_emu with virtual USB, the matching privately built 0.7.12 MAIN and a disposable MODWERK/QUIET test card. The runner checks the image and card digests before use. The repository history must contain base 506d0ecf7. The host test and native build require no firmware. The generic module:dev builder currently looks for linked Octabam units or DSP code. Use build.py for this C-source package.

Set EMU, MAIN and CARD to those local files. Run from the repository root with fresh output paths:

```sh
D=sdk/drafts/colundi
python3.12 "$D/test_pcm.py"
python3.12 "$D/build.py" /tmp/colundi.mwrm
CPATH="$PWD/sdk/machines/octatrack/include" python3.12 sdk/runtime/loader/build.py \
  "$D/emu/meter.c" "$D/mono.c" "$D/fixture.c" \
  --subscribe ot_machines:descriptor:50 --subscribe ot_machine_starts:start_record:50 \
  -o /tmp/public-meter.mwrm
python3.12 "$D/emu/run.py" "$EMU" "$MAIN" "$CARD" /tmp/public-meter.mwrm /tmp/prepared.jsonl
python3.12 "$D/emu/measure.py" /tmp/prepared.jsonl
python3.12 "$D/emu/run.py" "$EMU" "$MAIN" "$CARD" /tmp/public-meter.mwrm /tmp/late.jsonl --late
python3.12 "$D/emu/measure.py" /tmp/late.jsonl
```

The meter reads the right PCM word after the adapter writes it to the source packet. It times positive crossings over samples 129–4095 with linear interpolation. The measured signal precedes stock AMP/FX and DAC. The meter is compiled out of the production package. In both experiments T1 starts as stock and the sequencer warms up before the machine is assigned. “First PLAY” means the first PLAY **after assignment**. A cold-loaded saved project remains untested. The late-mode assertion deliberately reports a degree mismatch until that regression is resolved.

The earlier laboratory checked 13 host cases, rerun independently this sprint. Those include private palette fixtures and a historical SYNTIZ renderer. They are outside the public suite. Archived diagnostic captures independently replayed at this checkpoint had 4, 12 and 5 STARTs; their oscillator ran at fixed pitch.
