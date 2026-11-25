// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RenderProbeDecoder, requireHardwareClockConsistency } from './probe_decode.mjs';

const payloads = () => [0x46523, 128906, 1000, 10000, 6000, 5512, 2756,
  64453, 30000, 38312, 0, 0x000010, 2, 3, 1, 0x454e4];
const word = (tag, value, epoch = 9) => ((tag << 28) | (epoch << 20) | value) >>> 0;
const feed = (decoder, values = payloads(), epoch = 9) => {
  let result;
  values.forEach((value, tag) => { result = decoder.push(word(tag, value, epoch)) ?? result; });
  return result;
};

test('a complete scalar frame decodes timer units and retains measurement limits', () => {
  const decoder = new RenderProbeDecoder(), value = feed(decoder);
  assert.equal(value.ownCallbackBlockPeakTimerTicks, 10000);
  assert.equal(value.ownCallbackBlockPeakUs, 10000 / 132);
  assert.equal(value.idlePercent, 50);
  assert.deepEqual(value.peakContext, { track: 1, start: 0, end: 16 });
  assert.match(value.limits, /Not CPU cycles/);
  assert.match(value.limits, /since boot/);
  assert.equal(feed(decoder), undefined, 'identical retransmitted tags must not emit another window');
});

test('partial and adjacent/wrapped epochs cannot be combined', () => {
  const decoder = new RenderProbeDecoder(), values = payloads();
  for (let i = 0; i < 8; i++) assert.equal(decoder.push(word(i, values[i], 255)), null);
  for (let i = 8; i < 16; i++) assert.equal(decoder.push(word(i, values[i], 0)), null);
  assert.equal(feed(decoder, values, 0).epoch, 0);
});

test('the initial zero bank is not a measurement, and the first real epoch is accepted', () => {
  const decoder = new RenderProbeDecoder();
  assert.equal(feed(decoder, Array(16).fill(0), 0), undefined);
  assert.equal(feed(decoder, payloads(), 1).epoch, 1);
});

test('a conflicting duplicate is rejected rather than silently mixing snapshots', () => {
  const decoder = new RenderProbeDecoder();
  decoder.push(word(2, 100));
  assert.throws(() => decoder.push(word(2, 101)), /Conflicting/);
});

test('hardware clock consistency refuses doubled emulator cadence and invalid periods', () => {
  const value = feed(new RenderProbeDecoder());
  assert.ok(Math.abs(value.clockCheck.framePeriodUs - 16e6 / 44100) < 1);
  assert.doesNotThrow(() => requireHardwareClockConsistency(value));
  const values = payloads(); values[6] *= 2;
  const emulator = feed(new RenderProbeDecoder(), values);
  assert.throws(() => requireHardwareClockConsistency(emulator), /Timer\/frame period/);
  assert.throws(() => requireHardwareClockConsistency({}), /Timer\/frame period/);
});

test('old protocol, flags, zero time and inconsistent counters are refused', () => {
  for (const [tag, value] of [[0, 0x46521], [13, 2], [14, 3], [14, 5], [14, 9],
    [1, 0], [6, 0], [9, 0], [9, 47892], [12, 3], [11, 0x111],
    [7, 128908], [2, 128908], [4, 10001]]) {
    const values = payloads(); values[tag] = value;
    assert.throws(() => feed(new RenderProbeDecoder(), values), undefined, `tag ${tag}`);
  }
  for (const value of [-1, 0x100000000, 1.5, NaN])
    assert.throws(() => new RenderProbeDecoder().push(value), /unsigned/);
});
