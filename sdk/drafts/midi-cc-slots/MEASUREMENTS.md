# Midi Mode 2 release measurements

This is an incomplete qualification record for 0.0.18-experimental. The runtime
package is unchanged. No timing pass or complete RAM/stack bound is claimed.

## Reproduced memory layout — 29 October 2026

Run from the repository root with the reviewed m68k-elf toolchain on PATH:

```sh
python3 -B sdk/drafts/midi-cc-slots/measure_memory.py --output /private/local/new-midi-memory-run
```

The destination must be new and outside Git. It retains private ELF, linker
maps, objects and compiler stack reports. The sanitized result is
[evidence/memory-layout-0.0.18.json](evidence/memory-layout-0.0.18.json).
The command refuses evidence if its package differs from `local-build.json`.
Audit and ordinary compilation both reproduce package SHA-256
`8d971baca19198b9e35d7644c7c8810f917471f980eadc2db03fab8de3668451`.

| Allocation or file | Bytes | Scope |
| --- | ---: | --- |
| Encoded package | 33,434 | Transfer/card file, not resident RAM |
| Text sections | 13,860 | Code, inline constants/replay placeholders and 136 bytes of assembly-owned state |
| C zero-initialized sections | 14,636 | Profile, I/O buffers, CRC table and state |
| Merged C strings | 442 | Resident image |
| Linker gaps and sentinel | 26 | Resident image |
| Complete dense image | 28,964 | Sum of preceding image rows |
| Runtime module header | 510 | Target ABI, 36 hooks |
| 24 site records | 1,728 | 72 bytes each, includes original and replacement bytes |
| Pool header alignment | 2 | Round header and sites to 16 bytes |
| Pool image alignment | 12 | Round image to 16 bytes |
| Resident pool extent | 31,216 | One project-wide module, not one allocation per MIDI track |
| Two same-size revisions | 62,432 | Old plus candidate retained for replacement/Undo |

The 25 stock copies are reconstructed into existing image placeholders. They do
not allocate separate spans. Relocation records remain package metadata. No
authored DSP program, DSP buffer or module-owned heap is allocated. State for
all eight tracks and 16 banks is already inside this image. The stock editor
buffer and channel/project structures are reused; their storage belongs to the
base/stock system. Four 4,096-byte MIDI4 sidecars are project card storage.

The pool calculation uses target-compiled `sizeof` from the current loader and
Octatrack event header, then follows `loader.c`'s admission formula. It excludes
the base's preallocated upload staging, ownership ledger and event tables.
The calculation alone is not a whole-system peak or a physical reading.
The development-twin measurement below confirms its pool delta. Different
bases require a new target ABI probe.

Compiler `-fstack-usage` reports a largest individual C frame of 1,440 bytes in
`persist_bank`. This is **not** the stack peak: caller frames, assembly wrappers,
stock file calls and interrupt/task context must still be bounded. There are no
unbounded compiler frame records; `dynamic,bounded` describes bounded outgoing
call arguments too. Hardware stack canaries have not been measured.

Compiler call graphs also reproduce identical code. The known direct C chain
has a conservative 1,932-byte bound, including four extra bytes per call/entry
for return addresses (which can double-count outgoing reserves). One longest
chain is `mt_clone_begin → mm_profile_service → mt_persist_bank → persist_bank
→ inspect_bank → mt_bank_open`. All 72 C frames are represented and no direct
C cycle appears. Indirect stock calls, assembly wrappers, reentry and task/IRQ
context remain outside this partial bound; complete stack qualification is open.

## Physical pool comparison and return to the installed base

The operator saved their disposable project, stopped it and approved the RAM
restart. A private development twin of source `8fbd3beb`, base
`8472238a4d448bf8d4be8077a831eb5d549036d490bf26c365ead6cfd7862544`,
was built with the beta features and development requests. Sidechain and
Analog BD were rebuilt against its exact symbols/trust rows; Analog BD's hash
recipe was recaptured only in a private scratch source tree. The other three
packages, including MIDI2, were unchanged. Guards, link/container checks,
two MIDI image reconstructions, strict stock-free scan and actual C loader
host tests passed before the RAM boot. No full emulator execution was claimed.

Physical development request 24 returned these stable free/largest runs across
eight readings per temporary whole-set trial:

| State | Free bytes | Largest free run | Pool use |
| --- | ---: | ---: | ---: |
| Empty development base | 786,432 | 786,432 | 0 |
| All five packages | 709,264 | 709,264 | 77,168 |
| Four companions, without MIDI2 | 740,480 | 740,480 | 45,952 |
| After each Undo | 786,432 | 786,432 | 0 |

