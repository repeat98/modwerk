# SPDX-License-Identifier: MIT
"""Units that join the DRAM runtime only when another selected module already carries one.

A stock-DSP effect may list linked units in modules/<id>/placement.json
({"schema": 1, "moduleId": "<id>", "joinRuntime": ["<label>", ...]}). Beside a
module with DRAM units they link into the platform runtime (no reservation of
their own: the runtime is there already); otherwise they stay where declared.
The browser follows the same rule (src/engine/coldfire-runtime.ts) and resolves
a joined unit through the descriptor's raw words and detours only, hence the
stock-DSP restriction. Kept outside tools/remix so the reviewed pins over
tools/remix/*.py (standalone recipes, table declarations) do not move with it.
"""
from dataclasses import replace
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
JOIN = {}
for _p in sorted((ROOT / 'modules').glob('*/placement.json')):
    _rule = json.loads(_p.read_text())
    if _rule.get('schema') != 1 or _rule.get('moduleId') != _p.parent.name or not _rule.get('joinRuntime'):
        raise ValueError(f'Invalid placement rule: {_p}')
    JOIN[_rule['moduleId']] = tuple(_rule['joinRuntime'])


def join_runtime(selected):
    selected = list(selected)
    if not any(u.dram for m in selected for u in getattr(m, 'linked', ())):
        return selected
    out = []
    for m in selected:
        units = JOIN.get(m.name, ())
        if not units:
            out.append(m)
            continue
        if set(units) - {u.label for u in m.linked}:
            raise ValueError(f'{m.name}: placement rule names a unit the module does not link')
        if not (m.menu and m.menu.stock_dsp):
            raise ValueError(f"{m.name}: only a stock-DSP effect's descriptor units can join the runtime")
        out.append(replace(m, linked=tuple(replace(u, dram=True) if u.label in units else u for u in m.linked)))
    return out


def join_map(known, keys):
    """`known` with the selected modules (`keys`) placed by the rule; build_bus applies it after compose_map."""
    return {**known, **{m.key: m for m in join_runtime(known[k] for k in keys)}}
