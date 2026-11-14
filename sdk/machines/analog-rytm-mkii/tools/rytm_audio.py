#!/usr/bin/env python3
"""Sound for rytm_test.py: a case's `audio` windows cut from a 12-channel take, and what is measured in one.

The take is the Rytm's USB audio stream, 48 kHz, 12 channels: rytm-emu's `--usb-wav` on the emulator, the
OVERBRIDGE audio device on a unit. rytm_test.py loads this file only for a case with an `audio` step, so
the other cases run without numpy. Needs numpy and soundfile, and sounddevice for a unit.
"""
import math
import time

import numpy as np

from voice_rig import zero_runs

RATE = 48000
CHANNELS = 12
BIN_MS = 0.5            # the envelope: the largest sample of each bin
SILENT_DB = -70.0       # a window that peaks under this has no hit to measure
HIT_GAP_MS = 25.0       # this long under a hit's threshold ends it: half a period at pitch's lowest, 20 Hz
DIP_DB = -30.0          # a dip: inside a hit, the envelope this far under the window's peak
DIP_MS = 1.0            # for this long or longer,
DIP_NEAR_DB = -10.0     # with the envelope this near the peak
DIP_NEAR_MS = 20.0      # within this long before it and after it: a tone that has decayed further crosses
                        # zero as slowly as a dip (below about 32 Hz it does so sooner: not told apart)
GAP_FRAMES = 64         # this many frames of exact zeros on all 12 channels: the unit's stream lost audio


def db(v):
    return 20 * math.log10(max(float(v), 1e-10))


def pitch(x, rate, lowest=20.0):
    """The fundamental in Hz by autocorrelation: its highest peak past its first fall below zero. 0 for
    under 20 ms of sound or a peak under a fifth of the signal's power (noise, a click)."""
    if len(x) < rate * 0.02:
        return 0.0
    x = x - x.mean()
    c = np.correlate(x, x, 'full')[len(x) - 1:]
    under = np.nonzero(c < 0)[0]
    a, b = int(under[0]) if len(under) else 0, min(len(c) - 1, int(rate / lowest))
    if not a or b <= a + 1:
        return 0.0
    k = a + int(np.argmax(c[a:b]))
    if c[k] <= 0.2 * c[0] or k >= b - 1:
        return 0.0
    y0, y1, y2 = c[k - 1], c[k], c[k + 1]                   # the peak between samples, by a parabola
    d = y0 - 2 * y1 + y2
    return float(rate / (k + (max(-1.0, min(1.0, 0.5 * (y0 - y2) / d)) if d else 0.0)))


def runs(env, level):
    """The runs of bins above level, as (first bin, last bin): HIT_GAP_MS under the level ends a run."""
    idx = np.nonzero(env > level)[0]
    cuts = np.nonzero(np.diff(idx) > HIT_GAP_MS / BIN_MS)[0]
    return list(zip(idx[np.concatenate(([0], cuts + 1))].tolist(), idx[np.concatenate((cuts, [len(idx) - 1]))].tolist()))


