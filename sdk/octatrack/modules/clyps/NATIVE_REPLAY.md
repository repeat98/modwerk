# Shared development base replay

Use the candidate base branch integration/clyps-shared-sequencer from the contributor fork, at commit b3184dd5e on cumulative head 23f41e720. The module checkout contains the original public engine and UI. The build resolves the handlers from the candidate registry and packages them with a versioned modal-input marker and the ABI 9 requirement. The recipe produces a local emulator package. Keep the distribution and hardware trial gates closed.

Use Python 3.12, Node 24, m68k-elf GCC 16.2, a legally supplied Octatrack OS 1.40C, the Elekloader source pinned in the base proof, its DSP assembler, and the MKII frame emulator with interactive watch, key, knob and memory commands. The measured run uses the existing synthetic MODWERK/GATE3 test card with eight ordinary audio tracks and a clean SRC page. Its SHA-256 is 0e69834f607f27e090b34a7c6204dffbb90baf34bbcdebc3fbbf5a01eed996d2. The OS and seed project are external inputs. The source recipe below regenerates the card locally. With the original seed, the final shelved card SHA-256 for candidate b3184dd5e is 486a7937319e2a8f6747fc3e4fe1ca63137a1587888c65af37a009cd8ab500e1. All replay writes go to temporary card copies.

Set BASE to the candidate repository, DRAFT to the module directory, OUT to a new scratch directory, OCTABAM to the Octabam source checkout containing tools/emu/emu_card.py, ELEK to the Elekloader checkout, EMU to the MKII emulator executable, STOCK_OS to the OS file, ELEKLOADER_DSP_ASM to the DSP assembler and FIXTURE to the synthetic card. Use absolute paths and export ELEKLOADER_DSP_ASM.

```sh
mkdir -p "$OUT"
cd "$BASE"
node scripts/mirror-octatrack-modules.mjs
python3.12 -B sdk/machines/octatrack/elekloader/build_core.py \
  --upstream "$ELEK" --stock "$STOCK_OS" --output "$OUT/base" \
  --dev --usb-midi --dsp-loader --site-events --module-sets --module-ui-roots \
  --cached-modules --resident-stock-hooks --resident-on-demand --part-menu --sample-editor
python3.12 -B "$DRAFT/build_candidate.py" "$BASE/sdk" "$OUT/clyps-live.mwrm"
python3.12 -B "$DRAFT/tests/prepare_slice.py" "$OCTABAM" "$FIXTURE" \
  "$OUT/base/proofs.json" "$OUT/clyps-live.mwrm" "$OUT/ui.img"
for role in candidate stock; do
  if [ "$role" = stock ]; then set -- --stock; else set --; fi
  python3.12 -B "$DRAFT/tests/native_slice.py" "$EMU" "$OUT/base/MAIN.raw" \
    "$OUT/base/symbols.json" "$OUT/ui.img" "$OUT/$role.json" "$@" || exit 1
done
python3.12 -B "$DRAFT/tests/grade_slice.py" "$OUT/candidate.json" "$OUT/stock.json"
```

The independent control queues stock global A02 in disposable RAM. A02 duplicates home apart from the distinct T2 trigger mask. Both runs receive the same pattern bytes. The candidate's native SRC gesture queues T2 only. The harness checks builder arguments on both sides of wrap before comparing event order and relative timestamp writes. It also checks SRC and ARR state, STOP cancellation, callbacks, pattern and Part bytes, and the largest free pool extent. A saved trace can precede a failed pool assertion. Grade the pair and check each process exit status.

After a positive slice and matching control, run the existing wider oracle on fresh copies of the same synthetic card.

```sh
for role in candidate stock; do
  if [ "$role" = stock ]; then set -- --reference; else set --; fi
  python3.12 -B "$DRAFT/tests/native_rows.py" "$EMU" "$OUT/base/MAIN.raw" \
    "$OUT/ui.img" "$OUT/base/symbols.json" "$OUT/wide-$role.json" --octabam "$OCTABAM" "$@" || exit 1
done
python3.12 -B "$DRAFT/tests/grade_wide.py" "$OUT/wide-candidate.json" "$OUT/wide-stock.json"
python3.12 -B "$DRAFT/tests/native_rows.py" "$EMU" "$OUT/base/MAIN.raw" \
  "$OUT/ui.img" "$OUT/base/symbols.json" "$OUT/matrix.json" --octabam "$OCTABAM" --lane-matrix
```

### Build the emulator and disposable card inputs

