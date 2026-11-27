"""Replay the historical composite or 16x8 lane matrix on the candidate MKII base."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import struct
import sys
import tempfile

from mkii_panel import panel, peek

TICK, WRAP, TRIG, AUDIO, MIDI = 0x400a3fdc, 0x400a43a0, 0x400a536c, 0x4009d1e8, 0x4009cf4c
ARR, NO, YES, STOP, PLAY = 0x1f, 0x32, 0x31, 0x27, 0x28
parser = argparse.ArgumentParser(description=__doc__)
for field in ('emulator', 'base', 'card', 'symbols', 'output'):
    parser.add_argument(field, type=Path)
parser.add_argument('--octabam', type=Path, required=True)
parser.add_argument('--reference', action='store_true')
parser.add_argument('--performance-overlay', action='store_true', help='Drive the wide fixture through Row/Clip')
parser.add_argument('--lane-matrix', action='store_true')
parser.add_argument('--project-reload', choices=('stored', 'missing'))
parser.add_argument('--project-change', action='store_true')
parser.add_argument('--row-popup', action='store_true')
parser.add_argument('--scene-select', action='store_true')
parser.add_argument('--crossfader', action='store_true', help='Compare stock fader position and morph weights')
parser.add_argument('--arranger-recovery', action='store_true')
parser.add_argument('--observe-queue', action='store_true')
parser.add_argument('--home-control', choices=('home', 'stop'))
parser.add_argument('--clock-witness', type=Path, help='Additional JSONL observations on the wide replay')
parser.add_argument('--boundary', choices=('early','late'))
parser.add_argument('--package', type=Path)
parser.add_argument('--symbols-module', type=Path)
args = parser.parse_args()
if (args.project_change or args.project_reload) and not (args.package and args.symbols_module):
    parser.error('Project change requires package and matching module symbols')
if args.boundary and (args.lane_matrix or not args.reference and not (args.symbols_module and args.package)):
    parser.error('Boundary candidate requires its MWRM and matching linked symbol map')
if not __debug__ or args.lane_matrix and args.reference:
    parser.error('Assertions required; the matrix needs a candidate')
MODULE = 0x34e1e379
syms = json.loads(args.symbols.read_text())
with tempfile.TemporaryDirectory() as tmp:
    scratch = Path(tmp) / 'test.img'
    shutil.copyfile(args.card, scratch)
    if args.project_change or args.project_reload:
        sys.path.insert(0, str(args.octabam.resolve() / 'tools/emu'))
        import emu_card
        tree = Path(tmp) / 'fixture'
        tree.mkdir()
        emu_card.extract_image(args.card.read_bytes(), tree)
        seed = tree / 'MODWERK/GATE3'
        if args.project_change:
            second = tree / 'MODWERK/GATE4'
            shutil.copytree(seed, second)
            work = second / 'project.work'
        elif args.project_reload == 'stored':
            for work_file in seed.glob('*.work'):
                shutil.copyfile(work_file, work_file.with_suffix('.strd'))
            work = seed / 'project.strd'
        else:
            for stored in seed.glob('*.strd'):
                stored.unlink()  # Temporary fixture only.
        if args.project_change or args.project_reload == 'stored':
            data = work.read_bytes()
            assert data.count(b'\nBANK=0\r') == 1
            work.write_bytes(data.replace(b'\nBANK=0\r', b'\nBANK=1\r'))
        scratch.write_bytes(emu_card.build_image(tree))

    def project(card):
        sys.path.insert(0, str(args.octabam.resolve() / 'tools/emu'))
        import emu_card
        return {k: hashlib.sha256(v).hexdigest() for k,v in
                emu_card.extract_image(card.read_bytes()).items() if k.startswith('MODWERK/GATE3/')}

    with panel(args.emulator, args.base, scratch, ['--card-rw','--names-early','--dsp']) as cmd:
        def num(addr, size=4):
            return int.from_bytes(peek(cmd, addr, size), 'big')

        def call(name, *values):
            for _ in range(200):
                try:
                    reply = cmd('call ' + ' '.join(hex(i) for i in (syms[name], *values)))
                    return int(reply.split('d0=')[1].split()[0], 16)
                except RuntimeError as exc:
                    if "not main's spin" not in str(exc):
                        raise
                    cmd('run 3')
            raise RuntimeError('Main task did not become idle')

        def switch_once(on, target, polls=100):
            assert call('modwerk_modset_switch', target, on) == 1
            for _ in range(polls):
                cmd('run 15')
                actual = num(syms['modwerk_modset_switch_result'])
                if actual != 1:
                    break
            return actual

        def switch(on, polls=100):
            result = switch_once(on, MODULE, polls)
            assert result == 0, (on, result)
            cmd('run 100' if on else 'run 1200')

        def block(addr, size):
            h = hashlib.sha256()
            for off in range(0, size, 2048):
                h.update(peek(cmd, addr + off, min(2048, size-off)))
            return h.hexdigest()

        def bank_parts():
            return [block(0x400e21e0, 3*0x8ed8), block(0x400e21e0+0x8ed80, 4*0x18b2),
                    block(0x400e21e0+0x9504a, 4*0x18b2)]

        def callbacks():
            words = [num(syms['modwerk_runtime_event_row'] + 4*(k-4)) for k in (42,40,41,63,64,65)]
            return [num(a) for a in words]

        def tap(code):
            for val in (1 << (code%8), 0):
                cmd(f'key {32+code//8} {val}')
                advance(35)

        def move_focus(delta):
            cmd(f'knob 0x36 {delta}')
            advance(70)

        def start_trace():
            global tick, events, wraps, writes, recording
            cmd('hits')
            cmd('writes')
            tick, events, wraps, writes, recording = 0, [], [], [], True

        def advance(ms):
            global tick
            quantum = 1 if args.observe_queue and recording and sampling and 190 <= tick <= 195 else 5
            if recording and sampling and ms > quantum:
                for offset in range(0, ms, quantum):
                    advance(min(quantum, ms-offset))
                return
            old_tick = tick
            clock = cmd(f'run {ms}')
            if not recording:
                return
            hits = cmd('hits').split()[2:]
            for raw in hits:
                h = [int(v, 16) for v in raw.split(':')]
                pc = h[1]
                if pc == TICK:
                    tick += 1
                elif pc == WRAP:
                    wraps.append(tick)
                elif pc == TRIG or (pc in (AUDIO, MIDI) and h[7] in (0x400a2d82, 0x400a39ca)):
                    events.append([tick, pc, h[7], h[8], *([] if pc == TRIG else [h[11],h[10]])])
            if args.observe_queue and sampling and 191 <= tick <= 195:
                with args.output.with_suffix('.phase').open('a') as witness:
                    print(tick, ms, peek(cmd,0x46c7fe44,8).hex(), file=witness)
            if sampling and tick != old_tick:
                assert tick == old_tick+1
                state = []
                for table, mask in ((0x80001904,0x46c7fe44),(0x80001984,0x46c7fe8c),(0x46c76a26,0x46c77be2)):
                    times = struct.unpack('>24I', peek(cmd,table,96))
                    flags = peek(cmd,mask,8)
                    state.append([[t, slot, times[slot*8+t]] for t in range(8)
                                  for slot in range(3) if flags[t] & (1<<slot)])
                states.append([tick,state,peek(cmd,0x800064d0,64).hex(),peek(cmd,0x800065b2,6).hex()])
            mutations = cmd('writes').split()[2:]
            if args.clock_witness and sampling and (old_tick < 33 or 89 <= tick <= 91 or 124 <= tick <= 196):
                with args.clock_witness.open('a') as witness:
                    print(json.dumps(dict(tick=tick, sample=float(clock.split('sample=')[1].split()[0]),
                                          queue=peek(cmd,0x46c7fe44,8).hex(), hits=hits, writes=mutations)),
                          file=witness)
            for raw in mutations:
                sample, pc, addr, value, width, _ = raw.split(':')
                writes.append([float(sample), int(pc,16), int(addr,16), int(value,16), int(width)])

        def until(target):
            for _ in range(1500):
                if tick >= target:
                    return
                advance(10)
            raise AssertionError(('stalled', tick, target, num(0x800065b8), num(0x10000016,2), num(0x80006698)))

        def arr_run():
            global recording
            # FUNC+ARR, then stock playback for a complete row and its downbeat.
            cmd('key 37 32')
            advance(50)
            tap(ARR)
            cmd('key 37 0')
            advance(50)
            assert num(0x460d1aec) == 1
            start_trace()
            tap(PLAY)
            row_at_start = num(0x80006698)
            until(120)
            assert row_at_start == 0 and num(0x80006698) == 1, ('stock rows',row_at_start,num(0x80006698))
            record = dict(events=list(events), wraps=list(wraps), writes=list(writes), row=num(0x80006698))
            recording = False
            tap(STOP)
            cmd('key 37 32')
            advance(50)
            tap(ARR)
            cmd('key 37 0')
            advance(50)
            assert num(0x460d1aec) == 0 and num(0x800065b8) == 0
            return record

        recording = sampling = False
        tick = 0
        states = []
        sites = [TICK, WRAP, TRIG, AUDIO, MIDI]
        if args.clock_witness:
            sites.extend([syms['modwerk_site_400a2d5a'], 0x400a2d60])
            args.clock_witness.open('x').close()
        cmd('watch ' + ','.join(hex(i) for i in sites))
        cmd('watchmem 0x80001904 256')
        if args.observe_queue:
            cmd('watchmem 0x46c7fe44 8')
        print('boot active',call('modwerk_runtime_active'),'shelved',call('modwerk_modset_is_off',MODULE),flush=True)
        assert call('modwerk_runtime_active') == 0
        if not args.reference:
            assert call('modwerk_modset_is_off', MODULE)
        free = call('modwerk_runtime_free',0)
        # On the clean UI fixture, dismiss the native missing-modules / clock
        # windows using panel input before requesting module ownership.
        cmd('run 3000')
        tap(NO)
        cmd('run 3000')
        tap(NO)
        cmd('run 500')
        tap(YES)
        cmd('run 2000')
        print('clean start',hex(num(0x460d1e70)),hex(num(0x460d175c)),flush=True)
        assert not num(0x460d1e70) and not num(0x460d175c)
        if args.project_change or args.project_reload:
            switch(1)
            if args.performance_overlay:
                tap(ARR); tap(6); tap(ARR)   # Clip View first (D39.02)
                for _ in range(3): tap(0x20)
                tap(0x1b); tap(YES)
            else:
                tap(ARR); tap(1); tap(ARR); tap(YES); tap(3)
            witness = json.loads(args.symbols_module.read_text())
            assert hashlib.sha256(args.package.read_bytes()).hexdigest() == witness['sha256']
            origin = callbacks()[0] - witness['offsets']['clyps_project_init']
            defined_at = origin + witness['offsets']['defined']
            assert num(defined_at, 2) == 8 and num(0x80000002, 1) == 0
            if args.performance_overlay:
                rows_at = origin + witness['offsets']['rows']
                rows_before = peek(cmd, rows_at, 64)
                assert int.from_bytes(rows_before[12:16], 'big') == 6
            tap(ARR); tap(0); tap(NO)  # Yield stock controls at home.
            heads = callbacks()[:3]
            cmd('watch ' + ','.join(hex(pc) for pc in heads))
            cmd('hits')
            if args.project_change:
                # Mirror loadProjectLive: post the work to the stock engine.
                syms['post_project_load'] = 0x40023c7c
                name = 0x100f8378
                cmd(f'poke {name:#x} ' + b'GATE4\0'.hex())
                call('post_project_load', name)
            else:
                # Stock PROJECT menu, first category, third action (RELOAD).
                for key in [0x1c, 0x34, *([0x33]*4), 0x21, *([0x33]*8), 0x20, 0x20, YES]:
                    tap(key)
                    advance(150)
                advance(600)
                assert num(0x460e5cd0), 'stock reload confirmation did not open'
                tap(YES)
            seen = set()
            for _ in range(160):
                advance(100)
                seen.update(int(hit.split(':')[1], 16) for hit in cmd('hits').split()[2:])
            if args.performance_overlay and args.project_reload == 'stored':
                # B's display identity can change before the masked reader returns.
                for _ in range(120):
                    if heads[2] in seen: break
                    advance(1000)
                    seen.update(int(hit.split(':')[1], 16) for hit in cmd('hits').split()[2:])
                assert heads[2] in seen, 'stock masked reader did not return'
            heads = callbacks()
            receipt = dict(bank=num(0x80000002, 1), defined=num(defined_at, 2),
                           active=call('modwerk_runtime_active'),
                           observed=[pc in seen for pc in heads[:3]])
            if args.performance_overlay:
                assert rows_before == peek(cmd, rows_at, 64)
                receipt['rows_sha256'] = hashlib.sha256(rows_before).hexdigest()
                receipt['uncertain'] = num(origin + witness['offsets']['bank_uncertain'])
                assert receipt['uncertain'] == int(args.project_reload != 'missing')
            args.output.write_text(json.dumps(receipt))
            assert receipt['active'] == 1 and heads[0] == origin + witness['offsets']['clyps_project_init']
            if args.project_reload == 'missing':
                assert receipt['bank'] == 0 and receipt['defined'] == 8, receipt
            else:
                assert receipt['bank'] == 1 and receipt['defined'] == (8 if args.performance_overlay else 0), receipt
                if args.performance_overlay:
                    tap(ARR)
                    assert num(origin + witness['offsets']['mode']) == 0
                    assert num(origin + witness['offsets']['playing']) == 0
            switch(0, polls=2000)  # Let the stock card task finish first.
            assert call('modwerk_runtime_free',0) == free
            receipt['off_pool'] = free
            args.output.write_text(json.dumps(receipt))
            sys.exit(0)
        if args.row_popup:
            switch(1)
            tap(ARR)
            if args.performance_overlay:
                move_focus(3)
                tap(0x1b)
                tap(YES)   # Capture R04.
                tap(0x1b)
                tap(0x20)  # Cell Source, same focused slot.
            else:
                tap(ARR)
                tap(YES)
                tap(3)     # Save home references as R04.
                tap(0x1b)
                tap(YES)
            tap(1)         # Stage A02.
            # Open the stock timed message with the current project name.
            syms['stock_toast'] = 0x4005a2b8
            call('stock_toast', 0x100f8378, 0x60)
            advance(40)
            assert num(0x460d1e70), 'stock message failed to open'
            assert not num(syms['modwerk_runtime_api']) & (1 << 27)
            for _ in range(100):
                advance(50)
                if not num(0x460d1e70):
                    break
            assert not num(0x460d1e70), 'stock message still open'
            tap(ARR)
            assert num(syms['modwerk_runtime_api']) & (1 << 27), 'ARR did not reopen'
            if args.performance_overlay:
                tap(ARR)  # Clip view after re-entry.
            tap(1)      # Set T1=A02, then recall R04 to prove A01 survived.
            assert num(syms['modwerk_runtime_api']) & 0xfff == 1
            tap(ARR)
            tap(3)
            assert num(syms['modwerk_runtime_api']) & 0xffffff == 0
            switch(0)
            assert call('modwerk_runtime_free',0) == free
            args.output.write_text(json.dumps(dict(reopened=True, r04=0, pool=free)))
            sys.exit(0)
        if args.scene_select or args.crossfader:
            # Part 1's two active scene bytes are adjacent. Exercise both physical
            # selectors, including rollback, with and without the module.
            part = 0x400e21e0 + 0x8ed80
            def scenes():
                return list(peek(cmd, part+0x10, 2))
            def choose(key, slot):
                cmd(f'key 35 {1 << (key % 8)}')
                advance(100)
                tap(slot)
                cmd('key 35 0')
                advance(100)
                return scenes()
            receipt = {}
            for role in ('stock','installed'):
                if role == 'installed':
                    switch(1)
                before = scenes()
                a, b = (before[0]+5)%16, (before[1]+7)%16
                sequence = [before,choose(0x19,a),choose(0x1a,b),
                            choose(0x19,before[0]),choose(0x1a,before[1])]
                if args.crossfader:
                    fader = []
                    for adc in (1, 128, 255, 1):
                        cmd(f'key 0x40 {adc}')
                        advance(120)
                        fader.append([num(0x460d16c8), peek(cmd, 0x80003c60, 40).hex()])
                    receipt[role + '_fader'] = fader
                    assert [item[0] for item in fader] == [0, 64, 127, 0], fader
                    assert len({item[1] for item in fader}) == 3 and fader[0] == fader[-1]
                receipt[role] = sequence
                args.output.write_text(json.dumps(receipt))
                assert sequence == [before,[a,before[1]],[a,b],[before[0],b],before], sequence
            switch(0)
            assert receipt['stock'] == receipt['installed']
            if args.crossfader:
                assert receipt['stock_fader'] == receipt['installed_fader']
            sys.exit(0)
        if args.boundary:
            # Apply identical source edits to the stock A03 composite and A02.
            for pattern in (1, 2):
                t1 = 0x400e21e0 + pattern * 0x8ed8
                t3 = t1 + 2 * 0x91a
                micro = num(t1 + 0x89a, 2)
                assert micro & 0x1f80 == 0
                cmd(f'poke {t1 + 0x89a:#x} {micro | ((-8 & 63) << 7):04x}')
                mask = num(t3 + 0x40, 8)
                cmd(f'poke {t3 + 0x40:#x} {mask | 1:016x}')
                cmd(f'poke {t3 + 0x52:#x} 10')
        if args.boundary or args.arranger_recovery:
            # Add the second A01 row using stock EDIT in RAM before either trial.
            assert num(0x10000016,2) == 1
            tap(ARR)
            tap(YES)
            cmd('key 37 32')
            advance(50)
            tap(0x20)
            cmd('key 37 0')
            advance(50)
            tap(NO)
            tap(NO)
            assert num(0x10000016,2) == 2
            arr_before = arr_run()
            print('stock Arranger before',len(arr_before['events']),'calls',flush=True)
        if args.arranger_recovery:
            initial = callbacks(), bank_parts(), block(0x400e21e0, 16 * 0x8ed8)
            switch(1)
            tap(ARR)
            if args.performance_overlay:
                tap(ARR)
            tap(1)
            assert num(syms['modwerk_runtime_api']) & 0xf == 1
            switch(0)
            after = arr_run()
            def signature(row):
                writes = [(pc, addr, width, val) for _, pc, addr, val, width in row['writes']
                          if any(base <= addr < base + 96 for base in (0x80001904, 0x80001984))]
                assert len(writes) == len(row['events']) == 336
                return [row['events'], row['wraps'], row['row'],
                        [[pc, addr, width, (val-writes[0][3]) & 0xffffffff] for pc, addr, width, val in writes]]
            control = signature(arr_before)
            assert signature(after) == control
            assert initial == (callbacks(), bank_parts(), block(0x400e21e0, 16 * 0x8ed8))
            assert call('modwerk_runtime_free',0) == free and num(syms['core:owners']) == 0
            assert 'errors=0' in cmd('card flush') and project(args.card) == project(scratch)
            args.output.write_text(json.dumps(dict(events=336,writes=336,row=after['row'],pool=free,
                                                   sha256=hashlib.sha256(json.dumps(control).encode()).hexdigest())))
            sys.exit(0)
        if args.boundary:
            if not args.reference:
                switch(1)
                witness = json.loads(args.symbols_module.read_text())
                assert hashlib.sha256(args.package.read_bytes()).hexdigest() == witness['sha256']
                origin = callbacks()[0] - witness['offsets']['clyps_project_init']
                def diag():
                    return num(syms['modwerk_runtime_api'])

                def expect(active, queued):
                    assert diag() & 0xffffff == queued << 12 | active
                expect(0,0)
                tap(ARR)
                for t in range(3):
                    if t: move_focus(1)
                    tap(1)
                    refs = (0x111 & ((1 << (4*(t+1)))-1))
                    expect(refs,refs)
                tap(ARR)
                tap(YES)
                tap(4)
                tap(ARR)
                move_focus(-2)
                for t in range(3):
                    if t: move_focus(1)
                    tap(0)
                expect(0,0)
                tap(ARR)
            sampling = True
            # Read the running firmware's fixture. Patterns must be distinguishable,
            # and A03 must resolve each track to the independent mixed stock oracle.
            masks = [[num(0x400e21e0 + pat*0x8ed8 + t*0x91a,8) for t in range(3)] for pat in range(3)]
            assert masks == [[0x1008,0x2041,0x8204],[0x4081,0x1109,0x4811],[0x4081,0x2041,0x4811]]
            start_trace()
            tap(PLAY)
            # Start the panel press on the last tick before wrap or first after.
            first = 89 if args.boundary == 'early' else 91
            commit = 90 if first == 89 else 186
            panel_requests = []
            def request(code, pattern, committed, pending, at):
                until(at)
                assert tick == at
                if args.reference:
                    cmd(f'poke 0x800065c0 {pattern:02x}')
                else:
                    cmd(f'key {32 + code//8} {1 << (code%8)}')
                    observations = []
                    for elapsed in range(1,21):
                        advance(1)
                        observations.append(dict(ms=elapsed, tick=tick,
                            playing=num(origin+witness['offsets']['playing']),
                            requested=num(origin+witness['offsets']['requested']),
                            diag=diag() & 0xffffff, wraps=wraps[:]))
                        args.output.with_suffix('.phase-'+str(at)+'.json').write_text(json.dumps(observations))
                        if diag() & 0xffffff == pending << 12 | committed:
                            break
                    expect(committed, pending)
                    # The published diagnostic is refreshed by module_tick.
                    # Record the observed refresh separately from the panel edge.
                    panel_requests.append(dict(edge=at, observed=tick, playing=committed, pending=pending))
                advance(35)
                if not args.reference:
                    cmd(f'key {32 + code//8} 0')
                advance(35)
            request(4, 1, 0, 0x111, first)
            if not args.reference:
                tap(ARR)
                move_focus(-1)
            # The UI diagnostic is refreshed by module_tick after dispatch.
            until(commit + 1)
            if not args.reference:
                expect(0x111, 0x111)
            request(0, 2, 0x111, 0x101, first + 96)
            until(commit + 96 + 16)
            if not args.reference:
                expect(0x101, 0x101)
            args.output.write_text(json.dumps(dict(events=events, wraps=wraps, writes=writes, states=states,
                                                  panel_requests=panel_requests)))
            # Keep the strict historical diagnostic check after recording the
            # musical trace so a display-cadence change remains diagnosable.
            for request in panel_requests:
                edge = request['edge']
                refresh = 188 if args.boundary == 'late' and edge == 187 else edge
                assert request['observed'] == refresh, ('diagnostic refresh',edge,request)
            sys.exit(0)
        if args.home_control:
            # Same home pattern in both runs. Reference leaves the shelf OFF.
            if not args.reference:
                switch(1)
            sampling = True
            start_trace()
            tap(PLAY)
            until(190 if args.home_control == 'stop' else 219)
            tap(STOP)
            assert not num(0x800065b8)
            sampling = recording = False
            assert events and all(event[-1] == 0 for event in events if event[1] in (AUDIO, MIDI))
            if not args.reference:
                switch(0)
            assert call('modwerk_runtime_free', 0) == free and num(syms['core:owners']) == 0
            origin = next(w[3] for w in writes if w[2] == 0x80001904)
            for _, domains, _, _ in states:
                for domain in domains:
                    for entry in domain:
                        entry[2] = (entry[2] - origin) & 0xffffffff
            args.output.write_text(json.dumps(dict(events=events, states=states, wraps=wraps)))
            sys.exit(0)
        if not args.lane_matrix:
            bank, stride, track_size = 0x400e21e0, 0x8ed8, 0x91a
            assert not num(0x80000034,1)
            sources = list(range(4,12))
            for lane, source in enumerate(sources):
                addr = bank + lane*track_size
                data = bytearray(peek(cmd,addr,1024) + peek(cmd,addr+1024,track_size-1024))
                home = bytes(data)
                data[:8] = (1 | (1 << (lane+2))).to_bytes(8,'big')
                if lane == 0:
                    micro = int.from_bytes(data[0x89a:0x89c],'big')
                    data[0x89a:0x89c] = (micro | (56 << 7)).to_bytes(2,'big')
                if lane == 2:
                    data[0x47] |= 1
                    data[0x52] = 16
                for pat, record in [(source,data),(1,data),(2,home if lane==7 else data)]:
                    for pos in range(0,track_size,128):
                        cmd(f'poke {addr + pat*stride + pos:#x} {record[pos:pos+128].hex()}')
                    cmd(f'poke {bank+pat*stride+0x8e50:#x} {peek(cmd,bank+0x8e50,8).hex()}')
            initial = block(bank,16*stride), bank_parts(), project(args.card)
            if args.performance_overlay and not args.reference:
                switch(1)
                tap(ARR)
                tap(ARR)
                for t, source in enumerate(sources):
                    tap(0x10+t)
                    tap(source)
                tap(ARR)
                move_focus(4)
                tap(0x1b)
                tap(YES)
                tap(ARR)
                for t in range(8):
                    tap(0x10+t)
                    tap(0)
                tap(ARR)
            elif not args.reference:
                switch(1)
                tap(ARR)
                for t, source in enumerate(sources):
                    if t: move_focus(1)
                    tap(source)
                tap(ARR)
                tap(YES)
                tap(4)
                tap(ARR)
                move_focus(-7)
                for t in range(8):
                    if t: move_focus(1)
                    tap(0)
                tap(ARR)
            sampling = True
            start_trace()
            tap(PLAY)
            until(32)
            if args.reference:
                cmd('poke 0x800065c0 01')
            elif args.performance_overlay:
                tap(YES)
            else:
                tap(ARR)
                tap(15)
                tap(15)
                tap(ARR)
                tap(4)
            until(124)
            if args.reference:
                cmd('poke 0x800065c0 02')
            else:
                tap(ARR)
                tap(0)
            until(219)
            sampling = recording = False
            assert wraps == [90,186]
            for tick_no, pc, _, lane, *rest in events:
                if pc in (AUDIO,MIDI):
                    expected = (tick_no >= 90) + (tick_no >= 186) if args.reference else (
                        sources[lane] if tick_no >= 90 and pc == AUDIO and (lane != 7 or tick_no < 186) else 0)
                    assert rest[-1] == expected, (tick_no,lane,rest,expected)
            tap(STOP)
            if not args.reference:
                switch(0)
            assert call('modwerk_runtime_free',0)==free and num(syms['core:owners'])==0
            assert 'errors=0' in cmd('card flush')
            assert initial==(block(bank,16*stride),bank_parts(),project(scratch))
            # Compare musical data after independently asserting each builder's source.
            times = [(pc,addr,width,val) for _,pc,addr,val,width in writes
                     if any(a <= addr < a+96 for a in (0x80001904,0x80001984))]
            if args.observe_queue:
                args.output.with_suffix('.flags.json').write_text(json.dumps(
                    [w for w in writes if 0x46c7fe44 <= w[2] < 0x46c7fe4c]))
            origin = times[0][-1]
            stream = [[pc,addr,width,(val-origin)&0xffffffff] for pc,addr,width,val in times]
            for _,domains,_,_ in states:
                for domain in domains:
                    for entry in domain:
                        entry[2] = (entry[2]-origin)&0xffffffff
            args.output.write_text(json.dumps(dict(events=[e[:5] for e in events], writes=stream, states=states)))
            sys.exit(0)
        if args.lane_matrix:
            # Define the fixture before taking integrity hashes.
            bank, stride = 0x400e21e0, 0x8ed8
            assert not num(0x80000034,1)
            trailer = peek(cmd, bank+0x8e50, 8).hex()
            for pattern in range(16):
                addr = bank + stride*pattern
                cmd(f'poke {addr+0x8e50:#x} {trailer}')
                for lane in range(8):
                    mask = 1 | ((1 + 8*pattern + lane) << 1)
                    cmd(f'poke {addr+lane*0x91a:#x} {mask:016x}')
            original = block(bank, stride*16), bank_parts(), project(args.card)
            def sample(sources):
                start_trace()
                tap(PLAY)
                until(30)
                for kind, expected in [(AUDIO,sources), (MIDI,[0]*8)]:
                    observed = {(e[3],e[5]) for e in events if len(e)==6 and e[1]==kind}
                    assert observed == set(enumerate(expected)), (kind,observed,expected)
                recording_stop()
                tap(STOP)
            def recording_stop():
                global recording
                recording = False
            before = callbacks()
            switch(1)
            tap(ARR)
            rows = [[(r+t)%16 for t in range(8)] for r in range(16)]
            for slot, sources in enumerate(rows):
                move_focus(-7)
                for lane, pat in enumerate(sources):
                    if lane: move_focus(1)
                    tap(pat)
                tap(ARR)
                tap(YES)
                tap(slot)
                tap(ARR)
            tap(ARR)
            for slot in reversed(range(16)):
                tap(slot)
                sample(rows[slot])
            cmd('poke 0x80000034 01')
            advance(100)
            tap(15)
            sample([0]*8)
            cmd('poke 0x80000034 00')
            switch(0)
            assert callbacks()==before and call('modwerk_runtime_free',0)==free
            assert num(syms['core:owners'])==0
            assert 'errors=0' in cmd('card flush')
            assert original==(block(bank,stride*16),bank_parts(),project(scratch))
            args.output.write_text(json.dumps(dict(rows=rows,pool=free,owners=0)))
            sys.exit(0)
