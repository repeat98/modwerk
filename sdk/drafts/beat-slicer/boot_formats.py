"""Observe real stock Flex loads of original PCM formats in private scratch cards.

No device access, firmware injection or card write-back. Repack an existing
disposable stock-created project using the pinned upstream FAT helper, changing
only its original AUDIO/PULSE.wav. Full-load results are paused observations,
not coherent live sample ownership or audible/rate qualification.
"""
import argparse
import ast
import hashlib
import json
import os
from pathlib import Path
import pathlib
import shutil
import struct
import wave

from boot_observe import Port, digest
from inspect_stock import STOCK_MAIN_SHA256

ROOT = Path(__file__).resolve().parent


def card_functions(path):
    # Load only the upstream pure FAT builder/reader; its separate Unicorn
    # bring-up backend is neither imported nor used for these C++ emulator runs.
    names = {'_short_name', '_lfn_checksum', '_lfn_entries', '_dir_entry',
             '_Fat16', '_Fat32', 'build_image', 'extract_image'}
    nodes = [x for x in ast.parse(path.read_text()).body
             if isinstance(x, (ast.FunctionDef, ast.ClassDef)) and x.name in names]
    if {x.name for x in nodes} != names:
        raise RuntimeError('Pinned upstream FAT helper contract differs.')
    namespace = {'os': os, 'pathlib': pathlib, 'struct': struct, 'SECTOR': 512, '_SKIP': {'.DS_Store'}}
    exec(compile(ast.Module(body=nodes, type_ignores=[]), str(path), 'exec'), namespace)
    return namespace['build_image'], namespace['extract_image']


def original_pcm(bits, channels, frames):
    values = []
    for frame in range(frames):
        for channel in range(channels):
            value = (frame * (37 if channel == 0 else 53)) % 10000 - 5000
            if bits == 24:
                value = value * 256 + frame * 17 % 255
            values.append(value)
    return values


