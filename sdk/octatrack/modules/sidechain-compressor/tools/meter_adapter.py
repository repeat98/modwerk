"""Generate private reviewed-host copies; count REP/DO instruction-model cycles."""
from pathlib import Path
def generate(vendor,host,output):
    vendor=Path(vendor);output=Path(output);output.mkdir(exist_ok=True)
    source=(vendor/"source/dsp56kEmu/dsp.cpp").read_text()
    source=source.replace('#include "dsp.h"','#include "dsp.h"\n#include "opcodecycles.h"')
    charge="Instruction cycleA{},cycleB{}; opcodes().getInstructionTypes(op,cycleA,cycleB); m_cycles += calcCycles(cycleA,cycleB,pcCurrentInstruction,op,0x100000,0);"
    source=source.replace("void DSP::execOp(const TWord op)\n\t{","void DSP::execOp(const TWord op)\n\t{\n\t\t"+charge)
    source=source.replace("(this->*func)(op);","(this->*func)(op);\n\t\t\t"+charge)
    (output/"meter-dsp.cpp").write_text(source)
    text=Path(host).read_text().replace("getInstructionCounter()","getCycles()")
    seed="C.mem->set(MemArea_X,0x420,(I.alloc-0x255)/2+(I.core==0?4:0));"
    text=text.replace("D.regs().r[7].var = I.state;","D.regs().r[7].var = I.state;\n        "+seed)
    (output/"meter-host.cpp").write_text(text)
