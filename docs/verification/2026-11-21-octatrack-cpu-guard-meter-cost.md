# Octatrack base 0.7.13: the CPU guard charges what a machine adds (21 November 2026)

The owner's MKII, OS 1.40C, CF card in, the owner's project, Part 1 (T2 on another machine, the rest Flex), stopped between readings. Every run was in RAM; nothing was kept, and both trials rolled back.

## Before: base 0.7.12 logic

With T1 on Flex the Part played at 43.5 % on the CPU meter. Picking Grain was refused with CPU FULL, "PLAY 52 % +38 %": the kept load plus eight points for sleeping delays plus Grain's price of 35 and 3 for waking reached 89.5 %, over the 85 % line. Played with Grain at its worst settings (PTCH +24, SIZE and DENS at 127, a 16-bit stereo sample), the same Part read 52.7 %: Grain added 8.9 meter points, not 38. Grain 0.1.0's own record gives +14.5 and +16.5 for dense six-voice 24-bit stereo, hence a meter cost of 17 for Grain 0.1.1.

## After: development twin 2201eb62 (the release source with --dev), Grain 0.1.1 (package 1b3728c0, meter cost 17)

The guard's own figures read from memory at each step (per mille; "kept" is cpu_played, "adjust" cpu_adjust, "mean" the meter's last four seconds):

| Step | kept | adjust | mean | pick |
| --- | ---: | ---: | ---: | --- |
| Start, T1 Flex | 0 | 0 | 384 | |
| Played 7 s with T1 Flex (meter 426–439), stopped | 434 | 0 | 435 | |
| Pick Grain on T1 | 434 | +170 | 375 | taken |
| Played 7 s with Grain (meter 483–519), stopped | 515 | 0 | 516 | |
| T1 to FLEX at once | 515 | −170 | 389 | taken |
| T1 back to Grain at once | 515 | 0 | 377 | taken |
| A second Grain on T2 | 515 | 0 | 395 | refused by the allowance: "GRAIN NEEDS +78 %, CPU 155 %, CHANGE ONE FIRST" |

The per-Part allowance still charges the price (35 of 45), so a second Grain in the Part is refused as before.

## The exact release image: base 6d23e888

RAM-booted from the twin, it answered in seconds with no modules (its identity differs from the flashed base's, so it loads neither kept set). Grain 0.1.1 loaded as a trial (one module live) and rolled back on request (none live). The release image answers no development requests, so the guard's figures above come from the twin built from the same source.

Not tested: flashing 0.7.13, a Keep on it and a power-cycled restore; effects (their meter costs follow in the next base change).
