"""Observe normal stock slicing confirmation and deletion on a private fixture.

No device, injected code, direct firmware call or card write-back. Both DSPs
and the stock scheduler run; memory comparisons occur while execution is paused.
These are stock workflow observations, not installed Beat Slicer qualification.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import struct
import wave

from boot_observe import Port, digest
from boot_formats import observe
from boot_writer import tap, hits, writes
from boot_static import matrix_tap
from inspect_stock import STOCK_MAIN_SHA256

ROOT = Path(__file__).resolve().parent
SETTINGS = (0x100d5b30, 0x100b14f0)
CONTROL = (0x46c90a78, 0x46c922c4)
CALLBACK = {'DELETE SLICE': 0x40072058, 'DELETE ALL SLICES': 0x40072004,
            'CREATE SLICE GRID': 0x40072cb8, '4 SLICES': 0x400739fc}
MENUS = {0x400ceb8c: (6, 0x400ceb74), 0x400cebc8: (9, 0x400ceba4),
         0x400cec34: (11, 0x400cec08)}


def word(port, address):
    return int.from_bytes(port.peek(address, 4), 'big')


def menu(port):
    labels = word(port, 0x460e5e2c)
    assert labels in MENUS, 'Unexpected stock menu label array'
    count, callbacks = MENUS[labels]
    assert word(port, 0x460e5e28) == callbacks, 'Unexpected menu callbacks'
    rows = []
    for index in range(count):
        address = word(port, labels + 4 * index)
        assert 0x40000400 <= address < 0x4010f000, 'Label outside private MAIN'
        name = port.peek(address, 64).split(b'\0', 1)[0].decode('ascii')
        rows.append(name)
    assert not any('UNDO' in name for name in rows), 'Unexpected stock Undo row'
    return rows


def choose(port, name):
    rows = menu(port)
    assert rows.count(name) == 1, 'Expected action absent/ambiguous'
    target = rows.index(name)
    for _ in range(len(rows)):
        selected = word(port, 0x460e5e40)
        assert selected < len(rows), 'Invalid menu selection'
        if selected == target:
            break
        tap(port, 'down' if selected < target else 'up')
    assert word(port, 0x460e5e40) == target, 'Menu did not reach action'
    assert word(port, word(port, 0x460e5e28) + 4 * target) == CALLBACK[name], 'Wrong action callback'
    tap(port, 'yes')


def records(settings):
    count = int.from_bytes(settings[1092:1096], 'big')
    assert count <= 64, 'Invalid slice count'
    return [settings[312 + 12*i:324 + 12*i] for i in range(count)]


def unchanged_attributes(before, after):
    assert before[:312] == after[:312] and before[1080:1092] == after[1080:1092], 'Slice action changed non-marker settings'


def exercise(port, kind, out, original):
    base = SETTINGS[kind]
    assert word(port, 0x46c8d1a0) == kind and word(port, 0x46c8d19c) == 0, 'Wrong editor source'
    matrix_tap(port, 0x24, 8)  # AMP / SLICE
    port.command('run 1000')
    other = port.peek(SETTINGS[1-kind], 1096)
    controls = port.peek(CONTROL[kind], 44)
    before = port.peek(base, 1096)
    port.command('watch 0x40071eb0,0x40073064,0x40073a68,0x40072e74,0x40070cbc,0x400718f8')
    port.command(f'watchmem {base+1092:#x} 4')
    writes(port)
    results = []

    def snapshot():
        value = port.peek(base, 1096)
        assert port.peek(CONTROL[kind], 44) == controls, 'Slice operation changed source controls'
        assert port.peek(SETTINGS[1-kind], 1096) == other, 'Slice operation changed other source settings'
        unchanged_attributes(before, value)
        return value

    def action(name):
        value = snapshot()
        tap(port, 'yes')
        choose(port, name)
        assert snapshot() == value, 'Opening confirmation changed markers'
        return value

    def record(name, extra=None):
        current = snapshot()
        trace, stores = hits(port), writes(port)
        item = {'action': name, 'markerCount': len(records(current)),
                'settingsSha256': hashlib.sha256(current).hexdigest(),
                'selectedRow': word(port, 0x400ceb3c),
                'watchedCallbackCount': len(trace),
                'countStores': [r[3] for r in stores if r[2] == base+1092]}
        if extra:
            item.update(extra)
        results.append(item)
        return current

    # Backing out of the count chooser does not create a grid.
    old = snapshot()
    tap(port, 'yes'); choose(port, 'CREATE SLICE GRID'); tap(port, 'no')
    assert snapshot() == old, 'Back from grid chooser changed markers'
    record('back-from-grid-chooser')

    for aligned in (False, True):
        old = snapshot()
        tap(port, 'yes'); choose(port, 'CREATE SLICE GRID'); choose(port, '4 SLICES')
        assert snapshot() == old, 'Zero-cross question already changed markers'
        tap(port, 'yes' if aligned else 'no'); port.command('run 1500')
        created = snapshot()
        assert len(records(created)) == 4, 'Grid not created after alignment choice'
        if not aligned:
            expected = [(44100*i//4, 44100*(i+1)//4, 0xffffffff) for i in range(4)]
            assert [struct.unpack('>3I', r) for r in records(created)] == expected, 'Unaligned grid positions differ'
        record('create-aligned' if aligned else 'create-unaligned', {'noMeansUnalignedNotCancel': not aligned})
        selected = word(port, 0x400ceb3c)
        assert selected < 4, 'No slice selected after grid creation'

        value = action('DELETE SLICE'); tap(port, 'no')
        assert snapshot() == value, 'Cancelled deletion changed markers'
        record('cancel-delete-one')
        value = action('DELETE SLICE'); selected = word(port, 0x400ceb3c)
        tap(port, 'yes'); port.command('run 1000')
        remaining = records(snapshot())
        assert remaining == records(value)[:selected] + records(value)[selected+1:], 'Single deletion did not preserve remaining records/order'
        record('delete-one', {'remainingRecordsExact': True, 'removedOrdinal': selected})

        value = action('DELETE ALL SLICES'); tap(port, 'no')
        assert snapshot() == value, 'Cancelled clear changed markers'
        record('cancel-clear-all')
        action('DELETE ALL SLICES'); tap(port, 'yes'); port.command('run 1000')
        assert not records(snapshot()), 'Clear left active slices'
        assert word(port, 0x400ceb3c) == 0xffffffff, 'Clear left a selected slice'
        record('clear-all', {'restoresPreviousGrid': False})

    # Repeating clear on an empty table must remain a stock operation.
    action('DELETE ALL SLICES'); tap(port, 'yes'); port.command('run 500')
    assert not records(snapshot()), 'Clearing empty table created markers'
    record('clear-empty')
    port.command('watch off')
    pcm_work = out / ('flex-after' if kind else 'static-after'); pcm_work.mkdir()
    flex = observe(port, 16, 2, original, pcm_work)
    return {'kind': 'Flex' if kind else 'Static', 'slot': 0, 'actions': results,
            'nonMarkerSettingsUnchanged': True, 'controlsUnchanged': True,
            'otherSourceSettingsUnchanged': True, 'flexPcmMatchesOriginal': True,
            'flexPcmSha256': flex['pcmSha256']}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ('emulator', 'main', 'card', 'wav', 'output'):
        p.add_argument('--'+name, type=Path, required=True)
    p.add_argument('--card-sha256', required=True)
    a = p.parse_args()
    if not __debug__:
        p.error('Assertions must remain enabled.')
    out, repo = a.output.resolve(), ROOT.parents[2]
    if out.exists() or out == repo or repo in out.parents:
        p.error('Use a fresh private output directory outside Git.')
    if digest(a.main) != STOCK_MAIN_SHA256 or digest(a.card) != a.card_sha256:
        p.error('Private stock/card identity differs.')
    with wave.open(str(a.wav), 'rb') as wav:
        if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate(), wav.getnframes()) != (2, 2, 44100, 44100):
            p.error('Expected the original one-second stereo 16-bit fixture.')
        original = list(struct.unpack('<88200h', wav.readframes(44100)))
    out.mkdir(parents=True)
    card = out / 'card.private.img'; shutil.copyfile(a.card, card)
    command = [str(a.emulator.resolve()), '--image', str(a.main.resolve()), '--card', str(card),
               '--mount', '--set', 'BEATLAB', '--project', 'PROJECT 261023', '--load-ms', '90000',
               '--dsp', '--frame', '--ms', '3000', '--interactive', '--main-level', 'off', '--rtc', 'host', '--mkii',
               '--lcd', str(out / 'lcd.private.bin')]
    port = Port(command, out)
    results = []
    try:
        port.reply(b'ready ', timeout=600)
        assert port.loaded, 'LOAD PROJECT incomplete'
        before = out / 'before'; before.mkdir()
        observe(port, 16, 2, original, before)
        for key in ('aed', 'edit', 'no', 'playback', 'playback', 'yes', 'no'):
            tap(port, key)
        port.command('key 0x26 8'); port.command('run 60'); tap(port, 'track1')
        port.command('key 0x26 0'); port.command('run 60'); tap(port, 'aed')
        results.append(exercise(port, 1, out, original))
        tap(port, 'no'); tap(port, 'track1'); tap(port, 'track1')
        matrix_tap(port, 0x26, 0x10); tap(port, 'up'); matrix_tap(port, 0x24, 2)
        for _ in range(3): tap(port, 'yes')
        port.command('run 1000')
        tap(port, 'yes'); tap(port, 'no'); tap(port, 'aed'); port.command('run 1000')
        results.append(exercise(port, 0, out, original))
    finally:
        port.close()
    assert digest(card) == a.card_sha256 and digest(a.card) == a.card_sha256, 'Private card changed'
    names = ('boot_slices.py', 'boot_static.py', 'boot_writer.py', 'boot_formats.py', 'boot_observe.py', 'inspect_stock.py')
    report = {'scope': 'normal stock Flex/Static slicing choices and confirmed/cancelled deletion; no Beat Slicer UI or hardware',
              'sourceSha256': {n: digest(ROOT/n) for n in names},
              'mainSha256': STOCK_MAIN_SHA256, 'emulatorSha256': digest(a.emulator),
              'cardSha256': a.card_sha256, 'wavSha256': digest(a.wav), 'results': results,
              'exitCode': 0, 'cardUnchanged': True, 'hardware': 'not tested',
              'audio': 'not qualified', 'persistence': 'not tested; card write-back disabled'}
    (out/'slices.json').write_text(json.dumps(report, indent=2)+'\n')
    print('PASS: stock Flex/Static grid choices, cancel, individual/all-slice deletion and unchanged Flex PCM/card', flush=True)


if __name__ == '__main__':
    main()
