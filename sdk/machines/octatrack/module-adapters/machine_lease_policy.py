# SPDX-License-Identifier: GPL-3.0-or-later
"""Derive the reviewed write-lease offsets of a linked machine image (a packaged DSP machine's controller).

controller_write_lease.c grants a lease only when Begin's argument is the
policy entry and both actual return PCs equal the policy's continuations in
the same owned image. This reads them from the linked ELF instead of trusting
a hand-written row: exactly one Begin call (inside the renderer its machine port's
"lease" names first, Analog BD's ab_render) and one End call (inside the second,
ab_lease_end) must exist. Identity fields (encoded/source SHA-256,
module, revisions) belong to the encoded package and are not derived here.
"""
from pathlib import Path
import re
import subprocess

from analog_bd_write_lease import IMPORTS


def _symbols(elf, cross):
    table = {}
    for line in subprocess.check_output([cross + 'nm', '-S', str(elf)], text=True).splitlines():
        parts = line.split()
        if len(parts) == 4:
            table[parts[3]] = (int(parts[0], 16), int(parts[1], 16))
    return table


def policy_offsets(elf, origin, imports, cross='m68k-elf-', functions=('ab_render', 'ab_lease_end')):
    """Offsets from `origin` of entry, Begin return and End return; refuses ambiguity."""
    if set(imports) != set(IMPORTS):
        raise ValueError('The lease policy needs exactly the two strong lease imports.')
    symbols = _symbols(elf, cross)
    calls = {name: [] for name in IMPORTS}
    listing = subprocess.check_output([cross + 'objdump', '-d', '-m', 'm68k:cfv4e', str(elf)], text=True)
    for line in listing.splitlines():
        match = re.match(r'\s*([0-9a-f]+):\s+((?:[0-9a-f]{4} )+)\s*jsr ([0-9a-f]+)\b', line)
        if not match:
            continue
        target = int(match[3], 16)
        for name, address in imports.items():
            if target == address:
                at, size = int(match[1], 16), 2 * len(match[2].split())
                calls[name].append(at + size)
    if any(len(found) != 1 for found in calls.values()):
        raise ValueError('Each lease function needs exactly one call site: %r' % {k: len(v) for k, v in calls.items()})
    begin, end = calls[IMPORTS[0]][0], calls[IMPORTS[1]][0]
    for name, ret in ((functions[0], begin), (functions[1], end)):
        start, size = symbols.get(name, (None, 0))
        if start is None or not start < ret <= start + size:
            raise ValueError('A lease call lies outside its reviewed function: ' + name)
    entry = symbols[functions[0]][0]
    if (entry | begin | end) & 1 or begin == end or min(entry, begin, end) < origin:
        raise ValueError('Lease offsets are not even, distinct image offsets.')
    return dict(entry=entry - origin, begin_return=begin - origin, end_return=end - origin)
