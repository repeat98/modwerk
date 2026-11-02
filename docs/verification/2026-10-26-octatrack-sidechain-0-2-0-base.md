# Octatrack beta base and SDK for Sidechain Compressor 0.2.0 — 26 October 2026

Owner review. The module's own results are in `sdk/octabam/modules/sidechain-compressor/TESTING.md`.

**What changes.**
- **`DspSection.ptable2`** in the vendored octabam schema and builder (`tools/remix/schema.py`, `tools/build/build_bus.py`), the resident DSP engine (`resident_dsp.py`) and the hooked DSP packages (`scripts/build-module-packages.py`).
  - A second table block is placed straight after the `ptable`, with its own `$fab2e0` literal, as upstream octabam places it.
  - A `ptable2` without exactly one literal, or a literal without a `ptable2`, is refused.
  - Sidechain Compressor 0.2.0 loads its key-filter table this way. 0.2.0's first build took the table's address from a register the gain store had already moved, and that broke KBAS and KWID on the author's MKI (`MW_SC020`).
- **The MWPP page record** may name 16 of the module's own routines, up from 8 (`controller_board.c`, `stock_hook_controllers.page_record`). Sidechain's page names 9.
- **The power-up check** (`machine_registry.c` `sidechain()`) shows stock's validator its own COMPRESSOR values in slots 7-11. MON now stores 2 / 3, and stock's value count of 2 for slot 7 would refuse the bank.
- **The key bus tap is one pass**, 25 executed instructions a sample (was 41). `dsp-sites.json` keeps the 51-cycle hardware charge measured on the old tap.

**How it was checked.**
- **Builder change.** `sdk/infrastructure-verification/ptable2-builder.json` records 128 selections (the floating-cave record's), built natively with the base commit's builder files and with these, both with the base commit's Sidechain folder: 100 identical images and 28 identical refusals.
- **Native against browser.** `module:verify sidechain-compressor` covers 154 selections:
  - 66 images match (24 identical outright, 42 outside the platform writes).
  - 88 refusals match.
  - 0 mismatches.
  - It caught the hooked package dropping the `ptable2` before the fix.
- **Pairs.** No pair is newly refused. The refused list (10) is main's.
- **Tests.** The resident engines with the real `dsp_asm` and dsp56300, `test_machine_registry.c` (MON 0-3, slot 7 shown as stock's 1, out-of-range values and other effects reach stock as they are), the controller board, the stock-hook controllers and the infrastructure regressions.
- **Base.** Regenerated with `--beta --write`. Analog BD's machine recipe was recaptured, and only its `imageSha256` moved. The base-bound packages were rebound. The strict stock-free scans pass (longest run 11; no 16-byte run).

**Not tested.** The USB beta base on a unit, including a power cycle with a MON 2/3 bank, which `test_machine_registry.c` covers on the host.
