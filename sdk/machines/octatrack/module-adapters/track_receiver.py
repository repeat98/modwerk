# SPDX-License-Identifier: MIT
"""Generic four-track byte controls; fixed ledger addresses, no caller address."""
def source():
    lines=['trackcontrols:', 'move x:(r0+4),a','and #>$ffff,a','cmp #>16,a',
           'beq tcplain','cmp #>$110,a','bne badsaved','tcplain:',
           'move #>hookstate,r1','move p:(r1),a','btst #4,a','bcc badsaved']
    # Validate the complete packet before any private state is changed.
    for i,(word,shift) in enumerate([(5,8),(5,0),(7,8),(7,0)]):
        lines+=['move x:(r0+%d),a'%word,'and #>$ffff,a']
        if shift:lines+=['lsr #8,a']
        lines+=['and #>$ff,a','cmp #>128,a','bgt badsaved']
    for i,(word,shift) in enumerate([(5,8),(5,0),(7,8),(7,0)]):
        lines+=['move x:(r0+%d),a'%word,'and #>$ffff,a']
        if shift:lines+=['lsr #8,a']
        lines+=['and #>$ff,a','move a1,y:>$%x'%(0xd00+32*i)]
    lines+=['move x:(r0+4),a','btst #8,a','bcc accepted','move #>1,x0']
    for i in range(4):lines+=['move x0,y:>$%x'%(0xd00+32*i+31)]
    lines+=['bra accepted']
    lines=[(line.split(' ',1)[0]+' >'+line.split(' ',1)[1]) if line.split(' ',1)[0] in {'beq','bne','bcc','bgt','bra'} else line for line in lines]
    return '\n'.join('        '+line if not line.endswith(':') else line for line in lines)+'\n'

def loader_source(text):
    old='        cmp     #<11,a\n        beq     hookreset'
    if text.count(old)!=1:raise ValueError('Receiver opcode seam drift')
    text=text.replace(old,old+'\n        cmp     #<12,a\n        beq     trackcontrols')
    return text.replace('coldsum:\n',source()+'coldsum:\n',1)
