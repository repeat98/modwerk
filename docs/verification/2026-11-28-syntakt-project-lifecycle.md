# Syntakt OS 1.42: native Project file and LOAD failure boundaries

28 November 2026. Related to #1922. **EMULATOR-PROVEN within the fixture below;
not hardware-tested.** No core event, installed hook, memory reservation or
persistence implementation is proposed. This record extends the original static
survey with actual native execution, not a replacement Project serializer.

## Result that callers must preserve

An existing-slot LOAD can activate the requested Project, fail its subsequent
write of active slot 128, and return failure while the requested Project remains
live. **Failure is not evidence of rollback.** The selected-slot bookkeeping can
still name the previous slot. Read live identity separately from that index.

The same native UI worker was run in three independent, freshly initialized
fixtures. `OLD PROJECT` was initially live and stored in slot 128; the requested
slot 127 held `NEW PROJECT`. **A = OLD PROJECT; B = NEW PROJECT.** Names are
synthetic fixture labels, not user data. Both start from native defaults; their
names and full-buffer hashes distinguish them. They are not two musically
independent test arrangements.

| Case | Activation low D0 | File writer D0 | Active-slot save low D0 | LOAD wrapper low D0 | UI worker D0 | Live Project on return | Slot-128 name observed in original receipt | Selected index |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Successful control | 1 | 0 | 1 | 1 | 0 | NEW PROJECT | NEW PROJECT | 127 |
| Fail final media write for active slot 128 | 1 | 2 | 0 | 0 | 1 | NEW PROJECT | OLD PROJECT | 0 |
| Fail requested-slot media read | 0 | not called | not called | 0 | 1 | OLD PROJECT | OLD PROJECT | 0 |

### Full slot-128 measurement added after checking existing evidence

The retained original receipt already answers return values and live/stored
names. Its fourteen file cases were reused rather than rerun. It did **not**
record a complete post-LOAD slot-128 hash. Two supplemental runs of the unchanged
native fixture add exactly that measurement, after the UI worker has returned.
See [A/B measurement source](2026-11-28-syntakt-project-lifecycle/native_ab_verification.py)
and [A/B result](2026-11-28-syntakt-project-lifecycle/native-ab-result.json).

| LOAD case | Native LOAD low D0 | UI-worker D0 | Live after return | Verifiable slot 128 in synthetic media |
| --- | --- | --- | --- | --- |
| Normal LOAD B | 1 | 0 | B | Full stored buffer matches the actual native write; name B |
| Reject active-slot write after B activation | 0 | 1 | B | Full stored buffer equals the original A, byte for byte |

In both cases, a **new native file-wrapper read of slot 128** after worker return
returned 0, read `0x3E6604` bytes, matched the complete stored buffer and preserved
both 32-byte redzones. The verification read changed neither the live name nor
the stored buffer. No tested LOAD, decoder, activation or error branch was
replaced. The same declared OS/media service boundaries still apply.

| Buffer | SHA-256 |
| --- | --- |
| A initially stored in slot 128 | `11e97b66c85d1076170e7b53a303fccbab06d7c5999f338e62c884462d6d9c9b` |
| B input in requested slot 127 | `16e97596f19113aebfda0e3df64ea925493eb97cf5fd4f7b443879a22fcd58ce` |
| Slot 128 after successful LOAD B | `fac0db7d1db1e563bbc921bf5cd4b55b49f24d848c96684630d4b0f3a6e394fb` |
| Slot 128 after rejected active write | `11e97b66c85d1076170e7b53a303fccbab06d7c5999f338e62c884462d6d9c9b` |

The successful slot-128 buffer is **not identical to the original B input**.
The test establishes B's live identity, the actual serialized write's hash and
its full native readback; it does not equate that output with a byte-identical
copy of B's input. Which fields account for the difference and their full
semantics remain **OPEN**. Physical slot-128 contents, partial/torn media writes,
flush barriers and power-loss durability are also **OPEN**. The failure service
models an all-or-nothing rejected write in synthetic media, not a torn eMMC write.

### Evidence levels

- **STATIC / reused:** the guarded addresses, ABI, flags and control-flow map.
  They are not all independently exercised by the new A/B observer.
- **NATIVE EMULATOR / reused:** original 14 file cases and 3 LOAD cases, receipt
  and unchanged host fixture bound by their hashes. The file cases include full
  transfer/tail equality and redzones at slots 0/127/128.
- **NATIVE EMULATOR / new:** 2 A/B LOAD runs, whole slot-128 comparisons and a
  separate native full-file readback after each return. No firmware bytes are
  embedded in the source or result.
