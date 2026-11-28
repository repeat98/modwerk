#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Build the socket-free local USB fixture. No firmware read, no device access."""
import argparse,json,subprocess,hashlib
from pathlib import Path
HERE=Path(__file__).resolve().parent
ap=argparse.ArgumentParser(description=__doc__)
ap.add_argument('--native',type=Path,required=True)
ap.add_argument('--sdk',type=Path,required=True)
ap.add_argument('--adapter',type=Path,required=True)
ap.add_argument('--out',type=Path,required=True)
ap.add_argument('--step-idle',action='store_true',help='execute guest idle instructions instead of fast-forwarding; no guest/guard edits')
ap.add_argument('--resume-idle',action='store_true',help='return borrowed main calls to the recognized live idle loop; no guest edits')
a=ap.parse_args();n=a.native.resolve();s=n/'tools/emu/ot_emu';libs=n/'out/emu';a.out.mkdir(parents=True,exist_ok=False)
rtos=a.adapter.resolve()/'rtos.cpp'
if a.step_idle or a.resume_idle:
 original=rtos.read_text()
if a.step_idle:
 needle='if(_s.idleSkip && atSpin(pc) && !anyPending())'
 if original.count(needle)!=1:raise ValueError('Idle fast-forward seam changed')
 original=original.replace(needle,'if(false && _s.idleSkip && atSpin(pc) && !anyPending())')
if a.resume_idle:
 start=original.index('bool Rtos::callAsMain(');end=original.index('bool Rtos::postMessage(',start)
 part=original[start:end];needle='_d0 = m_machine.getD0();\n\t\t\treturn true;'
 if part.count(needle)!=1:raise ValueError('Borrowed-call return seam changed')
 part=part.replace(needle,'_d0 = m_machine.getD0();\n\t\t\t// Harness caller cleanup; resume only the positively recognized loop.\n\t\t\tm_machine.setA7(m_machine.getA7() + 4u * static_cast<uint32_t>(_args.size()));\n\t\t\tif(m_spinLo) m_machine.setPC(m_spinLo);\n\t\t\treturn true;')
 original=original[:start]+part+original[end:]
if a.step_idle or a.resume_idle:
 rtos=a.out/'rtos-stepped-idle.cpp';rtos.write_text(original)
archives=[libs/p for p in ['libot_machine.a','mc68k/lib68kEmu.a','dsp56300/dsp56kEmu/libdsp56kEmu.a','dsp56300/dsp56kBase/libdsp56kBase.a','dsp56300/asmjit/libasmjit.a']]
subprocess.run(['/usr/bin/c++','-O2','-DNDEBUG','-flto','-arch','arm64','-std=c++17',
 '-I'+str(s),'-I'+str(n/'vendor'),'-I'+str(n/'vendor/dsp56300/source'),
 '-I'+str(a.sdk.resolve()/'scripts/octatrack-emulator'),str(HERE/'usb_pipe.cpp'),
 str(rtos),*map(str,archives),'-lpthread','-o',str(a.out/'usb-pipe')],check=True)
inputs=[HERE/'usb_pipe.cpp',rtos,*archives,a.sdk.resolve()/'scripts/octatrack-emulator/idle-range.h']
(a.out/'inputs.json').write_text(json.dumps({'stepIdle':a.step_idle,'resumeIdle':a.resume_idle,'guestFirmwareChanged':False,'timingIsHardwareMeasurement':False,'sha256':{str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs},'binarySha256':hashlib.sha256((a.out/'usb-pipe').read_bytes()).hexdigest()},indent=2)+'\n')
print(a.out/'usb-pipe')
