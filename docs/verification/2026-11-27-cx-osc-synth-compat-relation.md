# Octatrack: FM Synth and CX OSC cross-compatibility

27 November 2026. Records measured overlap counts and merge order. **This pull request does not change the judge file or `events.json`.**

## Durable fix (base branch, not this PR)

The 22 shared ColdFire sites belong in `sdk/machines/octatrack/events.json` as take hooks so FM Synth and CX OSC **subscribe** instead of detouring the same bytes. Work is on cumulative base branch `base/octatrack-next` as `prop/cx-osc-fm-engine-hooks` (indices 63 through 84, verification note `docs/verification/2026-11-28-cx-osc-fm-engine-hooks.md`). After that base lands, both module packages drop the overlapping `Detour`s and extend `runtime.json` with `subscribe` and `replaces`.

`ev_midi_note_on` / `ev_midi_note_off` (indices 8 and 9) already own `0x4000e746` and `0x4000dfd4`. Module PR [#2293](https://github.com/repeat98/modwerk/pull/2293) should finish migration to those hooks and stop detouring them.

## Interim only: `group-owned` at catalogue listing

Until packages migrate, a `group-owned` row in `compatibility.json` can cover the listing window. It is **not** a substitute for the base hooks.

**You cannot land the row alone on `main`.** `npm run modules:compat` fails with:

`relation synth+cx-osc names cx-osc, which is no longer an active module`

Paste `relations[0]` from `sdk/drafts/cx-osc/owner-compat-relation.json` (on #2293) into `sdk/machines/octatrack/compatibility.json` in the **same merge** that lists `cx-osc` in `sdk/catalog.json` and publishes `sdk/octatrack/modules/cx-osc/`.

## Host proof (draft staged, `modules:compat --with cx-osc`)

| `relations` | synth + cx problems |
| --- | --- |
| `[]` | 23 |
| group-owned row (22 sites, owner `synth`) | 0 |

On the #2293 tree with `sdk/drafts/cx-osc/scripts/verify_compat_relation.py`:

```bash
python3 -B sdk/drafts/cx-osc/scripts/verify_compat_relation.py
```

## What #2293 keeps until the base and migration land

- `conflicts: ["synth"]` in `octamod.module.json` (configurator refuses both).
- Engine sites still detoured in the draft manifest until hooks 63 through 84 ship and packages subscribe.