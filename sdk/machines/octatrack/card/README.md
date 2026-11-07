# Card-build events

A card build has no Modwerk base, so it has no base events. Where two modules must meet on a card build without either one reading the other's code or data, the shared SDK names the meeting point here, and each module names only that.

## `modwerk_card_ev_trig_muted`

The card-build counterpart of `ev_trig_muted` ([HOOKS.md](../HOOKS.md), base event index 35; #777). A machine that starts its own note from a trig, before stock binds the track's voice, asks which tracks' new trigs a mute module drops now. Source: [`trig_muted.inc`](trig_muted.inc).

- **The answer** is `unsigned modwerk_card_ev_trig_muted(void)`, in the C convention (d0 the answer, d2-d7/a2-a6 kept), and writes no state. Bits 0-7 are `ev_trig_muted`'s answer: bit t is set when track t+1's new trigs are dropped now. Bits 8-15 mark which of those tracks also have their sounding note ended at the mute, as the module ends a sample track's note there (Mute Modes' OTFX-T sends a note-off). The asker ends its own note on a track when the track enters that set; a track only in bits 0-7 lets its note finish (DT-T). Higher bits are zero.
- **The ask** is the macro `MODWERK_CARD_ASK_TRIG_MUTED`: d0 becomes the answer, or 0 when no module in the image answers. Then the machine starts no note on a track whose bit 0-7 is set, and plays every trig with 0, as stock does.
- **Placement.** Both sit in DRAM units (`Linked(dram=True)`), because every card build links its DRAM units together, natively (`remix/platform_build.py`) and in the configurator (`src/engine/coldfire-link.ts`). The ask is a weak reference, so it finds the answer whatever the module order, and resolves to 0 without one. ROM-placed units cannot take part: the native builder links them one at a time before the DRAM link, the configurator after it.
- **One answer per image.** Both linkers refuse a second definition. The base's event ORs every handler's answer; a card build gets that only when a second module needs to answer.
- **Context.** The frame interrupt or a task: short, with nothing that blocks.
- **Over USB** a module raises or answers `ev_trig_muted` itself. A USB package never links against this symbol.

A unit takes the file through its `remix.inc` (`Linked.include` returns the file's text with the module's own lines) or with `.include`. `sdk/tests/test_card_trig_muted.py` links an asking and an answering fixture in every combination with the native linker, and `src/engine/card-trig-muted.test.ts` checks that the configurator's linker gives the same bytes.
