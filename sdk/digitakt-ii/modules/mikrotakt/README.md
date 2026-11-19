# Mikrotakt

A Digitakt II mod by @Claptom-music. Version 0.1.0-experimental.

Describe what it does, every control, how to reach it on the unit, and a short tutorial. Follow docs/ADD_A_MODULE.md, the guide for this mod's category in docs/module-guides/ (and sequencing.md if it acts in time), docs/SDK.md and the Digitakt II guide (sdk/machines/digitakt-ii/README.md).

## Design notes (work in progress)

The grain player runs on the sound chip in place of the stock sample player for Mikrotakt's voices (the base's machine player dispatcher). Plan: each block, for each active grain, call the stock sample player with the voice's play position set to the grain's position and its output pointed at a scratch buffer, then add the grain through a window into the voice's slot. The stock player keeps doing the sample reading, interpolation and pitch, so grains sound like the Digitakt's own sample playback.

Fields of the stock voice state record the player touches (OS 1.17, word offsets; read from the stock renderer at `0x1c4f81`, values from an emulator run, meanings still to confirm): `+0x62` to `+0x6d` hold the sample's bounds, position and step (`+0x63`/`+0x65` 24,000 for a one-second 48 kHz mono test sample, `+0x6d` advancing by 16 each block).

Emulator check (19 November 2026): a player that only calls the stock sample player, the way the render loop does (`CALL 0x1c4ecf` linked, then `DM(I7, M7) = R2` and `DM(I7, M7) = return - 1` in the delay slots: the stock `RETURN` resumes one past the pushed address), and then returns, plays the test machine byte-identically to the stock player (PCM `2129ca6e...`). So the grain player can render each grain with the stock player. With the return address pushed exactly (not minus one) the emulated sound chip stopped inside the player.
