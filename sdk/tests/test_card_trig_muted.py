# SPDX-License-Identifier: GPL-3.0-or-later
"""The card-build counterpart of ev_trig_muted (sdk/machines/octatrack/card/trig_muted.inc): an asking and an answering
DRAM unit linked by the native builder's own DRAM link (remix.platform_build.link_runtime), alone and together, beside a
bystander unit. Needs ColdFire binutils (skipped without them); no firmware.

    python3 -B sdk/tests/test_card_trig_muted.py --write   # regenerate the configurator's fixture

The fixture (src/engine/test-fixtures/card-trig-muted.json) carries the three objects and the GNU link of every case;
src/engine/card-trig-muted.test.ts links the same objects with the configurator's linker and expects the same bytes."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
CARD = ROOT / 'sdk/machines/octatrack/card'
INC = CARD / 'trig_muted.inc'
FIXTURE = ROOT / 'src/engine/test-fixtures/card-trig-muted.json'
BASE = 0x40a955e0  # remix/arena.py BASE: where every card build's platform runtime starts
ANSWER = 'modwerk_card_ev_trig_muted'
TOOLS = ('as', 'ld', 'nm', 'objcopy')
sys.path.insert(0, str(ROOT / 'sdk/octabam/tools'))

# Each fixture takes the SDK file through its remix.inc, as a module's Linked.include gives it.
SOURCES = {
    'bystander': ('        .text\n        .global fx_other\nfx_other:\n        moveq   #7,%d0\n        rts\n'
                  '        .data\n        .balign 4\n        .global fx_word\nfx_word: .long   0x12345678\n'),
    'asker': ('        .include "remix.inc"\n        .text\n        .global fx_ask\n'
              '| d0 := the answer; d0-d1/a0-a1 the caller\'s, as for any C call\nfx_ask:\n'
              '        MODWERK_CARD_ASK_TRIG_MUTED\n        rts\n'),
    'answerer': ('        .include "remix.inc"\n        .text\n'
                 '| T1 and T3 dropped, T1 also cut; bits 16 and up set to show the ask masks them\n'
                 '        MODWERK_CARD_ANSWER_TRIG_MUTED\n        move.l  #0x00ff0105,%d0\n        rts\n'),
}
CASES = (  # (name, units in link order)
    ('neither', ('bystander',)),
    ('asker alone', ('bystander', 'asker')),
    ('answerer alone', ('bystander', 'answerer')),
    ('both', ('bystander', 'asker', 'answerer')),
    ('both, answerer first', ('bystander', 'answerer', 'asker')),
)


def toolchain():
    return all(shutil.which('m68k-elf-' + tool) for tool in TOOLS)


def link(units, work):
    """The native DRAM link of the named fixture units -> (bytes, {symbol: address}); SystemExit when ld refuses."""
    from remix import platform_build
    from remix.schema import Linked
    work.mkdir(parents=True, exist_ok=True)
    linked = []
    for i, name in enumerate(units):
        source = work / ('%02d_%s.s' % (i, name))
        source.write_text(SOURCES[name.split('#')[0]])
        linked.append(('FIXTURE', Linked('%s_%d' % (name.split('#')[0], i), str(source), cpu='5475', dram=True)))
    includes = {u.label: INC.read_text() for _, u in linked}
    cache = os.environ.get('OCTABAM_NO_CACHE')
    os.environ['OCTABAM_NO_CACHE'] = '1'  # no cache writes into sdk/octabam/out
    try:
        return platform_build.link_runtime(linked, work, {}, BASE, includes=includes)
    finally:
        if cache is None:
            os.environ.pop('OCTABAM_NO_CACHE')
        else:
            os.environ['OCTABAM_NO_CACHE'] = cache


def objects(work):
    """Each fixture assembled alone, as the configurator's packages carry it: {name: object bytes}."""
    out = {}
    work.mkdir(parents=True, exist_ok=True)
    for name, text in SOURCES.items():
        (work / 'remix.inc').write_text(INC.read_text())
        (work / (name + '.s')).write_text(text)
        subprocess.run(['m68k-elf-as', '-mcpu=54455', '-I', str(work), '-o', str(work / (name + '.o')), str(work / (name + '.s'))],
                       check=True, capture_output=True)
        out[name] = (work / (name + '.o')).read_bytes()
    return out


def immediate(image, symbols, name):
    """The answer address the ask loads: `move.l #imm,%d0` (0x203c) is the ask's first instruction."""
    at = symbols[name] - BASE
    assert image[at:at + 2] == b'\x20\x3c', image[at:at + 2].hex()
    return int.from_bytes(image[at + 2:at + 6], 'big')


