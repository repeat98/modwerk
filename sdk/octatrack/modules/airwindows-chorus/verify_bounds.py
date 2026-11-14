#!/usr/bin/env python3
"""Conservative instruction-word budget, not chip timing qualification.

The repository cycle counter rejects branched/nested callees. Charge the
largest reachable word span of each callee at each call (retaining
conservative branch charges), and four extra cycles per call and branch. There
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
from packed_sine import packed_table

HERE=pathlib.Path(__file__).resolve().parent

def main():
    with tempfile.TemporaryDirectory() as d:
        _,s,words,_=verify.assemble(pathlib.Path(d))
        source=(HERE/"chorus.asm").read_text()
        # Refuse changed call topology instead of silently understating it.
        spans={"sample":source.split("ac_sample:\n")[1].split("ac_frameend:\n")[0],
               "sine":source.split("ac_sine:\n")[1].split("ac_lookup:\n")[0],
               "lookup":source.split("ac_lookup:\n")[1].split("ac_seconddiff:\n")[0],
               "second":source.split("ac_seconddiff:\n")[1].split("ac_channel:\n")[0],
               "channel":source.split("ac_channel:\n")[1].split("ac_maskedread:\n")[0],
               "tap":source.split("ac_maskedread:\n")[1].split("ac_readword:\n")[0],
               "readword":source.split("ac_readword:\n")[1]}
        calls=lambda text:re.findall(r"^\s*bsr\s+(\w+)",text,re.M)
        assert calls(spans['sample'])==['ac_sine','ac_channel','ac_channel']
        assert not calls(spans['channel'])
        assert len(re.findall(r'^\s*jsr\s+\(r2\)',spans['channel'],re.M))==1
        assert re.findall(r'^\s*move\s+#>(\w+),r2',source,re.M)==['ac_maskedread','ac_warmread']
        assert not re.search(r'\br2\b',spans['sample']+spans['sine']+spans['tap'])
        assert len(re.findall(r'\br2\b',spans['channel']))==1
        assert calls(spans['sine'])==['ac_lookup']
        assert calls(spans['lookup'])==['ac_seconddiff']*2
        assert not calls(spans['second']) and not calls(spans['readword'])
        assert calls(spans['tap']) == ['ac_readword'] * 6
        for text in spans.values():
            labels={m.group(1):m.start() for m in re.finditer(r"^(\w+):",text,re.M)}
            for m in re.finditer(r"^\s*b(?:ra|cc|cs|eq|ne|ge|lt|gt|le|mi|pl)\s+(\w+)",text,re.M):
                assert labels[m.group(1)]>m.start(), 'Non-forward branch needs a new bound'
            assert not re.search(r"^\s*(?:do|rep|jmp)\b",text,re.M)
            assert not re.search(r"^\s*jsr\b",re.sub(r"^\s*jsr\s+\(r2\).*?$","",text,flags=re.M),re.M)
        for m in re.finditer(r'^\s*jclr\s+#[^,]+,[^,]+,(\w+)',spans['sine'],re.M):
            assert spans['sine'].index(m.group(1)+':') > m.start(), 'Non-forward bit branch needs a new bound'
        branch_cost=lambda text:4*len(re.findall(r"^\s*(?:b(?:ra|cc|cs|eq|ne|ge|lt|gt|le|mi|pl)|jclr)\b",text,re.M))
        # The partial-read and full-triplet arms are mutually exclusive.
        # Price the largest path; each read helper still charges both of its
        # forward arms. Count all branch surcharges conservatively.
        helper=verify.ORG+words-s['ac_readword']+branch_cost(spans['readword'])
        partial=max(s['ac_emptyread']-s['ac_tworead']+2*(helper+4),
                    s['ac_oneread']-s['ac_emptyread'],
                    s['ac_warmread']-s['ac_oneread']+(helper+4))
        warm=s['ac_shadowread']-s['ac_warmread']+max(
            s['ac_yread']-s['ac_shadowread']+3*(helper+4),
            s['ac_readword']-s['ac_yread'])
        tap=s['ac_tworead']-s['ac_maskedread']+max(partial,warm)+branch_cost(spans['tap'])
        # The right ring is allocator+8192, with modulo 8191. Every
        # supported FX2 allocator is 16384-aligned. Its low 14 bits stay
        # 8192..16383, so neither prefix nor left-wrap shadow is reachable.
        assert re.search(r'move\s+x:\(r7\+\$00\),a\s+add\s+#>8192,a\s+move\s+a,r4',spans['sample'])
        assert re.search(r'move\s+#>8191,m5',spans['channel'])
        assert re.search(r'and\s+#>\$3fff,a\s+cmp\s+#>72,a',spans['readword'])
        right_helper=s['ac_readshadow']-s['ac_readword']+verify.ORG+words-s['ac_ready']+branch_cost(spans['readword'])
        right_partial=max(s['ac_emptyread']-s['ac_tworead']+2*(right_helper+4),
                          s['ac_oneread']-s['ac_emptyread'],
                          s['ac_warmread']-s['ac_oneread']+(right_helper+4))
        right_warm=s['ac_shadowread']-s['ac_warmread']+s['ac_readword']-s['ac_yread']
        right_tap=s['ac_tworead']-s['ac_maskedread']+max(right_partial,right_warm)+branch_cost(spans['tap'])
        channel=s['ac_maskedread']-s['ac_channel']+(tap+4)+branch_cost(spans['channel'])
        right_channel=s['ac_maskedread']-s['ac_channel']-(s['ac_writey']-s['ac_writeshadow'])+(right_tap+4)+branch_cost(spans['channel'])
        second=s['ac_channel']-s['ac_seconddiff']+branch_cost(spans['second'])
        # Forward and backward cache updates are mutually exclusive, each
        # calls the second-difference reader once; unchanged index is cheaper.
        lookup=s['ac_advancesine']-s['ac_lookup']+max(
            s['ac_backwardsine']-s['ac_advancesine'],
            s['ac_cachefinish']-s['ac_backwardsine'])+second+4+(
            s['ac_seconddiff']-s['ac_cachefinish'])+branch_cost(spans['lookup'])
        sine=s['ac_lookup']-s['ac_sine']+lookup+4+branch_cost(spans['sine'])
        sample=s['ac_frameend']+1-s['ac_sample']+(sine+4)+(channel+4)+(right_channel+4)+branch_cost(spans['sample'])
        # Include endpoint helpers, first-call seeding, loop entry and return.
        control=s['ac_sample']-s['proc']+3*(s['ac_sine']-s['ac_endpoint']+4)+16
        init_source=source.split('init:\n')[1].split('proc:\n')[0]
        assert re.findall(r'^\s*do\s+#(\d+)',init_source,re.M)==['60']
        assert not re.search(r'^\s*(?:bsr|jsr|rep|jmp)\b',init_source,re.M)
        init=s['proc']-s['init']+60+16
        bound=sample+(control+15)//16
        split_bound=sample+(2*control+15)//16
        record={'version':json.loads((HERE/'octamod.module.json').read_text())['version'],'programWords':words,'tableWords':len(packed_table()),
                'model':'instruction words plus conservative call/branch surcharge; no contention stalls',
                'perSampleLoopUpperBound':sample,'perCallSetupUpperBound':control,
                'perSampleAt16FramesUpperBound':bound,'perSampleAt16FramesWithSplitUpperBound':split_bound,
                'fourFx2InstancesPerCoreUpperBound':4*split_bound,
                'initUpperBound':init,
                'perInstanceBlockWithSplitAndInitUpperBound':16*sample+2*control+init,
                'fourInstanceCoreBlockWithSplitAndInitUpperBound':4*(16*sample+2*control+init),
                'stateSpanWords':60,'stereoBufferWordsPerInstance':16384,
                'shadowRingWordsPerInstance':72,'usedStateWordsPerInstance':132,
                'highestUsedInstanceOffset':131,'stockStateFromOffset':132,
                'perCoreFourInstanceReservedWords':4*(0x100+16384),
                'coldfire':'No authored ColdFire routine; existing platform and stock editor paths not bounded here.',
                'hardwareTiming':'unmeasured'}
        print(json.dumps(record,indent=2))
        if os.environ.get('CHORUS_BOUNDS_RESULTS'):
            pathlib.Path(os.environ['CHORUS_BOUNDS_RESULTS']).write_text(json.dumps(record,indent=2)+'\n')

if __name__=='__main__':
    main()
