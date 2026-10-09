#!/usr/bin/env python3
"""Conservative instruction-word budget, not chip timing qualification.

The repository cycle counter rejects branched/nested callees. Charge the
entire word span of each reachable callee at each call (including mutually
exclusive forward arms), and four extra cycles per call and branch. There
are no backward branches or counted loops inside any callee. First-call
setup is charged to every 16-frame block. Memory/contention stalls are not
modeled; hardware must still establish deadline safety.
"""
import json
import os
import pathlib
import re
import tempfile
import verify

HERE=pathlib.Path(__file__).resolve().parent

def main():
    with tempfile.TemporaryDirectory() as d:
        _,s,words,_=verify.assemble(pathlib.Path(d))
        source=(HERE/"chorus.asm").read_text()
        # Refuse changed call topology instead of silently understating it.
        spans={"sample":source.split("ac_sample:\n")[1].split("ac_frameend:\n")[0],
               "sine":source.split("ac_sine:\n")[1].split("ac_channel:\n")[0],
               "channel":source.split("ac_channel:\n")[1].split("ac_maskedread:\n")[0],
               "tap":source.split("ac_maskedread:\n")[1]}
        calls=lambda text:re.findall(r"^\s*bsr\s+(\w+)",text,re.M)
        assert calls(spans['sample'])==['ac_sine','ac_channel','ac_channel']
        assert not calls(spans['channel'])
        assert len(re.findall(r'^\s*jsr\s+\(r2\)',spans['channel'],re.M))==1
        assert re.findall(r'^\s*move\s+#>(\w+),r2',source,re.M)==['ac_maskedread','ac_warmread']
        assert not re.search(r'\br2\b',spans['sample']+spans['sine']+spans['tap'])
        assert len(re.findall(r'\br2\b',spans['channel']))==1
        assert not calls(spans['sine']) and not calls(spans['tap'])
        for text in spans.values():
            labels={m.group(1):m.start() for m in re.finditer(r"^(\w+):",text,re.M)}
            for m in re.finditer(r"^\s*b(?:ra|cc|cs|eq|ne|ge|lt|gt|le|mi|pl)\s+(\w+)",text,re.M):
                assert labels[m.group(1)]>m.start(), 'Non-forward branch needs a new bound'
            assert not re.search(r"^\s*(?:do|rep|jmp)\b",text,re.M)
            assert not re.search(r"^\s*jsr\b",re.sub(r"^\s*jsr\s+\(r2\).*?$","",text,flags=re.M),re.M)
        for m in re.finditer(r'^\s*jclr\s+#[^,]+,[^,]+,(\w+)',spans['sine'],re.M):
            assert spans['sine'].index(m.group(1)+':') > m.start(), 'Non-forward bit branch needs a new bound'
        branch_cost=lambda text:4*len(re.findall(r"^\s*(?:b(?:ra|cc|cs|eq|ne|ge|lt|gt|le|mi|pl)|jclr)\b",text,re.M))
        tap=verify.ORG+words-s['ac_maskedread']+branch_cost(spans['tap'])
        channel=s['ac_maskedread']-s['ac_channel']+(tap+4)+branch_cost(spans['channel'])
        sine=s['ac_channel']-s['ac_sine']+branch_cost(spans['sine'])
        sample=s['ac_frameend']+1-s['ac_sample']+(sine+4)+2*(channel+4)+branch_cost(spans['sample'])
        # Include endpoint helpers, first-call seeding, loop entry and return.
        control=s['ac_sample']-s['proc']+3*(s['ac_sine']-s['ac_endpoint']+4)+16
        init_source=source.split('init:\n')[1].split('proc:\n')[0]
        assert re.findall(r'^\s*do\s+#(\d+)',init_source,re.M)==['56']
        assert not re.search(r'^\s*(?:bsr|jsr|rep|jmp)\b',init_source,re.M)
        init=s['proc']-s['init']+56+16
        bound=sample+(control+15)//16
        split_bound=sample+(2*control+15)//16
        record={'version':json.loads((HERE/'octamod.module.json').read_text())['version'],'programWords':words,'tableWords':1026,
                'model':'instruction words plus conservative call/branch surcharge; no contention stalls',
                'perSampleLoopUpperBound':sample,'perCallSetupUpperBound':control,
                'perSampleAt16FramesUpperBound':bound,'perSampleAt16FramesWithSplitUpperBound':split_bound,
                'fourFx2InstancesPerCoreUpperBound':4*split_bound,
                'initUpperBound':init,
                'perInstanceBlockWithSplitAndInitUpperBound':16*sample+2*control+init,
                'fourInstanceCoreBlockWithSplitAndInitUpperBound':4*(16*sample+2*control+init),
                'stateSpanWords':56,'stereoBufferWordsPerInstance':16384,
                'perCoreFourInstanceReservedWords':4*(0x100+16384),
                'coldfire':'No authored ColdFire routine; existing platform and stock editor paths not bounded here.',
                'hardwareTiming':'unmeasured'}
        print(json.dumps(record,indent=2))
        if os.environ.get('CHORUS_BOUNDS_RESULTS'):
            pathlib.Path(os.environ['CHORUS_BOUNDS_RESULTS']).write_text(json.dumps(record,indent=2)+'\n')

if __name__=='__main__':
    main()
