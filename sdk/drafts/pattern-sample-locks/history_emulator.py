# SPDX-License-Identifier: MIT
"""Labelled native-writer fixtures; all mutations stay in disposable emulator RAM."""
import zlib
from stress_emulator import read,put,u32,call_idle

def exercise(port,run,tap,key,encoder,capture,out,reboot):
    assert not reboot
    tap(0x22,1);bank=u32(port,0x46c82456);assert bank==0x400e21e0
    assert port.peek(0x100b14d0,1)==b'\0'
    before=read(port,bank,8*0x91a);fixture=bytearray(before)
    fixture[:8]=(3).to_bytes(8,'big')
    for step in range(64):fixture[0x78+32*step]=255
    put(port,bank,fixture);put(port,0x1001614e,fixture)
    call_idle(port,0x400339d8)
    def audio():return read(port,bank,8*0x91a)
    def samples():return [audio()[0x78+32*n] for n in range(2)]
    def menu(clear,manual=False,replace=False):
        port.command('key 0x25 32');run(80);tap(0x23,32);port.command('key 0x25 0');run(80)
        for _ in range(6):key('UP')
        for _ in range(4+clear):key('DOWN')
        key('YES');encoder(0,-4);encoder(1,4)
        if manual:encoder(2,-4) # Retain manual OFF, explicitly
        if replace:encoder(2,4) # Replace existing ON, explicitly
        key('YES')
    def apply(clear,manual=False,replace=False):
        menu(clear,manual,replace);key('YES');run(200);key('NO')
    def owned():
        nv=read(port,0x100f9000,0x3000)
        if nv[:8]!=b'PSLOWN\x03\0':return 0
        track=audio()[:0x91a]
        for at in range(0x400,0x3000,16):
            if nv[at:at+4]!=b'\0\0\xff\xff':continue
            data=nv[520:524]+nv[at:at+12]+track[:8]+bytes(track[0x78+32*n] for n in range(64))
            if int.from_bytes(nv[at+12:at+16],'big')!=zlib.crc32(data):return 0
            return int.from_bytes(nv[at+4:at+12],'little').bit_count()
        return 0
    def reset_owned():
        apply(True,True);assert samples()==[255,255]
        apply(False);assert samples()==[0,0] and owned()==2
    def retained(name):
        assert owned()==0,'writer retained stale ownership: '+name
        menu(True);capture('history-'+name+'-confirm.png');key('YES');run(160);key('NO')
        assert samples()==[0,0],name+' manual/unknown history was cleared'
    def fn_stop():
        port.command('key 0x25 32');run(80);tap(0x24,128);port.command('key 0x25 0');run(80)
    def fn_rec():
        port.command('key 0x25 32');run(80);port.command('key 0x25 34');run(80)
        port.command('key 0x25 32');run(80);port.command('key 0x25 0');run(80)
    checks={}
    reset_owned();apply(True);assert samples()==[255,255]
    checks['baselineOwnedClear']=True
    reset_owned();same=audio()
    # Native trig copy/paste into the native clipboard, explicitly injected
    # calls, not fabricated queue messages or ownership data.
    call_idle(port,0x4002bf38,0x460c8122,0,0,0,3)
    call_idle(port,0x4002c89c,0x460c8122,0,0,0,3)
    assert audio()==same;retained('trig-paste');checks['sameValueTrigPasteRetained']=True
    reset_owned();same=audio()
    call_idle(port,0x40029754,0x460c8122,0,0) # native COPY, including Part fields
    assert audio()==same and owned()==2,'copy alone retired ownership'
    checks['nativeTrackCopyKeepsOwnership']=True
    call_idle(port,0x4002b654,0x460c8122,0,0) # native PASTE
    assert audio()==same;retained('track-paste');checks['sameValueTrackPasteRetained']=True
    reset_owned();same=audio()
    put(port,0x460c8122,read(port,bank,0x8ed8)) # labelled native clipboard fixture
    call_idle(port,0x4002b9b0,0x460c8122,0)
    assert audio()==same;retained('pattern-paste');checks['sameValuePatternPasteRetained']=True
    # Real panel copy/paste/Undo, with native clipboard context intact.
    reset_owned();tap(0x25,2);fn_rec();fn_stop()
    assert u32(port,0x460c80f0)==4,'native track Undo context not prepared'
    # Labelled ownership fixture: re-publish two owned bits using the real
    # module primitive, without opening a stock menu (which retires Undo).
    # Undo then restores identical SAMPLE bytes. A value-only CRC check must
    # not revive ownership; its complete native writer must retire it.
    symbols=port.profile_symbols;assert symbols,'--history requires exact-object symbols'
    base=int.from_bytes(port.peek(0x40040ee2,4),'big')-symbols['psl_manual_sample']
    put(port,0x100f9220,bytes([1,1]+[0]*62))
    call_idle(port,base+symbols['psl_nv_publish'],0x100f9000,0,0,bank,0x100f9220)
    assert owned()==2
    port.command('watch 0x4002b910,0x4002b978');fn_stop()
    hits=port.command('hits',b'hits ').split()[2:];port.command('watch off')
    assert any(int(h.split(':')[1],16)==0x4002b910 for h in hits),'native Undo was not entered'
    assert any(int(h.split(':')[1],16)==0x4002b978 for h in hits),'native Undo did not succeed'
    assert u32(port,0x460c80f0)==0 and samples()==[0,0],'native Undo did not restore its snapshot'
    tap(0x25,2);retained('undo');checks['nativeSameValueUndoRetiresInjectedOwnership']=True
    reset_owned();call_idle(port,0x40039df4,0,0,1)
    assert samples()==[255,255] and not owned();checks['nativeTrackClearRetiresOwnership']=True
    # Recreate only the fixture trigs, then use the utility for ownership.
    put(port,bank,(3).to_bytes(8,'big'));put(port,0x1001614e,(3).to_bytes(8,'big'))
    call_idle(port,0x400339d8);reset_owned()
    port.detach_target();run(300)
    assert port.peek(0x40040ee0,2)!=b'\x4e\xf9'
    assert not owned()
    port.command('watch 0x40040f52')
    port.command('poke 0x460d174a 0001');call_idle(port,0x40040ee0,0)
    hits=port.command('hits',b'hits ').split()[2:];port.command('watch off')
    assert any(int(h.split(':')[1],16)==0x40040f52 for h in hits),'absent-owner native SAMPLE store was not reached'
    port.command('poke 0x460d174a 0000');run(80)
    port.attach_target();run(500);retained('reinstall')
    checks['sameValueManualEditWhileAbsentRetained']=True
    # Undo/reinstall can update native ancillary track state. Verify every
    # other audio track remained byte-identical to the injected fixture.
    assert audio()[0x91a:]==fixture[0x91a:]
    checks['unselectedTracksPreserved']=True
    menu(True);key('NO');capture('removal-open-tracks.png')
    return checks
