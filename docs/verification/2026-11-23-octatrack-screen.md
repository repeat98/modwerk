# Octatrack Hub screen capture

Draft base 0.8 `b2e12cbf` returned 12 consecutive 1,028-byte MWLC replies over its normal USB interface in the MKII emulator. The final 1,024 pixel bytes matched a frame in the independently decoded panel UART stream exactly. A later panel frame differed by 54 of 8,192 pixels. The native and browser builders produced the same OS container (SHA-256 `11e46630cbcd3116775ad6daf183805276b7774e59b24ce787a5a27297a894a3`).

The cumulative draft subsequently incorporated the stock OS fixes and restore-outcome reporting from #2032. The combined public base `e1152583` produced identical native and browser OS containers (SHA-256 `8c7842ff7dd418377ec1488faa51f18a7e154353884ba63d095d043f0a55444e`). It also returned twelve complete LCD replies in the MKII emulator, with an exact match in the independently decoded panel stream. The hardware readings below belong to the earlier development twin.

The EP0 handler copies the composed LCD on a screen request. The base has no screen-capture draw subscription. The browser schedules each read after the previous reply, with a delay of one frame interval at the selected 5, 10, 15 or 30 fps. The detached window and local video recorder consume that same frame. An unchanged LCD skips pixel decoding and preview repaints. Recording still draws the cached image so a pause keeps its place in the video. The development preview at `?preview=screen#octatrack/screen` uses three recorded Synth module screens.

## Hardware qualification

On the owner's MKII, development twin `67c87af4` of `b2e12cbf` ran the same screen responder as the public candidate. Part 1 was playing with stock FILTER and DELAY on all eight tracks and an empty module inventory. The displayed page stayed static. Five 12-second windows alternated capture off and on. Once per second the host read the same CPU and DSP meters in both modes. The two capture windows also used the browser's USB transport to request a frame 200 ms after each completed transfer.

| Window | LCD replies | Mean CPU | Longest frame interrupt | Skipped renders |
| --- | ---: | ---: | ---: | ---: |
| Off | 0 | 40.67% | 32.7% of a frame | 0 |
| On | 59 | 40.70% | 31.8% | 0 |
| Off | 0 | 40.93% | 32.8% | 0 |
| On | 59 | 40.73% | 33.1% | 0 |
| Off | 0 | 40.78% | 33.2% | 0 |

The two DSP meters averaged 32.9% and 41.9%, respectively, in every window. This run gives 4.92 LCD frames/s and no measurable increase in mean CPU. Audio output was not recorded or auditioned. This result covers the measured project and development twin. A saturated project, an MKI and an end-to-end browser recording from physical hardware remain untested.

## Higher capture rates

On the same MKII and twin, C02 played with T2 selected, Part 1, stock FILTER and DELAY on all eight tracks, and an empty module inventory. The host read the load meters once per second in eleven 12-second windows. The capture caps ran in ascending and descending order with capture off at the start, middle and end. Each read finished before the host waited the selected frame interval. Both DSP meters again averaged 32.9% and 41.9% in every window.

| Frame rate cap | LCD replies | Delivered frames/s | Mean CPU | Highest frame interrupt | Skipped renders |
| --- | ---: | ---: | ---: | ---: | ---: |
| Off | 0 | 0 | 40.68% | 32.1% | 0 |
| 5 fps | 118 | 4.92 | 40.88% | 33.5% | 0 |
| 10 fps | 231 | 9.62 | 40.85% | 32.2% | 0 |
| 15 fps | 341 | 14.21 | 40.95% | 34.6% | 0 |
| 30 fps | 633 | 26.37 | 41.05% | 33.7% | 0 |

The default is 15 fps. The 30 fps setting delivered 26.37 LCD reads/s at 0.37 percentage points above the off baseline. Each capture window showed a static page, so these rates measure USB delivery. Measuring visible animation cadence requires a changing page.

Edge cases

| Case | Why this change makes it a risk | How run | Result |
| --- | --- | --- | --- |
| Idle Hub or older base | A background reader could use USB before the musician starts | Hub tests count screen requests on mount with and without the capability | pass |
| Slow USB with preview, pop-out and recording | Multiple readers or a pending transfer could outlive the window | Session test delays replies while changing rates, recording and closing | pass |
| Dense polling during playback | LCD copies could take time from audio rendering | Physical MKII development twin, eleven timed windows at 0, 5, 10, 15 and 30 fps | pass |
| Recording a moving physical LCD | The host encoder must preserve visible changes in an exported clip | Requires a browser recording from a connected instrument | not run: physical comparison measured USB frames and playback counters |

## Restoration

The first Windows RAM transfer used an oversized explicit chunk. The device still identified as the original base. The client cancelled the incomplete transfer and confirmed normal state. Both RAM boots succeeded with the default WinUSB-compatible chunk. After the comparison the original build `856cbbcf`, empty inventory, T8, Part 1, stock effects and stopped transport were confirmed, and the unit reservation was released. After the higher-rate run the unit again identified as `856cbbcf` with an empty inventory. C02, T2, Part 1, all eight stock effect pairs and stopped transport matched that run’s initial state before release.