def measure(x, rate=RATE):
    """A window's measures. Levels in dBFS, times in ms, to the envelope's bin. Of the window: peak, rms,
    hits (runs above 20 dB under the peak), dips (the times the envelope falls 30 dB under the peak for 1 ms
    or more inside a hit, from within 10 dB of the peak and back to it inside 20 ms on each side: a voice
    faded out and struck again while it was loud; a gap of HIT_GAP_MS or more is two hits, not a dip), gapmin
    and gapmax (the shortest and the longest time from one dip's start to the next one's, None for under two
    dips). Of its first hit: onset (the window's start to where the hit's
    run above 30 dB under the peak begins), attack (onset to the hit's largest bin), len20 and len40 (onset
    to the end of the hit's run above 20 and 40 dB under the peak), pitch (Hz by autocorrelation over the
    hit's first 300 ms, 0 when it has none). A window that peaks under SILENT_DB has 0 hits and None for the
    first hit's measures."""
    n = max(1, int(rate * BIN_MS / 1000))
    m = len(x) // n
    env = np.abs(x[:m * n]).reshape(m, n).max(axis=1)
    peak = float(env.max()) if m else 0.0
    rms = math.sqrt(float(np.mean(np.square(x, dtype=np.float64)))) if len(x) else 0.0
    out = {'peak': round(db(peak), 2), 'rms': round(db(rms), 2), 'hits': 0, 'dips': 0, 'gapmin': None, 'gapmax': None,
           'onset': None, 'attack': None, 'len20': None, 'len40': None, 'pitch': None}
    if db(peak) < SILENT_DB:
        return out
    hits = runs(env, peak * 10 ** (-20 / 20))
    first, last20 = hits[0]
    start = next(a for a, b in runs(env, peak * 10 ** (-30 / 20)) if a <= first <= b)
    last40 = next(b for a, b in runs(env, peak * 10 ** (-40 / 20)) if a <= first <= b)
    ms = 1000 * n / rate
    out['hits'] = len(hits)
    low = np.concatenate(([False], env < peak * 10 ** (DIP_DB / 20), [False]))
    edges = np.nonzero(np.diff(low.astype(np.int8)))[0]     # each run under the dip level: [first, past its last)
    near, k = peak * 10 ** (DIP_NEAR_DB / 20), int(DIP_NEAR_MS / ms)
    dips = [a for a, b in zip(edges[::2].tolist(), edges[1::2].tolist())
            if (b - a) * ms >= DIP_MS and any(h0 < a and b - 1 < h1 for h0, h1 in hits)
            and env[max(0, a - k):a].max() >= near and env[b:b + k].max() >= near]
    out['dips'] = len(dips)
    if len(dips) > 1:
        gaps = np.diff(dips) * ms
        out['gapmin'], out['gapmax'] = round(float(gaps.min()), 1), round(float(gaps.max()), 1)
    out['onset'] = round(start * ms, 1)
    out['attack'] = round((first + int(np.argmax(env[first:last20 + 1])) - start) * ms, 1)
    out['len20'] = round((last20 + 1 - start) * ms, 1)
    out['len40'] = round((last40 + 1 - start) * ms, 1)
    out['pitch'] = round(pitch(x[start * n:(last40 + 1) * n][:int(rate * 0.3)], rate), 1)
    return out


def read_take(path):
    import soundfile
    x, rate = soundfile.read(str(path), dtype='float32', always_2d=True)
    if rate != RATE or x.shape[1] < CHANNELS:
        raise ValueError('%s is not a %d-channel take at %d Hz' % (path, CHANNELS, RATE))
    return x


def cut(take, start, ms, channels):
    """A window of the take from the frame start on, its channels mixed to one."""
    end = start + ms * RATE // 1000
    if start < 0 or end > len(take):
        raise ValueError('the take has %d frames and the window runs from %d to %d' % (len(take), start, end))
    return take[start:end][:, list(channels)].mean(axis=1)


def write_wav(path, x):
    import soundfile
    soundfile.write(str(path), x, RATE, subtype='PCM_24')


