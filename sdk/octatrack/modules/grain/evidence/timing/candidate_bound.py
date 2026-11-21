"""Bound the Grain-owned callbacks in the private six-voice candidate. Requires SciPy."""
import argparse
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile

import numpy as np
from scipy.optimize import linprog
from scipy.sparse import lil_matrix

from bound import cost, edges_and_calls


PACKAGE = "ac1e55403bf37b39c529501d30c610c5f055ef73b04a359c25b07b023d6d51bd"
LOCATE = (0x3078, 0x32AE, 0x38C0)
STEREO_CALLS = (0x34C8, 0x3960, 0x39EC, 0x3A98, 0x3D5C)


def read_image(package, elf):
    packed = package.read_bytes()
    if hashlib.sha256(packed).hexdigest() != PACKAGE:
        raise ValueError("The package differs from the six-voice candidate")
    # ABI 8 stores the image immediately after the 76-byte header and hook words.
    first = 76 + 4 * int.from_bytes(packed[20:24], "big")
    size = int.from_bytes(packed[8:12], "big")
    with tempfile.TemporaryDirectory() as directory:
        flat = Path(directory) / "image"
        subprocess.run(["m68k-elf-objcopy", "-O", "binary", "-j", ".image", elf, flat], check=True)
        if flat.read_bytes() != packed[first:first + size]:
            raise ValueError("The ELF differs from the candidate package image")
    listing = subprocess.check_output(["m68k-elf-objdump", "-d", "--no-show-raw-insn", elf], text=True)
    functions = {}
    for line in listing.splitlines():
        label = re.fullmatch(r"[0-9a-f]+ <([^>]+)>:", line)
        if label:
            ops = functions[label[1]] = {}
        else:
            insn = re.match(r"^\s*([0-9a-f]+):\s+(\S+)\s*(.*)", line)
            if insn:
                ops[int(insn[1], 16)] = insn[2], insn[3]
    return functions


def reachable(functions, root):
    todo, edges, instructions = [root], [], {}
    while todo:
        name = todo.pop()
        if min(functions[name]) in instructions:
            continue
        ops = functions[name].copy()
        if name == "gran_render":
            for pc in LOCATE:
                assert ops[pc] == ("jsr", "%a0@")
                # The machine sets GranSample.locate to flex_page.
                ops[pc] = ("jsr", f'{min(functions["flex_page"]):x} <flex_page>')
        local, calls = edges_and_calls(name, ops)
        instructions.update(functions[name])
        for pc, dest in local:
            entry = min(functions[calls[pc]]) if pc in calls else None
            edges.append((pc, dest, entry))
        todo.extend(calls.values())
    return instructions, edges


def visit_limits(functions, root, n, instructions):
    # SRC and SETUP each have six entries. The packed header consumes one byte
    # per iteration. The silent output branch clears two words per source frame.
    caps = [([pc], limit) for pc, limit in (
        (0x17C, 6), (0x196, 6), (0x110C, 6), (0x1128, 6), (0x3E24, 6),
        (0x3E3A, 6), (0x405C, 6), (0x3ED2, 4), (0x430A, 2 * n)
    ) if pc in instructions]
    if root == "grain_start":
        return caps

    # Clear and clamp n outputs. Try at most n spawn times, search six slots
    # each time, fill only empty slots and visit the six voices once.
    caps.extend([([pc], limit) for pc, limit in (
        (0x2B54, n), (0x2B78, n), (0x2CD2, n), (0x2CD6, 6 * n),
        (0x34E6, 6), (0x2DA8, 6)
    )])
    # A voice consumes at most n samples. A page-boundary probe advances or
    # ends the current span. Allow both loops plus their end checks, including
    # shared compiler tails. The generic path can also look up once per voice
    # before its sample loop. A call to a stereo kernel consumes >= 1 sample.
    caps.extend(([pc], 12 * (n + 1)) for pc in functions["gran_render"])
    caps.extend([(LOCATE, 6 * (n + 1)), (STEREO_CALLS, 6 * n), ([0x39A8], 6 * n)])
    # Each stereo kernel writes a pair of incrementing stores. The first store
    # of each pair, the scalar sample increments, inline mixers' mid stores
    # and the packed mixer's silent increment count disjoint output samples.
    stores = [pc for pc, (op, arg) in functions["stereo_page"].items()
              if op == "movel" and arg.endswith("@+")]
    assert len(stores) == 20
    scalar = (0x302A, 0x3136, 0x33D6, 0x37B4, 0x3B64, 0x3C4E, 0x39FE)
    caps.append(([*stores[::2], *scalar], 6 * n))
    return caps


def certify(functions, root, n, model):
    instructions, edges = reachable(functions, root)
    constraints = visit_limits(functions, root, n, instructions)
    index = {pc: i for i, pc in enumerate(instructions)}
    flow = lil_matrix((len(index), len(edges)))
    visits = lil_matrix((len(constraints), len(edges)))
    affected = {pc: [] for pc in index}
    for i, (sites, _) in enumerate(constraints):
        for pc in sites:
            affected[pc].append(i)
    weights = []
    for j, (pc, dest, entry) in enumerate(edges):
        flow[index[pc], j] += 1
        # A call consumes one complete callee flow in addition to its continuation.
        for target in (dest, entry):
            if target is not None:
                flow[index[target], j] -= 1
        for i in affected[pc]:
            visits[i, j] = 1
        weights.append(cost(*instructions[pc], model))
    start = min(functions[root])
    supply = np.zeros(len(index))
    supply[index[start]] = 1
    limits = [limit for _, limit in constraints]
    result = linprog(-np.array(weights), A_eq=flow.tocsr(), b_eq=supply,
                     A_ub=visits.tocsr(), b_ub=limits, bounds=(0, None), method="highs")
    if not result.success:
        raise ValueError(result.message)

    # Verify the upper bound against every edge independently of solver tolerance.
    potentials = {pc: Fraction(-v).limit_denominator() for pc, v in zip(index, result.eqlin.marginals)}
    prices = [Fraction(-v).limit_denominator() for v in result.ineqlin.marginals]
    assert all(price >= 0 for price in prices)
    for (pc, dest, entry), work in zip(edges, weights):
        cap_cost = sum(prices[i] for i in affected[pc])
        assert potentials[pc] - potentials.get(dest, 0) - potentials.get(entry, 0) + cap_cost >= work
    total = potentials[start] + sum(price * limit for price, limit in zip(prices, limits))
    return -(-total.numerator // total.denominator)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("package", type=Path)
    parser.add_argument("elf", type=Path)
    args = parser.parse_args()
    functions = read_image(args.package, args.elf)
    results = [dict(sourceFrames=n, callback=fn, instructions=certify(functions, fn, n, "instructions"),
                    conditionalCoreCycles=certify(functions, fn, n, "core"))
               for n in (16, 32) for fn in ("grain_start", "grain_render")]
    print(json.dumps(results, indent=2))
