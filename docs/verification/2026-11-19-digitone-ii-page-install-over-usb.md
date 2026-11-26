# Digitone II: the page builds the base and installs it over USB, 19 November 2026

The machine page's beta core build preview (#1812) and its USB install (`UsbUpgradePanel`, `os-upgrade.ts` from #1762), on the local development site (`npm run dev` with the local Worker, `npm run dev:community`), in a Chromium browser on macOS. Contributor's Digitone II (@prodbysmolec), running a development base before.

- **Build:** the page read the developer's `Digitone_II_OS1.12.syx` (`7e5b8a73…`, "SHA-256 verified"), and built the base alone (no module) on its plain variant, `7a60d82e` in `base-binding.json`, shown on the unit as 2.0a: "Firmware built and verified", the kit's build, prepare and verify steps complete.
- **First sends:** the browser sent 1,301 of 1,332 messages, each answered, then the unit answered no more ("The unit did not answer message 1301 of 1332; it stays on its OS"), twice: the build was the pinned kit's size, over the unit's update limit. `fitBuilt` had passed it through because the kit's result names its device "Digitone II", not `digitone-mk2`; it now looks the limit up by name too (a test pins it).
- **After the fix:** Build again, then Send: "Upload complete in 6.5 s"; the unit asked UPGRADE OS NOW?, the developer pressed YES, and it booted normally without the marker, as the base alone does (developer's report).
- **Not tested:** pressing NO at UPGRADE OS NOW? from the page, a build with modules (none exist yet), other browsers' Web MIDI, the deployed site.
