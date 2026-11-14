// SPDX-License-Identifier: MIT
// Scalar diagnostic words only. No device access, firmware or raw memory.
export class RenderProbeDecoder {
  #epoch;
  #words = new Map();
  #completed = false;
  push(word) {
    if (!Number.isInteger(word) || word < 0 || word > 0xffffffff) throw new Error('Expected one unsigned DIAG word.');
    const tag = word >>> 28, epoch = word >>> 20 & 255, payload = word & 0xfffff;
    if (epoch !== this.#epoch) { this.#epoch = epoch; this.#words.clear(); this.#completed = false; }
    const previous = this.#words.get(tag);
    if (previous !== undefined && previous !== payload) {
      this.#words.clear(); this.#completed = false;
      throw new Error('Conflicting payloads within one epoch.');
    }
    this.#words.set(tag, payload);
    if (this.#words.size !== 16 || this.#completed) return null;
    const w = Array.from({ length: 16 }, (_, i) => this.#words.get(i));
    if (w.every(value => value === 0)) { this.#completed = true; return null; }
    if (w[0] !== 0x46523 || w[15] !== 0x454e4 || w[13] !== 3) throw new Error('Not the version-3 render probe.');
    if (w[14] !== 1) throw new Error('Incomplete, saturated, overlong or unsupported probe window: flags=' + w[14]);
    if (!w[1] || !w[6] || !w[9] || w[9] > 47891 || w[12] > 2 ||
      w[7] > w[1] + 1 || w[2] > w[1] + 1 || w[4] > w[3] ||
      (w[11] >>> 8 & 31) > (w[11] & 31) || (w[11] & 31) > 16)
      throw new Error('Inconsistent timing/frame counters.');
    this.#completed = true;
    const timerHz = 132000000;
    const framePeriodUs = w[1] * 1024 * 1e6 / timerHz / w[6];
    const expectedFramePeriodUs = 16e6 / 44100;
    return {
      protocol: 3, epoch, windowSeconds: w[1] * 1024 / timerHz,
      clockCheck: {
        nominalTimerHz: timerHz, samplesPerBlock: 16, framePeriodUs, expectedFramePeriodUs,
        relativeError: Math.abs(framePeriodUs / expectedFramePeriodUs - 1),
        limit: 0.05,
        basis: 'Independent frame-count consistency check against nominal 132 MHz timer and 44.1 kHz audio; not an external clock calibration.'
      },
      rendererSharePercent: 100 * w[2] / w[1],
      idlePercent: Math.min(100, 100 * w[7] / w[1]), renderCalls: w[5], frames: w[6],
      ownCallbackBlockPeakTimerTicks: w[3], ownCallbackBlockPeakUs: w[3] * 1e6 / timerHz,
      ownCallbackCallPeakUs: w[4] * 1e6 / timerHz,
      baseFramePeakSinceBootUs: w[8] * 1e6 / timerHz,
      wholeInterruptGuardShareUs: w[9] * 1e6 / timerHz, shedsSinceBoot: w[10],
      peakContext: { track: (w[11] >>> 16 & 7) + 1, start: w[11] >>> 8 & 31, end: w[11] & 31 },
      maxCallsPerBlock: w[12],
      limits: 'Observed callback intervals include the native FLEX call and timer/call overhead; counter bookkeeping after the second timer read is excluded. The base frame peak includes the full wrapper and is since boot. Own peaks are lifetime values. Guard share also pays base/other-track work. Not CPU cycles, a static bound, a window frame benchmark or automatic qualification.'
    };
  }
}

export function requireHardwareClockConsistency(window) {
  if (!Number.isFinite(window.clockCheck?.relativeError) || window.clockCheck.relativeError > 0.05)
    throw new Error('Timer/frame period differs from 16 samples at 44.1 kHz by more than 5%; retain raw evidence, do not use derived times for hardware qualification.');
}