The matched difference is **31,216 bytes**, equal to the target ABI calculation.
Both trials verified the original empty inventory and whole-set digest after
Undo. This proves the measured extent/reclamation, not stack bounds, canaries,
shared base buffers or the two-revision replacement peak.

The first probe's initial Undo returned `needs-recovery`. A fresh connection
subsequently found `normal` and verified the exact empty baseline: automatic
recovery had completed. The repeat allowed the normal bounded recovery wait,
then verified both Undo operations and full free/largest-run reclamation.
No Keep/accept or flash was requested. After the bridge was released, Cooper
power-cycled and reported MODULES LOADED. Readback verified the original
`c1ae2ee9…` flashed base and exact five-package digest `6b9b601b…` above.
The bridge was released again. See
[physical pool evidence](evidence/hardware-pool-2026-10-29.json).

## Read-only hardware meter capture

The USB bridge must already be running, with the browser disconnected. Safely
eject and leave USB DISK MODE first. This command sends only identify,
inventory, whole-set digest and public load requests:

```sh
node sdk/drafts/midi-cc-slots/capture_load.mjs --output /private/local/new-stopped.json --label 'Test project, stopped, MIDI2 and named companions' --seconds 20
```

It refuses overwriting a file, records unavailable values as null, verifies an
unchanged whole-set digest and warns if the cached frame counter stands still
or meters are unavailable. A cached counter alone cannot establish that the
audio engine stopped. One-second polling is not an interrupt timing probe.

On 29 October the connected unit identified base
`c1ae2ee92a829e06aa9398d35981b8228efdd34c578c9583ef36fba8f5bc637f`.
Inventory listed SIDECHAIN COMP, Play Modes, Mute Modes, MIDI MODE 2 and Analog
BD. Its whole-set digest was
`6b9b601b7df88a41b46bd1299397ece3b42d0a825989da3edcd0b06c3fc02e64`.
Inventory names alone do not resolve package hashes. The later offline
reconstruction of this MWS1 digest from the four published package pins and the
reproduced MIDI2 pin matched exactly; see
[runtime identity](evidence/runtime-identity-2026-10-29.json). This establishes
that the running MIDI2 package was the pinned 0.0.18, with all four exact
companions. Initial 20-second
capture was in disk mode, confirmed by Cooper; a second was after Cooper
reported returning to the normal stopped project screen. Both returned null
CPU/DSP meters and a nonadvancing cached frame counter. Neither provides a load
measurement. Development memory requests were explicitly unsupported.
Cooper then reported that PLAY did not start playback after leaving disk mode.
The bridge was closed; Cooper power-cycled the unit and reported that playback
worked again. Cause and module attribution are unestablished. Disk-mode exit
and playback recovery need reproduction before release; do not characterize the
initial captures as a normal stopped baseline.
Raw readings remain private; no firmware, RAM or project contents are included
in this report. No install, removal, Keep, project save or flash was performed
in those first two captures.

After that power cycle the public meter worked. A fresh 20-second stopped
capture had sampled maxima of 55.8% CPU, 50.9% / 41.9% DSP mean (tracks 1–4 /
5–8) and 51.8% / 42.7% DSP peak. These are full-device windows, including all
five modules, not attributed MIDI2 processing times.

A subsequent stopped comparison used `UploadSession` to stage only the empty
removal package for module `f36a496d`, activate it in a temporary trial, then
rollback and leave without accepting. Each phase captured 16 public readings
one second apart. All four companions remained present during removal. The
original five-item inventory and full whole-set digest above matched after
Undo. No Keep, project write or saved-set update was requested.

| Stopped phase | CPU max | DSP mean max T1–4 / T5–8 | DSP peak max T1–4 / T5–8 |
| --- | ---: | ---: | ---: |
| Installed before | 55.8% | 50.9% / 41.9% | 51.8% / 42.0% |
| Temporary removal | 55.5% | 50.9% / 41.9% | 51.8% / 42.7% |
| Restored after Undo | 55.5% | 50.9% / 41.9% | 51.8% / 42.0% |

The 0.3 percentage-point variation does not establish an attributable module
cost: the restored phase equals the removal phase. Project content/model were
not recorded, and this was neither a playing workload nor worst-case timing.
Private local reproduction command: `node compare-stopped-load.mjs`; source
SHA-256 `284b1014f14101946efa44bd63cc5faeafe3f163de94b54e26a044bd9bc5eaa5`.
The script and full numeric captures are retained privately with this run.

## Passive MIDI input capture

