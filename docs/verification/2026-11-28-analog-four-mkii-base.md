# Analog Four MKII source-built base verification

- Stock OS 1.56 SHA-256 `5aea489db3e747547f71d5e08a2d20253149fe6258defad60306402d2fc23cb5`.
- Modwerk base package SHA-256 `b687298c927868a11f16eb6a627b46d0d03d45fa90f31c270a11abd3256f3d09`.
- Site-built A4B1 SHA-256 `f0eecdc6fcf413485d38b04d8f884627ff10bc0e1a58861a5a8b9e086b4cbe91`.

Two independent `npm run machine:base -- analog-four-mkii` builds matched the recorded package and preserved the upstream interface and 103 patch sites. The source recipe stores a SHA-256 guard and length for each patch. The standalone link uses 43,472 of 131,072 shared bytes.

| Case | How run | Result |
| --- | --- | --- |
| Browser selects the source-built base and builds OS 1.56 | Pass the owner's stock file through the site builder and compare the decoded main image with the standalone linker | Pass |
| Base boots and accepts track selection, Play and Stop | Boot the site-built A4B1 in analog-emu and drive T2, PLAY and STOP | Pass in emulator |
| Scale Loom works alongside the source-built base | Link Scale Loom against the same base as A4B2, reuse the SL18 storage lock and run the native generation, pitch reroll and Undo checks | Pass in emulator |
| Standalone base on an Analog Four MKII | The author ran A4B1 on their unit | The author reported that A4B1 worked. Individual checks were not reported. |

The earlier SL18 hardware report was for the upstream core package. On November 28, dylthom reported that the source-built A4B1 worked on their Analog Four MKII.
