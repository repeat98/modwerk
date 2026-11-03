"""Observe stock panel-to-worker reverse writer lifecycle on a private disposable project.

No device, firmware injection, direct native calls or card write-back. This
research probe is specific to the hash-bound BEATLAB fixture and 1.40C MKII
panel. It runs normal stock UI/worker scheduling, not a Beat Slicer service.
"""
import argparse
import json
from pathlib import Path
import shutil
import struct
import wave
from boot_observe import Port, digest
from boot_formats import observe
from inspect_stock import STOCK_MAIN_SHA256

ROOT = Path(__file__).resolve().parent
KEYS = {'aed': (0x23, 0x40), 'edit': (0x24, 0x10), 'playback': (0x24, 4),
        'yes': (0x26, 2), 'no': (0x26, 4), 'down': (0x24, 1),
        'up': (0x26, 8), 'track1': (0x22, 1)}
WATCH = (0x40095268, 0x4008594c, 0x40084110, 0x40075564, 0x40077a5c)


def tap(port, name):
    row, mask = KEYS[name]
    port.command(f'key {row:#x} {mask:#x}')
    port.command('run 60')
    port.command(f'key {row:#x} 0')
    port.command('run 60')


def hits(port):
    parts = port.command('hits', b'hits ').split()
    rows = [[int(x, 16) for x in row.split(':')] for row in parts[2:]]
    assert len(rows) == int(parts[1].split('=')[1]) and all(len(r) == 23 for r in rows)
    return rows


def writes(port):
    parts = port.command('writes', b'writes ').split()
    rows = []
    for row in parts[2:]:
        x = row.split(':')
        assert len(x) == 6
        rows.append((float(x[0]), int(x[1], 16), int(x[2], 16), int(x[3], 16), int(x[4]), int(x[5], 16)))
    assert len(rows) == int(parts[1].split('=')[1])
    return rows


