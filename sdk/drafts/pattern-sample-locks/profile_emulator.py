# SPDX-License-Identifier: MIT
"""Exact-object watch measurements. Emulator instructions are not CPU cycles."""
def start(port):
    symbols=getattr(port,'profile_symbols',None)
    if not symbols:return None
    target=int.from_bytes(port.peek(0x40040ee2,4),'big')
    base=target-symbols['psl_manual_sample']
    begin=base+symbols['begin'];ends={base+n for n in symbols['ends']}
    port.command('watch '+','.join(hex(n) for n in [begin,*sorted(ends)]))
    return begin,ends

def finish(port,token):
    if not token:return {}
    begin,ends=token;at=None;spans=[]
    for hit in port.command('hits',b'hits ').split()[2:]:
        count,pc,*_=map(lambda s:int(s,16),hit.split(':'))
        if pc==begin:
            assert at is None,'nested guard watch';at=count
        elif pc in ends:
            assert at is not None,'missing guard entry'
            spans.append((count-at)&0xffffffff);at=None
    port.command('watch off');assert at is None and spans,'no completed publication spans'
    return {'publicationGuardSpans':len(spans),'publicationGuardMaxEmulatorInstructions':max(spans),
        'publicationGuardTotalEmulatorInstructions':sum(spans),'publicationGuardInstructionSpans':spans}
