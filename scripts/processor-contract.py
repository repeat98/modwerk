# SPDX-License-Identifier: MIT
"""Package-carried returning processor contract, using the real ABI10 encoder.

No controller identity is compiled into Base. Physical state is assigned by
the Base chain builder; the package carries only virtual state references.
"""
HEADER, MAGIC, BRA = 18, 0x4D5754, 0x0D10C0


def container(code, p_relocations, y_relocations, initial, *, stride,
              control=0, reset=1, minimum=0, maximum=128, neutral=64,
              order=0, y_origin=0x100000):
    integer = lambda x: type(x) is int
    if (not code or len(code)>2048 or not initial or len(initial)>1024
            or any(not integer(x) or not 0<=x<=0xFFFFFF for x in code+initial)):
        raise ValueError('Bounded authored code and private initial state required')
    if (any(not integer(x) for x in [stride,control,reset,minimum,maximum,neutral,order,y_origin])
            or not 2<=stride<=len(initial)//4 or not 0<=control<stride
            or not 0<=reset<stride or control==reset
            or not 0<=minimum<=neutral<=maximum<=255 or not 0<=order<=255
            or not 0<=y_origin<=0xFFFFFF-len(initial)):
        raise ValueError('Invalid returning processor state/control layout')
    if any(initial[t*stride+control]!=neutral or initial[t*stride+reset]!=1 for t in range(4)):
        raise ValueError('Every track starts at its declared neutral with reset requested')
    if len(p_relocations)>256 or len(y_relocations)>256:
        raise ValueError('Too many relocation records')
    p_at=[r&0x7FFF for r in p_relocations if integer(r)]
    if (len(p_at)!=len(p_relocations) or p_at!=sorted(set(p_at))
            or any(not 0<=r<=0xFFFF for r in p_relocations)
            or any(i>=len(code) for i in p_at)
            or any(not r&0x8000 and code[r]>=len(code) for r in p_relocations)):
        raise ValueError('Invalid P relocations')
    if (any(not integer(i) for i in y_relocations) or y_relocations!=sorted(set(y_relocations))
            or any(not 0<=i<len(code) or i in p_at
                   or not y_origin<=code[i]<y_origin+len(initial) for i in y_relocations)):
        raise ValueError('Invalid or overlapping private Y relocations')
    words=list(code)
    for r in p_relocations:
        at=r&0x7FFF
        words[at]=(words[at]-HEADER if r&0x8000 else words[at]+HEADER)&0xFFFFFF
    header=[BRA,HEADER,MAGIC,1,len(code),len(initial),stride,control,reset,
            minimum<<16|maximum<<8|neutral,order,y_origin,len(y_relocations),len(initial),
            HEADER,HEADER+len(code),HEADER+len(code)+len(y_relocations),0]
    return (header+words+list(y_relocations)+list(initial),
            [(r&0x8000)|((r&0x7FFF)+HEADER) for r in p_relocations])


def package(abi, controller, code, p_relocations, y_relocations, initial,
            *, cycles, cycle_kind='executed', **layout):
    words,relocations=container(code,p_relocations,y_relocations,initial,**layout)
    return abi.engine(controller,words,relocations,site=0,cores=3,claims=(),
                      requires=16,cycles=cycles,kind=cycle_kind)
