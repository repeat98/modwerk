# SYNTIZ as a track machine: what the integration builds on

Working notes for the machine glue (not written yet), from the sources cited. Confidence is marked.

## How a machine joins the base

- The base's machine registry reads the `ot_machines` table: a module contributes one `struct modwerk_machine`
  (`sdk/machines/octatrack/include/modwerk_events.h:100`): label, Part signature (two letters and a version
  range at Part offset 60 + 30 x track), flags (PROTECT, POOL for a model list), page, defaults, and
  callbacks, among them `render(track, ping, start, end)`. Certain (source).
- The chooser held five stock machines and four contributed ones (`machine_registry.c:26`, ROWS 9), filled by
  POLY8, Analog BD, VECTOR and FM Synth. This PR gives it eight (`ot_machines`' room 8, ROWS 13), so SYNTIZ sits
  beside all four with room for more. Certain (source).
- No module contributes a machine through its own `runtime.json` yet: the four are ports
  (`module-adapters/machine-ports.json`). SYNTIZ would be the first. Certain (source).

## The render call

From Analog BD's `control.c` (comment above `ab_render`) and FM Synth's native path (`upstream/synth/poly.s`,
`sy_call`): certain (both run on units).

- Each track is rendered twice a frame, before and after its event's sample offset; the second call has
  `end == 16`. A frame is 16 samples at 44.1 kHz.
- At the cursor `*(uint32_t *)0x80001c80` write a header of four longs: source count `end - start`, ring
  write position `start`, source rate `0x04000000` (1.0, Q26: the DSP's resampler is an identity), read
  position `start << 26`. Then `end - start` pairs of longs, L then R, each the 16-bit sample in the high
  half (the transport keeps the top 24 bits). Then advance the cursor past them.
- The track's filter, AMP, LFOs and effects run on the DSP after this, as for a sample.

## The pitch

From FM Synth's `po_rate` and `sy_word`: certain for the arithmetic, probable for chromatic play.

- The parameter record (`FP_PTR`) holds the PTCH halfword: the raw byte << 8 with locks, LFOs and scenes
  applied, fractions in the low byte. Stock's curve (`0x400aa294`, longs Q26, index word >> 5) spans
  0x0400..0x7c00, five raw units a semitone, so a FLEX track's PTCH covers about +/-12.8 semitones.
- FM Synth stretches one raw unit to a semitone (+/-64 semitones) and folds by octaves; it bundles its
  own quantizer to stay coherent with chromatic play.

## Open

- PTCH: FLEX's scale and stock's curve, with OCT on SRC SETUP for the register (the author's choice,
  27 October 2026), not FM Synth's stretched word.
- How the AMP envelope starts on a native source (FM Synth runs its own; Analog BD's voice is on the DSP).
- Part storage of the twelve SRC and SETUP bytes plus the model, save and reload, and the model list.
- The emulator build (`npm run upstream:tools`, the author's own OS 1.40C file outside the repository).
