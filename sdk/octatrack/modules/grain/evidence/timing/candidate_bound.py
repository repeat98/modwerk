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
PAGE_MIX_PACKAGE = "9ad5285502117695e906dc90770840990008cea1a19398b8d2f395e870238443"
PAGE_MIX_LOCATE = (0x3198, 0x33AA, 0x39A0)
PAGE_MIX_CALLS = (0x35AE, 0x3A32, 0x3AB4, 0x3B62, 0x3E72)

PREP_PACKAGE = "7d5cf2e739a0f99d5c8be4f5a0629e2a46691314cacf2ee5dace54ccf517aa1b"
SYNTH_PACKAGE = "d09bd8f8ce95acd398d13ab91191da6d5288313c9c442988435b1224641234a5"
COMPACT_PACKAGE = "0e4fc8dd6a3bfc60ee60321a83bda82866adaedad8b555834ecdfb6b6dee6f21"
SYNTH_LOCATE = (0x3C60, 0x4114, 0x4362, 0x4536)
PREP_LOCATE = (0x31A6, 0x35B8, 0x3A3C)


def read_image(package, elf):
    packed = package.read_bytes()
    if hashlib.sha256(packed).hexdigest() not in (PACKAGE, PAGE_MIX_PACKAGE, PREP_PACKAGE, SYNTH_PACKAGE, COMPACT_PACKAGE):
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


def reachable(functions, root, locate, lookup_targets=("flex_page",)):
    todo, edges, instructions = [root], [], {}
    while todo:
        name = todo.pop()
        if min(functions[name]) in instructions:
            continue
        ops = functions[name].copy()
        if name == "gran_render":
            for pc in locate:
                assert ops[pc][0] == "jsr" and re.fullmatch(r"%a[0-6]@", ops[pc][1])
                # Classify the indirect branch before expanding its format-specific targets.
                ops[pc] = ("jsr", f'{min(functions["flex_page"]):x} <flex_page>')
        local, calls = edges_and_calls(name, ops)
        instructions.update(functions[name])
        for pc, dest in local:
            if name == "gran_render" and pc in locate:
                edges.extend((pc, dest, min(functions[target])) for target in lookup_targets)
                todo.extend(lookup_targets)
            else:
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


def page_mix_limits(functions, root, n, instructions):
    if root == "grain_start":
        return []  # The three paired control reads and writes are unrolled.
    caps = [([pc], maximum) for pc, maximum in (
        (0x3FE8, 3), (0x419E, 6), (0x4258, 2 * n),  # header bytes, SRC words, silent packet
        (0x2C84, n), (0x2CAE, n),                   # initialize and clamp the output
        (0x2E06, n), (0x2E12, 6 * n), (0x2EEE, 6)  # spawn attempts, slot search, voices
    )]
    # Each voice advances through at most n source positions. A single 24-bit
    # page fits 1024 frames. With a pitch of at most four frames per step, a
    # monotone run of 32 samples can consume no more than two mapped spans.
    # A missing page still costs a lookup for each silent source position.
    # The other stereo path calls the kernel once when the whole voice fits.
    caps.extend(([pc], 12 * (n + 1)) for pc in functions["gran_render"])
    caps.extend([(PAGE_MIX_LOCATE, 6 * (n + 1)), (PAGE_MIX_CALLS, 12),
                 ([0x3A76], 6 * n)])  # simulating the cursor at page boundaries
    # All nine stereo loops consume one sample per iteration. The scalar
    # phase advances and packed-page silent advances consume disjoint samples.
    stereo = (0x1F7E, 0x2064, 0x2122, 0x21E8, 0x2274, 0x234C, 0x2418, 0x24F4, 0x2582)
    scalar = (0x314C, 0x3252, 0x34B4, 0x38B4, 0x3C5C, 0x3D38, 0x3A4E, 0x3AC6)
    caps.append(([*stereo, *scalar], 6 * n))
    return caps


