# SPDX-License-Identifier: MIT
"""Native simplified edits on disposable emulator RAM/card copies.

Manual SAMPLE writes use the unchanged native writer with a labelled held-step
fixture. Utility selection, confirmation and STOP use actual panel reports.
"""
import hashlib
import stress_emulator as fixture

STOCK_SITES=(
 (0x40040ee0,'14607b32e7a5a2eae6fcb2e63e1770b2f2387c64c63e6289faf0eb8e75f9aa40'),
 (0x4002c89c,'507353099d0165038c68974b2f57dbdec61e24a2758e47418233ccbcb59b8d96'),
 (0x4002b65c,'ad0bb7f528727c8a2e3fde76c7f1aa5b2bd895933e1e818f75f3f0cd16ddee28'),
 (0x4002b9b0,'efa23c0a55aebcd8ffb29c8ba97d3970d8e88ed9c16272d7b5ea0b4e8309ecf5'),
 (0x4002b3b4,'efa23c0a55aebcd8ffb29c8ba97d3970d8e88ed9c16272d7b5ea0b4e8309ecf5'),
 (0x40039df4,'0c6d3f0bfd198ddc78800e6503eccdc6cbc5c442209d882244584eda864e93ca'),
 (0x400905d4,'604756f90fe2564cd1c75b712a1c239b10ef2db438579e307632b3382bacd165'),
 (0x4008ded0,'f7fddeefeac300af619b7028a954dc595076d9d098da7090973c1cbc1f649ec0'),
)

def unchanged_writers(port):
    for at,digest in STOCK_SITES:
        assert hashlib.sha256(port.peek(at,8)).hexdigest()==digest, 'native writer unexpectedly patched'

def exercise(port,run,tap,key,encoder,capture,out,reboot):
    assert not reboot,'use independent stock-load verification for saved projects'
    def read(at,n):return fixture.read(port,at,n)
    def u32(at):return fixture.u32(port,at)
    def samples(blob):return [blob[0x78+32*i] for i in range(64)]
    def tracks():return read(u32(0x46c82456),8*0x91a)
    def menu(clear,replace=False):
        port.command('key 0x25 32');run(80);tap(0x23,32)
        port.command('key 0x25 0');run(80)
        encoder(6,-24);encoder(6,20 if clear else 16);key('YES')
        encoder(0,-4);encoder(1,4) # T1 only
        if replace:encoder(2,4)
        key('YES')
    def manual(slot,step):
        assert port.peek(0x100b14cc,1)==b'\0'
        fixture.put(port,0x460d174a,(1<<step).to_bytes(2,'big'))
        fixture.call_idle(port,0x40040ee0,slot)
        fixture.put(port,0x460d174a,b'\0\0');run(80)
    unchanged_writers(port)
    private_before=read(0x100f9000,0x3000)
    map_before=read(0x100fe000,0x1800)
    log_tag=port.peek(0x100fc000,4)
    tap(0x22,1)
    # One unselected-track lock is a labelled preservation fixture.
    bank=u32(0x46c82456)
    fixture.put(port,bank+0x91a+0x78,b'\x2a')
    fixture.put(port,0x1001614e+0x91a+0x78,b'\x2a')
    fixture.call_idle(port,0x400339d8)
    tap(0x25,2);tap(0x20,1);tap(0x20,2);manual(1,0);tap(0x25,2)
    before=tracks();assert samples(before)[:2]==[1,255]
    tap(0x25,1);assert u32(0x800065b8)!=0
    menu(False);capture('native-lock-confirm.png');key('YES');run(200)
    capture('native-lock-result.png')
    after=tracks();assert samples(after)[:2]==[1,0] and u32(0x800065b8)==0
    assert all(a==b or i==0x98 for i,(a,b) in enumerate(zip(before,after)))
    assert read(0x1001614e,len(after))==after
    key('NO');menu(False);key('YES');run(160)
    assert tracks()==after,'default Lock replaced an existing lock on repetition'
    key('NO')
    # A same-value manual edit needs no origin observer; Clear includes it.
    tap(0x25,2);manual(0,1);tap(0x25,2)
    menu(True);capture('native-clear-all-confirm.png');key('YES');run(200)
    capture('native-clear-all-result.png')
    cleared=tracks();assert samples(cleared)[:2]==[255,255]
    assert all(a==b or i in (0x78,0x98) for i,(a,b) in enumerate(zip(after,cleared)))
    assert cleared[0x91a+0x78]==42 and read(0x1001614e,len(cleared))==cleared
    key('NO');tap(0x25,2);manual(1,0);tap(0x25,2)
    menu(False,True);capture('native-replace-confirm.png');key('YES');run(160)
    assert samples(tracks())[:2]==[0,0], 'explicit replacement failed'
    key('NO');menu(True);key('YES');run(160);key('NO')
    assert samples(tracks())[:2]==[255,255]
    if hasattr(port,'install_companion'):port.install_companion();run(1000)
    unchanged_writers(port)
    assert read(0x100f9000,0x3000)==private_before,'former ownership region changed'
    assert read(0x100fe000,0x1800)==map_before and port.peek(0x100fc000,4)==log_tag
    menu(True);key('NO');capture('removal-open-tracks.png')
    return dict(stopBeforeEdit=True,playbackLeftStopped=True,existingManualLockPreservedByLock=True,
        repeatedLockPreservesEveryExistingLock=True,clearIncludesManualAndSameValueLocks=True,
        explicitReplacementWorks=True,unselectedTracksPreserved=True,unrelatedAudioBytesPreserved=True,
        batteryMirrorMatches=True,noPrivateOwnershipWrites=True,nativeHistoryWritersRemainStock=True,
        baseEffectMapAndLogTagPreserved=True)

def after_undo(port,out):
    unchanged_writers(port)
    return fixture.after_undo(port,out)
