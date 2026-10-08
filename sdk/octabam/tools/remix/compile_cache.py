"""Local memo of compiler outputs; callers still run every validation.

Keys include exact source, options and executable bytes. Sources referring to
other files or environment/time stay cold rather than guessing dependencies.
No test verdict, placement decision, firmware image or hardware report is cached.
OCTABAM_NO_CACHE=1 bypasses both reads and writes. Never upload out/cache.
"""
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[2]
EXTERNAL = re.compile(r'(?im)\b(?:include|incbin|incdir)\b|\bgetenv\s*\(|@(?:date|time)\b')


def _key(kind, source, options, tool):
    if os.environ.get('OCTABAM_NO_CACHE', '').lower() in ('1', 'yes', 'true') or EXTERNAL.search(source):
        return None
    executable = shutil.which(str(tool))
    if executable is None:
        return None
    try:
        binary = pathlib.Path(executable).read_bytes()
        identity = hashlib.sha256(binary).hexdigest()
        # The environment is deliberately included: a tool wrapper may consume
        # variables even when the assembler itself does not. Exclude only the
        # location of this memo and Make's scheduling state.
        env = {k: v for k, v in os.environ.items() if k not in ('OCTABAM_CACHE', 'OCTABAM_NO_CACHE', 'MAKEFLAGS', 'MFLAGS', 'MAKEOVERRIDES', 'REMIX', 'BUILD', 'OT_PROJECT', 'OT_BANK', 'PWD', 'OLDPWD', 'SHLVL', '_')}
        # REMIX/BUILD/OT_* select source in Python, before this function. Never
        # memoise script wrappers: those may read the excluded variables.
        if binary[:2] == b'#!':
            return None
    except OSError:
        return None
    recipe = hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()
    return hashlib.sha256(json.dumps([1, recipe, kind, source, options, identity, env], sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def _read(kind, key):
    if key is None:
        return None
    path = pathlib.Path(os.environ.get('OCTABAM_CACHE') or ROOT / 'out/cache') / kind / key
    try:
        envelope = json.loads(path.read_text())
        payload = envelope['payload']
        encoded = json.dumps(payload, sort_keys=True, separators=(',', ':')).encode()
        if envelope['key'] != key or envelope['sha256'] != hashlib.sha256(encoded).hexdigest():
            return None
        blob = bytes.fromhex(payload['blob'])
        if kind == 'dsp-assembly' and len(blob) % 3:
            return None
        if not all(isinstance(payload[k], str) for k in ('stdout', 'symbols')):
            return None
        return blob, payload['symbols'], payload['stdout']
    except (OSError, ValueError, TypeError, KeyError):
        return None


def _write(kind, key, result):
    if key is None:
        return
    blob, symbols, stdout = result
    payload = dict(blob=blob.hex(), symbols=symbols, stdout=stdout)
    encoded = json.dumps(payload, sort_keys=True, separators=(',', ':')).encode()
    directory = pathlib.Path(os.environ.get('OCTABAM_CACHE') or ROOT / 'out/cache') / kind
    temporary = None
    try:
        directory.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(mode='w', dir=directory, delete=False) as f:
            temporary = pathlib.Path(f.name)
            json.dump(dict(key=key, sha256=hashlib.sha256(encoded).hexdigest(), payload=payload), f)
        temporary.replace(directory / key)
    except OSError:
        pass  # A read-only/unavailable memo must not prevent the real compile.
    finally:
        if temporary is not None:
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                pass


def assemble_dsp(source, org, assembler, work, listing=True):
    """Return untouched assembler bytes, symbol text and listing; no stock fill."""
    key = _key('dsp-assembly', source, [org, listing], assembler)
    result = _read('dsp-assembly', key)
    if result is not None:
        return result
    work = pathlib.Path(work)
    work.mkdir(parents=True, exist_ok=True)
    src, binary, symbols = (work / name for name in ('src.asm', 'out.bin', 'out.sym'))
    src.write_text(source)
    # Do not read artifacts from an earlier, failed invocation.
    binary.unlink(missing_ok=True); symbols.unlink(missing_ok=True)
    command = [str(assembler), '-in', str(src), '-org', f'{org:x}', '-out', str(binary), '-sym', str(symbols)]
    if listing:
        command.append('-list')
    completed = subprocess.run(command, check=True, capture_output=True, text=True)
    result = binary.read_bytes(), symbols.read_text(), completed.stdout
    if len(result[0]) % 3:
        raise ValueError('Assembler output is not a whole number of DSP words')
    _write('dsp-assembly', key, result)
    return result


def assemble_coldfire(source, cpu, output, incdir=None, cwd=None, defsyms=()):
    """Memoise only assembly; every link, symbol resolution and placement reruns."""
    source, output = pathlib.Path(source), pathlib.Path(output)
    base = pathlib.Path(cwd or pathlib.Path.cwd())
    actual_source = source if source.is_absolute() else base / source
    actual_output = output if output.is_absolute() else base / output
    content = actual_source.read_text()
    key = _key('cf-assembly', content, [str(source), str(cpu), str(incdir) if incdir else None, list(defsyms)], 'm68k-elf-as')
    result = _read('cf-assembly', key)
    actual_output.parent.mkdir(parents=True, exist_ok=True)
    if result is None:
        actual_output.unlink(missing_ok=True)
        command = ['m68k-elf-as', f'-mcpu={cpu}'] + (['-I', str(incdir)] if incdir else []) + [x for n, v in defsyms for x in ('--defsym', f'{n}=0x{v:x}')] + ['-o', str(output), str(source)]
        completed = subprocess.run(command, cwd=cwd, check=True, capture_output=True, text=True)
        result = actual_output.read_bytes(), '', completed.stdout
        _write('cf-assembly', key, result)
    else:
        # Independent copies: a later gate cannot mutate the memo or another shard.
        actual_output.write_bytes(result[0])
    return result[2]
