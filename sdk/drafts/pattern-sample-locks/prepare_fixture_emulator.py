# SPDX-License-Identifier: MIT
"""Save a consistent disposable Part/project before exact-build regressions."""
import stress_emulator as fixture

def exercise(port,run,tap,key,encoder,capture,out,reboot):
    assert not reboot
    bank=fixture.u32(port,0x46c82456)
    before=fixture.read(port,bank+0x8ed80,0x62c8)
    saved=fixture.read(port,bank+0x9504a,0x62c8)
    initial=[i for i,(a,b) in enumerate(zip(before,saved)) if a!=b]
    print('Preparing saved Part/project; initial Part differences='+str(len(initial)),flush=True)
    fixture.normalize_fixture_parts(port)
    fixture.save_fixture_part(port,run,tap,key)
    baseline=fixture.read(port,bank+0x8ed80,0xc5b0)
    fixture.panel_job(port,run,tap,key)
    assert fixture.read(port,bank+0x8ed80,0xc5b0)==baseline, 'Save Project changed saved Parts'
    assert fixture.read(port,bank+0x8ed80,0x62c8)==fixture.read(port,0x100a4ece,0x62c8)
    return dict(disposableFixturePrepared=True,noSampleLockAction=True,
        initialUnsavedPartDifferenceOffsets=initial,fixturePartSavedNatively=True,
        projectSavedNatively=True,partDataAndMirrorAgree=True)
