# USB RAM trial — SEQ POS (MOP-16 evidence stub)

Date: 22 November 2026
Host: DESKTOP-JH92J0W (self-hosted)
Agent: bc-e8a5b0c4-9a46-51bd-9b97-38e6437c5652

## Package (private, not catalog-listed)

| Field | Value |
| --- | --- |
| Bytes | 282 |
| SHA-256 | `4ff885b42722c9c1d5140d3d6e14dc04beb3ace1061b2bb50938f3d169d80e00` |
| Sites | dest lea `0x4000d042` pad_to=8 + PMTR count poke `0x400d38a8` → 32 |
| Unit | ColdFire-safe lea+cmpi stub (index 31; index 30 sunk). Full draft in `unit.full.s`. |

## Unit

| Field | Value |
| --- | --- |
| OS | 1.40C `164f3122…` |
| Base | `6d23e888…` (not `--dev`) |
| Command | `npm run device -- try …/seq-pos.mwrm --seconds 10 --socket 47811` (no `--accept`) |

## Outcome

- Precondition: FM Synth and Mute Modes cleared for lea/trig conflicts as needed; card restored after.
- Trial digest `4ff885b42722c9c1…` ran 10 s; DIAG slot running; **Undo/rollback**.
- Audible / panel / Keep **not observed** (base without `--dev`; no force-list).

## Note

4-byte lea-only rejoins at `0x4000d046` reboot this unit; use trig-prob's pad_to=8 / `0x4000d04a` pattern.
Production PMTR index remains the draft's allocated slot once a base-owned destination table exists.

## Production index restore (23 Nov 2026)

`unit.s` / `manifest.py` now use coordinator-lock **SPOS = 37** (count → 38, sink 30..36) with the same pad_to=8 dest pattern. The index-31 stub was evidence-only; this restore was **not** re-trialled on hardware in the cloud checkout.

