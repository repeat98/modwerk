"""Run engine-scheduled previews against each retained-width stock Flex format.

Explicitly reserves eight audio pages with the pinned upstream arena helper.
Injects ORIGINAL test code into that reservation, calls its fixture initializer,
and uses the existing base-owned idle/job hook sites. No hardware, released base/module,
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
from boot_worker_native import tap, ARENA_SHA


from boot_source_native import call_original


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
    assert digest(repo / 'sdk/runtime/logging/stock-guards.json') == native['hookGuardSha256']
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
        channels, width = file.getnchannels(), file.getsampwidth()
        if channels not in (1, 2) or width not in (2, 3) or (file.getframerate(), file.getnframes()) != (44100, 44100):
            p.error('Expected a one-second mono/stereo 16/24-bit 44.1 kHz fixture.')
        raw = file.readframes(file.getnframes())
    bits = width * 8
    original = [int.from_bytes(raw[i:i+width], 'little', signed=True) for i in range(0, len(raw), width)]
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
        baseline = observe(port, bits, channels, original, before)
        assert baseline['outputBits'] == bits, 'The private project must retain the original width'
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
        assert call_original(port, symbols['bs_service_init']) == 0
        original_call = port.peek(0x40084854, 6)
        assert original_call[:2] == bytes.fromhex('4eb9') and int.from_bytes(original_call[2:], 'big') == 0x40000d00
        for name in ('idle', 'job'):
            site = native['hookSites'][name]
            import hashlib
            assert hashlib.sha256(port.peek(site['address'], 6)).hexdigest() == site['sha256']
            poke(site['address'], bytes.fromhex('4ef9') + symbols['bs_engine_' + name + '_entry'].to_bytes(4, 'big'))
        guard_at, boundary_at = symbols['bs_worker_test_guard'], symbols['bs_service_boundary']
        assert struct.unpack('>12I', port.peek(guard_at, 48))[2] == 0, 'Bootstrap admitted readers'
        port.command(f'watchmem {guard_at:#x} 48')
        port.command(f'watchmem {boundary_at+4:#x} 12')
        def native_state():
            g = struct.unpack('>12I', port.peek(guard_at, 48))
            b = struct.unpack('>4I', port.peek(boundary_at, 16))
            assert g[2:4] == (1, 0) and not any(g[4:]) and b[1:] == (0, 1, 0), 'Observer did not retire before queue wait'
            assert g[0] > 1 and b[0] == guard_at
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
        # Finish the editor-open waveform job before opening preview admission.
        port.command('run 1000')
        prepared = out / 'prepared'; prepared.mkdir()
        baseline = observe(port, bits, channels, original, prepared)
        assert call_original(port, symbols['bs_service_enable']) == 0
        assert port.peek(0x40084854, 6) == original_call
        assert symbols['wake_message'] != symbols['foreign_message']
        native_state()
        assert call_original(port, symbols['bs_boot_init']) == 0
        def call(name):
            return call_original(port, symbols[name])
        main_sp = call('bs_service_main_sp')
        def request_preview(tempo, snap, beats):
            poke(symbols['bs_service_request_fields'], struct.pack('>3I', tempo, snap, beats))
            return call('bs_service_request_mailbox')
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
                                     reader=lambda f: (values[channels*f] << (24-bits), values[channels*f+channels-1] << (24-bits)))
            expected = oracle.preview(request)
            before_queries, before_steps = word('bs_boot_queries'), word('bs_service_steps')
            before_wakes = word('bs_service_consumed')
            assert request_preview(tempo, snap, beats) == 0
            for turns in range(1000):
                port.command('run 1')
                state = word('bs_service_state')
                if state not in (0, 1, 2) and word('bs_service_steps') > before_steps:
                    break
            assert state == 3, f'engine preview ended {state}'
            steps = word('bs_service_steps') - before_steps
            wakes = word('bs_service_consumed') - before_wakes
            assert steps > 0 and wakes > 0 and word('bs_service_max_steps') <= 8
            # Drain the final posted no-op; no planner transition is invoked by
            # the driver. Read-only result validation happens after completion.
            port.command('run 1')
            assert call('bs_boot_result') == 1
            actual = struct.unpack('>131I', plan_bytes())
            want = (expected.count, expected.bpm24, *expected.starts, *expected.needs_fade, expected.end_needs_fade)
            assert actual == want, 'native plan differs from host PCM oracle'
            assert word('bs_boot_locks') == word('bs_boot_unlocks')
            native_state()
            result = {'tempoSource': tempo, 'snap': snap, 'beats': beats, 'steps': steps, 'engineWakes': wakes, 'driverStepCalls': 0,
                      'queries': word('bs_boot_queries')-before_queries,
                      'sampleBpm24': settings[69], 'projectBpm24': project,
                      'markerCount': actual[0], 'starts': list(actual[2:2+actual[0]]),
                      'wholePlanMatchesHostOracle': True, 'balancedLocks': True}
            assert result['queries'] > 0
            return result
        # Admission remains closed while an independent synthetic writer owns
        # a ticket. WAITING must not repost wakes or busy-poll the backend.
        assert call('bs_service_block_begin') > 0
        before_queries = word('bs_boot_queries')
        assert request_preview(0, 1, 1) == 0
        port.command('run 10')
        assert word('bs_service_state') == 2 and word('bs_boot_queries') == before_queries
        waiting_counts = (word('bs_service_steps'), word('bs_service_posted'), word('bs_service_consumed'))
        port.command('run 10')
        assert waiting_counts == (word('bs_service_steps'), word('bs_service_posted'), word('bs_service_consumed'))
        assert call('bs_service_block_end') == 0
        port.command('run 100')
        assert word('bs_service_state') == 3 and call('bs_boot_result') == 1
        assert call('bs_service_cancel') == 0
        port.command('run 10')
        assert word('bs_service_state') == 4
        # Cancel a pending request before it starts: no new PCM lookup.
        before_queries = word('bs_boot_queries')
        assert call('bs_service_request_cancel') == 0
        port.command('run 10')
        assert word('bs_service_state') == 4 and word('bs_boot_queries') == before_queries
        for tempo in (0, 1):
            for snap in (0, 1):
                for beats in (1, 4, 16, 32, 64):
                    results.append(preview(original, tempo, snap, beats))
        unchanged = out / 'previewed'; unchanged.mkdir()
        first = observe(port, bits, channels, original, unchanged)
        assert first == baseline, 'read-only previews changed source'
        print('PASS: twenty engine-scheduled previews from stock-loaded PCM and unchanged source', flush=True)
        # An unknown message with the same 0xff opcode must still invalidate.
        old_revision = native_state()[0]
        before_queries, before_plan = word('bs_boot_queries'), plan_bytes()
        ordinary = word('bs_service_ordinary')
        assert call('bs_service_foreign_wake') == 0
        port.command('run 10')
        assert native_state()[0] > old_revision and word('bs_service_ordinary') == ordinary+1
        assert call('bs_boot_result') == 0 and plan_bytes() == before_plan
        assert word('bs_boot_queries') == before_queries
        counters = {name: word('bs_service_' + name) for name in
                    ('calls', 'steps', 'posted', 'consumed', 'ordinary', 'cancelled', 'max_steps', 'ready')}
        assert counters['posted'] == counters['consumed'] and counters['max_steps'] <= 8
        assert port.peek(0x40084854, 6) == original_call
        assert call('bs_service_main_sp') == main_sp, 'Zero-argument mailbox calls changed main stack'
        port.command('watch off')
    finally:
        port.close()
        ffi.PlannerTests.tearDownClass()
    assert digest(card) == a.card_sha256 and digest(a.card) == a.card_sha256
    report = {'scope': 'private engine-scheduled read-only previews from stock-loaded Flex PCM; full scheduler/DSP boot, synthetic lifetime and partial worker ownership',
              'sourceSha256': {n: digest(ROOT / n) for n in ('boot_engine_formats.py', 'boot_source_native.py', 'boot_worker_native.py', 'boot_formats.py', 'boot_observe.py', 'inspect_stock.py', 'test_planner.py', *native['sourceSha256'].keys())},
              'mainSha256': STOCK_MAIN_SHA256, 'reservedMainSha256': digest(patched_main),
              'nativeReceiptSha256': digest(a.native / 'source-boot.json'), 'nativeBinarySha256': digest(binary),
              'arenaToolSha256': ARENA_SHA, 'reservedPages': 8, 'physicalUsablePages': pool_count,
              'observedMapEnd': map_end, 'nativeAddress': native['textBase'], 'emulatorSha256': digest(a.emulator),
              'cardSha256': a.card_sha256, 'wavSha256': digest(a.wav), 'loadedFormat': baseline, 'previews': results, 'serviceCounters': counters, 'mainStackPreserved': True,
              'waitingDoesNotPoll': True, 'readinessResumes': True, 'pendingCancellationNoReads': True,
              'foreignWakeInvalidates': True, 'receiveCallUnchanged': True, 'hookGuardSha256': native['hookGuardSha256'],
              'sourceUnchangedByPreviews': True,
              'cardUnchanged': True, 'exitCode': 0, 'hardware': 'not tested', 'audio': 'not qualified',
              'nativeOwnership': 'test-owned identities, full interrupt mask and partial command observer; live admission, recorder/UI coverage, cache and physical timing unqualified',
              'tempoLimit': 'reads observed runtime tempo only; pattern multiplier and external clock not qualified',
              'scheduling': 'private engine-owned service, at most eight explicit step calls plus optional begin/setup per idle event, exact immutable coalesced wake identity; no driver step calls. Not a released base service or measured physical budget'}
    (out / 'engine-format-boot.json').write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    main()
