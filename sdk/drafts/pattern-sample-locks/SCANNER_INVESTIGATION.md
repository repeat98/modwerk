# Stock-scan investigation — 30 October 2026

The strict scanners detect real byte coincidences. The independent reproducer
establishes that ordinary compiler output triggers both checks, so rejection
alone is not evidence of copied firmware. No scanner bug, release exception or
publication approval is established. The original candidate still fails both
unchanged scans.

## Method and result

Compilation and stock comparison ran in separate containers. The compilation
container mounted the checkout read-only and only this investigation's private
output directory. Private stock and the reference package were not mounted.
GCC 16.2.0 used the SDK's MCF54455 flags and code-generation guard.

Fresh compilation of `translation.c`, with debug information retained in the
object for source lines, reproduced all 8,748 initialized bytes, 1,328 BSS bytes
and 167 relocations of the tested candidate. The production linker deliberately
rejects orphan debug sections, so its unchanged path linked a stripped twin of
the debug object. Those initialized bytes match the image in tested package SHA-256
`28766a017005e664d00620d3831fc81af7449c95e1896a17121ca8fc2d306d8d`.
Changing one candidate code byte made the diagnostic refuse it before reading
stock, checking that source attribution stays bound to the actual candidate.

The test-only [probe](scanner_probe.c) is outside the module's translation unit:

- A small function contains an empty compiler barrier requesting three
  ABI-preserved registers, then subtracts two integers. The barrier emits no
  instructions or byte constants. GCC emits a 16-byte sequence reserving stack
  space, saving registers and loading arguments. It exactly matches the rejected
  sequence at candidate package offset `0xef4`, and both scanners reject it.
- A plain C function stores `value % 4` in a volatile global. Its signed remainder
  and store sequence reproduces the 12-byte rejection at package offset `0xff0`.

The combined probe is 60 initialized bytes, four BSS bytes and one relocation.
It includes no firmware constants, tables, sample data or stock calls. It was
compiled and inspected, not executed on hardware. Its signed-remainder control
shows a weighted-scan collision without any inline assembly.

## Every rejected group

The weighted scan reports 15 seed starts. Overlapping starts describe eight
groups; the separate 16-byte scan reports only the encoder prologue.

| Package offset | Exact matched bytes | Source attribution |
| --- | ---: | --- |
| `0x356` | 13 | `engine.c:51`: compiler frame and argument loads |
| `0xef4` | 16 | `ui.c:150`: compiler register saves and argument loads |
| `0xff0` | 12 | `ui.c:164`: signed remainder and start of store |
| `0x10d0` | 14 | `native.c:57`: font API call and stack cleanup |
| `0x11d2` | 15 | `native.c:79`: font API call and stack cleanup |
| `0x17a0` | 12 | `native.c:182`: compiler register restore and return |
| `0x1f1d` | 12 | `ui.c:21`: text inside LOCK SAMPLES TO PATTERN |
| `0x1f27` | 15 | `ui.c:21–22`: text across PATTERN and CLEAR labels |

The final two matches overlap. They are authored descriptive action labels,
not additional executable paths. Earlier descriptions that treated every hit
as an instruction sequence were incomplete. The source locations and byte/hash
comparisons are retained in the [stock-free receipt](evidence/stock-scan-investigation-20261030.json).
No matched firmware bytes or extracted disassembly are committed.

## Packaging route to evaluate

The existing [standalone runtime adapter](../../machines/octatrack/module-adapters/standalone_runtime.py)
already handles authored-code coincidences for Play Modes, Tape Echo and Euclid.
Its source/image-bound recipes remove the coincident spans from shipped literal
bytes. At installation, hash-guarded copies from the user's own OS reconstruct
the exact authored image. Both strict scans remain authoritative. The recipe
validator checks source provenance, bounds, overlaps and relocation words.

Pattern Sample Locks has no declaration in that adapter's reviewed module set.
This investigation does not add one. The next packaging experiment should:

1. Prepare a hash-only declaration bound to this source and compiled image,
   describing each span and its authored source. Resolve the overlapping label
   spans and check that source locations remain valid on the supported bases
   and companion sets.
2. Prove reconstruction equals the original image byte-for-byte, verify both
   unchanged scanners on the complete resulting package, and exercise refusal
   for changed source/image/stock guards and invalid spans.
3. Add support through owner review, then test the changed package's actual
   loading, removal and Undo. Equal reconstructed code preserves the code
   identity; it does not automatically qualify a new package's lifecycle.

This is an existing packaging mechanism to evaluate, not a reason to change the
module's behavior or exempt it from a scan. There is no proposed gate correction
at this stage. Card UI integration and CPU/total-stack qualification remain
separate unresolved work.

## Reproduce privately

With the source at `/work` and a fresh private output mount at `/out`, run in
the pinned source-tools image **without stock or candidate mounts**:

```sh
python3 -B sdk/drafts/pattern-sample-locks/investigate_stock_scan.py \
  compile --out /out/new-investigation
```

In a second container, add read-only stock, candidate and verified Elekloader
mounts at the paths below, keeping the same private output:

```sh
python3 -B sdk/drafts/pattern-sample-locks/investigate_stock_scan.py \
  analyse --out /out/new-investigation --package /candidate.mwrm \
  --stock /stock.bin --upstream /upstream
```

The diagnostic exits successfully when it reproduces and explains the rejection;
its JSON records the rejecting verdicts. This is not a passing release gate.
Objects, linked images, private disassembly and raw logs stay outside Git. No
module runtime, scanner, recipe or public package was changed, and no device or
emulator session was opened.
