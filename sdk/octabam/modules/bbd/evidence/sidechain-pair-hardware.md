# BBD Delay beside Sidechain Compressor: reported hardware operation

## 0.1.2-experimental

Tester: **Zac Kyoti** (the author of Sidechain Compressor, not of BBD Delay),
30 October 2026, on an **Octatrack MKI**, OS 1.40C. Image: Modwerk's native
build of BBD Delay 0.1.2 with Sidechain Compressor 0.2.1 and the stock FX2
effects kept (`bbd+sidechain-compressor:true`), MAIN OS SHA-256
`c234d13ce64efdf96a8843065feaf1c400f4d9ada081a680d557d639d112019f`, flashed
from a `.bin` card update wrapped from that MAIN OS (version field
`MW_BBDSC`, `.bin` SHA-256
`c9bb0cfa673ba53c3b5adc53c402030b9c6a0cb245f4363ef11f212ea5ba4300`).

Reported "working as expected" for this checklist:

1. BBD on T1 FX2 and on T5 FX2 (the slots whose buffer tail holds the key
   bus) with a keyed COMPRESSOR on another track: BBD clean, no key-bus
   noise in the line; the compressor still ducks.
2. BBD at maximum TIME with STGS 4096, then FRZ, while the compressor is
   keyed: the ducking stays normal.
3. BBD on T3 FX2: as before.

Not run: the USB package, the beta base, a project save and reload or a
power cycle on this version. A functional report; duration and material were
not reported.