- **DEVICE / untested:** no hardware run, media durability, CPU2/audio, UI
  completion or asynchronous queue-draining acceptance is inferred.

In the write-failure case, the injector asserts that activation has already
returned success, the runtime name is NEW PROJECT, and the target is slot 128
before rejecting the write. It does not force a codec or operation result.
Native branches carry the rejection back to the worker. The active cache entry
becomes invalid on write failure; it remains valid in the successful control.

Use the result's declared width: the successful slot-save returned full D0
`0xFFFFFF01`, consumed by its native caller as low-byte boolean 1. The UI worker
inverts the operation boolean and returns scalar 0 for success, 1 for failure.
Do not treat every native boundary as a zero-success function, or compare a
byte-boolean return with full-width integer 1 without checking its contract.

## Exact input and scope

- Official unpacked OS 1.42 MAIN, section 3: 3,442,576 bytes, load `0x40000400`.
  SHA-256 `1a9723b19fb54d0566c1f690379d2e6dfe43227f77e170ad731dd029430eb3e7`.
  File offset is runtime address minus load address. No other OS is qualified.
- Unicorn 2.1.4, M68K ANY / big-endian CPU1. Each native call has a
  300,000,000-instruction cap, 45-second host timeout and a checked return
  sentinel. Every final case returned; no invalid access occurred.
- The reused original host fixture and machine-readable result are adjacent:
  [native_probe.py](2026-11-28-syntakt-project-lifecycle/native_probe.py) and
  [native-result.json](2026-11-28-syntakt-project-lifecycle/native-result.json).
  The receipt binds the exact fixture by SHA-256. The supplemental A/B
  receipt also binds its observer source and the unchanged original fixture. No firmware, disassembly,
  instruction bytes, native tables, personal Projects or third-party framework
  implementation is included. The fixture imports standard Python and Unicorn
  only; it does not import MAX, DigiKit, Elekloader, Synfact or Modwerk code.

For an owner-supplied unpacked MAIN and an existing Python/Unicorn environment:

```text
python -B native_probe.py /path/to/section_3_MAIN_OS.bin --output native-result.json
python -B native_ab_verification.py /path/to/section_3_MAIN_OS.bin --output native-ab-result.json
```

The only file written is the requested JSON result; use a new output path to
retain an earlier receipt. MAIN is read-only and rehashed after the run. No
firmware build, native instruction replacement or device access is performed.

## Full-file route and lengths

| Quantity | Exact length | Interpretation |
| --- | --- | --- |
| Codec prefix | `0x3A5604` = 3,823,108 | Header, child records and footer at `+0x3A5600` |
| Native file transfer | `0x3E6604` = 4,089,348 | Actual requested length at final media boundaries |
| Trailing extent | `0x41000` = 266,240 | Additional bytes carried by full-file wrappers; not allocated extension space |

The native file writer `0x40112124` and reader `0x401107B0` were executed with
owned buffers of the full file size. Writer input was made by native Project
default initialization `0x40018AB0`, with a synthetic name and recognizable
opaque trailing data. Slots 0, 127 and 128 each passed full write/read equality,
trailing-extent equality and 32-byte redzones at both ends.

| Project slot | Native locator result | Full read/write result |
| --- | --- | --- |
| 0 | `0x80000` | 0 / 0 |
| 127 | `0x17E000` | 0 / 0 |
| 128 (active) | `0x7E000` | 0 / 0 |

**Locator results are opaque arguments to native media services, not raw byte
offsets or permission to write a physical storage address.** This test observes
the arguments; it does not reconstruct the lower media addressing scheme.

```text
write 0x40112124
  -> native guard and catalogue state 0x401101C4
  -> native write protection 0x40110584, when the caller does not override it
  -> native slot locator 0x40110746
  -> final media write 0x40111628
  -> native catalogue refresh 0x40110952
     -> final media read 0x401100D4, 512 bytes

read 0x401107B0
  -> native guard/catalogue/slot-presence branches
  -> native slot locator 0x40110746
  -> final media read 0x401100D4, 0x3E6604 bytes
  -> native normalizer 0x400AFAF6
```

Catalogue refresh also occurs after the injected write failure. It reads the
old stored header; the test did not skip or force that refresh. Its success does
not repair the failed write or undo the already loaded runtime.

The writer chooses the full count for the Project marker; its other marker path
writes 512 bytes. That branch is also tested. A full-sized allocation alone does
not prove the writer chose the full-sized transfer.

The 14 file cases cover the three positive roundtrips plus eleven rejection or
alternative paths. `-1` is an unsigned out-of-range file slot here, unlike the
separate runtime-copy route at the higher decode layer.

