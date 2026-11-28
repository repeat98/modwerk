# SPDX-License-Identifier: GPL-3.0-or-later
"""DSP code inside a main OS: the payloads the ColdFire uploads to the DSP cores at boot.

A device profile names them (`dsp_payloads`: tag -> (address, length)). A payload is a sequence of 24-bit
little-endian words forming records [space, address, count, then count words] with space 0 = P, 1 = X, 2 = Y, and
two-word directives led by 3 or 4. A leading word above 4 ends the payload.

The linker places DSP sections and DSP tables in P words of a payload that a package frees (the profile's
`dsp_areas`); p_span gives the main OS address where those words are stored.
"""
from .elemod import ModError

SPACES = 'PXY'


def w24(b, i):
    """The 24-bit little-endian word at b[i]."""
    return b[i] | b[i + 1] << 8 | b[i + 2] << 16


def records(image, dev, tag):
    """Payload `tag` -> [(space, address, count, main OS address of its first data word)]."""
    if tag not in dev.dsp_payloads:
        raise ModError('the %s has no DSP payload %s' % (dev.name, tag))
    start, size = dev.dsp_payloads[tag]
    offset = start - dev.main_load
    payload = image[offset:offset + size]
    if len(payload) != size:
        raise ModError('DSP payload %s runs past the main OS' % tag)
    found, at = [], 0
    while at + 3 <= size:
        space = w24(payload, at)
        if space > 4:
            return found
        if space >= 3:                          # a two-word directive
            at += 6
            continue
        if at + 9 > size:
            break
        address, count = w24(payload, at + 3), w24(payload, at + 6)
        if count == 0 or at + 9 + 3 * count > size:
            break
        found.append((space, address, count, start + at + 9))
        at += 9 + 3 * count
    if at == size:
        return found
    raise ModError('DSP payload %s does not parse at +0x%x' % (tag, at))


def p_span(image, dev, tag, lo, hi):
    """The main OS address of P words lo..hi-1 of payload `tag`; they must all lie in one record."""
    for space, address, count, at in records(image, dev, tag):
        if space == 0 and address <= lo and hi <= address + count:
            return at + 3 * (lo - address)
    raise ModError('payload %s does not load P:0x%05x-0x%05x in one record' % (tag, lo, hi - 1))
