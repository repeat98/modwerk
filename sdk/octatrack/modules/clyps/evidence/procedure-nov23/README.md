# Official CLYPS procedure, 23 November 2026

Source tested: 613db9857006a1f865d85a28e9aebd6bfba6e527, merging contributor 236294956 with upstream 6f31dd3c4. The procedure and runner match that upstream revision. Use Node 24 and Python 3.12. Run from the repository root:

```sh
D=sdk/drafts/clyps
E="$D/evidence/procedure-nov23"
npm run test:procedure -- clyps --plan
npm run test:procedure -- clyps --no-unit --out "$OUT/host"
python3.12 -B "$D/build_candidate.py" "$BASE/sdk" "$OUT/clyps.mwrm" --symbols "$OUT/mod.json"
npm run device:emulator -- --image "$MAIN" --emulator "$EMU" --dir "$OUT/session-sockets" -- npm run test:procedure -- clyps --target emulator --package "$OUT/clyps.mwrm" --out "$OUT/session"
python3.12 -B -m unittest discover -s "$D" -p 'test_*.py'
```

Use an empty scratch directory for OUT and candidate SDK 5c32cbacd for BASE. Match MAIN, emulator, linked symbols, synthetic card and rebuilt module against [hashes.json](hashes.json). See [the input and replay recipe](../../NATIVE_REPLAY.md). Only distribute logs, hashes and test results. The official records are [host](host/procedure.md) and [connected emulator session](session/procedure.md), each with adjacent JSON. [Emulator preflight](emulator/procedure.md) records the earlier invocation with an isolated socket before the emulator session existed. The plan merely enumerates steps.

Both host and connected emulator runs stopped in step 1. Doctor stages the draft and attempts to read octamod.module.json; the module ships a proposed metadata excerpt and proposed runtime contract. Supplying the rebuilt MWRM to the connected session still goes through doctor first. The official runner never reached package identification or device trial. Its generated records retain the original step statuses.

The independent build against the upstream SDK also fails: the modal-input struct and MODWERK_MODAL_INPUT_ABI required by the builder are absent. The candidate package binds ev_seq_wrap, ev_audio_seq_source and ot_modal_input at 63–65 and requires the candidate capability. Renaming the proposed manifest would not supply those base services. The next integration step is to agree the upstream shared contract, add supported module and build declarations against it, then repeat step 1 on that exact revision. All physical-unit steps await separate authorization.

## Supplemental native fixtures

Use native_slice.py with candidate and --stock, then grade_slice.py. Use native_rows.py with the default arguments and --reference, then grade_wide.py. On separate boots, pass --row-popup, --arranger-recovery, and --project-reload missing or stored. The reload and --boundary early/late fixtures require --symbols-module and --package from the rebuild. Use --reference for the late control, then grade_boundary.py late. Each fixture boots a fresh MKII emulator and writes only to a temporary synthetic card copy. See [the edge-case table](../../TESTING.md#official-procedure-on-upstream-main--23-november-2026) for outcomes. Raw boot images and card contents are local inputs.

The first two reload invocations in replays/missing.txt and stored.txt stopped at argument parsing. The corrected reload-missing.txt and reload-stored.txt runs supply the package and matching symbol map. archive-*-grade.txt rechecks earlier recordings separately. The first standalone catalogue invocation used an older system Python; catalog-compat312.txt is the Python 3.12 rerun. Absolute workstation home and system temporary-directory prefixes in published text logs have been shortened.
