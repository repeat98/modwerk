"""Run the compiled command observer in a private full-boot stock emulator.

Explicitly reserves three audio pages with the pinned upstream arena helper.
Injects ORIGINAL test code into that reservation, calls its fixture initializer,
and changes one private queue-call operand. No hardware, released base/module,
source reader, card writes, cache proof or complete writer coverage is claimed.
"""
import argparse
import json
import importlib.util
import sys
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
ARENA_SHA = '23c89015c010ce9d4e6e7957f9325b7da78b7ba75144de10d56cb22149f21e61'
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
    for name in ('emulator', 'main', 'card', 'wav', 'output', 'arena-tool', 'native'):
        p.add_argument('--' + name, type=Path, required=True)
    p.add_argument('--card-sha256', required=True)
    p.add_argument('--allow-private-injection', action='store_true', required=True)
    a = p.parse_args()
    if not __debug__:
        p.error('Assertions must remain enabled.')
    out, repo = a.output.resolve(), ROOT.parents[2]
    if out.exists() or out == repo or repo in out.parents:
        p.error('Use a fresh private output directory outside Git.')
    if digest(a.main) != STOCK_MAIN_SHA256 or digest(a.card) != a.card_sha256:
        p.error('Private stock/card identity differs.')
    if digest(a.arena_tool) != ARENA_SHA:
        p.error('Arena helper differs from reviewed upstream source.')
    native = json.loads((a.native / 'worker.json').read_text())
    binary, symbols_path = a.native / 'worker.bin', a.native / 'worker.symbols'
    if native['exitCode'] or native['textBase'] != 0x460215f0 or digest(binary) != native['binarySha256'] or digest(symbols_path) != native['symbolsSha256']:
        p.error('Compile and test the exact reserved-placement fixture first.')
    for name, expected in native['sourceSha256'].items():
        if digest(ROOT / name) != expected:
            p.error('Native evidence source differs: ' + name)
    symbols = {row.split()[2]: int(row.split()[0], 16) for row in symbols_path.read_text().splitlines()}
    spec = importlib.util.spec_from_file_location('beat_slicer_arena', a.arena_tool)
    arena = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = arena
    spec.loader.exec_module(arena)
    placed, pool_base, pool_count = arena.layout([('worker-observer-fixture', 'top', 3)])
    reserve = placed[0]
    assert reserve.start + 16 == native['textBase'] and symbols['_end'] <= reserve.end
    assert pool_base == 0x40a955e0 and pool_count == 14599
    private_main = bytearray(a.main.read_bytes())
    for address, expected, value, _ in arena.pokes([('worker-observer-fixture', 'top', 3)]):
        at = address - 0x40000400
        assert private_main[at:at+len(expected)] == expected
        private_main[at:at+len(value)] = value
    with wave.open(str(a.wav), 'rb') as file:
        if (file.getnchannels(), file.getsampwidth(), file.getframerate(), file.getnframes()) != (2, 2, 44100, 44100):
            p.error('Expected the original one-second stereo 16-bit 44.1 kHz fixture.')
        raw = file.readframes(file.getnframes())
    original = list(struct.unpack('<' + 'h' * (len(raw) // 2), raw))
    out.mkdir(parents=True)
    patched_main = out / 'reserved-main.private.bin'
    patched_main.write_bytes(private_main)
    card = out / 'card.private.img'
    shutil.copyfile(a.card, card)
    command = [str(a.emulator.resolve()), '--image', str(patched_main), '--card', str(card),
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
        # This mutable map boundary also excludes stock recorder reservations;
        # it is not the cold physical page count. Verify the actual patched
        # geometry operands, and keep the current boundary within that pool.
        map_end = int.from_bytes(port.peek(0x80006920, 4), 'big')
        assert 0 < map_end <= pool_count
        for address, _, value, _ in arena.pokes([('worker-observer-fixture', 'top', 3)]):
            assert port.peek(address, len(value)) == value
        # The first 16 bytes deliberately stay outside code: stock's known
        # aligned clear can write one long beyond the reduced arena's end.
        data = binary.read_bytes()
        assert symbols['bs_guard_init'] == native['textBase'] and len(data) < symbols['__bss_start'] - native['textBase'] + 1
        def poke(address, value):
            for at in range(0, len(value), 4096):
                port.command(f'poke {address+at:#x} ' + value[at:at+4096].hex())
        poke(reserve.start, bytes([0xa5]) * (reserve.end-reserve.start))
        poke(native['textBase'], data)
        poke(symbols['__bss_start'], bytes(symbols['_end']-symbols['__bss_start']))
        assert port.command(f"call {symbols['bs_worker_test_init']:#x}") == 'ok d0=0'
        original_call = port.peek(0x40084854, 6)
        assert original_call[:2] == bytes.fromhex('4eb9') and int.from_bytes(original_call[2:], 'big') == 0x40000d00
        poke(0x40084856, symbols['bs_worker_test_entry'].to_bytes(4, 'big'))
        guard_at, boundary_at = symbols['bs_worker_test_guard'], symbols['bs_worker_test_boundary']
        port.command(f'watchmem {guard_at:#x} 48')
        port.command(f'watchmem {boundary_at+20:#x} 12')
        def native_state():
            g = struct.unpack('>12I', port.peek(guard_at, 48))
            b = struct.unpack('>8I', port.peek(boundary_at, 32))
            assert g[2:4] == (1, 0) and not any(g[4:]) and b[5:] == (0, 1, 0), 'Observer did not retire before queue wait'
            assert g[0] > 1 and b[0] == guard_at and b[1] == 0x40000d00
            for at in range(0, len(data), 4096):
                assert port.peek(native['textBase']+at, min(4096, len(data)-at)) == data[at:at+4096], 'Original observer code overwritten'
            assert port.peek(reserve.start, 16) == bytes([0xa5])*16
            assert port.peek(symbols['_end'], 32) == bytes([0xa5])*32
            return g[0], g[1]

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
        initial_revision, initial_serial = native_state()
        writes(port)
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
            # Record native exclusion, not a host guard: the guard's writer
            # word is set before the dirty store and cleared on the next receive.
            active = 0
            dirty_seen = 0
            tracked_commands = 0
            for event in stores:
                if event[2] == guard_at + 16:
                    active = event[3]
                    tracked_commands += bool(active)
                if event[2] == 0x46c93c28:
                    assert active, 'PCM writer started outside native command exclusion'
                    dirty_seen += 1
            assert dirty_seen == 1 and tracked_commands >= 2 and not active
            revision, serial = native_state()
            assert revision > initial_revision and serial > initial_serial
            initial_revision, initial_serial = revision, serial
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
            observation.update({'pass': index, 'nativeTrackedCommands': tracked_commands, 'nativeRevision': revision, 'nativeSerial': serial, 'nativeGuardCoveredDirtyStore': True, 'nativeCodeAndCanariesIntact': True, 'preEditWaveformCompletions': prefix // 2, 'inclusiveEndpointModelMatches': True,
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
    report = {'scope': 'private reserved-memory native worker observer across full-boot stock reverse and waveform commands; real scheduler/DSPs, no source reader or device',
              'sourceSha256': {n: digest(ROOT / n) for n in ('boot_worker_native.py', 'boot_writer.py', 'boot_formats.py', 'boot_observe.py', 'inspect_stock.py', *native['sourceSha256'].keys())},
              'mainSha256': STOCK_MAIN_SHA256, 'reservedMainSha256': digest(patched_main), 'nativeReceiptSha256': digest(a.native / 'worker.json'), 'nativeBinarySha256': digest(binary), 'arenaToolSha256': ARENA_SHA, 'reservedPages': 3, 'physicalUsablePages': pool_count, 'observedMapEnd': map_end, 'nativeAddress': native['textBase'], 'emulatorSha256': digest(a.emulator),
              'cardSha256': a.card_sha256, 'wavSha256': digest(a.wav), 'results': results,
              'cardUnchanged': True, 'exitCode': 0, 'hardware': 'not tested', 'audio': 'not qualified',
              'nativeOwnership': 'partial command observer only; recorder, metadata/UI writers, admission/bootstrap, cache and physical timing remain unqualified'}
    (out / 'worker-boot.json').write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    main()
