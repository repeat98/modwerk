"""Measure full-boot copied UI/engine previews on authored one- or thirty-second samples.

Explicitly reserves eight audio pages with the pinned upstream arena helper.
Injects ORIGINAL test code into that reservation, calls its fixture initializer,
and uses the existing base-owned engine and UI-tick hook topology. No hardware, released base/module,
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
from stock_tempo import set_project_tempo, runtime_tempo

ROOT = Path(__file__).resolve().parent
from boot_worker_native import tap, allocated_end_frame, ARENA_SHA, writes


from boot_source_native import call_original
from boot_slices import choose, MENUS, menu as stock_menu


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ('emulator', 'main', 'card', 'wav', 'output', 'arena-tool', 'native'):
        p.add_argument('--' + name, type=Path, required=True)
    p.add_argument('--card-sha256', required=True)
    p.add_argument('--expected-frames', type=int, choices=(44100,1323000), default=44100)
    p.add_argument('--scenario', choices=('controls', 'cancel', 'owner', 'conservative', 'recording'), default='controls')
    p.add_argument('--selected', action='store_true')
    p.add_argument('--project-bpm',type=int,choices=range(30,301))
    p.add_argument('--allow-private-waveform-reads', action='store_true', help='Fixed-input private classification only; mutable queued-record lifetime is not qualified')
    p.add_argument('--allow-private-injection', action='store_true', required=True)
    a = p.parse_args()
    wait_ms = 5
    def call_native(address):
        return call_original(port, address, wait_ms=wait_ms)
    if a.scenario == 'conservative' and a.allow_private_waveform_reads:
        p.error('The conservative boundary scenario must not exempt waveform reads.')
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
    if a.scenario=='recording' and not native.get('recorderComposition'):p.error('Compile the recorder/resident composition first.')
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
        if (file.getnchannels(), file.getsampwidth(), file.getframerate(), file.getnframes()) != (2, 2, 44100, a.expected_frames):
            p.error('Expected an authored stereo 16-bit 44.1 kHz fixture with the exact requested frame count.')
        raw = file.readframes(file.getnframes())
    original = [v[0] for v in struct.iter_unpack('<h', raw)]
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
        tempo_change = set_project_tempo(port,a.project_bpm) if a.project_bpm is not None else None
        prepared_project_bpm24 = runtime_tempo(port)
        before = out / 'before'; before.mkdir()
        baseline = observe(port, 16, 2, original, before)
        initial_settings = struct.unpack('>274I', port.peek(0x100b14f0, 1096))
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
        assert call_native(symbols['bs_engine_test_init']) == 0
        original_call = port.peek(0x40084854, 6)
        assert original_call[:2] == bytes.fromhex('4eb9') and int.from_bytes(original_call[2:], 'big') == 0x40000d00
        for name in ('idle', 'job'):
            site = native['hookSites'][name]
            import hashlib
            assert hashlib.sha256(port.peek(site['address'], 6)).hexdigest() == site['sha256']
            poke(site['address'], bytes.fromhex('4ef9') + symbols[('bs_recorder_engine_' if native.get('recorderComposition') else 'bs_engine_') + name + '_entry'].to_bytes(4, 'big'))
        if native.get('recorderComposition'):
            for group,prefix in (('recorderHookSites','bs_recorder_'),('preparationHookSites','bs_recorder_prepare_')):
                for name,site in native[group].items():
                    assert hashlib.sha256(port.peek(site['address'],site['length'])).hexdigest()==site['sha256']
                    patch=bytes.fromhex('4ef9')+symbols[prefix+name+'_entry'].to_bytes(4,'big')+bytes.fromhex('4e71')
                    assert len(patch)==site['length'];poke(site['address'],patch)
        guard_at, boundary_at = symbols['bs_worker_test_guard'], symbols['bs_engine_test_boundary']
        assert struct.unpack('>12I', port.peek(guard_at, 48))[2] == 0, 'Bootstrap admitted readers'
        port.command(f'watchmem {guard_at:#x} 48')
        port.command(f'watchmem {boundary_at+4:#x} 12')
        checkpoints={'retries':0,'emptyScopeUnbalancedDiagnostics':0,'maxRetries':0}
        def native_state():
            for _ in range(200):
                g = struct.unpack('>12I', port.peek(guard_at, 48))
                b = struct.unpack('>4I', port.peek(boundary_at, 16))
                if native.get('recorderComposition'):
                    recorder=struct.unpack('>19I',port.peek(symbols['bs_recorder_test_boundary'],76))
                    assert recorder[0]==b[0]==guard_at and not recorder[2] and not b[3] and not g[3], 'Native observer fault'
                    empty=not recorder[1] and not b[1] and not any(g[4:])
                    balanced=True
                    for prefix in ('bs_recorder_test_','bs_recorder_prepare_'):
                        counts=[int.from_bytes(port.peek(symbols[prefix+suffix],4),'big') for suffix in ('entries','exits')]
                        masks=[int.from_bytes(port.peek(symbols[prefix+suffix+'_masks'],4),'big') for suffix in ('enter','leave')]
                        balanced=balanced and counts[0]==counts[1] and masks[0]==masks[1]
                    if not (empty and balanced):
                        checkpoints['retries']+=1
                        if empty and not balanced:checkpoints['emptyScopeUnbalancedDiagnostics']+=1
                        port.command('run 0.1');continue
                    checkpoints['maxRetries']=max(checkpoints['maxRetries'],_)
                    assert not any(recorder[3:])
                    assert int.from_bytes(port.peek(symbols['bs_recorder_test_entries'],4),'big')==int.from_bytes(port.peek(symbols['bs_recorder_test_exits'],4),'big')
                break
            else:raise AssertionError('Native observers did not become quiescent')
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
        # Finish the editor-open waveform job before measuring a new edit; its
        # separate completion is not part of the reverse transaction.
        port.command('run 1000')
        if a.expected_frames != 44100:
            # Repacking the WAV alone preserves the project's one-second trim.
            # SELECT ALL changes editor selection, not that sample trim. Use
            # ordinary stock slot clearing/browser reload before admission.
            tap(port, 'no'); tap(port, 'track1'); tap(port, 'track1')
            for mask in (0x20, 0x21, 0x20, 0):
                port.command(f'key 0x25 {mask}'); port.command('run 60')
            tap(port, 'yes'); port.command('run 1000')
            cleared = struct.unpack('>11I', port.peek(0x46c922c4, 44))
            assert cleared[2] == 1 and cleared[4] == 0, 'Stock clear did not release Flex slot zero'
            for _ in range(3): tap(port, 'yes')
            port.command('run 2000')
            loaded = struct.unpack('>11I', port.peek(0x46c922c4, 44))
            assert loaded[0] == 3 and loaded[2] == 0 and loaded[4] == a.expected_frames
            tap(port, 'yes'); tap(port, 'no'); tap(port, 'aed'); port.command('run 1000')
            assert port.peek(0x46c8d19c, 8) == bytes.fromhex('0000000000000001')
            settings = struct.unpack('>274I', port.peek(0x100b14f0, 1096))
            assert settings[75:78] == (0, a.expected_frames, 0) and settings[273] == 0
        # Enter the ordinary SLICE page. Optionally create stock's unaligned
        # four-slice grid first to exercise its selected-slice nine-row variant.
        port.command('key 0x24 8'); port.command('run 60')
        port.command('key 0x24 0'); port.command('run 1000')
        if a.selected:
            tap(port, 'yes'); choose(port, 'CREATE SLICE GRID'); choose(port, '4 SLICES')
            tap(port, 'no'); port.command('run 1500')
        elif int.from_bytes(port.peek(0x100b14f0+1092, 4), 'big'):
            tap(port, 'yes'); choose(port, 'DELETE ALL SLICES')
            tap(port, 'yes'); port.command('run 1000')
        assert int.from_bytes(port.peek(0x100b14f0+1092, 4), 'big') == (4 if a.selected else 0)
        assert (int.from_bytes(port.peek(0x400ceb3c, 4), 'big') != 0xffffffff) == a.selected
        prepared = out / 'prepared'; prepared.mkdir()
        baseline = observe(port, 16, 2, original, prepared)
        prepared_settings = struct.unpack('>274I', port.peek(0x100b14f0, 1096))
        assert call_native(symbols['bs_engine_test_enable']) == 0
        native_state()
        if a.allow_private_waveform_reads:
            assert call_native(symbols['bs_async_allow_private_waveform_reads']) == 0
        assert call_native(symbols['bs_async_fixture_init']) == 0
        assert symbols['wake_message'] != symbols['foreign_message']
        assert call_native(symbols['bs_boot_menu_prepare']) == 0
        def call(name):
            return call_native(symbols[name])
        def word_at(address):
            return int.from_bytes(port.peek(address, 4), 'big')
        def word(name):
            return word_at(symbols[name])
        # Private test-only interception of both existing stock open operands;
        # preserve every incoming argument and the surrounding instructions.
        for site, opcode in ((0x40072c30, '41f9'), (0x40072caa, '4eb9')):
            prior = port.peek(site, 6)
            assert prior[:2].hex() == opcode and int.from_bytes(prior[2:], 'big') == 0x4006d94c
            poke(site+2, symbols['bs_boot_menu_open'].to_bytes(4, 'big'))
        import hashlib
        site = native['tickSite']
        assert hashlib.sha256(port.peek(site['address'], 6)).hexdigest() == site['sha256']
        poke(site['address'], bytes.fromhex('4eb9') + symbols['bs_ui_tick_entry'].to_bytes(4, 'big'))
        for name in ('entry','tail'):
            hook=native['selectionSites'][name]
            assert hashlib.sha256(port.peek(hook['address'],6)).hexdigest()==hook['sha256']
            poke(hook['address'],bytes.fromhex('4ef9')+symbols['bs_selection_'+name].to_bytes(4,'big'))
        watch_addresses=[symbols['bs_selection_entry'],0x4006d8fa,symbols['bs_selection_tail'],
                         0x40020c28,symbols['bs_selection_return'],symbols['bs_selection_return_rts']]
        port.command('watch '+','.join(hex(v) for v in watch_addresses))
        trace_count=0
        def check_trace():
            nonlocal trace_count
            response=port.command('hits',b'hits ')
            records=[[int(x,16) for x in item.split(':')] for item in response.split()[2:]]
            assert len(records)==int(response.split()[1].split('=')[1])
            regs=(2,3,4,5,*range(12,23))
            active=None
            for row in records:
                assert len(row)==23
                pc=row[1]
                if pc==symbols['bs_selection_entry']:
                    assert active is None,'Unexpected nested selection in ordinary flow'
                    active={'entry':row}
                elif pc==0x4006d8fa:
                    assert active is not None
                    before=active['entry']
                    assert all(row[i]==before[i] for i in regs if i!=4), 'Entry wrapper clobbered a register'
                    assert row[6]==before[6] and row[7]==symbols['bs_selection_return'] and row[8:12]==before[8:12]
                    active['continued']=row
                elif pc==symbols['bs_selection_tail']:
                    assert active is not None and 'continued' in active
                    assert row[6]==active['entry'][6]
                    active['tail']=row
                elif pc==0x40020c28:
                    if active is None or row[6]!=active['entry'][6] or row[7]!=symbols['bs_selection_return']:continue
                    before=active['tail']
                    assert all(row[i]==before[i] for i in regs) and row[6:12]==before[6:12], 'Tail wrapper changed stock dispatch ABI'
                    active['helper']=row
                elif pc==symbols['bs_selection_return']:
                    assert active is not None and 'helper' in active
                    assert row[6]==active['entry'][6]+4
                    active['post']=row
                elif pc==symbols['bs_selection_return_rts']:
                    assert active is not None and 'post' in active
                    before=active['post']
                    assert all(row[i]==before[i] for i in regs), 'Post wrapper clobbered a register'
                    assert row[6]+4==before[6] and row[7]==active['entry'][7] and row[8:12]==before[7:11]
                    trace_count+=1;active=None
            assert active is None and trace_count>0
            assert trace_count==word('bs_selection_exits')==word('bs_selection_entries')
            port.command('watch off')
        late_checks=[]
        def reject_late(where):
            fields=('bs_grid_ui_state','bs_grid_ui_epoch','bs_grid_ui_tempo','bs_grid_ui_spacing',
                    'bs_grid_ui_snap','bs_grid_ui_previews','bs_boot_menu_pending','bs_boot_menu_calls','bs_async_ui_request')
            before=[word(n) for n in fields]
            refused=word('bs_selection_refused')
            assert call('bs_selection_late_menu')==0 and call('bs_selection_late_ui')==0
            assert [word(n) for n in fields]==before,'Late callbacks changed current UI state'
            assert word('bs_selection_refused')==refused+10
            late_checks.append(where)
        main_sp = call('bs_ui_main_sp')
        assert call('bs_ui_tick_enable') == 0
        tasks = {name: set() for name in ('tick', 'query', 'callback', 'engine')}
        addresses = {symbols['bs_ui_tick_calls']: 'tick', symbols['bs_boot_queries']: 'query',
                     symbols['bs_boot_menu_calls']: 'callback', symbols['bs_async_engine_calls']: 'engine'}
        for address in addresses: port.command(f'watchmem {address:#x} 4')
        writes(port)
        recording_trace=None
        def collect_tasks():
            for row in writes(port):
                if row[2] in addresses: tasks[addresses[row[2]]].add(row[5])
                if recording_trace is not None:
                    _,pc,address,value,size,_=row
                    if guard_at+16<=address<guard_at+48:
                        assert size==4 and (address-guard_at)%4==0
                        recording_trace['tickets'][(address-guard_at-16)//4]=value
                    if address==symbols['bs_recorder_test_boundary']+16:recording_trace['recorderTicket']=value
                    if address==boundary_at+4:recording_trace['engineTicket']=value
                    if recording_trace['pcm']<=address<recording_trace['pcm']+64:
                        assert recording_trace['recorderTicket'] and recording_trace['recorderTicket'] in recording_trace['tickets']
                        recording_trace['pcmPrefixStores']+=1
                    if address==recording_trace['tail']:
                        assert size==2 and value==0 and pc==0x40095afc
                        assert recording_trace['engineTicket'] and recording_trace['engineTicket'] in recording_trace['tickets']
                        recording_trace['mapTailStores']+=1
        stock_count = 9 if a.selected else 6
        stock_labels = 0x400cebc8 if a.selected else 0x400ceb8c
        stock_callbacks = MENUS[stock_labels][1]
        before_queries = word('bs_boot_queries')
        tap(port, 'yes')
        header = struct.unpack('>5I', port.peek(word('bs_boot_menu_current'), 20))
        assert header[1:3] == (stock_count+1, stock_count) and header[4] == 1
        assert word('bs_boot_menu_opens') == 1 and not word('bs_boot_menu_calls')
        labels, callbacks = word_at(0x460e5e2c), word_at(0x460e5e28)
        assert reserve.start <= labels < reserve.end and reserve.start <= callbacks < reserve.end
        assert port.peek(callbacks, 4*stock_count) == port.peek(stock_callbacks, 4*stock_count)
        for index in range(stock_count):
            original_label = port.peek(word_at(stock_labels+4*index), 32).split(b'\0', 1)[0]
            copied_label = port.peek(word_at(labels+4*index), 32).split(b'\0', 1)[0]
            assert original_label == copied_label
        assert port.peek(word_at(labels+4*stock_count), 32).split(b'\0', 1)[0] == b'BEAT GRID'
        resident_address = word('bs_boot_menu_current')
        layout_bytes = (port.peek(labels, 4*(stock_count+1)), port.peek(callbacks, 4*(stock_count+1)),
                        tuple(port.peek(word_at(labels+4*i),32) for i in range(stock_count+1)))
        opening_serials = [header[0]]
        def check_reopening():
            assert word('bs_boot_menu_current') == resident_address
            h = struct.unpack('>5I', port.peek(resident_address,20))
            assert h[1:3] == (stock_count+1,stock_count) and h[4] == 1
            assert h[0] > opening_serials[-1] and h[0] == word('bs_boot_menu_token')
            assert word_at(0x460e5e2c) == labels and word_at(0x460e5e28) == callbacks
            assert layout_bytes == (port.peek(labels,4*(stock_count+1)),port.peek(callbacks,4*(stock_count+1)),
                                    tuple(port.peek(word_at(labels+4*i),32) for i in range(stock_count+1)))
            opening_serials.append(h[0])
        for _ in range(stock_count+2):
            selected = word_at(0x460e5e40)
            if selected == stock_count: break
            tap(port, 'down' if selected < stock_count else 'up')
        assert word_at(0x460e5e40) == stock_count, 'Appended row did not scroll into selection'
        shutil.copyfile(out / 'lcd.private.bin', out / 'beat-grid-menu.private.bin')
        tap(port, 'yes')
        assert word('bs_boot_menu_calls') == 1 and not word('bs_boot_menu_pending')
        assert word('bs_grid_ui_state') == 1
        assert word('bs_boot_queries') == before_queries
        def names():
            address = word_at(0x460e5e2c)
            count = 5 if word('bs_grid_ui_state') in (1, 2, 3) else 4
            return [port.peek(word_at(address+4*i), 32).split(b'\0', 1)[0].decode('ascii') for i in range(count)]
        def select(row, count):
            for _ in range(count+1):
                at = word_at(0x460e5e40)
                if at == row: break
                assert at < count
                tap(port, 'down' if at < row else 'up')
            assert word_at(0x460e5e40) == row
            tap(port, 'yes')
        def service():
            port.command('run 20')
            collect_tasks()
            return word('bs_grid_ui_state')
        def unexpected_preview():
            count = word('bs_ui_job_count')
            trace = struct.unpack('>128I', port.peek(symbols['bs_ui_job_trace'], 512))
            observed = {'uiState': word('bs_grid_ui_state'),
                        'sessionState': word('bs_async_engine_state'),
                        'uiRequest': word('bs_async_ui_request'),
                        'engineCalls': word('bs_async_engine_calls'),
                        'guard': struct.unpack('>12I', port.peek(guard_at, 48)),
                        'boundary': struct.unpack('>4I', port.peek(boundary_at, 16)),
                        'completedPreviews': len(results), 'labels': names(),
                        'jobCount': count,
                        'jobTraceOpcodeUiEpochQueries': [trace[4*(i%32):4*(i%32)+4] for i in range(max(0,count-32),count)],
                        'fixtureWrites': [r for r in writes(port) if reserve.start <= r[2] < reserve.end]}
            (out/'unexpected-preview.private.json').write_text(json.dumps(observed, indent=2)+'\n')
            raise AssertionError(f"Unexpected preview UI state {observed['uiState']}, session {observed['sessionState']}")
        measurement_start = None
        def counters():
            status = port.command('cfstatus', b'cfstatus ')
            fields = dict(part.split('=',1) for part in status.split()[1:])
            return {'machineInstructions': int(fields['instructions']), 'emulatedMs': float(fields['ms']),
                    **{name: word(symbol) for name,symbol in (
                        ('sourceQueries','bs_boot_queries'),('sourceLocks','bs_boot_locks'),
                        ('engineCalls','bs_async_engine_calls'),('engineWorkCalls','bs_async_engine_steps'),
                        ('engineBegins','bs_async_engine_begins'),('postedWakes','bs_async_posted'),
                        ('consumedWakes','bs_async_consumed'))}}
        def request_preview():
            nonlocal measurement_start
            measurement_start = counters()
            select(3, 5)
            if word('bs_grid_ui_state') not in (2, 3, 4):
                unexpected_preview()
            assert service() in (3, 4)
        def finish():
            for waits in range(3000):
                state = service()
                if state != 3: break
            if state != 4: unexpected_preview()
            completed = counters()
            assert names()[3] == 'BACK'
            tempo = word('bs_grid_ui_tempo')
            snap = word('bs_grid_ui_snap')
            beats = (1, 4, 16, 32, 64)[word('bs_grid_ui_spacing')]
            settings = struct.unpack('>274I', port.peek(0x100b14f0, 1096))
            project = word_at(0x80001814)
            if not a.selected:
                assert settings[75:77] == (0,a.expected_frames), 'Long preview did not cover the full sample'
            request = oracle.request(existing=[settings[78+3*i] for i in range(settings[273])],
                                     trim_start=settings[75], trim_end=settings[76],
                                     sample_bpm24=settings[69], project_bpm24=project,
                                     tempo_source=tempo, snap=snap, beats=beats,
                                     reader=lambda f: (original[2*f]*256, original[2*f+1]*256))
            expected = oracle.preview(request)
            assert word_at(symbols['bs_async_ui_view']) == word('bs_async_ui_request')
            actual = struct.unpack('>131I', port.peek(symbols['bs_async_ui_view']+8, 524))
            assert actual == (expected.count, expected.bpm24, *expected.starts, *expected.needs_fade, expected.end_needs_fade)
            hundredths = (expected.bpm24 * 25 + 3) // 6
            assert names()[0] == f'{expected.count} SLICE{"S" if expected.count != 1 else ""}: {hundredths//100}.{hundredths%100:02d} BPM'
            assert names()[1] == f'EXISTING: {settings[273]} NEW: {expected.count-settings[273]}'
            expected_fade = 'FADES REQUIRED' if expected.end_needs_fade or any(expected.needs_fade) else 'BOUNDARIES QUIET'
            assert names()[2] == expected_fade
            queries = word('bs_boot_queries')
            assert service() == 4 and word('bs_boot_queries') == queries
            item = {'tempoSource': tempo, 'beats': beats, 'snap': snap, 'observedTickWaits': waits+1, 'driverServiceCalls': 0,
                    'markerCount': expected.count, 'wholePlanMatchesHost': True,
                    'summaryTempoCountsAndFadeStatusMatch': True, 'readyDoesNotRestart': True,
                    'trimStart': settings[75], 'trimEnd': settings[76],
                    'sampleBpm24': settings[69], 'projectBpm24': project, 'resultBpm24': expected.bpm24,
                    'requestWindow': {k: completed[k]-measurement_start[k] for k in completed}}
            results.append(item)
            return item
        def capture(name):
            port.command('run 1')
            shutil.copyfile(out / 'lcd.private.bin', out / name)
        assert names() == ['BPM: SAMPLE', 'SPACING: 1 BEAT', 'BOUNDARY: SMOOTH', 'PREVIEW', 'BACK']
        capture('configuration.private.bin')
        reject_late('configuration')
        if a.scenario == 'controls':
            for tempo in (0, 1):
                if word('bs_grid_ui_tempo') != tempo: select(0, 5)
                for spacing in range(5):
                    while word('bs_grid_ui_spacing') != spacing: select(1, 5)
                    for snap in (1, 0):
                        if word('bs_grid_ui_snap') != snap: select(2, 5)
                        queries = word('bs_boot_queries')
                        assert service() == 1 and word('bs_boot_queries') == queries
                        request_preview(); finish()
                        if len(results) == 1:
                            reject_late('ready')
                            readonly = word('bs_ui_readonly_jobs')
                            queries = word('bs_boot_queries')
                            port.command('run 1200')
                            assert service() == 4 and word('bs_boot_queries') == queries
                            assert word('bs_ui_readonly_jobs') > readonly
                        if len(results) in (1, 20):
                            capture(f'result-{len(results)}.private.bin')
                        select(3, 4)
                        assert service() == 1
                        if len(results)==1:check_trace()
            assert word('bs_grid_ui_previews') == 20
            # Hold an independent synthetic writer so even short selected-slice
            # previews remain waiting until the option change cancels them.
            assert call('bs_ui_block') > 0
            request_preview()
            waiting_calls, waiting_steps = word('bs_ui_tick_calls'), word('bs_ui_tick_steps')
            for _ in range(5): assert service() == 3
            assert word('bs_ui_tick_steps')-waiting_steps == word('bs_ui_tick_calls')-waiting_calls
            queries, cancelled = word('bs_boot_queries'), word('bs_grid_ui_cancelled')
            select(0, 5)
            assert service() == 1 and word('bs_boot_queries') == queries
            assert word('bs_grid_ui_cancelled') == cancelled+1
            assert call('bs_ui_unblock') == 0
            request_preview(); finish()
            # An unrelated queued no-op remains conservative and invalidates READY.
            # Ordinary Flex waveform reads must not retire the source token.
            queries = word('bs_boot_queries')
            ordinary = word('bs_ui_ordinary_jobs')
            assert call('bs_ui_foreign_event') == 0
            port.command('run 20')
            assert word('bs_ui_ordinary_jobs') == ordinary+1
            assert service() == 5 and word('bs_boot_queries') == queries
            assert names()[:2] == ['PREVIEW UNAVAILABLE', 'SOURCE CHANGED']
            capture('stale-preview.private.bin')
            select(3, 4); assert service() == 1
            select(4, 5); assert service() == 0
            terminal = 'explicit-back'
        elif a.scenario == 'recording':
            from boot_recorder import snapshot
            request_preview();finish();native_state();collect_tasks()
            queries=word('bs_boot_queries');revision=word_at(guard_at)
            assert word('bs_grid_ui_state')==4
            before_preparation=word('bs_recorder_prepare_entries')
            before_cancelled=word('bs_grid_ui_cancelled');before_epoch=word('bs_grid_ui_epoch')
            initial=snapshot(port,0);assert initial['states']==[0,0]
            row=0x46c2e9c0+2*2*14602;page=int.from_bytes(port.peek(row,2),'big')
            assert 0<page<=pool_count
            recording_trace={'tickets':[0]*8,'recorderTicket':0,'engineTicket':0,
                'pcm':pool_base+page*6144,'tail':row+2*14601,'pcmPrefixStores':0,'mapTailStores':0}
            port.command(f"watchmem {recording_trace['pcm']:#x} 64")
            port.command(f"watchmem {recording_trace['tail']:#x} 2")
            port.command(f"watchmem {symbols['bs_recorder_test_boundary']+16:#x} 4")
            # Ordinary simultaneous TRACK+REC1 chord; no forced native state.
            port.command('key 0x22 1');port.command('key 0x25 8');port.command('run 60')
            port.command('key 0x25 0');port.command('key 0x22 0');port.command('run 200')
            started=snapshot(port,0)
            assert started['states'][started['bank']]==2 and started['published']>0
            assert word('bs_recorder_prepare_entries')==before_preparation+1
            assert word_at(guard_at)>revision
            assert service()==0 and word('bs_boot_queries')==queries
            assert word('bs_grid_ui_cancelled')==before_cancelled+1 and not word('bs_async_ui_request')
            assert not word_at(0x460e5e30),'Stock TRACK+REC dismissal was reopened'
            capture('recording-dismissed.private.bin')
            port.command('key 0x24 128');port.command('run 60')
            port.command('key 0x24 0');port.command('run 500')
            stopped=snapshot(port,0);assert stopped['states'][stopped['bank']]==0 and stopped['queueCounts']==[0,0]
            native_state();collect_tasks()
            assert not any(recording_trace['tickets']) and not recording_trace['recorderTicket'] and not recording_trace['engineTicket']
            assert recording_trace['pcmPrefixStores']>0 and recording_trace['mapTailStores']>0
            assert service()==0 and word('bs_boot_queries')==queries
            assert word('bs_async_engine_state')==4 and not word('bs_async_ui_request')
            recording_result={'initial':initial,'started':started,'stopped':stopped,
                'readyRetiredWithoutFurtherPcmRead':True,'stockDismissalPreserved':True,
                'cancelledRequestDoesNotReviveAfterStop':True,
                'pcmPrefixStores':recording_trace['pcmPrefixStores'],'mapTailStores':recording_trace['mapTailStores'],
                'ownNativeTicketsCoverWatchedWrites':True}
            recording_trace=None
            # Stock TRACK+REC returns to the main playback page. Re-enter AED
            # and SLICE through their normal controls before reopening the menu.
            tap(port,'aed')
            port.command('key 0x24 8');port.command('run 60')
            port.command('key 0x24 0');port.command('run 200')
            tap(port,'yes');check_reopening()
            reject_late('after-recording-resident-root')
            select(stock_count,stock_count+1)
            assert service()==1 and word('bs_grid_ui_epoch')>before_epoch
            request_preview();finish();capture('recording-fresh.private.bin')
            select(3,4);assert service()==1
            select(4,5);assert service()==0
            terminal='stock-recording-dismissal-stop-reopen-fresh-preview'
        elif a.scenario == 'conservative':
            measurement_start = counters()
            ordinary = word('bs_ui_ordinary_jobs')
            select(3, 5)
            for _ in range(3000):
                state = service()
                if state not in (2,3): break
            assert state in (4,5), 'Conservative preview neither completed nor retired'
            # A stock redraw can retire READY during the panel tap itself.
            # Only count an oracle comparison when the driver observes READY.
            if state == 4:
                finish()
                port.command('run 1200')
            assert service() == 5 and word('bs_async_engine_state') == 5
            assert word('bs_ui_ordinary_jobs') > ordinary
            count = word('bs_ui_job_count')
            trace = struct.unpack('>128I', port.peek(symbols['bs_ui_job_trace'],512))
            assert any(trace[4*(i%32)] == 16 for i in range(max(0,count-32),count))
            assert names()[:2] == ['PREVIEW UNAVAILABLE', 'SOURCE CHANGED']
            queries = word('bs_boot_queries')
            for _ in range(5): assert service() == 5 and word('bs_boot_queries') == queries
            capture('conservative-stale.private.bin')
            select(3, 4); assert service() == 1
            select(4, 5); assert service() == 0
            terminal = 'conservative-waveform-invalidation'
        else:
            assert call('bs_ui_block') > 0
            request_preview()
            waiting_calls, waiting_steps = word('bs_ui_tick_calls'), word('bs_ui_tick_steps')
            for _ in range(5): assert service() == 3
            assert word('bs_ui_tick_steps')-waiting_steps == word('bs_ui_tick_calls')-waiting_calls
            queries, cancelled = word('bs_boot_queries'), word('bs_grid_ui_cancelled')
            if a.scenario == 'cancel': tap(port, 'no')
            else: assert call('bs_boot_menu_revoke') == 0
            assert service() == 0 and word('bs_boot_queries') == queries
            assert word('bs_grid_ui_cancelled') == cancelled+1
            assert call('bs_ui_unblock') == 0
            terminal = 'stock-no-waiting' if a.scenario == 'cancel' else 'owner-retired-waiting'
        queries = word('bs_boot_queries')
        assert service() == 0 and word('bs_boot_queries') == queries
        assert word_at(0x460e5e30) == 0, 'Owned popup remains after cancellation'
        reject_late('closed')
        if not trace_count:check_trace()
        if a.scenario == 'controls':
            # Immutable tables survive ordinary NO dismissal and subsequent
            # openings. UI epochs and request identity never reset on reopen.
            options = tuple(word(n) for n in ('bs_grid_ui_tempo','bs_grid_ui_spacing','bs_grid_ui_snap'))
            for repeat in range(6):
                old_epoch = word('bs_grid_ui_epoch')
                tap(port,'yes');check_reopening()
                reject_late('resident-root-'+str(repeat))
                assert service() == 0 and word_at(0x460e5e30)
                if repeat == 0:
                    tap(port,'no');assert not word_at(0x460e5e30)
                    tap(port,'yes');check_reopening()
                select(stock_count,stock_count+1)
                assert service() == 1 and word('bs_grid_ui_epoch') > old_epoch
                assert tuple(word(n) for n in ('bs_grid_ui_tempo','bs_grid_ui_spacing','bs_grid_ui_snap')) == options
                request_preview();finish()
                select(3,4);assert service() == 1
                select(4,5);assert service() == 0
                queries = word('bs_boot_queries')
                assert service() == 0 and word('bs_boot_queries') == queries
            # Original stock rows still dispatch with the contribution present.
            tap(port,'yes');check_reopening()
            root_names = [port.peek(word_at(labels+4*i),32).split(b'\0',1)[0].decode('ascii') for i in range(stock_count+1)]
            select(root_names.index('CREATE SLICE GRID'),stock_count+1)
            assert word_at(0x460e5e2c) == 0x400cec34 and len(stock_menu(port)) == 11
            tap(port,'no');assert not word_at(0x460e5e30)
            # Withdraw an outstanding root popup when its owner retires.
            tap(port,'yes');check_reopening()
            queries = word('bs_boot_queries')
            assert call('bs_boot_menu_revoke') == 0
            assert service() == 0 and not word_at(0x460e5e30)
            assert word('bs_boot_queries') == queries
            terminal = 'repeated-openings-and-owner-retirement'
        elif a.scenario != 'owner':
            assert call('bs_boot_menu_revoke') == 0
            assert service() == 0
        tap(port,'yes')
        assert word_at(0x460e5e2c)==stock_labels
        assert len(stock_menu(port))==stock_count and 'BEAT GRID' not in stock_menu(port)
        choose(port,'CREATE SLICE GRID')
        assert word_at(0x460e5e2c)==0x400cec34 and len(stock_menu(port))==11
        tap(port,'no');port.command('run 20')
        assert word_at(0x460e5e30)==0
        reject_late('stock-grid-cancel')
        assert not word('bs_selection_active') and not word('bs_selection_ticket')
        assert not word('bs_selection_faults') and not word('bs_selection_nested')
        assert word('bs_selection_entries')==word('bs_selection_exits')
        assert word('bs_selection_captured')==word('bs_selection_armed')==word('bs_selection_taken')
        assert word('bs_boot_locks') == word('bs_boot_unlocks')
        native_state()
        after = out / 'after'; after.mkdir()
        assert observe(port, 16, 2, original, after) == baseline
        collect_tasks()
        assert len(tasks['tick']) == 1 and tasks['tick'] == tasks['callback']
        assert len(tasks['engine']) == 1 and not (tasks['engine'] & tasks['tick'])
        assert tasks['query'] <= tasks['engine']
        if a.scenario in ('controls','conservative','recording'): assert tasks['query'] == tasks['engine']
        assert word('bs_ui_tick_max_steps') == 1
        assert word('bs_async_engine_max_steps') <= 1 and not word('bs_ui_tick_reentry')
        assert port.peek(0x40084854, 6) == original_call
        assert call('bs_ui_main_sp') == main_sp, 'Driver calls changed main stack'
        assert not a.allow_private_waveform_reads or word('bs_ui_readonly_jobs') > 0
        assert runtime_tempo(port) == prepared_project_bpm24, 'Preview changed project tempo'
        counters = {name: word('bs_ui_tick_' + name) for name in ('calls', 'steps', 'max_steps', 'reentry')}
        jobs = {name: word('bs_ui_' + name + '_jobs') for name in ('readonly', 'ordinary')}
        ui_completed = word('bs_grid_ui_previews')
        engine = {name: word('bs_async_engine_'+name) for name in ('calls','steps','begins','max_steps','state')}
        wakes = {name: word('bs_async_'+name) for name in ('posted','consumed','wake_pending')}
        assert wakes['posted'] == wakes['consumed'] and not wakes['wake_pending']
        selection_dispatches = word('bs_selection_entries')
        selection_refused = word('bs_selection_refused')
        print(f'PASS: resident guarded stock-selection UI/engine {a.scenario}, {stock_count} stock rows, {len(results)} previews, unchanged PCM/settings', flush=True)
    finally:
        port.close()
        ffi.PlannerTests.tearDownClass()
    assert digest(card) == a.card_sha256 and digest(a.card) == a.card_sha256
    report = {'scope': 'private copied UI intents/results with engine-owned previews; existing tick/engine hooks, actual stock menus and synthetic source/owner admission',
              'sourceSha256': {n: digest(ROOT / n) for n in ('boot_resident_native.py', 'stock_tempo.py', 'boot_source_native.py', 'boot_worker_native.py', 'boot_slices.py', 'boot_writer.py', 'boot_static.py', 'boot_formats.py', 'boot_observe.py', 'inspect_stock.py', 'test_planner.py','boot_recorder.py', *native['sourceSha256'].keys())},
              'mainSha256': STOCK_MAIN_SHA256, 'reservedMainSha256': digest(patched_main),
              'nativeReceiptSha256': digest(a.native / 'source-boot.json'), 'nativeBinarySha256': digest(binary),
              'arenaToolSha256': ARENA_SHA, 'reservedPages': 8, 'nativeAddress': native['textBase'],
              'emulatorSha256': digest(a.emulator), 'cardSha256': a.card_sha256, 'wavSha256': digest(a.wav),
              'expectedFrames': a.expected_frames, 'normalProjectTempoChange': tempo_change,
              'preparedProjectBpm24': prepared_project_bpm24, 'projectTempoUnchangedByPreview': True,
              'initialTrim': list(initial_settings[75:78]), 'preparedTrim': list(prepared_settings[75:78]),
              'initialSampleBpm24': initial_settings[69], 'preparedSampleBpm24': prepared_settings[69],
              'borrowedCallPreEntryWaitMs': wait_ms, 'borrowedCallMaximumAttempts': 200,
              'longSourcePreparation': 'normal stock slot clear/browser reload before preview admission' if a.expected_frames != 44100 else 'retained saved source',
              'measurementScope': 'Request selection, panel holds/releases and polling through first observed READY; whole-machine executed instructions and emulated elapsed time include stock work, UI and scheduler. Not isolated module cost, cycles, audible headroom or hardware time.',
              'engineWorkBudget': 1, 'privateStepsPerWork': 8,
              'residentOpeningSerials': opening_serials, 'immutableResidentTables': True,
              'selectionDispatches': selection_dispatches, 'registerAndStackTraceCount': trace_count,
              'stockGridPopupOpenCancel': True, 'lateCallbackChecks': late_checks, 'directLateCallbacksRefused': selection_refused,
              'selectionAuthority': 'capture before close, arm at exact tail, consume once with task/table/row/callback/owner/epoch binding; immutable fixed-owner resident tables; native removal and legitimate nesting unqualified',
              'srObservation': 'wrappers save/restore SR structurally; interactive PC traces do not include SR',
              'engineStepCounterUnit': 'work calls, not individual private reader transitions',
              'scenario': a.scenario, 'stockRows': stock_count, 'terminal': terminal, 'results': results, 'uiCompletedPreviews': ui_completed,
              'tickCounters': counters, 'waitingOneServicePerTick': a.scenario in ('controls','cancel','owner'),
              'engineJobs': jobs, 'engineCounters': engine, 'wakeCounters': wakes,
              'privateWaveformReadClassification': a.allow_private_waveform_reads,
              'completedPreviewsSurviveWaveformReads': bool(results) and a.allow_private_waveform_reads,
              'tickAndCallbackTaskMatch': True, 'queriesInSeparateEngineTask': True, 'driverServiceCalls': 0, 'mainStackPreserved': True,
              'hookGuardSha256': native['hookGuardSha256'], 'tickRecipeSha256': native['tickRecipeSha256'],
              'tickSite': native['tickSite'], 'receiveCallUnchanged': True,
              'sourceAndSettingsUnchanged': True, 'noApplyAction': True, 'cardUnchanged': True, 'exitCode': 0, 'hardware': 'not tested',
              'audio': 'not qualified', 'menuLifetime': 'repeated fixed-owner openings with immutable tables pinned forever and non-resetting UI epochs; retired owner falls back to stock; loader removal/reclamation unqualified',
              'nativeOwnership': 'test-owned identities and full masking, fixed stopped-source command inputs and partial coverage; mutable queued-record lifetimes and live source admission unqualified',
              'scheduling': 'private UI task copies intents/results once per tick; separate engine task owns all source queries and at most one work call with at most eight private reader transitions and one live PCM copy, plus optional begin/setup and result validation. Immutable wakes coalesce; no driver service calls or independent clock. Production base chain and hardware time unqualified'}
    if native.get('recorderComposition'):
        report.update({'recorderComposition':True,'sdkRevision':native['sdkRevision'],
            'sdkDependencySha256':native['sdkDependencySha256'],'codegenGuardSha256':native['codegenGuardSha256']})
    if native.get('recorderComposition'):report['observerCheckpoints']=checkpoints
    if a.scenario=='recording':report['recording']=recording_result
    (out / 'async-ui-boot.json').write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    main()
