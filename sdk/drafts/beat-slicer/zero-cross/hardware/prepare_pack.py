# SPDX-License-Identifier: MIT
"""Generate original, deterministic PCM fixtures outside Git; never contacts a unit."""
import argparse
from bisect import bisect_left, bisect_right
import hashlib
import json
from pathlib import Path
import wave

RATE = 44100
NONE = 0xffffffff
LIMIT = 65536
FORMATS = ((1, 16), (1, 24), (2, 16), (2, 24))


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def anchors(start, end, bpm24, beats=1):
    # Independent integer rational deadlines, including the client's short-tail rule.
    result = []
    n = 0
    while True:
        point = start + (n * RATE * 1440 * beats * 2 + bpm24) // (2 * bpm24)
        if point >= end - 63:
            break
        result.append(point)
        n += 1
        if n > 64:
            raise ValueError('Too many slices for this fixture')
    return result + [end]


def crossing_positions(channel):
    return [i for i, (a, b) in enumerate(zip(channel, channel[1:]))
            if a == 0 or b == 0 or (a < 0) != (b < 0)]


def oracle(pcm, points, selection):
    """Exhaustive decoded-file crossing sets, independent of the C step machine.

    Returns expected candidate behavior, not an observed stock or hardware result.
    Pair index p refers to PCM[p], PCM[p+1]; searches exclude the ideal anchor.
    """
    channels = pcm if len(pcm) == 1 or selection == 'BOTH' else [pcm[selection == 'RIGHT']]
    crossings = sorted(set().union(*(crossing_positions(c) for c in channels)))
    frames = len(pcm[0])
    chosen, reads = [points[0]], 0
    for i, anchor in enumerate(points[1:], 1):
        forward_stop = min(frames - 1, points[i + 1] if i + 1 < len(points) else frames - 1)
        at = bisect_right(crossings, anchor)
        forward = crossings[at] if at < len(crossings) and crossings[at] < forward_stop else None
        forward_reads = max(0, (forward + 1 if forward is not None else forward_stop) - (anchor + 1))
        # A final anchor at the full-sample edge has no complete pair at anchor-1.
        backward = None
        backward_reads = 0
        if anchor - 1 < frames - 1:
            at = bisect_left(crossings, anchor) - 1
            if at >= 0 and crossings[at] > chosen[-1]:
                backward = crossings[at]
            backward_reads = max(0, anchor - (backward if backward is not None else chosen[-1] + 1))
        if reads + forward_reads + backward_reads > LIMIT:
            return {'outcome': 'ANALYSIS_LIMIT', 'pairReads': LIMIT, 'records': None,
                    'oldTableMustRemain': True}
        reads += forward_reads + backward_reads
        if forward is not None and backward is not None:
            selected = forward if forward - anchor < anchor - backward else backward
        else:
            selected = forward if forward is not None else backward if backward is not None else anchor
        chosen.append(selected)
    if any(b - a < min(64, frames) for a, b in zip(chosen, chosen[1:])):
        return {'outcome': 'ANALYSIS_FAILED', 'pairReads': reads, 'records': None,
                'oldTableMustRemain': True}
    return {'outcome': 'APPLIED', 'pairReads': reads, 'points': chosen,
            'records': records(chosen), 'oldTableMustRemain': False}


def records(points):
    return [{'start': a, 'end': b, 'loop': NONE} for a, b in zip(points, points[1:])]


def signal(frames, transitions, zeros=(), inverted=False):
    transitions, zeros = set(transitions), set(zeros)
    sign = -1 if inverted else 1
    result = []
    for i in range(frames):
        result.append(0 if i in zeros else sign * 3072)
        if i in transitions:
            sign = -sign
    return result


