#!/usr/bin/env python3
"""Fast gesture contract checks; native stock paths are checked in ux_test.py."""
import ctypes as ct
from pathlib import Path
import subprocess
import tempfile
HERE=Path(__file__).resolve().parent
with tempfile.TemporaryDirectory() as tmp:
    shared=Path(tmp)/'solo.so'
    subprocess.run(['cc','-std=c99','-O2','-Wall','-Wextra','-Werror','-shared','-fPIC',
                    '-DTS_HOST',str(HERE/'track_solo.c'),'-o',str(shared)],check=True)
    lib=ct.CDLL(str(shared))
    lib.ts_effective_word.argtypes=[ct.c_uint32];lib.ts_effective_word.restype=ct.c_uint32
    lib.ts_led_row.argtypes=[ct.c_uint32,ct.c_uint32];lib.ts_led_row.restype=ct.c_uint32
    group=ct.c_uint32.in_dll(lib,'ts_overlay')
    context=ct.c_uint32.in_dll(lib,'ts_host_context')
    rows=(ct.c_uint8*8).in_dll(lib,'ts_host_rows');api=ct.c_uint32()
    def key(code,down=True):
        row,bit=code>>3,1<<(code&7)
        rows[row]=rows[row]|bit if down else rows[row]&~bit
        return lib.ts_key(code,int(down))
    def track(t,down=True):return key(0x10+t,down)
    def tick(n=1):
        for _ in range(n):lib.ts_tick(ct.byref(api))
    def fresh(on=True):
        lib.ts_test_reset()
        if on:lib.ts_set(1,0)
        tick()
    def arm(t):
        assert track(t)==0;tick(29);assert group.value==0
        tick();assert group.value==1<<t
        assert lib.ts_stock_key(0x10+t)==0 and rows[2]&(1<<t)
    fresh(False);track(0);tick(140);assert group.value==0
    for anchor in range(8):
        for selection in range(256):
            if not selection&(1<<anchor):continue
            fresh();arm(anchor)
            for t in range(8):
                if t!=anchor and selection&(1<<t):
                    assert track(t)==1
                    assert track(t)==1,'repeat toggled'
                    assert track(t,False)==1
            assert group.value==selection
            assert lib.ts_stock_row(2)==0
            for canonical in (0x5aa50000,0x5aa58142,0x5aa5ffff):
                assert lib.ts_effective_word(canonical)==0x5aa50000|selection
            assert track(anchor,False)==1;assert group.value==0
            assert lib.ts_effective_word(0x5aa58142)==0x5aa58142
    for code in list(range(16))+list(range(24,64)):
        fresh();track(0);tick(15);key(code);tick(150);assert group.value==0
        fresh();arm(0);key(code);tick()
        assert group.value==(0 if code in (0x1c,0x35) else 1),(code,group.value)
    fresh();arm(1)
    key(0x2d);assert track(2)==0 and group.value==2
    assert track(2,False)==0;key(0x2d,False)
    assert track(2)==1 and group.value==6
    assert track(1,False)==1 and group.value==0
    assert track(2,False)==1
    fresh();arm(3);lib.ts_enc(0,1);tick();assert group.value==8
    context.value=2;tick();assert group.value==8,'editing popup canceled'
    context.value=0;tick();assert group.value==0
    assert lib.ts_stock_key(0x13)==0,'canceled held anchor exposed'
    context.value=1;tick(200);assert group.value==0
    track(3,False);tick();arm(3)
    rows[2]=0;tick();assert group.value==0,'lost release stuck'
    fresh();arm(0)
    for row in range(17):
        for value in range(256):
            filtered=lib.ts_led_row(row,value)
            if row in (5,6):
                assert all(filtered&(3<<s) for s in range(0,8,2))
                for s in range(0,8,2):
                    if value&(3<<s):assert filtered&(3<<s)==value&(3<<s)
            else:assert filtered==value
    lib.ts_set(-1,0);tick();assert group.value==0
    for row in range(17):assert lib.ts_led_row(row,0xa5)==0xa5
    print('PASS: all eight anchors / 1024 groups; timing, edges, hidden anchor, editing, modifiers, latest-state transform and panel row isolation')