def preparation_limits(functions, root, n):
    if root == "grain_start":
        return []
    # The wrapper only loops to clear the two output words per source frame.
    caps = [([0x469C], 2 * n), ([0x2D22], n), ([0x2D4C], n)]
    # One initial/grain spawn per source frame at most, up to six free-slot
    # checks per attempt, and at most six grains receiving a new cursor.
    caps.extend([([0x2EAE], n), ([0x2EB4], 6 * n), ([0x2F9E], 6)])
    # The remaining per-voice loops advance a cursor, consume a sample, or
    # leave the current span. Include terminal probes and shared tails.
    caps.extend(([pc], 12 * (n + 1)) for pc in functions["gran_render"])
    # No voice can traverse three 1024-frame pages in 32 samples at ±4x. A
    # missing page still permits one unsuccessful lookup per source sample.
    caps.extend([(PREP_LOCATE, 6 * (n + 1)), ([0x37BC, 0x3AD6, 0x3B84, 0x3C32, 0x3F48], 12),
                 ([0x3B46], 6 * n)])
    # Each kernel iteration, scalar phase advance and silent cursor advance
    # consumes a distinct sample from one of the six grains.
    stereo = (0x201C, 0x2102, 0x21C0, 0x2286, 0x2312, 0x23EA, 0x24B6, 0x2592, 0x2620)
    scalar = (0x30B2, 0x3260, 0x36C2, 0x395A, 0x3D32, 0x3E0E, 0x3AF2, 0x3B10)
    caps.append(([*stereo, *scalar], 6 * n))
    return caps


def synthesis_limits(functions, root, n, delta, unroll):
    if root == "grain_start":
        return []
    # Shrinking the mixer moves both callbacks by the same amount in the
    # compact package. Their internal branch layout is identical.
    assert min(functions["gran_render"]) == 0x37F2 + delta
    assert min(functions["grain_render"]) == 0x4A08 + delta
    # The wrapper clears exactly two words per frame on an unreadable source.
    caps = [([0x5150, 0x515A], 2 * n), ([0x3862], n), ([0x388E], n)]
    # Each block attempts at most n spawns. Each attempt inspects six slots.
    # The two compiled voice loops are mutually exclusive and each visits six.
    caps.extend([([0x3A68], n), ([0x3A6E], 6 * n), ([0x3F80], 6),
                 ([0x3B84, 0x3DF0], 6), ([0x4094], 6 * n)])
    caps = [([pc + delta for pc in sites], limit) for sites, limit in caps]
    # A successful native span covers one or more output positions. At a pitch
    # of up to 4x, 32 source positions cross at most one 1,024- or 1,536-frame
    # page edge. A missing page may still need a lookup per output position.
    calls = [pc + delta for pc in (0x3D04, 0x40D2, 0x41DE, 0x4230, 0x47CA)]
    assert all("<stereo_page>" in functions["gran_render"][pc][1] for pc in calls)
    caps.extend([(calls, 12), ([pc + delta for pc in SYNTH_LOCATE], 6 * (n + 3))])
    # Bound the six voice visits, spawn scans, scalar mixers and boundary probes.
    # A probe visits each consumed position and at most one terminal edge per run.
    caps.extend(([pc], 12 * (n + 1)) for pc in functions["gran_render"])
    # Every unrolled frame accumulates exactly two consecutive mid/side words.
    writes = [pc for pc, (op, arg) in functions["stereo_page"].items()
              if op == "addl" and re.fullmatch(r"%d[0-7],%(?:a[0-7]|fp)@\+", arg)]
    assert len(writes) == 2 * 2 * 3 * unroll * 2  # widths, gains, pan signs, unroll, channels
    # Each remaining marker advances one scalar output or skips one unmapped
    # packed source position. The alternatives consume disjoint voice samples.
    scalar = [pc + delta for pc in (0x3D1E, 0x431A, 0x443E, 0x468E, 0x487A, 0x49D2)]
    assert all(functions["gran_render"][pc][0] == "addql" for pc in scalar)
    caps.append(([*writes[::2], *scalar], 6 * n))
    return caps


def certify(functions, root, n, model, package=PACKAGE):
    if package in (SYNTH_PACKAGE, COMPACT_PACKAGE):
        delta, unroll = (0x2DB4 - 0x37F2, 1) if package == COMPACT_PACKAGE else (0, 4)
        locate = [pc + delta for pc in SYNTH_LOCATE]
        instructions, edges = reachable(functions, root, locate, ("flex_page", "stereo24_page"))
        constraints = synthesis_limits(functions, root, n, delta, unroll)
    elif package == PREP_PACKAGE:
        instructions, edges = reachable(functions, root, PREP_LOCATE, ("flex_page", "stereo24_page"))
        constraints = preparation_limits(functions, root, n)
    else:
        page_mix = package == PAGE_MIX_PACKAGE
        instructions, edges = reachable(functions, root, PAGE_MIX_LOCATE if page_mix else LOCATE)
        constraints = (page_mix_limits if page_mix else visit_limits)(functions, root, n, instructions)
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
    package = hashlib.sha256(args.package.read_bytes()).hexdigest()
    results = [dict(sourceFrames=n, callback=fn, instructions=certify(functions, fn, n, "instructions", package),
                    conditionalCoreCycles=certify(functions, fn, n, "core", package))
               for n in (16, 32) for fn in ("grain_start", "grain_render")]
    print(json.dumps(results, indent=2))
