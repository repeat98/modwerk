# Octatrack module-set verifier

`verify-octatrack-module-sets.mjs` uses the frontend MCP service's exported tool API. It defaults to read-only catalogue, package-integrity and connected-capability checks. It does not implement another USB transport. Use Node 24 and a checkout that includes `scripts/frontend-mcp.mjs` with its matching frontend bridge and catalogue. Select the source root at startup; it cannot be changed by a tool request.

Only one process may use the USB bridge at a time. Select an existing bridge explicitly; this runner does not start one, reset the bus or install a base. Stop other device clients before running it. Use an isolated private data directory, as required by the MCP service.

```sh
node scripts/verify-octatrack-module-sets.mjs \
  --mcp-server /private/checked-source/scripts/frontend-mcp.mjs \
  --frontend-root /private/checked-source \
  --socket /private/selected-usb-bridge.sock \
  --data-dir /private/verifier-workspace \
  --all-staged
```

Without `--all-staged`, it preflights E-Verb, Mini Verb, TapeHead and Air Chorus. With it, the selected frontend must also publish Preview Vol and Repitch. Requirements come from the actual connected base and packages; an older base receives no invented capabilities. Every preflight finishes before a trial can start.

Add `--trial --expect-base <exact-64-character-IDENTIFY-hash>` only when trials on that exact private candidate are authorized. Each trial retains every installed module, adds one absent package, runs the frontend's physical self-test, then Undoes it. Before the next trial, the runner verifies the starting base, active identity, inventory and saved module count. Packages already present are retained without reinstallation; legacy inventory provides a layout, not their exact package hash, so replacing them would lack proven rollback bytes.

The frontend loader accepts every earlier change in a multi-package update before starting the last trial. Therefore this runner and the MCP trial guard refuse multiple changes. `--all-staged --trial` exercises individual additions beside the baseline; the complete six-module selection remains **preflight evidence only**. Simultaneous coexistence requires separately authorized acceptance or a future atomic module-set transaction.

Receipts contain identities, package hashes and observed trial/Undo results. They contain no firmware or raw memory. A failed run produces no success receipt, stops the matrix and closes the service so it can Undo an owned trial. A disconnect or failed recovery still needs an operator to inspect the unit before another trial. The runner has no Keep, flash, reboot, panel-key, Part-save or API-write operation.

Self-test and restored inventory do not establish audible behavior, multiple track/slot/core instance isolation, Part/project behavior or physical reboot persistence. Qualify those against the exact candidate under [hardware guidance](../docs/OCTATRACK_DRIVING.md) and [hardware traps](../docs/OCTATRACK_HARDWARE_TRAPS.md). A RAM boot does not qualify a flashed image's reboot persistence. Saved module sets are base-bound; preserve the original private set files before any separately authorized candidate Keep/persistence test.

## Does Sidechain Compressor still duck after Undo?

Use a prepared scratch Part on an available MKI or MKII. Sidechain Compressor must already be installed, with Mini Verb absent. The verifier adds only the published Mini Verb 0.2.3-experimental package and checks its SHA-256 against the reviewed and prepared bytes. Reserve the instrument for the run.

1. Run `node scripts/sidechain-undo-audio.mjs --prepare`. Load the generated `T1-key.wav` and `T5-program.wav` onto their respective tracks in the scratch Part. Retrigger them together every two beats at 120 BPM. On T5 select FX2 COMPRESSOR, select T1 as its KEY, turn MON off and set the threshold and ratio for audible ducking. Cue only T5. Keep T3 out of CUE throughout.
2. Arm a stereo recorder on that isolated CUE pair. Use a fixed digital trigger, the same playback lead-in and a one-second, 44.1 kHz window for every take. Export complete stereo WAV files at the original level and timing. A repeated baseline checks that the bench can actually do this. A louder T1 leaking into the recording invalidates the setup.
3. Run the command below. The operator terminal prints a new private directory. Write `key-muted.wav` with the T1 sample trigger disabled. Restore that trigger and record `before.wav` and `repeat.wav` on separate playbacks. With T1 playing, both receiver channels must be at least 1 dB quieter, and the two keyed takes must have identical non-silent samples. Record the T5 assignment and all displayed control values in `before.json`.
4. When the trial starts, select Mini Verb in T3 FX2, play the pattern and turn MIX from 0 to 64. Confirm the gesture at the prompt. The verifier calls Undo even if the confirmation fails. After the unit reports the original active set and inventory, retrigger the fixture, record `after.wav` and independently read T5's controls into `after.json`.

```sh
node scripts/verify-octatrack-module-sets.mjs --socket SOCKET --data-dir PRIVATE_DIR \
  --trial --expect-base BASE_SHA256 --sidechain-audio
```

Both panel files use the following shape. Replace the example values with the instrument readings.

```json
{
  "target": "physical Octatrack", "model": "MKII", "os": "1.40C", "track": 5, "slot": "FX2",
  "effect": "COMPRESSOR", "KEY": "T1", "MON": "OFF",
  "parameters": {
    "ATK": 4, "REL": 24, "THRS": 32, "RAT": 80, "GAIN": 0, "MIX": 127,
    "RMS": 0, "KGN": 64, "KBAS": 0, "KWID": 127
  }
}
```

The receipt records the operator-reported target and panel settings, device and package identities, key response, frame count and four WAV digests. Use `"target": "emulator"` for a development twin with a working CUE path. The two keyed baseline checks apply to both targets. The audio comparison checks all 88,200 decoded samples on the receiving track. A difference of one sample fails. A missing capture, expired trial, changed setting or unconfirmed restoration produces no successful audio receipt. Leave the private WAVs on the bench computer.

### Historical control

Run Mini Verb 0.2.2 in the isolated DSP verifier. The same harness assembles the archived 0.2.2 source and the fixed 0.2.3 source, drives eight moving instances and checks the shared window. It requires a private Octabam SDK, the matching DSP tools, and the developer's local OS extraction. Run from the repository root.

```sh
python3 -B sdk/octatrack/modules/miniverb/verify.py --sdk "$PRIVATE_SDK" \
  --stock "$PRIVATE_MAIN" --output "$PRIVATE_OUTPUT"
```

On the 19 November replay, the guard counted 770 stray write regions per instance for 0.2.2 and zero per instance for 0.2.3. The Mini Verb renders themselves matched on the moving-control identity tests. The guard measures isolation. The separate CUE recording measures the surviving compressor after a device Undo.
