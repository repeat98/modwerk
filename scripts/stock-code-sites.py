#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""The Octatrack's patched code sites as JSON, for scripts/stock-branches.mjs: every hook site of the base, the base's
own code sites and each active module's detours and hook sites, as the cross-compatibility gate reads them
(scripts/module-compat.py). Addresses and lengths only; no firmware is read."""
import importlib.util
import json
import sys
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('module_compat', APP / 'scripts/module-compat.py')
compat = importlib.util.module_from_spec(spec)
spec.loader.exec_module(compat)


def main():
    ids, modules, inputs, _ = compat.repository_inputs(())
    sites = [dict(addr=int(e['site'], 16), length=e['length'], owner='the base (hook ' + e['event'] + ')') for e in inputs['events'] if e.get('site')]
    sites += [dict(addr=addr, length=length, owner='the base') for addr, length, kind in inputs['base_sites'] if kind == 'code']
    for module_id, module in zip(ids, modules):
        sites += [dict(addr=start, length=length, owner=module_id + ' (' + label + ')')
                  for kind, start, length, label in compat.claims(module) if kind in compat.HOOKS]
    json.dump(sites, sys.stdout)


if __name__ == '__main__':
    main()
