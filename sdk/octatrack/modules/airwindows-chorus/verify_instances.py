#!/usr/bin/env python3
"""Eight native instances, four per modeled DSP core, versus isolated renders.
Synthetic allocator/dispatcher context; physical deadline and real project
persistence are not established by this test.
"""
import json
import math
import os
import pathlib
import struct
import subprocess
import tempfile
import verify


def main():
    with tempfile.TemporaryDirectory() as tmp:
        work=pathlib.Path(tmp)
        mem,s,_,_=verify.assemble(work)
        mem_b=work/'coreB.mem'
        blob=mem.read_bytes()
        mem_b.write_bytes(blob[:-9]+verify.rec(1,0x25a,[0x38000])+verify.rec(1,0x25c,[0x3c000])+blob[-9:])
        paths=[]
        expect=[]
        knobs=[(64,64,64),(32,96,127),(96,32,96),(127,127,64)]*2
        n=16384
        for i,k in enumerate(knobs):
            l=[round(.2*(verify.Q-1)*math.sin(2*math.pi*(331+113*i)*t/44100)) for t in range(n)]
            r=[round(.17*(verify.Q-1)*math.sin(2*math.pi*(701+79*i)*t/44100)) for t in range(n)]
            path=work/f'in{i}.raw'
            path.write_bytes(struct.pack(f'<{2*n}i',*(v for pair in zip(l,r) for v in pair)))
            paths.append(str(path))
            a,b,_,_=verify.run(work,mem,s,l,r,k)
            expect.append(struct.pack(f'<{2*n}i',*(v for pair in zip(a,b) for v in pair)))
        out=work/'eight.raw'
        cmd=[str(verify.HOST),'-mem',str(mem),'-memB',str(mem_b),'-init',','.join([f"{s['init']:x}"]*8),
             '-proc',','.join([f"{s['proc']:x}"]*8),'-ctx','40,41,42','-ctxB','40,41,42','-inst','8',
             '-core','0,0,0,0,1,1,1,1','-r7','2,5,8,11,2,5,8,11','-alloc','1,3,5,7,1,3,5,7',
             '-audio','9000','-frames','16','-blocks',str(n//16),'-inmask','255','-stereo','-dirty','12648430',
             '-in',','.join(paths),'-out',str(out),'-guard']
        for k in knobs:
            cmd+=['-params',','.join(map(str,[k[0],k[1],0,0,0,k[2]]+[0]*6))]
        result=subprocess.run(cmd,capture_output=True,text=True,timeout=600)
        if result.returncode:
            raise RuntimeError(result.stdout[-2500:]+result.stderr[-1500:])
        rows=[]
        for i,reference in enumerate(expect):
            path=out if not i else pathlib.Path(str(out)+f'.i{i}')
            same=path.read_bytes()==reference
            rows.append({'instance':i,'core':i//4,'fx2Slot':i%4,'knobs':knobs[i],'bitIdenticalToIsolated':same})
            print(f"[{'PASS' if same else 'FAIL'}] instance {i}: identical to isolated render",flush=True)
        guard='nothing written' in result.stdout.lower() or 'guard: ok' in result.stdout.lower()
        print(f"[{'PASS' if guard else 'FAIL'}] multi-instance memory guard",flush=True)
        report={'version':json.loads((verify.HERE/'octamod.module.json').read_text())['version'],'frames':n,'instances':rows,'guardPassed':guard,
                'limitations':['Synthetic context; no physical DSP timing or Part/project/reboot qualification.']}
        if os.environ.get('CHORUS_INSTANCE_RESULTS'):
            pathlib.Path(os.environ['CHORUS_INSTANCE_RESULTS']).write_text(json.dumps(report,indent=2)+'\n')
        if not guard or not all(row['bitIdenticalToIsolated'] for row in rows):
            raise SystemExit('Multi-instance isolation failed')

if __name__=='__main__':
    main()
