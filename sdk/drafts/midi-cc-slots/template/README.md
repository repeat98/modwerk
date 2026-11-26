# On-device project initialization experiment

The local site pins the 0.0.13 per-file recovery candidate.
0.0.8 aborted initialization on the reported physical project. Its card journal
confirmed rollback and valid original bank copies. The low-level cause remains
unconfirmed: the same project succeeds in the private emulator. Do not treat
that emulator result as a hardware fix qualification.

## Player behavior

Keep the updated module installed before INIT so startup can recover its pending
transaction. On an unprotected, stopped test project, set Bank A / Part 1 names and MIDI
channels, then save the project normally. After Save to New, explicitly complete
PROJECT → SAVE PROJECT in the destination before INIT: the new project may
initially contain only working bank files. In MIDI SRC SETUP, encoder D shows
INIT with FN+ / PUSH. Hold FUNC and push D; a plain push only shows the gesture hint.
There is no text confirmation editor. NAME on F retains its stock text editor.
Progress identifies the bank being checked, applied or restored. NO requests
cancellation at the next safe bank boundary; STOP remains available. Bare page browsing remains available during progress; parameter edits and
bank/project changes stay held. FUNC releases always pass through.

The first operation initializes native current and saved Parts and
freezes inherited names as independent bank names. Existing legacy initialized
channel profiles (including OFF) and explicit name overrides are retained.
Initialize before making new bank-specific edits during migration: an old
saved profile remains authoritative for an already initialized legacy Part.

On a previously initialized project, deliberate FUNC + D asks REPLACE ALL?
YES/NO. YES replaces all bank names and all current/saved Part channels with
Bank A / Part 1, including empty names and OFF. NO dismisses the prompt without
writes, and can cancel safely during bank progress. A YES already held when the
prompt opens cannot accept it: release it, then press YES. STOP dismisses the
prompt. Replacement records the existing initialized checkpoint as its baseline;
uncommitted recovery preserves that marker and restores previous independent
names/channels. A confirmed replacement never happens during project load.

Afterward, bank and pattern changes never read or apply a sidecar channel map.
Channels belong to normal project/bank storage. Save channel edits normally.
Names save separately in the project folder. Bank A edits do not propagate
after initialization. Save to New copies names and the completed marker into
the actual new destination; ordinary project loading never implies a clone.
A protected template may be copied through native Save to New; INIT itself
requires an unprotected project.

## Storage and recovery

Back up the complete project before testing. Names and the initialization
marker use alternating, CRC-checked `MIDI4_0.DAT` / `MIDI4_1.DAT` checkpoints.
The old `MIDI3_*.DAT` and `MIDI2_*.DAT` files are read for migration and left
unchanged. Keep all sidecars with project backups.

Initialization requires all sixteen `.work` / `.strd` bank pairs to have valid
checksums and matching non-channel data. The working copy’s channels must match
the native engine; the stored copy may have a different valid map. Missing,
damaged or unsaved working banks show CHECK FAILED with a bank code before
applying the map. A verified journal (`MIDI4_J0.DAT` / `MIDI4_J1.DAT`) records the previous
native map, each disk copy’s channel map and channel-neutral fingerprints before
mutation. Only sectors
containing channel cells or the bank checksum are rewritten; unrelated bytes
are preserved. Every bank copy is read back and verified before its peer is
changed. Sector batches close the read descriptor before opening the same file
for writing; transfer buffers retain checked 16-byte alignment.

Apply and rollback perform one bank pair per engine turn. A tagged bitmap in
the intent records each bank before it can be touched; older intents without
the tag conservatively recover all sixteen pairs. An interrupted, uncommitted
initialization restores the recorded previous map. Boot recovery reloads the
native project afterward. A live failure or cancellation restores in place and
unlocks the panel without an automatic project reload. It never recalculates Bank A defaults. A torn
sector can be repaired from the other verified saved copy. If neither copy
matches its recorded fingerprint, recovery stops rather than inventing data.
A completed metadata checkpoint retires the intent without reapplying channels.
This does not prove resilience against arbitrary physical CF/FAT corruption.

Undo or removal restores module code; it does not reverse a completed native
bank initialization. Restore a project backup to reverse those project edits.

