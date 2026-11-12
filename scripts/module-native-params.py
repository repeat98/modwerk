#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Each Octatrack module's native knob declarations as JSON, for module:doctor's controls line: the active Param slots
of its manifest.py (slot, name, default, count), read as the cross-compatibility gate reads manifests
(scripts/module-compat.py). A field the manifest leaves to the donor effect is null. No firmware is read.

    python3 -B scripts/module-native-params.py [--with <id>]
"""
import importlib.util
import json
import sys
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('module_compat', APP / 'scripts/module-compat.py')
compat = importlib.util.module_from_spec(spec)
spec.loader.exec_module(compat)


def main(argv):
    extra = [argv[i + 1] for i, a in enumerate(argv[:-1]) if a == '--with']
    ids, modules, _, _ = compat.repository_inputs(extra)
    json.dump({module_id: [dict(slot=slot, name=p.name.decode('ascii', 'replace') if p.name is not None else None,
                                default=p.default, count=p.count)
                           for slot, p in enumerate(module.params) if p.active]
               for module_id, module in zip(ids, modules)}, sys.stdout)


if __name__ == '__main__':
    main(sys.argv[1:])
