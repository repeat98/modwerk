# Proposal: a shared hook for the stock per-track delay ring

Status: **proposal, needs the owner's decision.** Nothing here is in a base yet, and Freeze cannot run on a unit
until a base carries it. Written 22 November 2026 for Freeze; it changes nothing in Tape Echo.

## Why

The stock delay routine (0x400031a0, once a frame) owns a four-second ring per track (176,400 stereo frames at
`0x4f502c10 + track * 1411328`, uncached alias). It is the only memory on the unit that holds seconds of a track's
audio without borrowing sample memory, and it is free on any track whose FX2 is not DELAY. A tempo-locked loop of
3, 5 or 7 steps needs it: Ghost Cut's FX2 DSP ring holds about 353 ms, under one step at 120 BPM.

Tape Echo (author and owner: repeat98) already takes the routine's seam for its own FX2 id with two detours:

| Site | Length | What Tape Echo does there |
| --- | --- | --- |
| `0x40002f44` | 8 | resets its state with the stock ring reset (`te_cpu_reset`) |
| `0x4000361a` | 10 | per track, after the DMA read wait and next-track prefetch: runs its own filter/mix for its id, otherwise replays stock (`te_cpu_hook`) |

The base itself already patches three other places in the same routine (`status.s`: `mw_delay_read0` 0x4000332a,
`mw_delay_read` 0x400035ba, `mw_delay_idle` 0x4000362a). A second module taking 0x4000361a is refused by the
one-owner-per-byte rule, and rightly. Since each track's FX2 runs one effect at a time, the ring is naturally shared
**per track by FX2 id**: exactly a take/call hook's job.

## The hooks

Add at the end of `sdk/machines/octatrack/events.json` on `base/octatrack-next` (index 62 and 63 on the draft as of
22 November 2026, whose last is 61 `ev_audio_frame_prepare`; `pr:ready` claims them on the board):

**62 `ev_delay_track`**, call hook, site `0x4000361a`, length 10 (Tape Echo's guard:
`44c264b0c51850739e6cc12dc26e78557067c3998a3fae1ba32b6bc0f337e49e`). Runs per track at the seam. The base builds
one record from the stock frame and calls handlers in `order`; the first that returns nonzero takes the track.

```c
struct modwerk_delay_track {
    uint32_t abi;                 /* 1 */
    uint32_t track;               /* 0..7 */
    uint32_t fx2_id;              /* the effect id this track's FX2 runs (setup byte 7) */
    const uint8_t *page1;         /* the staged FX2 page-1 halfwords; a knob is the high byte (k[0], k[2] .. k[10]) */
    const uint8_t *page2;         /* the track's FX2 page-2 bytes for this frame (to be located: see below) */
    const volatile int32_t *ring; /* the track's ring, uncached */
    uint32_t write;               /* ring frame this block's record is written to; <= 176400 - 16 */
    int32_t *audio;               /* 16 interleaved stereo frames, in and out */
    int32_t *record;              /* 16 interleaved stereo frames the routine then writes to the ring */
    uint32_t tempo24;             /* 0x8000181c, BPM x 24 */
    uint8_t running;              /* the track's run flag, 0x80006500 + track */
    uint8_t tick;                 /* the track's sequencer tick, 0x800064f0 + track */
    uint8_t scale;                /* the track's scale index 0..6 (Euclid's pattern/track lookup) */
    uint8_t reserved;
};
int f(struct modwerk_delay_track *t);   /* nonzero: this handler took the track */
```

When a handler takes the track the base does what Tape Echo's adapter does today and nothing a module must know:
it toggles the stock scratch buffers (`0x800000e8 ^= 0x40003626`), clears the four EMAC accumulators before the
call, advances the stock filter's state iterator (`0x80006180 += 68`), and rejoins `0x4000377a` for the stock DMA
write of `record`. Otherwise it replays the displaced instructions and returns to 0x40003624. A taken call also
restarts `status.s`'s quiet count, as a seam call before it does now. Order bands: 40-69, one effect id each;
a handler returns nonzero **only** for its own id. Context: the frame interrupt; short, no blocking call, EMAC
state as found, C convention.

**63 `ev_delay_reset`**, call hook, site `0x40002f44`, length 8 (guard
`4c0570fc6ef0682508e64de2367e111c27f895b6b78e58c300b3f2e7b8010118`), `void f(void)`, notify: every handler runs
when stock resets the rings. Freeze does not need it (its state resets on effect entry), Tape Echo does.

## Who moves

- **Tape Echo** keeps its two detours until its author moves it onto the hooks: a `pending-migration` entry in
  `sdk/machines/octatrack/compatibility.json` names Tape Echo, the two sites and the hooks, with `until`. Its
  `te_cpu_frame` already has the shape of a handler (it reads exactly these values from the stack). Nobody but its
  author changes it.
- **Freeze** subscribes to 62 at order 50 and takes only its own id. Its handler is a dozen lines: decode the knobs
  into `FzParams`, the grid into `FzGrid` (`freeze_step_q4(tempo24, scale)`), call `freeze_process`.

## Open before it can ship

1. The owner decides the hooks (and their ABI) and adds them to the cumulative base draft.
2. Where the FX2 **page-2** bytes are at the seam. Euclid reads them from the frame record
   (`0x80000110 + (0x800000e0 & 1) * 512`, track * 64, bytes 48-53 for FX2) in the frame hook; whether that record
   is current at the delay seam has to be checked in `ot_emu`. Until then Freeze's FADE and SEAM would be fixed.
3. Whether the tick byte also moves on swung steps as the trig plays (Deja Vu measured it lands within 0.01 step
   of the trigs without swing). The host tests model swing as a delayed tick; `ot_emu` must confirm it.
4. The effect id: the USB base assigns module effect ids at install, so `fx2_id` is compared against the id the
   loader gives Freeze, not a pinned one.
5. CPU: Freeze reads up to two heads (about 34 uncached words each a block) plus 32 words to write the ring back
   while holding. Not measured; see TESTING.md.