def observe(port, bits, channels, values, work):
    def words(address, count):
        return struct.unpack('>' + 'I' * count, port.peek(address, 4 * count))
    controls = port.peek(0x46c922c4, 44)
    c = struct.unpack('>11I', controls)
    settings = port.peek(0x100b14f0, 1096)
    (work / 'controls.private.bin').write_bytes(controls)
    (work / 'settings.private.bin').write_bytes(settings)
    assert words(0x46105408, 1)[0] and c[2] == 0 and c[0] <= 3, 'loaded source not ready'
    output_bits, output_channels = (16 if c[0] & 2 else 24), (2 if c[0] & 1 else 1)
    frames = len(values) // channels
    assert c[4] == frames and output_channels == channels, 'loaded extent/channel count differs'
    width = output_bits // 8 * output_channels
    per_page = 6144 // width
    assert words(0x80003c20 + 16 * c[0], 4)[1:3] == (per_page, width), 'descriptor differs'
    pages_at, offsets_at, used, total = words(0x80006914, 4)
    assert (pages_at, offsets_at) == (0x46c2e9c0, 0x46c2e580), 'non-normal maps'
    assert 0 < used <= total <= 14602
    offset = words(offsets_at, 1)[0]
    owned = int.from_bytes(port.peek(0x46c75e88, 2), 'big')
    assert 0 < owned <= 1024 and owned >= (frames + per_page - 1) // per_page
    assert offset + owned <= used
    pages = struct.unpack('>' + 'H' * owned, port.peek(pages_at + 2 * offset, 2 * owned))
    assert len(set(pages)) == len(pages) and all(page < 14602 for page in pages)
    pcm = bytearray()
    for page in pages:
        count = min(6144, frames * width - len(pcm))
        for at in range(0, count, 4096):
            pcm.extend(port.peek(0x40a955e0 + page * 6144 + at, min(4096, count - at)))
    shift = output_bits - bits
    expected = b''.join((v << shift if shift >= 0 else v >> -shift).to_bytes(output_bits // 8, 'big', signed=True)
                        for v in values)
    (work / 'pcm.private.bin').write_bytes(pcm)
    assert bytes(pcm) == expected, 'decoded pool PCM differs from exact width-converted original'
    assert port.peek(0x46c922c4, 44) == controls and port.peek(0x100b14f0, 1096) == settings
    return {'frames': frames, 'inputBits': bits, 'outputBits': output_bits, 'channels': channels,
            'formatId': c[0], 'ownedPages': owned, 'pcmMatchesWidthConvertedOriginal': True,
            'conversion': 'none' if not shift else 'left shift' if shift > 0 else 'arithmetic truncation',
            'pcmSha256': hashlib.sha256(pcm).hexdigest(),
            'controlsSha256': hashlib.sha256(controls).hexdigest(),
            'settingsSha256': hashlib.sha256(settings).hexdigest()}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ('emulator', 'main', 'card', 'card-tool', 'output'):
        p.add_argument('--' + name, type=Path, required=True)
    p.add_argument('--card-sha256', required=True)
    p.add_argument('--card-tool-sha256', required=True)
    p.add_argument('--case', type=int, action='append', choices=range(8))
    a = p.parse_args()
    if not __debug__:
        p.error('Assertions must remain enabled.')
    out, repo = a.output.resolve(), ROOT.parents[2]
    if out.exists() or out == repo or repo in out.parents:
        p.error('Use a new private output directory outside Git.')
    if digest(a.main) != STOCK_MAIN_SHA256 or digest(a.card) != a.card_sha256 or digest(a.card_tool) != a.card_tool_sha256:
        p.error('Private stock/card/tool identity differs.')
    out.mkdir(parents=True)
    build, extract = card_functions(a.card_tool)
    baseline = extract(a.card.read_bytes(), out / 'baseline')
    wav_path = 'BEATLAB/AUDIO/PULSE.wav'
    if wav_path not in baseline or len(baseline) != 53:
        p.error('Expected the 53-file disposable BEATLAB fixture.')
    results = []
    cases = [(bits, channels, rate) for bits in (16, 24) for channels in (1, 2) for rate in (44100, 48000)]
    for index in a.case if a.case is not None else range(8):
        bits, channels, rate = cases[index]
        work = out / str(index)
        work.mkdir()
        shutil.copytree(out / 'baseline', work / 'tree')
        wav = work / 'tree' / wav_path
        values = original_pcm(bits, channels, 44100)
        raw = b''.join(v.to_bytes(bits // 8, 'little', signed=True) for v in values)
        with wave.open(str(wav), 'wb') as file:
            file.setnchannels(channels); file.setsampwidth(bits // 8); file.setframerate(rate); file.writeframes(raw)
        image = build(work / 'tree', size_mb=32)
        files = extract(image)
        assert files.keys() == baseline.keys()
        assert all(files[name] == value for name, value in baseline.items() if name != wav_path)
        assert files[wav_path] == wav.read_bytes()
        card = work / 'card.private.img'
        card.write_bytes(image)
        card_hash = digest(card)
        command = [str(a.emulator.resolve()), '--image', str(a.main.resolve()), '--card', str(card),
                   '--mount', '--set', 'BEATLAB', '--project', 'PROJECT 261023', '--load-ms', '90000',
                   '--dsp', '--frame', '--ms', '3000', '--interactive', '--main-level', 'off', '--rtc', 'host', '--mkii']
        print(f'Start case {index}: {bits}-bit {channels}-channel {rate} Hz', flush=True)
        port = Port(command, work)
        try:
            port.reply(b'ready ', timeout=600)
            assert port.loaded, 'LOAD PROJECT did not complete'
            result = observe(port, bits, channels, values, work)
        finally:
            port.close()
        assert digest(card) == card_hash and digest(a.card) == a.card_sha256
        result.update({'case': index, 'fileRate': rate, 'wavSha256': digest(wav), 'cardSha256': card_hash,
                       'otherFilesUnchanged': True, 'projectLoadCompleted': True, 'cardUnchanged': True})
        results.append(result)
        (work / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
        print(f'PASS case {index}: format {result["formatId"]}, {result["outputBits"]}-bit pool, full PCM match', flush=True)
    report = {'scope': 'full stock project/file loads and paused Flex format/PCM observations; no installed module or live ownership',
              'sourceSha256': {n: digest(ROOT / n) for n in ('boot_formats.py', 'boot_observe.py', 'inspect_stock.py')},
              'mainSha256': STOCK_MAIN_SHA256, 'emulatorSha256': digest(a.emulator),
              'cardToolSha256': digest(a.card_tool), 'baselineCardSha256': a.card_sha256,
              'results': results, 'exitCode': 0, 'hardware': 'not tested', 'audio': 'not qualified',
              'playbackSampleRate': 'not established; input WAV rate alone is not a native getter',
              'nativeOwnership': 'not implemented; emulator paused during reads'}
    (out / 'formats.json').write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    main()
