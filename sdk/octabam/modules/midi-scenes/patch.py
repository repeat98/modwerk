"""MIDISC2.0 stock-free recipe adapter; execution requires private local stock.

The author's sparse release was inspected and converted to original byte
changes plus fingerprinted local-stock references. Never serialize read()
results or use this draft in release automation.
"""
from hashlib import sha256
import json
from pathlib import Path

PIN = '4f9a89453fdcdd39a3cd57f010ffa489cac721cd'
RECIPE_SHA256 = '45a22136433a817c853ed44a53ba9d84c600024bb85b008d0dcbe507220902ef'
BASE_ADDRESS = 0x40000400
RELEASE_MAIN_SHA256 = 'ed7ccf4f9a383caaf3210f526b69fded2384a272670da0a17d0ff87441b622b3'

# Issue #329: stock FUNC+SCENE A/B sets 0x80000006/0x80000007 to 1 and the
# stock morph then ignores that side; MIDISC2.0 never read either flag. The
# crossfader mix, endpoint snapshot and XF cache key now load a muted side's
# scene as unassigned (0xff), so a mute behaves like a blank scene: the
# unlocked side falls back to the trig lock or track value, and with both
# muted every scened CC returns to its base value. When neither side locks a
# parameter the author writes its base value silently; with a mute active it
# now uses the author's send-if-changed path, so muting the last scene sends
# the static CC as stock does. The mix's null scene
# pointer paths loaded -1 rather than the 0xff "no lock" marker; their
# branches now reach stubs that load 0xff. Scene-held edits still read the
# real assignment, as stock does. Helpers and stubs occupy 114 of 116 and 26
# of 140 bytes of two unreferenced 0xff runs inside the author's main cave.
# (address, author bytes, replacement)
SCENE_MUTE = (
    (0x400d2928, '779073a80001', '4eb9400d738c'),  # crossfader mix: jsr ab_d1
    (0x400d2984, '6700000c', '67004a64'),          # mix, no Scene A pointer: beq null_a
    (0x400d299e, '6700000c', '67004a54'),          # mix, no Scene B pointer: beq null_b
    (0x400d69d2, '67000008', '67000a9c'),          # mix, neither side locked: beq unlocked
    (0x400d6884, '71d0b0ba00cc', '4eb9400d73c4'),  # XF cache key: jsr ab_key
    (0x400d7092, '779079a80001', '4eb9400d73a8'),  # crossfader endpoint snapshot: jsr ab_d4
    (0x400d738c, 'ff' * 116,
     '779073a800014a3980000006670250c34a3980000007670250c14e75'                       # ab_d1
     '779079a800014a3980000006670250c34a3980000007670250c44e75'                       # ab_d4
     '71d04a3980000006670600800000ff004a398000000767060080000000ffb0b9400d69544e75'  # ab_key
     '760050c34ef9400d2994'                                                           # null_a
     '780050c44ef9400d29ae'),                                                         # null_b
    (0x400d7470, 'ff' * 140,
     '4a7980000006660c02800000007f4ef9400d2a7e4ef9400d2a9a'),         # unlocked
)


def scene_mute(data, offset):
    """Apply the scene-mute rows that fall inside author bytes at file offset."""
    value = bytearray(data)
    for address, author, replacement in SCENE_MUTE:
        at = address - BASE_ADDRESS - offset
        if at < 0 or at >= len(value):
            continue
        author, replacement = bytes.fromhex(author), bytes.fromhex(replacement)
        if at + len(author) > len(value) or value[at:at + len(author)] != author or len(replacement) > len(author):
            raise ValueError('MIDISC2.0 scene-mute site differs from the author image')
        value[at:at + len(replacement)] = replacement
    return bytes(value)


def recipe():
    raw = Path(__file__).with_name('recipe.json').read_bytes()
    if sha256(raw).hexdigest() != RECIPE_SHA256:
        raise ValueError('MIDISC2.0 source recipe fingerprint differs')
    value = json.loads(raw)
    if value['schemaVersion'] != 1 or value['id'] != 'midi-scenes' or value['upstream']['revision'] != PIN:
        raise ValueError('Unexpected MIDISC2.0 source identity')
    return value


def materialize(stock, row):
    if sha256(stock[row['offset']:row['offset'] + row['bytes']]).hexdigest() != row['guardSha256']:
        raise ValueError('MIDISC2.0 destination guard differs from stock')
    value = bytearray()
    for segment in row['segments']:
        if set(segment) == {'hex'}:
            value.extend(bytes.fromhex(segment['hex']))
        elif set(segment) == {'stockOffset', 'bytes', 'sha256'}:
            copied = stock[segment['stockOffset']:segment['stockOffset'] + segment['bytes']]
            if len(copied) != segment['bytes'] or sha256(copied).hexdigest() != segment['sha256']:
                raise ValueError('MIDISC2.0 inherited stock fingerprint differs')
            value.extend(copied)
        else:
            raise ValueError('Invalid MIDISC2.0 source segment')
    if len(value) != row['bytes']:
        raise ValueError('MIDISC2.0 region length differs')
    return bytes(value)


def apply(stock):
    spec = recipe()
    if len(stock) != spec['osBytes'] or sha256(stock).hexdigest() != spec['stockSha256']:
        raise ValueError('MIDISC2.0 requires original OS 1.40C')
    result = bytearray(stock)
    end = 0
    for row in spec['writes']:
        if row['offset'] < end or row['bytes'] < 1 or row['offset'] + row['bytes'] > len(stock):
            raise ValueError('Overlapping or out-of-bounds MIDISC2.0 region')
        data = materialize(stock, row)
        result[row['offset']:row['offset'] + len(data)] = data
        end = row['offset'] + len(data)
    if sha256(result).hexdigest() != spec['mainSha256']:
        raise ValueError('MIDISC2.0 output differs from the author image')
    result = scene_mute(result, 0)
    if sha256(result).hexdigest() != RELEASE_MAIN_SHA256:
        raise ValueError('MIDISC2.0 scene-mute output differs from the release image')
    return result


class LocalPatchWrite:
    """A native Poke value that remains unresolved during declaration review."""
    def __init__(self, row):
        self.row = row

    def __len__(self):
        return self.row['bytes']

    def read(self):
        from remix.stock_guard import _verified_image
        return scene_mute(materialize(_verified_image(), self.row), self.row['offset'])

    def __iter__(self):
        return iter(self.read())

    def __bytes__(self):
        return self.read()

    def hex(self):
        return self.read().hex()


def native_pokes():
    from remix.schema import Poke
    from remix.stock_guard import BASE, stock_guard
    return tuple(Poke(BASE + row['offset'], stock_guard(BASE + row['offset'], row['bytes'], row['guardSha256']),
                      LocalPatchWrite(row), 'MIDISC2.0 guarded region ' + str(index))
                 for index, row in enumerate(recipe()['writes']))
