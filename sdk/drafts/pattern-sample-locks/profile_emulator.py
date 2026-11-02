# SPDX-License-Identifier: MIT
"""Exact-object watch measurements. Emulator instructions are not CPU cycles."""
def start(port):
    symbols=getattr(port,'profile_symbols',None)
    if not symbols:return None
    target=int.from_bytes(port.peek(0x4002dc6a,4),'big')
    base=target-symbols['psl_open']
    begin=base+symbols['begin'];ends={base+n for n in symbols['ends']}
    commit=symbols.get('performanceFunctions',{}).get('psl_native_commit')
    points=[begin,*sorted(ends)]
    if commit:points += [base+commit['begin'],*[base+n for n in commit['ends']]]
    points += symbols.get('monitorPoints',[])
    port.command('watch '+','.join(hex(n) for n in points))
    return begin,ends,base,commit

def finish(port,token):
    if not token:return {}
    begin,ends,base,commit=token;at=None;spans=[];commit_at=None;commit_spans=[];ticks=0;saved_masks=set()
    for hit in port.command('hits',b'hits ').split()[2:]:
        fields=list(map(lambda s:int(s,16),hit.split(':')));count,pc=fields[:2]
        if commit_at is not None and pc in getattr(port,'profile_symbols',{}).get('monitorPoints',[]):ticks+=1
        if commit and pc==base+commit['begin']:commit_at=count
        if commit and pc in {base+n for n in commit['ends']}:
            assert commit_at is not None
            commit_spans.append(((count-commit_at)&0xffffffff)+1);commit_at=None
        if pc==begin:
            saved_field=port.profile_symbols.get('savedSrHitField')
            if saved_field is not None:saved_masks.add((fields[saved_field]>>8)&7)
            assert at is None,'nested guard watch';at=count
        elif pc in ends:
            assert at is not None,'missing guard entry'
            spans.append((count-at)&0xffffffff);at=None
    port.command('watch off');assert at is None and spans,'no completed publication spans'
    result={'publicationGuardSpans':len(spans),'publicationGuardMaxEmulatorInstructions':max(spans),
        'publicationGuardTotalEmulatorInstructions':sum(spans),'publicationGuardInstructionSpans':spans,
        'guardSavedMasks':sorted(saved_masks),'publicationMaskFromAssembly':port.profile_symbols.get('publicationMaskFromAssembly'),
        'sequencerTicksDuringCommit':ticks}
    if commit:
        assert commit_at is None and len(commit_spans)==1
        result.update(commitEmulatorInstructions=commit_spans[0],commitModelMilliseconds=commit_spans[0]/175959.0)
    return result
