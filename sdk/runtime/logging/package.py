#!/usr/bin/env python3
"""Compile original core logger sources. No firmware is read by this command."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
HERE = Path(__file__).resolve().parent
VERSION = '0.3.0'
sha = lambda b: hashlib.sha256(b).hexdigest()
def run(args):
    r = subprocess.run([str(x) for x in args], capture_output=True, text=True)
    if r.returncode: raise RuntimeError(r.stderr[-4000:])
    return r.stdout

def hooks(guards, frame_guard=True):  # the USB base has its own frame guard (machine_registry.c)
    save = 'lea -60(%sp),%sp\nmovem.l %d0-%d7/%a0-%a6,(%sp)\n'
    restore = 'movem.l (%sp),%d0-%d7/%a0-%a6\nlea 60(%sp),%sp\n'
    def replay(key):
        row = guards[key]; n = row.get('patchLength', row['length'])
        return f'.global olog_replay_{key}\nolog_replay_{key}:\n.space {n}\njmp 0x{row["address"]+n:x}\n'
    asm = '.text\n.global olog_idle_hook,olog_job_hook,olog_transport_hook\n'
    asm += 'olog_idle_hook:\n' + save + ('jsr olog_frame_report\n' if frame_guard else '') + 'jsr octamod_log_engine_idle\n' + restore + replay('idle')
    asm += 'olog_job_hook:\n' + save + 'mvz.b (%a2),%d0\nmove.l %d0,-(%sp)\njsr octamod_log_engine_begin\naddq.l #4,%sp\n' + restore + replay('job')
    asm += 'olog_transport_hook:\n' + save + 'move.l 64(%sp),-(%sp)\njsr octamod_log_transport\naddq.l #4,%sp\n' + restore + replay('transport')
    for key in ('open','read','write','close'):
        asm += f'.global olog_stock_{key}\nolog_stock_{key}:\n' + replay(key)
    if not frame_guard:
        return asm
    # The frame guard (frame_guard.c). Entry: stock's register save, then the frame's start time. Exit: the
    # guard's bookkeeping, then stock's restore and rte. Each packer render: stock's argument pushes (and the
    # first call's renderer load), then the renderer in a0, through the guard for a module machine's track.
    def space(key):
        row = guards[key]
        return f'.global olog_replay_{key}\nolog_replay_{key}:\n.space {row.get("replay", row["length"])}\n'
    after = lambda key: guards[key]['address'] + guards[key]['length']
    asm += '.global olog_frame_entry_hook,olog_frame_exit_hook,olog_render_first_hook,olog_render_second_hook\n'
    asm += 'olog_frame_entry_hook:\n' + space('frame_entry') + f'move.l 0xfc07c00c,%d0\nmove.l %d0,olog_frame_t0\njmp 0x{after("frame_entry"):x}\n'
    asm += 'olog_frame_exit_hook:\njsr olog_frame_exit\n' + space('frame_exit')
    for key in ('render_first', 'render_second'):  # d3 holds the track at both sites (the replayed push)
        back = f'jmp 0x{after(key):x}\n'
        asm += f'olog_{key}_hook:\n' + space(key) + 'move.l olog_machine_mask,%d0\nbtst %d3,%d0\nbne.s 1f\njsr (%a0)\n' + back
        asm += f'1:\nmove.l %a0,olog_render_fn\njsr olog_{key}\n' + back
    return asm

def compile_package(output):
    guards = json.loads((HERE/'stock-guards.json').read_text())
    sources = {p.name: sha(p.read_bytes()) for p in sorted(HERE.iterdir()) if p.suffix in ('.c','.h','.py','.json')}
    with tempfile.TemporaryDirectory(prefix='octamod-core-source-') as temp:
        work = Path(temp); objects = []
        for p in sorted(HERE.glob('*.c')):
            obj = work/(p.stem+'.o')
            run(['m68k-elf-gcc','-mcpu=54455','-Os','-std=c99','-ffreestanding','-fno-builtin','-fno-zero-initialized-in-bss','-fno-common','-fno-merge-constants','-fno-asynchronous-unwind-tables','-fno-unwind-tables','-Wall','-Wextra','-Werror','-c',p,'-o',obj])
            objects.append(obj)
        (work/'hooks.s').write_text(hooks(guards))
        run(['m68k-elf-as','-mcpu=54455','-o',work/'hooks.o',work/'hooks.s']); objects.append(work/'hooks.o')
        run(['m68k-elf-ld','-r','-o',work/'core.o',*objects])
        run(['m68k-elf-objcopy','--redefine-sym','memcpy=olog_memcpy','--redefine-sym','memset=olog_memset',work/'core.o'])
        data = (work/'core.o').read_bytes()
        fields = {name:size for name,size in [('build',17),('os',17),('modules',4096),('configuration',65),('source',65),('fx1',1024),('fx2',1024),('hidden',1024)]}
        artifact = dict(schema=1,kind='octamod-core-logger',version=VERSION,stockRead=False,cpu='54455',sources=sources,sourceSha256=sha(json.dumps(sources,sort_keys=True,separators=(',',':')).encode()),guards=guards,fields=fields,bytes=len(data),sha256=sha(data),code=data.hex())
        output.write_text(json.dumps(artifact,indent=2)+'\n')
    print('Compiled original core logger sources; no firmware read.')
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=Path,required=True)
    compile_package(parser.parse_args().output)
