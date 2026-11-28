# FRACT resources — current preparation, 26–27 November 2026

Unlisted `0.1.4-experimental`, package `bec65df07ae21e76c707247fd97f9851cc424c6d8f6e27ca414d18d9727c9454`,
base `24e480c435a41324872a259d4ed335c972ba868a917ad3499de359acdc849ac5`.
The [current audit](resource-audit-20261126.json) accounts for **31,824 resident
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

The [hardware report](hardware-20261126.md) binds matched FLEX/diagnostic timing
to separate development packages. Both four-format matrices had no skips, but
normal 0.1.4 failed modulated USB-audio stress on20- and 4-channel layouts. Price40
covers observed mean deltas; it is not a peak or static worst-case guarantee.
Timer intervals include native FLEX and probe overhead and are not CPU cycles.
Frame maxima are scoped to the named external guard reset after a 3-second flush.

The exact released-base package remains physically untested. Performance repair,
stage 1 rerun, remaining companion/audio/lifecycle cases and author listening,
Keep/reboot are required. No owner waiver or release approval has been granted.
The historical PROJECT RELOAD incident remains separately recorded in TESTING.md.