def make_pcm(kind, points, frames, channels):
    boundaries = points[1:]
    offsets = {'nearest': (-25, 11), 'exact-zero': (-19, 23),
               'backward-tie': (-12, 12), 'split-stereo': (-17, 9),
               'stereo-tie': (-27, 12), 'antiphase': (-21, 13),
               'distant': (-317, 279), 'trim-tail': (-29, 17),
               'full-edge': (-25, 11), 'fractional-trim': (-15, 8),
               'maximum-64': (-11, 7), 'short-tail': (-18, 10), 'anchor-zero': (-19, 23)}
    if kind == 'drum-loop':
        # Original integer-only percussion: triangle kick, decaying noise snare
        # and short hats. No imported sample, artwork, stock table or random seed.
        pcm = [[0] * frames for _ in range(channels)]
        for channel in range(channels):
            state = 123456789 + channel * 7919
            for beat, start in enumerate(points[:-1]):
                phase = 0
                for i in range(min(11025, frames - start)):
                    state ^= (state << 13) & 0xffffffff
                    state ^= state >> 17
                    state ^= (state << 5) & 0xffffffff
                    phase = (phase + 56 + (11025 - i) // 210) % RATE
                    triangle = (4 * phase if phase < RATE // 2 else 4 * (RATE - phase)) - RATE
                    kick = triangle * (11025 - i) * (11025 - i) * 2600 // (RATE * 11025 * 11025)
                    noise = (state & 65535) - 32768
                    snare = noise * max(0, 4800 - i) * (beat % 2) // (32768 * 3)
                    hat = noise * max(0, 900 - i) // (32768 * 2)
                    pcm[channel][start + i] = kick + snare + hat
        return pcm
    if kind in ('silence', 'bounded-dc', 'limit-cancel'):
        return [[0 if kind == 'silence' else 3072] * frames for _ in range(channels)]
    if kind == 'minimum-refusal':
        transitions = [points[2] - 32, points[2] + 10,
                       points[3] - 10, points[3] + 10, points[4] - 10, points[4] + 10]
        return [signal(frames, transitions) for _ in range(channels)]
    pcm = []
    for channel in range(channels):
        pair = offsets[kind]
        if channel == 1 and kind == 'split-stereo':
            pair = (-5, 23)
        if channel == 1 and kind == 'stereo-tie':
            pair = (-12, 31)
        transitions = [b + delta for b in boundaries for delta in pair if 0 <= b + delta < frames - 1]
        zeros = [b + 7 for b in boundaries if b + 7 < frames] if kind == 'exact-zero' else []
        if kind == 'anchor-zero':
            zeros = [b for b in boundaries if b < frames]
        inverted = (channel == 1 and kind == 'antiphase') or (channel == 0 and kind == 'exact-zero')
        pcm.append(signal(frames, transitions, zeros, inverted))
    return pcm


def write_wav(path, pcm, bits):
    raw = bytearray()
    for frame in zip(*pcm):
        for value in frame:
            # Preserve sub-16-bit nonzero detail in 24-bit files, with identical signs/zeros.
            sample = value if bits == 16 else value * 256 + (37 if value > 0 else -53 if value < 0 else 0)
            raw.extend(sample.to_bytes(bits // 8, 'little', signed=True))
    with wave.open(str(path), 'wb') as wav:
        wav.setparams((len(pcm), bits // 8, RATE, 0, 'NONE', 'not compressed'))
        wav.writeframes(raw)


def read_wav(path):
    with wave.open(str(path), 'rb') as wav:
        channels, width, rate, frames = wav.getnchannels(), wav.getsampwidth(), wav.getframerate(), wav.getnframes()
        raw = wav.readframes(frames)
    values = [int.from_bytes(raw[i:i + width], 'little', signed=True) for i in range(0, len(raw), width)]
    return [values[c::channels] for c in range(channels)], width * 8, rate


def specs():
    kinds = ('nearest', 'exact-zero', 'backward-tie', 'split-stereo', 'stereo-tie',
             'antiphase', 'silence', 'bounded-dc', 'distant', 'trim-tail', 'full-edge',
             'limit-cancel', 'fractional-trim', 'maximum-64', 'short-tail', 'drum-loop',
             'minimum-refusal', 'anchor-zero')
    for number, kind in enumerate(kinds, 1):
        bpm24, start, end, frames, beats = 2880, 0, 88200, 90000, 1
        formats = FORMATS
        if kind in ('split-stereo', 'stereo-tie', 'antiphase'):
            formats = FORMATS[2:]
        if kind == 'bounded-dc':
            bpm24, end, frames = 7200, 35280, 36000
        if kind == 'full-edge':
            frames = end
        if kind == 'limit-cancel':
            end, frames, beats = 352800, 352800, 4
            formats = ((1, 16), (2, 24))
        if kind == 'fractional-trim':
            bpm24, start, end, frames = 2886, 173, 88753, 90000
            formats = ((1, 16), (2, 24))
        if kind == 'maximum-64':
            bpm24, end, frames = 7200, 564480, 566000
            formats = ((1, 16), (2, 24))
        if kind == 'short-tail':
            end, frames = 88231, 90000
            formats = ((1, 16), (2, 24))
        yield number, kind, bpm24, start, end, frames, beats, formats


def generate(output):
    output = Path(output).resolve()
    repo = Path(__file__).resolve().parents[5]
    if output == repo or repo in output.parents or output.exists():
        raise ValueError('Use a fresh output directory outside Git.')
    output.mkdir(parents=True)
    audio = output / 'AUDIO' / 'BS_ZC'
    audio.mkdir(parents=True)
    files = []
    for number, kind, bpm24, start, end, frames, beats, formats in specs():
        points = anchors(start, end, bpm24, beats)
        for channels, bits in formats:
            name = f'{number:02}_{kind}_{"st" if channels == 2 else "mo"}{bits}.wav'
            path = audio / name
            write_wav(path, make_pcm(kind, points, frames, channels), bits)
            decoded, decoded_bits, rate = read_wav(path)
            if (decoded_bits, rate) != (bits, RATE):
                raise ValueError('WAV round-trip failed')
            selections = {s: oracle(decoded, points, s) for s in ('LEFT', 'RIGHT', 'BOTH')}
            equal = all(b - a == points[1] - points[0] for a, b in zip(points, points[1:]))
            files.append({'id': name[:-4], 'file': path.relative_to(output).as_posix(), 'sha256': sha(path),
                          'kind': kind, 'channels': channels, 'bits': bits, 'sampleRate': RATE,
                          'frames': frames, 'durationSeconds': frames / RATE,
                          'bpm24': bpm24, 'beatsPerSlice': beats, 'trimStart': start, 'trimEnd': end,
                          'pointsOff': points, 'recordsOff': records(points), 'snapOn': selections,
                          'stockComparison': 'defensive-outcome-only' if kind in ('bounded-dc', 'limit-cancel', 'minimum-refusal', 'full-edge')
                          else 'equal-grid-valid-cases-only' if equal else 'different-grid-do-not-compare',
                          'audition': kind == 'drum-loop'})
    manifest = {'schema': 1, 'purpose': 'Private original PCM fixtures; hardware not tested',
                'generatorSha256': sha(__file__), 'sampleRate': RATE,
                'coordinateRule': 'All positions are zero-based PCM frames; end exclusive. A crossing pair at p reads p,p+1.',
                'oracleScope': 'Independent decoded-PCM candidate expectation; stock device parity still untested.',
                'formats': ['mono16', 'mono24', 'stereo16', 'stereo24'], 'files': files}
    (output / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    lines = ['# Beat Slicer zero-crossing WAV pack', '',
             'Original generated PCM, 44.1 kHz. Diagnostic signals: keep monitors muted.',
             'Case 16 is an original synthesized drum loop for the later listening pass.',
             'No hardware result is implied by the expected records.', '',
             '| Case | Formats | Purpose |', '|---|---|---|']
    for _, kind, _, _, _, _, _, formats in specs():
        lines.append(f'| {kind} | ' + ', '.join(f'{c}ch/{b}' for c, b in formats) + ' | See manifest expectations |')
    lines += ['', f'{len(files)} WAVs; ' + str(sum((output / x['file']).stat().st_size for x in files)) + ' total audio bytes.',
              '', 'Load the unchanged files normally into the disposable project; do not normalize, resample or save over them.',
              'Each file records trim, BPM × 24, beat spacing and complete OFF/ON records in manifest.json.',
              'Use the identical file through Flex and Static; source identity/format must be verified after loading.',
              'Stock comparisons require equal initial anchors and matching channel selection.',
              'DC, limits and full-edge defensive behavior are not a claim to reproduce invalid stock output.',
              'Recorder races, forced IO errors and persistence need separate device procedures.', '']
    (output / 'README.md').write_text('\n'.join(lines))
    return manifest


def preview(output):
    # Optional plotting dependency; generation and the runner use the standard library only.
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    output = Path(output)
    manifest = json.loads((output / 'manifest.json').read_text())
    kinds = ('nearest', 'exact-zero', 'backward-tie', 'split-stereo', 'stereo-tie', 'antiphase')
    figure, axes = plt.subplots(len(kinds), 1, figsize=(12, 13), constrained_layout=True)
    for ax, kind in zip(axes, kinds):
        entry = next(f for f in manifest['files'] if f['kind'] == kind and f['channels'] == 2 and f['bits'] == 16)
        pcm, _, _ = read_wav(output / entry['file'])
        anchor = entry['pointsOff'][1]
        xs = list(range(-40, 41))
        for channel, (color, label) in enumerate((('#2166ac', 'L'), ('#d6604d', 'R'))):
            center = 0.9 if channel == 0 else -0.9
            ys = [pcm[channel][anchor + x] / 3072 * .45 + center for x in xs]
            ax.step(xs, ys, where='post', color=color, linewidth=1.7, label=label)
            crosses = [p - anchor for p in crossing_positions(pcm[channel]) if -40 <= p - anchor <= 40]
            ax.scatter(crosses, [center] * len(crosses), color=color, marker='x', s=40, zorder=4)
        ax.axvline(0, color='#666666', linestyle='--', linewidth=1)
        outcomes = {s: entry['snapOn'][s]['points'][1] - anchor for s in ('LEFT', 'RIGHT', 'BOTH')}
        ax.set_title(kind.replace('-', ' ').upper() + '     ' + '   '.join(f'{s}: {v:+d}' for s, v in outcomes.items()), loc='left', fontsize=11)
        ax.set_xlim(-40, 40)
        ax.set_ylim(-1.65, 1.65)
        ax.set_yticks([-.9, .9], ['R', 'L'])
        ax.set_xticks(range(-40, 41, 10))
        ax.grid(axis='x', alpha=.2)
        ax.spines[['top', 'right', 'left']].set_visible(False)
    axes[-1].set_xlabel('PCM frame offset from ideal boundary (dashed line); x = crossing pair start')
    figure.suptitle('Beat Slicer 0.1.68 — proposed WAV test pack\nKnown PCM crossings; expected results, hardware not tested', fontsize=16)
    figure.savefig(output / 'crossing-preview.png', dpi=150)
    figure.savefig(output / 'crossing-preview.svg')
    plt.close(figure)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--preview', action='store_true')
    args = parser.parse_args()
    result = generate(args.output)
    if args.preview:
        preview(args.output)
    print(f'Generated {len(result["files"])} original WAVs in {args.output}; no device access.')
