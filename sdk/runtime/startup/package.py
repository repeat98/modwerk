#!/usr/bin/env python3
"""Compile the authored beta startup object; never reads firmware."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import base_art

HERE = Path(__file__).resolve().parent
VERSION = '3.0.0-beta.2'
SOURCE_FILES = ('boot_anim.c', 'hooks.s', 'rom_gate.s', 'base_art.py', 'base.json', 'beta-guards.json', 'package.py')
sha = lambda data: hashlib.sha256(data).hexdigest()


def compile_package(output):
    sources = {name: sha((HERE / name).read_bytes()) for name in SOURCE_FILES}
    with tempfile.TemporaryDirectory(prefix='modwerk-beta-startup-') as temp:
        work = Path(temp)
        (work / 'boot_art.h').write_text(base_art.header('3.0.0'))
        subprocess.run(['m68k-elf-gcc', '-mcpu=54455', '-Os', '-std=c99', '-ffreestanding', '-fno-builtin',
                        '-fno-zero-initialized-in-bss', '-fno-common', '-fno-merge-constants',
                        '-fno-asynchronous-unwind-tables', '-fno-unwind-tables', '-Wall', '-Wextra', '-Werror',
                        '-I', str(work), '-c', str(HERE / 'boot_anim.c'), '-o', str(work / 'anim.o')], check=True)
        subprocess.run(['m68k-elf-as', '-mcpu=54455', '-o', str(work / 'hooks.o'), str(HERE / 'hooks.s')], check=True)
        subprocess.run(['m68k-elf-ld', '-r', '-o', str(work / 'startup.o'), str(work / 'anim.o'), str(work / 'hooks.o')], check=True)
        data = (work / 'startup.o').read_bytes()
        subprocess.run(['m68k-elf-as', '-mcpu=54455', '-o', str(work / 'rom.o'), str(HERE / 'rom_gate.s')], check=True)
        rom = (work / 'rom.o').read_bytes()
        artifact = dict(schema=1, kind='modwerk-beta-startup', version=VERSION, stockRead=False, cpu='54455',
                        sources=sources, sourceSha256=sha(json.dumps(sources, sort_keys=True, separators=(',', ':')).encode()),
                        guards=json.loads((HERE / 'beta-guards.json').read_text()),
                        bytes=len(data), sha256=sha(data), code=data.hex(),
                        romGate=dict(bytes=len(rom), sha256=sha(rom), code=rom.hex()))
        output.write_text(json.dumps(artifact, indent=2) + '\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    compile_package(parser.parse_args().output)
