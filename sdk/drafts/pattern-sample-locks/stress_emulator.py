# SPDX-License-Identifier: MIT
"""Maximum native mutation and stock-save regression on a disposable card.

Fixture injection sets existing trigs and empty SAMPLE bytes in both native
copies. The utility is operated through its actual UI. Save/reload are native
engine messages posted with null UI callbacks, on the firmware's own task.
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
def job(port,number,entry):
    # Our header's unused private tail: 0x220..0x330, after its checksum and
    # before its first origin record. Never borrow stock scratch/queue data.
    address=0x100f9220;packet=bytearray(0x110);packet[0]=number
    if number==6:packet[0x106:0x108]=b'\0\1' # current fixture is bank A
    put(port,address,packet);port.command(f'watch {entry:#x},0x40084110')
    call_idle(port,0x40000c3c,0x460d17ce,address)
    entered=False
    for _ in range(300):
        hits=port.command('hits',b'hits ').split()[2:]
        for hit in hits:
            fields=[int(n,16) for n in hit.split(':')]
            if fields[1]==entry:entered=True
            if entered and fields[1]==0x40084110 and fields[8]==0:
                assert fields[9]==1, f'native engine job {number} failed: {fields[9]:#x}'
                port.command('watch off');return
        reply=port.command('run 50');assert 'stop=time' in reply
    raise RuntimeError(f'Native engine job {number} did not complete')
def exercise(port,run,tap,key,encoder,capture,out,reboot):
    assert not reboot
    tap(0x22,1);bank=u32(port,0x46c82456);assert bank==0x400e21e0
    assert port.peek(0x100b14d0,1)==b'\0'
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
    menu(True);capture('stress-512-owned-clear-confirm.png');key('YES');run(300)
    assert read(port,bank,len(source))==source,'default Clear did not clear 512 owned locks'
    key('NO');menu(False);key('YES');run(300);key('NO')
    assert read(port,bank,len(source))==locked
    # Native SAVE PROJECT writes .work then .strd; no module-specific format.
    job(port,17,0x40085736)
    status=port.command('card flush',b'card ');assert 'rw=1' in status and 'errors=0' in status
    before_reload=read(port,bank,0x9b330)
    # Reload the actual saved bank through stock's engine, after corrupting
    # only the disposable fixture's first SAMPLE byte to prove a load occurred.
    put(port,bank+0x78,b'\x7f');put(port,0x1001614e+0x78,b'\x7f')
    job(port,6,0x40085418)
    assert read(port,bank,len(source))==locked,'native save/reload changed audio track records'
    assert read(port,bank+0x8ed80,0xc5b0)==before_reload[0x8ed80:0x9b330], 'native save/reload changed Parts'
    menu(True);capture('stress-512-clear-confirm.png');key('YES');run(300)
    cleared=read(port,bank,len(source));assert cleared==locked,'reload history must be unknown and retained'
    key('NO')
    # Saved project still has 512 locks. Undo removes only the module; stock
    # reload below must recover that project without any module installed.
    assert read(port,0x100fe000,0x1800)==base_map, 'base effect map changed'
    assert port.peek(0x100fc000,4)==base_log_tag, 'base diagnostic log tag changed'
    state.update(bank=bank,locked=locked)
    menu(True);key('NO');capture('removal-open-tracks.png')
    return dict(**profile,maximumNativeLocksWritten=512,maximumNativeLocksCleared=512,reloadedUnknownLocksRetained=True,unrelatedAudioBytesPreserved=True,
        playbackLeftStopped=True,baseEffectMapAndLogTagPreserved=True,nativeSaveProjectCompleted=True,nativeBankReloadCompleted=True,
        nativePartBytesPreserved=True,savedAudioSha256=hashlib.sha256(locked).hexdigest())
def after_undo(port,out):
    manifest=Path(__file__).with_name('manifest.py').read_text()
    for address,length,guard in re.findall(r'stock_guard\((0x[0-9a-f]+),(\d+),"([0-9a-f]+)"',manifest):
        assert hashlib.sha256(port.peek(int(address,16),int(length))).hexdigest()==guard,'stock writer detour not removed'
    for address in (0x4002dc68,0x4002dc90,0x4002dcc4):
        assert hashlib.sha256(port.peek(address,6)).hexdigest()=='d35bfe797abb5bb27e98ec6d4cb422e20c44f307e5d6597af674380832f8dbdf'
    job(port,6,0x40085418)
    assert read(port,state['bank'],len(state['locked']))==state['locked']
    return dict(stockWithoutModuleReloadsSavedLocks=True,allStockSitesRestored=True)