The native run used sambanks/octabam at f7d7290663135ff8bc4ea18aa45d2854a7b332c1 and the candidate repository's scripts/octatrack-emulator/build.py idle-loop adapter. Build the emulator archives in the Octabam checkout with its setup procedure and make emu-cf. From the candidate checkout run the commands below. LOCAL_PROJECT is a read-only seed directory containing OS 1.40C .work files with an empty first arrangement. The script builds the bank, stock composite, first arrangement row and silent sample in temporary storage. The seed's other project settings can affect results. Preserve the original comparison thresholds when testing a different seed.

```sh
python3.12 -B scripts/octatrack-emulator/build.py --native "$OCTABAM" --out "$OUT/adapter"
EMU="$OUT/adapter/ot_emu"
python3.12 -B "$DRAFT/tests/make_fixture.py" "$OCTABAM" "$LOCAL_PROJECT" "$OUT/seed.img"
FIXTURE="$OUT/seed.img"
```

### Requests on either side of wrap

Rebuild the package with the linked symbol witness. Each pair requires a fresh emulator boot. The candidate receipt records the physical input edge in emulated time, the request state read from the linked module, its published diagnostic and the stock scheduling trace.

```sh
python3.12 -B "$DRAFT/build_candidate.py" "$BASE/sdk" "$OUT/clyps-live.mwrm" --symbols "$OUT/module-symbols.json"
for phase in early late; do
  for role in candidate stock; do
    if [ "$role" = stock ]; then set -- --reference; else set --; fi
    python3.12 -B "$DRAFT/tests/native_rows.py" "$EMU" "$OUT/base/MAIN.raw" \
      "$OUT/ui.img" "$OUT/base/symbols.json" "$OUT/$phase-$role.json" \
      --octabam "$OCTABAM" --boundary "$phase" --symbols-module "$OUT/module-symbols.json" \
      --package "$OUT/clyps-live.mwrm" "$@" || exit 1
  done
  python3.12 -B "$DRAFT/tests/grade_boundary.py" "$phase" "$OUT/$phase-candidate.json" "$OUT/$phase-stock.json" || exit 1
done
```

Run the stock Arranger before and after unloading a module with a foreign source selected. Run the frame/MAIN probe on a separate boot. The latter reads stock MAIN and CUE settings after reversible knob input, counts emulator instructions between the two stock continuations, and samples the base's frame counters over three-second windows.

```sh
python3.12 -B "$DRAFT/tests/native_rows.py" "$EMU" "$OUT/base/MAIN.raw" "$OUT/ui.img" \
  "$OUT/base/symbols.json" "$OUT/arranger.json" --octabam "$OCTABAM" --arranger-recovery
python3.12 -B "$DRAFT/tests/native_profile.py" "$EMU" "$OUT/base/MAIN.raw" "$OUT/base/symbols.json" \
  "$OUT/ui.img" "$OUT/profile.json"
```

### Matched missing-capability control

In a disposable checkout of the pinned base candidate, edit the advertised feature mask in sdk/machines/octatrack/module-adapters/resident-runtime/resident_engines.c. Change the single return expression `MW_DSP_KEYBUS | MODWERK_SEQ_PANEL_FEATURE` to `MW_DSP_KEYBUS`. Leave the hooks, registry width, module package and admission code intact. Run the same build recipe into a fresh output directory. Prepare a shelf with that build's proofs.json. Run the command below on that build and card. The expected refusal is decimal 259 with unchanged owner count, callback heads and pool size.

```sh
python3.12 -B "$DRAFT/tests/native_refusal.py" "$EMU" "$NEG/base/MAIN.raw" \
  "$NEG/base/symbols.json" "$NEG/ui.img" "$NEG/refusal.json"
```

For the tick-193 queue witness, repeat both wide commands with --observe-queue and separate output names. This samples in 1 ms increments near ticks 190–195 and writes a .phase file for each role. Grade the two new JSON files with the same grade_wide.py. Keep the original wide capture and its exit status. Compare the queue flag changes independently from ordered native builder calls and timestamp writes.

### Row lifecycle replay (23 November)

Build and shelve the current module using the commands above. Against the pinned candidate base, pass `--row-popup` to the same native_rows.py invocation used for arranger recovery, with a separate output file. The popup case uses the stock timed message routine while Row Edit owns the panel. Wait for the stock message handle to clear before testing ARR. Run the identical popup fixture with the previous module on the shelf for the negative control.

