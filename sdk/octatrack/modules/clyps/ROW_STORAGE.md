# Bank-local rows · decision record · 23 November 2026

**D18 now requires 16 independent rows in every Bank A–P.** [Authoritative Bank and copy/paste requirements](BANKS_COPY_PASTE_REQUIREMENTS.md). The file layout remains proposed. The current runtime holds sixteen volatile rows in total and qualifies source selection only on A01 in bank A. A row refers to stock sequence slots. Parts, their assignments and their sound data remain stock-owned.

| Model | Interaction and engineering cost | Disposition |
|---|---|---|
| A · 128 global | Eight TRIG pages. Each reference needs source-bank resolution and a policy for foreign Parts and unloaded banks. | Defer pending a musical need for a project-wide list. |
| B · fixed 16 × 16 | All sixteen rows of the selected bank fit one TRIG page. Local pattern slots and their Part context can be resolved within the same bank. A fixed file layout would make later expansion a migration. | Prefer its interaction; validate with A → B → A using identical row numbers. |
| C · extensible bank namespaces | Start with B's controls. Store bank ID, row count, record width and bounded section length separately. Larger row counts can use additional pages without renumbering the first sixteen. | Recommended. Cross-bank playback requires its own qualification. |

**Logical layout and budget.** Consider a header with magic, supported version, length, generation and checksum, followed by sixteen length-delimited bank sections. In each section store row existence separately from eight tagged cells. A one-byte cell could hold a local source index and explicit CLIP/STOP/HOLD operation. Reserve mode encoding for D21 after phase and precedence are settled. Today the sixteen 32-bit source words and defined mask cost 66 bytes before alignment. At eight bytes per future row plus a bank-defined bitmap the 256-row payload is 2,080 bytes. For example, a 32-byte header and sixteen 8-byte descriptors would make 2,240 bytes per file, 4,480 for work and stored versions before filesystem allocation or a temporary write. These are design estimates. Loading one bank needs 130 bytes of payload plus parsing/staging buffers. A future 128-row bank would need 1,040 bytes with the same encoding. Measure linked BSS, stack, free-pool recovery and admitted peer sets before reserving RAM.

**Identity and lifecycle.** Bind the live namespace to a committed project incarnation and bank ID. A folder path is a locator: save-as, renamed folders, removable cards and same-path replacement need explicit identity rules. Stock has sixteen pattern slots and four Parts per bank. Moving between banks should change the displayed rows only after the destination is available. A failed read retains the previous live generation and queued music. Stage, validate and then publish a bank as one transaction outside the sequencer interrupt. Never perform card I/O in a key or audio callback.

Kits and MIDI Scenes implement project-local work/stored files, writeback and restore, with their own data ownership. MIDI Scenes also tags its packed current-bank battery copy with project identity. The battery map assigns ranges to specific owners and lists no CLYPS allocation. Sample memory and the loader pool have different owners and lifetimes. The proposal requests neither a battery range nor a sample allocation. Source evidence: sdk/octatrack/modules/kits/kits.s, sdk/octatrack/modules/midi-scenes/scenes.s, sdk/machines/octatrack/battery-ram.json and HOOKS.md in the same directory.

| Trigger | Proposed behavior and evidence required |
|---|---|
| Modules ready, including reinstall | Idempotently read a validated working generation for the committed identity at idle. Missing file starts undefined. Unsupported version, checksum error or I/O failure blocks writeback and preserves the file. |
| Single/all-bank load and return | Stage only relevant bank sections. Pre-load gives intent; post-load gives routine return without result or committed identity. A mask plus pending flag cannot prove success. Require correlated completion, success mask, project identity and an abort path from the base before publishing. |
| Background write / SAVE PROJECT | Snapshot confirmed rows. Write and verify a new work generation, then promote it. Only a confirmed SAVE advances the stored generation. Retain dirty edits on error, including later edits made during the write. Prove replacement or a two-generation recovery scheme across power loss on disposable media. |
| RELOAD PROJECT / change / new | Stage stored data, validate identity and publish only on success. Distinguish unsaved state, saved snapshot and undo. A failed reload must keep the prior working generation. Define whether reload intentionally discards unsaved rows with the artist. |
| Module OFF | Remove callbacks, release RAM and return stock control. Retain files. Stock can save/reload while the module is absent; define reconciliation on re-entry before automatic writes. |

**Migration and first implementation slice.** There is no existing durable CLYPS row file. Offer explicit capture of the current sixteen rows from a verified bank into an empty namespace. Each defined nibble maps to CLIP, including zero/A01. An undefined bit stays undefined. Begin with an offline two-bank codec and an in-memory fake filesystem. Test A/R04 and B/R04 isolation, 16/32/64/128 counts, unknown versions, truncation, interrupted writes, failed reads, same-path replacement, undo and exact restoration. Keep the writer out of the module pending maintainer allocation of file names and a committed project/bank lifecycle contract.

### Host reference codec and lifecycle experiment (23 November)

Run `python3.12 -B -m unittest discover -s sdk/octatrack/modules/clyps -v`.
`offline/bank_codec.py` encodes one 2,212-byte big-endian archive. A
32-byte header stores CLYP, version 1, total size, a 16-byte opaque project
incarnation and a nonzero 64-bit generation. Sixteen six-byte descriptors
index bank A through P. Each payload has a defined-row bitmap and 16 × 8
cells. Values 0–15 select local clips, 16 stops, 17 holds. Undefined rows have
zero payload. CRC32 covers everything except the final four-byte checksum.
The fixed-width reader rejects unknown versions, bad descriptors and invalid
cells. Changing row width requires a schema decision. No path or RAM range
has been allocated on the instrument.

The fake filesystem stages a complete snapshot, decodes it, then atomically
replaces either the working or saved slot. Every short prefix is exercised.
A failed replacement leaves the previous slot readable. Corrupt or unsupported
existing data blocks writeback. These guarantees assume a serialized writer
and atomic replacement in memory. Media durability and on-card promotion
remain open.

The production-callback host fixture injects EOF after project initialization.
Source selection falls back to stock, but a confirmed A/R04 is lost. The
isolated transaction model in `offline/project_transition.py` needs a
nonreused transaction token, a committed project incarnation and a terminal
result. Abort may re-enable the prior generation only if stock certifies
the original project, bank and stock source epoch as usable again. Otherwise preserve the snapshot and
keep selection suspended. Stale completion cannot publish a generation.
