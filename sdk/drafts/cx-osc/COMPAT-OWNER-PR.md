# Owner Fix PR: synth + cx-osc group-owned relation

**Do not fold this into module PR #2293.** `pr:ready` refuses a module pull request that edits `sdk/machines/octatrack/compatibility.json`.

**Do not merge this Fix PR into `main` alone.** A relation row that names `cx-osc` fails `npm run modules:compat` until `cx-osc` is an active catalogue module. Land this in the same window as the catalog listing PR (or a single owner merge of both).

## Ready patch

Paste `owner-compat-relation.json` → `relations[0]` into `sdk/machines/octatrack/compatibility.json`.

Branch prepared locally: `fix/cx-osc-synth-compat-relation` (`~/projects/modwerk/.claude/worktrees/cx-osc-compat-relation`).

## Host proof (27 Nov 2026)

With the draft staged under `sdk/octatrack/modules/cx-osc` and `npm run modules:compat -- --with cx-osc`:

| relations[] | synth+cx problems |
|-------------|-------------------|
| empty (main today) | 23 |
| group-owned row (22 sites, owner `synth`) | 0 |

```bash
python3 -B sdk/octatrack/modules/cx-osc/scripts/verify_compat_relation.py
```

## Suggested Fix PR title

`Fix: group-owned synth+cx-osc engine hook sites`

## Suggested body

Octatrack cross-compatibility for the experimental **CX OSC** machine draft ([#2293](https://github.com/repeat98/modwerk/pull/2293)).

FM Synth and CX OSC share the Tim Hastie ColdFire FM engine detour surface. The configurator already refuses both (`conflicts: ["synth"]` on cx-osc). This adds the reviewed **group-owned** relation so `modules:compat` passes when cx-osc is staged with `--with cx-osc` and when both modules are catalogue-active.

Owner: `synth`. Sites: 22 addresses listed in the relation (verified by `verify_compat_relation.py` on the #2293 branch).

**Merge requirement:** merge only together with (or immediately before) `sdk/catalog.json` listing cx-osc at `0.1.0-experimental`. Never activate the relation on main without the catalog row.

**Guides:** nothing.