| Case | Reader D0 | Writer D0 | Media behavior |
| --- | --- | --- | --- |
| Slot 129 or `-1` | 2 | 1 | No final media call |
| NULL buffer | 2 | 1 | No final media call |
| Catalogue unavailable | 5 | 4 | No final media call |
| Final media service rejects | 3 | 2 | Rejection translated by native wrapper |
| Slot absent | 1 | not run | No media read |
| Bad footer / future Project version 14 | 4 | not run | Full read, then native normalization rejects |
| Non-Project marker | not run | 0 | Native 512-byte write branch |
| Slot protected / protection table unavailable | not run | 3 | No media write |

The catalogue fixture supplies its ready flag at `+0x1543C`, marker at
`+0x15440`, protection-table-ready flag at `+0x15448`, protection bitmap at
`+0x15449`, and per-slot presence at `+12 + 28*slot`. Those branches execute
natively. An unavailable protection table fails closed for the tested ordinary
slot; active slot 128 has its own native branch. These are fixture/native
contracts, not SDK field allocations.

## LOAD execution and the failure boundary

```text
UI worker 0x4005BAFA
  -> native existence check 0x401104FE
  -> LOAD wrapper 0x4001D6FE
     -> activation 0x4001D430
        -> native transport/sample preparation
        -> slot decode 0x400C1D88
           -> native cache lookup/fill
           -> full file read 0x401107B0 on cache miss
           -> normalizer 0x400AFAF6
           -> Project import 0x400AE070 into the bound runtime
        -> metadata/notification function 0x400183D6
        -> remaining native model/audio-selection work
     -> activation returns at 0x4001D72C: low D0 = 1, live name NEW PROJECT
     -> save slot 128 at 0x4001D750, through 0x4001A6E6
        -> full native export 0x400AE3B0, selection mask -1
        -> cache flush 0x400C18F8
        -> file writer 0x40112124
        -> reject only final media write 0x40111628
     -> native false-return branch, without runtime rollback
  -> wrapper returns at 0x4005BBAE: low D0 = 0
  -> native worker inverts boolean and returns D0 = 1
```

The fixture records identity through the native Project getter `0x401752F2`,
which still returns the same bound flat-runtime pointer (`0x52000000`). Native
import replaces that object's content in place; a new pointer is not required
for a different Project to become live. It separately records the runtime name,
stored active-file name, selected index (`0x40653441`) and cache validity.

### Caller obligations, beyond the experiment

Native import `0x400AE070` takes runtime destination, serialized source and a
readable operation context; it returns low-byte boolean. Export `0x400AE3B0`
takes serialized destination, runtime source, an opaque child-codec argument,
selection mask and operation context. Context `+8` is dereferenced; NULL is not
a valid no-progress context. The higher caller must own complete buffers.

Outer decode success can default invalid child records. It does not certify
every Pattern, Kit, Song or Sound and is not an atomic transaction. A codec call
is not a once-per-UI-operation notification: selected-slot SAVE can serialize
both the selected slot and active slot 128, and deferred/scratch routes also
call the codec. The selected-slot SAVE transaction was statically traced here;
the new execution cases focus on the file wrappers and existing-slot LOAD.

