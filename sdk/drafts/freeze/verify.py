"""Freeze's gate: builds the engine's host tests with the address and undefined-behaviour
sanitizers and runs them, then cross-compiles the engine for the ColdFire with Tape Echo's
flags and refuses any runtime-library call. No firmware is involved.

    python3 -B sdk/drafts/freeze/verify.py [--audition out.wav]
"""
import pathlib
import shutil
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
CF_FLAGS = ['-mcpu=54454', '-msoft-float', '-O3', '-ffreestanding', '-fno-builtin', '-fno-common',
            '-fno-jump-tables', '-fno-asynchronous-unwind-tables', '-fno-ident', '-fomit-frame-pointer']


def main() -> int:
    args = sys.argv[1:]
    audition = args[args.index('--audition') + 1] if '--audition' in args else None
    cc = shutil.which('cc') or shutil.which('clang') or shutil.which('gcc')
    if not cc:
        print('[SKIP] no host C compiler')
        return 77
    with tempfile.TemporaryDirectory() as tmp:
        exe = pathlib.Path(tmp) / 'test_freeze'
        subprocess.run([cc, '-std=c99', '-O1', '-g', '-Wall', '-Wextra', '-Werror',
                        '-fsanitize=undefined,address', '-fno-sanitize-recover=all',
                        str(HERE / 'test_freeze.c'), '-lm', '-o', str(exe)], check=True, cwd=HERE)
        run = subprocess.run([str(exe)] + ([audition] if audition else []), cwd=HERE)
        if run.returncode:
            print('[FAIL] host tests')
            return 1
        gcc = shutil.which('m68k-elf-gcc')
        if not gcc:
            print('[SKIP] ColdFire cross-compile: m68k-elf-gcc not installed')
        else:
            obj = pathlib.Path(tmp) / 'freeze.o'
            subprocess.run([gcc, *CF_FLAGS, '-Wall', '-Wextra', '-Werror', '-c', str(HERE / 'freeze.c'),
                            '-o', str(obj)], check=True)
            undefined = subprocess.run(['m68k-elf-nm', '-u', str(obj)], capture_output=True, text=True,
                                       check=True).stdout.split()
            if undefined:
                print('[FAIL] the ColdFire engine needs runtime-library calls:', ' '.join(undefined))
                return 1
            print('[OK] ColdFire 54454 build: no runtime-library calls')
    print('[OK] Freeze host gate')
    return 0


if __name__ == '__main__':
    sys.exit(main())
