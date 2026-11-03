"""Observe stock Static-slot load/editor/clear lifecycle on a private fixture.

Normal panel, filesystem, worker and UI only; no direct calls, injected code,
Beat Slicer adapter, device access or card write-back. This does not implement
or qualify a Static PCM reader, file lease, streaming deadline or playback.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import struct
import wave
from boot_observe import Port, digest
from boot_formats import observe
from boot_writer import tap, hits
from inspect_stock import STOCK_MAIN_SHA256

ROOT = Path(__file__).resolve().parent


def matrix_tap(port, row, mask):
    port.command(f'key {row:#x} {mask:#x}'); port.command('run 60')
    port.command(f'key {row:#x} 0'); port.command('run 60')


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ('emulator', 'main', 'card', 'wav', 'output'):
        p.add_argument('--' + name, type=Path, required=True)
    p.add_argument('--card-sha256', required=True)
    a = p.parse_args()
    if not __debug__:
        p.error('Assertions must remain enabled.')
    out, repo = a.output.resolve(), ROOT.parents[2]
    if out.exists() or out == repo or repo in out.parents:
        p.error('Use a fresh private output directory outside Git.')
    if digest(a.main) != STOCK_MAIN_SHA256:
        p.error('Private stock identity differs.')
    if digest(a.card) != a.card_sha256:
        p.error('Private card identity differs.')
    with wave.open(str(a.wav), 'rb') as file:
        if (file.getnchannels(), file.getsampwidth(), file.getframerate(), file.getnframes()) != (2, 2, 44100, 44100):
            p.error('Expected the original one-second stereo 16-bit 44.1 kHz fixture.')
        raw = file.readframes(44100)
    original = list(struct.unpack('<88200h', raw))
    out.mkdir(parents=True)
    card = out / 'card.private.img'; shutil.copyfile(a.card, card)
    command = [str(a.emulator.resolve()), '--image', str(a.main.resolve()), '--card', str(card),
               '--mount', '--set', 'BEATLAB', '--project', 'PROJECT 261023', '--load-ms', '90000',
               '--dsp', '--frame', '--ms', '3000', '--interactive', '--main-level', 'off', '--rtc', 'host', '--mkii',
               '--lcd', str(out / 'lcd.private.bin')]
    port = Port(command, out)
    def controls():
        return struct.unpack('>11I', port.peek(0x46c90a78, 44))
    try:
        port.reply(b'ready ', timeout=600)
        assert port.loaded
        before = out / 'before'; before.mkdir()
        flex = observe(port, 16, 2, original, before)
        assert controls()[4] == 0, 'Static slot is not empty'
        # Quick assign -> machine list -> Static -> empty slot. Entering the
        # other machine's list does not itself assign the track/source.
        tap(port, 'track1'); tap(port, 'track1')
        matrix_tap(port, 0x26, 0x10); tap(port, 'up'); matrix_tap(port, 0x24, 2)
        port.command('watch 0x40093980,0x40099680,0x40099148')
        for _ in range(3): tap(port, 'yes')
        port.command('run 1000')
        trace = hits(port)
        assert [r[1] for r in trace] == [0x40093980, 0x40099680, 0x40099148], 'Static loader/post-load order differs'
        assert all(r[8:10] == [0, 0] for r in trace), 'Unexpected source kind/slot/keep-trim arguments'
        loaded = controls()
        assert loaded[0] == 3 and loaded[2:5] == (0, 0, 44100), 'Static loaded format/status/extent differs'
        assert loaded[9] != 0xffffffff and loaded[10] == 44, 'Static file handle/PCM offset differs'
        tap(port, 'yes'); tap(port, 'no'); tap(port, 'aed'); port.command('run 1000')
        assert port.peek(0x46c8d19c, 8) == bytes(8), 'Editor does not name Static slot 0'
        settings = port.peek(0x100d5b30, 1096)
        s = struct.unpack('>274I', settings)
        assert s[75:78] == (0, 44100, 0) and s[273] == 0 and s[69] == 2880, 'Static trim/markers/tempo differ'
        middle = out / 'loaded'; middle.mkdir()
        flex_loaded = observe(port, 16, 2, original, middle)
        assert flex_loaded == flex, 'Static load changed the Flex source'
        tap(port, 'no'); tap(port, 'track1'); tap(port, 'track1')
        hits(port)  # Drain earlier editor/setup calls before watching release.
        port.command('watch 0x40093814')
        # FUNC+PLAY opens CLEAR SLOT; only YES confirms removing its project
        # assignment. This does not delete the original AUDIO file.
        for mask in (0x20, 0x21, 0x20, 0):
            port.command(f'key 0x25 {mask}'); port.command('run 60')
        assert controls() == loaded, 'Clear prompt mutated the slot before confirmation'
        tap(port, 'yes'); port.command('run 1000')
        trace = hits(port)
        assert len(trace) == 1 and trace[0][1] == 0x40093814 and trace[0][8] == 0, 'Static release was not observed'
        cleared = controls()
        assert cleared[2] == 1 and cleared[4] == 0 and cleared[9] == 0xffffffff, 'Static handle/source not retired'
        assert cleared[5] == loaded[5] + 1, 'Static release counter did not advance'
        assert port.peek(0x100d5f74, 4) == bytes(4), 'Static markers remain after clear'
        after = out / 'after'; after.mkdir()
        flex_after = observe(port, 16, 2, original, after)
        assert flex_after == flex, 'Static clear changed the Flex source'
        port.command('watch off')
    finally:
        port.close()
    assert digest(card) == a.card_sha256 and digest(a.card) == a.card_sha256
    report = {'scope': 'normal stock Static file load, editor binding and confirmed slot clear; no Static PCM reader, Beat Slicer or device',
              'sourceSha256': {n: digest(ROOT / n) for n in ('boot_static.py', 'boot_writer.py', 'boot_formats.py', 'boot_observe.py', 'inspect_stock.py')},
              'mainSha256': STOCK_MAIN_SHA256, 'emulatorSha256': digest(a.emulator),
              'cardSha256': a.card_sha256, 'wavSha256': digest(a.wav), 'exitCode': 0,
              'loadedFrames': loaded[4], 'loadedFormat': loaded[0], 'dataOffset': loaded[10],
              'fileHandlePresentAfterLoad': True, 'editorKindAndSlotVerified': True,
              'staticSettingsSha256': hashlib.sha256(settings).hexdigest(),
              'clearPromptDoesNotRelease': True, 'confirmedClearReleasesHandle': True,
              'releaseCounterAdvances': True, 'flexPcmControlsAndSettingsUnchanged': True,
              'cardUnchanged': True, 'hardware': 'not tested', 'audio': 'not qualified',
              'nativeStaticReader': 'not implemented; no safe concurrent file lease, copied PCM or streaming budget is established'}
    (out / 'static.json').write_text(json.dumps(report, indent=2) + '\n')
    print('PASS: Static load/editor/confirmed-clear lifecycle, retired handle and unchanged Flex source/card')


if __name__ == '__main__':
    main()
