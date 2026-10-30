# Built-in OCTAMOD.LOG logger

A bounded device event recorder and a guarded 1.40C adapter. It records module configuration and correlated system events in RAM, then checkpoints them to the CF card. The website accepts and previews the checkpoints before submitting an author-directed GitHub issue.

**Always included by the Octamod browser composer; never a module.** There is no catalog entry, discovery manifest or toggle. This core version is 0.3.0: it also carries the frame guard (below); the eleven-module baseline is unchanged. Original C is compiled into a firmware-free object package, and guarded stock instructions are supplied only from the user's verified local file. The native core probe and the browser runtime/loader agree byte for byte. Broader qualification remains incomplete. The owner explicitly approved this logger addition and current module versions for release on 3 October 2026, lifted its qualification restrictions, authorized local firmware/DSP tests and waived hardware testing; downloads include the logger. See [TESTING.md](TESTING.md).

## CPU and card budget

- An event writes one 20-byte RAM record and a constant-size header check. No formatting, allocation, file I/O, byte checksum loop or per-sample hook. Interrupt masking covers only the bounded append. This has **not** yet been assigned a worst-case hardware cycle count.
- The ring holds 256 events; overflow replaces the oldest and records the dropped count. Capture tracks only on selection changes, alongside engine job boundaries, transport requests, card/USB state and filesystem failures. Successful filesystem operations and expected missing optional files do not produce records.
- Correlation tokens connect a job's begin/end with its bank, pattern, part, track and machine/FX selections and I/O errors. Transport requests get a separate token. Module authors can use `octamod_log_next_correlation()` and `octamod_log_event()` with their own documented tag; no existing module is silently instrumented. Detailed DSP/parameter traces still require explicit, bounded instrumentation and qualification.
- Only the engine task can checkpoint. Playback, any independently running audio/MIDI track, any pending/active recorder state and USB disk mode defer it. Gates are checked again between written sectors. No card writes from the exception handler, UI interrupt or audio callback.
- At least **1,800 UI ticks (nominally 30 seconds) between attempts**, including failed attempts. A 64-event batch, a completed SYNC/SAVE job, or an error requests a checkpoint. Unchanged idle state never causes writes. A deferred request waits for another engine safe point; there is no periodic wakeup or guaranteed 30-second persistence deadline.
- Two files, `/OCTAMOD.LOG` and `/OCTAMOD1.LOG`, at **32 KiB each**. Slots alternate after a successful close and full readback. A sole existing checkpoint is preserved at the first write after boot. With both files present, the peer survives a failed rewrite; it can be older than the newest checkpoint.
- First use of a slot initializes/rewrites all 64 sectors. Later writes cover only the sector-aligned prefix containing new text or old text that must become LF padding. A failed/uncertain extent requires a full rewrite. Full readback is still 32 KiB; file open/close and FAT metadata add I/O. Fixed file size is **not** a promise of zero FAT writes or atomic power-loss safety.
- Read-only/absent cards defer or fail safely, failed attempts are throttled, and foreign or wrong-size files are refused. The writer never deletes a file. A short file left by failed creation is deliberately refused until the user removes that damaged logger file.

## Frame guard

`frame_guard.c` is the USB base's frame guard (`machine_registry.c`) for loader-free builds, which have no base. Without it a busy project with POLY8, FM Synth or VECTOR voices kept the frame interrupt near a whole frame and the DSP stopped until a power cycle (#844, #1015). The interrupt gets 80 % of each frame, saving up to half a frame from short ones; a module machine track's render that would overdraw it renders stock's silent source instead, a dropout on that track. Stock tracks and Analog BD always render.

- Four guarded stock sites: the frame interrupt's entry (`0x4000aad0`, stamps DTCN3 after stock's register save) and exit (`0x4000d9a6`, the budget before stock's restore and `rte`), and the record packer's two renderer calls (`0x4000d43a`, `0x4000d524`), whose replay keeps stock's argument pushes and drops the `jsr`. USB Audio's frame site ends where the exit begins; FM Synth's packer site (`0x4000d514`) rejoins before the second call.
- A machine track is a STATIC or FLEX track whose Part slot carries `PL`, `FM` or `S2` (the card machine registry's and FM Synth's own test), read once a frame at the exit into an 8-bit mask. Any other render costs four instructions in the hook.
- `GRD 0001` (W) records the dropouts, at most one record per 10 s from the engine's idle point, never from the interrupt.

## Configuration and privacy

Every v2 checkpoint has the exact module ids/versions, OS, ordered FX1/FX2 chooser keys, hidden modules, stock-FX2 setting, full configuration hash and source hash. `build` abbreviates the configuration hash; it is **not** the SHA-256 of an image that embeds its own identity. Browser image hashes are reported separately.

`src/engine/core-logger.ts` installs the complete resolved composition identity in every static or dynamic runtime. The native `build_local.py` probe contains only stock plus the core logger; its module list is deliberately empty. It is not evidence of DSP or module runtime behavior. `package.py` compiles only original source with zero stock-replay placeholders; the firmware-free test checks the full source inventory and those placeholders. Regenerate `src/engine/assets/core-logger.json` after a source change using the reviewed m68k-elf GCC toolchain. No firmware is needed or permitted for that command.

Events contain numeric state and codes, not firmware bytes, paths, project/set names, sample names, audio, MIDI payloads or screen/RAM dumps. A checksum establishes completeness, not authenticity. The report form makes the public contents visible before submission.

## Crashes

The adapter chains the stock exception callback and appends a minimal vector/PC/format-SR record in RAM. It does not attempt filesystem work during a fault. This covers callbacks reached after logger initialization; it cannot capture a hard lockup, DSP-only stall, earlier boot failure or power loss.

A reserved region is excluded from the mod loader's initialized data. If its ring and configuration identity survive a reset, the previous session is included in every checkpoint of the next boot. **Actual MKI/MKII reset retention is unmeasured**; do not tell users to power-cycle to recover a log. A torn RAM header can prevent recovery. Copy existing card checkpoints after a crash before attempting further saves.

## Files and verification

- `octamod_log.c/.h`: ring, bounded snapshots, strict formatter, CRC32 completion marker.
- `octamod_log_firmware.c`, `octamod_log_port.h`: batching, backoff, correlation and lifecycle.
- `frame_guard.c`: the frame guard; `tests/guard_test.c` drives it with a simulated frame timer and Part.
- `stock_140c.c`: original adapter for the stock file ABI and numeric state; uncached aligned I/O buffer.
- `stock-guards.json`: hashes/addresses only. Stock instructions are replayed from the owner's verified local image at build time, never copied into source.
- `build_local.py`: private native-composer probe builder. Refuses output inside the repository and rejects any image other than verified original 1.40C.
- `tests/run_host.sh`: firmware-free ring, controller and file-adapter tests, including short writes, readback failure, peer preservation, prefix writes, wraparound and all flush gates.
- [FORMAT.md](FORMAT.md): event meanings and text protocol. [TESTING.md](TESTING.md): evidence and remaining qualification.

The core reserves 16 recorder pages (98,304 bytes), including loader staging and an 8 KiB retained/I/O region. Existing DRAM selections retain their own 1,707-page reservation and add these 16 pages. The retained region is excluded from both runtime and loader staging. Exact linked ranges and source/image hashes are emitted into the **private** build report. Current-version cycle/memory reports, full-composition parity/rejection coverage and hardware stress remain further qualification work. The owner explicitly waived these release restrictions for this logger addition, including hardware testing; no new measurements or hardware safety claims are implied.
