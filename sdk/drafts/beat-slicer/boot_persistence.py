"""Exercise stock slice settings save/revert and project persistence privately.

Writes only a newly copied disposable emulator card, with an explicit opt-in.
No device, injected code, direct firmware calls or custom settings serializer.
Fresh emulator processes are not physical reboot qualification for Beat Slicer.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import struct
import wave

from boot_observe import Port, digest
from boot_formats import card_functions, observe
from boot_writer import tap, hits
from boot_static import matrix_tap
from boot_slices import choose, word
from inspect_stock import STOCK_MAIN_SHA256

ROOT = Path(__file__).resolve().parent
FLEX, STATIC = 0x100b14f0, 0x100d5b30
WAV = 'BEATLAB/AUDIO/PULSE.wav'
OT = 'BEATLAB/AUDIO/PULSE.OT'
PROJECT = 'BEATLAB/PROJECT 261023/'


def settings(port, base=FLEX):
    return port.peek(base, 1096)


def marker_bytes(value):
    return value[300:1096]


def serialized_markers(value):
    return value[300:1080] + value[1092:1096]


def check_reload(before, after):
    # The real project load normalizes this fixture's deleted, inactive row.
    # Its on-card representation must remain exact (checked separately below).
    a, b = struct.unpack('>274I', before), struct.unpack('>274I', after)
    assert a[273] == b[273] and a[69] == b[69], 'Reload changed active count/sample BPM'
    assert before[300:312+12*a[273]] == after[300:312+12*b[273]], 'Reload changed trim/active records'
    assert a[273] <= 3 and a[87] == 0x7fffffff, 'Expected deleted inactive fourth row'
    changed = [i for i in range(75, 274) if a[i] != b[i]]
    assert all((i == 88 and b[i] == a[87]) or (i == 271 and b[i] == 0) for i in changed), 'Unexpected reload metadata change'
    return {'activeMarkersTrimAndTempoExact': True,
            'inactiveMarkerWordsChanged': int(88 in changed),
            'unserializedSettingsWordsChanged': int(271 in changed)}


def flex_editor(port):
    # This stock-created fixture starts with a stale empty-Static editor binding.
    for key in ('aed', 'edit', 'no', 'playback', 'playback', 'yes', 'no'):
        tap(port, key)
    port.command('key 0x26 8'); port.command('run 60'); tap(port, 'track1')
    port.command('key 0x26 0'); port.command('run 60'); tap(port, 'aed')
    assert word(port, 0x46c8d1a0) == 1 and word(port, 0x46c8d19c) == 0, 'Not Flex slot 0'
    matrix_tap(port, 0x24, 8)


def file_row(port, index):
    matrix_tap(port, 0x24, 0x40)  # FX2 / FILE
    for _ in range(6):
        selected = word(port, 0x460e708e)
        assert selected < 6, 'Wrong FILE selection'
        if selected == index:
            break
        tap(port, 'down' if selected < index else 'up')
    assert word(port, 0x460e708e) == index, 'FILE selection did not move'


def clear_slices(port):
    matrix_tap(port, 0x24, 8)
    before = settings(port)
    tap(port, 'yes'); choose(port, 'DELETE ALL SLICES')
    assert settings(port) == before, 'Opening clear prompt mutated settings'
    tap(port, 'yes'); port.command('run 1000')
    after = settings(port)
    assert after[:1092] == before[:1092] and after[1092:] == bytes(4), 'Stock clear changed more than count'
    return after


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ('emulator', 'main', 'card', 'wav', 'card-tool', 'output'):
        p.add_argument('--'+name, type=Path, required=True)
    p.add_argument('--card-sha256', required=True)
    p.add_argument('--card-tool-sha256', required=True)
    p.add_argument('--allow-private-card-writes', action='store_true')
    a = p.parse_args()
    if not __debug__ or not a.allow_private_card_writes:
        p.error('Assertions and explicit --allow-private-card-writes are required.')
    out, repo = a.output.resolve(), ROOT.parents[2]
    if out.exists() or out == repo or repo in out.parents:
        p.error('Use a fresh private output directory outside Git.')
    if digest(a.main) != STOCK_MAIN_SHA256 or digest(a.card) != a.card_sha256 or digest(a.card_tool) != a.card_tool_sha256:
        p.error('Private source/card/tool identity differs.')
    _, extract = card_functions(a.card_tool)
    original_files = extract(a.card.read_bytes())
    if len(original_files) != 53 or original_files.get(WAV) != a.wav.read_bytes() or OT in original_files:
        p.error('Expected original disposable BEATLAB fixture without saved sample settings.')
    with wave.open(str(a.wav), 'rb') as wav:
        if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate(), wav.getnframes()) != (2, 2, 44100, 44100):
            p.error('Expected the original stereo 16-bit one-second fixture.')
        original = list(struct.unpack('<88200h', wav.readframes(44100)))
    out.mkdir(parents=True)
    card = out/'card.private.img'; shutil.copyfile(a.card, card)
    phases = []

    def boot(name, write):
        work = out/name; work.mkdir()
        command = [str(a.emulator.resolve()), '--image', str(a.main.resolve()), '--card', str(card),
                   '--mount', '--set', 'BEATLAB', '--project', 'PROJECT 261023', '--load-ms', '90000',
                   '--dsp', '--frame', '--ms', '3000', '--interactive', '--main-level', 'off', '--rtc', 'host', '--mkii',
                   '--lcd', str(work/'lcd.private.bin')]
        if write:
            command.append('--card-rw')
        port = Port(command, work)
        try:
            port.reply(b'ready ', timeout=600)
            assert port.loaded, 'LOAD PROJECT incomplete'
        except BaseException:
            port.close(); raise
        return port, work

    def pcm(port, work, name):
        folder = work/name; folder.mkdir()
        return observe(port, 16, 2, original, folder)

    def flush(port):
        status = port.command('card flush', b'card ')
        fields = dict(x.split('=', 1) for x in status.split()[2:])
        assert fields.get('rw') == '1' and int(fields['through']) > 0 and fields.get('errors') == '0', 'Private card flush failed'
        return int(fields['through'])

    port, work = boot('save-sample', True)
    try:
        baseline = settings(port)
        assert word(port, FLEX+1092) == 4, 'Expected saved four-slice project'
        pcm(port, work, 'loaded')
        flex_editor(port)
        tap(port, 'yes'); choose(port, 'DELETE SLICE'); tap(port, 'yes'); port.command('run 1000')
        saved = settings(port)
        assert word(port, FLEX+1092) == 3, 'Individual deletion did not leave three slices'
        port.command('watch 0x40076d70,0x40089940,0x40084ec0,0x40084ee4')
        file_row(port, 1); tap(port, 'yes'); port.command('run 5000')
        trace = hits(port)
        assert [r[1] for r in trace] == [0x40076d70, 0x40089940, 0x40084ec0, 0x40084ee4], 'Sample save path differs'
        assert trace[1][9:11] == [1, 0] and trace[2][2] == trace[3][2] == 1, 'Sample settings writer/close failed'
        assert settings(port) == saved, 'Save altered in-memory settings'
        pcm(port, work, 'saved')
        sectors = flush(port)
        phases.append({'phase': 'save-sample', 'markerCount': 3, 'writerAndCloseSucceeded': True,
                       'settingsUnchangedBySave': True, 'sectorsWritten': sectors})
    finally:
        port.close()
    saved_files = extract(card.read_bytes())
    assert set(saved_files) - set(original_files) == {OT} and set(original_files) <= set(saved_files)
    assert len(saved_files[OT]) == 832 and all(saved_files[n] == v for n, v in original_files.items()), 'Sample save changed other files'
    saved_card_hash = digest(card)
    print('PASS: stock sample settings save produced only an 832-byte OT file; WAV/project unchanged', flush=True)

    port, work = boot('revert-and-save-project', True)
    try:
        assert marker_bytes(settings(port)) == marker_bytes(baseline), 'Project did not restore its own saved four-slice layout'
        pcm(port, work, 'loaded')
        flex_editor(port); cleared = clear_slices(port)
        port.command('watch 0x40076ae8,0x40076b74,0x40076bdc')
        file_row(port, 5); tap(port, 'yes')
        assert settings(port) == cleared, 'Revert prompt changed settings'
        tap(port, 'no')
        assert settings(port) == cleared, 'Cancelled revert changed settings'
        tap(port, 'yes'); tap(port, 'yes'); port.command('run 5000')
        trace = hits(port)
        assert [r[1] for r in trace] == [0x40076ae8, 0x40076b74, 0x40076ae8, 0x40076b74, 0x40076bdc], 'Revert path differs'
        assert marker_bytes(settings(port)) == marker_bytes(saved), 'Revert did not restore complete saved sample marker metadata'
        pcm(port, work, 'reverted')
        cleared = clear_slices(port)
        port.command('watch off')
        tap(port, 'no'); tap(port, 'track1'); tap(port, 'track1')
        matrix_tap(port, 0x26, 0x10); tap(port, 'up'); matrix_tap(port, 0x24, 2)
        for _ in range(3): tap(port, 'yes')
        port.command('run 1000')
        tap(port, 'yes'); tap(port, 'no'); tap(port, 'aed'); port.command('run 1000')
        assert word(port, 0x46c8d1a0) == 0 and word(port, 0x46c8d19c) == 0, 'Not Static slot 0'
        static = settings(port, STATIC)
        assert marker_bytes(static) == marker_bytes(saved), 'Fresh Static slot did not load all saved sample marker metadata'
        assert settings(port) == cleared, 'Loading the same file in Static changed Flex settings'
        pcm(port, work, 'static-loaded')
        port.command('watch 0x400232bc,0x40089d84,0x400902c0,0x40090328,0x40022e80,0x40022ee2')
        tap(port, 'no')
        port.command('key 0x25 0x20'); port.command('run 60')
        port.command('key 0x23 0x10'); port.command('run 60')
        port.command('key 0x23 0'); port.command('run 60')
        port.command('key 0x25 0'); port.command('run 60')
        assert settings(port) == cleared and settings(port, STATIC) == static
        tap(port, 'yes'); trace = []
        for _ in range(20):
            port.command('run 1000', timeout=120)
            trace.extend(hits(port))
            if any(r[1] == 0x40022ee2 for r in trace):
                break
        assert [r[1] for r in trace] == [0x400232bc, 0x40089d84, 0x400902c0,
                                       0x40090328, 0x40022e80, 0x40022ee2], 'Project save/completion path differs'
        assert trace[2][2] == trace[3][2] == 1, 'Project marker writer/close failed'
        assert trace[4][8] < 0x80000000, 'Project UI completion reported an error'
        assert settings(port) == cleared and settings(port, STATIC) == static, 'Project save changed current settings'
        sectors = flush(port)
        phases.append({'phase': 'revert-and-save-project', 'projectLayoutRestoredBeforeRevert': True,
                       'cancelledRevertUnchanged': True, 'sampleFileRevertExact': True,
                       'freshStaticSlotLoadsSampleSettings': True, 'sameFileSlotIsolation': True,
                       'savedFlexCount': 0, 'savedStaticCount': 3,
                       'projectMarkerWrites': 1, 'projectUiCompletionSucceeded': True,
                       'sectorsWritten': sectors})
    finally:
        port.close()
    project_files = extract(card.read_bytes())
    assert project_files[OT] == saved_files[OT] and project_files[WAV] == original_files[WAV]
    assert set(project_files) == set(saved_files), 'Project save unexpectedly added/removed files'
    changed = [n for n in saved_files if saved_files[n] != project_files[n]]
    assert changed and all(n.startswith(PROJECT) for n in changed), 'Project save changed files outside disposable project'
    for name in ('markers.work', 'markers.strd'):
        data = project_files[PROJECT+name]
        assert len(data) == 22+264*784+2 and sum(data[16:-2]) & 65535 == int.from_bytes(data[-2:], 'big'), 'Project marker file extent/checksum differs'
        assert data[22:22+784] == serialized_markers(cleared), 'Saved Flex table/trim differs'
        at = 22+136*784
        assert data[at:at+784] == serialized_markers(static), 'Saved Static table/trim differs'
    project_card_hash = digest(card)
    print('PASS: cancel/revert, independent same-file Static load and stock project save', flush=True)

    port, work = boot('reload-project', False)
    try:
        flex_reload, static_reload = settings(port), settings(port, STATIC)
        (work/'flex-reloaded.private.bin').write_bytes(flex_reload)
        (work/'static-reloaded.private.bin').write_bytes(static_reload)
        flex_result, static_result = check_reload(cleared, flex_reload), check_reload(static, static_reload)
        pcm(port, work, 'loaded')
        phases.append({'phase': 'reload-project', 'flexCount': word(port, FLEX+1092),
                       'staticCount': word(port, STATIC+1092), 'serializedCompleteTablesExact': True,
                       'flexReload': flex_result, 'staticReload': static_result})
    finally:
        port.close()
    assert digest(card) == project_card_hash and digest(a.card) == a.card_sha256, 'Input/final read-only card changed'
    names = ('boot_persistence.py', 'boot_slices.py', 'boot_static.py', 'boot_writer.py', 'boot_formats.py', 'boot_observe.py', 'inspect_stock.py')
    report = {'scope': 'normal stock settings save, revert and project reload across three emulator processes; no Beat Slicer native integration/device',
              'sourceSha256': {n: digest(ROOT/n) for n in names},
              'mainSha256': STOCK_MAIN_SHA256, 'emulatorSha256': digest(a.emulator), 'cardToolSha256': digest(a.card_tool),
              'inputCardSha256': a.card_sha256, 'sampleSavedCardSha256': saved_card_hash,
              'projectSavedCardSha256': project_card_hash, 'wavSha256': digest(a.wav),
              'sampleSettingsFileSha256': hashlib.sha256(saved_files[OT]).hexdigest(), 'sampleSettingsFileBytes': 832,
              'changedProjectFileCount': len(changed), 'phases': phases,
              'inputCardUnchanged': True, 'originalWavUnchanged': True, 'exitCode': 0,
              'hardware': 'not tested', 'audio': 'not qualified',
              'limit': 'stock emulator evidence only; no physical reboot, installed module persistence or Static streaming qualification'}
    (out/'persistence.json').write_text(json.dumps(report, indent=2)+'\n')
    print('PASS: exact saved tables, restored active slice layouts and exact Flex PCM across fresh stock loads', flush=True)


if __name__ == '__main__':
    main()
