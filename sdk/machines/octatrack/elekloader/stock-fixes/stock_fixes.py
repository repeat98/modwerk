# SPDX-License-Identifier: GPL-3.0-or-later
"""The stock OS 1.40C fixes every Modwerk Octatrack base carries (README.md here): their sources and stock sites.

Each site is (address, length, SHA-256 of the stock bytes there, op, target). build_core.py checks every guard against
the owner's OS file and patches the site with a jmp or jsr to the base's own entry; no stock byte is kept here. No stock
branch lands inside any of the six sites (only on their first byte, where one does), checked on OS 1.40C."""

SOURCES = ('pattern_led.s', 'part_reapply.s', 'trigless_locks.s', 'plays_free.s')

SITES = (
    # Empty-pattern LED (Zac-Kyoti, EMPTY_PATTERN_LED_FIX): the content test 0x4009a464 (pattern, bank).
    (0x4009a464, 6, '9eab14ed9d527816054c9f68837b2e021fba5470d105516b94b63ffb8ed1f45d', 'jmp', 'mw_fix_pattern_led'),
    # Part-change carryover (Zac-Kyoti, PART_CHANGE_CARRYOVER_FIX): the "select Part" handler's head and tail.
    (0x400621da, 6, '2632ff0358536cd6b85e363a80fd9c9e33f2f117dbfc65e8e23debdb91ddcb79', 'jsr', 'mw_fix_part_head'),
    (0x40062216, 6, '1240ac0416e043919eaedd12200e392705724809c194c889241b438966804513', 'jsr', 'mw_fix_part_tail'),
    # Erase empty trigless locks (Zac-Kyoti, ERASE_EMPTY_TRIGLESS_LOCKS): the audio and MIDI erase stores.
    (0x40038a5c, 6, '612015c5099dac1d34325eae9360c13ff49c8772328be7ca7efab93f0ed32e23', 'jsr', 'mw_fix_trigless_audio'),
    (0x400387b8, 6, 'cc76ec4d0b51d0e6725e69eb5acdf241029c0f9b7dee253a76756525bd2705ec', 'jsr', 'mw_fix_trigless_midi'),
    # MIDI Plays-Free trig (Zac-Kyoti's analysis; Modwerk's entry, beside Direct Jump Kyoti's splice at 0x4009b6f2).
    (0x4009b708, 6, '877dfbf7a379ed5f28ec6ae2afb044cde276f6692f5d0d0a4633ee5a7fec42df', 'jsr', 'mw_fix_plays_free'),
)


def recipe_sites(stock_at, sha):
    """The recipe's site entries, each guard checked: stock_at(address, n) reads the owner's OS, sha() hex-digests."""
    sites = []
    for address, n, guard, op, target in SITES:
        stock = stock_at(address, n)
        if sha(stock) != guard:
            raise ValueError('Stock bytes at %#x are not the ones stock-fixes/stock_fixes.py names (%s).' % (address, target))
        sites.append(dict(addr=hex(address), stock=stock.hex(), op=op, target=target))
    return sites
