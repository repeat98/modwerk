#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Prints the label of the run interlock_scan.py makes at a module's defaults, as JSON.

    python3 -B sdk/cycle-scan/defaults_setting.py <module>     # from a built tree, as interlock_scan.py

A sweep runs every value of the selector (MODE, or the first small select) at "def", "max", "min" and "dear"; the
run at the module's defaults is the "def" run of the selector's default value (or the one "defaults" run when the
module has no selector). That is the setting a fresh pick on the unit starts from, which device:price's in-use
reading measures (scripts/cycle-scan.mjs unit). It reads interlock_scan.py's own settings, so the two agree.
"""
import json
import os
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import interlock_scan as scan  # noqa: E402  (sets up the octabam tree's tools path)


def main(name):
    os.environ.setdefault("REMIX", "octabam-bus")
    from remix import registry
    mod = registry.by_name(name)
    runs = scan.settings_for(mod, [], False)
    sel = scan.selector(mod)
    if sel is None:
        label = runs[0][0]
    else:
        names = [scan._name(q) for q in mod.params]
        i = names.index(sel)
        default = mod.params[i].default or 0
        label = next(label for label, _variant, params in runs if params[i] == default)
    print(json.dumps({"module": name, "setting": f"{label}/def"}))


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
