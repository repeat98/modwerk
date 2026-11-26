FRACT source-package checks now read stock-copy counts from the named build
receipt and base-import offsets from its reviewed reconstruction recipe. An
engine rebuild can move the import word or change coincidental stock matches;
the test still requires the sole approved pool-open import with zero addend,
the exact named package hash/size and normalized authored image.