The macOS-only `capture_midi.c` creates input ports and listens to existing
sources. It never sends MIDI, starts playback or edits the instrument. Compile:

```sh
clang -Wall -Wextra sdk/drafts/midi-cc-slots/capture_midi.c -framework CoreMIDI -framework CoreFoundation -o /private/local/capture-midi
/private/local/capture-midi --selftest
/private/local/capture-midi /private/local/new-packets.jsonl 90 > /private/local/new-summary.json
```

Raw timestamped packet bytes remain private. Summary counts include channel
messages, CC assignments, clocks, notes and final active-key flags. They do not
measure dropped messages without a known transmitted sequence; final active-key
flags do not prove audible stuck notes or distinguish overlapping same-pitch
voices. A local synthetic parser check passed running status, realtime clock
between data bytes, CC0/127, channel 6, both forms of note-off, SysEx and CC123.
Host compilation passed `-Wall -Wextra`. MIDI sources enumerated on this Mac:
Scarlett 18i20 USB and Elektron Octatrack DPS-1.

### Observed playback run

Cooper confirmed “Eight tracks at 240; no issues” after the requested 65-second
playback, Part change and STOP test. The passive recording lasted 90.033 seconds,
including its manual start/stop margins; log writes succeeded. USB input counted
934 note-ons, 932 note-offs and 1,348 CC messages; Scarlett counted 855 note-ons,
866 note-offs and 1,297 CC messages. These are different input paths, not an
expected/received comparison. No clock-derived tempo or wire-rate pass is
established. Raw final active-key flags were 2 on USB and 28 on Scarlett; the
capture may have ended before the final manual STOP. These flags cannot be
upgraded to a stuck-note verdict; Cooper reported no audible issues.

The simultaneous 60.115-second public capture had 61 samples. Sampled maxima
were 45.7% CPU, DSP mean 36.7% / 41.9% and DSP peak 37.7% / 42.7%. The exposed
frame counter advanced and the exact module set remained unchanged. This
project was prepared after the earlier stopped comparison, so the two runs
are not matched baselines. See the sanitized
[hardware observations](evidence/hardware-observations-2026-10-29.json).
No incoming flood, deterministic receiver comparison or complete worst-case
qualification is claimed.

The exact candidate's sites and checked stock-copy ranges were also compared
against all 26 published package files in `octatrack-module-packages.json`,
after verifying every pinned file hash. All three intersections (patch/patch,
candidate-copy/other-patch, candidate-patch/other-copy) were empty. This is a
static byte-ownership check; it does not prove UI, semantic or runtime coexistence
with every module. Full composition/qualification remains pending.

## Remaining measurements

1. Reproduce disk-mode exit/playback recovery. Public meters returned after a
   power cycle; the preceding stalled snapshots remain invalid load evidence.
2. Measure the two-revision replacement peak if claiming it as physical evidence;
   the 62,432-byte value remains calculated. Future development sessions must
   retain exact symbols, companion packages and return-to-normal verification.
   Never Keep a temporary-base set or flash for measurements.
3. Complete the public-base lifecycle matrix beyond the recorded removal/Undo,
   power-cycle and exact original-set checks; keep older version reports separate.
4. Bound assembly and nested C/stock stack use, staging lifetimes and transient
   allocations. Reconcile these with task stack capacity and hardware guards.
5. Run matched baseline and module tests with unchanged companions/project:
   eight MIDI tracks, PB/AT and CC modes, CC0/127 and value endpoints, simultaneous
   p-lock/LFO CC activity, same-channel competition, bank/Part changes, name
   browsing/editor confirm/cancel and autosave. Record worst path and deadline,
   interrupt/frame gaps and idle headroom. Separate stopped INIT/replace/cancel,
   recovery and Save to New latency from real-time playback paths.
6. Capture outgoing MIDI with a receiver and test incoming note/CC/clock flood
   near wire rate at 240 BPM or above for at least 60 seconds. Count drops and
   stuck notes, stop mid-note, change Part and inspect companion audio. Retain
   tool versions, actual workload and limitations. Public status maxima cannot
   replace worst-case cycles/event evidence.
7. Finish `tests.qualification` and the performance record only with the actual
   numbers, then prepare public catalogue integration and owner review. The
   current local draft remains opt-in.

The three retained INIT illustrations were mistakenly labelled 0.0.18 in the
local document. Their existing `media/capture-bank-map-fix.json` binds them to
0.0.13; metadata and captions now agree with that record. They remain examples
of unchanged controls, not current-base UI execution proof. Fresh 0.0.18
captures are still needed before public submission.
