# SPDX-License-Identifier: GPL-3.0-or-later
"""Compare normalized eight-lane native traces. A different sampled state still fails."""
import argparse
import json
from pathlib import Path


def compare(candidate, stock):
    result = {}
    for name in ("events", "writes", "states"):
        left, right = candidate[name], stock[name]
        if not left or len(left) != len(right):
            raise ValueError(f"{name}: incomplete or unequal lengths")
        different = [i for i, (a, b) in enumerate(zip(left, right)) if a != b]
        result[name] = {"count": len(left), "different_indexes": different}
        if name == "states":
            result[name]["different_ticks"] = [left[i][0] for i in different]
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("candidate", type=Path)
    parser.add_argument("stock", type=Path)
    args = parser.parse_args()
    report = compare(json.loads(args.candidate.read_text()), json.loads(args.stock.read_text()))
    print(json.dumps(report, indent=2))
    raise SystemExit(int(any(v["different_indexes"] for v in report.values())))
