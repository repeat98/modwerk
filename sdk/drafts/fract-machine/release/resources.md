# FRACT candidate resources — 10 November 2026

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
