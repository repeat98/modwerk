# Base-owned LFO PMTR extension table (`ot_lfo_pmtr_dest`)

Status: **source port drafted for `repeat98/main`** (hook index **63**). Formatter,
count, SETUP encoder beq and destination store are declared in
`sdk/machines/octatrack/events.json` and read by
`sdk/machines/octatrack/elekloader/lfo_pmtr_dest.c` / `.s`. **Destination lea is
coded but not claimed** until FM Synth’s `po_lfo3b` migrates off `0x4000d03e`.
The committed `octatrack-base.elemod` still needs an owner OS rebuild
(`npm run octatrack:base -- --write`) before any unit runs this code.

Related: [events and tables](module-guides/README.md#hooks),
coordinator index lock in the Project store (`lfo-pmtr-index-allocation.md`).

## Why

Stock audio LFO PMTR destinations are indexes **0–29**. Parked drafts and
TEMPO LFO each contribute one extended destination (indexes **30+**). Without
a base-owned table, each alone-sinks the shared count / formatter / lea and
collides in one remix.

| Index | Label | Module / draft |
| ----: | ----- | ----- |
| 30–38 | PROB…TSTR | parked drafts / Seq Pos |
| 39 | TEMPO | `tempo-lfo` (fork Keep; upstream first-release pending) |

## Upstream index

On the fork this table used hook index **31**. On `repeat98/main` that index
is already `ot_midi_generators`, so this port appends at **63** (next free
after `ev_frame_deadline` at 62). Packages subscribe by event name; the
generated `MODWERK_OT_LFO_PMTR_DEST` constant carries the index.

## What this land owns

| Piece | Kind | Role | Claimed? |
| --- | --- | --- | --- |
| `ot_lfo_pmtr_dest` | table (index **63**, room 16) | Contributed records (≥30), optional `after_store` (ABI 2) | Yes |
| Count | `own` at `0x400d38a8` | Publishes `30 + n` | Yes |
| Label formatter | `jmp` at `0x4003bf64` | SETUP label for contributed indexes | Yes |
| SETUP encoder beq | `own` at `0x4003923c` length 2 | Nop stock `beq.s` | Yes |
| Destination store | `jmp` at `0x4000d07a` length 6 | Store + optional `after_store` | Yes |
| Destination lea | `jmp` at `0x4000d042` length 8 | Resolve `words[track]` | **Deferred** |

## Follow-up before TEMPO / full dest resolve

1. Owner-approved FM Synth update migrating `po_lfo3b` to `0x4000d03a` pad 8
   (fork `6210dacde`; keep upstream 0.1.5 jsr/rest semantics) + USB package rebuild.
2. Claim dest lea in `events.json` and rebuild the base.
3. Owner OS rebuild of `octatrack-base.elemod`.
4. TEMPO first-release remains a separate PR after `.mwrm` + measured `device:price`.

## Provenance

Port of fork scaffold `141322f42` through after_store ABI 2, remapped to
upstream index **63**, **without** the lea claim from `6210dacde` so published
FM Synth does not conflict on first land.
