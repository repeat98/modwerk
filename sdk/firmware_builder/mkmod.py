# SPDX-License-Identifier: GPL-3.0-or-later
"""Package-writing helpers shared by the SDK builder: storing bytes that repeat the stock image as copies from the
musician's own image instead of shipping them."""


def stock_parts(blob, stock, minimum, load):
    """Split `blob` into parts: every run of at least `minimum` bytes that also occurs in `stock` (loaded at `load`;
    the run 2-aligned in both, and not a single repeated byte) becomes ('stock', address, n), extended 2 bytes at a
    time while it keeps matching; everything else becomes ('hex', bytes). A window found more than once in stock
    refers to its first even offset."""
    first_at = {}
    for off in range(0, len(stock) - minimum + 1, 2):
        first_at.setdefault(stock[off:off + minimum], off)
    parts, literal, i = [], bytearray(), 0
    while i < len(blob):
        window = blob[i:i + minimum]
        found = first_at.get(window) if i % 2 == 0 and i + minimum <= len(blob) else None
        if found is None or len(set(window)) == 1:
            literal.append(blob[i])
            i += 1
            continue
        n = minimum
        while i + n + 2 <= len(blob) and stock[found + n:found + n + 2] == blob[i + n:i + n + 2]:
            n += 2
        if literal:
            parts.append(('hex', bytes(literal)))
            literal = bytearray()
        parts.append(('stock', load + found, n))
        i += n
    if literal:
        parts.append(('hex', bytes(literal)))
    return parts
