# SPDX-License-Identifier: MIT
"""Generate a read-only decoder probe from the reviewed local host; no stock bytes."""
from pathlib import Path

def generate(host,output):
    source=Path(host).read_text()
    source=source.replace("#include <", '\n#include "dsp56kEmu/opcodecycles.h"\n#include <',1)
    marker="    // ---- instances --------------------------------------------------------"
    if marker not in source: raise ValueError("Reviewed host shape differs")
    Path(output).write_text(source.replace(marker,'    for(int c=0;c<ncores;c++){\n        Core& C=*cores[c];\n        for(auto span:std::vector<std::pair<TWord,TWord>>{{c==0?0x1282u:0x1042u,340u},{c==0?0x1ab1u:0x1871u,167u}}){\n            for(TWord p=span.first;p<span.first+span.second;){\n                TWord op=C.mem->get(MemArea_P,p);\n                Instruction ia,ib;C.dsp->opcodes().getInstructionTypes(op,ia,ib);\n                unsigned cost=calcCycles(ia,ib,p,op,C.mem->getBridgedMemoryAddress(),0);\n                unsigned len=C.dsp->opcodes().getOpcodeLength(op);\n                std::printf("STATIC_COST %d %x %u %u\\n",c,p,cost,len);\n                p+=len;\n            }\n        }\n    }\n'+"\n"+marker,1))