class Recorder:
    """The unit's 12 USB audio channels, recorded while a case with sound runs. Stream time (now) is the
    clock a window is asked on; a block's first frame has the time the driver says it was converted at.

    Measured on macOS with the Rytm in OVERBRIDGE mode: now and then the driver hands over a block of exact
    zeros in place of audio, and from then on the audio is one block later than its stamps say (a note's
    onset moved by exactly one block, 85.3 ms at 4096 frames, about 20 s into a stream). The unit's stream
    is otherwise never exact zeros (a silent track measured -85 dB), so one block of zeros with sound in
    the frame before it and the frame after it is taken out and counted, for as long as the stream runs,
    and a block's time is its stamp less what was put in before it. Other zeros are time that passed. A
    stream begins with one block of zeros, or with two, and then its audio is one block late from the
    start (14 streams opened one after the other, three notes in each: 11 began with one block and had the
    notes on time, 3 began with two and had every note 85 ms late), so a second block of zeros before the
    stream's first audio is counted as put in too (after that, 4 of 48 streams began with two and had
    their notes on time); three were not seen, and a third is time that passed. With that, a note's
    sound began 3.5 to 9.5 ms after it was sent (12 notes, one case run three times). Blocks of 480
    frames (latency 'low') are no use: there the onsets moved by 80 ms over 44 s without a sign in the
    stream."""

    def __init__(self, want):
        import sounddevice as sd
        found = [i for i, d in enumerate(sd.query_devices())
                 if want.lower() in d['name'].lower() and d['max_input_channels'] >= CHANNELS]
        if not found:
            raise LookupError('no audio device matching %r with %d inputs: put the Rytm in OVERBRIDGE mode '
                              '(SETTINGS > SYSTEM > USB CONFIG). Inputs: %s' % (want, CHANNELS, ', '.join(
                                  '%s (%d)' % (d['name'], d['max_input_channels']) for d in sd.query_devices()
                                  if d['max_input_channels'])))
        self.blocks = []                                    # (time of the first frame, audio was lost, data)
        self.on = False                                     # a case with sound runs: its blocks are kept
        self.lost = False                                   # an overflow since the last kept block
        self.tail = False                                   # the block before ended on a frame with sound
        self.held = None                                    # a block of zeros after one, until the next shows what it is
        self.slipped = 0                                    # frames of zeros the driver has put into the stream
        self.lead = 0                                       # blocks of zeros before the stream's first audio
        self.begun = False                                  # the stream's first audio has come
        self.stream = sd.InputStream(device=found[0], samplerate=RATE, channels=CHANNELS, dtype='float32',
                                     latency='high', callback=self.take)
        self.stream.start()

    def take(self, data, frames, t, status):                # on PortAudio's thread
        stamp = t.inputBufferAdcTime or t.currentTime - frames / RATE
        self.lost |= bool(status.input_overflow)
        if not data.any():
            if not self.begun:
                self.lead += 1
                if self.lead == 2:                          # the stream begins a block late: put in
                    self.slipped += len(data)
                    return
            if self.tail and self.held is None:
                self.held = (stamp, data.copy())
            else:
                self.settle(False)
                self.keep(stamp, data)
            self.tail = False
            return
        self.begun = True
        self.settle(bool(data[0].any()))
        self.keep(stamp, data)
        self.tail = bool(data[-1].any())

    def settle(self, put_in):
        """The held block of zeros was put in by the driver, or it is time that passed."""
        if self.held and put_in:
            self.slipped += len(self.held[1])
        elif self.held:
            self.keep(*self.held)
        self.held = None

    def keep(self, stamp, data):
        if self.on:
            self.blocks.append((stamp - self.slipped / RATE, self.lost, data.copy()))
            self.lost = False

    def now(self):
        return self.stream.time

    def begin(self):
        self.blocks, self.lost, self.on = [], False, True

    def end(self):
        self.on, self.blocks = False, []

    def close(self):
        self.stream.stop()
        self.stream.close()

    def window(self, start, ms, channels):
        """(the window that begins at stream time start, None), or (None, why not)."""
        end = start + ms / 1000
        until = time.time() + ms / 1000 + 3
        while not self.blocks or self.blocks[-1][0] + len(self.blocks[-1][2]) / RATE < end + 0.05:
            if time.time() > until:
                return None, 'the audio stream stopped before the window ended'
            time.sleep(0.02)
        blocks = list(self.blocks)
        if any(lost for _, lost, _ in blocks):
            return None, 'the computer lost audio while the case ran (input overflow): run it again'
        return window_of(blocks, start, ms, channels)


def window_of(blocks, start, ms, channels):
    """The blocks are one unbroken stream, so one frame's time places them all: the median over the blocks of
    each one's own time for frame 0 takes out the jitter in the driver's stamps."""
    counts = np.cumsum([0] + [len(d) for _, _, d in blocks[:-1]])
    zero = float(np.median([t - c / RATE for (t, _, _), c in zip(blocks, counts)]))
    a = int(round((start - zero) * RATE))
    b = a + ms * RATE // 1000
    if a < 0 or b > counts[-1] + len(blocks[-1][2]):
        return None, 'the recording does not cover the window'
    first = int(np.searchsorted(counts, a, 'right')) - 1    # only the blocks the window is in
    last = int(np.searchsorted(counts, b, 'left'))
    take = np.concatenate([d for _, _, d in blocks[first:last]])
    a, b = a - int(counts[first]), b - int(counts[first])
    if zero_runs(np.abs(take[a:b]).max(axis=1), GAP_FRAMES):
        return None, 'the audio stream has a gap in the window (exact zeros on all channels): run it again'
    return take[a:b][:, list(channels)].mean(axis=1), None
