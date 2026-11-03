# Base updates must never brick a unit: two slots — 25 October 2026

The owner asked to make the whole base update very safe, "especially regarding USB dropouts or power cuts", and
set the bar: "we cannot, under any circumstances brick devices", with the update shown on the Octatrack itself.

- **The single-copy write stays only until the two-slot base replaces it.** A power cut during today's write needs
  the startup menu's MIDI recovery (a DIN interface). The owner chose a two-slot layout with a small boot stub
  ([OCTATRACK_TWO_SLOT_BASE.md](../OCTATRACK_TWO_SLOT_BASE.md)) and the update on the unit's screen.
- **Elektron's recovery stays the floor.** The owner pointed out that FUNC at power-on already has a good recovery
  flow. Nothing of ours writes below `0x4000`, so it always works.
- **At most one restart per update.** "I don't want the OT to restart twice. The process should be easy, safe and
  straightforward, with max one restart" (relayed by the session reworking the update dialog). On two slots the
  running base writes the new one into its spare slot and restarts once; a unit with one copy restarts once into the
  new base from RAM, which then saves itself while it runs on. A new base that doesn't start is left after two starts.
- **No release pause.** A pause of base releases until the two-slot base ships was agreed and then dropped by the
  owner the same hour: bases keep shipping meanwhile.
- **The site never invites a power-off mid-write** (PR #920): a USB dropout during the save is waited out and the
  save repeated until the unit confirms the new base.
