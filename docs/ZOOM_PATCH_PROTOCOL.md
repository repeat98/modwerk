# Zoom MS-200D+ and G5n patch protocol: research report

Status: **open, with the owner's go-ahead on Discord (November 2026) to research these two pedals.** Both have a
new profile (`sdk/machines/zoom-ms-200d-plus/`, `sdk/machines/zoom-g5n/`, family `zoom`), `stack.link` started,
but `status` stays `open` rather than `research`: the contract ties `research` to a started `format`/`load` or
`mods` step, and none of those three — the custom-effect steps — has begun on either pedal. **Both are ZD2
pedals** ([ZOOM_ZD2.md](ZOOM_ZD2.md)): their stock effects are `.ZD2` files (73 in the MS-200D+'s effect corpus;
169 `.ZD2` file names read from a real G5n over `0x64 06` in a Guitar Lab session [HW], 157 in its corpus), so
they take the ZD2 road in `src/devices/registry.ts` and get no ZDL pedal page. **This report is not ZD2
research:** nothing here documents or claims progress on the loadable-effect container, and no custom DSP effect
has been built or loaded on either pedal. Whether the ZD2 findings for the G1 FOUR hold on these two is [UNK].
What is proven is the SysEx **patch** protocol underneath the pedal's own stock effects: a patch's container
format, and reading and writing one over USB MIDI, independent of and prior to any ZD2 work.

Tags: **[HW]** observed on the developer's own MS-200D+ and G5n; **[PUB]** public research by others, ported
rather than rediscovered; **[UNK]** unknown. Addresses, opcodes, chunk structure and sizes only: no firmware,
stock effect bytes, disassembly or extracted tables.

## Inputs

No firmware file was read or needed: this is a live protocol over USB MIDI against each pedal's stock OS,
unmodified. Evidence is 250 factory and user patches dumped from the developer's own MS-200D+ and 200 from their
own G5n, each used only to cross-check the decoder and encoder against real data, never committed here.

## The protocol

Both pedals answer the same command sequence over the "+"-series SysEx frame `F0 52 00 6E <command> … F7`, one
model id (`0x6E`) shared with every "+"/"n"-series pedal in this family [HW][PUB]:

- `0x52`: program-change mode on, needed before most other commands answer [HW].
- `0x44`: geometry request; `0x45` is its reply, read before the per-slot walk [HW].
- `0x46`: per-slot patch read; the reply echoes the bank/location it answers for at a fixed offset, which a
  reader must check against the request rather than assume in order [HW].
- `0x45`: per-slot patch write. **Confirmed to persist through a power cycle on the MS-200D+** (a written slot
  held its content after a cold boot) [HW]; confirmed accepted and read back on the G5n, where persistence was
  not separately isolated [HW].
- `0x28`: current-patch (edit-buffer) write. Acknowledged on the G5n (`F0 00 6E 00 00 F7`); the MS-200D+ gives no
  ack to it. Volatile on the G5n: discarded at session end, never tried as a persistence route [HW].
- `0x53`: ends the exchange.
- `0x29` (current-patch read) answers on the G5n only; sending it to the MS-200D+ reads as silence, not a refusal
  — it is simply the wrong command for that pedal [HW]. Device identity requests are silent on both pedals, which
  is normal and not a fault [HW].
- A SysEx reply **omits the `0x52` vendor byte** the outbound frame carries (`F0 00 6E …`, not `F0 52 00 6E …`):
  a decoder written for the request's own header is off by one on every reply [HW].
- The patch body's checksum footer is a raw CRC-32 with **no final XOR** against `0xFFFFFFFF`; comparing with the
  XOR fails every correct read [HW].
- After a Program Change, the pedal needs about 500 ms to settle before it answers; asking sooner reads as
  silence indistinguishable from a disconnected device [HW].
- A slot value of `0x00000001` is a **continuation marker** for a multi-slot effect, not an empty slot: an
  owning effect spans it, and a reader that treats it as empty misattributes the slot [HW].

## The patch container

