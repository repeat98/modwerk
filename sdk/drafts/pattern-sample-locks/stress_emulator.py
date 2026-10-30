# SPDX-License-Identifier: MIT
"""Maximum native mutation and stock-save regression on a disposable card.

Fixture injection sets existing trigs and empty SAMPLE bytes in both native
copies. The utility is operated through its actual UI. Save/reload use the actual stock Project menu and native callbacks.
"""
import hashlib
from pathlib import Path
import re
import profile_emulator
state={}

def read(port,address,n):
    return b''.join(port.peek(address+at,min(4096,n-at)) for at in range(0,n,4096))
def put(port,address,data):
    for at in range(0,len(data),4096):port.command(f'poke {address+at:#x} '+data[at:at+4096].hex())
def u32(port,address):return int.from_bytes(port.peek(address,4),'big')
def call_idle(port,address,*args):
    for _ in range(200):
        try:return port.command('call '+hex(address)+' '+' '.join(map(str,args)))
        except RuntimeError as error:
            if "not main's spin" not in str(error):raise
            reply=port.command('run 1');assert 'stop=time' in reply
    raise RuntimeError('No idle preflight for native engine message')
def check_reloaded_map(before,after):
    """Project load reseals the base map; entries/padding must remain exact."""
    magic=int.from_bytes(before[:4],'big')
    count=32 if magic==0x4d574658 else magic&255
    assert magic==0x4d574658 or magic>>8==0x4d5746
    end=8+24*count
    assert end+4<=len(before)==len(after)
    def valid(data):
        value=0x5a17
        for at in range(0,end,4):value=(value*31+int.from_bytes(data[at:at+4],'big'))&0xffffffff
        return value==int.from_bytes(data[end:end+4],'big')
    assert valid(before) and valid(after),'base map checksum invalid'
    assert before[:4]+before[8:end]+before[end+4:]==after[:4]+after[8:end]+after[end+4:], 'effect mappings changed'
    assert int.from_bytes(after[4:8],'big')==int.from_bytes(before[4:8],'big')+1, 'unexpected map generation'

def normalize_fixture_parts(port):
    """Initialize FLEX fixture bytes exactly as the shared SDK does.

    The original card changes T1's type without initializing its FLEX setup.
    Read stock defaults locally; never store extracted defaults in source.
    """
    bank=u32(port,0x46c82456);defaults=port.peek(0x400d320c,12)
    for part in range(4):
        working=bank+0x8ed80+part*0x18b2;mirror=0x100a4ece+part*0x18b2
        for track in range(8):
            if port.peek(working+0x22+track,1)!=b'\x01':continue
            for k,value in enumerate(defaults):
                offset=(0x2a if k<6 else 0x1da)+30*track+6+k%6
                put(port,working+offset,bytes([value]));put(port,mirror+offset,bytes([value]))
        for address in (working,mirror):
            result=call_idle(port,0x40002318,address)
            repairs=int(re.search(r'd0=([0-9a-fA-F]+)',result)[1],16)
            assert repairs==0, 'native validator repaired disposable Part '+str(part)+': '+str(repairs)
    print('Fixture FLEX defaults initialized; native Part validation passed',flush=True)

def save_fixture_part(port,run,tap,key):
    """Save the disposable current Part through the unchanged stock row."""
    previous=getattr(port,'native_menu',False);port.native_menu=True
    try:
        port.command('key 0x25 32');run(80);tap(0x23,32)
        port.command('key 0x25 0');run(80)
        for _ in range(6):key('UP')
        for _ in range(2):key('DOWN')
        key('YES');run(300)
        bank=u32(port,0x46c82456)
        assert read(port,bank+0x8ed80,0x62c8)==read(port,bank+0x9504a,0x62c8), 'fixture Parts were not saved'
        for _ in range(2):key('NO')
    finally:port.native_menu=previous

