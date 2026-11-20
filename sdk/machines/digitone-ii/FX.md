# Digitone II effects: a proposal (draft)

How effect modules could reach a Digitone II's sound, from what the unit showed on 20 November 2026. A proposal for
the owner's review, not built yet. The Analog Rytm MKII's send effects are the model
([`modwerk/fx.h`](../analog-rytm-mkii/include/modwerk/fx.h), its base's `sendbus.c`): the same record, the same
idea of a base that owns the bus, the page and the work area while each module adds one record.

## What the unit showed

- **Audio on the ColdFire.** The SHARC+ renders the sound, but the ColdFire exchanges audio with it over the SSI
  (I2S) by DMA: 32 sample frames a frame interrupt (1,500 a second), 16 slots of 24-bit samples. What the SHARC
  sends (RX) carries the mix and tracks, as the USB audio streams do; what the ColdFire sends back (TX) reaches the
  output, as USB audio in does (slot 0 left, 1 right). RX holds no trace of TX: an effect fed from RX cannot feed
  back ([research notes](../../../docs/DIGITONE_II_OS_RESEARCH.md)).
- **It is cheap.** A stereo echo costs about 4 % of a frame; the Octatrack Tape Echo's ColdFire variant, ported to
  these rings in a research build, about 8 % (peaks near 10 %), and the UI tick never fell behind. It was heard on a
  unit: tape character, clean (the developer).
- **Levels.** RX arrives at USB level, well below the output's: the return needs gain (about +18 dB for the echo).

## Proposed

1. **A send bus in the base**, in the frame interrupt (`ev_frame_params`, after stock): its input the main mix from
   RX slots 0/1 to start with (summed to mono for a send effect), its return added into TX slots 0/1 with LEV. The
   base saves and restores the EMAC state around it and owns the TX slots while an effect runs.
2. **The Rytm's record, unchanged where it can be:** an effect module contributes one `struct mw_fx` to `mw_fx`
   (name, eight controls A-H, `reset`, `render`, the work area words). Differences the Digitone II needs:
   - a work area far larger than `MW_FX_WORK` (8,192 words): the DDR above the loader's pool has megabytes; a tape
     needs about 1.4 MB. Proposal: a Digitone II limit in its own header, or `MW_FX_ABI` 2 with a 32-bit limit;
   - 48 kHz blocks of 32 samples, as on the Rytm without `MW_FX_24K`.
3. **The page: FX held + DOWN** opens a second FX page (stock does nothing with it on the FX page; checked on a
   unit). FUNC + A chooses the effect among the build's records, A-H its controls, FUNC + E LEV, as on the Rytm.
   Kept in the kit (the core's kit data) as the Rytm keeps them.
4. **First module: Tape Echo**, ported from the Octatrack's ColdFire variant with its author's OK (Discord,
   20 November 2026), its controls TIME, FDBK, WOW, AGE, SYNC, MIX as there.
5. **Runtime loading** of an effect module (a trial over the link) needs the loader to dispatch the bus's render to
   a runtime package; until then effect modules are built into the image by the site's builder.

## Open questions for the owner

- The work-area limit: a Digitone II header, or a second `mw_fx` ABI?
- Per-track sends (as the Rytm's SEND page) need the tracks' own audio: RX carries mono track slots, whose mapping is
  not measured yet. Start with the main mix only, or wait for sends?
- The bus rides USB audio in: a computer sending USB audio shares TX slots 0/1. Mix the return into what stock put
  there, or take the slots while an effect runs?
- The FX + DOWN page, or another entry point?
