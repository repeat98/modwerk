# SPDX-License-Identifier: GPL-3.0-or-later
"""Packer for the LZ sections of Elektron OS images: Modwerk's own implementation.

Writes the stream format elz.py depacks, with one fixed greedy policy so that the bytes are reproducible: at each
position the longest match among the 24 newest earlier positions sharing its first three bytes (the nearest on a
tie, the first of 64 bytes or more at once), else a literal. A section is a u32 stream length, a u32 byte sum and the
stream.
"""
import struct

MIN = 3            # shortest match
FARLIMIT = 3328    # offsets above this need one byte more, and code their length one shorter
MAXOFF = 65536
MAXCOUNT = 2048
WINDOW = 24        # positions kept per three-byte key
EARLY = 64         # a match this long ends the search
BIAS = 767


class _Stream:
    """Control bits packed into tag bytes, most significant first; each tag byte goes before its bits' payloads."""

    __slots__ = ('out', 'at', 'mask')

    def __init__(self):
        self.out = bytearray()
        self.at = 0
        self.mask = 0

    def bit(self, b):
        if not self.mask:
            self.at = len(self.out)
            self.out.append(0)
            self.mask = 0x80
        if b:
            self.out[self.at] |= self.mask
        self.mask >>= 1

    def gamma(self, v, payload=None):
        """v >= 2: each binary digit after the leading 1, then a stop bit (1 after the last digit)."""
        bit = self.bit
        for k in range(v.bit_length() - 2, 0, -1):
            bit(v >> k & 1)
            bit(0)
        bit(v & 1)
        bit(1)
        if payload is not None:
            self.out.append(payload)

    def literal(self, b):
        self.bit(1)
        self.out.append(b)

    def match(self, off, count):
        coded = count - 1 - (off > FARLIMIT)
        raw = off + BIAS
        self.bit(0)
        self.gamma(raw >> 8, raw & 0xFF)
        if coded <= 3:
            self.bit(coded >> 1)
            self.bit(coded & 1)
        else:
            self.bit(0)
            self.bit(0)
            self.gamma(coded - 2)

    def end(self):
        self.bit(0)
        self.gamma((1 << 24) + 2, 0xFF)  # (2^24 + 2) * 256 + 255 is BIAS modulo 2^32
        return bytes(self.out)


def _common(data, i, j, k, limit):
    """Length of the common run of data[i:] and data[j:], at most limit, given that the first k bytes agree."""
    step = 32
    while k < limit:
        e = min(k + step, limit)
        a, b = data[i + k:i + e], data[j + k:j + e]
        if a != b:
            x = int.from_bytes(a, 'big') ^ int.from_bytes(b, 'big')
            return e - (x.bit_length() + 7 >> 3)
        k = e
        step <<= 1
    return limit


def pack(data, compress=True):
    """The bare stream: literals and matches, then the end marker."""
    data = bytes(data)
    s = _Stream()
    n = len(data)
    if not compress:
        for b in data:
            s.literal(b)
        return s.end()
    table = {}
    get = table.get
    last = n - 4
    i = 0
    while i <= last:
        key = data[i:i + 3]
        seen = get(key)
        best = off = 0
        if seen:
            limit = min(MAXCOUNT, n - i)
            for j in reversed(seen[-WINDOW:]):
                d = i - j
                if d > MAXOFF:
                    break  # the rest are older still
                # a candidate counts only if it reaches at least t + 1 bytes
                t = best if best >= MIN + (d > FARLIMIT) else MIN - 1 + (d > FARLIMIT)
                if t >= limit or data[j + t] != data[i + t] or data[j + 3:j + t] != data[i + 3:i + t]:
                    continue
                best, off = _common(data, i, j, t + 1, limit), d
                if best >= EARLY:
                    break
        if seen is None:
            table[key] = [i]
        else:
            seen.append(i)
            if len(seen) > 4 * WINDOW:
                del seen[:-WINDOW]
        if off:
            s.match(off, best)
            for p in range(i + 1, min(i + best, last + 1)):
                key = data[p:p + 3]
                seen = get(key)
                if seen is None:
                    table[key] = [p]
                else:
                    seen.append(p)
                    if len(seen) > 4 * WINDOW:
                        del seen[:-WINDOW]
            i += best
        else:
            s.literal(data[i])
            i += 1
    for b in data[i:]:
        s.literal(b)
    return s.end()


def pack_section(data, compress=True):
    """A u32 stream length, the u32 sum of the stream's bytes, then the stream."""
    stream = pack(data, compress)
    return struct.pack('>II', len(stream), sum(stream) & 0xFFFFFFFF) + stream
