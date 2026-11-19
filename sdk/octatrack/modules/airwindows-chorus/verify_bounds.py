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
        cut=lambda first,last:source.split(first+":\n")[1].split(last+":\n")[0]
        spans={"sample":cut('ac_sample','ac_frameend'),"sine":cut('ac_sine','ac_lookup'),
               "lookup":cut('ac_lookup','ac_seconddiff'),"second":cut('ac_seconddiff','ac_channel'),
               "channel":cut('ac_channel','ac_coldleft'),"cold":cut('ac_coldleft','ac_maskedread'),
               "masked":cut('ac_maskedread','ac_fullread'),"full":cut('ac_fullread','ac_warmleft'),
               "left":cut('ac_warmleft','ac_shadowread'),"triplet":cut('ac_shadowread','ac_warmright'),
               "right":cut('ac_warmright','ac_putshadow'),"put":cut('ac_putshadow','ac_readword'),
               "readword":source.split("ac_readword:\n")[1]}
        calls=lambda text:re.findall(r"^\s*bsr\s+(\w+)",text,re.M)
        assert calls(spans['sample'])==['ac_sine','ac_channel','ac_channel']
        assert not calls(spans['channel'])
        assert len(re.findall(r'^\s*jsr\s+\(r2\)',spans['channel'],re.M))==1
        # Each ring routine hands r2 to the other channel's routine of its kind.
        assert re.findall(r'^\s*move\s+#>(\w+),r2',source,re.M)==[
            'ac_coldleft','ac_warmleft','ac_coldright','ac_coldleft','ac_warmright','ac_warmleft']
        assert len(re.findall(r'\br2\b',source.split('ac_sample:\n')[1]))==5
        assert calls(spans['sine'])==['ac_lookup']
        assert calls(spans['lookup'])==['ac_seconddiff']*2
        assert calls(spans['cold'])==['ac_putshadow']
        assert calls(spans['masked'])==['ac_readword']*3
        assert calls(spans['triplet'])==['ac_readword']*3
        assert not any(calls(spans[k]) for k in ('second','full','left','right','put','readword'))
        labels={m.group(1):m.start() for m in re.finditer(r"^(\w+):",source,re.M)}
        branch=r"^\s*(?:b(?:ra|cc|cs|eq|ne|ge|lt|gt|le|mi|pl)\s+|jclr\s+#[^,]+,[^,]+,)(\w+)"
        for m in re.finditer(branch,source,re.M):
            assert labels[m.group(1)]>m.start(), 'Non-forward branch needs a new bound'
        for name,text in spans.items():
            assert not re.search(r"^\s*(?:do|rep|jmp)\b",text,re.M)
            assert not re.search(r"^\s*jsr\b",re.sub(r"^\s*jsr\s+\(r2\).*?$","",text,flags=re.M),re.M)
        branch_cost=lambda text:4*len(re.findall(r"^\s*(?:b(?:ra|cc|cs|eq|ne|ge|lt|gt|le|mi|pl)|jclr)\b",text,re.M))
        span=lambda first,last,text:s[last]-s[first]+branch_cost(text)
        # Every span is charged whole, so both arms of a forward branch count:
        # both flip arms, the shadow and Y writes, the direct shadow triplet.
        # Mutually exclusive routines take the largest.
        helper=verify.ORG+words-s['ac_readword']+branch_cost(spans['readword'])
        put=s['ac_readword']-s['ac_putshadow']
        yread=s['ac_putshadow']-s['ac_yread']
        triplet=max(s['ac_warmright']-s['ac_shadowread']+3*(helper+4),yread)
        # The right ring is the left write address plus 8192, with modulo
        # 8191. Every supported FX2 allocator is 16384-aligned. Its low 14 bits
        # stay 8192..16383, so neither prefix nor left-wrap shadow is reachable:
        # the warm right routine reads and writes Y only.
        assert re.search(r'move\s+#>8192,n4\s+move\s+\(r4\)\+n4',spans['sample'])
        assert re.search(r'move\s+#>8191,m5',spans['sample'])
        assert re.search(r'and\s+#>\$3fff,a\s+cmp\s+#>72,a',spans['readword'])
        assert not re.search(r'\bx:|\br3\b',spans['right'])
        # Left read: Y, the direct prefix triplet or three helper reads.
        check=s['ac_prefixread']-s['ac_leftcheck']+branch_cost(spans['left'].split('ac_leftcheck:\n')[1])+max(
            s['ac_shadowread']-s['ac_prefixread'],triplet)
        warm_left=span('ac_warmleft','ac_leftcheck',spans['left'].split('ac_leftcheck:\n')[0])+check
        warm_right=s['ac_putshadow']-s['ac_warmright']
        partial=lambda read,complete:max(s['ac_emptyread']-s['ac_tworead']+2*(read+4),
                    s['ac_oneread']-s['ac_emptyread'],
                    s['ac_fullread']-s['ac_oneread']+(read+4),complete)
        masked=s['ac_tworead']-s['ac_maskedread']+branch_cost(spans['masked'])
        full=span('ac_fullread','ac_warmleft',spans['full'])
        cold_left=span('ac_coldleft','ac_maskedread',spans['cold'])+(put+4)+masked+partial(helper,full+check)
        right_helper=s['ac_readshadow']-s['ac_readword']+verify.ORG+words-s['ac_ready']+branch_cost(spans['readword'])
        cold_right=span('ac_coldright','ac_maskedread',spans['cold'].split('ac_coldright:\n')[1])+masked+partial(right_helper,full+yread)
        # One flip arm runs per channel; charge the longer.
        body=span('ac_channel','ac_coldleft',spans['channel'])-min(
            s['ac_oddflip']-s['ac_evenflip'],s['ac_deltaready']-s['ac_oddflip'])
        channel=body+max(cold_left,warm_left)+4
        right_channel=body+max(cold_right,warm_right)+4
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
