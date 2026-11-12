# POLY8T06 diagnostics

T06 includes the unchanged Modwerk core logger 0.2.0. Its RAM ring holds 256
events and checkpoints to the CF root as `OCTAMOD.LOG` and `OCTAMOD1.LOG`.
It writes only from an engine safe point while transport, independent tracks,
recorders and USB disk mode are stopped. Attempts remain at least 1,800 native
UI ticks apart. Successful SAVE/SYNC jobs request a checkpoint. No card write
occurs in a POLY render, key callback or UI snapshot.

For a test: boot with the CF card inserted, leave transport stopped and save
the project once. Then test POLY, chromatic REC+PLAY and rapid trigs. If the UI
still responds after a failure, press STOP twice, wait at least 35 seconds and
save the project again and wait for SAVING PROJECT to finish. Enter USB disk mode and copy **both** log files from
the card root. Include whether sound/recording worked before the failure.
If it freezes completely, copy whatever checkpoints already exist before
doing further tests. Power cycling is not a reliable way to recover the last
RAM events; hard lockups and the unsaved tail can be absent from the files.

Six POLY snapshot records are emitted at most once per 60 native UI ticks
while activity or state changes continue. Stopped unchanged state emits none.
The audio path only adds fixed RAM counter increments. All timing follows
the stock UI clock; POLY playback/recording still follows the native sequencer.

| Tag/code | `a` | `b` |
| --- | --- | --- |
| POLY/1 | Transport bits 0–7, live REC 8–15, grid REC 16–23, modal present bit 24, sample slots present bit 25 | Selected track 24–31, Part 16–23, pattern 8–15, native fired flags 0–7 |
| POLY/2 | Render entries, including ordinary stock sample tracks | Render completions |
| POLY/3 | POLY stock-fetch calls | Requested source frames |
| POLY/4 | Diagnostic module version `0x00020500` | Active voice cap 8; emitted once at initialization |
| POLY/5 | Panel POLY record callbacks, even when REC is off | Successful native chord placements |
| POLY/6 | Last recorded track 24–31, zero-based step 16–23, root 8–15, chord shape 0–7 | Active POLY heads 24–31, highest physical selector 16–23, current selector 8–15, chromatic mode 0–7 |
| POLY/7 | Native command-consumer hook calls, including stock tracks | Native AMP-builder hook calls, including stock tracks |

These are stage-call counts, not a frame counter: invocation frequency depends on native track/command paths. Zero or stopped deltas locate missing progress only in combination with transport and other counters.

Counters wrap modulo 2^32. Entry/completion differences can show a render in
progress at the snapshot; a difference alone does not prove a stall. Source
frames and UI intervals are workload evidence, not hardware cycle counts.
Standard BOOT/TRN/JOB/FS/FLT/CARD/USB/CTX/TRK records retain their core meanings.
The log header identifies `poly-machine@0.2.5-experimental` and source/config
hashes. No sample names, project names, audio or memory dumps enter the log.