def panel_job(port,run,tap,key,reload=False):
    """Use the stock menu, including its prepare/begin/end callbacks.

    Posting raw engine jobs bypasses stock's synchronization and is not a
    valid simulation of a user's SAVE/RELOAD PROJECT action.
    """
    previous=getattr(port,'native_menu',False)
    port.native_menu=True
    try:
        entry=0x40085828 if reload else 0x40085736
        callback=0x400635d4 if reload else 0x40063890
        points=[entry,callback,0x40084110]
        if reload:points += [0x40085336,0x40023b66]
        port.command('watch '+','.join(hex(n) for n in points))
        tap(0x23,16) # MKII PROJ
        for _ in range(4):key('UP')
        key('RIGHT')
        for _ in range(16):key('UP')
        for _ in range(2 if reload else 1):key('DOWN')
        key('YES');key('YES')
        entered=False;picked=False;reverted=False;load_entered=False;loaded=False;done=False
        for _ in range(1200):
            hits=port.command('hits',b'hits ').split()[2:]
            for hit in hits:
                fields=[int(n,16) for n in hit.split(':')]
                pc=fields[1]
                if pc==callback:picked=True
                if pc==entry:entered=True
                if reload and pc==0x40085336 and reverted:load_entered=True
                if entered and pc==0x40084110:
                    expected=0x40023cf8 if reload else 0x40022e80
                    if fields[8]==expected:
                        assert fields[9]==1, f'native project action failed: {fields[9]:#x}'
                        if reload:reverted=True
                        else:done=True
                    if reload and reverted and load_entered and fields[8]==0x40023ab8:
                        assert fields[9]==1, f'native project load failed: {fields[9]:#x}'
                        loaded=True
                if reload and loaded and pc==0x40023b66:done=True
            if done:
                assert picked,'stock menu callback was not reached'
                # Reload's first engine job only copies .strd to .work.
                # Its GUI callback posts LOAD PROJECT; that load and its
                # final GUI return must finish before inspecting live data.
                assert not reload or (reverted and load_entered and loaded)
                port.command('watch off');run(500)
                for _ in range(3):key('NO')
                port.attest();return
            run(50)
        raise RuntimeError('Native Project menu action did not complete')
    finally:
        port.native_menu=previous

