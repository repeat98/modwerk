"""Compose private compiled recorder and engine observers in a full stock boot.

Normal panel input, real scheduler and both DSPs; eight reserved audio pages.
No production source admission, package, device, card save or timing claim.
"""
import argparse
from collections import Counter
import importlib.util
import json
from pathlib import Path
import shutil
import struct
import sys
import wave
from boot_observe import Port,digest
from boot_formats import observe
from boot_writer import hits,writes
from boot_recorder import key,record,snapshot,state_changes
from boot_source_native import call_original
from boot_engine_native import tap as editor_tap
from inspect_stock import STOCK_MAIN_SHA256
ROOT=Path(__file__).resolve().parent
ARENA_SHA='23c89015c010ce9d4e6e7957f9325b7da78b7ba75144de10d56cb22149f21e61'

def main():
    p=argparse.ArgumentParser(description=__doc__)
    for name in ('emulator','main','card','wav','output','arena-tool','native'):p.add_argument('--'+name,type=Path,required=True)
    p.add_argument('--profile-markers',type=int,choices=(64,),help='Create a stock 64-slice grid before the lock profile and use RAW/64-beat preview requests.')
    p.add_argument('--profile-locks',action='store_true',help='Measure exact source-mask instruction intervals in the first engine preview; not hardware latency.')
    p.add_argument('--lifecycle',action='store_true',help='Exercise exact wake identity, WAITING cancellation and fixed-owner retirement.')
    p.add_argument('--service',action='store_true',help='Run previews only through normal engine idle/job scheduling.')
    p.add_argument('--preview',action='store_true',help='Exercise private fixed-lifetime Flex previews with the shared guard.')
    p.add_argument('--card-sha256',required=True)
    p.add_argument('--allow-private-injection',action='store_true',required=True)
    a=p.parse_args()
    if a.profile_markers:a.profile_locks=True
    if a.lifecycle or a.profile_locks:a.service=True
    if a.service:a.preview=True
    if not __debug__:p.error('Assertions must remain enabled.')
    out,repo=a.output.resolve(),ROOT.parents[2]
    if out.exists() or out==repo or repo in out.parents:p.error('Use fresh private output outside Git.')
    if digest(a.main)!=STOCK_MAIN_SHA256 or digest(a.card)!=a.card_sha256 or digest(a.arena_tool)!=ARENA_SHA:p.error('Private input identity differs.')
    native_name='recorder-service' if a.service else ('recorder-source' if a.preview else 'recorder-engine')
    native=json.loads((a.native/(native_name+'.json')).read_text())
    if a.preview and not native.get('sourcePreviewEnabled'):p.error('Compile the source fixture first.')
    if a.service and not native.get('enginePreviewService'):p.error('Compile the engine service fixture first.')
    preparation_enabled=bool(native.get('preparationEnabled',False))
    binary,symbols_path=a.native/(native_name+'.bin'),a.native/(native_name+'.symbols')
    if native['textBase']!=0x46019df0 or digest(binary)!=native['binarySha256'] or digest(symbols_path)!=native['symbolsSha256']:p.error('Native fixture identity differs.')
    for name,expected in native['sourceSha256'].items():
        if digest(ROOT/name)!=expected:p.error('Native source differs: '+name)
    for name,expected in native['sdkDependencySha256'].items():
        if digest(repo/name)!=expected:p.error('SDK input differs: '+name)
    symbols={r.split()[2]:int(r.split()[0],16) for r in symbols_path.read_text().splitlines()}
    spec=importlib.util.spec_from_file_location('beat_slicer_arena',a.arena_tool)
    arena=importlib.util.module_from_spec(spec);sys.modules[spec.name]=arena;spec.loader.exec_module(arena)
    placed,pool_base,pool_count=arena.layout([('recorder-engine-fixture','top',8)]);reserve=placed[0]
    assert reserve.start+16==native['textBase'] and symbols['_end']+32<=reserve.end
    assert pool_base==0x40a955e0 and pool_count==14594
    private_main=bytearray(a.main.read_bytes())
    for address,expected,value,_ in arena.pokes([('recorder-engine-fixture','top',8)]):
        at=address-0x40000400;assert private_main[at:at+len(expected)]==expected
        private_main[at:at+len(value)]=value
    with wave.open(str(a.wav),'rb') as f:
        if (f.getnchannels(),f.getsampwidth(),f.getframerate(),f.getnframes())!=(2,2,44100,44100):p.error('Wrong original WAV fixture.')
        raw=f.readframes(f.getnframes())
    original=list(struct.unpack('<'+'h'*(len(raw)//2),raw))
    out.mkdir(parents=True);patched=out/'reserved-main.private.bin';patched.write_bytes(private_main)
    card=out/'card.private.img';shutil.copyfile(a.card,card)
    command=[str(a.emulator.resolve()),'--image',str(patched),'--card',str(card),'--mount',
        '--set','BEATLAB','--project','PROJECT 261023','--load-ms','90000','--dsp','--frame',
        '--ms','3000','--interactive','--main-level','off','--rtc','host','--mkii','--lcd',str(out/'lcd.private.bin')]
    port=Port(command,out);results=[];preview_results=[];invalidations=[]
    if a.preview:
        import test_planner as ffi
        ffi.PlannerTests.setUpClass();oracle=ffi.PlannerTests()
    try:
        port.reply(b'ready ',timeout=600);assert port.loaded
        folder=out/'loaded';folder.mkdir();loaded=observe(port,16,2,original,folder)
        for address,_,value,_ in arena.pokes([('recorder-engine-fixture','top',8)]):assert port.peek(address,len(value))==value
        data=binary.read_bytes();assert len(data)<=symbols['__bss_start']-native['textBase']
        def poke(address,value):
            for at in range(0,len(value),4096):port.command(f'poke {address+at:#x} '+value[at:at+4096].hex())
        poke(reserve.start,bytes([0xa5])*(reserve.end-reserve.start));poke(native['textBase'],data)
        poke(symbols['__bss_start'],bytes(symbols['_end']-symbols['__bss_start']))
        assert call_original(port,symbols['bs_recorder_engine_init'])==0
        g_at,b_at,e_at=(symbols[n] for n in ('bs_recorder_test_guard','bs_recorder_test_boundary','bs_recorder_engine_boundary'))
        assert struct.unpack('>12I',port.peek(g_at,48))[2]==0,'Bootstrap admitted readers'
        original_receive=port.peek(0x40084854,6)
        assert original_receive[:2]==bytes.fromhex('4eb9') and int.from_bytes(original_receive[2:],'big')==0x40000d00
        for group,prefix in (('hookSites','bs_recorder_'),('engineHookSites','bs_recorder_engine_'),('preparationHookSites','bs_recorder_prepare_')):
            for name,site in native.get(group,{}).items():
                import hashlib
                assert hashlib.sha256(port.peek(site['address'],site['length'])).hexdigest()==site['sha256']
                patch=bytes.fromhex('4ef9')+symbols[prefix+name+'_entry'].to_bytes(4,'big')
                if site['length']==8:patch+=bytes.fromhex('4e71')
                assert len(patch)==site['length'];poke(site['address'],patch)
        checkpoints={'retries':0,'emptyScopeUnbalancedDiagnostics':0,'maxRetries':0}
        def native_state(enabled=True,need_idle=True):
            for _ in range(200):
                g=struct.unpack('>12I',port.peek(g_at,48));b=struct.unpack('>19I',port.peek(b_at,76));e=struct.unpack('>4I',port.peek(e_at,16))
                assert b[0]==e[0]==g_at and not b[2] and not e[3] and not g[3],'Native observer fault'
                empty=not b[1] and not e[1] and not any(g[4:])
                diagnostics={}
                for label,prefix in (('recorder','bs_recorder_test_'),('preparation','bs_recorder_prepare_')):
                    if prefix+'enter_masks' in symbols:
                        masks=[int.from_bytes(port.peek(symbols[prefix+suffix+'_masks'],4),'big') for suffix in ('enter','leave')]
                        counts=[int.from_bytes(port.peek(symbols[prefix+suffix],4),'big') for suffix in ('entries','exits')]
                        diagnostics[label]=(masks,counts)
                balanced=all(c[0]==c[1] and m[0]==m[1] for m,c in diagnostics.values())
                if empty and balanced:
                    checkpoints['maxRetries']=max(checkpoints['maxRetries'],_);break
                checkpoints['retries']+=1
                if empty and not balanced:checkpoints['emptyScopeUnbalancedDiagnostics']+=1
                port.command('run 0.1')
            else:raise AssertionError('Native observers did not reach a bounded quiescent checkpoint')
            assert bool(g[2])==enabled and (e[2] or not need_idle)
            assert not any(b[3:]),'Recorder scope leaked'
            entries=int.from_bytes(port.peek(symbols['bs_recorder_test_entries'],4),'big')
            exits=int.from_bytes(port.peek(symbols['bs_recorder_test_exits'],4),'big')
            assert entries==exits,'Recorder entries/returns differ at quiescence'
            result={'revision':g[0],'serial':g[1],'entries':entries,'exits':exits,'engineIdleSeen':e[2]}
            for label,prefix in (('recorder','bs_recorder_test_'),('preparation','bs_recorder_prepare_')):
                if prefix+'enter_masks' in symbols:
                    masks,counts=diagnostics[label]
                    assert counts[0]==counts[1] and masks[0]==masks[1] and (not counts[0] or masks[0]),'Caller-mask/counter trace differs'
                    result[label+'ScopesEntered']=counts[0]
                    result[label+'CallerMaskLevels']=[level for level in range(8) if masks[0]&(1<<level)]
            return result
        port.command('run 500')
        # The saved project's first editor binding is empty Static. Merely
        # opening AED does not queue a waveform job. Use the previously proved
        # normal-panel Flex assignment/selection path to obtain a real job/idle
        # pair after an observer installed during an already waiting receive.
        if not int.from_bytes(port.peek(e_at+8,4),'big'):
            for name in ('aed','edit','no','playback','playback','yes','no'):editor_tap(port,name)
            port.command('key 0x26 8');port.command('run 60');editor_tap(port,'track1')
            port.command('key 0x26 0');port.command('run 60')
            for name in ('aed','edit','yes','yes'):editor_tap(port,name)
            port.command('run 1000')
            assert int.from_bytes(port.peek(0x46c8d1a0,4),'big')==1
            assert int.from_bytes(port.peek(0x46c8d19c,4),'big')==0
        closed=native_state(False)
        if a.profile_markers:
            from boot_slices import choose,menu as stock_menu
            port.command('key 0x24 8');port.command('run 60')
            port.command('key 0x24 0');port.command('run 1000')
            editor_tap(port,'yes');choose(port,'CREATE SLICE GRID')
            labels=stock_menu(port);assert labels.count('64 SLICES')==1
            target=labels.index('64 SLICES')
            for _ in range(len(labels)):
                selected=int.from_bytes(port.peek(0x460e5e40,4),'big')
                if selected==target:break
                editor_tap(port,'down' if selected<target else 'up')
            assert int.from_bytes(port.peek(0x460e5e40,4),'big')==target
            editor_tap(port,'yes');editor_tap(port,'no');port.command('run 1500')
            assert int.from_bytes(port.peek(0x100b14f0+1092,4),'big')==64
        folder=out/'prepared';folder.mkdir();baseline=observe(port,16,2,original,folder)
        assert baseline['pcmSha256']==loaded['pcmSha256'] and baseline['controlsSha256']==loaded['controlsSha256']
        initial_settings=(out/'loaded/settings.private.bin').read_bytes()
        prepared_settings=(out/'prepared/settings.private.bin').read_bytes()
        changed=[i for i in range(274) if initial_settings[4*i:4*i+4]!=prepared_settings[4*i:4*i+4]]
        assert int.from_bytes(initial_settings[1084:1088],'big')==0
        if a.profile_markers:
            assert 271 in changed and 273 in changed and set(changed)<={271,273,*range(78,270)}
        else:assert changed==[271]
        assert int.from_bytes(prepared_settings[1084:1088],'big')==44100,'SELECT ALL preparation differs'
        assert call_original(port,symbols['bs_recorder_engine_enable'],wait_ms=1)==0
        initial_native=native_state()
        def call(name):return call_original(port,symbols[name],wait_ms=1)
        def word(name):return int.from_bytes(port.peek(symbols[name],4),'big')
        def plan_bytes():return port.peek(symbols['bs_recorder_service_result_copy']+8 if a.service else symbols['bs_boot_plan'],524)
        result_name='bs_recorder_service_result' if a.service else 'bs_boot_result'
        work_name='bs_recorder_preview_state' if a.service else 'bs_recorder_preview_work'
        tasks={name:set() for name in ('query','engine','producer')}
        task_addresses={}
        if a.service:
            task_addresses={symbols['bs_boot_queries']:'query',symbols['bs_recorder_service_calls']:'engine',
                symbols['bs_recorder_service_requests']:'producer'}
            for address in task_addresses:port.command(f'watchmem {address:#x} 4')
        def take_writes():
            rows=writes(port)
            for row in rows:
                if row[2] in task_addresses:tasks[task_addresses[row[2]]].add(row[5])
            return rows

        begin_name='bs_recorder_preview_dense_begin' if a.profile_markers else 'bs_recorder_preview_begin'
        def preview():
            settings=struct.unpack('>274I',port.peek(0x100b14f0,1096))
            project=int.from_bytes(port.peek(0x80001814,4),'big')
            request=oracle.request(existing=[settings[78+3*i] for i in range(settings[273])],
                trim_start=settings[75],trim_end=settings[76],sample_bpm24=settings[69],
                project_bpm24=project,tempo_source=0,snap=0 if a.profile_markers else 1,beats=64 if a.profile_markers else 1,
                reader=lambda frame:(original[2*frame]*256,original[2*frame+1]*256))
            expected=oracle.preview(request)
            before=word('bs_boot_queries')
            request=call(begin_name)
            assert request>0 if a.service else request==1
            for steps in range(10000):
                if a.service:port.command('run 1')
                state=call(work_name)
                if state not in (1,2):break
                if not a.service and steps%32==0:port.command('run 0.1')
            assert state==3,f'Fresh preview ended {state}'
            assert call(result_name)==1
            actual=struct.unpack('>131I',plan_bytes())
            want=(expected.count,expected.bpm24,*expected.starts,*expected.needs_fade,expected.end_needs_fade)
            assert actual==want,'Whole preview differs from host PCM oracle'
            assert word('bs_boot_locks')==word('bs_boot_unlocks')
            count=word('bs_boot_queries')-before;assert count>0
            result={'driverPolls' if a.service else 'steps':steps+1,'queries':count,'markerCount':actual[0],
                'bpm24':actual[1],'existingMarkers':settings[273],'snap':0 if a.profile_markers else 1,'beats':64 if a.profile_markers else 1,'starts':list(actual[2:2+actual[0]]),
                'wholePlanMatchesHostOracle':True,'balancedLocks':True}
            preview_results.append(result);return result
        source_profile=None
        if a.profile_locks:
            # Observe original fixture instructions without inserting callbacks.
            # These exact own-code shapes pin the before-mask and before-restore
            # sites. Unknown compiler output refuses profiling.
            lock_at,unlock_at=symbols['lock'],symbols['unlock']
            assert port.peek(lock_at,6)==bytes.fromhex('40c046fc2700')
            assert port.peek(unlock_at+12,4)==bytes.fromhex('46c04e75')
            mask_at,restore_at=lock_at+2,unlock_at+12
            profile_sites=(mask_at,restore_at,symbols['capture'],symbols['copied'],symbols['query'])
            port.command('watch '+','.join(hex(x) for x in profile_sites));hits(port)
            profile_locks=word('bs_boot_locks');profile_unlocks=word('bs_boot_unlocks')
        if a.preview:
            assert call('bs_recorder_service_init' if a.service else 'bs_boot_init')==0
            preview()
        if a.profile_locks:
            rows=hits(port);port.command('watch off')
            windows=[];active=None
            for row in rows:
                if row[1]==mask_at:
                    assert active is None,'Overlapping source mask intervals'
                    active={'start':row[0],'callerSr':row[2]&0xffff,'captures':0,'copies':0,'queries':0}
                elif row[1]==restore_at:
                    assert active is not None,'Unpaired source restore'
                    assert row[2]&0xffff==active['callerSr'],'Restored SR differs from captured SR'
                    # PC counters precede execution: the delta includes masking,
                    # and one additional instruction includes restoration itself.
                    active['instructions']=row[0]-active.pop('start')+1
                    assert active['instructions']>0 and active['captures'] in ((2,) if active['copies'] else (0,1))
                    assert active['copies'] in (0,1) and active['queries']<=active['copies']
                    windows.append(active);active=None
                else:
                    assert active is not None,'Source operation outside observed mask'
                    active[{symbols['capture']:'captures',symbols['copied']:'copies',symbols['query']:'queries'}[row[1]]]+=1
            assert active is None and windows
            assert len(windows)==word('bs_boot_locks')-profile_locks==word('bs_boot_unlocks')-profile_unlocks
            assert sum(w['queries'] for w in windows)==preview_results[0]['queries']
            groups={}
            for kind in ('coordination','capture','copy'):
                selected=[w for w in windows if ('copy' if w['copies'] else ('capture' if w['captures'] else 'coordination'))==kind]
                assert selected
                values=[w['instructions'] for w in selected]
                groups[kind]={'count':len(values),'min':min(values),'max':max(values),
                    'total':sum(values),'histogram':dict(sorted(Counter(values).items())),
                    'callerInterruptMasks':sorted(set((w['callerSr']>>8)&7 for w in selected))}
            source_profile={'method':'PC instruction counts before source mask and before exact SR restore; includes both instructions; unchanged native code',
                'sites':dict(zip(('mask','restore','capture','copy','query'),profile_sites)),
                'existingMarkers':preview_results[0]['existingMarkers'],'previewSnap':preview_results[0]['snap'],'previewBeats':preview_results[0]['beats'],
                'windows':len(windows),'pcmQueries':sum(w['queries'] for w in windows),'groups':groups,
                'maxInstructions':max(w['instructions'] for w in windows),
                'input':'one-second stereo 16-bit stopped Flex source; full metadata snapshot on source acquisition; async coordination uses the same lock without capture',
                'limits':'executed ColdFire instructions only; no cycle, physical latency, ISR stack, DMA/cache or production admission qualification'}
            print('PASS source mask instruction profile '+str(source_profile['groups']),flush=True)

        port.command(f'watchmem {g_at:#x} 48');port.command(f'watchmem {e_at+4:#x} 4')
        port.command(f'watchmem {b_at+16:#x} 4')
        port.command('watch 0x400068e4,0x40005ff0,0x40005e48')
        def capture(track):native_state();return snapshot(port,track)
        def audit(stores,track,pcm,tail):
            tickets=[0]*8;recorder_ticket=engine_ticket=0;pcm_count=tail_count=recorder_scopes=engine_scopes=0
            uncovered=Counter();covered_state=0;transitions=[]
            for event in stores:
                _,pc,address,value,size,_=event
                if g_at+16<=address<g_at+48:
                    assert size==4 and (address-g_at)%4==0;tickets[(address-g_at-16)//4]=value
                if address==b_at+16:recorder_ticket=value;recorder_scopes+=bool(value)
                if address==e_at+4:engine_ticket=value;engine_scopes+=bool(value)
                if pcm<=address<pcm+64:
                    assert recorder_ticket and recorder_ticket in tickets,'PCM store outside native recorder scope';pcm_count+=1
                if address==tail:
                    assert size==2 and value==0 and pc==0x40095afc
                    assert engine_ticket and engine_ticket in tickets,'Map cleanup outside native engine scope';tail_count+=1
                for bank in range(2):
                    state=0x80004f1c+84*(track+8*bank)
                    if address<state+84 and address+size>state:
                        if any(tickets):covered_state+=1
                        else:uncovered[(hex(pc),size)]+=1
                    if address<=state+2<address+size:
                        change=state_changes([event],track);assert len(change)==1
                        transitions.append({**change[0],'guarded':bool(any(tickets)),
                            'recorderGuarded':bool(recorder_ticket and recorder_ticket in tickets),
                            'engineGuarded':bool(engine_ticket and engine_ticket in tickets)})
            assert not any(tickets) and not recorder_ticket and not engine_ticket,'Trace did not retire at checkpoint'
            return {'pcmPrefixStores':pcm_count,'mapTailStores':tail_count,'recorderScopes':recorder_scopes,'engineScopes':engine_scopes,
                'guardedRecorderStateStores':covered_state,'unguardedRecorderStateStores':[{'pc':pc,'bytes':size,'count':count} for (pc,size),count in sorted(uncovered.items())],
                'stateTransitions':transitions}
        for track in (0,7):
            before_native=native_state();initial=capture(track);assert initial['states']==[0,0]
            row=0x46c2e9c0+2*(track+2)*14602;first=int.from_bytes(port.peek(row,2),'big')
            count=int.from_bytes(port.peek(0x46c75e88+2*(128+track),2),'big')
            assert 0<first<=pool_count and count==460
            pcm=pool_base+first*6144;tail=row+2*14601
            port.command(f'watchmem {pcm:#x} 64');port.command(f'watchmem {tail:#x} 2')
            for bank in range(2):port.command(f'watchmem {0x80004f1c+84*(track+8*bank):#x} 84')
            if a.preview:
                if track==0 and not a.service:
                    assert call(begin_name)==1
                    queries=word('bs_boot_queries')
                    for _ in range(200):
                        assert call('bs_recorder_preview_work')==1
                        if word('bs_boot_queries')>queries:break
                    else:raise AssertionError('Running preview never copied a positive PCM block')
                    assert call('bs_recorder_preview_state')==1
                else:preview()
                prior_state=call('bs_recorder_preview_state')
                assert prior_state==(1 if track==0 and not a.service else 3)
                before_queries,before_plan=word('bs_boot_queries'),plan_bytes()
                before_revision=native_state()['revision']
                assert call('bs_recorder_preview_revision')==before_revision
                assert native_state()['revision']==before_revision,'Preview was stale before recording input'
            native_state();hits(port);take_writes()
            record(port,track);port.command('run 200');started=capture(track)
            if a.preview:
                assert native_state()['revision']>before_revision
                assert call(result_name)==0 and plan_bytes()==before_plan
                assert call(work_name)==5 and word('bs_boot_queries')==before_queries
                invalidations.append({'track':track+1,'priorState':'RUNNING' if prior_state==1 else 'READY',
                    'staleBeforeFurtherCopy':True,'resultOutputUntouched':True,'guardRevisionAdvanced':True})

            port.command('run 300');advanced=capture(track)
            assert started['states'][started['bank']]==2 and advanced['published']>started['published']>0
            record(port,track);port.command('run 200');retriggered=capture(track)
            assert retriggered['bank']==1-started['bank'] and retriggered['states']==[2,2]
            assert 0<retriggered['published']<advanced['published']
            port.command('run 300');before_stop=capture(track)
            key(port,'stop',True);key(port,'stop',False);port.command('run 500');stopped=capture(track)
            assert stopped['bank']==retriggered['bank'] and stopped['states'][stopped['bank']]==0
            assert stopped['states'][1-stopped['bank']]==2 and stopped['positions'][stopped['bank']]==0
            assert stopped['published']>=before_stop['published'] and stopped['queueCounts']==[0,0]
            calls,stores=hits(port),take_writes();coverage=audit(stores,track,pcm,tail)
            assert coverage['pcmPrefixStores'] and coverage['mapTailStores'] and coverage['recorderScopes'] and coverage['engineScopes']
            assert [(r['bank'],r['value'],r['bytes']) for r in coverage['stateTransitions']]==[(1,1,4),(1,2,1),(0,1,4),(0,2,1),(0,0,1)]
            recorder=[r for r in calls if r[1]==0x400068e4 and r[8]==track]
            callers=Counter(hex(r[7]) for r in recorder)
            assert set(callers)=={'0x4000d342','0x4000d36e'} and len(set(callers.values()))==1
            preparation=[r for r in calls if r[1]==0x40005ff0 and r[8]==track]
            stops=[r for r in calls if r[1]==0x40005e48 and r[8]==track]
            assert len(preparation)==2 and [r[9] for r in preparation]==[0x9010,0x1010]
            assert all(r[7]==0x4000d35c for r in preparation)
            # The stock caller pushes and pops TWO preparation arguments. The
            # following watched stack words belong to its own frame, not this ABI.
            assert len(stops)==1 and stops[0][7]==0x40007942 and stops[0][9]>0 and stops[0][10:12]==[0,0]
            assert [r['recorderGuarded'] for r in coverage['stateTransitions']]==([True]*5 if preparation_enabled else [False,True,False,True,True])
            assert sum(x['count'] for x in coverage['unguardedRecorderStateStores'])==(0 if preparation_enabled else 24)
            port.command('run 500');idle=capture(track);idle_coverage=audit(take_writes(),track,pcm,tail)
            assert idle==stopped and not idle_coverage['pcmPrefixStores'] and not idle_coverage['mapTailStores'] and not idle_coverage['recorderScopes']
            assert int.from_bytes(port.peek(row,2),'big')==first and int.from_bytes(port.peek(0x46c75e88+2*(128+track),2),'big')==count
            if a.preview:
                # Stopping cannot revive a retired token or reveal its old output.
                assert call(work_name)==5 and call(result_name)==0
                assert word('bs_boot_queries')==before_queries and plan_bytes()==before_plan
                invalidations[-1]['oldTokenStillStaleAfterStop']=True
                editor=[int.from_bytes(port.peek(address,4),'big') for address in (0x46c8d1a0,0x46c8d19c)]
                invalidations[-1]['editorAfterStop']=editor
                if track==7:
                    assert editor[0]==0
                    editor_tap(port,'track1');port.command('run 500');native_state()
                    invalidations[-1]['sourceRestoredViaTrack1']=True
                    assert call(work_name)==5 and call(result_name)==0
                    assert word('bs_boot_queries')==before_queries and plan_bytes()==before_plan
                assert int.from_bytes(port.peek(0x46c8d1a0,4),'big')==1
                assert int.from_bytes(port.peek(0x46c8d19c,4),'big')==0
                invalidations[-1]['freshPreviewAfterStop']=preview()
            folder=out/f'after-track-{track+1}';folder.mkdir();after=observe(port,16,2,original,folder)
            assert after['settingsSha256']==baseline['settingsSha256'] and after['controlsSha256']==baseline['controlsSha256']
            for at in range(0,len(data),4096):assert port.peek(native['textBase']+at,min(4096,len(data)-at))==data[at:at+4096]
            assert port.peek(reserve.start,16)==bytes([0xa5])*16 and port.peek(symbols['_end'],32)==bytes([0xa5])*32
            assert port.peek(0x40084854,6)==original_receive
            state=native_state()
            if preparation_enabled:assert state['preparationScopesEntered']-before_native['preparationScopesEntered']==2
            results.append({'track':track+1,'reservedRecorderPages':count,'firstRecorderPage':first,
                'initial':initial,'started':started,'advanced':advanced,'retriggered':retriggered,'stopped':stopped,'idle':idle,
                'callerCounts':dict(callers),'preparationCalls':[{'caller':hex(r[7]),'arguments':r[8:10],'adjacentCallerWords':r[10:12]} for r in preparation],
                'stopCalls':[{'caller':hex(r[7]),'arguments':r[8:12]} for r in stops],'coverage':coverage,'idleCoverage':idle_coverage,'nativeState':state,
                'unrelatedFlexPreserved':True,'nativeCodeAndCanariesIntact':True})
            print(f'PASS track {track+1}: native PCM/cleanup tickets; uncovered recorder-state stores {sum(x["count"] for x in coverage["unguardedRecorderStateStores"])}',flush=True)
        if a.lifecycle:
            # Two identical payloads from distinct immutable records. Queue the
            # foreign record FIRST while an owned wake is outstanding, so a
            # blanket opcode/pending exemption cannot accidentally pass.
            wake_at,foreign_at=symbols['wake_message'],symbols['foreign_message']
            assert wake_at!=foreign_at and port.peek(wake_at,4)==port.peek(foreign_at,4)==bytes([255,0,0,0])
            before_queries,before_plan=word('bs_boot_queries'),plan_bytes()
            before_revision=native_state()['revision']
            assert call('bs_recorder_service_wake_audit_begin')==0
            assert call('bs_recorder_service_foreign_then_own')==0
            port.command('run 5')
            count=call('bs_recorder_service_wake_audit_end')
            assert count==2,'Unexpected extra work in the exact two-record wake test'
            rows=[list(struct.unpack('>3I',port.peek(symbols['bs_recorder_wake_audit']+12*i,12))) for i in range(count)]
            assert rows==[[foreign_at,0,1],[wake_at,1,1]],'Wake ownership was inferred from opcode or pending alone'
            assert native_state()['revision']>before_revision
            assert call(work_name)==5 and call(result_name)==0
            assert word('bs_boot_queries')==before_queries and plan_bytes()==before_plan
            wake_case={'identicalPayloadsDistinctPointers':True,'decisions':rows,
                'foreignInvalidatedReady':True,'noFurtherPcmRead':True,'oldOutputUnchanged':True}
            preview()
            # An unavailable source does not self-poll. Cancellation stays in
            # force when the independent writer later retires and wakes engine.
            assert call('bs_recorder_service_block')>0
            before_queries,before_plan=word('bs_boot_queries'),plan_bytes()
            waiting_request=call(begin_name);assert waiting_request>0
            port.command('run 5');assert call(work_name)==2
            posted=word('bs_recorder_service_posted');assert not word('bs_recorder_service_pending')
            port.command('run 200');assert call(work_name)==2
            assert word('bs_recorder_service_posted')==posted and word('bs_boot_queries')==before_queries
            cancelled=call('bs_recorder_service_cancel');assert cancelled>waiting_request
            port.command('run 5');assert call(work_name)==4 and call(result_name)==0
            assert call('bs_recorder_service_unblock')==0
            port.command('run 200');assert call(work_name)==4 and call(result_name)==0
            assert word('bs_boot_queries')==before_queries and plan_bytes()==before_plan
            native_state()
            waiting_case={'waitingRequest':waiting_request,'cancelRequest':cancelled,
                'noSelfWakeDuring200msEmulatedWait':True,'noPcmReadWhileBlocked':True,
                'unblockDoesNotReviveCancelledWork':True,'oldOutputUnchanged':True}
            preview()
            before_queries,before_plan=word('bs_boot_queries'),plan_bytes()
            assert call('bs_recorder_service_revoke')==0
            port.command('run 5');assert call(work_name)==4 and call(result_name)==0
            assert call(begin_name)==0
            port.command('run 200');assert call(work_name)==4 and call(result_name)==0
            assert word('bs_boot_queries')==before_queries and plan_bytes()==before_plan
            lifecycle={'wakeIdentity':wake_case,'waitingCancellation':waiting_case,
                'ownerRetirement':{'newRequestRefused':True,'noFurtherPcmRead':True,'oldOutputUnchanged':True}}
            folder=out/'after-lifecycle';folder.mkdir();after=observe(port,16,2,original,folder)
            assert after['settingsSha256']==baseline['settingsSha256'] and after['controlsSha256']==baseline['controlsSha256']
            for at in range(0,len(data),4096):assert port.peek(native['textBase']+at,min(4096,len(data)-at))==data[at:at+4096]
            assert port.peek(reserve.start,16)==bytes([0xa5])*16 and port.peek(symbols['_end'],32)==bytes([0xa5])*32
            native_state();print('PASS exact wake identity, nonpolling WAITING cancellation and fixed-owner retirement',flush=True)
        if a.service:
            take_writes()
            assert len(tasks['engine'])==len(tasks['producer'])==1 and tasks['engine'].isdisjoint(tasks['producer'])
            assert tasks['query']==tasks['engine'],'Live source lookup escaped the engine task'
            assert word('bs_recorder_service_max_steps')==1
            assert word('bs_recorder_service_pending')==0
            assert word('bs_recorder_service_posted')==word('bs_recorder_service_consumed')
            service_counts={name:word('bs_recorder_service_'+name) for name in
                ('calls','requests','steps','begins','max_steps','posted','consumed','pending')}
    finally:
        port.close()
        if a.preview:ffi.PlannerTests.tearDownClass()
    assert digest(card)==a.card_sha256 and digest(a.card)==a.card_sha256
    names=('boot_recorder_engine.py','boot_engine_native.py','boot_recorder.py','boot_source_native.py','boot_worker_native.py','boot_writer.py',
        'boot_formats.py','boot_observe.py','boot_slices.py','boot_static.py','test_planner.py','inspect_stock.py',*native['sourceSha256'].keys())
    report={'scope':'Private reserved-memory recorder/engine observer composition under normal recording/retrigger/STOP; real emulator scheduler/DSPs, no source reader or hardware',
        'sourceSha256':{n:digest(ROOT/n) for n in names},'mainSha256':STOCK_MAIN_SHA256,'reservedMainSha256':digest(patched),
        'nativeReceiptSha256':digest(a.native/(native_name+'.json')),'nativeBinarySha256':digest(binary),'emulatorSha256':digest(a.emulator),
        'sdkRevision':native['sdkRevision'],'sdkDependencySha256':native['sdkDependencySha256'],'codegenGuardSha256':native['codegenGuardSha256'],
        'arenaToolSha256':ARENA_SHA,'reservedPages':8,'physicalUsablePages':pool_count,'cardSha256':a.card_sha256,'wavSha256':digest(a.wav),
        'boundedCheckpointObservations':checkpoints,'preparationBoundaryEnabled':preparation_enabled,'closedBootstrap':closed,'preparationSettingsWordsChanged':changed,'preparedSource':baseline,'initialNative':initial_native,'results':results,'cardUnchanged':True,'receiveCallUnchanged':True,
        'exitCode':0,'hardware':'not tested','audio':'not qualified','physicalTiming':'not measured',
        'nativeSourceAccess':'production not implemented; complete recorder/Pickup, allocator, UI, DMA/cache and physical writer coverage remain open'}
    if a.preview:
        report.update({'scope':'Private shared recorder/engine guard with fixed-lifetime read-only Flex preview invalidation and recovery; borrowed-main driver, not installed service or hardware',
            'sourcePreviewEnabled':True,'previews':preview_results,'invalidations':invalidations,
            'nativeSourceAccess':'fixed synthetic lifetime and borrowed main consumer; production source admission, owner transitions and scheduling remain unimplemented'})
    if a.service:
        report.update({'scope':'Private fixed-lifetime previews run by the stock engine scheduler with recorder/preparation/ordinary-job exclusion; no driver service calls or hardware',
            'enginePreviewService':True,'engineServiceCounts':service_counts,
            'taskIdentities':{name:sorted(values) for name,values in tasks.items()},
            'scheduling':'borrowed-main request/result producer, one engine consumer, exact coalesced immutable wake; ordinary jobs remain writers',
            'nativeSourceAccess':'fixed synthetic lifetime; production owner/source admission, UI integration, DMA/cache and physical timing remain open'})
    if a.lifecycle:report['serviceLifecycle']=lifecycle
    if a.profile_locks:report['sourceMaskProfile']=source_profile
    (out/('recorder-service-boot.json' if a.service else ('recorder-source-boot.json' if a.preview else 'recorder-engine-boot.json'))).write_text(json.dumps(report,indent=2)+'\n')
if __name__=='__main__':main()
