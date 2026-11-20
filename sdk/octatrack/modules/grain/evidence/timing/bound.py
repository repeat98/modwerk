"""Bound the module-owned audio paths in the exact zero-linked Grain ELF. Requires SciPy."""
import argparse
from fractions import Fraction
from functools import lru_cache
import hashlib
from pathlib import Path
import re
import subprocess
import tempfile

import numpy as np
from scipy.optimize import linprog
from scipy.sparse import lil_matrix


def disassemble(elf):
    with tempfile.TemporaryDirectory() as directory:
        flat = Path(directory) / "image"
        subprocess.run(["m68k-elf-objcopy", "-O", "binary", "-j", ".image", elf, flat], check=True)
        raw = flat.read_bytes()
    if hashlib.sha256(raw).hexdigest() != "e38456abc91ec3ab13bef12139130294b092a179bf3f85f9359ae7f315f21062":
        raise ValueError("The executable differs from the analyzed package image")
    listing = subprocess.check_output(["m68k-elf-objdump", "-d", "--no-show-raw-insn", elf], text=True)
    functions = {}
    current = None
    for line in listing.splitlines():
        symbol = re.match(r"^\w+ <([^>]+)>:", line)
        if symbol:
            current = functions[symbol[1]] = {}
        else:
            op = re.match(r"^\s*([a-f0-9]+):\s+(\S+)\s*(.*)", line)
            if op and current is not None:
                current[int(op[1], 16)] = (op[2], op[3])
    return functions


BRANCH = re.compile(r"b(?:hi|ls|cc|cs|ne|eq|vc|vs|pl|mi|ge|lt|gt|le|ra)[swl]?")


def edges_and_calls(name, instructions):
    edges, calls = [], {}
    pcs = sorted(instructions)
    for pc, following in zip(pcs, pcs[1:] + [None]):
        op, arg = instructions[pc]
        target = re.search(r"([a-f0-9]+) <([^>]+)>", arg)
        if BRANCH.fullmatch(op):
            edges.append((pc, int(target[1], 16)))
            if not op.startswith("bra"):
                edges.append((pc, following))
        elif op == "rts":
            edges.append((pc, None))
        else:
            if op in ("jmp", "rte") or op.startswith(("db", "trap")) or following is None:
                raise ValueError(f"Unclassified control transfer at {pc:x}")
            if op == "jsr" or op.startswith("bsr"):
                if target and int(target[1], 16) < 0x10000:
                    calls[pc] = target[2].split("+")[0]
                elif not target:
                    # gran_render's indirect GranSample.locate is flex_page in the machine.
                    if name != "gran_render" or pc not in (0x2d2a, 0x304e):
                        raise ValueError(f"Unclassified indirect call at {pc:x}")
                    calls[pc] = "flex_page"
                elif int(target[1], 16) not in (0x40004008, 0x4000f450):
                    raise ValueError(f"Unclassified external call at {pc:x}")
            edges.append((pc, following))
    return edges, calls


def visit_limits(name, n):
    # Caps apply to one invocation. Branches may take infeasible combinations, so
    # the relaxed maximum is deliberately conservative. No loop trip count is inferred
    # from a sampled run. Multiple addresses can belong to mutually exclusive kernels.
    if name == "view_open":
        return {0x110: 6, 0x12a: 6}  # Six SRC words, six SETUP bytes.
    if name == "grain_start":
        return {0x1178: 6, 0x1194: 6}
    if name == "grain_render":
        return {0x3924: 6, 0x393a: 6, 0x39d2: 4, 0x3b5c: 6, 0x3e0a: 2*n}
    if name == "stereo_page":
        return {pc: n for pc in (0x1fe0, 0x2092, 0x21c8, 0x22ca, 0x23d0, 0x23e6)}
    if name == "gran_render":
        return {
            0x29d8: n, 0x29fc: n,                 # Clear and output one stereo packet.
            0x2b58: n, 0x2b64: 6*n, 0x3242: 6,   # Spacing >= 1, six slots, at most six births.
            0x2c48: 6, 0x31e4: 6,                # Six voices, at most one fast kernel per voice.
            0x2e2a: 6*n, 0x3616: 6*n, 0x3746: 6*n, 0x3510: 6*n,
            0x2fbe: 6*n, 0x2fdc: 6*(n+1),       # Fallback cursor advance and bounds check.
        }
    if name in ("flex_page", "recorder_idle", "gran_params"):
        return {}
    raise ValueError(f"Missing function bounds for {name}")


def cost(op, arg, model):
    if model == "instructions":
        return 1
    # Allowances above the MCF54455RM 3.3.5 core-table entries. This conditional
    # model assumes instruction availability and zero-wait memory. The physical
    # unit has shared SDRAM and interrupts. Its deadline cannot be signed off here.
    if op.startswith(("rem", "div")):
        return 48
    if op == "moveml":
        return 64
    if op in ("jsr", "rts", "linkw", "unlk") or op.startswith("bsr"):
        return 16
    if BRANCH.fullmatch(op):
        return 8
    if op.startswith("mul"):
        return 16
    return 12 if "@" in arg or " <" in arg else 4


def analyze(functions):
    @lru_cache(None)
    def bound(name, n, model):
        ops = functions[name]
        pcs = sorted(ops)
        index = {pc: i for i, pc in enumerate(pcs)}
        edges, calls = edges_and_calls(name, ops)
        limits = visit_limits(name, n)
        if not set(limits).issubset(ops):
            raise ValueError("Instruction layout changed")
        caps = list(limits)
        flow = lil_matrix((len(pcs), len(edges)))
        visits = lil_matrix((len(caps), len(edges)))
        weights = []
        for j, (pc, dest) in enumerate(edges):
            flow[index[pc], j] += 1
            if dest is not None:
                flow[index[dest], j] -= 1
            if pc in limits:
                visits[caps.index(pc), j] = 1
            callee = bound(calls[pc], n, model) if pc in calls else 0
            weights.append(cost(*ops[pc], model) + callee)
        source = np.zeros(len(pcs))
        source[0] = 1
        result = linprog(-np.array(weights), A_eq=flow.tocsr(), b_eq=source,
                         A_ub=visits.tocsr() if caps else None,
                         b_ub=list(limits.values()) if caps else None,
                         bounds=(0, None), method="highs")
        if not result.success:
            raise ValueError(f"{name} {model}: {result.message}")
        # Certify the returned upper bound edge by edge with exact arithmetic.
        potentials = {pc: Fraction(-v).limit_denominator() for pc, v in zip(pcs, result.eqlin.marginals)}
        prices = {pc: Fraction(-v).limit_denominator() for pc, v in zip(caps, result.ineqlin.marginals)}
        assert all(v >= 0 for v in prices.values())
        for (pc, dest), work in zip(edges, weights):
            assert potentials[pc] - potentials.get(dest, 0) + prices.get(pc, 0) >= work
        total = potentials[pcs[0]] + sum(limits[pc] * price for pc, price in prices.items())
        return -(-total.numerator // total.denominator)

    for frames in (16, 32):
        for name in ("grain_start", "grain_render"):
            print(frames, name, *(bound(name, frames, m) for m in ("instructions", "core")))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("elf", type=Path, help="grain.elf written by build_probe.py")
    analyze(disassemble(parser.parse_args().elf))
