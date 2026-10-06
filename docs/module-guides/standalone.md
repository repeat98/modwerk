# Standalone firmware

Read [the module guides index](README.md) first.

**Applies to** modules with manifest `category: standalone`: complete firmware that replaces the whole OS. The library describes it as "Complete custom firmware that replaces the whole OS. Use one at a time: it never combines with other mods" (`src/catalog/modules.ts`). No module uses this manifest category yet. [MIDI Scenes](../../sdk/octabam/modules/midi-scenes/README.md) is built on its own and is the nearest example; its `category` is `scenes`.

On Digitakt and Digitone a standalone module is `exclusive`, links with no core and is always used on its own ([SDK.md](../SDK.md)).

## Behave like the instrument

- [ ] **It never combines, and says so.** Every other module is refused with a reason a musician can act on. MIDI Scenes refuses all thirteen companions (`midi-scenes-standalone` in `src/catalog/selection-conflicts.ts`, with a fix to keep one or the other).
- [ ] **Changed-base rejection.** A changed byte in the original OS is refused before composition. MIDI Scenes is checked for this.
- [ ] **The whole image is checked, not a slice.** Compare the full MAIN image and the full update with the author's own build (the shared-worker parity check in `docs/VERIFICATION.md`, "MIDI Scenes logger boundary fix" and "Logger download restoration").
- [ ] **Recovery is documented where the download is.** The flashing risks and the recovery procedure (hold FUNC while powering on, choose MIDI UPGRADE) are linked from the module page; never claim flash safety.
- [ ] **Unknowns stay unknown.** MIDI Scenes was approved without hardware timing or complete memory bounds, and both stay explicit in its README and manifest.
- [ ] **Stock isolation.** No Elektron bytes in the repository or the packages; stock content is recovered from the user's own file at build time.

## Integrate

- [ ] The exclusivity is declared everywhere it is read: `exclusive` in a contract-v3 manifest, the conflict in `selection-conflicts.ts` for an Octatrack module, and the library note (`STANDALONE_NOTE`). They agree.
- [ ] `sdk/catalog.json` entry, thumbnail, README sections, tutorial and screenshots. Any exception to a gate is a separate owner record bound to the exact version, source and image (`sdk/midi-scenes-build-approval.json`); never write one yourself.
- [ ] `npm run module:doctor -- <id>` is green.

## Digitakt and Digitone

Link with no core and claim nothing from the core's tables, since nothing else is linked beside you. State the OS releases you built for and checked ([Digitakt guide](../../sdk/machines/digitakt/README.md)).
