# Shared development base replay

Use the candidate base branch integration/clyps-shared-sequencer from the contributor fork, starting with commit 7419b7598. The module checkout contains the original public engine and UI. The build resolves the handlers from the candidate registry and packages them with a versioned modal-input marker and the ABI 9 requirement. The recipe produces a local emulator package. Keep the distribution and hardware trial gates closed.

Use Python 3.12, Node 24, m68k-elf GCC 16.2, a legally supplied Octatrack OS 1.40C, the Elekloader source pinned in the base proof, its DSP assembler, and the MKII frame emulator with interactive watch, key, knob and memory commands. The measured run uses the existing synthetic MODWERK/GATE3 test card with eight ordinary audio tracks and a clean SRC page. Its SHA-256 is 0e69834f607f27e090b34a7c6204dffbb90baf34bbcdebc3fbbf5a01eed996d2. The OS and seed project are external inputs. The source recipe below regenerates the card locally. With the original seed, the final shelved card SHA-256 is 2e204ad956098649f6c04feedc6d8fc8608d12b1b7f29c2d3b45db4ce1881465. All replay writes go to temporary card copies.

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
