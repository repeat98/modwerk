#!/usr/bin/env python3
"""Private, read-only MIDI-output command for an already built native emulator."""
import argparse
import hashlib
import json
from pathlib import Path
import shlex
import subprocess

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--native', type=Path, required=True)
p.add_argument('--build', type=Path, required=True)
p.add_argument('--output', type=Path, required=True)
a = p.parse_args()
source = (a.native/'tools/emu/ot_emu/main.cpp').resolve()
build = a.build.resolve()
out = a.output.resolve()
if any((v/'.git').exists() for v in [out, *out.parents]):
    p.error('output must be outside Git')
out.mkdir(parents=True, exist_ok=False)
original = source.read_text()
anchor = '\t\t\tif(cmd == "tx")'
if original.count(anchor) != 1:
    p.error('native interactive command source differs')
addition = '''
            if(cmd == "midi-tx") {
                const auto& bytes = _rtos.serialTx0();
                std::string result = "midi-tx ";
                const char* hex = "0123456789abcdef";
                for(auto byte : bytes) {
                    result += hex[byte >> 4]; result += hex[byte & 15];
                }
                reply(result); continue;
            }
'''
(out/'main.private.cpp').write_text(original.replace(anchor, addition+anchor))
commands = subprocess.check_output(['ninja', '-C', str(build), '-t', 'commands', 'ot_emu'], text=True).splitlines()
compile_line = next(v for v in commands if ' -c ' in v and v.endswith(str(source)))
args = shlex.split(compile_line)
# The original dependency/object outputs must never be written.
for flag in ['-MD', '-MT', '-MF']:
    if flag in args:
        index = args.index(flag)
        del args[index:index+(1 if flag == '-MD' else 2)]
args[args.index('-o')+1] = str(out/'main.o')
args[-1] = str(out/'main.private.cpp')
subprocess.run(args, cwd=build, check=True)
libraries = [build/v for v in ['libot_machine.a', 'mc68k/lib68kEmu.a',
    'dsp56300/dsp56kEmu/libdsp56kEmu.a', 'dsp56300/dsp56kBase/libdsp56kBase.a',
    'dsp56300/asmjit/libasmjit.a']]
subprocess.run([args[0], '-O3', str(out/'main.o'), '-o', str(out/'ot_emu'),
                *map(str, libraries), '-lpthread'], check=True)
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()
(out/'inputs.json').write_text(json.dumps({'sourceSha256': sha(source),
    'monitorSha256': sha(out/'ot_emu'), 'libraries': {str(v): sha(v) for v in libraries},
    'change': 'read-only midi-tx command; firmware execution unchanged'}, indent=2)+'\n')
print(out/'ot_emu')