def fixture():
    """The configurator's fixture: the three objects and the GNU link of every case."""
    with tempfile.TemporaryDirectory() as temp:
        work = Path(temp)
        objs = objects(work / 'objects')
        cases = []
        for name, units in CASES:
            image, symbols = link(units, work / name.replace(' ', '_').replace(',', ''))
            keep = {k: v for k, v in symbols.items() if k in ('fx_other', 'fx_word', 'fx_ask', ANSWER)}
            cases.append(dict(name=name, units=list(units), bytes=len(image), sha256=hashlib.sha256(image).hexdigest(),
                              symbols=keep, ask=immediate(image, symbols, 'fx_ask') if 'fx_ask' in symbols else None))
    return dict(description='The card-build counterpart of ev_trig_muted: sdk/machines/octatrack/card/trig_muted.inc '
                            '(sha256 %s), fixtures assembled by GNU m68k-elf-as (CPU 54455) and linked by '
                            'remix.platform_build.link_runtime at the platform runtime base. Written by '
                            'sdk/tests/test_card_trig_muted.py --write.' % hashlib.sha256(INC.read_bytes()).hexdigest(),
                base=BASE, answer=ANSWER, sources=SOURCES, objects={k: v.hex() for k, v in objs.items()}, cases=cases)


class CardTrigMutedContract(unittest.TestCase):
    def test_mirrors_the_base_event(self):
        events = json.loads((ROOT / 'sdk/machines/octatrack/events.json').read_text())['events']
        event = next(e for e in events if e['event'] == 'ev_trig_muted')
        # The card answer is the base event's: no arguments, one unsigned answer, tracks in bits 0-7, no stock site.
        self.assertEqual((event['prototype'], event['args'], event['results'], event['site']), ('unsigned f(void)', [], 'or', None))
        self.assertIn('bit t for track t+1, bits 0-7; higher bits are ignored', event['contract'])
        text = INC.read_text()
        for line in ('.weak   modwerk_card_ev_trig_muted', '.global modwerk_card_ev_trig_muted', 'andi.l  #0xffff,%d0',
                     '.set    MODWERK_TRIG_MUTED_DROP, 0x00ff', '.set    MODWERK_TRIG_MUTED_CUT, 0xff00'):
            self.assertIn(line, text)


@unittest.skipUnless(toolchain(), 'ColdFire binutils (m68k-elf-as, ld, nm, objcopy) unavailable')
class CardTrigMutedLink(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.work = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def links(self):
        return {name: link(units, self.work / name.replace(' ', '_').replace(',', '')) for name, units in CASES}

    def test_either_one_missing_changes_nothing_and_both_meet(self):
        got = self.links()
        for name, (image, symbols) in got.items():
            # The bystander is linked first: its code is the same in every case, and so is its data word.
            self.assertEqual(symbols['fx_other'], BASE, name)
            self.assertEqual(image[:4], bytes.fromhex('70074e75'), name)
            at = symbols['fx_word'] - BASE
            self.assertEqual(image[at:at + 4], bytes.fromhex('12345678'), name)
        self.assertNotIn(ANSWER, got['neither'][1])
        self.assertNotIn(ANSWER, got['asker alone'][1])
        # The asker alone loads 0: the branch skips the call and the answer is 0, as stock plays every trig.
        self.assertEqual(immediate(*got['asker alone'], 'fx_ask'), 0)
        # The answer alone is linked and called by nothing.
        self.assertIn(ANSWER, got['answerer alone'][1])
        self.assertNotIn('fx_ask', got['answerer alone'][1])
        # Together the ask calls the answer, in either link order.
        for name in ('both', 'both, answerer first'):
            image, symbols = got[name]
            self.assertEqual(immediate(image, symbols, 'fx_ask'), symbols[ANSWER], name)
        # The ask is the same code with or without the answer, but for the address it loads.
        alone, both = got['asker alone'], got['both']
        at, end = alone[1]['fx_ask'] - BASE, alone[1]['fx_ask'] - BASE + 20
        self.assertEqual(alone[0][at + 6:end], both[0][at + 6:end])

    def test_a_second_answer_is_refused(self):
        with self.assertRaises(SystemExit):
            link(('bystander', 'asker', 'answerer', 'answerer#2'), self.work / 'two')

    def test_the_configurator_fixture_is_current(self):
        self.assertTrue(FIXTURE.is_file(), 'run: python3 -B sdk/tests/test_card_trig_muted.py --write')
        self.assertEqual(json.loads(FIXTURE.read_text()), json.loads(json.dumps(fixture())),
                         'stale: python3 -B sdk/tests/test_card_trig_muted.py --write')


if __name__ == '__main__':
    if sys.argv[1:] == ['--write']:
        FIXTURE.write_text(json.dumps(fixture(), indent=1) + '\n')
        print(FIXTURE.relative_to(ROOT))
    else:
        unittest.main()