def allocated_end_frame(port):
    # Research-only inspection of one frame beyond the logical source extent,
    # still inside its last allocated page. Never expose this through a reader
    # service: module reads remain bounded by the logical frame count.
    def word(address):
        return int.from_bytes(port.peek(address, 4), 'big')
    pages, offsets, used, total = struct.unpack('>4I', port.peek(0x80006914, 16))
    assert (pages, offsets) == (0x46c2e9c0, 0x46c2e580) and 0 < used <= total <= 14602
    count = int.from_bytes(port.peek(0x46c75e88, 2), 'big')
    offset, frame = word(offsets), word(0x46c922c4 + 16)
    assert frame == 44100 and frame // 1536 < count and offset + count <= used
    page = int.from_bytes(port.peek(pages + 2 * (offset + frame // 1536), 2), 'big')
    assert page < 14602
    return port.peek(0x40a955e0 + page * 6144 + 4 * (frame % 1536), 4)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ('emulator', 'main', 'card', 'wav', 'output'):
        p.add_argument('--' + name, type=Path, required=True)
    p.add_argument('--card-sha256', required=True)
    a = p.parse_args()
    if not __debug__:
        p.error('Assertions must remain enabled.')
    out, repo = a.output.resolve(), ROOT.parents[2]
    if out.exists() or out == repo or repo in out.parents:
        p.error('Use a fresh private output directory outside Git.')
    if digest(a.main) != STOCK_MAIN_SHA256 or digest(a.card) != a.card_sha256:
        p.error('Private stock/card identity differs.')
    with wave.open(str(a.wav), 'rb') as file:
        if (file.getnchannels(), file.getsampwidth(), file.getframerate(), file.getnframes()) != (2, 2, 44100, 44100):
            p.error('Expected the original one-second stereo 16-bit 44.1 kHz fixture.')
        raw = file.readframes(file.getnframes())
    original = list(struct.unpack('<' + 'h' * (len(raw) // 2), raw))
    out.mkdir(parents=True)
    card = out / 'card.private.img'
    shutil.copyfile(a.card, card)
    command = [str(a.emulator.resolve()), '--image', str(a.main.resolve()), '--card', str(card),
               '--mount', '--set', 'BEATLAB', '--project', 'PROJECT 261023', '--load-ms', '90000',
               '--dsp', '--frame', '--ms', '3000', '--interactive', '--main-level', 'off', '--rtc', 'host', '--mkii',
               '--lcd', str(out / 'lcd.private.bin')]
    port = Port(command, out)
    results = []
    try:
        port.reply(b'ready ', timeout=600)
        assert port.loaded, 'LOAD PROJECT did not finish'
        before = out / 'before'; before.mkdir()
        baseline = observe(port, 16, 2, original, before)
        # Reproduce the observed panel path from this saved fixture. Its first
        # editor initially selects an empty Static source despite the populated
        # Flex pool. Explicit source assignment refreshes that editor binding.
        for key in ('aed', 'edit', 'no', 'playback', 'playback', 'yes', 'no'):
            tap(port, key)
        port.command('key 0x26 8'); port.command('run 60')
        tap(port, 'track1')
        port.command('key 0x26 0'); port.command('run 60')
        for key in ('aed', 'edit'):
            tap(port, key)
        assert int.from_bytes(port.peek(0x46c8d1a0, 4), 'big') == 1, 'editor is not Flex'
        assert int.from_bytes(port.peek(0x46c8d19c, 4), 'big') == 0, 'editor is not slot 0'
        # YES opens the scrollable action list; SELECT ALL is initially first.
        tap(port, 'yes'); tap(port, 'yes')
        # Finish the editor-open waveform job before measuring a new edit; its
        # separate completion is not part of the reverse transaction.
        port.command('run 1000')
        prepared = out / 'prepared'; prepared.mkdir()
        baseline = observe(port, 16, 2, original, prepared)
        tail = allocated_end_frame(port)
        extended = original + list(struct.unpack('>hh', tail))
        reversed_extended = [v for i in range(44100, -1, -1) for v in extended[2*i:2*i+2]]
        port.command('watch ' + ','.join(hex(x) for x in WATCH))
        # These globals are in the cached 0x46... window in this exact emulator;
        # a guessed 0x86... watch silently observes no writes.
        port.command('watchmem 0x460e6bcc 4')
        port.command('watchmem 0x46c93c28 1')
        for index, extended_expected in enumerate((reversed_extended, extended)):
            expected = extended_expected[:88200]
            work = out / str(index); work.mkdir()
            tap(port, 'yes')
            if index == 0:
                for _ in range(4):
                    tap(port, 'down')
            # Check the actual native row/callback before confirming; this
            # fixture must not silently exercise a different menu operation.
            selected = int.from_bytes(port.peek(0x460e5e40, 4), 'big')
            callbacks = int.from_bytes(port.peek(0x460e5e28, 4), 'big')
            assert selected == 4 and 0x40000400 <= callbacks <= 0x4010f000, 'Wrong edit menu row/table'
            assert int.from_bytes(port.peek(callbacks + 4 * selected, 4), 'big') == 0x40075170, 'Not the reverse action'
            # The stock action list retains REVERSE SELECTION for the repeat.
            tap(port, 'yes')
            port.command('run 1000')
            trace, stores = hits(port), writes(port)
            pcs = [r[1] for r in trace]
            # Menu/range redraw can finish a separate waveform job before the
            # reverse begins. Classify that exact pair rather than attributing
            # it to the edit or weakening the edit's own completion sequence.
            prefix = pcs.index(WATCH[0])
            assert prefix in (0, 2), 'Unexpected pre-edit activity'
            if prefix:
                assert pcs[:2] == [WATCH[2], WATCH[4]] and trace[0][8] == WATCH[4] and trace[1][8] == 1
            trace, pcs = trace[prefix:], pcs[prefix:]
            assert pcs == [WATCH[0], WATCH[1], WATCH[2], WATCH[3], WATCH[2], WATCH[4]], 'worker/UI completion order differs'
            assert trace[0][8:11] == [0, 0, 44100], 'reverse slot/range differs'
            assert trace[1][2] == 1, 'stock reverse failed'
            assert trace[2][8] == WATCH[3] and trace[4][8] == WATCH[4], 'completion callbacks differ'
            assert trace[3][8] == 1 and trace[5][8] == 1, 'UI completion result differs'
            busy = [r for r in stores if r[2] == 0x460e6bcc]
            dirty = [r for r in stores if r[2] == 0x46c93c28]
            assert len(busy) == 2 and [r[3] for r in busy] == [1, 0] and all(r[4] == 4 for r in busy)
            assert len(dirty) == 1 and dirty[0][3:5] == (255, 1)
            assert busy[0][5] == busy[1][5] and dirty[0][5] != busy[0][5], 'UI/engine task identities not distinct'
            assert busy[1][1] == WATCH[3] and busy[0][0] <= dirty[0][0] <= busy[1][0]
            assert int.from_bytes(port.peek(0x460e6bcc, 4), 'big') == 0, 'editor remains busy'
            observation = observe(port, 16, 2, expected, work)
            assert allocated_end_frame(port) == struct.pack('>hh', *extended_expected[88200:]), 'Allocated end frame differs'
            assert observation['settingsSha256'] == baseline['settingsSha256'], 'edit changed sample settings'
            assert observation['controlsSha256'] == baseline['controlsSha256'], 'edit changed source controls'
            observation.update({'pass': index, 'preEditWaveformCompletions': prefix // 2, 'inclusiveEndpointModelMatches': True,
                                'logicalFrames': 44100, 'selectedEndArgument': 44100,
                                'extraAllocatedFrameIncluded': True,
                                'ordinaryFrameReversalQualified': False,
                                'workerReturnedBeforeCompletion': True, 'actualUiCallbackConsumed': True,
                                'waveformCompletionConsumed': True, 'busySequence': [1, 0],
                                'dirtyStoreCount': len(dirty), 'uiAndEngineTasksDistinct': True,
                                'settingsAndControlsUnchanged': True})
            results.append(observation)
            print(f'PASS reverse {index+1}: inclusive endpoint model, worker/UI completion and unchanged prepared metadata', flush=True)
        port.command('watch off')
    finally:
        port.close()
    assert digest(card) == a.card_sha256 and digest(a.card) == a.card_sha256
    report = {'scope': 'full stock reverse lifecycle with observed inclusive end argument and exact second-reversal restoration; not ordinary exclusive-end reversal, Beat Slicer or device',
              'sourceSha256': {n: digest(ROOT / n) for n in ('boot_writer.py', 'boot_formats.py', 'boot_observe.py', 'inspect_stock.py')},
              'mainSha256': STOCK_MAIN_SHA256, 'emulatorSha256': digest(a.emulator),
              'cardSha256': a.card_sha256, 'wavSha256': digest(a.wav), 'results': results,
              'cardUnchanged': True, 'exitCode': 0, 'hardware': 'not tested', 'audio': 'not qualified',
              'nativeOwnership': 'not implemented; stock scheduling during edit, paused PCM observations'}
    (out / 'writer.json').write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    main()