For project transition diagnostics, use `--project-change --package "$OUT/clyps-live.mwrm" --symbols-module "$OUT/module-symbols.json"` with a newly generated symbol witness. The fixture creates a second disposable project that selects bank B, confirms a nonzero R04 in the first project, and posts a load to the stock card task. The receipt records which callbacks ran and whether the new project's bank was selected. A failed assertion can leave a diagnostic receipt; always check process status. Ordinary masked bank-return and failed-read semantics are also covered by the scoped host suite.

Use the same command with `--project-reload stored` or `--project-reload missing` in place of `--project-change`. Both follow the stock PROJECT menu and confirm RELOAD. The stored fixture prepares a bank-B saved generation. The missing fixture omits stored files in the disposable copy. A completed recovery receipt includes off_pool after stock I/O and module retirement.

### Timing and MIDI witnesses

Add `--clock-witness NEW.jsonl --observe-queue` to each wide replay.
Use a new filename for each boot. Each JSON line records the observation's
absolute emulator sample, stock tick, queue mask, PC hits in instruction
order and timestamped writes. Selector trampoline and stock continuation
bracket audio source selection. PC hit times are bounded by consecutive
observations. Watch hits carry an instruction count. Queue writes carry an
emulator sample timestamp. Keep the strict wide grader unchanged. Run
`--home-control home` and `--home-control stop` with and without
`--reference` to compare an active module using stock sources and the
disabled shelf, including STOP near tick 193.

For MIDI, run the T2 slice twice with `--midi-wire WIRE.json` and distinct
output names. Use `--stock` on the independent control. On the disposable
bank the probe seeds two MIDI trig masks, two different note locks and two
Part channels, then watches the emulated UART0 transmit register through
STOP. Use `tests/grade_midi_wire.py CANDIDATE-WIRE.json STOCK-WIRE.json`
with Python 3.12. An empty stream or missing expected notes fails.
Audio builder comparisons and UART byte/timestamp comparisons have separate
verdicts. Physical MIDI, physical clock jitter and acoustic timbre require
independent qualification.

The stock MIDI builder at 0x4009cf4c has a separate call path (observed return address 0x400a39ca).
The audio-only redirect at 0x400a2d5a cannot supply its pattern. Trace the
MIDI builder's caller before argument publication to find a candidate lane
selector, then verify prefetched note, p-lock, arpeggiator and matching
note-off paths. The existing note-key hook operates after source selection.
A future shared wrap could commit separate audio and MIDI override masks
while each native lane retains its phase. An optional versioned MIDI bank
section could represent MIDI-only or combined rows. HOLD retains the lane,
CLIP selects a bank-local reference, and STOP requires retiring only the
lane's owned notes, including arp notes, with an explicit policy for pending
CC and locks. V1 stores eight audio cells. No MIDI selector is installed.

For the generated two-voice card, run
`python3.12 -B tests/prepare_midi_slice.py "$OCTABAM" "$OUT/ui.img" "$OUT/musical.img"`
from this directory. Pass musical.img as the synthetic card to both MIDI
runs. T1 uses a generated descending kick in FLEX slot 1 and T2 a generated
82.41 Hz bass in FLEX slot 2. The MIDI fixture sets two different trig
masks, note locks (48 and 67, channels 1 and 2) and alternating CC1 locks
on MIDI T2. Both roles send STOP at stock tick 158. The second wire receipt
(`.off.json`) records a new transport with the shelf disabled. Grade it as
a separate pair. UART0 write times are reported in emulator samples.

Add `--stock --stock-midi-home` for an independent MIDI transport that
remains on A01. Keep the stock global-pattern composite as a second control.
The active and OFF pairs each require their own UART verdict. A difference
in running status may preserve message semantics but still fails exact-byte
comparison. Report message-end timing separately, in emulator samples at
44.1 kHz. This fixture sends two note patterns and CC1 locks. It does not
qualify arpeggiator carry, external clock, or physical MIDI.

For the 23 November current-base run, use the refreshed candidate commit
from evidence/nov23-reliability.json. The seed was a copy of the prior
synthetic GATE3 shelf (its hash is recorded as `seed`). prepare_slice.py
replaced MODWERK0.SET using the new base proof. Run the full base recipe
again into an independent empty directory and compare MAIN.raw,
symbols.json, proofs.json and base.elemod with cmp. For the old failing
pair use the previous MAIN and its original shelved card. Compare the
instrumented and unchanged JSON receipts byte for byte before interpreting
the extra timing observations.
