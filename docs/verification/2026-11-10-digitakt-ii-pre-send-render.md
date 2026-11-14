# Proposal: Digitakt II pre-send render hooks

Status: proposed for the Digitakt II Modwerk base. The render path has an OS 1.17 emulator proof. The transport and page interfaces still need guarded sites and coupled tests.

## Scope

Give the base one dispatch point after individual tracks are rendered and before stock sends and the stock master compressor. A compressor sidechain needs a read phase for its trigger tracks and a write phase for its destination tracks. Track meters can use the read phase, and future track dynamics can use the write phase. This keeps those modules from taking separate detours through the same stock code.

The first subscriber is a sidechain compressor. Audio sources and ducking destinations are separate track masks. The stock master compressor remains in the mix path and its COMP controls remain available. A trigger-only track and an unselected track retain their stock signals at the render hook. The stock compressor still responds to the resulting mix.

The [Digitakt II SDK](../../sdk/machines/digitakt-ii/README.md) documents the current ColdFire core. The base candidate adds sequencer and storage hooks. Digitakt II audio is on SHARC, so these render hooks need a SHARC package and dispatcher. The ELE3 builder presently replaces section 3 and validates every other section against stock. A release needs a guarded build path for the SHARC section that preserves the updater and other untouched sections.

## Guarded render site

OS 1.17 SHARC send-driver entry, short-word PC `0x1c18a6`, loader byte address `0x2838314c`. The displaced range is one instruction, six bytes. Its SHA-256 is `aee4910e66f86ea483231f49e79a3a3c7bfbdecf34024052d36dd87fc34f4fe3`. Resume at short-word PC `0x1c18a9` after replay.

Dispatch once per render block, before the sends read the sixteen stereo track buses. Track zero begins at DSP byte address `0x252df8`. The stride is 256 bytes, with 32 float samples per channel, left then right. The stock caller is at short-word PC `0x1c3090`. Its six-byte call has SHA-256 `e95382a91e004f88d322f82c72ebbe1c2d660d3cb1653c2aa44e0bd615e0f6f0`.

The base owns placement, dispatch, live register preservation and the stock continuation. With empty collections the entry preserves the stock path. Validate the exact OS and instruction extent and refuse an overlapping write or out-of-range allocation. The Digitakt II catalogue and open pull requests showed no Modwerk module detouring this DSP site at the time of review. Digikit's send adapter uses the later master entry and supplies research evidence for the track buses. [Stock render order](https://github.com/ElekLabs/digikit/blob/d6de4d099a5430e0738bef7698369559e873b78b/docs/findings/53-stock-dsp-shape.md) · [Track-bus proof](https://github.com/ElekLabs/digikit/blob/d6de4d099a5430e0738bef7698369559e873b78b/docs/findings/62-fx-send-route.md)

## Draft callback contract

These signatures describe the proposed interface. No indices are assigned.

```c
struct dt2_render_in {
    const float *left[16];
    const float *right[16];
    uint32_t block_id;
};

struct dt2_render_out {
    float *left[16];
    float *right[16];
    uint32_t block_id;
    uint32_t beat_offsets;
    uint32_t beat_number;
    uint32_t transport_generation;
    uint32_t playing;
};

typedef void (*dt2_render_in_handler)(const struct dt2_render_in *);
typedef void (*dt2_render_out_handler)(const struct dt2_render_out *);
```

The base runs all `ev_render_in` subscribers in link order before any `ev_render_out` subscriber runs. Output callbacks then run in link order and see earlier output changes. Both handlers return void. Buffer pointers are valid for the callback only. The base owns both collections and rejects a full collection at link time. Four slots per phase is the initial review target. The existing ColdFire event ABI does not change.

`beat_offsets` is a bitmask of native quarter-note event positions in the 32-sample block. `beat_number` identifies the first event when the mask has any bits. Additional events are consecutive in sample order. The base provides a coherent transport generation, playing flag and beat record to SHARC for the same block. A subscriber can select every fourth or eighth beat from that record. It does not time beats with the UI tick or count local audio blocks. A fresh PLAY starts a generation, and a running pattern change keeps the phase. Confirm STOP, restart, external sync, rests and tempo changes before fixing the wire layout. The existing sequencer grid proposal is a trace lead. [Grid prototype](../../sdk/machines/digitakt-ii/elekloader/modwerk/README.md#playback-grid-prototype)

The related UI proposal is a base-owned Master page list with one contributed SIDECHAIN page after stock COMP. Stock navigation and COMP controls remain available. On that page, TRIG toggles a destination and FUNC plus TRIG toggles an audio source. Confirm the native page-list and view access guards before reserving a page slot.

## Observed on the OS 1.17 emulator

The private fixture matched stock SHA-256 `26c22f6652625ac2cfd47f7ee970d388ed8b6427dae3563c0a6a2f2d334350d5`. In digikit `d6de4d0`, four runs restored the same card-ready state and played a generated 220 Hz tone on T1. Each run produced 1,139 blocks and 72,896 PCM words with zero missing blocks or DSP halts.

| Render path | Result |
| --- | --- |
| Stock | 28,864 nonzero PCM words |
| Pre-send overlay, OFF | PCM byte-identical to stock |
| AUDIO, T1 source and T1 destination | 3.317 dB lower RMS on nonzero stock sample positions |
| AUDIO, T1 source and silent T2 destination | PCM byte-identical to stock |

Standalone SHARC tests exercised all sixteen track masks, a shared gain envelope for nonadjacent destinations, a beat hold across a block boundary, register preservation, the guarded instruction replay and exact write ranges. The prototype used 1,138 bytes of SHARC code and 4,380 bytes of SHARC data with one curve table. With sixteen sources and sixteen destinations, AUDIO executed 9,060 SHARC instructions per block in the emulator. Those figures exclude link padding, live settings publication and the shared base. Hardware cycles and linked ColdFire shared DDR and fast SRAM remain open.

## Acceptance for the base build

1. Verify the guarded SHARC linker and browser builder with an empty dispatch chain and a test subscriber. Compare stock PCM and check the analog, USB master and individual USB outputs.
2. Trace the native transport to the audio frame and prove the sample offsets for 4- and 8-beat subscribers. Verify the shared page entry and return through the stock COMP page.
3. Measure linked memory and worst-case DSP cost with the module alone and beside a released Digitakt II module. Qualify the exact candidate on OS 1.17 using a generated key, a selected destination and an unselected track.
