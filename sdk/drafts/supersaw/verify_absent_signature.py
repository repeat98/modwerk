#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Test a proposed SW/1 base signature entry on temporary copies only.

This does not patch the SDK or build a base. The full upstream host registry
suite runs before the focused selector cases. No USB or firmware is accessed.
"""
import argparse
import difflib
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

ap=argparse.ArgumentParser(description=__doc__)
ap.add_argument('--sdk',type=Path,required=True)
ap.add_argument('--out',type=Path,required=True)
ap.add_argument('--patch-out',type=Path,help='write an unapplied review proposal; SDK stays unchanged')
a=ap.parse_args(); sdk=a.sdk.resolve(); ot=sdk/'sdk/machines/octatrack'
registry=ot/'elekloader/machine_registry.c'
source=registry.read_text()
needle="{{'F', 'R'}, 1, 1}};"
assert source.count(needle)==1,'Pinned known-signature table changed'
patched=source.replace(needle,"{{'F', 'R'}, 1, 1}, {{'S', 'W'}, 1, 1}};")
test=(ot/'elekloader/test_machine_registry.c').read_text()
extra=r'''
#undef main
int main(void) {
    int result=upstream_registry_main(); if(result) return result;
    uint8_t p[6322]={0};
    for(unsigned t=0;t<8;++t) {
        uint8_t *s=p+60+30*t;
        s[0]='S';s[1]='W';s[2]=1;
        for(unsigned type=0;type<2;++type) {
            p[0x22+t]=type;
            CHECK(orphan(p,t)==EXPECT_SW);
        }
        s[2]=0;CHECK(!orphan(p,t));
        s[2]=2;CHECK(!orphan(p,t));
        s[2]=1;p[0x22+t]=2;CHECK(!orphan(p,t));
        p[0x22+t]=1;s[0]='X';CHECK(!orphan(p,t));
    }
    CHECK(!orphan(p,8));
    rows(0,0,0,0);for(unsigned k=0;k<6322;++k)part0()[k]=0;
    memset(stockdef,0x40,sizeof stockdef);
    part0()[0x22+3]=1;
    for(unsigned k=0;k<12;++k)
        part0()[(k<6?0x2a:0x1da)+90+6+k%6]=(uint8_t)(0x70+k);
    part0()[150]='S';part0()[151]='W';part0()[152]=1;
    CHECK(mw_validate(part0())==11);
    CHECK(seen[0]==(EXPECT_SW?0x40:0x70));
    CHECK(seen[11]==(EXPECT_SW?0x40:0x7b));
    CHECK(part0()[0x2a+90+6]==0x70 && part0()[0x1da+90+11]==0x7b);
    CHECK(part0()[150]=='S' && part0()[151]=='W' && part0()[152]==1);
    CHECK(mw_source_render_impl(3,0,0,1)==(EXPECT_SW?-9:-7));
    if(failures) return 1;
    puts("PASS exact SW/1 selector, eight tracks, bounds, absent validator protection and silent routing");
    return 0;
}
'''
includes=[ot/'module-adapters',ot/'elekloader',ot/'include',sdk/'sdk/runtime/loader',sdk/'sdk/runtime/upload']
results={}
with tempfile.TemporaryDirectory(prefix='supersaw-signature-') as tmp:
    work=Path(tmp)
    (work/'test.c').write_text('#define main upstream_registry_main\n'+test+extra)
    for name,body,expect in [('baseline',source,0),('proposal',patched,1)]:
        (work/'machine_registry.c').write_text(body)
        executable=work/name
        cmd=['cc','-std=c99','-Wall','-Wextra','-Werror','-O1','-g',
             '-fsanitize=address,undefined','-fno-sanitize-recover=all',
             '-DMODWERK_RUNTIME_EVENTS','-DRUNTIME_MODULES=128u',f'-DEXPECT_SW={expect}',
             *('-I'+str(p) for p in includes),str(work/'test.c'),'-o',str(executable)]
        compile_result=subprocess.run(cmd,capture_output=True,text=True)
        if compile_result.returncode:
            raise RuntimeError(compile_result.stdout+compile_result.stderr)
        run=subprocess.run([str(executable)],capture_output=True,text=True)
        if run.returncode:
            raise RuntimeError(run.stdout+run.stderr)
        results[name]=run.stdout
report={'scope':'temporary host base proposal only; original SDK unchanged',
        'registrySha256':hashlib.sha256(source.encode()).hexdigest(),
        'proposedRegistrySha256':hashlib.sha256(patched.encode()).hexdigest(),
        'baselineRecognizesSW1':False,'proposalRecognizesSW1':True,
        'results':results,'hardwareTested':False,'rebootTested':False,
        'baseChanged':False,'installable':False}
a.out.write_text(json.dumps(report,indent=2)+'\n')
if a.patch_out:
    path='sdk/machines/octatrack/elekloader/machine_registry.c'
    a.patch_out.write_text(''.join(difflib.unified_diff(source.splitlines(True),patched.splitlines(True),
                          fromfile='a/'+path,tofile='b/'+path)))
print(json.dumps(report,indent=2))
