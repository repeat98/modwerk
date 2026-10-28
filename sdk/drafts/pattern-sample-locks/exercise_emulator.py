# SPDX-License-Identifier: MIT
"""Native editing checks for capture_emulator --exercise, on disposable media.

The single stock SAMPLE writer call is a labelled test injection with an injected held-step
mask; edits/selection/confirmation/transport use panel input.
Memory snapshots stay private and are never submitted as module artifacts.
"""
from pathlib import Path
import hashlib

def exercise(port,run,tap,key,encoder,capture,out,reboot):
    def read(address,n):
        return b''.join(port.peek(address+at,min(4096,n-at)) for at in range(0,n,4096))
    def u32(address):return int.from_bytes(port.peek(address,4),'big')
    def tracks():return read(u32(0x46c82456)+port.peek(0x100b14d0,1)[0]*0x8ed8,8*0x91a)
    def samples(blob):return [blob[0x78+32*i] for i in range(64)]
    def menu(clear):
        port.command('key 0x25 32');run(80);tap(0x23,32);port.command('key 0x25 0');run(80)
        # The stock remembered cursor can be any of its four rows.
        for _ in range(6):key('UP')
        for _ in range(4+clear):key('DOWN')
        key('YES');encoder(0,4);key('YES')
    def manual(slot,step):
        # Labelled fixture injection: the native writer gets a held-step
        # mask without pressing/removing an existing GRID REC trig. This also
        # exercises the module's same-value invalidation wrapper.
        assert port.peek(0x100b14cc,1)==b'\0', 'fixture is not on T1'
        port.command('poke 0x460d174a '+(1<<step).to_bytes(2,'big').hex())
        for _ in range(200):
            try:port.command(f'call 0x40040ee0 {slot}');break
            except RuntimeError as error:
                # Explicit preflight refusal: nothing was called. Never retry
                # an entered writer that failed or exceeded its call budget.
                if "not main's spin" not in str(error):raise
                run(1)
        else:raise RuntimeError('Emulator never reached idle for fixture writer')
        port.command('poke 0x460d174a 0000');run(80)
    checks={}
    tap(0x22,1) # T1
    if not reboot:
        # Normal GRID REC gestures create two sample trigs.
        tap(0x25,2);tap(0x20,1);tap(0x20,2)
        assert port.peek(u32(0x46c82456)+7,1)[0]&3==3,'fixture has no two sample trigs'
        manual(1,0)
        assert samples(tracks())[:2]==[1,255]
        # Exit GRID REC before the utility/transport test.
        tap(0x25,2)
        before=tracks();tap(0x25,1) # PLAY code 0x28
        assert u32(0x800065b8)!=0,'PLAY did not start'
        menu(False);capture('native-lock-confirm.png');key('YES');run(300)
        capture('native-lock-result.png')
        after=tracks();assert u32(0x800065b8)==0,'operation did not stop playback'
        assert samples(after)[:2]==[1,0],f'native Lock refused or damaged locks: {samples(after)[:2]}'
        allowed={0x78+32};assert all(a==b or i in allowed for i,(a,b) in enumerate(zip(before,after))), 'unrelated track bytes changed'
        mirror=read(0x1001614e,8*0x91a);assert mirror==after,'battery mirror mismatch'
        checks.update(stopBeforeEdit=True,manualLockPreserved=True,nativeLockWritten=True,unrelatedAudioBytesPreserved=True,batteryMirrorMatches=True)
        key('NO');menu(True);capture('native-clear-owned-confirm.png');key('NO');key('NO')
        # Save exact pre-manual state for a new-process, battery-backed boot.
        snapshot=read(0x10000000,0x100000);(out/'powercycle.private.cs1').write_bytes(snapshot)
        checks['cs1Sha256']=hashlib.sha256(snapshot).hexdigest()
        # Same-value manual overwrite must retire ownership even though the
        # SAMPLE byte itself does not change.
        tap(0x25,2);manual(0,1);tap(0x25,2)
        menu(True);capture('native-same-value-confirm.png');key('YES');run(160)
        assert samples(tracks())[:2]==[1,0],'same-value manual lock was cleared'
        checks['sameValueManualLockRetained']=True
        key('NO')
    else:
        before=tracks();assert samples(before)[:2]==[1,0],'native locks did not survive fresh boot'
        tap(0x25,1);assert u32(0x800065b8)!=0
        menu(True);capture('reboot-clear-confirm.png');key('YES');run(300)
        capture('reboot-clear-result.png')
        after=tracks();assert samples(after)[:2]==[1,255],f'ownership not recovered after fresh boot: {samples(after)[:2]}'
        assert u32(0x800065b8)==0
        allowed={0x78+32};assert all(a==b or i in allowed for i,(a,b) in enumerate(zip(before,after)))
        checks.update(freshBootNativeLocksPresent=True,freshBootOwnedLockCleared=True,freshBootManualLockRetained=True,playbackLeftStopped=True,unrelatedAudioBytesPreserved=True)
        key('NO')
        # Default clear is idempotent. Explicitly disabling Retain clears the
        # remaining manual lock, through level-two encoder C.
        menu(True);key('NO');encoder(2,-4);key('YES');capture('reboot-include-manual-confirm.png');key('YES');run(200)
        assert samples(tracks())[:2]==[255,255];checks['explicitIncludeManualClearsManual']=True
        key('NO')
    # Remove while level two owns its overlay. No module pointer was installed
    # in stock popup state; the caller executes USB Undo now.
    menu(True);key('NO');capture('removal-open-tracks.png')
    return checks