A patch is Zoom's documented "+"-series PTCF format, matching Simon Wood's `decode_preset.py` (`ZPTC`'s
`Midi_64`/`Midi_45` Construct structs, [mungewell/zoom-zt2](https://github.com/mungewell/zoom-zt2), MIT) chunk
by chunk [HW][PUB]:

- A top-level `TXJ1`/`TXE1` text pair carries a description string.
- A separate 32-byte `NAME` chunk carries the patch's real display name. The legacy 10-byte name field inside the
  main header is cosmetic and truncates ("MS1959 Dri" there, "MS1959 Drive" in `NAME`); a reader that only reads
  the header field shows the wrong name and a writer that only writes it leaves the display name stale [HW].
- The `EDTB` chunk holds one 24-byte **byte-reversed** record per effect slot, read as a bitstream from its high
  end: a 1-bit on/off flag, a 29-bit effect id, then that effect's parameters at 12-, 8- and 12-bit widths (up to
  five 12-bit, three 8-bit and four more 12-bit fields) [HW][PUB]. A flat, fixed-offset effect table elsewhere in
  the same patch is a **mirror** of `EDTB` that must stay consistent with it: writing only the flat table leaves
  the two disagreeing, and the pedal silently discards the write rather than flagging the mismatch [HW].
- `PPRM` carries the patch's overall volume parameter.

The bit-level layout and its encoder are ported, not rediscovered, from
[thammer/zoom-explorer](https://github.com/thammer/zoom-explorer) (MIT, by Thomas Hammer), a public Web MIDI
editor for the Zoom MS Plus series. Before any hardware write, the encoder was checked by decoding every `EDTB`
slot across a full captured patch library and re-encoding it, byte-identical in every case (450 of 450 slots
across 250 patches), and only then tried against the pedal [HW].

## What was verified, on real hardware

| Pedal | Read | Decode | Write | Persistence |
| --- | --- | --- | --- | --- |
| MS-200D+ | 200/200 patches dumped via `0x46` | Name, description and every `EDTB` slot decode cleanly across the library; 207 of 208 distinct effect ids in the library resolve to a name (the one non-match, `0x00000000`, is genuinely empty) | `0x45` writes a slot built from another slot's structure | Confirmed: the written slot held its content through a cold power cycle |
| G5n | 250/250 patches dumped via `0x46` | Same decoder, same chunk layout, confirmed against the G5n's own library | `0x45` accepted and read back; `0x28` (edit buffer) acknowledged | Not isolated: whether an `0x45` slot write survives a power cycle on the G5n specifically was not tested separately from the MS-200D+ case above |

Persisting a written patch needed more than the write command alone: the confirmed sequence on the MS-200D+ is
`0x32` (bare), `0x32` (addressed), `0x08`, `0x45`, editor off, program-change mode off, in that order. Isolating
each step on real hardware showed `0x45` alone and `0x08` alone each individually fail to persist; only the full
sequence does [HW].

Parameter *values* (gain, tone, level — as opposed to which effect occupies a slot) are not yet decoded on
either pedal: a shortcut through the pedal's own ASCII parameter-narration command (`0x64 01`) is written but
untested on hardware, and the binary route through the parameter bytes themselves remains unsolved [UNK].

## Traps that cost real time, worth recording for the next device

- **A command that works on one "+"/"n"-series pedal is not guaranteed on another.** `0x29` answers the G5n and
  reads as total silence on the MS-200D+; the silence was misread as "this pedal doesn't support buffer access"
  for some time before `0x46` (which answers both) showed otherwise. Before concluding a pedal refuses a
  command, try the sibling pedal's command that is known to work on both.
- **Comparing the wrong slice of a reply looks like success when it is not.** An early check compared only the
  legacy 10-byte name field, which can match while the real `NAME` chunk — and the content a musician actually
  sees on the pedal's screen — differs. Compare full bodies, with a printed checksum, so a real difference is
  visible even when the comparison logic itself is wrong.
- **A reply must be checked against its own request.** The `0x46` reply carries the bank/location it answers for
  at a fixed offset; code that assumes the reply matches the most recent request, without checking that field,
  silently pairs a read with the wrong slot once anything overlaps a pending request.

## What does not carry over

- **This is not the ZD2 container.** Both pedals are ZD2 pedals, but nothing here documents the loadable-effect
  format `ZOOM_ZD2.md` covers, and no original or ported DSP code has been run on either pedal. `steps.format`/`load`/`mods` stay `open` in both
  profiles.
- **Neither pedal is a ZDL pedal.** The existing pedal page and MCP Zoom bridge (`zoom_status`, `zoom_list`,
  `zoom_backup`, `zoom_install`, `zoom_remove`) speak the ZDL pedals' file-system commands (`0x60`/`0x64` on the
  MS-70CDR, MS-50G, MS-60B, G1on); neither pedal in this report answers those, and this protocol does not extend
  that bridge. A link for these two pedals is separate work ([next steps](#next-steps)).
- **No OS, bootloader or update-file research was done.** Everything here is live MIDI traffic against the stock,
  unmodified OS; no update file was downloaded, opened or flashed.

## Public research

- [thammer/zoom-explorer](https://github.com/thammer/zoom-explorer) (MIT, by Thomas Hammer): the `EDTB` bit
  layout and encoder this report's write path ports from, for the MS Plus series.
- [mungewell/zoom-zt2](https://github.com/mungewell/zoom-zt2) (MIT, by Simon Wood): `decode_preset.py`'s
  Construct definitions for the PTCF/TXJ1/TXE1 container, confirming the chunk layout read from both pedals here;
  its own SysEx tools are written for the G1 FOUR's file commands and were not tried on these two pedals.

## Next steps

In order:

1. **Isolate G5n persistence.** Confirm an `0x45` slot write on the G5n survives a power cycle the same way it
   does on the MS-200D+, rather than inferring it by similarity.
2. **Decode parameter values.** Neither the ASCII narration shortcut nor a binary route to gain/tone/level
   values is proven; either would let a future patch editor show and set real parameter values, not only which
   effect occupies a slot.
3. **A link for these pedals.** `stack.link`'s description is the site and the developer tools identifying the
   unit and reading what is installed; nothing in this repository speaks this protocol yet. That is separate,
   owner-reviewed work once the above is settled, and is not a request to start it from this report alone.
4. **ZD2 research is a separate effort.** Both pedals carry `.ZD2` stock effects, but whether either loads a custom
   one, and whether the G1 FOUR's clean-room route and header target carry over, is unresearched; this report
   makes no claim either way.
