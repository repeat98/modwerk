"""Compile and link the coldFire draft and run the same handlers on the host."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
SDK = next(parent for parent in HERE.parents if (parent / 'runtime/loader/build.py').is_file())
sys.path.insert(0, str(SDK / 'runtime' / 'loader'))
sys.path.insert(0, str(SDK / 'runtime'))
import build
import m68k_codegen

with tempfile.TemporaryDirectory() as tmp:
    work = Path(tmp)
    obj = work / 'clyps.o'
    subprocess.run(['m68k-elf-gcc', *build.CFLAGS, *m68k_codegen.FLAGS,
                    '-c', 'live_module.c', '-o', obj], cwd=HERE, check=True)
    m68k_codegen.check_mcf54455([obj], 'm68k-elf-objdump')
    image, symbols, bss, relocations = build.link_units([obj], 'm68k-elf-', 0, work)
    required = [*build.HANDLERS, 'clyps_wrap', 'clyps_audio_source', 'clyps_bank_load',
                'clyps_bank_loaded', 'clyps_project_init']
    if any(name not in symbols for name in required):
        raise RuntimeError('Missing CLYPS entry point')
    print(f'ColdFire image {len(image)} bytes, BSS {bss}, relocations {len(relocations)}')
    test = work / 'shared_state'
    callbacks = {entry['event']: entry['fn'] for entry in
                 json.loads((HERE / 'contracts/runtime.proposed.json').read_text())['subscribe']}
    defines = [f"-D{macro}={callbacks[event]}" if event in callbacks else f"-D{macro}(...)=((void)0)"
               for macro, event in [('BANK_PRE', 'ev_bank_load'), ('BANK_POST', 'ev_bank_loaded'),
                                    ('PROJECT_INIT', 'ev_project_new'), ('BANKS_PRE', 'ev_banks_load'),
                                    ('BANKS_POST', 'ev_banks_loaded'), ('RELOAD_PRE', 'ev_project_reload'),
                                    ('RELOAD_POST', 'ev_project_reloaded')]]
    subprocess.run(['cc', *defines, '-Wall', '-Wextra', '-Werror', '-I', SDK / 'runtime/loader',
                    HERE / 'tests/shared_state.c', '-o', test], check=True)
    for case in ([], ['popup'], ['bank'], ['failed-bank'], ['popup-bank'], ['late-failure']):
        subprocess.run([test, *case], check=True)
    print('Host callbacks passed for 8 lanes x 16 sources and eight ownership transitions.')
