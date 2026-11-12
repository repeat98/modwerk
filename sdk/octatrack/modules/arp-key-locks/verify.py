"""ARP KEY LOCKS gate: the C core's host test, and akl.s as the reviewed GCC compiles akl.c (when it is on PATH)."""
import pathlib
import shutil
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
with tempfile.TemporaryDirectory() as scratch:
    exe = pathlib.Path(scratch) / 'test_akl'
    subprocess.run(['cc', '-std=c99', '-Wall', '-Wextra', '-Werror', '-o', str(exe), str(HERE / 'test_akl.c')], check=True)
    subprocess.run([str(exe)], check=True)
    gcc = shutil.which('m68k-elf-gcc')
    if gcc:
        out = pathlib.Path(scratch) / 'akl.s'
        subprocess.run([gcc, '-mcpu=5475', '-O2', '-ffreestanding', '-fno-builtin', '-fno-common', '-fno-pic',
                        '-fno-late-combine-instructions', '-S', str(HERE / 'akl.c'), '-o', str(out)], check=True)
        if out.read_text() != (HERE / 'akl.s').read_text():
            sys.exit('[FAIL] akl.s is not what m68k-elf-gcc makes of akl.c: regenerate it (README).')
        print('[ok] akl.s matches akl.c')
    else:
        print('[skip] m68k-elf-gcc not on PATH: akl.s not compared')
print('[ok] arp-key-locks')