Synfact already publishes the nine Project worker sites and operation-scope
work. Those are prior work, not newly invented hooks:
[operation scopes](https://github.com/GSM1980/synfact-dev/blob/8b4c67c82ae69e884b0bb23bb4b82eb5076b86d2/docs/PROJECT-OPERATIONS-CPU.md),
[lifecycle audit](https://github.com/GSM1980/synfact-dev/blob/8b4c67c82ae69e884b0bb23bb4b82eb5076b86d2/docs/PROJECT-LIFECYCLE-AUDIT.md).
No implementation from either is transferred. The observed multi-stage failure
is why future shared events should distinguish decoded, activated, slot saved
and operation failed instead of exposing one ambiguous load/save boolean.

## Guards and ownership

All runtime addresses are bound to the full exact stock MAIN identity above.
The local 27 November static ledger additionally checked 58 windows, 29 targets
and ten code-region hashes. Selected entry guards are listed below. Lengths are
whole-instruction identity windows, **not approved redirect/trampoline lengths**.
None grants a core hook, persistent carrier or resident RAM allocation.

| Native entry | Address | Window bytes | Window SHA-256 |
| --- | --- | --- | --- |
| project_import | `0x400ae070` | 8 | `3e47fdc2a5af6492a822beaa4ccd4bb53d5f5b2111c689c9f6f1cca2a3df15e2` |
| project_export | `0x400ae3b0` | 8 | `52dccc03e103dca3839c839017cffce1d4a1e675d8dfb2804764141e86c63841` |
| project_file_read | `0x401107b0` | 8 | `a11e05ab164530e5677ded759efd0bc532f27ec06b090f35ba8c00e9d0dd106f` |
| project_file_write | `0x40112124` | 8 | `71f605b411acbf9907157523e7a2a37424214412af4dcb71c50b7176ddf9b1f2` |
| project_format_normalizer | `0x400afaf6` | 8 | `f130bc103cba5631b1978c71842711193f2640711db82351c3d097348a3ddd6a` |
| project_load_and_activate | `0x4001d430` | 8 | `ecb9dd89ebed2eadae1f8f4e5eb65ee1aed5b6607fae1bea3428e3723fe9d9d6` |
| project_load_and_active_mirror | `0x4001d6fe` | 8 | `757fbde3cb1eb7e84e6e8585255783de8dc9f5b00b7c66a8e337c1b8709417a9` |
| project_slot_save | `0x4001a6e6` | 8 | `2823502671e7bbff2c6affd8ca735fa23ecd1eba60aeda5913a571206fc35462` |
| slot_decode_wrapper | `0x400c1d88` | 8 | `59cb72f0c531857e2d84bacfd5fb06272ce1360935e47ca17bdd4861cc9ff977` |
| slot_cache_flush | `0x400c18f8` | 8 | `50651933b5187b55ffdccd402abd23a518edb19f0a8040a9a5d8e12cd5f56136` |
| project_metadata_notify | `0x400183d6` | 6 | `f82c749ea7bef942eea2e13c36188d2b75f2a78f6cc30808b2e9b9b12cf6256f` |
| project_ui_load_worker | `0x4005bafa` | 8 | `a276612b153ef3af8492e3e7bb6c1ce5eff7645395aca8dc8c3d0231feba54ac` |

Sound/Kit, custom-machine identity, Scenes and Song Morph research can inform
carrier ownership. It does not qualify whole-Project media I/O or cold hardware
recall. In particular, Song model serialization can own queued mirror work;
borrowing its pointers is not a generic persistence API. MAX numeric IDs and
occupied extension records are not a Modwerk registry/storage allocation.

## Fixture preconditions and substitutions

The fixture runs native notification initialization (`0x401A0826`), native
Project-model construction (`0x4001BB10`), native Project defaults and initial
import, native child-model rebinding (`0x400182BC`), and native queue construction
(`0x40001BAC`). It supplies owned catalogue, runtime, model and buffer memory,
publishes the fixture's singleton pointers, and starts with a stopped sequence
and valid current Pattern/Kit pointers. Child notifications are inhibited only
during initial binding, with the exact original flags restored before LOAD.
This is a prepared operation fixture, not a reset-to-UI OS boot.

It substitutes these eight service entries only in the LOAD worker cases:

| Entry | Fixture service | Limitation |
| --- | --- | --- |
| `0x40001904` | Mutex creation | One task; no contention |
| `0x40001980`, `0x40001AA2` | Mutex acquire/release | Native guard wrappers still execute; no scheduling proof |
| `0x4010394C`, `0x40103958` | Owned arena allocation/free | Free retains arena; does not test native heap exhaustion |
| `0x401100D4`, `0x40111628` | Final media read/write | Dictionary-backed full buffers, explicit failure injection; no eMMC |
| `0x40002550` | Record delayed OS callback scheduling | No real timer or callback dispatch |

The file cases omit the timer substitution. The tested decoder, native
normalizer, activation, transport preparation, cache, file wrappers, worker and
their error branches are never replaced by doubles. The fixture maps CPU1's
shared audio-parameter RAM but does not run CPU2, audio interrupts or physical
sample I/O. Notifications may be queued; successful function return is not proof
that every asynchronous consumer or UI completion callback has run.

## Still untested

- Physical storage, flush barriers, power-loss durability, cold hardware reload
  and real-time CPU/audio cost; no user or other hardware acceptance from this run.
- Native heap allocation failures, contention, task races, queue draining,
  callback lifetime and rendered UI completion.
- Full-format meaning/ownership of the additional `0x41000` extent. Direct file
  wrapper equality does not prove that activation and re-export preserve every
  opaque trailing record. No storage address or spare byte is offered to mods.
- Old-format conversion fixtures, all corrupt-child/default combinations,
  missing-slot creation, UI save-before-load and boot/reload equivalence.
- Full-mask Scene/Song cue recall with saves already queued before switching.
  This is section 10's third experiment and is not claimed by the first two.

The earlier static hypothesis about partial LOAD success is now corroborated
by native execution within these limits. A future core contract still needs
owner review, task/ownership design and separate hardware qualification.
