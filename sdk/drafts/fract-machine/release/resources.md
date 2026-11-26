# FRACT resources — current preparation, 25 November 2026

Unlisted `0.1.3-experimental`, package `c56e79076b170e76c53f46286a3d31aa8d8c51f9d52070836b1ca75fa37f8e29`,
base `eb6679620d0c9ed7ad277598fc0df185e767dfbd0e7eb99bb1518ade9df8a4f0`.
The [current audit](resource-audit-20261125.json) accounts for **31,824 resident
bytes**, 63,648 for two retained copies, and **712 bytes of own callback stack**.
The loader header is now 754 bytes, rounded to 768; image 30,416 plus BSS 636
rounds to 31,056. No DSP code/state or separate sample-arena allocation is added.
These counts establish neither free headroom nor hardware timing.

`qualification/resources.py` pins this image/package and the current loader hashes.
The 33 indirect sites were reviewed: unchanged functions keep their instruction
offsets and operands; `og_machine_page` now calls `page_text`, `page_word` and
the SDK's `modwerk_page_put32.constprop.0`. Its five indirect stores resolve to
the one eight-byte compiler frame. The known GCC .su clone label is mapped
explicitly, under the exact image pin. The base pool helper follows the current
linked export. Target sizeof probes confirm 754/88/74 bytes for module/owner/site,
63 hook slots and four-byte pointers, matching the loader's allocation formula.
Stock/base frames, interrupt/task nesting and interrupted callbacks are excluded.

Reproduce on this source with GCC 16.2.0:

```sh
python3.12 -B sdk/drafts/fract-machine/qualification/resources.py --output /private/new-resource-audit.json
```

## Historical candidate resources — 10 November 2026

Version `0.1.2-experimental`, SHA-256 `6ff37fdcdbfead903a4857482d0f7bd50905175b55c877e62ad7c51422ef5874`, base `72defb09b9d463fe62ab876f350f442d10e32ec23e55918a22b9b756c5cb3da6`.
This package has a [named-build functional hardware report](hardware-20261110.md).
It does not establish timing or a complete resource qualification. The earlier
6 November report is preserved in [history](history/20261106/resources.md).

## Reproduce without firmware

Run the exact named audit from revision
`c2671568bb3b684934ad9c55e100b8276093e12d`, which retains its base72 loader/export
inputs. A later checkout follows its newer committed base and can produce a
different package; the audit deliberately refuses to reuse the named hash then.
The completed source audit is retained in resource-audit.json.

```sh
python3.12 -B sdk/drafts/fract-machine/qualification/resources.py \
  --output sdk/drafts/fract-machine/release/resource-audit.json
```

The audit pins this authored image and package, checks the loader source hashes,
uses GCC 16.2.0 `-fstack-usage`, reviews the acyclic own-call graph and indirect
sites, and probes target struct sizes with the base's 2-byte aggregate alignment.
The changed indirect-site addresses were matched by containing function and
unchanged instruction offset. The one base helper target follows this build's
committed export address. A changed image/loader or unknown call refuses reuse.

| Module contribution | Bytes |
| --- | ---: |
| Runtime header | 528 |
| Code, tables and initialized state | 30,260 |
| BSS | 636 |
| Alignment padding | 0 |
| **Resident extent** | **31,424** |
| Two copies retained for replacement/Undo | 62,848 |
| Previous 0.1.1 plus this candidate during replacement | 63,200 |
| Encoded package in the existing upload buffer | 31,772 |

One 88-byte owner-ledger entry is consumed from the base's preallocated ledger.
No DSP code/state words or independent sample-arena buffer are added. Samples
remain in stock FLEX pages. No free-memory/headroom claim follows from these
counts. The previous 31,776-byte extent is historical, not this package's cost.

The conservative maximum own stack contribution is **712 bytes per callback**,
including own outgoing arguments/JSR return PCs and 48/56-byte assembly leaves.
Stock/base frames, interrupt prologues, task stacks and interrupted activations
are excluded. This is not a whole-system stack reserve.

## Timing and owner decision

Worst own render per block, its runtime budget, matched native-FLEX longest-frame
and idle measurements, and the audio-path stress run remain unmeasured.
`../evidence/performance.json` records null fields and methods, as the owner
[requested](https://github.com/repeat98/modwerk/pull/1274#issuecomment-6705531953).
The generic MIDI-flood audit is not a measurement of FRACT's audio path. Its
unfilled audit must not be represented as passed. The owner will decide any
first-release waiver; no waiver has been granted. The earlier unexplained
PROJECT RELOAD stall remains in TESTING.md and is not dismissed by this audit.

The [offline measurement kit](../qualification/README.md) now prepares a private
wrapper and matched project cases. Original executable sections remain identical
and the normal package reproduces exactly. The probe's six decoded emulator
windows validate its data path only: their clock model does not qualify hardware
microseconds. Its base frame peak is since boot, not a reset window maximum;
this read-only method's limitation remains explicit for owner review.
