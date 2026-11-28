# SPDX-License-Identifier: MIT
"""DSP-side scoped controls for the currently placed returning chain.

The caller supplies a member index and four bytes, never a DSP address. The
current chain's Base-authored P metadata supplies each private Y span/layout.
"""


def source():
    lines=['trackchaincontrols:','move x:(r0+4),a','and #>$fef0,a','bne badsaved',
           'move #>hookstate,r1','move p:(r1),a','btst #4,a','bcc badsaved',
           'move #>tpbase,r3','move p:(r3),a','tst a','beq badsaved','move a1,r3','move p:(r3),a',
           'tst a','beq badsaved','move a1,r3','move a1,x1']

    def load(n):
        return (['move p:(r3),a'] if not n else
                [f'lua (r3+{n}),r1','move p:(r1),a'])

    for n,want in [(0,0x0D10C0),(2,0x545043),(3,1)]:
        lines+=load(n)+[f'cmp #>${want:x},a','bne badsaved']
    lines+=load(4)+['cmp #>1,a','blt badsaved','cmp #>16,a','bgt badsaved','move a1,x0',
                   'move x:(r0+4),a','and #>$f,a','cmp x0,a','bge badsaved']
    lines+=load(5)+['cmp #>2048,a','bgt badsaved','move a1,x0']
    # A valid count must cover header + all metadata + every call + RTS.
    lines+=load(4)+['move a1,r1','asl #3,a,a','move r1,x0','add x0,a','add #>7,a','move a1,x0']
    lines+=load(5)+['cmp x0,a','blt badsaved',
                   'move x:(r0+4),a','and #>$f,a','move a1,x0','asl #3,a,a','sub x0,a',
                   'add #>6,a','add x1,a','move a1,r3']
    # The full private state must fit one of the two claimed Y arenas.
    lines+=load(0)+['cmp #>$800,a','blt badsaved','cmp #>$c00,a','blt tclowspan',
                   'cmp #>$cc1,a','blt badsaved','cmp #>$ff0,a','bge badsaved',
                   'move #>$ff0,x1','bra tcspancheck','tclowspan:','move #>$c00,x1',
                   'tcspancheck:','move a1,x0']
    lines+=load(1)+['cmp #>1,a','blt badsaved','cmp #>1024,a','bgt badsaved',
                   'add x0,a','cmp x1,a','bgt badsaved']
    lines+=load(1)+['move a1,x1']
    lines+=load(2)+['cmp #>2,a','blt badsaved','cmp #>256,a','bgt badsaved',
                   'move a1,x0','asl #2,a,a','cmp x1,a','bgt badsaved']
    lines+=load(3)+['tst a','blt badsaved','cmp x0,a','bge badsaved','move a1,x1']
    lines+=load(4)+['tst a','blt badsaved','cmp x0,a','bge badsaved','cmp x1,a','beq badsaved']
    lines+=load(5)+['lsr #16,a','and #>$ff,a','move a1,x1']
    lines+=load(5)+['lsr #8,a','and #>$ff,a','cmp x1,a','blt badsaved','move a1,x0']
    controls=[(5,8),(5,0),(7,8),(7,0)]
    for word,shift in controls:
        lines+=['move x:(r0+%d),a'%word]
        if shift:lines+=['lsr #8,a']
        lines+=['and #>$ff,a','cmp x0,a','bgt badsaved','cmp x1,a','blt badsaved']

    def target(track,field):
        s=load(2)
        if track==0:s+=['clr a']
        elif track==2:s+=['asl #1,a,a']
        elif track==3:s+=['move a1,x0','asl #1,a,a','add x0,a']
        s+=['move a1,x1']+load(0)+['add x1,a','move a1,x1']+load(field)+['add x1,a','move a1,r1']
        return s

    for i,(word,shift) in enumerate(controls):
        lines+=target(i,3)+['move x:(r0+%d),a'%word]
        if shift:lines+=['lsr #8,a']
        lines+=['and #>$ff,a','move a1,y:(r1)']
    lines+=['move x:(r0+4),a','btst #8,a','bcc accepted']
    for i in range(4):lines+=target(i,4)+['move #>1,a','move a1,y:(r1)']
    lines+=['bra accepted','tpbase:','nop']  # zero P data word, patched by Base CAS
    branches={'beq','bne','bcc','bgt','blt','bge','bra'}
    lines=[line.split(' ',1)[0]+' >'+line.split(' ',1)[1] if line.split(' ',1)[0] in branches else line for line in lines]
    return '\n'.join('        '+line if not line.endswith(':') else line for line in lines)+'\n'


def loader_source(text):
    seam='        cmp     #<11,a\n        beq     hookreset'
    if text.count(seam)!=1:raise ValueError('Returning receiver opcode seam drift')
    text=text.replace(seam,seam+'\n        cmp     #<13,a\n        beq     trackchaincontrols')
    if text.count('coldsum:\n')!=1:raise ValueError('Returning receiver insertion seam drift')
    return text.replace('coldsum:\n',source()+'coldsum:\n',1)
