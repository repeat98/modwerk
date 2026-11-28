#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Native checks of returning contracts/board and real generated transport.

Runtime, allocator and DSP ACK facts are modelled. No firmware or DSP runs.
"""
from pathlib import Path
import importlib.util,subprocess,sys,tempfile
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[3]
ADAPTER=ROOT/'sdk/machines/octatrack/module-adapters'
POLICY=ADAPTER/'controller-policy';RUNTIME=ADAPTER/'resident-runtime'
sys.path.insert(0,str(ADAPTER))
import resident_driver,resident_engines
s=importlib.util.spec_from_file_location('returning_core',ROOT/'sdk/machines/octatrack/elekloader/build_core.py')
core=importlib.util.module_from_spec(s);s.loader.exec_module(core)
with tempfile.TemporaryDirectory(prefix='returning-chain-') as tmp:
 w=Path(tmp)
 header=(core.DYNLOAD/'transfer.h').read_text()
 for old,new in core.DSP_EDITS.get('transfer.h',())+core.WIDTH_EDITS.get('transfer.h',()):
  if header.count(old)!=1:raise ValueError('Generated transport header drift')
  header=header.replace(old,new)
 (w/'transfer.h').write_text(resident_driver.transport_header(header))
 text=(core.DYNLOAD/'transfer.c').read_text()
 for old,new in core.DSP_EDITS['transfer.c']+core.WIDTH_EDITS.get('transfer.c',()):
  if text.count(old)!=1:raise ValueError('Generated transport source drift')
  text=text.replace(old,new)
 text=resident_engines.transport(resident_driver.transport(text))
 clock='*(volatile uint32_t *)0xfc07c00cu'
 if text.count(clock)!=1:raise ValueError('Native timer source drift')
 (w/'transfer.c').write_text('#include <stdint.h>\nextern volatile uint32_t test_clock;\n'+text.replace(clock,'test_clock'))
 flags=['clang','-std=c11','-Wall','-Wextra','-Werror','-O1','-fsanitize=undefined','-fno-sanitize-recover=all',
        '-I'+str(w),'-I'+str(POLICY),'-I'+str(RUNTIME),'-I'+str(core.DYNLOAD),
        '-I'+str(ROOT/'sdk/machines/octatrack/elekloader'),'-I'+str(ROOT/'sdk/runtime/loader'),'-I'+str(ROOT/'sdk/runtime/upload')]
 for name in ('contract','board','transport'):
  sources=[w/'transfer.c',HERE/'test_transport.c'] if name=='transport' else [POLICY/'processor_contract.c',HERE/('test_'+name+'.c')]
  exe=w/name;extra=['-DDL_NATIVE_TEST','-DMODWERK_FX_IDS=128','-DMODWERK_DSP_TABLE0=4096','-DMODWERK_DSP_TABLE1=4096','-DMODWERK_DSP_WORDS0=4400','-DMODWERK_DSP_WORDS1=4400'] if name=='transport' else []
  subprocess.run([*flags,*extra,*map(str,sources),'-o',str(exe)],check=True)
  subprocess.run([str(exe)],check=True)