## Proposed shared lifecycle events

The earlier prototype proposes successful project-clone and project-activation
events. This private implementation explores three guarded stock boundaries:
source capture before the Save to New destination check (`0x40084f44`), successful
destination bank-write completion (`0x4008505c`), and full project load completion
through the native bank loader (`0x400905d4`, full-load caller `0x400853de`).
Failures must not emit successful-clone notifications. Background bank loads
must not masquerade as project activation. Source capture must include dirty
in-memory names and destination completion must occur in the stopped engine.

These direct sites are experimental, not admitted shared SDK events. Owner
review and shared event integration remain prerequisites for public release.
No module may depend on Octakit or another module for these notifications.

## Checks

Run host transaction/fault and actual bank-sector tests with:

```sh
python3 -B -m unittest sdk.tests.test_midi_template_journal \
  sdk.tests.test_midi_template_banks
```

Build privately with `build_runtime.py --profile --project-template`, then run
`verify_runtime.py --profile --project-template --external` with private stock.
`verify.py` drives actual FUNC + D and NO, the NAME text editor, native Save to New and
fresh emulator processes. Its card and firmware outputs stay outside Git.
The private publication supplies the normal UI tick callback and a separately
recorded fixture for the documented first-sector card-write interrupt race
(`TRAPS.md#trap-first-sector-irq`); neither fixture ships in the module. Generic
resident key/encoder dispatch, exact hardware timing and power loss remain
separate qualifications. Record observed results, not intended results.


## Failure codes

A live failure retains a stage/bank code in the checked journal and shows
APPLY FAILED followed by three digits. Codes 100–115 identify preflight banks
A–P, 200–215 intent writes, 300–315 native bank persistence, 400 resident channel
application, and 401 name/marker storage. NO cancellation records zero. A
failure restoring a touched bank leaves recovery required; it must not silently
unlock or write a completed marker. A preflight rejection performs no bank writes.

The physical 0.0.8 report was bound to its exact saved package. Both name
checkpoints remained uninitialized; its pending/aborted journal pair and all
32 current bank checksums/fingerprints were valid. Bank A had the eight channels,
Bank B remained OFF, and the sixth MIDI name was saved separately. This proves
rollback, not which low-level I/O check failed. Personal project files and card
logs stay private and are never test fixtures committed to this repository.


## Reported completion and responsiveness follow-up

The user clarified that 0.0.9 completed, Bank B's sixth MIDI track used channel
6, and controls returned after more than ten seconds. This is a reported
successful application with excessive control blocking, not a permanent freeze.
0.0.10 allows bare SRC/AMP/LFO/FX page keys while busy; held modifiers or other
keys keep those shortcuts blocked. Editing, playback and bank/project changes
remain held. NO still requests safe cancellation. CRC verification now uses one
lookup per byte instead of two; fingerprints and every original bank check are
unchanged. No cached execution or new interrupt masking is introduced. Physical
timing and full resident dispatch of this follow-up are unmeasured.


## INIT layout (0.0.11)

D shows INIT with FN+ / PUSH stacked beneath it. Native text centers in a
16-pixel field: D starts at x=62, forty pixels left of F at x=102. Both hint
lines fit within D’s cell. The FUNC + D gesture and all persistence logic
are unchanged.


## Separate disk baselines (0.0.13)

A reported project had a valid Bank B working track-3 channel of 3 and a valid
stored channel of OFF. All unrelated bytes matched. The old check rejected
that legitimate difference. MAP2 adds 2,048 bytes of separate disk maps at
journal offset 1216; the original 1,024-byte native baseline stays at offset 64.
Rollback restores each disk map separately and the native baseline in RAM.
The same neutral fingerprint and verified peer can repair a torn sector before
reapplying the correct map for that copy. Non-channel differences still refuse
initialization.

Pending MAP2 journals have version 2. Both old peers are replaced and verified
before bank mutation, so an old module cannot mistake an older terminal record
for the new transaction. Older modules refuse pending v2 recovery. After a
complete commit/rollback, a version-1 terminal record permits older readers
again. Current code still reads old MAP1 and untagged journals. Keep this module
installed before INIT; do not downgrade while a setup is unfinished.
