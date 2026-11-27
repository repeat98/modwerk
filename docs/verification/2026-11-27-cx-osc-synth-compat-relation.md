# Octatrack cross-compatibility: synth + cx-osc (pre-listing)

27 November 2026. **Not a judge-file edit on `main`.** The reviewed row lives in `owner-compat-relation.json` on module PR [#2293](https://github.com/repeat98/modwerk/pull/2293) until catalogue listing.

## Why a standalone `compatibility.json` PR cannot pass CI

`npm run modules:compat` on `main` (module-contract) fails if a relation names `cx-osc` before `sdk/catalog.json` lists it:

`relation synth+cx-osc names cx-osc, which is no longer an active module`

Landing the row and the catalog entry in **one owner merge** is required.

## Host proof (draft staged, `--with cx-osc`)

| `relations` | synth+cx problems |
|-------------|-------------------|
| `[]` | 23 |
| group-owned row (22 sites, owner `synth`) | 0 |

On the #2293 tree after it includes `sdk/drafts/cx-osc/scripts/verify_compat_relation.py`:

```bash
python3 -B sdk/drafts/cx-osc/scripts/verify_compat_relation.py
```

## Owner merge (listing window)

Paste `relations[0]` from `sdk/drafts/cx-osc/owner-compat-relation.json` into `sdk/machines/octatrack/compatibility.json` in the **same merge** that adds `cx-osc` to `sdk/catalog.json` and moves the module to `sdk/octatrack/modules/cx-osc/`.

Until then, experimental draft `#2293` keeps `conflicts: ["synth"]` and stages with `module:doctor --draft cx-osc` (`modules:compat --with cx-osc` on a branch that carries the relation locally).