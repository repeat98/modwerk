# `quantize-live-rec-toggle` -- QUANTIZE_LIVE_REC_TOGGLE

QUANTIZE LIVE REC from the front panel: hold `[REC]` and tap `[PLAY]` to show the setting in a toast; tap `[PLAY]` again while the toast is up to invert it. The first `[REC]` + `[PLAY]` still starts live recording as on stock.

Built from [Zac-Kyoti/octatrack-kyoti-fw](https://github.com/Zac-Kyoti/octatrack-kyoti-fw)
(submodule `upstream/`, pinned to `77f132f`). `Kind.CF_PATCH`. One ROM cave (`patch_qlrec.s`).
`upstream/octabam-modules/quantize-live-rec-toggle/README.md` is the full description, with what was measured and what was inferred.

## Measured

- Every build re-links each cave or unit and compares it with the author's
  own bytes (`reference`); a difference refuses the build.
- `make check REMIX=quantize-live-rec-toggle` (`remixes/test/quantize-live-rec-toggle/`) builds and boots the
  image under the ColdFire port.

## On the unit

- 25 Sep 2026: the gesture on the author's MKI.
- 30 Sep 2026: a setting changed with it survives a power cycle.