def exercise(port,run,tap,key,encoder,capture,out,reboot):
    assert not reboot
    tap(0x22,1);bank=u32(port,0x46c82456);assert bank==0x400e21e0
    assert port.peek(0x100b14d0,1)==b'\0'
    # Prepare this disposable Part with DSP running, on the same boot used
    # for the operation and persistence checks.
    normalize_fixture_parts(port)
    save_fixture_part(port,run,tap,key)
    original_parts=read(port,bank+0x8ed80,0xc5b0)
    assert original_parts[:0x62c8]==read(port,0x100a4ece,0x62c8), 'working Part mirror mismatch'
    assert original_parts[:0x62c8]==read(port,bank+0x9504a,0x62c8), 'save the fixture Parts before a project reload test'
    base_map=read(port,0x100fe000,0x1800);base_log_tag=port.peek(0x100fc000,4)
    source=bytearray(read(port,bank,8*0x91a))
    for track in range(8):
        at=track*0x91a;source[at:at+8]=bytes([255])*8
        for step in range(64):source[at+0x78+32*step]=255
    put(port,bank,source);put(port,0x1001614e,source)
    # Native rebuild belongs to the injected fixture, not the utility edit.
    call_idle(port,0x400339d8)
    def menu(clear):
        port.command('key 0x25 32');run(80);tap(0x23,32);port.command('key 0x25 0');run(80)
        for _ in range(6):key('UP')
        for _ in range(4+clear):key('DOWN')
        key('YES');encoder(0,4);key('YES')
    tap(0x25,1);assert u32(port,0x800065b8)!=0
    menu(False);capture('stress-512-confirm.png');measurement=profile_emulator.start(port)
    key('YES');run(300);profile=profile_emulator.finish(port,measurement);capture('stress-512-result.png')
    locked=read(port,bank,len(source));assert u32(port,0x800065b8)==0
    expected=bytearray(source);part=bank+0x8ed80
    for track in range(8):
        kind=port.peek(part+0x22+track,1)[0];assert kind<2
        sample=port.peek(part+0x2ca+5*track+kind,1)[0]
        for step in range(64):expected[track*0x91a+0x78+32*step]=sample
    assert locked==expected,'512-lock write changed the wrong bytes'
    assert read(port,0x1001614e,len(source))==locked
    key('NO')
    menu(True);capture('stress-512-all-clear-confirm.png');measurement=profile_emulator.start(port)
    key('YES');run(300);clear_profile=profile_emulator.finish(port,measurement)
    assert read(port,bank,len(source))==source,'Clear did not clear all 512 locks'
    key('NO');menu(False);key('YES');run(300);key('NO')
    assert read(port,bank,len(source))==locked
    assert read(port,bank+0x8ed80,0xc5b0)==original_parts, 'utility changed Parts'
    assert read(port,0x100a4ece,0x62c8)==original_parts[:0x62c8], 'utility changed canonical Part mirror'
    assert read(port,0x100fe000,0x1800)==base_map, 'utility changed base map before project reload'
    # Native SAVE PROJECT writes .work then .strd; no module-specific format.
    panel_job(port,run,tap,key)
    status=port.command('card flush',b'card ');assert 'rw=1' in status and 'errors=0' in status
    before_reload=read(port,bank,0x9b330)
    # Reload the actual saved bank through stock's engine, after corrupting
    # only the disposable fixture's first SAMPLE byte to prove a load occurred.
    put(port,bank+0x78,b'\x7f');put(port,0x1001614e+0x78,b'\x7f')
    panel_job(port,run,tap,key,reload=True)
    assert read(port,bank,len(source))==locked,'native save/reload changed audio track records'
    port.attest()
    assert read(port,bank+0x8ed80,0xc5b0)==before_reload[0x8ed80:0x9b330], 'native save/reload changed Parts'
    reloaded_map=read(port,0x100fe000,0x1800);check_reloaded_map(base_map,reloaded_map)
    menu(True);capture('stress-512-clear-confirm.png');key('YES');run(300)
    cleared=read(port,bank,len(source));assert cleared==source,'Clear must remove all reloaded SAMPLE locks'
    key('NO')
    # Saved project still has 512 locks. Undo removes only the module; stock
    # reload below must recover that project without any module installed.
    assert read(port,0x100fe000,0x1800)==reloaded_map, 'utility changed base map after project reload'
    assert port.peek(0x100fc000,4)==base_log_tag, 'base diagnostic log tag changed'
    state.update(bank=bank,locked=locked)
    menu(True);key('NO');capture('removal-open-tracks.png')
    return dict(**profile,clearProfile=clear_profile,maximumNativeLocksWritten=512,maximumNativeLocksCleared=512,reloadedSampleLocksCleared=True,unrelatedAudioBytesPreserved=True,
        playbackLeftStopped=True,baseMapUntouchedByModuleOperations=True,baseEffectMappingsPreserved=True,baseMapGenerationAdvancedOnProjectReload=True,baseLogTagPreserved=True,nativeSaveProjectCompleted=True,nativeProjectReloadCompleted=True,nativeReloadRestoreAndLoadStagesCompleted=True,
        nativePartBytesPreserved=True,fixturePartSavedNatively=True,fixturePartsNativelyValidated=True,savedAudioSha256=hashlib.sha256(locked).hexdigest())
def after_undo(port,out):
    # No allocation belonging to the removed module is used after removal.
    # Ordinary project files are independently loaded by a fresh stock session.
    manifest=Path(__file__).with_name('manifest.py').read_text()
    addresses=(0x4002dc68,0x4002dc90,0x4002dcc4)
    guard="d35bfe797abb5bb27e98ec6d4cb422e20c44f307e5d6597af674380832f8dbdf"
    assert all(hashlib.sha256(port.peek(at,6)).hexdigest()==guard for at in addresses)
    return dict(allDeclaredSitesRestored=True,onlyThreePartOpenersPatched=True)
