"""Verify compiled preview invalidation through normal stock slice editing.

Explicitly reserves eight audio pages with the pinned upstream arena helper.
Injects ORIGINAL test code into that reservation, calls its fixture initializer,
and changes one private queue-call operand. No hardware, released base/module,
installed source service, card writes, cache proof or complete writer coverage is claimed.
"""
import argparse
import test_planner as ffi
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
from boot_worker_native import tap, allocated_end_frame, ARENA_SHA


from boot_source_native import call_original
from boot_slices import choose, unchanged_attributes


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
    native = json.loads((a.native / 'source-boot.json').read_text())
    binary, symbols_path = a.native / 'source-boot.bin', a.native / 'source-boot.symbols'
    if native['textBase'] != 0x46019df0 or digest(binary) != native['binarySha256'] or digest(symbols_path) != native['symbolsSha256']:
        p.error('Compile the exact reserved-placement fixture first.')
    for name, expected in native['sourceSha256'].items():
        if digest(ROOT / name) != expected:
            p.error('Native evidence source differs: ' + name)
    symbols = {row.split()[2]: int(row.split()[0], 16) for row in symbols_path.read_text().splitlines()}
    spec = importlib.util.spec_from_file_location('beat_slicer_arena', a.arena_tool)
    arena = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = arena
    spec.loader.exec_module(arena)
    placed, pool_base, pool_count = arena.layout([('source-preview-fixture', 'top', 8)])
    reserve = placed[0]
    assert reserve.start + 16 == native['textBase'] and symbols['_end'] <= reserve.end
    assert pool_base == 0x40a955e0 and pool_count == 14594
    private_main = bytearray(a.main.read_bytes())
    for address, expected, value, _ in arena.pokes([('source-preview-fixture', 'top', 8)]):
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
    ffi.PlannerTests.setUpClass()
    oracle = ffi.PlannerTests()
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
        for address, _, value, _ in arena.pokes([('source-preview-fixture', 'top', 8)]):
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
        assert call_original(port, symbols['bs_worker_test_init']) == 0
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
        port.command('key 0x24 8'); port.command('run 60')
        port.command('key 0x24 0'); port.command('run 1000')
        prepared = out / 'prepared'; prepared.mkdir()
        baseline = observe(port, 16, 2, original, prepared)
        native_state()
        assert call_original(port, symbols['bs_boot_init']) == 0
        def call(name, *args):
            return call_original(port, symbols[name], *args)
        def word(name):
            return int.from_bytes(port.peek(symbols[name], 4), 'big')
        def plan_bytes():
            return port.peek(symbols['bs_boot_plan'], 524)
        def preview(values, tempo, snap, beats):
            settings = struct.unpack('>274I', port.peek(0x100b14f0, 1096))
            project = int.from_bytes(port.peek(0x80001814, 4), 'big')
            request = oracle.request(existing=[settings[78+3*i] for i in range(settings[273])],
                                     trim_start=settings[75], trim_end=settings[76],
                                     sample_bpm24=settings[69], project_bpm24=project,
                                     tempo_source=tempo, snap=snap, beats=beats,
                                     reader=lambda f: (values[2*f]*256, values[2*f+1]*256))
            expected = oracle.preview(request)
            assert call('bs_boot_begin', tempo, snap, beats) == 1
            before_queries = word('bs_boot_queries')
            state = 1
            for steps in range(30000):
                state = call('bs_boot_step')
                if state not in (1, 2):
                    break
                if steps % 32 == 0:
                    port.command('run 1')
            assert state == 3, f'preview ended {state}'
            assert call('bs_boot_result') == 1
            actual = struct.unpack('>131I', plan_bytes())
            want = (expected.count, expected.bpm24, *expected.starts, *expected.needs_fade, expected.end_needs_fade)
            assert actual == want, 'native plan differs from host PCM oracle'
            assert word('bs_boot_locks') == word('bs_boot_unlocks')
            native_state()
            result = {'tempoSource': tempo, 'snap': snap, 'beats': beats, 'steps': steps+1,
                      'queries': word('bs_boot_queries')-before_queries,
                      'sampleBpm24': settings[69], 'projectBpm24': project,
                      'markerCount': actual[0], 'starts': list(actual[2:2+actual[0]]),
                      'wholePlanMatchesHostOracle': True, 'balancedLocks': True}
            assert result['queries'] > 0
            return result
        for tempo in (0, 1):
            for snap in (0, 1): results.append(preview(original, tempo, snap, 1))
        invalidations = []
        static_before = port.peek(0x100d5b30, 1096)
        actions = (('DELETE SLICE', 'RUNNING', 3), ('DELETE ALL SLICES', 'READY', 0),
                   ('CREATE UNALIGNED GRID', 'RUNNING', 4), ('CREATE ALIGNED GRID', 'READY', 4))
        assert int.from_bytes(port.peek(0x100b14f0+1092, 4), 'big') == 4
        for index, (action, prior_state, count) in enumerate(actions):
            if prior_state == 'RUNNING':
                assert call('bs_boot_begin', 0, 1, 1) == 1
                for _ in range(5): assert call('bs_boot_step') == 1
            before_queries, before_plan = word('bs_boot_queries'), plan_bytes()
            before_revision = native_state()[0]
            before_settings = port.peek(0x100b14f0, 1096)
            tap(port, 'yes')
            if index < 2:
                choose(port, action); tap(port, 'yes')
            else:
                choose(port, 'CREATE SLICE GRID'); choose(port, '4 SLICES')
                tap(port, 'no' if index == 2 else 'yes')
            port.command('run 1500')
            after_revision = native_state()[0]
            after_settings = port.peek(0x100b14f0, 1096)
            assert int.from_bytes(after_settings[1092:1096], 'big') == count
            assert after_settings != before_settings, 'Stock action did not change marker state'
            unchanged_attributes(before_settings, after_settings)
            assert port.peek(0x100d5b30, 1096) == static_before, 'Flex edit changed Static settings'
            assert call('bs_boot_result') == 0 and plan_bytes() == before_plan
            assert call('bs_boot_step') == 5 and word('bs_boot_queries') == before_queries
            work = out / f'action-{index}'; work.mkdir()
            observation = observe(port, 16, 2, original, work)
            assert observation['controlsSha256'] == baseline['controlsSha256']
            invalidations.append({'action': action, 'priorState': prior_state, 'newMarkerCount': count,
                                  'staleBeforeFurtherCopy': True, 'resultOutputUntouched': True,
                                  'guardRevisionAdvanced': after_revision != before_revision,
                                  'completeMarkerStateChanged': True, 'otherSourceSettingsUnchanged': True,
                                  'nonMarkerAttributesAndPcmUnchanged': True})
            for tempo in (0, 1):
                for snap in (0, 1): results.append(preview(original, tempo, snap, 1))
            post = out / f'previewed-{index}'; post.mkdir()
            assert observe(port, 16, 2, original, post) == observation
            print(f'PASS: {action} invalidates {prior_state}; fresh previews preserve new stock markers', flush=True)
        port.command('watch off')
    finally:
        port.close()
        ffi.PlannerTests.tearDownClass()
    assert digest(card) == a.card_sha256 and digest(a.card) == a.card_sha256
    report = {'scope': 'compiled previews across normal stock slice deletion, clearing and grid creation in a private full boot; synthetic lifetimes and partial ownership',
              'sourceSha256': {n: digest(ROOT / n) for n in ('boot_source_slices.py', 'boot_source_native.py', 'boot_slices.py', 'boot_writer.py', 'boot_static.py', 'boot_worker_native.py', 'boot_formats.py', 'boot_observe.py', 'inspect_stock.py', 'test_planner.py', *native['sourceSha256'].keys())},
              'mainSha256': STOCK_MAIN_SHA256, 'reservedMainSha256': digest(patched_main),
              'nativeReceiptSha256': digest(a.native / 'source-boot.json'), 'nativeBinarySha256': digest(binary),
              'arenaToolSha256': ARENA_SHA, 'reservedPages': 8, 'physicalUsablePages': pool_count,
              'observedMapEnd': map_end, 'nativeAddress': native['textBase'], 'emulatorSha256': digest(a.emulator),
              'cardSha256': a.card_sha256, 'wavSha256': digest(a.wav), 'previews': results, 'invalidations': invalidations,
              'sourceUnchangedByPreviews': True, 'pcmUnchangedByStockSliceActions': True,
              'cardUnchanged': True, 'exitCode': 0, 'hardware': 'not tested', 'audio': 'not qualified',
              'nativeOwnership': 'test-owned identities, full interrupt mask and partial command observer; live admission, recorder/UI coverage, cache and physical timing unqualified',
              'tempoLimit': 'reads observed runtime tempo only; pattern multiplier and external clock not qualified',
              'scheduling': 'individual bounded native calls from emulator driver, with stock frame runs between groups; no installed idle service'}
    (out / 'source-slices-boot.json').write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    main()
